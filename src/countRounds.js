import { normalizeCountTemplate } from "./countTemplates.js";
import {
    buildPlannedItemsForLocation,
    collectPlannedItemErrors,
    createLocationCountSessionDraftFromPlanModel,
    normalizeLocationCountSession,
    normalizeLocationCountSessions,
    normalizePlannedItems
} from "./locationCountSessions.js";
import {
    normalizeLocationCountEntries,
    validateLocationCountEntry
} from "./locationCountEntries.js";
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

function normalizeCompletion(completion) {
    if (!completion || typeof completion !== "object" || Array.isArray(completion)) {
        return null;
    }

    const numericFields = [
        "totalLocations",
        "totalPlannedOccurrences",
        "coveredBeforeFinalization",
        "explicitZeroEntryCount",
        "materializedSessionCount",
        "finalizedSessionCount"
    ];
    return {
        snapshotId: normalizeText(completion.snapshotId),
        ...Object.fromEntries(numericFields.map((field) => [field, Number(completion[field])])),
        snapshotStatus: normalizeText(completion.snapshotStatus),
        finalizedWithWarnings: completion.finalizedWithWarnings === true
    };
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
        completion: normalizeCompletion(round.completion)
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
    if (candidate?.status === "completed" && !candidate.completion) {
        errors.push("Uma rodada concluída precisa preservar o resultado do fechamento.");
    }

    return errors;
}

function collectRoundCompletionErrors(candidate) {
    if (candidate?.status !== "completed" || !candidate.completion) return [];

    const completion = candidate.completion;
    const totalLocations = candidate.locations.length;
    const totalOccurrences = candidate.locations.reduce((total, location) => (
        total + location.plannedItems.length
    ), 0);
    const countFields = [
        "totalLocations", "totalPlannedOccurrences", "coveredBeforeFinalization",
        "explicitZeroEntryCount", "materializedSessionCount", "finalizedSessionCount"
    ];
    const errors = [];

    if (!completion.snapshotId) errors.push("O fechamento da rodada precisa apontar para um snapshot.");
    if (countFields.some((field) => !Number.isInteger(completion[field]) || completion[field] < 0)) {
        errors.push("Os contadores do fechamento da rodada são inválidos.");
    }
    if (completion.totalLocations !== totalLocations) errors.push("O total de locais do fechamento diverge do plano.");
    if (completion.totalPlannedOccurrences !== totalOccurrences) {
        errors.push("O total de ocorrências do fechamento diverge do plano.");
    }
    if (completion.explicitZeroEntryCount !== totalOccurrences - completion.coveredBeforeFinalization) {
        errors.push("A quantidade de zeros explícitos diverge da cobertura anterior.");
    }
    if (completion.materializedSessionCount > totalLocations) errors.push("Há sessions materializadas em excesso.");
    if (completion.finalizedSessionCount !== totalLocations) errors.push("Todas as sessions precisam ser finalizadas.");
    if (!["complete", "partial"].includes(completion.snapshotStatus)) {
        errors.push("O status do snapshot final da rodada é inválido.");
    }
    if (completion.finalizedWithWarnings !== (completion.snapshotStatus !== "complete")) {
        errors.push("O indicador de avisos diverge do status do snapshot.");
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
    const sessionIds = new Set();
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
        if (location.sessionId && sessionIds.has(location.sessionId)) {
            errors.push("Uma sessão não pode estar vinculada a mais de um local da rodada.");
        }
        if (location.sessionId) sessionIds.add(location.sessionId);
    });
    const sortedOrders = [...presentationOrders].sort((firstOrder, secondOrder) => firstOrder - secondOrder);
    if (sortedOrders.some((order, index) => order !== index)) {
        errors.push("A ordem de apresentação da rodada precisa ser contínua.");
    }

    return errors;
}

function arePlannedItemsEqual(firstItems, secondItems) {
    return JSON.stringify(normalizePlannedItems(firstItems)) === JSON.stringify(normalizePlannedItems(secondItems));
}

