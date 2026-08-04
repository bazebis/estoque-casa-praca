export const LOCATION_NODE_TYPES = ["room", "equipment", "shelf", "section", "custom"];

export const KNOWN_REPORT_AREAS = [
    "BAR",
    "ESTOQUE",
    "COZINHA",
    "SALÃO",
    "EMPORIO",
    "GELADEIRA LATICÍNIOS"
];

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeParentId(parentId) {
    const normalizedParentId = normalizeText(parentId);
    return normalizedParentId || null;
}

function normalizeTimestamp(value, fallback) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

export function normalizeLocationNode(node, timestamp = new Date().toISOString()) {
    if (!node || typeof node !== "object" || Array.isArray(node)) {
        return null;
    }

    const createdAt = normalizeTimestamp(node.createdAt, timestamp);
    const numericOrder = Number(node.order);

    return {
        id: normalizeText(node.id),
        name: normalizeText(node.name),
        type: normalizeText(node.type),
        parentId: normalizeParentId(node.parentId),
        reportArea: normalizeText(node.reportArea).toLocaleUpperCase("pt-BR") || null,
        order: Number.isFinite(numericOrder) ? numericOrder : 0,
        active: node.active !== false,
        createdAt,
        updatedAt: normalizeTimestamp(node.updatedAt, createdAt)
    };
}

export function normalizeLocationNodes(nodes) {
    if (!Array.isArray(nodes)) {
        return [];
    }

    return nodes.map((node) => normalizeLocationNode(node)).filter((node) => node?.id);
}

function hasDuplicateSiblingName(candidate, existingNodes) {
    const comparableName = candidate.name.toLocaleLowerCase("pt-BR");

    return existingNodes.some((node) => (
        node.id !== candidate.id
        && node.parentId === candidate.parentId
        && node.name.toLocaleLowerCase("pt-BR") === comparableName
    ));
}

function createsCycle(candidate, existingNodes) {
    const nodeById = new Map(existingNodes.map((node) => [node.id, node]));
    nodeById.set(candidate.id, candidate);
    const visitedIds = new Set();
    let currentId = candidate.parentId;

    while (currentId) {
        if (currentId === candidate.id || visitedIds.has(currentId)) {
            return true;
        }

        visitedIds.add(currentId);
        currentId = nodeById.get(currentId)?.parentId || null;
    }

    return false;
}

function hasValidOrder(node) {
    return Object.prototype.hasOwnProperty.call(node || {}, "order")
        && node.order !== null
        && node.order !== ""
        && Number.isFinite(Number(node.order));
}

function collectLocationNodeErrors(candidate, existingNodes, sourceNode) {
    const errors = [];

    if (!candidate?.id) {
        errors.push("O local precisa ter um identificador.");
    }

    if (!candidate?.name) {
        errors.push("Informe o nome do local.");
    }

    if (!LOCATION_NODE_TYPES.includes(candidate?.type)) {
        errors.push("Selecione um tipo de local válido.");
    }

    if (!hasValidOrder(sourceNode)) {
        errors.push("A ordem do local precisa ser numérica.");
    }

    if (sourceNode?.reportArea != null && typeof sourceNode.reportArea !== "string") {
        errors.push("A área de relatório precisa ser um texto.");
    }

    if (candidate?.parentId && !existingNodes.some((node) => node.id === candidate.parentId)) {
        errors.push("O local pai não existe.");
    }

    if (candidate?.id && createsCycle(candidate, existingNodes)) {
        errors.push("Essa relação criaria um ciclo na árvore de locais.");
    }

    if (candidate?.name && hasDuplicateSiblingName(candidate, existingNodes)) {
        errors.push("Já existe um local com esse nome no mesmo nível.");
    }

    return errors;
}

export function validateLocationNode(node, existingNodes = []) {
    const candidate = normalizeLocationNode(node);
    const normalizedExistingNodes = normalizeLocationNodes(existingNodes);
    const errors = collectLocationNodeErrors(candidate, normalizedExistingNodes, node);

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        node: errors.length === 0 ? candidate : null
    };
}

function compareLocationNodes(firstNode, secondNode) {
    const orderDifference = firstNode.order - secondNode.order;
    return orderDifference || firstNode.name.localeCompare(secondNode.name, "pt-BR");
}

function hasSafeParent(node, nodeById) {
    const visitedIds = new Set([node.id]);
    let currentId = node.parentId;

    while (currentId) {
        if (visitedIds.has(currentId) || !nodeById.has(currentId)) {
            return false;
        }

        visitedIds.add(currentId);
        currentId = nodeById.get(currentId).parentId;
    }

    return Boolean(node.parentId);
}

export function buildLocationTree(nodes) {
    const normalizedNodes = normalizeLocationNodes(nodes);
    const nodeById = new Map(normalizedNodes.map((node) => [node.id, { ...node, children: [] }]));
    const roots = [];

    nodeById.forEach((node) => {
        if (!hasSafeParent(node, nodeById)) {
            roots.push(node);
            return;
        }

        nodeById.get(node.parentId).children.push(node);
    });

    nodeById.forEach((node) => node.children.sort(compareLocationNodes));
    return roots.sort(compareLocationNodes);
}

export function flattenLocationTree(tree) {
    const flattenedNodes = [];

    function appendNodes(nodes, depth) {
        nodes.forEach((node) => {
            flattenedNodes.push({ ...node, depth });
            appendNodes(node.children || [], depth + 1);
        });
    }

    appendNodes(Array.isArray(tree) ? tree : [], 0);
    return flattenedNodes;
}

export function getLocationPath(id, nodes) {
    const nodeById = new Map(normalizeLocationNodes(nodes).map((node) => [node.id, node]));
    const path = [];
    const visitedIds = new Set();
    let currentNode = nodeById.get(normalizeText(id));

    while (currentNode && !visitedIds.has(currentNode.id)) {
        path.unshift(currentNode);
        visitedIds.add(currentNode.id);
        currentNode = currentNode.parentId ? nodeById.get(currentNode.parentId) : null;
    }

    return path;
}

export function summarizeLocationNodes(nodes) {
    const normalizedNodes = normalizeLocationNodes(nodes);
    const totalsByType = Object.fromEntries(LOCATION_NODE_TYPES.map((type) => [type, 0]));
    const reportAreas = new Set();

    normalizedNodes.forEach((node) => {
        if (Object.hasOwn(totalsByType, node.type)) {
            totalsByType[node.type] += 1;
        }

        if (node.reportArea) {
            reportAreas.add(node.reportArea);
        }
    });

    return {
        total: normalizedNodes.length,
        rootCount: normalizedNodes.filter((node) => node.parentId === null).length,
        totalsByType,
        reportAreas: [...reportAreas].sort((firstArea, secondArea) => firstArea.localeCompare(secondArea, "pt-BR"))
    };
}
