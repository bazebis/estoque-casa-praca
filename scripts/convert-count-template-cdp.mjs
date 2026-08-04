import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, relative, resolve } from "node:path";
import XLSX from "xlsx";

const defaultInputPath = "data/imports/contagem-cdp.xlsx";
const defaultOutputPath = "data/generated/count-template-cdp.json";
const defaultReportDirectory = "codex_reports";
const templateId = "cdp-count-template-v1";
const templateName = "Contagem Casa da Praça";
const areaStartColumnIndex = 6;
const minimumExpectedItems = 200;
const maximumExpectedItems = 350;
const requiredAreas = ["BAR", "ESTOQUE", "COZINHA"];

const canonicalAreas = new Map([
    ["BAR", "BAR"],
    ["ESTOQUE", "ESTOQUE"],
    ["COZINHA", "COZINHA"],
    ["SALAO", "SALÃO"],
    ["EMPORIO", "EMPORIO"],
    ["GELADEIRA LATICINIOS", "GELADEIRA LATICÍNIOS"],
    ["TOTAL", "TOTAL"]
]);

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function removeDiacritics(value) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function slugify(value) {
    return removeDiacritics(normalizeText(value).toLowerCase())
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "sem-nome";
}

function canonicalizeArea(value) {
    const normalizedArea = normalizeText(value).toUpperCase();
    const lookupKey = removeDiacritics(normalizedArea);

    return canonicalAreas.get(lookupKey) || normalizedArea;
}

function readPrimarySheet(inputPath) {
    const workbook = XLSX.readFile(inputPath, { cellDates: true });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
        throw new Error("A planilha não possui abas legíveis.");
    }

    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, {
        header: 1,
        defval: "",
        raw: false,
        blankrows: true
    });

    return { sheetName, worksheet, rows };
}

function findUsefulBounds(rows) {
    let firstRow = null;
    let lastRow = null;
    let firstColumn = null;
    let lastColumn = null;

    rows.forEach((row, rowIndex) => {
        row.forEach((value, columnIndex) => {
            if (!normalizeText(value)) {
                return;
            }

            firstRow ??= rowIndex;
            lastRow = rowIndex;
            firstColumn = firstColumn === null ? columnIndex : Math.min(firstColumn, columnIndex);
            lastColumn = lastColumn === null ? columnIndex : Math.max(lastColumn, columnIndex);
        });
    });

    if (firstRow === null) {
        return null;
    }

    return { firstRow, lastRow, firstColumn, lastColumn };
}

function formatUsefulRange(bounds) {
    if (!bounds) {
        return "nenhum";
    }

    const start = XLSX.utils.encode_cell({ r: bounds.firstRow, c: bounds.firstColumn });
    const end = XLSX.utils.encode_cell({ r: bounds.lastRow, c: bounds.lastColumn });

    return `${start}:${end}`;
}

function getRowAreas(row) {
    return row
        .slice(areaStartColumnIndex)
        .map(canonicalizeArea)
        .filter(Boolean);
}

function createStableGroupId(name, usedGroupIds) {
    const baseId = `group-${slugify(name)}`;
    let groupId = baseId;
    let suffix = 2;

    while (usedGroupIds.has(groupId)) {
        groupId = `${baseId}-${suffix}`;
        suffix++;
    }

    usedGroupIds.add(groupId);
    return groupId;
}

function createGroup(row, rowNumber, order, usedGroupIds) {
    const name = normalizeText(row[1]);
    const areas = [...new Set(getRowAreas(row))];
    const countAreas = areas.filter((area) => area !== "TOTAL");

    return {
        id: createStableGroupId(name, usedGroupIds),
        name,
        order,
        countAreas,
        totalArea: areas.includes("TOTAL") ? "TOTAL" : null,
        items: [],
        sourceRow: rowNumber,
        detectedAreas: areas
    };
}

function createItem(row, rowNumber, group) {
    return {
        code: normalizeText(row[0]),
        name: normalizeText(row[1]),
        order: group.items.length + 1,
        groupId: group.id,
        countAreas: [...group.countAreas],
        sourceRow: rowNumber
    };
}

function parseGroups(rows) {
    const groups = [];
    const usedGroupIds = new Set();
    let currentGroup = null;

    rows.forEach((row, rowIndex) => {
        const rowNumber = rowIndex + 1;
        const name = normalizeText(row[1]);
        const areas = getRowAreas(row);

        if (name && areas.length > 0) {
            currentGroup = createGroup(row, rowNumber, groups.length + 1, usedGroupIds);
            groups.push(currentGroup);
            return;
        }

        const code = normalizeText(row[0]);

        if (currentGroup && (code || name)) {
            currentGroup.items.push(createItem(row, rowNumber, currentGroup));
        }
    });

    return groups;
}

