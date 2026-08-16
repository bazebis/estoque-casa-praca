import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { buildCountConsolidation } from "../src/countConsolidation.js";
import { buildOperationalHierarchy } from "../src/physicalHierarchyReadModel.js";
import { renderPhysicalHierarchyNavigation } from "../src/physicalHierarchyUi.js";
import { summarizeConvertedEntries } from "../src/unitConversion.js";

const timestamp = "2026-08-14T12:00:00.000Z";
const templateId = "phase3d-template";
const template = {
    id: templateId,
    name: "Template Fase 3D",
    groups: [{
        id: "group-1",
        name: "Grupo",
        countAreas: ["BAR"],
        items: [{ code: "ITEM-1", name: "Item principal", countAreas: ["BAR"] }]
    }]
};
const unitProfile = {
    templateId,
    itemCode: "ITEM-1",
    baseUnit: "un",
    defaultInputUnit: "un",
    allowedUnits: [{
        label: "un",
        normalizedUnit: "un",
        factorToBase: "1",
        requiresReview: false,
        legacyLabels: []
    }],
    source: "manual",
    confidence: "high",
    needsReview: false
};

function readSource(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function fileSha256(relativePath) {
    return crypto.createHash("sha256").update(readSource(relativePath)).digest("hex");
}

function createSession(id, locationId, reportAreaSnapshot) {
    return {
        id,
        templateId,
        locationId,
        reportAreaSnapshot,
        status: "draft",
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function createEntry(id, session, itemCode, rawUnit = "un") {
    return {
        id,
        sessionId: session.id,
        templateId,
        locationId: session.locationId,
        itemCode,
        itemNameSnapshot: itemCode === "ITEM-1" ? "Item principal" : "Item ausente",
        groupNameSnapshot: "Grupo",
        reportAreaSnapshot: session.reportAreaSnapshot,
        quantityDecimal: "1",
        rawQuantityText: "1",
        rawUnit,
        normalizedUnit: rawUnit,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function buildPendingReport() {
    const missingAreaSession = createSession("session-missing-area", "location-missing-area", "");
    const outsideAreaSession = createSession("session-outside-area", "location-outside-area", "TESTE");
    const missingItemSession = createSession("session-missing-item", "location-missing-item", "BAR");
    const conversionSession = createSession("session-conversion", "location-conversion", "BAR");
    const sessions = [missingAreaSession, outsideAreaSession, missingItemSession, conversionSession];
    const entries = [
        createEntry("entry-missing-area", missingAreaSession, "ITEM-1"),
        createEntry("entry-outside-area", outsideAreaSession, "ITEM-1"),
        createEntry("entry-missing-item", missingItemSession, "ITEM-UNKNOWN"),
        createEntry("entry-conversion", conversionSession, "ITEM-1", "balde")
    ];
    return buildCountConsolidation({ template, sessions, entries, unitSettings: [unitProfile] });
}

function createDomFixture() {
    const elementIds = [
        "pilot-active-template",
        "btn-back-physical-hierarchy",
        "physical-hierarchy-breadcrumb",
        "pilot-area-title",
        "pilot-area-guidance",
        "pilot-area-list",
        "physical-hierarchy-direct-items",
        "physical-hierarchy-direct-count",
        "btn-count-physical-location"
    ];
    return new Map(elementIds.map((id) => [id, {
        hidden: false,
        textContent: "",
        innerHTML: "",
        dataset: {}
    }]));
}

const indexSource = readSource("index.html");
const mainSource = readSource("src/main.js");
const quickPilotUiSource = readSource("src/quickPilotUi.js");
const hierarchyUiSource = readSource("src/physicalHierarchyUi.js");
const liveConsolidationUiSource = readSource("src/countConsolidationUi.js");
const snapshotUiSource = readSource("src/consolidationSnapshotsUi.js");
const homeStart = indexSource.indexOf('<main id="pilot-dashboard"');
const homeEnd = indexSource.indexOf("</main>", homeStart);
const homeMarkup = indexSource.slice(homeStart, homeEnd);
let executedTestCount = 0;

function runTest(name, test) {
    test();
    executedTestCount += 1;
    console.log(`OK ${executedTestCount} ${name}`);
}

runTest("home não contém os cards administrativos removidos", () => {
    assert.doesNotMatch(homeMarkup, /pilot-status-summary|pilot-status-(?:template|areas|links|whatsapp)/);
    assert.doesNotMatch(homeMarkup, /Áreas macro configuradas|Vínculos por área|WhatsApp de envio/);
});

runTest("marca Fase piloto foi removida somente da home operacional", () => {
    assert.doesNotMatch(homeMarkup, /Fase piloto/);
});

runTest("template ativo possui representação compacta", () => {
    assert.match(homeMarkup, /id="pilot-active-template"/);
    assert.match(hierarchyUiSource, /Template ativo: \$\{view\.templateName\}/);
    assert.match(mainSource, /templateName: context\.selectedTemplate\?\.name \|\| ""/);
});

runTest("renderer mostra o nome do template ativo", () => {
    const elements = createDomFixture();
    const originalDocument = globalThis.document;
    globalThis.document = { getElementById: (id) => elements.get(id) };
    try {
        const hierarchy = buildOperationalHierarchy({ templateId, nodes: [], links: [], sessions: [] });
        renderPhysicalHierarchyNavigation({ hierarchy, templateName: template.name });
        assert.equal(elements.get("pilot-active-template").hidden, false);
        assert.equal(elements.get("pilot-active-template").textContent, `Template ativo: ${template.name}`);
    } finally {
        globalThis.document = originalDocument;
    }
});

runTest("renderer oculta identidade quando não existe template", () => {
    const elements = createDomFixture();
    const originalDocument = globalThis.document;
    globalThis.document = { getElementById: (id) => elements.get(id) };
    try {
        renderPhysicalHierarchyNavigation({ hierarchy: buildOperationalHierarchy() });
        assert.equal(elements.get("pilot-active-template").hidden, true);
        assert.equal(elements.get("pilot-active-template").textContent, "");
    } finally {
        globalThis.document = originalDocument;
    }
});

runTest("navegação e ações operacionais permanecem na home", () => {
    assert.match(homeMarkup, /id="pilot-area-list"/);
    assert.match(homeMarkup, /id="btn-open-count-consolidation"/);
    assert.match(homeMarkup, /id="btn-open-consolidation-snapshots"/);
    assert.match(homeMarkup, /id="btn-config"/);
});

runTest("refresh da home não carrega status administrativo", () => {
    const refreshSource = mainSource.slice(
        mainSource.indexOf("async function refreshPilotDashboard"),
        mainSource.indexOf("async function loadCountConsolidationContext")
    );
    assert.doesNotMatch(refreshSource, /buildQuickPilotPlan|loadWhatsappSettings|renderPilotDashboardStatus/);
    assert.match(refreshSource, /renderPhysicalHierarchyNavigation/);
});

runTest("Quick Pilot permanece funcional no Admin", () => {
    assert.match(indexSource, /data-admin-target="quick-pilot"/);
    assert.match(indexSource, /id="admin-section-quick-pilot"/);
    assert.match(quickPilotUiSource, /export function renderQuickPilot/);
    assert.match(mainSource, /connectQuickPilotEvents\(\{/);
});

runTest("retornos operacionais usam Voltar para locais", () => {
    assert.match(indexSource, /id="btn-close-count-consolidation">Voltar para locais</);
    assert.match(indexSource, /id="btn-close-consolidation-snapshots">Voltar para locais</);
    assert.doesNotMatch(indexSource, /Voltar para áreas/);
});

runTest("Sobre descreve locais físicos e áreas de relatório", () => {
    assert.match(indexSource, /contagem por locais físicos hierárquicos/);
    assert.match(indexSource, /contagem por local[\s\S]*áreas de relatório/);
    assert.doesNotMatch(indexSource, /contagem simples por áreas macro|A contagem por área aceita/);
});

runTest("usos legítimos de área de relatório permanecem", () => {
    assert.match(indexSource, /totais convertidos por área/i);
    assert.match(indexSource, /Áreas reais:/);
    assert.match(indexSource, /Área de relatório/);
    assert.match(indexSource, /Piloto rápido pode criar áreas macro/);
});

runTest("consolidação viva usa badge agregado neutro", () => {
    assert.match(liveConsolidationUiSource, /pending: "Pendente"/);
    assert.doesNotMatch(liveConsolidationUiSource, /Pendente sem conversão/);
});

runTest("snapshot usa badge agregado neutro", () => {
    assert.match(snapshotUiSource, /pending: "Pendente"/);
    assert.doesNotMatch(snapshotUiSource, /Pendente sem conversão/);
});

runTest("tipos e motivos detalhados de pendência permanecem", () => {
    const pendingEntries = buildPendingReport().pendingEntries;
    assert.deepEqual(new Set(pendingEntries.map((pending) => pending.type)), new Set([
        "missing_area",
        "outside_area",
        "missing_item",
        "conversion"
    ]));
    assert.match(pendingEntries.find((pending) => pending.type === "missing_area").reason, /sem área de relatório/i);
    assert.match(pendingEntries.find((pending) => pending.type === "outside_area").reason, /excluída do TOTAL/);
    assert.match(pendingEntries.find((pending) => pending.type === "missing_item").reason, /não existe no template/);
    assert.ok(pendingEntries.find((pending) => pending.type === "conversion").reason);
});

runTest("outside_area continua excluída do TOTAL", () => {
    const report = buildPendingReport();
    const item = report.items.find((candidate) => candidate.code === "ITEM-1");
    assert.equal(item.total.conversion.convertibleEntryCount, 0);
    assert.equal(item.total.status, "pending");
});

runTest("finalização global 4D preserva lifecycle, consolidação e Backup Schema 2", () => {
    const protectedHashes = {
        "src/storage.js": "8eef28af1967cae5fbd0630356dcb8ccc1706c50a3e99b2ba60ebb2e7b029658",
        "src/db.js": "0d1c7557133d8940d2234a25c12931d34c5f4c87a27dfa5d0a2afbd81a681106",
        "src/locationCountSessions.js": "c3472ac9294cc475ab98a69223e1bac4686fcf12b5c603f44d4d685e9133b059",
        "src/locationCountEntries.js": "73e8420ca6d30990ce0f72b1095d7b245f6d6ca54b8b93d0db18bef092c1a678",
        "src/consolidationSnapshots.js": "f067f20db0afe1841a0012e57537f1aa6a4ef26d3d7a00cb0211adc8b6a3cee6",
        "src/countConsolidation.js": "effa0ab0bcefaec79fff1967416059d9e3a22fbec1d0169dffa328bad2e6c8ab",
        "src/backup.js": "9e42e9758f98b612d176e15c37e177dbecc4125c8b9f4e1ca3f88cce63ef8652"
    };
    Object.entries(protectedHashes).forEach(([path, expectedHash]) => {
        assert.equal(fileSha256(path), expectedHash, path);
    });
    assert.match(readSource("src/storage.js"), /assertLinkedSessionMutationAllowed/);
    assert.match(readSource("src/storage.js"), /finalizeCountRound/);
    assert.match(readSource("src/db.js"), /mutateCountRoundLocationSession/);
    assert.match(readSource("src/db.js"), /finalizeCountRoundAtomically/);
    assert.match(readSource("src/locationCountSessions.js"), /status: "draft"/);
    assert.match(readSource("src/locationCountEntries.js"), /createLocationCountCompletionZeroEntryModel/);
});

runTest("Miolo preserva 2 un + 500 ml + 1 l = 7.5 l", () => {
    const mioloProfile = {
        ...unitProfile,
        itemCode: "301910024",
        baseUnit: "l",
        defaultInputUnit: "un",
        allowedUnits: [
            { label: "un", normalizedUnit: "un", factorToBase: "3", requiresReview: false, legacyLabels: [] },
            { label: "l", normalizedUnit: "l", factorToBase: "1", requiresReview: false, legacyLabels: [] },
            { label: "ml", normalizedUnit: "ml", factorToBase: "0.001", requiresReview: false, legacyLabels: [] }
        ]
    };
    const entries = [
        { active: true, quantityDecimal: "2", rawUnit: "un" },
        { active: true, quantityDecimal: "500", rawUnit: "ml" },
        { active: true, quantityDecimal: "1", rawUnit: "l" }
    ];
    assert.equal(summarizeConvertedEntries(entries, mioloProfile).totalConvertedDecimal, "7.5");
});

console.log(`PHASE3D_CONSOLIDATION_VALIDATION_OK ${executedTestCount} casos`);
