import { normalizeCountTemplate } from "./countTemplates.js";
import {
    buildPlannedItemsForLocation,
    collectPlannedItemErrors,
    normalizeLocationCountSessions,
    normalizePlannedItems
} from "./locationCountSessions.js";
import { normalizeLocationNodes } from "./locationNodes.js";
import { buildOperationalHierarchy, getOperationalRoots } from "./physicalHierarchyReadModel.js";

export const COUNT_ROUND_STATUSES = ["active", "completed"];

export class CountRoundError extends Error {
    constructor(message, code = "invalid-count-round") {
        super(message);
        this.name = "CountRoundError";
        this.code = code;
    }
}

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
    const parsedTimestamp = new Date(value);
    return value && !Number.isNaN(parsedTimestamp.getTime())
        ? parsedTimestamp.toISOString()
        : fallback;
}

function cloneCompletion(completion) {
    if (!completion || typeof completion !== "object" || Array.isArray(completion)) {
        return null;
    }

    return { ...completion };
}

function normalizeRoundLocation(location) {
    if (!location || typeof location !== "object" || Array.isArray(location)) {
        return null;
    }

    const presentationOrder = Number(location.presentationOrder);
    const sessionId = normalizeText(location.sessionId);

    return {
        locationId: normalizeText(location.locationId),
        locationPathSnapshot: normalizePath(location.locationPathSnapshot),
        reportAreaSnapshot: normalizeArea(location.reportAreaSnapshot),
        presentationOrder: Number.isInteger(presentationOrder) ? presentationOrder : -1,
        plannedItems: normalizePlannedItems(location.plannedItems),
        sessionId: sessionId || null
    };
}

function compareRoundLocations(firstLocation, secondLocation) {
    return firstLocation.presentationOrder - secondLocation.presentationOrder
        || firstLocation.locationPathSnapshot.join(" / ").localeCompare(
            secondLocation.locationPathSnapshot.join(" / "),
            "pt-BR"
        )
        || firstLocation.locationId.localeCompare(secondLocation.locationId, "pt-BR");
}

export function normalizeCountRound(round, timestamp = new Date().toISOString()) {
    if (!round || typeof round !== "object" || Array.isArray(round)) {
        return null;
    }

    const createdAt = normalizeTimestamp(round.createdAt, timestamp);
    const status = normalizeText(round.status);
    const candidate = {
        id: normalizeText(round.id),
        templateId: normalizeText(round.templateId),
        templateNameSnapshot: normalizeText(round.templateNameSnapshot),
        status,
        locations: (Array.isArray(round.locations) ? round.locations : [])
            .map(normalizeRoundLocation)
            .filter(Boolean)
            .sort(compareRoundLocations),
        createdAt,
        updatedAt: normalizeTimestamp(round.updatedAt, createdAt),
        finishedAt: normalizeTimestamp(round.finishedAt),
        completion: cloneCompletion(round.completion)
    };

    if (status === "active") {
        candidate.activeTemplateId = normalizeText(round.activeTemplateId);
    }

    return candidate;
}

export function normalizeCountRounds(rounds) {
    if (!Array.isArray(rounds)) {
        return [];
    }

    return rounds.map((round) => normalizeCountRound(round)).filter((round) => round?.id);
}

function collectRoundIdentityErrors(candidate, sourceRound) {
    const errors = [];

    if (!candidate?.id) errors.push("A rodada precisa ter um identificador.");
    if (!candidate?.templateId) errors.push("A rodada precisa identificar o template.");
    if (!candidate?.templateNameSnapshot) errors.push("A rodada precisa preservar o nome do template.");
    if (!COUNT_ROUND_STATUSES.includes(candidate?.status)) errors.push("O status da rodada é inválido.");
    if (candidate?.status === "active" && candidate.activeTemplateId !== candidate.templateId) {
        errors.push("Uma rodada ativa precisa reservar o próprio template.");
    }
    if (candidate?.status === "completed" && Object.hasOwn(sourceRound || {}, "activeTemplateId")) {
        errors.push("Uma rodada concluída não pode manter activeTemplateId.");
    }
    if (candidate?.status === "active" && (candidate.finishedAt || candidate.completion)) {
        errors.push("Uma rodada ativa não pode possuir fechamento.");
    }
    if (candidate?.status === "completed" && !candidate.finishedAt) {
        errors.push("Uma rodada concluída precisa da data de término.");
    }

    return errors;
}