function validateGroups(groups) {
    const warnings = [];
    const firstRowByCode = new Map();

    groups.forEach((group) => {
        if (group.items.length === 0) {
            warnings.push(`Linha ${group.sourceRow}: grupo "${group.name}" sem itens.`);
        }

        group.detectedAreas.forEach((area) => {
            if (![...canonicalAreas.values()].includes(area)) {
                warnings.push(`Linha ${group.sourceRow}: área desconhecida "${area}".`);
            }
        });

        group.items.forEach((item) => validateItem(item, group, firstRowByCode, warnings));
    });

    return warnings;
}

function validateItem(item, group, firstRowByCode, warnings) {
    if (!item.code) {
        warnings.push(`Linha ${item.sourceRow}: item sem código no grupo "${group.name}".`);
    }

    if (!item.name) {
        warnings.push(`Linha ${item.sourceRow}: item ${item.code || "sem código"} sem nome.`);
    }

    if (!item.code) {
        return;
    }

    if (firstRowByCode.has(item.code)) {
        warnings.push(
            `Linha ${item.sourceRow}: código duplicado ${item.code}; primeira ocorrência na linha ${firstRowByCode.get(item.code)}.`
        );
        return;
    }

    firstRowByCode.set(item.code, item.sourceRow);
}

function collectStats(groups) {
    const areas = [];

    groups.forEach((group) => {
        group.detectedAreas.forEach((area) => {
            if (!areas.includes(area)) {
                areas.push(area);
            }
        });
    });

    return {
        groupCount: groups.length,
        itemCount: groups.reduce((total, group) => total + group.items.length, 0),
        areas,
        itemsPerGroup: groups.map((group) => ({
            groupId: group.id,
            groupName: group.name,
            itemCount: group.items.length
        }))
    };
}

function assertRequiredStructure(stats) {
    if (stats.groupCount === 0) {
        throw new Error("Nenhum grupo foi encontrado na planilha.");
    }

    if (stats.itemCount < minimumExpectedItems || stats.itemCount > maximumExpectedItems) {
        throw new Error(
            `Foram detectados ${stats.itemCount} itens; o intervalo esperado é de ${minimumExpectedItems} a ${maximumExpectedItems}.`
        );
    }

    const missingAreas = requiredAreas.filter((area) => !stats.areas.includes(area));

    if (missingAreas.length > 0) {
        throw new Error(`Áreas obrigatórias não encontradas: ${missingAreas.join(", ")}.`);
    }
}

function removeInternalFields(groups) {
    return groups.map((group) => ({
        id: group.id,
        name: group.name,
        order: group.order,
        countAreas: group.countAreas,
        totalArea: group.totalArea,
        items: group.items.map((item) => ({
            code: item.code,
            name: item.name,
            order: item.order,
            groupId: item.groupId,
            countAreas: item.countAreas
        }))
    }));
}

async function getNextReportPath(reportDirectory) {
    await mkdir(reportDirectory, { recursive: true });
    const entries = await readdir(reportDirectory, { withFileTypes: true });
    const reportNumbers = entries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name.match(/^(\d+)-.*\.md$/)?.[1])
        .filter(Boolean)
        .map(Number);
    const nextNumber = Math.max(0, ...reportNumbers) + 1;
    const fileName = `${String(nextNumber).padStart(2, "0")}-count-template-cdp-analysis.md`;

    return resolve(reportDirectory, fileName);
}

function formatSample(group, maximumItems = 5) {
    if (!group) {
        return "Grupo correspondente não encontrado.";
    }

    const sampleLines = group.items
        .slice(0, maximumItems)
        .map((item) => `- ${item.code || "(sem código)"} — ${item.name || "(sem nome)"}`);

    return [`Grupo: **${group.name}**`, "", ...sampleLines].join("\n");
}

function findKitchenGroup(groups) {
    return groups.find((group) => group.countAreas.includes("COZINHA"));
}

function findStockSupportGroup(groups) {
    const namePattern = /estoque|limpeza|embalag|descart/i;

    return groups.find((group) => namePattern.test(removeDiacritics(group.name)))
        || groups.find((group) => group.countAreas.includes("ESTOQUE"));
}

function formatProblems(warnings, formattedRange, usefulRange) {
    const problems = warnings.length > 0
        ? warnings.map((warning) => `- ${warning}`)
        : ["- Nenhum problema de conteúdo foi encontrado pelas validações mínimas."];

    if (formattedRange !== usefulRange) {
        problems.push(`- A formatação alcança ${formattedRange}, mas os dados úteis terminam em ${usefulRange}; a sobra foi ignorada.`);
    }

    return problems.join("\n");
}

