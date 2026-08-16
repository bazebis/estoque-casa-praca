import { buildCountConsolidation } from "./countConsolidation.js";
import {
    createConsolidationSnapshotFromPreview,
    markConsolidationSnapshotFinalized,
    normalizeConsolidationSnapshot,
    normalizeConsolidationSnapshots,
    validateConsolidationSnapshot
} from "./consolidationSnapshots.js";
import { validateCountRound } from "./countRounds.js";
import { normalizeCountTemplate } from "./countTemplates.js";
import {
    createLocationCountCompletionZeroEntryModel,
    normalizeLocationCountEntries,
    validateLocationCountCompletionEntry
} from "./locationCountEntries.js";
import {
    createLocationCountSessionDraftFromPlanModel,
    normalizeLocationCountSessions,
    normalizePlannedItems,
    validateLocationCountSession
} from "./locationCountSessions.js";
import {
    normalizeItemUnitSettings,
    validateControlledItemUnitProfile
} from "./itemUnitSettings.js";
import { resolveAllowedUnitForNewEntry } from "./unitConversion.js";

export class CountRoundFinalizationError extends Error {
    constructor(message, code = "invalid-round-finalization") {
        super(message);
        this.name = "CountRoundFinalizationError";
        this.code = code;
    }
}

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createRecordIndex(records, label, normalizer) {
    const normalized = normalizer(records);
    const recordsById = new Map();
    normalized.forEach((record) => {
        if (recordsById.has(record.id)) {
            throw new CountRoundFinalizationError(`${label} repetido durante a finalização.`, "duplicate-record");
        }
        recordsById.set(record.id, record);
    });
    return recordsById;
}

function plannedItemsMatch(firstItems, secondItems) {
    return JSON.stringify(normalizePlannedItems(firstItems)) === JSON.stringify(normalizePlannedItems(secondItems));
}

function createSyntheticLocations(round) {
    return round.locations.map((location) => ({
        id: location.locationId,
        name: location.locationPathSnapshot.at(-1),
        type: "custom",
        parentId: null,
        reportArea: location.reportAreaSnapshot,
        order: location.presentationOrder,
        active: true,
        createdAt: round.createdAt,
        updatedAt: round.updatedAt
    }));
}

function assertSessionMatchesLocation(session, round, location) {
    const matches = session.templateId === round.templateId
        && session.templateNameSnapshot === round.templateNameSnapshot
        && session.locationId === location.locationId
        && session.locationPathSnapshot.join("|") === location.locationPathSnapshot.join("|")
        && session.reportAreaSnapshot === location.reportAreaSnapshot
        && session.plannedItemCount === location.plannedItems.length
        && session.activeLinkCountSnapshot === location.plannedItems.length
        && plannedItemsMatch(session.plannedItems, location.plannedItems);
    if (!matches) {
        throw new CountRoundFinalizationError(
            `A session do local ${location.locationPathSnapshot.join(" / ")} diverge do plano congelado.`,
            "incompatible-session"
        );
    }
}

function materializeLocationSession(round, location, timestamp, createSessionId) {
    return createLocationCountSessionDraftFromPlanModel({
        id: createSessionId(location),
        templateId: round.templateId,
        templateNameSnapshot: round.templateNameSnapshot,
        locationId: location.locationId,
        locationPathSnapshot: location.locationPathSnapshot,
        reportAreaSnapshot: location.reportAreaSnapshot,
        plannedItems: location.plannedItems,
        timestamp
    });
}

function resolveLocationSession(context, location) {
    if (!location.sessionId) {
        const session = materializeLocationSession(
            context.round,
            location,
            context.timestamp,
            context.createSessionId
        );
        if (context.sessionsById.has(session.id)) {
            throw new CountRoundFinalizationError("O ID da session materializada já existe.", "session-id-collision");
        }
        context.sessionsById.set(session.id, session);
        context.materializedSessionCount += 1;
        return { ...location, sessionId: session.id };
    }

    const session = context.sessionsById.get(location.sessionId);
    if (!session) throw new CountRoundFinalizationError("A round aponta para uma session ausente.", "missing-session");
    if (!["draft", "in_progress"].includes(session.status)) {
        throw new CountRoundFinalizationError("A session da round não está aberta para finalização.", "invalid-session-status");
    }
    assertSessionMatchesLocation(session, context.round, location);
    return location;
}

