const csvSeparator = ";";
const csvMimeType = "text/csv;charset=utf-8";
const utf8Bom = "\uFEFF";

export function normalizeCsvCell(value) {
    const text = value === null || value === undefined ? "" : String(value);
    // Spreadsheet programs can execute cells beginning with formula markers.
    return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function csvEscape(value) {
    const text = normalizeCsvCell(value);
    const escaped = text.replace(/"/g, '""');
    return /[;"\r\n]/.test(text) ? `"${escaped}"` : escaped;
}

function buildCsvContent(rows) {
    const lines = rows.map((row) => row.map(csvEscape).join(csvSeparator));
    return `${utf8Bom}${lines.join("\r\n")}`;
}

function getItemStatusLabel(status) {
    const labels = {
        no_entries: "sem lançamento",
        complete: "completo",
        partial: "parcial",
        pending: "pendente"
    };
    return labels[status] || "pendente";
}

function formatSavedValue(savedValue, fallbackBaseUnit = "") {
    if (!savedValue?.convertedQuantityDecimal) {
        return savedValue?.status === "pending" ? "PENDENTE" : "";
    }
    const baseUnit = savedValue.baseUnit || fallbackBaseUnit;
    const quantity = `${savedValue.convertedQuantityDecimal} ${baseUnit}`.trim();
    return savedValue.status === "partial" ? `${quantity} (parcial)` : quantity;
}

function buildAreaValues(snapshot, item) {
    const cellsByArea = new Map((item.areas || []).map((cell) => [cell.area, cell]));
    return (snapshot.realAreas || []).map((area) => (
        formatSavedValue(cellsByArea.get(area), item.baseUnit)
    ));
}

function formatPendingIndicator(item) {
    const pendingCount = Number(item?.total?.pendingEntryCount) || 0;
    return pendingCount > 0 ? `SIM (${pendingCount})` : "NÃO";
}

export function buildCsvRows(snapshot) {
    const headers = [
        "Grupo", "Código", "Item", "Unidade base",
        ...(snapshot?.realAreas || []),
        "TOTAL", "Status", "Pendências"
    ];
    const itemRows = (snapshot?.items || []).map((item) => [
        item.groupNameSnapshot,
        item.itemCode,
        item.itemNameSnapshot,
        item.baseUnit,
        ...buildAreaValues(snapshot, item),
        formatSavedValue(item.total, item.baseUnit),
        getItemStatusLabel(item.status),
        formatPendingIndicator(item)
    ]);
    return [headers, ...itemRows];
}

export function buildSnapshotMainCsv(snapshot) {
    return buildCsvContent(buildCsvRows(snapshot));
}

function buildPendingRows(snapshot) {
    const headers = [
        "Grupo", "Código", "Item", "Área", "Quantidade original",
        "Unidade original", "Motivo", "Sugestão"
    ];
    const pendingRows = (snapshot?.pendingEntries || []).map((pending) => [
        pending.groupNameSnapshot,
        pending.itemCode,
        pending.itemNameSnapshot,
        pending.area,
        pending.rawQuantityText,
        pending.rawUnit,
        pending.reason,
        pending.suggestion
    ]);
    return [headers, ...pendingRows];
}

export function buildSnapshotPendingCsv(snapshot) {
    return buildCsvContent(buildPendingRows(snapshot));
}

function slugify(value) {
    return String(value || "fechamento")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("pt-BR")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "fechamento";
}

function formatTimestampForFilename(value) {
    const date = new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const parts = [
        safeDate.getFullYear(),
        String(safeDate.getMonth() + 1).padStart(2, "0"),
        String(safeDate.getDate()).padStart(2, "0"),
        String(safeDate.getHours()).padStart(2, "0"),
        String(safeDate.getMinutes()).padStart(2, "0")
    ];
    return `${parts.slice(0, 3).join("-")}-${parts.slice(3).join("")}`;
}

export function formatCsvFilename(snapshot, kind = "consolidacao") {
    const templateName = slugify(snapshot?.templateNameSnapshot);
    const timestamp = formatTimestampForFilename(snapshot?.createdAt);
    const safeKind = kind === "pendencias" ? "pendencias" : "consolidacao";
    return `fechamento-${templateName}-${timestamp}-${safeKind}.csv`;
}

export function buildSnapshotCsvBundle(snapshot) {
    return {
        main: {
            filename: formatCsvFilename(snapshot, "consolidacao"),
            content: buildSnapshotMainCsv(snapshot),
            mimeType: csvMimeType
        },
        pending: {
            filename: formatCsvFilename(snapshot, "pendencias"),
            content: buildSnapshotPendingCsv(snapshot),
            mimeType: csvMimeType
        },
        hasPending: Boolean(snapshot?.pendingEntries?.length)
    };
}

function openBlobInNewTab(url) {
    const openedWindow = globalThis.window?.open(url, "_blank", "noopener,noreferrer");
    if (!openedWindow) throw new Error("O navegador bloqueou a abertura do arquivo.");
    return "new_tab";
}

export function downloadTextFile(filename, content, mimeType = csvMimeType) {
    if (!globalThis.Blob || !globalThis.URL?.createObjectURL || !globalThis.document) {
        throw new Error("Este navegador não oferece suporte ao download local de arquivos.");
    }
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    let method = "download";
    try {
        if (!("download" in link)) return openBlobInNewTab(url);
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } finally {
        globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return method;
}