function collectRoundLocationErrors(location, sourceLocation, locationIds, presentationOrders) {
    const errors = [];

    if (!location.locationId) errors.push("Um local da rodada precisa de identificador.");
    if (locationIds.has(location.locationId)) errors.push("A rodada repete um local físico.");
    if (location.locationPathSnapshot.length === 0) errors.push("O local precisa preservar seu caminho.");
    if (location.presentationOrder < 0) errors.push("A ordem de apresentação do local é inválida.");
    if (presentationOrders.has(location.presentationOrder)) errors.push("A ordem de apresentação precisa ser única.");
    if (location.plannedItems.length === 0) errors.push("Todo local da rodada precisa de itens planejados.");
    if (Object.hasOwn(sourceLocation || {}, "skippedAt")) errors.push("A rodada não possui estado de pulo.");
    errors.push(...collectPlannedItemErrors(location.plannedItems, location.locationId));
    location.plannedItems.forEach((item) => {
        if (item.locationPathSnapshot.join("|") !== location.locationPathSnapshot.join("|")) {
            errors.push("O caminho de um item planejado diverge do local da rodada.");
        }
        if (item.reportArea !== location.reportAreaSnapshot) {
            errors.push("A área de um item planejado diverge do local da rodada.");
        }
    });

    locationIds.add(location.locationId);
    presentationOrders.add(location.presentationOrder);
    return errors;
}

function collectRoundLocationsErrors(candidate, sourceRound) {
    const errors = [];
    const locationIds = new Set();
    const presentationOrders = new Set();
    const sourceLocations = Array.isArray(sourceRound?.locations) ? sourceRound.locations : [];

    if (!candidate || candidate.locations.length === 0) {
        errors.push("A rodada precisa possuir ao menos um local contável.");
        return errors;
    }

    candidate.locations.forEach((location) => {
        const sourceLocation = sourceLocations.find((item) => (
            normalizeText(item?.locationId) === location.locationId
        ));
        errors.push(...collectRoundLocationErrors(location, sourceLocation, locationIds, presentationOrders));
    });
    const sortedOrders = [...presentationOrders].sort((firstOrder, secondOrder) => firstOrder - secondOrder);
    if (sortedOrders.some((order, index) => order !== index)) {
        errors.push("A ordem de apresentação da rodada precisa ser contínua.");
    }

    return errors;
}

export function validateCountRound(round) {
    const candidate = normalizeCountRound(round);
    const errors = [
        ...collectRoundIdentityErrors(candidate, round),
        ...collectRoundLocationsErrors(candidate, round)
    ];

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        round: errors.length === 0 ? candidate : null
    };
}

function collectCollectionErrors(rounds) {
    const errors = [];
    const roundIds = new Set();
    const activeTemplateIds = new Set();

    rounds.forEach((round) => {
        if (roundIds.has(round.id)) errors.push("Existem rodadas repetidas no armazenamento.");
        roundIds.add(round.id);
        if (round.status !== "active") return;
        if (activeTemplateIds.has(round.templateId)) {
            errors.push(`Existem múltiplas rodadas ativas para o template ${round.templateId}.`);
        }
        activeTemplateIds.add(round.templateId);
    });

    return errors;
}

export function validateCountRoundCollection(rounds) {
    const sourceRounds = Array.isArray(rounds) ? rounds : [];
    const validations = sourceRounds.map(validateCountRound);
    const normalizedRounds = validations.map((validation) => validation.round).filter(Boolean);
    const errors = [
        ...validations.flatMap((validation) => validation.errors),
        ...collectCollectionErrors(normalizedRounds)
    ];

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        rounds: errors.length === 0 ? normalizedRounds : []
    };
}

