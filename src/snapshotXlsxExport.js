import * as XLSX from "xlsx";

const firstAreaColumnIndex = 6;
const totalColumnIndex = 8;
const xlsxMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const canonicalAreas = new Map([
    ["BAR", "BAR"],
    ["ESTOQUE", "ESTOQUE"],
    ["EMPORIO", "EMPORIO"],
    ["SALAO", "SALÃO"],
    ["COZINHA", "COZINHA"],
    ["GELADEIRA LATICINIOS", "GELADEIRA LATICÍNIOS"]
]);

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function removeDiacritics(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeComparableText(value) {
    return removeDiacritics(normalizeText(value)).toLocaleUpperCase("pt-BR");
}

export function normalizeAreaName(value) {
    const comparableArea = normalizeComparableText(value);
    return canonicalAreas.get(comparableArea) || comparableArea;
}

function getCell(worksheet, rowIndex, columnIndex) {
    return worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
}

function getCellText(worksheet, rowIndex, columnIndex) {
    const cell = getCell(worksheet, rowIndex, columnIndex);
    return normalizeText(cell?.w ?? cell?.v);
}

function createIssue(code, severity, message, context = {}) {
    return { code, severity, message, ...context };
}

function appendUniqueIssues(target, issues) {
    const existingKeys = new Set(target.map((issue) => (
        `${issue.code}:${issue.rowNumber || ""}:${issue.itemCode || ""}:${issue.groupRowNumber || ""}`
    )));
    issues.forEach((issue) => {
        const key = `${issue.code}:${issue.rowNumber || ""}:${issue.itemCode || ""}:${issue.groupRowNumber || ""}`;
        if (!existingKeys.has(key)) {
            target.push(issue);
            existingKeys.add(key);
        }
    });
}

function splitIssues(issues) {
    return {
        blockers: issues.filter((issue) => issue.severity === "blocker"),
        warnings: issues.filter((issue) => issue.severity === "warning")
    };
}

function readGroupHeaders(worksheet, rowIndex) {
    const areaColumns = {};
    let recognizedHeaderCount = 0;
    let totalColumn = null;

    for (let columnIndex = firstAreaColumnIndex; columnIndex <= totalColumnIndex; columnIndex += 1) {
        const header = normalizeAreaName(getCellText(worksheet, rowIndex, columnIndex));
        if (!header) continue;
        if (header === "TOTAL") {
            totalColumn = columnIndex;
            recognizedHeaderCount += 1;
            continue;
        }
        if (!canonicalAreas.has(normalizeComparableText(header))) continue;
        areaColumns[header] = columnIndex;
        recognizedHeaderCount += 1;
    }
    return { areaColumns, recognizedHeaderCount, totalColumn };
}

function createGroup(worksheet, rowIndex, headers) {
    return {
        rowNumber: rowIndex + 1,
        name: getCellText(worksheet, rowIndex, 1),
        areaColumns: headers.areaColumns,
        totalColumn: headers.totalColumn,
        items: []
    };
}

function createSheetItem(worksheet, rowIndex, group) {
    return {
        rowNumber: rowIndex + 1,
        code: getCellText(worksheet, rowIndex, 0),
        name: getCellText(worksheet, rowIndex, 1),
        groupName: group.name,
        groupRowNumber: group.rowNumber,
        areaColumns: { ...group.areaColumns },
        totalColumn: group.totalColumn
    };
}

function inspectWorksheet(sheetName, worksheet) {
    const range = XLSX.utils.decode_range(worksheet?.["!ref"] || "A1:A1");
    const groups = [];
    const items = [];
    const issues = [];
    let currentGroup = null;

    for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
        const name = getCellText(worksheet, rowIndex, 1);
        const code = getCellText(worksheet, rowIndex, 0);
        const headers = readGroupHeaders(worksheet, rowIndex);
        if (name && headers.recognizedHeaderCount > 0) {
            currentGroup = createGroup(worksheet, rowIndex, headers);
            groups.push(currentGroup);
            continue;
        }
        if (!currentGroup || (!code && !name)) continue;
        if (!code || !name) {
            issues.push(createIssue(
                "invalid_item_row",
                "blocker",
                `A linha ${rowIndex + 1} precisa ter código em A e nome em B.`,
                { rowNumber: rowIndex + 1 }
            ));
            continue;
        }
        const item = createSheetItem(worksheet, rowIndex, currentGroup);
        currentGroup.items.push(item);
        items.push(item);
    }
    return { sheetName, worksheet, range: worksheet?.["!ref"] || "", groups, items, issues };
}