function buildSourceSection(context) {
    return `## Arquivo e aba

- Arquivo: \`${basename(context.inputPath)}\`
- Caminho: \`${relative(process.cwd(), context.inputPath)}\`
- Aba lida: \`${context.sheetName}\`
- Intervalo formatado da planilha: \`${context.formattedRange}\`
- Intervalo útil detectado: \`${context.usefulRange}\`
- Linhas úteis: ${context.usefulBounds.firstRow + 1} a ${context.usefulBounds.lastRow + 1}`;
}

function buildGroupsSection(context) {
    const groupLines = context.groups.map((group) => (
        `- ${group.order}. **${group.name}** — ${group.items.length} itens — áreas: ${group.detectedAreas.join(", ")}`
    ));

    return `## Grupos encontrados

${groupLines.join("\n")}`;
}

function buildSamplesSection(context) {
    const firstGroup = context.groups[0];
    const kitchenGroup = findKitchenGroup(context.groups);
    const stockSupportGroup = findStockSupportGroup(context.groups);

    return `## Amostra de 5 itens do primeiro grupo

${formatSample(firstGroup)}

## Amostra de 5 itens de um grupo de cozinha

${formatSample(kitchenGroup)}

## Amostra de 5 itens de estoque, limpeza ou embalagem

${formatSample(stockSupportGroup)}
`;
}

function buildRunInstructions() {
    return `## Como executar novamente

Com os caminhos padrão:

\`\`\`bash
npm run template:cdp
\`\`\`

Com entrada e saída diferentes:

\`\`\`bash
npm run template:cdp -- caminho/entrada.xlsx caminho/saida.json
\`\`\`

Cada execução cria o próximo relatório numerado disponível em \`codex_reports/\`.
`;
}

function buildReport(context) {
    const statistics = `## Estatísticas

- Total de grupos: **${context.stats.groupCount}**
- Total de itens: **${context.stats.itemCount}**
- Áreas encontradas: **${context.stats.areas.join(", ")}**`;
    const problems = `## Possíveis problemas encontrados

${formatProblems(context.warnings, context.formattedRange, context.usefulRange)}`;
    const recommendation = `## Recomendação técnica para a próxima etapa

Validar este JSON com uma pessoa responsável pela contagem antes de integrá-lo ao app. Depois da validação, criar um adapter separado que transforme grupos e áreas confirmados em candidatos a \`locationNodes\` e \`itemLocationLinks\`, com preview e confirmação. O template ainda não deve alterar catálogo, unidades, IndexedDB ou sessões atuais.
`;

    return [
        "# Análise do template oficial de contagem CDP",
        buildSourceSection(context),
        buildGroupsSection(context),
        statistics,
        problems,
        buildSamplesSection(context),
        buildRunInstructions(),
        recommendation
    ].join("\n\n");
}

function buildTemplate(context) {
    return {
        id: templateId,
        name: templateName,
        sourceFile: basename(context.inputPath),
        generatedAt: context.generatedAt,
        sheetName: context.sheetName,
        groups: removeInternalFields(context.groups),
        stats: context.stats,
        validation: {
            warningCount: context.warnings.length,
            warnings: context.warnings
        }
    };
}

async function writeOutputs(context, outputPath, reportPath) {
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(buildTemplate(context), null, 2)}\n`, "utf8");
    await writeFile(reportPath, buildReport(context), "utf8");
}

async function main() {
    const [inputArgument = defaultInputPath, outputArgument = defaultOutputPath] = process.argv.slice(2);
    const inputPath = resolve(inputArgument);
    const outputPath = resolve(outputArgument);
    const reportPath = await getNextReportPath(resolve(defaultReportDirectory));
    const { sheetName, worksheet, rows } = readPrimarySheet(inputPath);
    const usefulBounds = findUsefulBounds(rows);

    if (!usefulBounds) {
        throw new Error("A planilha não possui células úteis.");
    }

    const groups = parseGroups(rows);
    const warnings = validateGroups(groups);
    const stats = collectStats(groups);
    assertRequiredStructure(stats);

    const context = {
        inputPath,
        sheetName,
        groups,
        warnings,
        stats,
        generatedAt: new Date().toISOString(),
        formattedRange: worksheet["!ref"] || "não informado",
        usefulBounds,
        usefulRange: formatUsefulRange(usefulBounds)
    };

    await writeOutputs(context, outputPath, reportPath);
    console.log(`Template gerado: ${relative(process.cwd(), outputPath)}`);
    console.log(`Relatório gerado: ${relative(process.cwd(), reportPath)}`);
    console.log(`Aba: ${sheetName}`);
    console.log(`Grupos: ${stats.groupCount}`);
    console.log(`Itens: ${stats.itemCount}`);
    console.log(`Áreas: ${stats.areas.join(", ")}`);
    console.log(`Avisos: ${warnings.length}`);
}

main().catch((error) => {
    console.error(`Falha ao converter a planilha: ${error.message}`);
    process.exitCode = 1;
});
