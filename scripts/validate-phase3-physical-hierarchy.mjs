import assert from "node:assert/strict";
import {
    buildOperationalHierarchy,
    getOperationalChildren,
    getOperationalNode,
    getOperationalRoots
} from "../src/physicalHierarchyReadModel.js";

const timestamp = "2026-08-14T12:00:00.000Z";
const templateId = "phase3-template";

function createNode(id, name, overrides = {}) {
    return {
        id,
        name,
        type: overrides.type || "room",
        parentId: overrides.parentId ?? null,
        reportArea: overrides.reportArea || "COZINHA",
        order: overrides.order ?? 0,
        active: overrides.active ?? true,
        createdAt: overrides.createdAt || timestamp,
        updatedAt: overrides.updatedAt || timestamp
    };
}

function createLink(id, locationId, itemCode, overrides = {}) {
    return {
        id,
        templateId: overrides.templateId || templateId,
        itemCode,
        itemNameSnapshot: overrides.itemNameSnapshot || `Item ${itemCode}`,
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

function createSession(id, locationId, status, overrides = {}) {
    return {
        id,
        templateId: overrides.templateId || templateId,
        templateNameSnapshot: "Template Fase 3",
        locationId,
        locationPathSnapshot: ["Cozinha"],
        reportAreaSnapshot: "COZINHA",
        status,
        plannedItems: [],
        plannedItemCount: 0,
        activeLinkCountSnapshot: 0,
        createdAt: overrides.createdAt || timestamp,
        updatedAt: overrides.updatedAt || timestamp,
        startedAt: status === "in_progress" ? timestamp : null,
        finishedAt: status === "completed" ? timestamp : null,
        canceledAt: status === "canceled" ? timestamp : null,
        notes: ""
    };
}

function buildHierarchy({ nodes = [], links = [], sessions = [] } = {}) {
    return buildOperationalHierarchy({ nodes, links, sessions, templateId });
}

let executedTestCount = 0;

function runTest(name, test) {
    test();
    executedTestCount += 1;
    console.log(`OK ${executedTestCount} ${name}`);
}

runTest("root ativo aparece", () => {
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")] });
    assert.deepEqual(getOperationalRoots(hierarchy).map((node) => node.id), ["root"]);
});

runTest("root inativo não aparece", () => {
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha", { active: false })] });
    assert.equal(getOperationalRoots(hierarchy).length, 0);
    assert.equal(hierarchy.unavailableNodes[0].unavailableReason, "inactive-node");
});

runTest("descendente de ancestral inativo falha fechado", () => {
    const nodes = [
        createNode("root", "Cozinha", { active: false }),
        createNode("child", "Geladeira", { parentId: "root" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalNode(hierarchy, "child"), null);
    assert.equal(hierarchy.unavailableNodes.find((node) => node.id === "child").unavailableReason, "unavailable-ancestor");
});

runTest("root, child e grandchild formam árvore", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" }),
        createNode("grandchild", "Porta esquerda", { parentId: "child" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalChildren(hierarchy, "root")[0].id, "child");
    assert.equal(getOperationalChildren(hierarchy, "child")[0].id, "grandchild");
});

runTest("ordem de irmãos respeita order", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("second", "Segundo", { parentId: "root", order: 2 }),
        createNode("first", "Primeiro", { parentId: "root", order: 1 })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.deepEqual(getOperationalChildren(hierarchy, "root").map((node) => node.id), ["first", "second"]);
});

runTest("nome fornece fallback determinístico entre irmãos", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("zulu", "Zulu", { parentId: "root", order: 1 }),
        createNode("alfa", "Alfa", { parentId: "root", order: 1 })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.deepEqual(getOperationalChildren(hierarchy, "root").map((node) => node.name), ["Alfa", "Zulu"]);
});

runTest("node preserva filhos e itens diretos simultaneamente", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Freezer", { parentId: "root" })];
    const hierarchy = buildHierarchy({ nodes, links: [createLink("link-root", "root", "A")] });
    const root = getOperationalNode(hierarchy, "root");
    assert.equal(root.hasChildren, true);
    assert.equal(root.hasDirectItems, true);
    assert.equal(root.operationalState, "ready");
});

runTest("itens diretos não incluem itens de descendentes", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Freezer", { parentId: "root" })];
    const links = [createLink("link-root", "root", "A"), createLink("link-child", "child", "B")];
    const hierarchy = buildHierarchy({ nodes, links });
    assert.deepEqual(getOperationalNode(hierarchy, "root").directLinks.map((link) => link.id), ["link-root"]);
});