function indexTemplateItems(template) {
    const itemsByCode = new Map();
    template.groups.forEach((group) => group.items.forEach((item) => {
        if (itemsByCode.has(item.code)) {
            throw new CountRoundFinalizationError("O template repete um item.", "duplicate-template-item");
        }
        itemsByCode.set(item.code, { item, group });
    }));
    return itemsByCode;
}

function buildProfileIndex(settings, templateId) {
    const profilesByItemCode = new Map();
    normalizeItemUnitSettings(settings).filter((setting) => (
        setting.templateId === templateId
    )).forEach((setting) => {
        if (profilesByItemCode.has(setting.itemCode)) {
            throw new CountRoundFinalizationError("Existem perfis repetidos para um item.", "duplicate-unit-profile");
        }
        profilesByItemCode.set(setting.itemCode, setting);
    });
    return profilesByItemCode;
}

function validateFrozenPlanProfiles(round, template, settings) {
    const templateItems = indexTemplateItems(template);
    const profiles = buildProfileIndex(settings, round.templateId);
    round.locations.flatMap((location) => location.plannedItems).forEach((plannedItem) => {
        const templateMatch = templateItems.get(plannedItem.itemCode);
        if (!templateMatch || templateMatch.item.name !== plannedItem.itemNameSnapshot
            || templateMatch.group.id !== plannedItem.groupId
            || templateMatch.group.name !== plannedItem.groupNameSnapshot) {
            throw new CountRoundFinalizationError("O template diverge de um item do plano congelado.", "template-plan-conflict");
        }
        const validation = validateControlledItemUnitProfile(profiles.get(plannedItem.itemCode));
        if (!validation.isValid) {
            throw new CountRoundFinalizationError(
                `O perfil de unidades de ${plannedItem.itemNameSnapshot} é inválido.`,
                "invalid-unit-profile"
            );
        }
        profiles.set(plannedItem.itemCode, validation.profile);
    });
    return profiles;
}

function assertEntryMatchesPlannedItem(entry, session, plannedItem) {
    const matches = entry.templateId === session.templateId
        && entry.locationId === session.locationId
        && entry.linkId === plannedItem.linkId
        && entry.itemCode === plannedItem.itemCode
        && entry.itemNameSnapshot === plannedItem.itemNameSnapshot
        && entry.groupId === plannedItem.groupId
        && entry.groupNameSnapshot === plannedItem.groupNameSnapshot
        && entry.reportAreaSnapshot === session.reportAreaSnapshot;
    if (!matches) {
        throw new CountRoundFinalizationError("Uma entry diverge da ocorrência planejada.", "incompatible-entry");
    }
    const validation = validateLocationCountCompletionEntry(entry);
    if (!validation.isValid) {
        throw new CountRoundFinalizationError(validation.error || "Entry inválida.", "invalid-entry");
    }
}

function getEntriesForSession(entries, sessionId) {
    return entries.filter((entry) => entry.sessionId === sessionId);
}

function validateSessionEntries(session, entries, { allowCompletionZero = false } = {}) {
    const itemsByLinkId = new Map(session.plannedItems.map((item) => [item.linkId, item]));
    entries.forEach((entry) => {
        const plannedItem = itemsByLinkId.get(entry.linkId);
        if (!plannedItem && entry.active) {
            throw new CountRoundFinalizationError("Uma entry ativa está fora do plano congelado.", "entry-outside-plan");
        }
        if (plannedItem) assertEntryMatchesPlannedItem(entry, session, plannedItem);
        if (!allowCompletionZero && entry.active && entry.quantityDecimal === "0") {
            throw new CountRoundFinalizationError("Uma round ativa não pode conter zero terminal prévio.", "premature-zero");
        }
    });
}

function resolveZeroUnit(profile) {
    const resolution = resolveAllowedUnitForNewEntry(profile, profile.defaultInputUnit);
    if (!resolution.isValid) {
        throw new CountRoundFinalizationError(resolution.error, "invalid-zero-unit");
    }
    return resolution.allowedUnit.label;
}

