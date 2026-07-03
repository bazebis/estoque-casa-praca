import { getUnitById } from "./units.js";

function formatNumber(value) {
    return Number(value).toLocaleString("pt-BR", {
        maximumFractionDigits: 3
    });
}

function formatReportDate(date) {
    const datePart = date.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
    });
    const timePart = date.toLocaleTimeString("pt-BR", {
        hour: "2-digit",
        minute: "2-digit"
    });

    return `${datePart} ${timePart}`;
}

export function shouldIncludeItem(summary, showZeroItems = false) {
    return showZeroItems || summary.totalBase > 0;
}

export function formatEntryLine(entry) {
    const unit = getUnitById(entry.unitId);

    return `- ${formatNumber(entry.quantity)} ${unit.label}`;
}

export function formatTotalLine(summary) {
    return `Total: ${formatNumber(summary.totalBase)} ${summary.baseUnit}`;
}

export function buildCountReport(summaries, options = {}) {
    const generatedAt = options.generatedAt || new Date();
    const showZeroItems = Boolean(options.showZeroItems);
    const lines = [
        "Contagem de Estoque - Casa da Praça",
        `Data: ${formatReportDate(generatedAt)}`,
        ""
    ];

    summaries
        .filter((summary) => shouldIncludeItem(summary, showZeroItems))
        .forEach((summary) => {
            lines.push(summary.item.name);
            summary.entries.forEach((entry) => lines.push(formatEntryLine(entry)));
            lines.push(formatTotalLine(summary), "");
        });

    return lines.join("\n").trimEnd();
}
