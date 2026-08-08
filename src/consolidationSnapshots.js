const snapshotStatuses = new Set(["complete", "partial", "empty", "invalid"]);
const finalizedStatuses = new Set(["finalized", "finalized_with_warnings"]);
const snapshotSource = "consolidationPreview";

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeTimestamp(value, fallback = null) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : 0;
}

function normalizeSummary(summary = {}) {
    const fields = [
        "consideredSessionCount", "duplicateSessionCount", "canceledSessionCount", "completedSessionCount", "areaCount",
        "areasWithEntries", "itemCount", "itemsWithEntries", "completeItemCount",
        "pendingItemCount", "pendingEntryCount"
    ];
    return Object.fromEntries(fields.map((field) => [field, normalizeNumber(summary[field])]));
}

function createSnapshotId() {
    if (globalThis.crypto?.randomUUID) return `consolidation_${globalThis.crypto.randomUUID()}`;
    return `consolidation_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function formatDefaultLabel(timestamp) {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return "Fechamento da consolidação";
    const datePart = date.toLocaleDateString("pt-BR");
    const timePart = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return `Fechamento ${datePart} ${timePart}`;
}

function snapshotSession(session, ignoredReason = "") {
    const locationPath = Array.isArray(session?.locationPathSnapshot)
        ? session.locationPathSnapshot
        : [];
    return {
        id: normalizeText(session?.id),
        locationId: normalizeText(session?.locationId),
        locationPathSnapshot: locationPath.map(normalizeText).filter(Boolean),
        reportAreaSnapshot: normalizeText(session?.reportAreaSnapshot).toLocaleUpperCase("pt-BR") || null,
        status: normalizeText(session?.status),
        createdAt: normalizeTimestamp(session?.createdAt),
        updatedAt: normalizeTimestamp(session?.updatedAt),
        startedAt: normalizeTimestamp(session?.startedAt),
        ignoredReason: normalizeText(ignoredReason)
    };
}

function snapshotCell(cell) {
    return {
        area: normalizeText(cell?.area).toLocaleUpperCase("pt-BR"),
        status: normalizeText(cell?.status) || "empty",
        convertedQuantityDecimal: normalizeText(cell?.conversion?.totalConvertedDecimal) || null,
        baseUnit: normalizeText(cell?.conversion?.baseUnit),
        entryCount: normalizeNumber(cell?.conversion?.activeEntryCount),
        convertibleEntryCount: normalizeNumber(cell?.conversion?.convertibleEntryCount),
        pendingEntryCount: normalizeNumber(cell?.conversion?.unconvertibleEntryCount),
        isExpected: cell?.isExpected === true
    };
}

function snapshotTotal(total) {
    return {
        status: normalizeText(total?.status) || "no_entries",
        convertedQuantityDecimal: normalizeText(total?.conversion?.totalConvertedDecimal) || null,
        baseUnit: normalizeText(total?.conversion?.baseUnit),
        entryCount: normalizeNumber(total?.entryCount),
        convertibleEntryCount: normalizeNumber(total?.conversion?.convertibleEntryCount),
        pendingEntryCount: normalizeNumber(total?.pendingEntries?.length)
    };
}

function snapshotItem(item) {
    return {
        itemCode: normalizeText(item?.code),
        itemNameSnapshot: normalizeText(item?.name),
        groupId: normalizeText(item?.groupId),
        groupNameSnapshot: normalizeText(item?.groupName),
        groupOrder: normalizeNumber(item?.groupOrder),
        order: normalizeNumber(item?.order),
        baseUnit: normalizeText(item?.baseUnit),
        status: normalizeText(item?.total?.status) || "no_entries",
        areas: (item?.cells || []).map(snapshotCell),
        total: snapshotTotal(item?.total)
    };
}

function snapshotPendingEntry(pending) {
    return {
        type: normalizeText(pending?.type),
        entryId: normalizeText(pending?.entry?.id),
        sessionId: normalizeText(pending?.entry?.sessionId),
        itemCode: normalizeText(pending?.itemCode),
        itemNameSnapshot: normalizeText(pending?.itemName),
        groupNameSnapshot: normalizeText(pending?.groupName),
        area: normalizeText(pending?.area) || "Sem área",
        rawQuantityText: normalizeText(pending?.entry?.rawQuantityText),
        rawUnit: normalizeText(pending?.entry?.rawUnit),
        reason: normalizeText(pending?.reason),
        suggestion: normalizeText(pending?.suggestion)
    };
}

function buildIgnoredSessions(selection = {}) {
    const duplicate = (selection.duplicateIgnored || []).map((session) => snapshotSession(session, "Sessão duplicada mais antiga."));
    const canceled = (selection.canceledIgnored || []).map((session) => snapshotSession(session, "Sessão cancelada."));
    const completed = (selection.completedIgnored || []).map((session) => snapshotSession(session, "Sessão de ciclo finalizado."));
    const unsupported = (selection.unsupportedIgnored || []).map((session) => snapshotSession(session, "Status não aceito."));
    return [...duplicate, ...canceled, ...completed, ...unsupported];
}

function normalizeFinalization(snapshot) {
    const finalizedAt = normalizeTimestamp(snapshot?.finalizedAt);
    if (!finalizedAt) {
        return {
            finalizedAt: null,
            finalizedBy: "",
            finalizedStatus: null,
            finalizedSessionIds: [],
            finalizationNotes: ""
        };
    }
    const status = normalizeText(snapshot.finalizedStatus);
    const sessionIds = Array.isArray(snapshot.finalizedSessionIds) ? snapshot.finalizedSessionIds : [];
    return {
        finalizedAt,
        finalizedBy: normalizeText(snapshot.finalizedBy) || "local-user",
        finalizedStatus: finalizedStatuses.has(status) ? status : "finalized",
        finalizedSessionIds: [...new Set(sessionIds.map(normalizeText).filter(Boolean))],
        finalizationNotes: String(snapshot.finalizationNotes ?? "").trim()
    };
}

export function classifyConsolidationSnapshot(consolidation) {
    const summary = consolidation?.summary;
    const hasMinimumData = Boolean(
        consolidation?.template?.id
        && consolidation?.realAreas?.length
        && consolidation?.items?.length
        && consolidation?.sessionSelection?.selected?.length
    );
    if (!hasMinimumData) return "invalid";
    const hasLaunches = Boolean(summary?.itemsWithEntries || consolidation?.pendingEntries?.length);
    if (!hasLaunches) return "empty";
    return consolidation.pendingEntries?.length ? "partial" : "complete";
}

export function createConsolidationSnapshotFromPreview(consolidation, options = {}) {
    const timestamp = new Date().toISOString();
    const status = classifyConsolidationSnapshot(consolidation);
    return normalizeConsolidationSnapshot({
        id: createSnapshotId(),
        templateId: consolidation?.template?.id,
        templateNameSnapshot: consolidation?.template?.name,
        createdAt: timestamp,
        updatedAt: timestamp,
        label: options.label || formatDefaultLabel(timestamp),
        status,
        summary: consolidation?.summary,
        realAreas: consolidation?.realAreas,
        sessionsIncluded: (consolidation?.sessionSelection?.selected || []).map((session) => snapshotSession(session)),
        sessionsIgnored: buildIgnoredSessions(consolidation?.sessionSelection),
        items: (consolidation?.items || []).map(snapshotItem),
        pendingEntries: (consolidation?.pendingEntries || []).map(snapshotPendingEntry),
        source: snapshotSource,
        notes: options.notes
    }, timestamp);
}

function normalizeSnapshotItem(item) {
    const areas = Array.isArray(item?.areas) ? item.areas : [];
    return {
        itemCode: normalizeText(item?.itemCode),
        itemNameSnapshot: normalizeText(item?.itemNameSnapshot),
        groupId: normalizeText(item?.groupId),
        groupNameSnapshot: normalizeText(item?.groupNameSnapshot),
        groupOrder: normalizeNumber(item?.groupOrder),
        order: normalizeNumber(item?.order),
        baseUnit: normalizeText(item?.baseUnit),
        status: normalizeText(item?.status) || "no_entries",
        areas: areas.map(normalizeSavedCell),
        total: normalizeSavedTotal(item?.total)
    };
}

function normalizeSavedCell(cell) {
    return {
        area: normalizeText(cell?.area).toLocaleUpperCase("pt-BR"),
        status: normalizeText(cell?.status) || "empty",
        convertedQuantityDecimal: normalizeText(cell?.convertedQuantityDecimal) || null,
        baseUnit: normalizeText(cell?.baseUnit),
        entryCount: normalizeNumber(cell?.entryCount),
        convertibleEntryCount: normalizeNumber(cell?.convertibleEntryCount),
        pendingEntryCount: normalizeNumber(cell?.pendingEntryCount),
        isExpected: cell?.isExpected === true
    };
}

function normalizeSavedTotal(total) {
    return {
        status: normalizeText(total?.status) || "no_entries",
        convertedQuantityDecimal: normalizeText(total?.convertedQuantityDecimal) || null,
        baseUnit: normalizeText(total?.baseUnit),
        entryCount: normalizeNumber(total?.entryCount),
        convertibleEntryCount: normalizeNumber(total?.convertibleEntryCount),
        pendingEntryCount: normalizeNumber(total?.pendingEntryCount)
    };
}

function normalizeSavedPending(pending) {
    return {
        type: normalizeText(pending?.type),
        entryId: normalizeText(pending?.entryId),
        sessionId: normalizeText(pending?.sessionId),
        itemCode: normalizeText(pending?.itemCode),
        itemNameSnapshot: normalizeText(pending?.itemNameSnapshot),
        groupNameSnapshot: normalizeText(pending?.groupNameSnapshot),
        area: normalizeText(pending?.area) || "Sem área",
        rawQuantityText: normalizeText(pending?.rawQuantityText),
        rawUnit: normalizeText(pending?.rawUnit),
        reason: normalizeText(pending?.reason),
        suggestion: normalizeText(pending?.suggestion)
    };
}

export function normalizeConsolidationSnapshot(snapshot, timestamp = new Date().toISOString()) {
    if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return null;
    const createdAt = normalizeTimestamp(snapshot.createdAt, timestamp);
    const status = normalizeText(snapshot.status);
    const realAreas = Array.isArray(snapshot.realAreas) ? snapshot.realAreas : [];
    const sessionsIncluded = Array.isArray(snapshot.sessionsIncluded) ? snapshot.sessionsIncluded : [];
    const sessionsIgnored = Array.isArray(snapshot.sessionsIgnored) ? snapshot.sessionsIgnored : [];
    const items = Array.isArray(snapshot.items) ? snapshot.items : [];
    const pendingEntries = Array.isArray(snapshot.pendingEntries) ? snapshot.pendingEntries : [];
    const finalization = normalizeFinalization(snapshot);
    return {
        id: normalizeText(snapshot.id),
        templateId: normalizeText(snapshot.templateId),
        templateNameSnapshot: normalizeText(snapshot.templateNameSnapshot),
        createdAt,
        updatedAt: normalizeTimestamp(snapshot.updatedAt, createdAt),
        label: normalizeText(snapshot.label),
        status: snapshotStatuses.has(status) ? status : "invalid",
        summary: normalizeSummary(snapshot.summary),
        realAreas: [...new Set(realAreas.map((area) => normalizeText(area).toLocaleUpperCase("pt-BR")).filter(Boolean))],
        sessionsIncluded: sessionsIncluded.map((session) => snapshotSession(session)),
        sessionsIgnored: sessionsIgnored.map((session) => snapshotSession(session, session?.ignoredReason)),
        items: items.map(normalizeSnapshotItem),
        pendingEntries: pendingEntries.map(normalizeSavedPending),
        source: normalizeText(snapshot.source),
        notes: normalizeText(snapshot.notes),
        ...finalization
    };
}

export function normalizeConsolidationSnapshots(snapshots) {
    if (!Array.isArray(snapshots)) return [];
    return snapshots.map((snapshot) => normalizeConsolidationSnapshot(snapshot)).filter((snapshot) => snapshot?.id);
}

export function validateConsolidationSnapshot(snapshot) {
    const candidate = normalizeConsolidationSnapshot(snapshot);
    const errors = [];
    if (!candidate?.id) errors.push("O snapshot precisa de um identificador.");
    if (!candidate?.templateId || !candidate.templateNameSnapshot) errors.push("O snapshot precisa identificar o template.");
    if (!candidate?.label) errors.push("O snapshot precisa de um nome.");
    if (candidate?.source !== snapshotSource) errors.push("A origem do snapshot é inválida.");
    if (!snapshotStatuses.has(candidate?.status)) errors.push("O status do snapshot é inválido.");
    if (candidate?.label.length > 160) errors.push("O nome deve ter no máximo 160 caracteres.");
    if (candidate?.notes.length > 500) errors.push("As observações devem ter no máximo 500 caracteres.");
    if (candidate?.finalizedBy.length > 120) errors.push("A identificação da finalização deve ter no máximo 120 caracteres.");
    if (candidate?.finalizationNotes.length > 1000) errors.push("As observações da finalização devem ter no máximo 1000 caracteres.");
    return { isValid: errors.length === 0, error: errors[0] || "", errors, snapshot: errors.length ? null : candidate };
}

export function isConsolidationSnapshotFinalized(snapshot) {
    return Boolean(normalizeConsolidationSnapshot(snapshot)?.finalizedAt);
}

export function markConsolidationSnapshotFinalized(snapshot, details = {}) {
    const candidate = normalizeConsolidationSnapshot(snapshot);
    if (!candidate?.id) throw new Error("Snapshot de consolidação inválido.");
    if (candidate.finalizedAt) return candidate;
    const timestamp = normalizeTimestamp(details.finalizedAt, new Date().toISOString());
    return normalizeConsolidationSnapshot({
        ...candidate,
        finalizedAt: timestamp,
        finalizedBy: normalizeText(details.finalizedBy) || "local-user",
        finalizedStatus: details.hasWarnings ? "finalized_with_warnings" : "finalized",
        finalizedSessionIds: details.finalizedSessionIds,
        finalizationNotes: String(details.finalizationNotes ?? "").trim(),
        updatedAt: timestamp
    }, timestamp);
}

export function summarizeConsolidationSnapshot(snapshot) {
    const normalized = normalizeConsolidationSnapshot(snapshot);
    return {
        status: normalized?.status || "invalid",
        itemCount: normalized?.summary.itemCount || 0,
        itemsWithEntries: normalized?.summary.itemsWithEntries || 0,
        pendingEntryCount: normalized?.pendingEntries.length || 0,
        areaCount: normalized?.realAreas.length || 0,
        includedSessionCount: normalized?.sessionsIncluded.length || 0,
        ignoredSessionCount: normalized?.sessionsIgnored.length || 0,
        finalized: Boolean(normalized?.finalizedAt),
        finalizedSessionCount: normalized?.finalizedSessionIds.length || 0
    };
}