export function assertValidCountRoundCollection(rounds) {
    const validation = validateCountRoundCollection(rounds);
    if (!validation.isValid) {
        throw new CountRoundError(validation.error, "invalid-count-round-collection");
    }
    return validation.rounds;
}

function appendCountableLocations(nodes, context, scope) {
    nodes.forEach((node) => {
        if (node.directLinks.length > 0) {
            const location = context.locationById.get(node.id);
            const plannedItems = buildPlannedItemsForLocation(
                context.template,
                location,
                context.links,
                context.locations
            );

            if (plannedItems.length !== node.directLinks.length) {
                throw new CountRoundError(
                    `Os vínculos do local ${node.name} não formam um plano de contagem válido.`,
                    "invalid-location-plan"
                );
            }

            scope.push({
                locationId: node.id,
                locationPathSnapshot: node.path.map((pathPart) => pathPart.name),
                reportAreaSnapshot: node.reportArea || null,
                presentationOrder: scope.length,
                plannedItems,
                sessionId: null
            });
        }

        appendCountableLocations(node.directChildren, context, scope);
    });
}

export function buildCountRoundScope({ template, nodes = [], links = [] } = {}) {
    const normalizedTemplate = normalizeCountTemplate(template);
    if (!normalizedTemplate) throw new CountRoundError("O template da rodada é inválido.", "invalid-template");

    const locations = normalizeLocationNodes(nodes);
    const hierarchy = buildOperationalHierarchy({
        nodes: locations,
        links,
        sessions: [],
        templateId: normalizedTemplate.id
    });
    const context = {
        template: normalizedTemplate,
        locations,
        links,
        locationById: new Map(locations.map((location) => [location.id, location]))
    };
    const scope = [];

    appendCountableLocations(getOperationalRoots(hierarchy), context, scope);
    return scope.map(normalizeRoundLocation);
}

function createCountRoundId() {
    if (globalThis.crypto?.randomUUID) return `count_round_${globalThis.crypto.randomUUID()}`;
    return `count_round_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function assertRoundCanStart(templateId, rounds, sessions) {
    const normalizedRounds = assertValidCountRoundCollection(rounds);
    if (normalizedRounds.some((round) => round.status === "active" && round.templateId === templateId)) {
        throw new CountRoundError("Já existe uma rodada ativa para este template.", "active-round-exists");
    }

    const hasOpenLegacySession = normalizeLocationCountSessions(sessions).some((session) => (
        session.templateId === templateId && ["draft", "in_progress"].includes(session.status)
    ));
    if (hasOpenLegacySession) {
        throw new CountRoundError(
            "Existem sessões abertas anteriores. Resolva-as antes de iniciar uma rodada.",
            "open-legacy-session"
        );
    }
}

export function createCountRoundModel({
    template,
    nodes = [],
    links = [],
    sessions = [],
    rounds = [],
    id = createCountRoundId(),
    timestamp = new Date().toISOString()
} = {}) {
    const normalizedTemplate = normalizeCountTemplate(template);
    if (!normalizedTemplate) throw new CountRoundError("O template da rodada é inválido.", "invalid-template");
    assertRoundCanStart(normalizedTemplate.id, rounds, sessions);

    const candidate = {
        id,
        templateId: normalizedTemplate.id,
        templateNameSnapshot: normalizedTemplate.name,
        status: "active",
        activeTemplateId: normalizedTemplate.id,
        locations: buildCountRoundScope({ template: normalizedTemplate, nodes, links }),
        createdAt: timestamp,
        updatedAt: timestamp,
        finishedAt: null,
        completion: null
    };
    const validation = validateCountRound(candidate);
    if (!validation.isValid) throw new CountRoundError(validation.error);
    return validation.round;
}
