import { buildCountReport } from "./report.js";

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function toIsoDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString();
    }

    return date.toISOString();
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

export function countSummariesWithEntries(summaries) {
    if (!Array.isArray(summaries)) {
        return 0;
    }

    return summaries.filter((summary) => Number(summary?.totalBase) > 0).length;
}

export function createHistoryEntry(draft, summaries, finishedAt = new Date()) {
    const finishedAtIso = finishedAt.toISOString();
    const safeSummaries = Array.isArray(summaries) ? summaries : [];

    return {
        id: createId("count"),
        status: "finalizada",
        startedAt: draft?.startedAt || finishedAtIso,
        finishedAt: finishedAtIso,
        items: draft?.items || safeSummaries.map((summary) => summary.item),
        entriesByItemId: draft?.entriesByItemId || {},
        summaries: clone(safeSummaries),
        reportText: buildCountReport(safeSummaries, {
            generatedAt: finishedAt,
            showZeroItems: false
        }),
        totalItemsCounted: countSummariesWithEntries(safeSummaries),
        appVersion: 1
    };
}

export function normalizeHistoryEntry(entry, index = 0) {
    if (!entry || entry.status !== "finalizada") {
        return null;
    }

    const finishedAt = toIsoDate(entry.finishedAt || entry.createdAt || entry.startedAt);
    const summaries = Array.isArray(entry.summaries) ? entry.summaries : [];
    const reportText = entry.reportText || buildCountReport(summaries, {
        generatedAt: new Date(finishedAt),
        showZeroItems: false
    });

    return {
        id: entry.id || `finalizada_${finishedAt}_${index}`,
        status: "finalizada",
        startedAt: toIsoDate(entry.startedAt || entry.createdAt || finishedAt),
        finishedAt,
        items: Array.isArray(entry.items) ? entry.items : summaries.map((summary) => summary.item),
        entriesByItemId: entry.entriesByItemId || {},
        summaries,
        reportText,
        totalItemsCounted: Number.isInteger(entry.totalItemsCounted)
            ? entry.totalItemsCounted
            : countSummariesWithEntries(summaries),
        appVersion: entry.appVersion || 1
    };
}
