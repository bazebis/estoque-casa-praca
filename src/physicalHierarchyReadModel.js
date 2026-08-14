import { normalizeItemLocationLink } from "./itemLocationLinks.js";
import { normalizeLocationCountSession } from "./locationCountSessions.js";
import { normalizeLocationNode } from "./locationNodes.js";

const deterministicFallbackTimestamp = "1970-01-01T00:00:00.000Z";
const openSessionStatuses = new Set(["draft", "in_progress"]);

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeCollection(values, normalizer) {
    if (!Array.isArray(values)) {
        return [];
    }

    return values
        .map((value) => normalizer(value, deterministicFallbackTimestamp))
        .filter(Boolean);
}

function compareNodes(firstNode, secondNode) {
    return firstNode.order - secondNode.order
        || firstNode.name.localeCompare(secondNode.name, "pt-BR")
        || firstNode.id.localeCompare(secondNode.id, "pt-BR");
}

function compareLinks(firstLink, secondLink) {
    return firstLink.order - secondLink.order
        || firstLink.itemNameSnapshot.localeCompare(secondLink.itemNameSnapshot, "pt-BR")
        || firstLink.id.localeCompare(secondLink.id, "pt-BR");
}

function timestampValue(value) {
    const parsedValue = new Date(value).getTime();
    return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function compareOpenSessions(firstSession, secondSession) {
    return timestampValue(secondSession.updatedAt) - timestampValue(firstSession.updatedAt)
        || timestampValue(secondSession.createdAt) - timestampValue(firstSession.createdAt)
        || firstSession.id.localeCompare(secondSession.id, "pt-BR");
}

function countIds(nodes) {
    const counts = new Map();

    nodes.forEach((node) => counts.set(node.id, (counts.get(node.id) || 0) + 1));
    return counts;
}

function evaluateAvailability(nodeId, context, visitingIds = new Set()) {
    if (context.availabilityById.has(nodeId)) {
        return context.availabilityById.get(nodeId);
    }

    const node = context.nodeById.get(nodeId);
    if (!node || context.idCounts.get(nodeId) !== 1) {
        return { available: false, reason: "invalid-node" };
    }

    if (!node.active) {
        return { available: false, reason: "inactive-node" };
    }

    if (!node.parentId) {
        return { available: true, reason: "" };
    }

    if (visitingIds.has(nodeId) || !context.nodeById.has(node.parentId)) {
        return { available: false, reason: "invalid-ancestor-chain" };
    }

    const nextVisitingIds = new Set(visitingIds).add(nodeId);
    const parentAvailability = evaluateAvailability(node.parentId, context, nextVisitingIds);
    return parentAvailability.available
        ? { available: true, reason: "" }
        : { available: false, reason: "unavailable-ancestor" };
}

function buildAvailabilityIndex(nodes, nodeById, idCounts) {
    const context = { nodeById, idCounts, availabilityById: new Map() };

    nodes.forEach((node) => {
        const availability = evaluateAvailability(node.id, context);
        context.availabilityById.set(node.id, availability);
    });

    return context.availabilityById;
}

function groupOperationalChildren(nodes, availabilityById) {
    const childrenByParentId = new Map();

    nodes.filter((node) => availabilityById.get(node.id)?.available).forEach((node) => {
        const parentKey = node.parentId || null;
        const siblings = childrenByParentId.get(parentKey) || [];
        siblings.push(node);
        childrenByParentId.set(parentKey, siblings);
    });

    childrenByParentId.forEach((children) => children.sort(compareNodes));
    return childrenByParentId;
}

function groupDirectLinks(links, templateId, availabilityById) {
    const linksByLocationId = new Map();

    links.filter((link) => (
        link.active
        && link.templateId === templateId
        && availabilityById.get(link.locationId)?.available
    )).forEach((link) => {
        const locationLinks = linksByLocationId.get(link.locationId) || [];
        locationLinks.push(link);
        linksByLocationId.set(link.locationId, locationLinks);
    });

    linksByLocationId.forEach((locationLinks) => locationLinks.sort(compareLinks));
    return linksByLocationId;
}

function groupOpenSessions(sessions, templateId, availabilityById) {
    const sessionsByLocationId = new Map();

    sessions.filter((session) => (
        session.templateId === templateId
        && openSessionStatuses.has(session.status)
        && availabilityById.get(session.locationId)?.available
    )).forEach((session) => {
        const locationSessions = sessionsByLocationId.get(session.locationId) || [];
        locationSessions.push(session);
        sessionsByLocationId.set(session.locationId, locationSessions);
    });

    sessionsByLocationId.forEach((locationSessions) => locationSessions.sort(compareOpenSessions));
    return sessionsByLocationId;
}

function resolveOperationalState(directChildren, directLinks, openSession) {
    if (openSession) {
        return "open-session";
    }

    return directChildren.length > 0 || directLinks.length > 0 ? "ready" : "empty";
}

function buildDerivedNode(node, path, depth, context) {
    const currentPath = [...path, { id: node.id, name: node.name }];
    const childNodes = context.childrenByParentId.get(node.id) || [];
    const directChildren = childNodes.map((childNode) => (
        buildDerivedNode(childNode, currentPath, depth + 1, context)
    ));
    const directLinks = context.linksByLocationId.get(node.id) || [];
    const openSession = context.sessionsByLocationId.get(node.id)?.[0] || null;

    return {
        id: node.id,
        name: node.name,
        type: node.type,
        parentId: node.parentId,
        reportArea: node.reportArea,
        order: node.order,
        path: currentPath,
        depth,
        directChildren,
        directLinks,
        directLinkCount: directLinks.length,
        subtreeLinkCount: directLinks.length
            + directChildren.reduce((total, child) => total + child.subtreeLinkCount, 0),
        descendantCount: directChildren.reduce((total, child) => total + child.descendantCount + 1, 0),
        hasChildren: directChildren.length > 0,
        hasDirectItems: directLinks.length > 0,
        openSession,
        operationalState: resolveOperationalState(directChildren, directLinks, openSession)
    };
}

function buildUnavailableNodes(nodes, availabilityById) {
    return nodes.filter((node) => !availabilityById.get(node.id)?.available).sort(compareNodes).map((node) => ({
        id: node.id,
        name: node.name,
        parentId: node.parentId,
        operationalState: "unavailable",
        unavailableReason: availabilityById.get(node.id)?.reason || "invalid-node"
    }));
}

export function buildOperationalHierarchy({ nodes = [], links = [], sessions = [], templateId = "" } = {}) {
    const normalizedTemplateId = normalizeText(templateId);
    const normalizedNodes = normalizeCollection(nodes, normalizeLocationNode).filter((node) => node.id);
    const normalizedLinks = normalizeCollection(links, normalizeItemLocationLink).filter((link) => link.id);
    const normalizedSessions = normalizeCollection(sessions, normalizeLocationCountSession).filter((session) => session.id);
    const idCounts = countIds(normalizedNodes);
    const nodeById = new Map(normalizedNodes.map((node) => [node.id, node]));
    const availabilityById = buildAvailabilityIndex(normalizedNodes, nodeById, idCounts);
    const childrenByParentId = groupOperationalChildren(normalizedNodes, availabilityById);
    const linksByLocationId = groupDirectLinks(normalizedLinks, normalizedTemplateId, availabilityById);
    const sessionsByLocationId = groupOpenSessions(normalizedSessions, normalizedTemplateId, availabilityById);
    const context = { childrenByParentId, linksByLocationId, sessionsByLocationId };
    const roots = (childrenByParentId.get(null) || []).map((node) => buildDerivedNode(node, [], 0, context));

    return {
        templateId: normalizedTemplateId,
        roots,
        unavailableNodes: buildUnavailableNodes(normalizedNodes, availabilityById)
    };
}

function findOperationalNode(nodes, nodeId) {
    for (const node of nodes) {
        if (node.id === nodeId) {
            return node;
        }

        const descendant = findOperationalNode(node.directChildren, nodeId);
        if (descendant) {
            return descendant;
        }
    }

    return null;
}

export function getOperationalRoots(hierarchy) {
    return Array.isArray(hierarchy?.roots) ? hierarchy.roots : [];
}

export function getOperationalNode(hierarchy, nodeId) {
    return findOperationalNode(getOperationalRoots(hierarchy), normalizeText(nodeId));
}

export function getOperationalChildren(hierarchy, nodeId) {
    return getOperationalNode(hierarchy, nodeId)?.directChildren || [];
}