function createMissingZeroEntries(context, session, sessionEntries) {
    const activeLinkIds = new Set(sessionEntries.filter((entry) => entry.active).map((entry) => entry.linkId));
    return session.plannedItems.filter((item) => !activeLinkIds.has(item.linkId)).map((plannedItem) => {
        const entry = createLocationCountCompletionZeroEntryModel({
            session,
            plannedItem,
            rawUnit: resolveZeroUnit(context.profiles.get(plannedItem.itemCode)),
            id: context.createEntryId(session, plannedItem),
            timestamp: context.timestamp
        });
        if (context.entriesById.has(entry.id)) {
            throw new CountRoundFinalizationError("O ID do zero explícito já existe.", "entry-id-collision");
        }
        context.entriesById.set(entry.id, entry);
        return entry;
    });
}

function completeSession(session, timestamp, template, locations) {
    const candidate = {
        ...session,
        status: "completed",
        updatedAt: timestamp,
        startedAt: session.startedAt || timestamp,
        finishedAt: timestamp,
        canceledAt: null
    };
    const validation = validateLocationCountSession(candidate, [template], locations, []);
    if (!validation.isValid) {
        throw new CountRoundFinalizationError(validation.error || "Session final inválida.", "invalid-final-session");
    }
    return validation.session;
}

function createRoundConsolidation(round, template, sessions, entries, profiles) {
    const locations = createSyntheticLocations(round);
    return buildCountConsolidation({
        template,
        sessions,
        entries,
        unitSettings: [...profiles.values()],
        locationNodes: locations,
        itemLocationLinks: []
    });
}

function createFinalSnapshot(context, consolidation, sessionIds) {
    const generated = createConsolidationSnapshotFromPreview(consolidation, {
        label: `Fechamento global — ${context.round.templateNameSnapshot}`
    });
    const draft = normalizeConsolidationSnapshot({
        ...generated,
        id: context.createSnapshotId(context.round),
        createdAt: context.timestamp,
        updatedAt: context.timestamp
    }, context.timestamp);
    if (context.snapshots.some((snapshot) => snapshot.id === draft.id)) {
        throw new CountRoundFinalizationError("O ID do snapshot final já existe.", "snapshot-id-collision");
    }
    if (["invalid", "empty"].includes(draft.status)) {
        throw new CountRoundFinalizationError("A consolidação final não forma um snapshot válido.", "invalid-snapshot");
    }
    const snapshot = markConsolidationSnapshotFinalized(draft, {
        finalizedAt: context.timestamp,
        finalizedBy: "local-user",
        finalizedSessionIds: sessionIds,
        hasWarnings: draft.status !== "complete"
    });
    const validation = validateConsolidationSnapshot(snapshot);
    if (!validation.isValid) throw new CountRoundFinalizationError(validation.error, "invalid-snapshot");
    return validation.snapshot;
}

function createCompletedRound(context, locations, snapshot, counts) {
    const { activeTemplateId, ...roundWithoutActiveReservation } = context.round;
    const candidate = {
        ...roundWithoutActiveReservation,
        status: "completed",
        locations,
        updatedAt: context.timestamp,
        finishedAt: context.timestamp,
        completion: {
            snapshotId: snapshot.id,
            totalLocations: locations.length,
            totalPlannedOccurrences: counts.totalOccurrences,
            coveredBeforeFinalization: counts.coveredBefore,
            explicitZeroEntryCount: counts.zeroCount,
            materializedSessionCount: context.materializedSessionCount,
            finalizedSessionCount: locations.length,
            snapshotStatus: snapshot.status,
            finalizedWithWarnings: snapshot.status !== "complete"
        }
    };
    const validation = validateCountRound(candidate);
    if (!validation.isValid) throw new CountRoundFinalizationError(validation.error, "invalid-completed-round");
    return validation.round;
}

function assertExactIds(actualIds, expectedIds, message) {
    const actualSet = new Set(actualIds);
    const expectedSet = new Set(expectedIds);
    const isExact = actualIds.length === actualSet.size
        && actualSet.size === expectedSet.size
        && expectedIds.every((id) => actualSet.has(id));
    if (!isExact) throw new CountRoundFinalizationError(message, "invalid-final-snapshot");
}

