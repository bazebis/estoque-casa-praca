import { getUnitById, isKnownUnitInput, normalizeUnitId } from "./units.js";

const nameHeaders = new Set(["nome", "name", "item", "produto", "product"]);
const unitHeaders = new Set(["unidade", "unit", "medida"]);

function normalizeHeader(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");
}

function normalizeName(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function detectSeparator(headerLine) {
    const commaCount = (headerLine.match(/,/g) || []).length;
    const semicolonCount = (headerLine.match(/;/g) || []).length;

    return semicolonCount > commaCount ? ";" : ",";
}

function parseCsvLine(line, separator) {
    const values = [];
    let currentValue = "";
    let isQuoted = false;

    for (let index = 0; index < line.length; index++) {
        const character = line[index];
        const nextCharacter = line[index + 1];

        if (character === "\"" && isQuoted && nextCharacter === "\"") {
            currentValue += "\"";
            index++;
            continue;
        }

        if (character === "\"") {
            isQuoted = !isQuoted;
            continue;
        }

        if (character === separator && !isQuoted) {
            values.push(currentValue.trim());
            currentValue = "";
            continue;
        }

        currentValue += character;
    }

    values.push(currentValue.trim());
    return values;
}

function findColumnIndex(headers, acceptedHeaders) {
    return headers.findIndex((header) => acceptedHeaders.has(normalizeHeader(header)));
}

function createWarning(row, message) {
    return { row, message };
}

function parseRows(lines, separator, nameIndex, unitIndex, existingItems) {
    const existingNames = new Set(existingItems.map((item) => normalizeName(item.name)));
    const importedNames = new Set();
    const items = [];
    const warnings = [];
    let ignoredCount = 0;

    lines.forEach((line, index) => {
        if (!line.trim()) {
            return;
        }

        const row = index + 2;
        const columns = parseCsvLine(line, separator);
        const name = String(columns[nameIndex] || "").trim();
        const rawUnit = String(columns[unitIndex] || "").trim();

        if (!name) {
            ignoredCount++;
            warnings.push(createWarning(row, "linha sem nome ignorada"));
            return;
        }

        const normalizedUnitId = normalizeUnitId(rawUnit);
        const wasUnitRecognized = isKnownUnitInput(rawUnit);
        const normalizedName = normalizeName(name);
        const duplicateWithCatalog = existingNames.has(normalizedName);
        const duplicateInFile = importedNames.has(normalizedName);

        if (!wasUnitRecognized) {
            warnings.push(createWarning(row, `unidade "${rawUnit || "(vazia)"}" não reconhecida`));
        }

        if (duplicateInFile) {
            warnings.push(createWarning(row, `nome duplicado no arquivo: ${name}`));
        } else if (duplicateWithCatalog) {
            warnings.push(createWarning(row, `nome já existe no catálogo: ${name}`));
        }

        importedNames.add(normalizedName);
        items.push({
            name,
            rawUnit,
            unitId: normalizedUnitId,
            unitLabel: getUnitById(normalizedUnitId).label,
            wasUnitRecognized,
            duplicateWithCatalog,
            duplicateInFile
        });
    });

    return { items, warnings, ignoredCount };
}

export function parseCatalogCsv(csvText, existingItems = []) {
    const normalizedText = String(csvText || "").replace(/^\uFEFF/, "");
    const lines = normalizedText.split(/\r?\n/);
    const headerLine = lines.find((line) => line.trim());

    if (!headerLine) {
        return {
            items: [],
            warnings: [createWarning(1, "arquivo vazio")],
            ignoredCount: 0,
            error: "Arquivo CSV vazio."
        };
    }

    const separator = detectSeparator(headerLine);
    const headers = parseCsvLine(headerLine, separator);
    const nameIndex = findColumnIndex(headers, nameHeaders);
    const unitIndex = findColumnIndex(headers, unitHeaders);

    if (nameIndex === -1 || unitIndex === -1) {
        return {
            items: [],
            warnings: [],
            ignoredCount: 0,
            error: "O CSV precisa ter cabeçalho com colunas de nome e unidade."
        };
    }

    const dataStartIndex = lines.indexOf(headerLine) + 1;
    const dataLines = lines.slice(dataStartIndex);
    const parsedRows = parseRows(dataLines, separator, nameIndex, unitIndex, existingItems);

    return {
        separator,
        validCount: parsedRows.items.length,
        ...parsedRows
    };
}
