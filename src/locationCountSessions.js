import { findTemplateItem, normalizeItemLocationLinks } from "./itemLocationLinks.js";
import { getLocationPath, normalizeLocationNodes } from "./locationNodes.js";

export const LOCATION_COUNT_SESSION_STATUSES = ["draft", "in_progress", "completed", "canceled"];

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeArea(value) {
    return normalizeText(value).toLocaleUpperCase("pt-BR") || null;
}

function normalizePath(value) {
    return Array.isArray(value) ? value.map(normalizeText).filter(Boolean) : [];
}

function normalizeTimestamp(value, fallback = null) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function normalizePlannedItem(item) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
    }

    const numericOrder = Number(item.order);

    return {
        itemCode: normalizeText(item.itemCode),
        itemNameSnapshot: normalizeText(item.itemNameSnapshot),
        groupId: normalizeText(item.groupId),
        groupNameSnapshot: normalizeText(item.groupNameSnapshot),
        linkId: normalizeText(item.linkId),
        locationId: normalizeText(item.locationId),
        locationPathSnapshot: normalizePath(item.locationPathSnapshot),
        reportArea: normalizeArea(item.reportArea),
        order: Number.isFinite(numericOrder) ? numericOrder : 0,
        active: item.active !== false
    };
}

export function normalizePlannedItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items.map(normalizePlannedItem).filter(Boolean);
}

export function normalizeLocationCountSession(session, timestamp = new Date().toISOString()) {
    if (!session || typeof session !== "object" || Array.isArray(session)) {
        return null;
    }

    const plannedItems = normalizePlannedItems(session.plannedItems);
    const createdAt = normalizeTimestamp(session.createdAt, timestamp);
    const plannedItemCount = Number(session.plannedItemCount);
    const activeLinkCountSnapshot = Number(session.activeLinkCountSnapshot);

    return {
        id: normalizeText(session.id),
        templateId: normalizeText(session.templateId),
        templateNameSnapshot: normalizeText(session.templateNameSnapshot),
        locationId: normalizeText(session.locationId),
        locationPathSnapshot: normalizePath(session.locationPathSnapshot),
        reportAreaSnapshot: normalizeArea(session.reportAreaSnapshot),
        status: normalizeText(session.status),
        plannedItems,
        plannedItemCount: Number.isFinite(plannedItemCount) ? plannedItemCount : plannedItems.length,
        activeLinkCountSnapshot: Number.isFinite(activeLinkCountSnapshot)
            ? activeLinkCountSnapshot
            : plannedItems.length,
        createdAt,
        updatedAt: normalizeTimestamp(session.updatedAt, createdAt),
        startedAt: normalizeTimestamp(session.startedAt),
        finishedAt: normalizeTimestamp(session.finishedAt),
        canceledAt: normalizeTimestamp(session.canceledAt),
        notes: normalizeText(session.notes)
    };
}

export function normalizeLocationCountSessions(sessions) {
    if (!Array.isArray(sessions)) {
        return [];
    }

    return sessions.map((session) => normalizeLocationCountSession(session)).filter((session) => session?.id);
}

function comparePlannedItems(firstItem, secondItem) {
    return firstItem.order - secondItem.order
        || firstItem.itemNameSnapshot.localeCompare(secondItem.itemNameSnapshot, "pt-BR");
}

export function buildPlannedItemsForLocation(template, location, links, locations = []) {
    if (!template || !location) {
        return [];
    }

    const locationPath = getLocationPath(location.id, locations).map((node) => node.name);
    const safePath = locationPath.length > 0 ? locationPath : [location.name].filter(Boolean);

    return normalizeItemLocationLinks(links).filter((link) => (
        link.active
        && link.templateId === template.id
        && link.locationId === location.id
        && findTemplateItem(template, link.itemCode)
    )).map((link) => ({
        itemCode: link.itemCode,
        itemNameSnapshot: link.itemNameSnapshot,
        groupId: link.groupId,
        groupNameSnapshot: link.groupNameSnapshot,
        linkId: link.id,
        locationId: location.id,
        locationPathSnapshot: safePath,
        reportArea: location.reportArea || null,
        order: link.order,
        active: true
    })).sort(comparePlannedItems);
}