function createFrozenRoundSignature(round) {
    return JSON.stringify({
        id: round.id,
        templateId: round.templateId,
        templateNameSnapshot: round.templateNameSnapshot,
        status: round.status,
        activeTemplateId: round.activeTemplateId,
        createdAt: round.createdAt,
        locations: round.locations.map(({ sessionId, ...location }) => location)
    });
}

function indexSessionsFailClosed(sessions, sourceLabel) {
    const normalizedSessions = normalizeLocationCountSessions(sessions);
    const sessionsById = new Map();
    normalizedSessions.forEach((session) => {
        if (sessionsById.has(session.id)) {
            throw new CountRoundError(`Existem sessões repetidas no ${sourceLabel}.`, "duplicate-session-record");
        }
        sessionsById.set(session.id, session);
    });
    return sessionsById;
}

function indexEntriesFailClosed(entries, sourceLabel) {
    const normalizedEntries = normalizeLocationCountEntries(entries);
    const entriesById = new Map();
    normalizedEntries.forEach((entry) => {
        if (entriesById.has(entry.id)) {
            throw new CountRoundError(`Existem entradas repetidas no ${sourceLabel}.`, "duplicate-entry-record");
        }
        entriesById.set(entry.id, entry);
    });
    return entriesById;
}

function createSessionIdentitySignature(session) {
    const { status, updatedAt, startedAt, ...identity } = session;
    return JSON.stringify(identity);
}

function reconcileOpenSessionCopies(localSession, storedSession) {
    if (!localSession) return storedSession;
    if (!storedSession) return localSession;
    if (createSessionIdentitySignature(localSession) !== createSessionIdentitySignature(storedSession)) {
        throw new CountRoundError(
            "A sessão local conflita com o registro de mesmo ID no IndexedDB.",
            "fallback-session-conflict"
        );
    }
    if (localSession.status === storedSession.status) {
        if (localSession.startedAt !== storedSession.startedAt) {
            throw new CountRoundError("A sessão possui inícios incompatíveis.", "fallback-session-conflict");
        }
        return storedSession;
    }
    if (storedSession.status === "draft" && localSession.status === "in_progress") return localSession;
    if (storedSession.status === "in_progress" && localSession.status === "draft") return storedSession;
    throw new CountRoundError("A sessão possui estados incompatíveis.", "fallback-session-conflict");
}

function assertSessionMatchesRoundLocation(session, round, location) {
    const normalizedSession = normalizeLocationCountSession(session);
    const hasValidLifecycle = normalizedSession?.status === "draft"
        ? !normalizedSession.startedAt
        : Boolean(normalizedSession?.startedAt);
    const matches = normalizedSession
        && normalizedSession.id === location.sessionId
        && normalizedSession.templateId === round.templateId
        && normalizedSession.templateNameSnapshot === round.templateNameSnapshot
        && normalizedSession.locationId === location.locationId
        && normalizedSession.locationPathSnapshot.join("|") === location.locationPathSnapshot.join("|")
        && normalizedSession.reportAreaSnapshot === location.reportAreaSnapshot
        && ["draft", "in_progress"].includes(normalizedSession.status)
        && hasValidLifecycle
        && !normalizedSession.finishedAt
        && !normalizedSession.canceledAt
        && normalizedSession.plannedItemCount === location.plannedItems.length
        && normalizedSession.activeLinkCountSnapshot === location.plannedItems.length
        && arePlannedItemsEqual(normalizedSession.plannedItems, location.plannedItems);

    if (!matches) {
        throw new CountRoundError(
            "A sessão vinculada não corresponde ao plano congelado deste local.",
            "invalid-round-session-relation"
        );
    }
    return normalizedSession;
}