function isOperationalCandidate(analysis) {
    return analysis.groups.length > 0 && analysis.items.length > 0;
}

export function findOperationalSheet(workbook) {
    const sheets = (workbook?.SheetNames || []).map((sheetName) => (
        inspectWorksheet(sheetName, workbook.Sheets[sheetName])
    ));
    const candidates = sheets.filter(isOperationalCandidate);
    if (candidates.length !== 1) {
        return { status: candidates.length ? "ambiguous" : "missing", candidates, sheets };
    }
    return { status: "found", candidate: candidates[0], candidates, sheets };
}

function findDuplicateCodes(items) {
    const counts = new Map();
    items.forEach((item) => counts.set(item.code, (counts.get(item.code) || 0) + 1));
    return [...counts.entries()].filter(([, count]) => count > 1).map(([code]) => code);
}

function validateGroupStructure(group) {
    const issues = [];
    const areaCount = Object.keys(group.areaColumns).length;
    if (!areaCount) {
        issues.push(createIssue("group_without_area", "blocker", `O grupo da linha ${group.rowNumber} não declara área.`, {
            groupRowNumber: group.rowNumber
        }));
    }
    if (group.totalColumn !== null && group.totalColumn !== totalColumnIndex) {
        issues.push(createIssue("total_in_wrong_column", "blocker", `O TOTAL do grupo da linha ${group.rowNumber} não está em I.`, {
            groupRowNumber: group.rowNumber
        }));
    }
    if (Object.values(group.areaColumns).includes(totalColumnIndex)) {
        issues.push(createIssue("area_in_total_column", "blocker", `O grupo da linha ${group.rowNumber} usa I como área.`, {
            groupRowNumber: group.rowNumber
        }));
    }
    if (group.totalColumn === null) {
        const severity = areaCount === 1 ? "warning" : "blocker";
        issues.push(createIssue("group_without_total", severity, `O grupo da linha ${group.rowNumber} não declara TOTAL.`, {
            groupRowNumber: group.rowNumber
        }));
    }
    return issues;
}

function validateQuantityFormulas(analysis) {
    return analysis.items.flatMap((item) => {
        const quantityColumns = [...Object.values(item.areaColumns), item.totalColumn].filter(Number.isInteger);
        return quantityColumns.flatMap((columnIndex) => {
            const cell = getCell(analysis.worksheet, item.rowNumber - 1, columnIndex);
            if (!cell?.f) return [];
            const address = XLSX.utils.encode_cell({ r: item.rowNumber - 1, c: columnIndex });
            return [createIssue("formula_in_quantity_cell", "blocker", `A célula ${address} contém fórmula e não será sobrescrita.`, {
                rowNumber: item.rowNumber
            })];
        });
    });
}

export function analyzeWorkbookForExport(workbook) {
    const selection = findOperationalSheet(workbook);
    if (selection.status !== "found") {
        const message = selection.status === "ambiguous"
            ? "Mais de uma aba operacional compatível foi encontrada."
            : "Nenhuma aba operacional compatível foi encontrada.";
        return {
            status: selection.status,
            sheetName: "",
            groups: [],
            items: [],
            issues: [createIssue("operational_sheet_not_identified", "blocker", message)]
        };
    }

    const analysis = selection.candidate;
    const issues = [...analysis.issues];
    analysis.groups.forEach((group) => appendUniqueIssues(issues, validateGroupStructure(group)));
    const duplicateCodes = findDuplicateCodes(analysis.items);
    if (duplicateCodes.length) {
        issues.push(createIssue("duplicate_sheet_codes", "blocker", "A planilha possui códigos de item duplicados."));
    }
    appendUniqueIssues(issues, validateQuantityFormulas(analysis));
    return {
        status: "ready",
        sheetName: analysis.sheetName,
        worksheet: analysis.worksheet,
        range: analysis.range,
        groups: analysis.groups,
        items: analysis.items,
        duplicateCodes,
        issues
    };
}