export function getLocationCountSessionPreparation(template, location, links, locations = []) {
    const matchingLinks = normalizeItemLocationLinks(links).filter((link) => (
        link.templateId === template?.id && link.locationId === location?.id
    ));
    const plannedItems = buildPlannedItemsForLocation(template, location, matchingLinks, locations);
    const warnings = [];
    const errors = [];

    if (!template) errors.push("Selecione um template de contagem.");
    if (!location) errors.push("Selecione um local físico.");
    if (location && !location.active) errors.push("O local selecionado está inativo.");
    if (template && location && plannedItems.length === 0) errors.push("O local não possui itens vinculados ativos.");
    if (location && !location.reportArea) warnings.push("O local não possui área de relatório.");
    const inactiveLinkCount = matchingLinks.filter((link) => !link.active).length;
    if (inactiveLinkCount > 0) warnings.push(`${inactiveLinkCount} vínculo(s) inativo(s) será(ão) ignorado(s).`);
    if (matchingLinks.some((link) => link.active && !findTemplateItem(template, link.itemCode))) {
        warnings.push("Vínculos com item ausente no template serão ignorados.");
    }

    return {
        canCreate: errors.length === 0,
        errors,
        warnings,
        plannedItems,
        inactiveLinkCount
    };
}

export function collectPlannedItemErrors(items, sessionLocationId) {
    const errors = [];
    const linkIds = new Set();

    items.forEach((item, index) => {
        const label = `Item planejado ${index + 1}`;
        if (!item.itemCode || !item.itemNameSnapshot) errors.push(`${label} precisa de código e nome.`);
        if (!item.groupId || !item.groupNameSnapshot) errors.push(`${label} precisa do grupo.`);
        if (!item.linkId || !item.locationId) errors.push(`${label} precisa do vínculo e do local.`);
        if (item.locationId && item.locationId !== sessionLocationId) errors.push(`${label} aponta para outro local.`);
        if (item.locationPathSnapshot.length === 0) errors.push(`${label} precisa do caminho do local.`);
        if (!Number.isFinite(item.order)) errors.push(`${label} precisa de uma ordem numérica.`);
        if (!item.active) errors.push(`${label} precisa representar um vínculo ativo.`);
        if (item.linkId && linkIds.has(item.linkId)) errors.push(`${label} repete um vínculo já planejado.`);
        linkIds.add(item.linkId);
    });

    return errors;
}

function collectSessionErrors(candidate, templates, locations) {
    const errors = [];
    const templateExists = templates.some((template) => template.id === candidate?.templateId);
    const locationExists = normalizeLocationNodes(locations).some((location) => location.id === candidate?.locationId);

    if (!candidate?.id) errors.push("A sessão precisa ter um identificador.");
    if (!templateExists) errors.push("O template da sessão não existe neste dispositivo.");
    if (!candidate?.templateNameSnapshot) errors.push("A sessão precisa do nome do template.");
    if (!locationExists) errors.push("O local da sessão não existe neste dispositivo.");
    if (candidate?.locationPathSnapshot.length === 0) errors.push("A sessão precisa do caminho do local.");
    if (!LOCATION_COUNT_SESSION_STATUSES.includes(candidate?.status)) errors.push("O status da sessão é inválido.");

    return errors;
}

function collectCountAndDateErrors(candidate) {
    const errors = [];
    const plannedItemCount = candidate?.plannedItems.length || 0;

    if (plannedItemCount === 0) errors.push("A sessão precisa ter ao menos um item planejado.");
    if (!Number.isInteger(candidate?.plannedItemCount) || candidate.plannedItemCount !== plannedItemCount) {
        errors.push("A quantidade de itens planejados não corresponde à lista da sessão.");
    }
    if (!Number.isInteger(candidate?.activeLinkCountSnapshot)
        || candidate.activeLinkCountSnapshot !== plannedItemCount) {
        errors.push("A quantidade de vínculos ativos não corresponde aos snapshots.");
    }
    if (candidate?.status !== "completed" && candidate?.finishedAt) {
        errors.push("Somente uma sessão finalizada pode ter data de término.");
    }
    if (candidate?.status === "completed" && !candidate.finishedAt) {
        errors.push("Uma sessão finalizada precisa da data de término.");
    }
    if (candidate?.status === "draft" && candidate.startedAt) errors.push("Um rascunho não pode ter data de início.");
    if (candidate?.status === "in_progress" && !candidate.startedAt) {
        errors.push("Uma sessão em andamento precisa da data de início.");
    }
    if (candidate?.status === "in_progress" && candidate.canceledAt) {
        errors.push("Uma sessão em andamento não pode ter data de cancelamento.");
    }
    if (candidate?.status === "draft" && candidate.canceledAt) errors.push("Um rascunho não pode ter data de cancelamento.");
    if (candidate?.status === "canceled" && !candidate.canceledAt) errors.push("Uma sessão cancelada precisa da data de cancelamento.");
    if (candidate?.status === "completed" && candidate.canceledAt) {
        errors.push("Uma sessão finalizada não pode ter data de cancelamento.");
    }

    return errors;
}