export function buildCountRoundLocationSessionMutation({ round, locationId, existingSession = null } = {}) {
    const normalizedRound = assertValidCountRoundCollection([round])[0];
    const normalizedLocationId = normalizeText(locationId);
    if (normalizedRound.status !== "active") {
        throw new CountRoundError("Esta rodada não está mais ativa.", "round-not-active");
    }

    const location = normalizedRound.locations.find((item) => item.locationId === normalizedLocationId);
    if (!location) {
        throw new CountRoundError("Este local não pertence ao plano congelado da rodada.", "location-outside-round");
    }
    if (location.sessionId) {
        return {
            round: normalizedRound,
            session: assertSessionMatchesRoundLocation(existingSession, normalizedRound, location),
            created: false
        };
    }
    if (existingSession) {
        throw new CountRoundError("A relação da rodada com a sessão está ambígua.", "ambiguous-round-session");
    }

    const timestamp = new Date().toISOString();
    const session = createLocationCountSessionDraftFromPlanModel({
        templateId: normalizedRound.templateId,
        templateNameSnapshot: normalizedRound.templateNameSnapshot,
        locationId: location.locationId,
        locationPathSnapshot: location.locationPathSnapshot,
        reportAreaSnapshot: location.reportAreaSnapshot,
        plannedItems: location.plannedItems,
        notes: "Criada pela rodada de contagem.",
        timestamp
    });
    const nextRound = validateCountRound({
        ...normalizedRound,
        locations: normalizedRound.locations.map((item) => (
            item.locationId === location.locationId ? { ...item, sessionId: session.id } : item
        )),
        updatedAt: timestamp
    });
    if (!nextRound.isValid) throw new CountRoundError(nextRound.error);
    return { round: nextRound.round, session, created: true };
}

function getRequiredMappedSession(sessionId, sessionIndex, missingMessage, errorCode) {
    if (!sessionId) return null;
    const session = sessionIndex.get(sessionId);
    if (!session) throw new CountRoundError(missingMessage, errorCode);
    return session;
}

function rememberRecord(recordsById, record, conflictMessage, errorCode) {
    if (!record) return;
    const existing = recordsById.get(record.id);
    if (existing && JSON.stringify(existing) !== JSON.stringify(record)) {
        throw new CountRoundError(conflictMessage, errorCode);
    }
    recordsById.set(record.id, record);
}

function reconcileRoundLocation({ localLocation, storedLocation, localRound, storedRound, context }) {
    const localSessionId = localLocation?.sessionId || null;
    const storedSessionId = storedLocation?.sessionId || null;
    if (localSessionId && storedSessionId && localSessionId !== storedSessionId) {
        throw new CountRoundError(
            "O local possui sessions diferentes no mirror e no IndexedDB.",
            "fallback-mapping-conflict"
        );
    }
    const sessionId = storedSessionId || localSessionId;
    const baseLocation = storedLocation || localLocation;
    if (!sessionId) return { location: baseLocation, session: null };

    const localSession = localSessionId
        ? getRequiredMappedSession(
            localSessionId,
            context.sessionIndexes.local,
            "O mapping local aponta para uma sessão ausente.",
            "missing-fallback-session"
        )
        : context.sessionIndexes.local.get(sessionId) || null;
    const storedSession = storedSessionId
        ? getRequiredMappedSession(
            storedSessionId,
            context.sessionIndexes.stored,
            "O mapping do IndexedDB aponta para uma sessão ausente.",
            "missing-indexeddb-session"
        )
        : context.sessionIndexes.stored.get(sessionId) || null;
    const relationLocation = { ...baseLocation, sessionId };
    const relationRound = { ...(storedRound || localRound), locations: [relationLocation] };
    const validLocalSession = localSession
        ? assertSessionMatchesRoundLocation(localSession, relationRound, relationLocation)
        : null;
    const validStoredSession = storedSession
        ? assertSessionMatchesRoundLocation(storedSession, relationRound, relationLocation)
        : null;
    const session = reconcileOpenSessionCopies(validLocalSession, validStoredSession);

    if (!storedSession) context.sessionsToAdd.set(session.id, session);
    else if (JSON.stringify(session) !== JSON.stringify(storedSession)) context.sessionsToPut.set(session.id, session);
    rememberRecord(
        context.authoritativeSessions,
        session,
        "Uma sessão foi reconciliada de formas incompatíveis.",
        "fallback-session-conflict"
    );
    return { location: { ...baseLocation, sessionId }, session };
}