export async function readWorkbookFromFile(file) {
    if (!file || typeof file.arrayBuffer !== "function") {
        throw new Error("Selecione uma planilha modelo .xlsx.");
    }
    if (!normalizeText(file.name).toLocaleLowerCase("pt-BR").endsWith(".xlsx")) {
        throw new Error("O arquivo selecionado precisa usar a extensão .xlsx.");
    }
    const contents = await file.arrayBuffer();
    if (!contents.byteLength) throw new Error("A planilha selecionada está vazia.");
    try {
        return XLSX.read(contents, { type: "array", cellDates: true, cellFormula: true, cellStyles: true });
    } catch {
        throw new Error("Não foi possível ler a planilha modelo selecionada.");
    }
}

function validateSnapshotItems(snapshot) {
    const issues = [];
    const items = Array.isArray(snapshot?.items) ? snapshot.items : [];
    const codes = items.map((item) => normalizeText(item?.itemCode));
    if (!items.length) issues.push(createIssue("snapshot_without_items", "blocker", "O fechamento não possui itens."));
    if (codes.some((code) => !code)) {
        issues.push(createIssue("snapshot_item_without_code", "blocker", "Há item sem código no fechamento."));
    }
    if (new Set(codes.filter(Boolean)).size !== codes.filter(Boolean).length) {
        issues.push(createIssue("duplicate_snapshot_codes", "blocker", "O fechamento possui códigos de item duplicados."));
    }
    return issues;
}

function validateSnapshotQuantities(snapshot) {
    const issues = [];
    for (const item of snapshot?.items || []) {
        const values = [...(item.areas || []), item.total].filter(Boolean);
        const hasPartial = [item.status, ...values.map((value) => value.status)].some((status) => (
            status === "partial" || status === "pending"
        ));
        const hasPendingCount = values.some((value) => Number(value.pendingEntryCount) > 0);
        if (hasPartial || hasPendingCount) {
            issues.push(createIssue("partial_or_pending_item", "blocker", `O item ${item.itemCode || "sem código"} possui valor parcial ou pendente.`, {
                itemCode: normalizeText(item.itemCode)
            }));
        }
    }
    return issues;
}

export function validateSnapshotForXlsxExport(snapshot) {
    const issues = [];
    if (!snapshot || typeof snapshot !== "object") {
        issues.push(createIssue("snapshot_missing", "blocker", "Abra um fechamento salvo antes de exportar."));
    } else {
        if (!snapshot.finalizedAt) issues.push(createIssue("snapshot_not_finalized", "blocker", "Finalize o fechamento antes de exportar XLSX."));
        if (snapshot.status === "invalid") issues.push(createIssue("snapshot_invalid", "blocker", "Um fechamento inválido não pode gerar XLSX."));
        if (snapshot.status === "partial") issues.push(createIssue("snapshot_partial", "blocker", "Um fechamento parcial não pode gerar XLSX."));
        if (snapshot.pendingEntries?.length) issues.push(createIssue("snapshot_has_pending", "blocker", "Resolva as pendências antes de exportar XLSX."));
        appendUniqueIssues(issues, validateSnapshotItems(snapshot));
        appendUniqueIssues(issues, validateSnapshotQuantities(snapshot));
    }
    const { blockers, warnings } = splitIssues(issues);
    return { isValid: blockers.length === 0, issues, blockers, warnings };
}

export function validateWorkbookForXlsxExport(workbookAnalysis) {
    const issues = [...(workbookAnalysis?.issues || [])];
    if (!workbookAnalysis || workbookAnalysis.status !== "ready") {
        appendUniqueIssues(issues, [createIssue(
            "workbook_not_ready",
            "blocker",
            "A estrutura mínima da planilha não foi validada."
        )]);
    }
    const { blockers, warnings } = splitIssues(issues);
    return { isValid: blockers.length === 0, issues, blockers, warnings };
}