export function validateLocationCountSession(session, templates = [], locations = [], links = []) {
    const candidate = normalizeLocationCountSession(session);
    const errors = [
        ...collectSessionErrors(candidate, templates, locations),
        ...collectCountAndDateErrors(candidate),
        ...collectPlannedItemErrors(candidate?.plannedItems || [], candidate?.locationId)
    ];

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        session: errors.length === 0 ? candidate : null,
        currentLinkCount: normalizeItemLocationLinks(links).filter((link) => (
            link.active && link.templateId === candidate?.templateId && link.locationId === candidate?.locationId
        )).length
    };
}

function createSessionId() {
    if (globalThis.crypto?.randomUUID) {
        return `location_count_${globalThis.crypto.randomUUID()}`;
    }

    return `location_count_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createLocationCountSessionDraftFromPlanModel({
    templateId,
    templateNameSnapshot,
    locationId,
    locationPathSnapshot,
    reportAreaSnapshot = null,
    plannedItems = [],
    notes = "",
    id = createSessionId(),
    timestamp = new Date().toISOString()
} = {}) {
    const candidate = normalizeLocationCountSession({
        id,
        templateId,
        templateNameSnapshot,
        locationId,
        locationPathSnapshot,
        reportAreaSnapshot,
        status: "draft",
        plannedItems,
        plannedItemCount: plannedItems.length,
        activeLinkCountSnapshot: plannedItems.length,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: null,
        finishedAt: null,
        canceledAt: null,
        notes
    }, timestamp);
    const errors = [
        ...collectSessionErrors(candidate, [{ id: candidate?.templateId }], [{
            id: candidate?.locationId,
            name: candidate?.locationPathSnapshot.at(-1),
            type: "custom",
            parentId: null,
            order: 0,
            active: true
        }]),
        ...collectCountAndDateErrors(candidate),
        ...collectPlannedItemErrors(candidate?.plannedItems || [], candidate?.locationId)
    ];

    if (errors.length > 0) throw new Error(errors[0]);
    return candidate;
}

export function createLocationCountSessionDraftModel({ template, location, links, locations, notes = "" }) {
    const preparation = getLocationCountSessionPreparation(template, location, links, locations);

    if (!preparation.canCreate) {
        throw new Error(preparation.errors[0]);
    }

    const path = getLocationPath(location.id, locations).map((node) => node.name);

    return createLocationCountSessionDraftFromPlanModel({
        templateId: template.id,
        templateNameSnapshot: template.name,
        locationId: location.id,
        locationPathSnapshot: path.length > 0 ? path : [location.name],
        reportAreaSnapshot: location.reportArea || null,
        plannedItems: preparation.plannedItems,
        notes
    });
}

export function summarizeLocationCountSessions(sessions) {
    const normalizedSessions = normalizeLocationCountSessions(sessions);
    const totalsByStatus = Object.fromEntries(LOCATION_COUNT_SESSION_STATUSES.map((status) => [status, 0]));

    normalizedSessions.forEach((session) => {
        if (Object.hasOwn(totalsByStatus, session.status)) totalsByStatus[session.status] += 1;
    });

    return {
        total: normalizedSessions.length,
        totalsByStatus,
        plannedItemCount: normalizedSessions.reduce((total, session) => total + session.plannedItemCount, 0),
        locationCount: new Set(normalizedSessions.map((session) => session.locationId)).size,
        templateCount: new Set(normalizedSessions.map((session) => session.templateId)).size
    };
}