function reconcileActiveRound(localRound, storedRound, context) {
    if (localRound && storedRound
        && createFrozenRoundSignature(localRound) !== createFrozenRoundSignature(storedRound)) {
        throw new CountRoundError(
            "A rodada local conflita com o escopo congelado no IndexedDB.",
            "fallback-round-conflict"
        );
    }
    const baseRound = storedRound || localRound;
    const localLocationsById = new Map((localRound?.locations || []).map((location) => [location.locationId, location]));
    const storedLocationsById = new Map((storedRound?.locations || []).map((location) => [location.locationId, location]));
    const results = baseRound.locations.map((baseLocation) => reconcileRoundLocation({
        localLocation: localLocationsById.get(baseLocation.locationId) || null,
        storedLocation: storedLocationsById.get(baseLocation.locationId) || null,
        localRound,
        storedRound,
        context
    }));
    const locations = results.map((result) => result.location);
    const addedMapping = locations.some((location, index) => (
        location.sessionId && !baseRound.locations[index].sessionId
    ));
    const candidate = validateCountRound({
        ...baseRound,
        locations,
        updatedAt: !storedRound || addedMapping ? localRound?.updatedAt || baseRound.updatedAt : baseRound.updatedAt
    });
    if (!candidate.isValid) throw new CountRoundError(candidate.error);
    return candidate.round;
}

function createEntryIdentitySignature(entry) {
    const { active, updatedAt, removedAt, ...identity } = entry;
    return JSON.stringify(identity);
}

function assertEntryMatchesSession(entry, session) {
    const validation = validateLocationCountEntry(entry);
    if (!validation.isValid) throw new CountRoundError(validation.error, "invalid-fallback-entry");
    const candidate = validation.entry;
    const plannedItem = session.plannedItems.find((item) => (
        item.linkId === candidate.linkId && item.itemCode === candidate.itemCode
    ));
    const matches = plannedItem
        && candidate.sessionId === session.id
        && candidate.templateId === session.templateId
        && candidate.locationId === session.locationId
        && candidate.itemNameSnapshot === plannedItem.itemNameSnapshot
        && candidate.groupId === plannedItem.groupId
        && candidate.groupNameSnapshot === plannedItem.groupNameSnapshot
        && candidate.reportAreaSnapshot === session.reportAreaSnapshot;
    if (!matches) {
        throw new CountRoundError(
            "A entrada local não corresponde ao item planejado da sessão.",
            "invalid-fallback-entry-relation"
        );
    }
    return candidate;
}

function reconcileEntryCopies(localEntry, storedEntry, session) {
    const validLocalEntry = localEntry ? assertEntryMatchesSession(localEntry, session) : null;
    const validStoredEntry = storedEntry ? assertEntryMatchesSession(storedEntry, session) : null;
    if (!validLocalEntry) return validStoredEntry;
    if (!validStoredEntry) return validLocalEntry;
    if (createEntryIdentitySignature(validLocalEntry) !== createEntryIdentitySignature(validStoredEntry)) {
        throw new CountRoundError(
            "A entrada local conflita com o registro de mesmo ID no IndexedDB.",
            "fallback-entry-conflict"
        );
    }
    if (!validStoredEntry.active) return validStoredEntry;
    if (!validLocalEntry.active) return validLocalEntry;
    return validStoredEntry;
}