runTest("subtreeLinkCount inclui vínculos descendentes", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Freezer", { parentId: "root" }),
        createNode("grandchild", "Cesto", { parentId: "child" })
    ];
    const links = [
        createLink("link-root", "root", "A"),
        createLink("link-child", "child", "B"),
        createLink("link-grandchild", "grandchild", "C")
    ];
    const hierarchy = buildHierarchy({ nodes, links });
    assert.equal(getOperationalNode(hierarchy, "root").subtreeLinkCount, 3);
    assert.equal(getOperationalNode(hierarchy, "child").subtreeLinkCount, 2);
});

runTest("mesmo item em dois locais conta como dois vínculos físicos", () => {
    const nodes = [createNode("first", "Bancada"), createNode("second", "Geladeira")];
    const links = [createLink("link-first", "first", "COCA"), createLink("link-second", "second", "COCA")];
    const hierarchy = buildHierarchy({ nodes, links });
    const totalLinks = hierarchy.roots.reduce((total, root) => total + root.subtreeLinkCount, 0);
    assert.equal(totalLinks, 2);
});

runTest("mesmo item preserva ordem diferente em cada local", () => {
    const nodes = [createNode("first", "Bancada"), createNode("second", "Geladeira")];
    const links = [
        createLink("link-first", "first", "COCA", { order: 9 }),
        createLink("link-second", "second", "COCA", { order: 2 })
    ];
    const hierarchy = buildHierarchy({ nodes, links });
    assert.equal(getOperationalNode(hierarchy, "first").directLinks[0].order, 9);
    assert.equal(getOperationalNode(hierarchy, "second").directLinks[0].order, 2);
});