function findLinkedSnapshotSource(snapshotId, sourceSnapshots) {
    const matches = (Array.isArray(sourceSnapshots) ? sourceSnapshots : []).filter((snapshot) => (
        normalizeText(snapshot?.id) === snapshotId
    ));
    if (matches.length !== 1) {
        throw new CountRoundFinalizationError(
            "O snapshot final da round está ausente ou duplicado.",
            "missing-final-snapshot"
        );
    }
    return matches[0];
}

function validateLinkedFinalSnapshot(round, sourceSnapshots) {
    const sourceSnapshot = findLinkedSnapshotSource(round.completion.snapshotId, sourceSnapshots);
    const validation = validateConsolidationSnapshot(sourceSnapshot);
    if (!validation.isValid || !validation.snapshot.finalizedAt) {
        throw new CountRoundFinalizationError(
            validation.error || "O snapshot final da round é inválido.",
            "invalid-final-snapshot"
        );
    }
    const snapshot = validation.snapshot;
    const expectedFinalizedStatus = round.completion.finalizedWithWarnings
        ? "finalized_with_warnings"
        : "finalized";
    const matchesRound = snapshot.templateId === round.templateId
        && snapshot.templateNameSnapshot === round.templateNameSnapshot
        && snapshot.status === round.completion.snapshotStatus
        && snapshot.finalizedStatus === expectedFinalizedStatus
        && snapshot.finalizedAt === round.finishedAt;
    if (!matchesRound) {
        throw new CountRoundFinalizationError(
            "O snapshot final diverge do fechamento persistido da round.",
            "invalid-final-snapshot"
        );
    }
    return { snapshot, sourceSnapshot };
}

function assertSnapshotSessionSet(round, snapshot, sourceSnapshot) {
    const expectedIds = round.locations.map((location) => location.sessionId);
    if (expectedIds.some((id) => !id)) {
        throw new CountRoundFinalizationError("Uma round concluída possui local sem session.", "invalid-final-session");
    }
    const sourceFinalizedIds = Array.isArray(sourceSnapshot.finalizedSessionIds)
        ? sourceSnapshot.finalizedSessionIds.map(normalizeText)
        : [];
    assertExactIds(
        sourceFinalizedIds,
        expectedIds,
        "As sessions finalizadas do snapshot divergem exatamente das sessions da round."
    );
    assertExactIds(
        snapshot.sessionsIncluded.map((session) => session.id),
        expectedIds,
        "As sessions incluídas no snapshot divergem exatamente das sessions da round."
    );
}

function assertCompletedSessionCoherent(round, location, session, entries) {
    const timestampsMatch = session?.finishedAt === round.finishedAt
        && session.updatedAt === round.finishedAt;
    if (!session || session.status !== "completed" || !timestampsMatch) {
        throw new CountRoundFinalizationError("Uma session final da round está incoerente.", "invalid-final-session");
    }
    assertSessionMatchesLocation(session, round, location);
    const sessionEntries = getEntriesForSession(entries, session.id);
    validateSessionEntries(session, sessionEntries, { allowCompletionZero: true });
    const covered = new Set(sessionEntries.filter((entry) => entry.active).map((entry) => entry.linkId));
    if (session.plannedItems.some((item) => !covered.has(item.linkId))) {
        throw new CountRoundFinalizationError("Uma round concluída não possui cobertura integral.");
    }
}

function assertCompletedRoundCoherent(round, sessionsById, entries, sourceSnapshots) {
    const validation = validateCountRound(round);
    if (!validation.isValid) throw new CountRoundFinalizationError(validation.error, "invalid-completed-round");
    const { snapshot, sourceSnapshot } = validateLinkedFinalSnapshot(round, sourceSnapshots);
    assertSnapshotSessionSet(round, snapshot, sourceSnapshot);
    round.locations.forEach((location) => {
        assertCompletedSessionCoherent(round, location, sessionsById.get(location.sessionId), entries);
    });
    return snapshot;
}