function reconcileSessionEntries(session, context) {
    const entryIds = new Set();
    context.entryIndexes.local.forEach((entry) => {
        if (entry.sessionId === session.id) entryIds.add(entry.id);
    });
    context.entryIndexes.stored.forEach((entry) => {
        if (entry.sessionId === session.id) entryIds.add(entry.id);
    });

    entryIds.forEach((entryId) => {
        const localEntry = context.entryIndexes.local.get(entryId) || null;
        const storedEntry = context.entryIndexes.stored.get(entryId) || null;
        if (localEntry && !context.sessionIndexes.local.has(session.id)) {
            throw new CountRoundError(
                "Uma entrada local aponta para uma sessão ausente no mirror.",
                "missing-fallback-session-for-entry"
            );
        }
        const entry = reconcileEntryCopies(localEntry, storedEntry, session);
        if (!storedEntry) context.entriesToAdd.set(entry.id, entry);
        else if (JSON.stringify(entry) !== JSON.stringify(storedEntry)) context.entriesToPut.set(entry.id, entry);
        rememberRecord(
            context.authoritativeEntries,
            entry,
            "Uma entrada foi reconciliada de formas incompatíveis.",
            "fallback-entry-conflict"
        );
    });
}

function createFallbackReconciliationContext({ localSessions, indexedDbSessions, localEntries, indexedDbEntries }) {
    return {
        sessionIndexes: {
            local: indexSessionsFailClosed(localSessions, "mirror local"),
            stored: indexSessionsFailClosed(indexedDbSessions, "IndexedDB")
        },
        entryIndexes: {
            local: indexEntriesFailClosed(localEntries, "mirror local"),
            stored: indexEntriesFailClosed(indexedDbEntries, "IndexedDB")
        },
        sessionsToAdd: new Map(),
        sessionsToPut: new Map(),
        entriesToAdd: new Map(),
        entriesToPut: new Map(),
        authoritativeSessions: new Map(),
        authoritativeEntries: new Map()
    };
}

export function buildCountRoundFallbackReconciliationPlan({
    localRounds = [],
    indexedDbRounds = [],
    localSessions = [],
    indexedDbSessions = [],
    localEntries = [],
    indexedDbEntries = []
} = {}) {
    const normalizedLocalRounds = assertValidCountRoundCollection(localRounds);
    const normalizedStoredRounds = assertValidCountRoundCollection(indexedDbRounds);
    const localRoundsById = new Map(normalizedLocalRounds.map((round) => [round.id, round]));
    const storedRoundsById = new Map(normalizedStoredRounds.map((round) => [round.id, round]));
    const context = createFallbackReconciliationContext({
        localSessions,
        indexedDbSessions,
        localEntries,
        indexedDbEntries
    });
    const roundsToPut = [];
    const authoritativeRounds = new Map();
    const activeRoundIds = new Set([
        ...normalizedLocalRounds.filter((round) => round.status === "active").map((round) => round.id),
        ...normalizedStoredRounds.filter((round) => round.status === "active").map((round) => round.id)
    ]);

    activeRoundIds.forEach((roundId) => {
        const localRound = localRoundsById.get(roundId) || null;
        const storedRound = storedRoundsById.get(roundId) || null;
        const reconciledRound = reconcileActiveRound(localRound, storedRound, context);
        if (!storedRound || JSON.stringify(reconciledRound) !== JSON.stringify(storedRound)) {
            roundsToPut.push(reconciledRound);
        }
        authoritativeRounds.set(reconciledRound.id, reconciledRound);
    });
    context.authoritativeSessions.forEach((session) => reconcileSessionEntries(session, context));
    assertValidCountRoundCollection([
        ...normalizedStoredRounds.filter((round) => !roundsToPut.some((candidate) => candidate.id === round.id)),
        ...roundsToPut
    ]);

    return {
        roundsToPut,
        sessionsToAdd: [...context.sessionsToAdd.values()],
        sessionsToPut: [...context.sessionsToPut.values()],
        entriesToAdd: [...context.entriesToAdd.values()],
        entriesToPut: [...context.entriesToPut.values()],
        mirrorRounds: [...authoritativeRounds.values()],
        mirrorSessions: [...context.authoritativeSessions.values()],
        mirrorEntries: [...context.authoritativeEntries.values()]
    };
}

export function validateCountRound(round) {
    const candidate = normalizeCountRound(round);
    const errors = [
        ...collectRoundIdentityErrors(candidate, round),
        ...collectRoundLocationsErrors(candidate, round),
        ...collectRoundCompletionErrors(candidate)
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
