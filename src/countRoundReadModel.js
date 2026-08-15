import { assertValidCountRoundCollection } from "./countRounds.js";
import { normalizeLocationCountEntries } from "./locationCountEntries.js";
import { normalizeLocationCountSessions, normalizePlannedItems } from "./locationCountSessions.js";

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function findActiveCountRound(rounds, templateId) {
    const normalizedTemplateId = normalizeText(templateId);
    const normalizedRounds = assertValidCountRoundCollection(rounds);
    const matches = normalizedRounds.filter((round) => (
        round.status === "active" && round.templateId === normalizedTemplateId
    ));

    if (matches.length > 1) {
        throw new Error("Existem múltiplas rodadas ativas para o template.");
    }

    return matches[0] || null;
}

export function listCountRoundLocations(round) {
    const normalizedRound = assertValidCountRoundCollection([round])[0] || null;
    return normalizedRound?.locations || [];
}

function indexSessions(sessions) {
    const normalizedSessions = normalizeLocationCountSessions(sessions);
    const sessionsById = new Map();
    const duplicateSessionIds = new Set();

    normalizedSessions.forEach((session) => {
        if (sessionsById.has(session.id)) duplicateSessionIds.add(session.id);
        sessionsById.set(session.id, session);
    });

    return { sessionsById, duplicateSessionIds };
}

function resolveSession(location, round, sessionIndex) {
    if (!location.sessionId) {
        return { session: null, error: "" };
    }

    const session = sessionIndex.sessionsById.get(location.sessionId);
    const hasMatchingPlan = session && JSON.stringify(normalizePlannedItems(session.plannedItems))
        === JSON.stringify(normalizePlannedItems(location.plannedItems));
    const isInvalid = sessionIndex.duplicateSessionIds.has(location.sessionId)
        || !session
        || session.templateId !== round.templateId
        || session.templateNameSnapshot !== round.templateNameSnapshot
        || session.locationId !== location.locationId
        || session.locationPathSnapshot.join("|") !== location.locationPathSnapshot.join("|")
        || session.reportAreaSnapshot !== location.reportAreaSnapshot
        || !hasMatchingPlan
        || !["draft", "in_progress"].includes(session.status);

    return isInvalid
        ? { session: null, error: "A sessão vinculada ao local é inválida." }
        : { session, error: "" };
}

function collectCoverage(location, session, entries) {
    const plannedLinkIds = new Set(location.plannedItems.map((item) => item.linkId));
    const activeEntries = entries.filter((entry) => entry.active && entry.sessionId === session?.id);
    const invalidEntryCount = activeEntries.filter((entry) => (
        entry.templateId !== session.templateId
        || entry.locationId !== session.locationId
        || !plannedLinkIds.has(entry.linkId)
    )).length;
    const coveredLinkIds = new Set(activeEntries
        .filter((entry) => (
            entry.templateId === session.templateId
            && entry.locationId === session.locationId
            && plannedLinkIds.has(entry.linkId)
        ))
        .map((entry) => entry.linkId));

    return { activeEntryCount: activeEntries.length, coveredLinkIds, invalidEntryCount };
}

function deriveLocationState(location, round, sessionIndex, entries) {
    const relation = resolveSession(location, round, sessionIndex);
    const totalPlannedItems = location.plannedItems.length;

    if (relation.error) {
        return {
            ...location,
            operationalState: "attention",
            attentionReason: relation.error,
            totalPlannedItems,
            coveredPlannedItemCount: 0,
            activeEntryCount: 0,
            cta: "attention"
        };
    }

    if (!relation.session) {
        return {
            ...location,
            operationalState: "not_started",
            attentionReason: "",
            totalPlannedItems,
            coveredPlannedItemCount: 0,
            activeEntryCount: 0,
            cta: "start"
        };
    }

    const coverage = collectCoverage(location, relation.session, entries);
    if (coverage.invalidEntryCount > 0) {
        return {
            ...location,
            operationalState: "attention",
            attentionReason: "A sessão possui lançamentos fora do plano congelado.",
            totalPlannedItems,
            coveredPlannedItemCount: coverage.coveredLinkIds.size,
            activeEntryCount: coverage.activeEntryCount,
            cta: "attention"
        };
    }

    const operationalState = coverage.coveredLinkIds.size === 0
        ? "not_started"
        : coverage.coveredLinkIds.size === totalPlannedItems ? "filled" : "in_progress";

    return {
        ...location,
        operationalState,
        attentionReason: "",
        totalPlannedItems,
        coveredPlannedItemCount: coverage.coveredLinkIds.size,
        activeEntryCount: coverage.activeEntryCount,
        cta: operationalState === "filled" ? "review" : "resume"
    };
}

function summarizeLocations(locations) {
    const countState = (state) => locations.filter((location) => location.operationalState === state).length;
    const totalLocations = locations.length;

    const totalPlannedOccurrences = locations.reduce((total, location) => total + location.totalPlannedItems, 0);
    const coveredPlannedOccurrences = locations.reduce(
        (total, location) => total + location.coveredPlannedItemCount,
        0
    );

    return {
        totalLocations,
        notStartedLocations: countState("not_started"),
        inProgressLocations: countState("in_progress"),
        filledLocations: countState("filled"),
        attentionLocations: countState("attention"),
        totalPlannedOccurrences,
        coveredPlannedOccurrences,
        percent: totalPlannedOccurrences > 0
            ? Math.round((coveredPlannedOccurrences / totalPlannedOccurrences) * 100)
            : 0,
        // Os aliases preservam consumidores da 4B enquanto a UI migra para a semântica de ocorrências.
        totalPlannedItems: totalPlannedOccurrences,
        coveredPlannedItems: coveredPlannedOccurrences,
        activeEntryCount: locations.reduce((total, location) => total + location.activeEntryCount, 0),
        filledPercent: totalLocations > 0 ? Math.round((countState("filled") / totalLocations) * 100) : 0
    };
}

export function buildCountRoundReadModel({ round, sessions = [], entries = [] } = {}) {
    const normalizedRound = assertValidCountRoundCollection([round])[0] || null;
    if (!normalizedRound) return null;

    const sessionIndex = indexSessions(sessions);
    const normalizedEntries = normalizeLocationCountEntries(entries);
    const locations = normalizedRound.locations.map((location) => (
        deriveLocationState(location, normalizedRound, sessionIndex, normalizedEntries)
    ));

    return {
        round: normalizedRound,
        locations,
        summary: summarizeLocations(locations)
    };
}

export function findAndBuildActiveCountRoundReadModel({ rounds = [], templateId, sessions = [], entries = [] } = {}) {
    const activeRound = findActiveCountRound(rounds, templateId);
    return activeRound ? buildCountRoundReadModel({ round: activeRound, sessions, entries }) : null;
}