function parseNumericQuantity(value) {
    const normalized = normalizeText(value).replace(",", ".");
    if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null;
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function hasQuantity(value) {
    return normalizeText(value) !== "";
}

function createCellOperation(sheetName, sheetItem, columnIndex, kind, value = null) {
    const address = XLSX.utils.encode_cell({ r: sheetItem.rowNumber - 1, c: columnIndex });
    return {
        action: value === null ? "clear" : "write",
        sheetName,
        address,
        rowNumber: sheetItem.rowNumber,
        columnIndex,
        kind,
        value
    };
}

function validateUnitConsistency(item, value, issues) {
    if (!hasQuantity(value?.convertedQuantityDecimal)) return;
    const itemUnit = normalizeComparableText(item.baseUnit);
    const valueUnit = normalizeComparableText(value.baseUnit || item.baseUnit);
    if (itemUnit && valueUnit === itemUnit) return;
    issues.push(createIssue(
        "base_unit_inconsistent",
        "blocker",
        `A unidade base do item ${item.itemCode} está ausente ou inconsistente.`,
        { itemCode: normalizeText(item.itemCode) }
    ));
}

function planAreaCells(snapshotItem, sheetItem, sheetName, issues) {
    const operations = [];
    const cellsByArea = new Map((snapshotItem.areas || []).map((cell) => [normalizeAreaName(cell.area), cell]));
    Object.entries(sheetItem.areaColumns).forEach(([area, columnIndex]) => {
        const snapshotCell = cellsByArea.get(area);
        const decimal = snapshotCell?.convertedQuantityDecimal;
        validateUnitConsistency(snapshotItem, snapshotCell, issues);
        if (!hasQuantity(decimal)) {
            operations.push(createCellOperation(sheetName, sheetItem, columnIndex, `area:${area}`));
            return;
        }
        const numericValue = parseNumericQuantity(decimal);
        if (numericValue === null) {
            issues.push(createIssue("invalid_numeric_value", "blocker", `O item ${snapshotItem.itemCode} possui quantidade inválida em ${area}.`, {
                itemCode: normalizeText(snapshotItem.itemCode)
            }));
            return;
        }
        operations.push(createCellOperation(sheetName, sheetItem, columnIndex, `area:${area}`, numericValue));
    });
    return { operations, cellsByArea };
}

function validateUnrepresentedAreas(snapshotItem, sheetItem, cellsByArea, issues) {
    cellsByArea.forEach((cell, area) => {
        if (Object.hasOwn(sheetItem.areaColumns, area) || !hasQuantity(cell.convertedQuantityDecimal)) return;
        issues.push(createIssue(
            "snapshot_area_without_column",
            "blocker",
            `O item ${snapshotItem.itemCode} possui valor em ${area}, mas o grupo não declara essa área.`,
            { itemCode: normalizeText(snapshotItem.itemCode), groupRowNumber: sheetItem.groupRowNumber }
        ));
    });
}

function validateTotalWithoutColumn(snapshotItem, sheetItem, cellsByArea, issues) {
    if (Number.isInteger(sheetItem.totalColumn)) return;
    const total = snapshotItem.total || {};
    if (!hasQuantity(total.convertedQuantityDecimal)) return;
    validateUnitConsistency(snapshotItem, total, issues);
    const representedAreas = Object.keys(sheetItem.areaColumns);
    if (representedAreas.length !== 1) return;
    const areaValue = cellsByArea.get(representedAreas[0])?.convertedQuantityDecimal;
    const numericAreaValue = parseNumericQuantity(areaValue);
    const numericTotal = parseNumericQuantity(total.convertedQuantityDecimal);
    if (numericAreaValue !== null && numericTotal !== null && numericAreaValue === numericTotal) return;
    issues.push(createIssue(
        "total_without_equivalent_area",
        "blocker",
        `O total do item ${snapshotItem.itemCode} não coincide com a única área representada.`,
        { itemCode: normalizeText(snapshotItem.itemCode), groupRowNumber: sheetItem.groupRowNumber }
    ));
}

function planTotalCell(snapshotItem, sheetItem, sheetName, issues) {
    if (!Number.isInteger(sheetItem.totalColumn)) return [];
    const total = snapshotItem.total || {};
    validateUnitConsistency(snapshotItem, total, issues);
    if (!hasQuantity(total.convertedQuantityDecimal)) {
        return [createCellOperation(sheetName, sheetItem, sheetItem.totalColumn, "total")];
    }
    const numericValue = parseNumericQuantity(total.convertedQuantityDecimal);
    if (numericValue === null) {
        issues.push(createIssue("invalid_total_value", "blocker", `O item ${snapshotItem.itemCode} possui TOTAL inválido.`, {
            itemCode: normalizeText(snapshotItem.itemCode)
        }));
        return [];
    }
    return [createCellOperation(sheetName, sheetItem, sheetItem.totalColumn, "total", numericValue)];
}

function hasExistingQuantity(worksheet, sheetItem) {
    const columns = [...Object.values(sheetItem.areaColumns), sheetItem.totalColumn].filter(Number.isInteger);
    return columns.some((columnIndex) => normalizeText(getCell(worksheet, sheetItem.rowNumber - 1, columnIndex)?.v));
}

function compareSnapshotIdentity(snapshotItem, sheetItem, issues) {
    if (normalizeComparableText(snapshotItem.itemNameSnapshot) !== normalizeComparableText(sheetItem.name)) {
        issues.push(createIssue("item_name_mismatch", "warning", `O nome do item ${snapshotItem.itemCode} difere da planilha.`, {
            itemCode: normalizeText(snapshotItem.itemCode), rowNumber: sheetItem.rowNumber
        }));
    }
    if (normalizeComparableText(snapshotItem.groupNameSnapshot) !== normalizeComparableText(sheetItem.groupName)) {
        issues.push(createIssue("group_name_mismatch", "warning", `O grupo do item ${snapshotItem.itemCode} difere da planilha.`, {
            itemCode: normalizeText(snapshotItem.itemCode), rowNumber: sheetItem.rowNumber
        }));
    }
}

function mapSnapshotItem(snapshotItem, sheetItem, sheetName, issues) {
    compareSnapshotIdentity(snapshotItem, sheetItem, issues);
    const areaPlan = planAreaCells(snapshotItem, sheetItem, sheetName, issues);
    validateUnrepresentedAreas(snapshotItem, sheetItem, areaPlan.cellsByArea, issues);
    validateTotalWithoutColumn(snapshotItem, sheetItem, areaPlan.cellsByArea, issues);
    const totalOperations = planTotalCell(snapshotItem, sheetItem, sheetName, issues);
    return [...areaPlan.operations, ...totalOperations];
}

function inspectUnmatchedSheetItems(workbookAnalysis, snapshotItemsByCode, issues) {
    let unmatchedCount = 0;
    workbookAnalysis.items.forEach((sheetItem) => {
        if (snapshotItemsByCode.has(sheetItem.code)) return;
        unmatchedCount += 1;
        const hasValue = hasExistingQuantity(workbookAnalysis.worksheet, sheetItem);
        issues.push(createIssue(
            hasValue ? "sheet_item_without_snapshot_value" : "sheet_item_without_snapshot",
            hasValue ? "blocker" : "warning",
            hasValue
                ? `A linha ${sheetItem.rowNumber} não existe no fechamento e contém quantidade.`
                : `A linha ${sheetItem.rowNumber} não existe no fechamento e permanecerá vazia.`,
            { rowNumber: sheetItem.rowNumber }
        ));
    });
    return unmatchedCount;
}

function summarizePlan(snapshot, workbookAnalysis, operations, issues, counts = {}) {
    const { blockers, warnings } = splitIssues(issues);
    return {
        snapshotId: normalizeText(snapshot?.id),
        sheetName: workbookAnalysis?.sheetName || "",
        canExport: blockers.length === 0,
        mappedItemCount: counts.mappedItemCount || 0,
        sheetItemWithoutSnapshotCount: counts.sheetItemWithoutSnapshotCount || 0,
        filledCellCount: operations.filter((operation) => operation.action === "write").length,
        emptyCellCount: operations.filter((operation) => operation.action === "clear").length,
        groupWithoutTotalCount: (workbookAnalysis?.groups || []).filter((group) => group.totalColumn === null).length,
        operations,
        issues,
        blockers,
        warnings
    };
}

export function buildXlsxExportPlan(snapshot, workbookAnalysis) {
    const snapshotValidation = validateSnapshotForXlsxExport(snapshot);
    const workbookValidation = validateWorkbookForXlsxExport(workbookAnalysis);
    const issues = [];
    appendUniqueIssues(issues, snapshotValidation.issues);
    appendUniqueIssues(issues, workbookValidation.issues);
    const operations = [];
    if (workbookAnalysis?.status !== "ready") {
        return summarizePlan(snapshot, workbookAnalysis, operations, issues);
    }
    let mappedItemCount = 0;
    const sheetItemsByCode = new Map((workbookAnalysis?.items || []).map((item) => [item.code, item]));
    const snapshotItemsByCode = new Map((snapshot?.items || []).map((item) => [normalizeText(item.itemCode), item]));

    snapshotItemsByCode.forEach((snapshotItem, itemCode) => {
        const sheetItem = sheetItemsByCode.get(itemCode);
        if (!sheetItem) {
            issues.push(createIssue("snapshot_item_without_sheet_row", "blocker", `O item ${itemCode} não possui linha na planilha.`, { itemCode }));
            return;
        }
        mappedItemCount += 1;
        operations.push(...mapSnapshotItem(snapshotItem, sheetItem, workbookAnalysis.sheetName, issues));
    });

    const sheetItemWithoutSnapshotCount = workbookAnalysis?.worksheet
        ? inspectUnmatchedSheetItems(workbookAnalysis, snapshotItemsByCode, issues)
        : 0;
    return summarizePlan(snapshot, workbookAnalysis, operations, issues, {
        mappedItemCount,
        sheetItemWithoutSnapshotCount
    });
}

function applyCellOperation(worksheet, operation) {
    const existingCell = worksheet[operation.address];
    if (operation.action === "clear") {
        if (!existingCell) return;
        const clearedCell = { ...existingCell, t: "z" };
        delete clearedCell.v;
        delete clearedCell.w;
        delete clearedCell.f;
        worksheet[operation.address] = clearedCell;
        return;
    }
    const filledCell = { ...(existingCell || {}), t: "n", v: operation.value };
    delete filledCell.w;
    delete filledCell.f;
    worksheet[operation.address] = filledCell;
}

export function applySnapshotToWorkbook(workbook, snapshot, plan) {
    if (!plan?.canExport) throw new Error("O plano possui bloqueios e não pode ser aplicado.");
    if (normalizeText(snapshot?.id) !== plan.snapshotId) throw new Error("O plano pertence a outro fechamento.");
    const worksheet = workbook?.Sheets?.[plan.sheetName];
    if (!worksheet) throw new Error("A aba operacional do plano não está disponível.");
    plan.operations.forEach((operation) => applyCellOperation(worksheet, operation));
    return workbook;
}

function slugify(value) {
    return removeDiacritics(normalizeText(value).toLocaleLowerCase("pt-BR"))
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "fechamento";
}

function formatTimestamp(value) {
    const date = new Date(value);
    const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const dateParts = [safeDate.getFullYear(), safeDate.getMonth() + 1, safeDate.getDate()]
        .map((part, index) => index ? String(part).padStart(2, "0") : String(part));
    return dateParts.join("-");
}

export function formatXlsxFilename(snapshot) {
    const label = slugify(snapshot?.label || snapshot?.templateNameSnapshot);
    return `fechamento-${label}-${formatTimestamp(snapshot?.finalizedAt || snapshot?.createdAt)}-piloto.xlsx`;
}

export function downloadWorkbook(workbook, filename) {
    if (!globalThis.document || !globalThis.Blob || !globalThis.URL?.createObjectURL) {
        throw new Error("Este navegador não oferece suporte ao download XLSX.");
    }
    const contents = XLSX.write(workbook, { bookType: "xlsx", type: "array", cellStyles: true });
    const url = URL.createObjectURL(new Blob([contents], { type: xlsxMimeType }));
    const link = document.createElement("a");
    try {
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
    } finally {
        globalThis.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    return filename;
}

export async function exportSnapshotToXlsx({ snapshot, file }) {
    const workbook = await readWorkbookFromFile(file);
    const workbookAnalysis = analyzeWorkbookForExport(workbook);
    const plan = buildXlsxExportPlan(snapshot, workbookAnalysis);
    if (!plan.canExport) return { status: "blocked", workbookAnalysis, plan };
    applySnapshotToWorkbook(workbook, snapshot, plan);
    const filename = formatXlsxFilename(snapshot);
    downloadWorkbook(workbook, filename);
    return { status: "downloaded", filename, workbookAnalysis, plan };
}
