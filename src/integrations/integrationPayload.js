import { buildCountReport } from "../report.js";
import { convertToBase, resolveUnitSnapshot } from "../units.js";

const source = "estoque-casa-praca";
const schemaVersion = 1;

function toIsoDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return new Date().toISOString();
    }

    return date.toISOString();
}

function getSummaries(count) {
    return Array.isArray(count?.summaries) ? count.summaries : [];
}

function shouldIncludeSummary(summary) {
    return Number(summary?.totalBase) > 0 || (Array.isArray(summary?.entries) && summary.entries.length > 0);
}

function buildPayloadEntry(entry) {
    const unit = resolveUnitSnapshot(entry.unitId, entry.unitSnapshot);
    const value = Number(entry.quantity);
    const safeValue = Number.isFinite(value) ? value : 0;

    return {
        value: safeValue,
        unitId: unit.unitId,
        unitLabel: unit.unitLabel,
        baseUnit: unit.baseUnit,
        factor: unit.factor,
        baseQuantity: convertToBase(safeValue, unit.unitId, unit)
    };
}

function buildPayloadItem(summary) {
    const entries = Array.isArray(summary.entries) ? summary.entries.map(buildPayloadEntry) : [];
    const item = summary.item || {};

    return {
        itemId: item.id || "",
        name: item.name || "",
        entries,
        totalBaseQuantity: Number(summary.totalBase) || 0,
        baseUnit: summary.baseUnit || entries[0]?.baseUnit || ""
    };
}

function buildReportText(count, summaries, finishedAt) {
    if (count?.reportText) {
        return count.reportText;
    }

    return buildCountReport(summaries, {
        generatedAt: new Date(finishedAt),
        showZeroItems: false
    });
}

// This payload is intentionally adapter-neutral so it can later feed CSV, JSON,
// sync queues, or an external integration without coupling this app to an API.
export function buildStockCountPayload(count) {
    const summaries = getSummaries(count).filter(shouldIncludeSummary);
    const finishedAt = toIsoDate(count?.finishedAt || count?.createdAt || Date.now());

    return {
        type: "stock_count",
        schemaVersion,
        source,
        countId: count?.id || "",
        startedAt: toIsoDate(count?.startedAt || finishedAt),
        finishedAt,
        status: "finalizada",
        items: summaries.map(buildPayloadItem),
        reportText: buildReportText(count, summaries, finishedAt)
    };
}

