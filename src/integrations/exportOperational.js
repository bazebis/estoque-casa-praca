import { buildStockCountPayload } from "./integrationPayload.js";

const csvHeaders = [
    "count_id",
    "finished_at",
    "item_id",
    "item_name",
    "entry_value",
    "entry_unit_id",
    "entry_unit_label",
    "entry_base_unit",
    "entry_factor",
    "entry_base_quantity",
    "item_total_base_quantity"
];

function formatDatePart(value) {
    return String(value).padStart(2, "0");
}

function createOperationalFileName(extension, finishedAt = new Date()) {
    const date = new Date(finishedAt);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const year = safeDate.getFullYear();
    const month = formatDatePart(safeDate.getMonth() + 1);
    const day = formatDatePart(safeDate.getDate());
    const hour = formatDatePart(safeDate.getHours());
    const minute = formatDatePart(safeDate.getMinutes());

    return `contagem-casa-praca-${year}-${month}-${day}-${hour}-${minute}.${extension}`;
}

function stringifyCsvValue(value) {
    const text = String(value ?? "");
    const shouldQuote = /[",\n\r]/.test(text);
    const escapedText = text.replace(/"/g, "\"\"");

    return shouldQuote ? `"${escapedText}"` : escapedText;
}

function buildCsvLine(values) {
    return values.map(stringifyCsvValue).join(",");
}

export function downloadTextFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function buildStockCountCsvRows(count) {
    const payload = buildStockCountPayload(count);
    const rows = [csvHeaders];

    payload.items.forEach((item) => {
        item.entries.forEach((entry) => {
            rows.push([
                payload.countId,
                payload.finishedAt,
                item.itemId,
                item.name,
                entry.value,
                entry.unitId,
                entry.unitLabel,
                entry.baseUnit,
                entry.factor,
                entry.baseQuantity,
                item.totalBaseQuantity
            ]);
        });
    });

    return rows;
}

export function buildStockCountCsv(count) {
    return buildStockCountCsvRows(count)
        .map(buildCsvLine)
        .join("\n");
}

export function exportStockCountJson(count) {
    const payload = buildStockCountPayload(count);
    const filename = createOperationalFileName("json", payload.finishedAt);
    const content = JSON.stringify(payload, null, 2);

    downloadTextFile(filename, content, "application/json;charset=utf-8");
}

export function exportStockCountCsv(count) {
    const payload = buildStockCountPayload(count);
    const filename = createOperationalFileName("csv", payload.finishedAt);
    const content = buildStockCountCsv(count);

    downloadTextFile(filename, content, "text/csv;charset=utf-8");
}