runTest("children retorna somente filhos diretos", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" }),
        createNode("grandchild", "Porta", { parentId: "child" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.deepEqual(getOperationalChildren(hierarchy, "root").map((node) => node.id), ["child"]);
});

runTest("path vivo produz breadcrumb correto", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" }),
        createNode("grandchild", "Porta", { parentId: "child" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    const pathNames = getOperationalNode(hierarchy, "grandchild").path.map((part) => part.name);
    assert.deepEqual(pathNames, ["Cozinha", "Geladeira", "Porta"]);
});

runTest("depth acompanha profundidade real", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("child", "Geladeira", { parentId: "root" }),
        createNode("grandchild", "Porta", { parentId: "child" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalNode(hierarchy, "root").depth, 0);
    assert.equal(getOperationalNode(hierarchy, "grandchild").depth, 2);
});

runTest("node sem filhos nem itens é empty", () => {
    const hierarchy = buildHierarchy({ nodes: [createNode("root", "Cozinha")] });
    assert.equal(getOperationalNode(hierarchy, "root").operationalState, "empty");
});

runTest("sessão draft é detectada no node exato", () => {
    const nodes = [createNode("root", "Cozinha")];
    const sessions = [createSession("draft", "root", "draft")];
    const hierarchy = buildHierarchy({ nodes, sessions });
    assert.equal(getOperationalNode(hierarchy, "root").openSession.id, "draft");
    assert.equal(getOperationalNode(hierarchy, "root").operationalState, "open-session");
});

runTest("sessão in_progress é detectada", () => {
    const nodes = [createNode("root", "Cozinha")];
    const hierarchy = buildHierarchy({ nodes, sessions: [createSession("progress", "root", "in_progress")] });
    assert.equal(getOperationalNode(hierarchy, "root").openSession.status, "in_progress");
});

runTest("sessão completed não é aberta", () => {
    const nodes = [createNode("root", "Cozinha")];
    const hierarchy = buildHierarchy({ nodes, sessions: [createSession("completed", "root", "completed")] });
    assert.equal(getOperationalNode(hierarchy, "root").openSession, null);
});

runTest("sessão canceled não é aberta", () => {
    const nodes = [createNode("root", "Cozinha")];
    const hierarchy = buildHierarchy({ nodes, sessions: [createSession("canceled", "root", "canceled")] });
    assert.equal(getOperationalNode(hierarchy, "root").openSession, null);
});

runTest("sessão aberta atualizada mais recentemente vence", () => {
    const nodes = [createNode("root", "Cozinha")];
    const sessions = [
        createSession("older", "root", "draft", { updatedAt: "2026-08-14T13:00:00.000Z" }),
        createSession("newer", "root", "in_progress", { updatedAt: "2026-08-14T14:00:00.000Z" })
    ];
    const hierarchy = buildHierarchy({ nodes, sessions });
    assert.equal(getOperationalNode(hierarchy, "root").openSession.id, "newer");
});

runTest("sessão do filho não vira sessão do pai", () => {
    const nodes = [createNode("root", "Cozinha"), createNode("child", "Freezer", { parentId: "root" })];
    const hierarchy = buildHierarchy({ nodes, sessions: [createSession("child-session", "child", "draft")] });
    assert.equal(getOperationalNode(hierarchy, "root").openSession, null);
    assert.equal(getOperationalNode(hierarchy, "child").openSession.id, "child-session");
});

runTest("árvore arbitrária não é truncada em profundidade dois", () => {
    const nodes = [createNode("level-0", "Nível 0")];
    for (let depth = 1; depth <= 5; depth += 1) {
        nodes.push(createNode(`level-${depth}`, `Nível ${depth}`, { parentId: `level-${depth - 1}` }));
    }
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalNode(hierarchy, "level-5").depth, 5);
});

runTest("read model não modifica inputs", () => {
    const input = {
        nodes: [createNode("root", "Cozinha")],
        links: [createLink("link", "root", "A")],
        sessions: [createSession("session", "root", "draft")],
        templateId
    };
    const before = JSON.stringify(input);
    buildOperationalHierarchy(input);
    assert.equal(JSON.stringify(input), before);
});

runTest("mesma entrada produz saída determinística", () => {
    const input = {
        nodes: [createNode("root", "Cozinha")],
        links: [createLink("link", "root", "A")],
        sessions: [createSession("session", "root", "draft")],
        templateId
    };
    assert.deepEqual(buildOperationalHierarchy(input), buildOperationalHierarchy(input));
});

runTest("cadeia com pai inexistente fica indisponível", () => {
    const hierarchy = buildHierarchy({ nodes: [createNode("orphan", "Órfão", { parentId: "missing" })] });
    assert.equal(getOperationalRoots(hierarchy).length, 0);
    assert.equal(hierarchy.unavailableNodes[0].unavailableReason, "invalid-ancestor-chain");
});

runTest("ciclo fica indisponível sem truncar ou promover root", () => {
    const nodes = [
        createNode("first", "Primeiro", { parentId: "second" }),
        createNode("second", "Segundo", { parentId: "first" })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalRoots(hierarchy).length, 0);
    assert.equal(hierarchy.unavailableNodes.length, 2);
});

runTest("vínculo inativo não participa das métricas", () => {
    const nodes = [createNode("root", "Cozinha")];
    const links = [createLink("active", "root", "A"), createLink("inactive", "root", "B", { active: false })];
    const hierarchy = buildHierarchy({ nodes, links });
    assert.equal(getOperationalNode(hierarchy, "root").directLinkCount, 1);
});

runTest("vínculo e sessão de outro template são ignorados", () => {
    const nodes = [createNode("root", "Cozinha")];
    const links = [createLink("foreign-link", "root", "A", { templateId: "other-template" })];
    const sessions = [createSession("foreign-session", "root", "draft", { templateId: "other-template" })];
    const hierarchy = buildHierarchy({ nodes, links, sessions });
    const root = getOperationalNode(hierarchy, "root");
    assert.equal(root.directLinkCount, 0);
    assert.equal(root.openSession, null);
});

runTest("múltiplos directLinks respeitam order, nome e ID", () => {
    const nodes = [createNode("root", "Cozinha")];
    const links = [
        createLink("link-z", "root", "Z", { order: 2, itemNameSnapshot: "Zulu" }),
        createLink("link-b", "root", "B", { order: 1, itemNameSnapshot: "Mesmo nome" }),
        createLink("link-a", "root", "A", { order: 1, itemNameSnapshot: "Mesmo nome" })
    ];
    const hierarchy = buildHierarchy({ nodes, links });
    assert.deepEqual(
        getOperationalNode(hierarchy, "root").directLinks.map((link) => link.id),
        ["link-a", "link-b", "link-z"]
    );
});

runTest("descendantCount conta todos os descendentes navegáveis", () => {
    const nodes = [
        createNode("root", "Cozinha"),
        createNode("first", "Geladeira", { parentId: "root" }),
        createNode("second", "Freezer", { parentId: "root" }),
        createNode("grandchild", "Porta", { parentId: "first" }),
        createNode("hidden", "Cesto inativo", { parentId: "second", active: false })
    ];
    const hierarchy = buildHierarchy({ nodes });
    assert.equal(getOperationalNode(hierarchy, "root").descendantCount, 3);
    assert.equal(getOperationalNode(hierarchy, "first").descendantCount, 1);
    assert.equal(getOperationalNode(hierarchy, "second").descendantCount, 0);
});

console.log(`PASS validate-phase3-physical-hierarchy (${executedTestCount} casos)`);