function prepareActiveFinalizationContext(input, round, template) {
    const timestamp = new Date(input.timestamp || Date.now()).toISOString();
    return {
        round,
        template,
        timestamp,
        snapshots: normalizeConsolidationSnapshots(input.snapshots),
        sessionsById: createRecordIndex(input.sessions, "Session", normalizeLocationCountSessions),
        entriesById: createRecordIndex(input.entries, "Entry", normalizeLocationCountEntries),
        createSessionId: input.createSessionId || (() => createId("location_count")),
        createEntryId: input.createEntryId || (() => createId("location_entry")),
        createSnapshotId: input.createSnapshotId || (() => createId("consolidation")),
        materializedSessionCount: 0,
        profiles: validateFrozenPlanProfiles(round, template, input.unitSettings)
    };
}

function buildActiveFinalizationPlan(input, round, template) {
    const context = prepareActiveFinalizationContext(input, round, template);
    const locations = round.locations.map((location) => resolveLocationSession(context, location));
    const openSessions = locations.map((location) => context.sessionsById.get(location.sessionId));
    const roundEntries = openSessions.flatMap((session) => getEntriesForSession([...context.entriesById.values()], session.id));
    openSessions.forEach((session) => validateSessionEntries(session, getEntriesForSession(roundEntries, session.id)));
    const coveredBefore = openSessions.reduce((total, session) => {
        const activeLinks = new Set(getEntriesForSession(roundEntries, session.id)
            .filter((entry) => entry.active).map((entry) => entry.linkId));
        return total + session.plannedItems.filter((item) => activeLinks.has(item.linkId)).length;
    }, 0);
    const entriesToAdd = openSessions.flatMap((session) => createMissingZeroEntries(
        context,
        session,
        getEntriesForSession(roundEntries, session.id)
    ));
    const allRoundEntries = [...roundEntries, ...entriesToAdd];
    const consolidation = createRoundConsolidation(round, template, openSessions, allRoundEntries, context.profiles);
    const completedSessions = openSessions.map((session) => completeSession(
        session,
        context.timestamp,
        template,
        createSyntheticLocations(round)
    ));
    const sessionIds = completedSessions.map((session) => session.id);
    const snapshot = createFinalSnapshot(context, consolidation, sessionIds);
    const totalOccurrences = locations.reduce((total, location) => total + location.plannedItems.length, 0);
    const completedRound = createCompletedRound(context, locations, snapshot, {
        totalOccurrences,
        coveredBefore,
        zeroCount: entriesToAdd.length
    });
    return {
        changed: true,
        wasAlreadyCompleted: false,
        round: completedRound,
        sessionsToPut: completedSessions,
        entriesToAdd,
        snapshot,
        snapshots: [...context.snapshots, snapshot],
        mirrorSessions: completedSessions,
        mirrorEntries: allRoundEntries
    };
}

export function buildCountRoundFinalizationPlan(input = {}) {
    const roundValidation = validateCountRound(input.round);
    const round = roundValidation.round;
    if (!round?.id) {
        throw new CountRoundFinalizationError(
            roundValidation.error || "A rodada não foi encontrada.",
            "missing-or-invalid-round"
        );
    }
    const sessionsById = createRecordIndex(input.sessions, "Session", normalizeLocationCountSessions);
    const entries = normalizeLocationCountEntries(input.entries);
    const snapshots = normalizeConsolidationSnapshots(input.snapshots);

    if (round.status === "completed") {
        const snapshot = assertCompletedRoundCoherent(round, sessionsById, entries, input.snapshots);
        const sessionIds = new Set(round.locations.map((location) => location.sessionId));
        return {
            changed: false,
            wasAlreadyCompleted: true,
            round,
            sessionsToPut: [],
            entriesToAdd: [],
            snapshot,
            snapshots,
            mirrorSessions: [...sessionsById.values()].filter((session) => sessionIds.has(session.id)),
            mirrorEntries: entries.filter((entry) => sessionIds.has(entry.sessionId))
        };
    }
    if (round.status !== "active") {
        throw new CountRoundFinalizationError("Somente uma rodada ativa pode ser finalizada.", "round-not-active");
    }
    const template = normalizeCountTemplate(input.template);
    if (!template || template.id !== round.templateId || template.name !== round.templateNameSnapshot) {
        throw new CountRoundFinalizationError("O template da rodada está ausente ou incompatível.", "invalid-template");
    }
    return buildActiveFinalizationPlan(input, round, template);
}
