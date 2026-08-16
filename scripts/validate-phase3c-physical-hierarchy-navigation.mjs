import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createLocationCountSessionDraftModel } from "../src/locationCountSessions.js";
import {
    buildOperationalHierarchy,
    getOperationalChildren,
    getOperationalNode,
    getOperationalRoots
} from "../src/physicalHierarchyReadModel.js";
import {
    buildPhysicalHierarchyNavigationView,
    getCountingReturnNodeId,
    resolvePhysicalHierarchyCountingMode,
    resolvePhysicalHierarchyNodeAction
} from "../src/physicalHierarchyUi.js";

const timestamp = "2026-08-14T12:00:00.000Z";
const templateId = "phase3c-template";
const template = {
    id: templateId,
    name: "Template Fase 3C",
    groups: [{
        id: "group-1",
        name: "Grupo",
        items: ["A", "B", "C"].map((code, index) => ({ code, name: `Item ${code}`, order: index + 1 }))
    }]
};

function createNode(id, name, overrides = {}) {
    return {
        id,
        name,
        type: overrides.type || "room",
        parentId: overrides.parentId ?? null,
        reportArea: "COZINHA",
        order: overrides.order ?? 0,
        active: overrides.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function createLink(id, locationId, itemCode, overrides = {}) {
    return {
        id,
        templateId: overrides.templateId || templateId,
        itemCode,
        itemNameSnapshot: `Item ${itemCode}`,
        groupId: "group-1",
        groupNameSnapshot: "Grupo",
        locationId,
        locationPathSnapshot: [],
        reportArea: "COZINHA",
        order: overrides.order ?? 0,
        active: overrides.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function createSession(id, locationId, status, updatedAt = timestamp) {
    return {
        id,
        templateId,
        templateNameSnapshot: template.name,
        locationId,
        locationPathSnapshot: ["Cozinha"],
        reportAreaSnapshot: "COZINHA",
        status,
        plannedItems: [],
        plannedItemCount: 0,
        activeLinkCountSnapshot: 0,
        createdAt: timestamp,
        updatedAt,
        startedAt: status === "in_progress" ? timestamp : null,
        finishedAt: status === "completed" ? timestamp : null,
        canceledAt: status === "canceled" ? timestamp : null,
        notes: ""
    };
}

function buildHierarchy({ nodes = [], links = [], sessions = [] } = {}) {
    return buildOperationalHierarchy({ nodes, links, sessions, templateId });
}

function readSource(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

function fileSha256(relativePath) {
    return crypto.createHash("sha256").update(readSource(relativePath)).digest("hex");
}

const mainSource = readSource("src/main.js");
const areaCountingUiSource = readSource("src/areaCountingUi.js");
const hierarchyUiSource = readSource("src/physicalHierarchyUi.js");
const indexSource = readSource("index.html");
let executedTestCount = 0;

function runTest(name, test) {
    test();
    executedTestCount += 1;
    console.log(`OK ${executedTestCount} ${name}`);
}

runTest("UI operacional importa e usa o physicalHierarchyReadModel", () => {
    assert.match(mainSource, /buildOperationalHierarchy/);
    assert.match(mainSource, /connectPhysicalHierarchyEvents/);
    assert.match(hierarchyUiSource, /getOperationalRoots/);
    assert.match(hierarchyUiSource, /getOperationalNode/);
});

runTest("dashboard deriva roots da árvore persistida", () => {
    assert.match(mainSource, /listLocationNodes\(\)/);
    assert.match(mainSource, /renderPhysicalHierarchyNavigation\(\{/);
    assert.match(mainSource, /hierarchy: context\.hierarchy/);
});

runTest("Quick Pilot não é autoridade da navegação", () => {
    const refreshBody = mainSource.slice(
        mainSource.indexOf("async function refreshPilotDashboard"),
        mainSource.indexOf("async function loadCountConsolidationContext")
    );
    assert.doesNotMatch(refreshBody, /buildAreaCountingOverview|plan\.areas/);
    assert.match(refreshBody, /renderPhysicalHierarchyNavigation/);
});

runTest("root folha com itens possui ação direta de contagem", () => {
    const hierarchy = buildHierarchy({
        nodes: [createNode("root", "Cozinha")],
        links: [createLink("root-link", "root", "A")]
    });
    assert.equal(resolvePhysicalHierarchyNodeAction(getOperationalRoots(hierarchy)[0]), "count");
    assert.equal(resolvePhysicalHierarchyCountingMode(getOperationalRoots(hierarchy)[0]), "start");
    assert.match(mainSource, /createLocationCountSessionDraft\(\{/);
});

runTest("root com filhos abre detalhe", () => {
    const hierarchy = buildHierarchy({
        nodes: [createNode("root", "Cozinha"), createNode("child", "Geladeira", { parentId: "root" })]
    });
    assert.equal(resolvePhysicalHierarchyNodeAction(getOperationalNode(hierarchy, "root")), "navigate");
});

runTest("node com filhos e itens diretos expõe ambos", () => {
    const hierarchy = buildHierarchy({
        nodes: [createNode("root", "Cozinha"), createNode("child", "Geladeira", { parentId: "root" })],
        links: [createLink("root-link", "root", "A")]
    });
    const view = buildPhysicalHierarchyNavigationView({ hierarchy, selectedNodeId: "root" });
    assert.equal(view.selectedNode.directLinkCount, 1);
    assert.deepEqual(view.listedNodes.map((node) => node.id), ["child"]);
});

runTest("child com filhos permite drill-down", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" }),
        createNode("grandchild", "Porta", { parentId: "child" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(resolvePhysicalHierarchyNodeAction(getOperationalNode(hierarchy, "child")), "navigate");
});

runTest("child folha com itens abre contagem", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Freezer", { parentId: "root" })];
    const hierarchy = buildHierarchy({ nodes, links: [createLink("child-link", "child", "A")] });
    assert.equal(resolvePhysicalHierarchyNodeAction(getOperationalNode(hierarchy, "child")), "count");
});

runTest("node vazio não oferece criação de sessão", () => {
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")] });
    assert.equal(resolvePhysicalHierarchyNodeAction(getOperationalNode(hierarchy, "root")), "empty");
    assert.match(hierarchyUiSource, /action === "empty" \? "disabled"/);
});

runTest("breadcrumb usa o path vivo completo", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" }),
        createNode("grandchild", "Porta", { parentId: "child" })
    ];
    const view = buildPhysicalHierarchyNavigationView({
        hierarchy: buildHierarchy({ nodes }),
        selectedNodeId: "grandchild"
    });
    assert.equal(view.breadcrumb, "Cozinha / Geladeira / Porta");
});

runTest("Voltar de child aponta para o parent", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Geladeira", { parentId: "root" })];
    const view = buildPhysicalHierarchyNavigationView({ hierarchy: buildHierarchy({ nodes }), selectedNodeId: "child" });
    assert.equal(view.backNodeId, "root");
});

runTest("Voltar de root detail aponta para dashboard", () => {
    const view = buildPhysicalHierarchyNavigationView({
        hierarchy: buildHierarchy({ nodes: [createNode("root", "Cozinha")] }),
        selectedNodeId: "root"
    });
    assert.equal(view.backNodeId, null);
});

runTest("contagem aberta no dashboard retorna ao dashboard", () => {
    const view = buildPhysicalHierarchyNavigationView({
        hierarchy: buildHierarchy({ nodes: [createNode("root", "Cozinha")] })
    });
    assert.equal(getCountingReturnNodeId(view), null);
    assert.match(mainSource, /activeAreaReturnNodeId = returnNode\?\.id \|\| null/);
});

runTest("contagem aberta dentro de parent retorna ao parent", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Geladeira", { parentId: "root" })];
    const view = buildPhysicalHierarchyNavigationView({ hierarchy: buildHierarchy({ nodes }), selectedNodeId: "root" });
    assert.equal(getCountingReturnNodeId(view), "root");
    assert.match(mainSource, /activeHierarchyNodeId = returnNodeId/);
});

runTest("contagem direta de node com filhos retorna ao próprio node", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Geladeira", { parentId: "root" })];
    const links = [createLink("root-link", "root", "A")];
    const view = buildPhysicalHierarchyNavigationView({ hierarchy: buildHierarchy({ nodes, links }), selectedNodeId: "root" });
    assert.equal(view.selectedNode.hasChildren && view.selectedNode.hasDirectItems, true);
    assert.equal(getCountingReturnNodeId(view), "root");
});

runTest("sessão aberta do node exato é retomada", () => {
    const sessions = [createSession("draft", "root", "draft")];
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")], sessions });
    assert.equal(getOperationalNode(hierarchy, "root").openSession.id, "draft");
});

runTest("leaf com sessão aberta e zero vínculos continua retomável", () => {
    const hierarchy = buildHierarchy({
        nodes: [createNode("root", "Cozinha")],
        sessions: [createSession("draft", "root", "draft")]
    });
    const node = getOperationalNode(hierarchy, "root");
    assert.equal(node.hasDirectItems, false);
    assert.equal(resolvePhysicalHierarchyCountingMode(node), "resume");
    assert.equal(resolvePhysicalHierarchyNodeAction(node), "count");
});

runTest("node com filhos e sessão aberta expõe retomada no detalhe", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" })
    ];
    const hierarchy = buildHierarchy({ nodes, sessions: [createSession("draft", "root", "draft")] });
    const node = getOperationalNode(hierarchy, "root");
    const view = buildPhysicalHierarchyNavigationView({ hierarchy, selectedNodeId: "root" });
    assert.equal(node.hasDirectItems, false);
    assert.equal(resolvePhysicalHierarchyNodeAction(node), "navigate");
    assert.equal(resolvePhysicalHierarchyCountingMode(view.selectedNode), "resume");
    assert.match(hierarchyUiSource, /button\.hidden = countingMode === "blocked"/);
});

runTest("openLocationCounting usa a relação congelada da round antes de abrir a sessão", () => {
    const functionBody = mainSource.slice(
        mainSource.indexOf("async function openLocationCounting"),
        mainSource.indexOf("async function isCountingSessionLocationOperational")
    );
    assert.match(functionBody, /const roundLocation = context\.roundViewModel\.locations\.find/);
    assert.match(functionBody, /resolvePhysicalHierarchyCountingMode\(node, \{/);
    assert.match(functionBody, /if \(countingMode === "blocked"\)/);
    assert.match(functionBody, /openOrCreateCountRoundLocationSession\(\{/);
    assert.doesNotMatch(functionBody, /if \(!node\.hasDirectItems\)/);
});

runTest("node sem sessão e sem vínculos permanece bloqueado", () => {
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")] });
    const node = getOperationalNode(hierarchy, "root");
    assert.equal(resolvePhysicalHierarchyCountingMode(node), "blocked");
    assert.equal(resolvePhysicalHierarchyNodeAction(node), "empty");
});

runTest("nova sessão continua exigindo vínculos diretos", () => {
    const emptyHierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")] });
    const linkedHierarchy = buildHierarchy({
        nodes: [createNode("root", "Cozinha")],
        links: [createLink("root-link", "root", "A")]
    });
    assert.equal(resolvePhysicalHierarchyCountingMode(getOperationalNode(emptyHierarchy, "root")), "blocked");
    assert.equal(resolvePhysicalHierarchyCountingMode(getOperationalNode(linkedHierarchy, "root")), "start");
});

runTest("retomada legada preserva plannedItems e a jornada 4C usa o plano da round", () => {
    const session = createSession("draft", "root", "draft");
    session.plannedItems = [{
        itemCode: "A",
        itemNameSnapshot: "Item A",
        groupId: "group-1",
        groupNameSnapshot: "Grupo",
        linkId: "old-link",
        locationId: "root",
        locationPathSnapshot: ["Cozinha"],
        reportArea: "COZINHA",
        order: 1,
        active: true
    }];
    session.plannedItemCount = 1;
    session.activeLinkCountSnapshot = 1;
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")], sessions: [session] });
    const node = getOperationalNode(hierarchy, "root");
    assert.equal(node.directLinkCount, 0);
    assert.deepEqual(node.openSession.plannedItems.map((item) => item.linkId), ["old-link"]);
    assert.equal(resolvePhysicalHierarchyCountingMode(node), "resume");
    assert.match(mainSource, /openOrCreateCountRoundLocationSession/);
    assert.doesNotMatch(mainSource, /openOrCreateCountRoundLocationSession[\s\S]{0,300}itemLocationLinks/);
});

runTest("sessão de outro node não é retomada", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Geladeira", { parentId: "root" })];
    const hierarchy = buildHierarchy({ nodes, sessions: [createSession("child-session", "child", "draft")] });
    assert.equal(getOperationalNode(hierarchy, "root").openSession, null);
});

runTest("completed e canceled não são retomadas", () => {
    const sessions = [
        createSession("completed", "root", "completed"),
        createSession("canceled", "root", "canceled")
    ];
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")], sessions });
    assert.equal(getOperationalNode(hierarchy, "root").openSession, null);
});

runTest("criação de sessão usa somente direct links", () => {
    const root = createNode("root", "Cozinha");
    const child = createNode("child", "Geladeira", { parentId: "root" });
    const links = [createLink("root-link", "root", "A"), createLink("child-link", "child", "B")];
    const session = createLocationCountSessionDraftModel({ template, location: root, links, locations: [root, child] });
    assert.deepEqual(session.plannedItems.map((item) => item.itemCode), ["A"]);
});

runTest("descendants não entram nos plannedItems do pai", () => {
    const root = createNode("root", "Cozinha");
    const child = createNode("child", "Geladeira", { parentId: "root" });
    const links = [createLink("root-link", "root", "A"), createLink("child-link", "child", "B")];
    const session = createLocationCountSessionDraftModel({ template, location: root, links, locations: [root, child] });
    assert.equal(session.plannedItems.some((item) => item.locationId === "child"), false);
});

runTest("ordem de filhos é preservada", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("second", "Segundo", { parentId: "root", order: 2 }),
        createNode("first", "Primeiro", { parentId: "root", order: 1 })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.deepEqual(getOperationalChildren(hierarchy, "root").map((node) => node.id), ["first", "second"]);
});

runTest("ancestor inactive não aparece operacionalmente", () => {
    const nodes = [
        createNode("root", "Cozinha", { active: false }),
        createNode("child", "Geladeira", { parentId: "root" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalRoots(hierarchy).length, 0);
    assert.equal(getOperationalNode(hierarchy, "child"), null);
    assert.match(mainSource, /isCountingSessionLocationOperational/);
    assert.match(mainSource, /Nenhuma entrada foi adicionada/);
});

runTest("profundidade três continua navegável", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" }),
        createNode("grandchild", "Porta", { parentId: "child" }),
        createNode("level-three", "Prateleira", { parentId: "grandchild" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalNode(hierarchy, "level-three").depth, 3);
});

runTest("configuração antiga somente com roots permanece contável", () => {
    const hierarchy = buildHierarchy({
        nodes: [createNode("root", "Cozinha")],
        links: [createLink("root-link", "root", "A")]
    });
    const view = buildPhysicalHierarchyNavigationView({ hierarchy });
    assert.equal(view.listedNodes.length, 1);
    assert.equal(resolvePhysicalHierarchyNodeAction(view.listedNodes[0]), "count");
});

runTest("Quick Pilot permanece byte a byte inalterado", () => {
    assert.equal(fileSha256("src/quickPilot.js"), "5ac2f3fb035bd4049f1ce4ece4fe34f2f2237fdabf6d3eecdb5dc9956d7e352d");
});

runTest("superfícies protegidas refletem a finalização global 4D sem alterar backup ou conversão", () => {
    const protectedHashes = {
        "src/storage.js": "8eef28af1967cae5fbd0630356dcb8ccc1706c50a3e99b2ba60ebb2e7b029658",
        "src/db.js": "0d1c7557133d8940d2234a25c12931d34c5f4c87a27dfa5d0a2afbd81a681106",
        "src/locationCountSessions.js": "c3472ac9294cc475ab98a69223e1bac4686fcf12b5c603f44d4d685e9133b059",
        "src/locationCountEntries.js": "73e8420ca6d30990ce0f72b1095d7b245f6d6ca54b8b93d0db18bef092c1a678",
        "src/backup.js": "9e42e9758f98b612d176e15c37e177dbecc4125c8b9f4e1ca3f88cce63ef8652",
        "src/unitConversion.js": "fe8b997f21d22e33f7ee3f4814eb1563b957e8365f197175d9fcf937df8d55f1"
    };
    Object.entries(protectedHashes).forEach(([path, expectedHash]) => assert.equal(fileSha256(path), expectedHash));
    assert.match(readSource("src/db.js"), /mutateCountRoundLocationSession/);
    assert.match(readSource("src/storage.js"), /openOrCreateCountRoundLocationSession/);
    assert.match(readSource("src/storage.js"), /finalizeCountRound/);
    assert.match(readSource("src/locationCountSessions.js"), /createLocationCountSessionDraftFromPlanModel/);
    assert.match(readSource("src/locationCountEntries.js"), /createLocationCountCompletionZeroEntryModel/);
});

runTest("Anterior e Próximo entre itens permanecem presentes", () => {
    assert.match(indexSource, /id="btn-previous-area-item"/);
    assert.match(indexSource, /id="btn-next-area-item"/);
    assert.match(areaCountingUiSource, /goToItem\(currentItemIndex - 1\)/);
    assert.match(areaCountingUiSource, /goToItem\(currentItemIndex \+ 1\)/);
});

runTest("não existe Próximo ou Anterior entre locais", () => {
    const navigationSources = `${mainSource}\n${hierarchyUiSource}\n${indexSource}`;
    assert.doesNotMatch(navigationSources, /next-location|previous-location|nextPhysicalLocation|previousPhysicalLocation/);
});

runTest("empty state sem template é explícito", () => {
    const view = buildPhysicalHierarchyNavigationView({ hierarchy: buildOperationalHierarchy() });
    assert.equal(view.hasTemplate, false);
    assert.equal(view.listedNodes.length, 0);
    assert.match(view.guidance, /Importe um template/);
});

runTest("empty state sem roots operacionais é explícito", () => {
    const hierarchy = buildOperationalHierarchy({ templateId, nodes: [], links: [], sessions: [] });
    const view = buildPhysicalHierarchyNavigationView({ hierarchy });
    assert.equal(view.hasTemplate, true);
    assert.match(view.guidance, /Nenhum local operacional/);
});

console.log(`PHASE3C_PHYSICAL_HIERARCHY_NAVIGATION_VALIDATION_OK ${executedTestCount} casos`);
