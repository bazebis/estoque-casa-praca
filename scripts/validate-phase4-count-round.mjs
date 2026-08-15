import assert from "node:assert/strict";
import fs from "node:fs";
import {
    buildCountRoundScope,
    createCountRoundModel,
    normalizeCountRound,
    validateCountRound,
    validateCountRoundCollection
} from "../src/countRounds.js";
import {
    buildCountRoundReadModel,
    findActiveCountRound,
    listCountRoundLocations
} from "../src/countRoundReadModel.js";
import {
    buildPlannedItemsForLocation,
    createLocationCountSessionDraftModel
} from "../src/locationCountSessions.js";

const timestamp = "2026-08-15T12:00:00.000Z";
const templateId = "phase4-template";

function createTemplate(id = templateId, name = "Template Fase 4") {
    return {
        id,
        name,
        importedAt: timestamp,
        groups: [{
            id: "group-1",
            name: "Grupo",
            order: 1,
            countAreas: ["BAR", "COZINHA"],
            totalArea: "TOTAL",
            items: ["ITEM-A", "ITEM-B", "ITEM-C", "ITEM-D"].map((code, index) => ({
                code,
                name: `Item ${code}`,
                order: index + 1,
                countAreas: ["BAR", "COZINHA"]
            }))
        }]
    };
}

function createNode(id, name, overrides = {}) {
    return {
        id,
        name,
        type: overrides.type || "room",
        parentId: overrides.parentId ?? null,
        reportArea: overrides.reportArea || "COZINHA",
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
        reportArea: overrides.reportArea || "COZINHA",
        order: overrides.order ?? 0,
        active: overrides.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function createFixture(id = templateId) {
    const nodes = [
        createNode("bar", "Bar", { order: 1, reportArea: "BAR" }),
        createNode("kitchen", "Cozinha", { order: 2 }),
        createNode("fridge", "Geladeira", { parentId: "kitchen", order: 1, type: "equipment" }),
        createNode("shelf", "Prateleira", { parentId: "fridge", order: 1, type: "shelf" }),
        createNode("pantry", "Despensa", { parentId: "kitchen", order: 2 }),
        createNode("empty", "Vazio", { order: 3 }),
        createNode("inactive", "Inativo", { order: 4, active: false }),
        createNode("hidden", "Filho oculto", { parentId: "inactive", order: 1 })
    ];
    const links = [
        createLink(`${id}-bar-a`, "bar", "ITEM-A", { templateId: id, reportArea: "BAR" }),
        createLink(`${id}-kitchen-a`, "kitchen", "ITEM-A", { templateId: id }),
        createLink(`${id}-shelf-b`, "shelf", "ITEM-B", { templateId: id, order: 1 }),
        createLink(`${id}-shelf-c`, "shelf", "ITEM-C", { templateId: id, order: 2 }),
        createLink(`${id}-pantry-d`, "pantry", "ITEM-D", { templateId: id }),
        createLink(`${id}-inactive-d`, "inactive", "ITEM-D", { templateId: id }),
        createLink(`${id}-hidden-c`, "hidden", "ITEM-C", { templateId: id })
    ];
    return { template: createTemplate(id), nodes, links };
}

function createRound(overrides = {}) {
    const fixture = createFixture(overrides.template?.id || templateId);
    return createCountRoundModel({
        ...fixture,
        ...overrides,
        id: overrides.id || "round-a",
        timestamp: overrides.timestamp || timestamp
    });
}

function createSession(round, locationIndex, status = "draft", overrides = {}) {
    const location = round.locations[locationIndex];
    return {
        id: overrides.id || `session-${location.locationId}`,
        templateId: round.templateId,
        templateNameSnapshot: round.templateNameSnapshot,
        locationId: overrides.locationId || location.locationId,
        locationPathSnapshot: location.locationPathSnapshot,
        reportAreaSnapshot: location.reportAreaSnapshot,
        status,
        plannedItems: location.plannedItems,
        plannedItemCount: location.plannedItems.length,
        activeLinkCountSnapshot: location.plannedItems.length,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: status === "in_progress" ? timestamp : null,
        finishedAt: status === "completed" ? timestamp : null,
        canceledAt: status === "canceled" ? timestamp : null,
        notes: ""
    };
}

function linkSession(round, locationIndex, session) {
    const candidate = structuredClone(round);
    candidate.locations[locationIndex].sessionId = session.id;
    return validateCountRound(candidate).round;
}

function createEntry(session, plannedItem, overrides = {}) {
    return {
        id: overrides.id || `entry-${plannedItem.linkId}`,
        sessionId: session.id,
        templateId: overrides.templateId || session.templateId,
        locationId: overrides.locationId || session.locationId,
        linkId: overrides.linkId || plannedItem.linkId,
        itemCode: plannedItem.itemCode,
        itemNameSnapshot: plannedItem.itemNameSnapshot,
        groupId: plannedItem.groupId,
        groupNameSnapshot: plannedItem.groupNameSnapshot,
        reportAreaSnapshot: session.reportAreaSnapshot,
        rawQuantityText: overrides.rawQuantityText || "1",
        quantityDecimal: overrides.quantityDecimal || "1",
        rawUnit: "un",
        normalizedUnit: "un",
        notes: "",
        active: overrides.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
        removedAt: overrides.active === false ? timestamp : null
    };
}

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear()
    };
}

function seedFallback({ templates, nodes, links, sessions = [], rounds = [] }) {
    localStorage.clear();
    localStorage.setItem("countTemplates", JSON.stringify(templates));
    localStorage.setItem("locationNodes", JSON.stringify(nodes));
    localStorage.setItem("itemLocationLinks", JSON.stringify(links));
    localStorage.setItem("locationCountSessions", JSON.stringify(sessions));
    localStorage.setItem("locationCountEntries", "[]");
    localStorage.setItem("countRounds", JSON.stringify(rounds));
}

function readSource(relativePath) {
    return fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");
}

let executedTestCount = 0;

async function runTest(name, test) {
    await test();
    executedTestCount += 1;
    console.log(`OK ${executedTestCount} ${name}`);
}

await runTest("round active válida", () => {
    const round = createRound();
    assert.equal(validateCountRound(round).isValid, true);
    assert.equal(round.status, "active");
});

await runTest("entrada de round ausente falha por validação sem lançar exceção", () => {
    const validation = validateCountRound(null);
    assert.equal(validation.isValid, false);
    assert.ok(validation.errors.length > 0);
});

await runTest("timestamps de criação são preservados", () => {
    const round = createRound();
    assert.equal(round.createdAt, timestamp);
    assert.equal(round.updatedAt, timestamp);
    assert.equal(round.finishedAt, null);
});

await runTest("activeTemplateId reserva o template ativo", () => {
    const round = createRound();
    assert.equal(round.activeTemplateId, round.templateId);
});

await runTest("completed omite activeTemplateId", () => {
    const round = { ...createRound(), status: "completed", finishedAt: timestamp, completion: {} };
    delete round.activeTemplateId;
    const validation = validateCountRound(round);
    assert.equal(validation.isValid, true);
    assert.equal(Object.hasOwn(validation.round, "activeTemplateId"), false);
});

await runTest("completed com activeTemplateId é rejeitada", () => {
    const round = { ...createRound(), status: "completed", finishedAt: timestamp, completion: {} };
    assert.equal(validateCountRound(round).isValid, false);
});

await runTest("scope inclui somente locais contáveis", () => {
    const round = createRound();
    assert.deepEqual(round.locations.map((location) => location.locationId), [
        "bar", "kitchen", "shelf", "pantry"
    ]);
});

await runTest("node estrutural sem item direto fica fora", () => {
    const round = createRound();
    assert.equal(round.locations.some((location) => location.locationId === "fridge"), false);
    assert.equal(round.locations.some((location) => location.locationId === "empty"), false);
});

await runTest("parent e filho contáveis são ocorrências independentes", () => {
    const round = createRound();
    assert.ok(round.locations.find((location) => location.locationId === "kitchen"));
    assert.ok(round.locations.find((location) => location.locationId === "shelf"));
});

await runTest("ancestor inativo remove toda subtree do scope", () => {
    const round = createRound();
    assert.equal(round.locations.some((location) => ["inactive", "hidden"].includes(location.locationId)), false);
});

await runTest("item N:N permanece em ocorrências físicas distintas", () => {
    const round = createRound();
    const itemALocations = round.locations.filter((location) => (
        location.plannedItems.some((item) => item.itemCode === "ITEM-A")
    ));
    assert.deepEqual(itemALocations.map((location) => location.locationId), ["bar", "kitchen"]);
});

await runTest("presentationOrder é determinístico", () => {
    const first = createRound({ id: "first" });
    const second = createRound({ id: "second" });
    assert.deepEqual(first.locations.map((location) => location.presentationOrder), [0, 1, 2, 3]);
    assert.deepEqual(first.locations, second.locations);
});

await runTest("path snapshot inclui a hierarquia completa", () => {
    const shelf = createRound().locations.find((location) => location.locationId === "shelf");
    assert.deepEqual(shelf.locationPathSnapshot, ["Cozinha", "Geladeira", "Prateleira"]);
});

await runTest("reportArea snapshot é congelada", () => {
    const bar = createRound().locations.find((location) => location.locationId === "bar");
    assert.equal(bar.reportAreaSnapshot, "BAR");
});

await runTest("todos os locais possuem plannedItems congelados", () => {
    const round = createRound();
    assert.equal(round.locations.every((location) => location.plannedItems.length > 0), true);
});

await runTest("plannedItems preservam ordem e identidade de vínculo", () => {
    const shelf = createRound().locations.find((location) => location.locationId === "shelf");
    assert.deepEqual(shelf.plannedItems.map((item) => item.itemCode), ["ITEM-B", "ITEM-C"]);
    assert.deepEqual(shelf.plannedItems.map((item) => item.linkId), [
        `${templateId}-shelf-b`, `${templateId}-shelf-c`
    ]);
});

await runTest("validação rejeita plannedItem com path incompatível", () => {
    const round = structuredClone(createRound());
    round.locations[0].plannedItems[0].locationPathSnapshot = ["Outro local"];
    assert.equal(validateCountRound(round).isValid, false);
});

await runTest("validação exige presentationOrder contínuo", () => {
    const round = structuredClone(createRound());
    round.locations.at(-1).presentationOrder = 9;
    assert.equal(validateCountRound(round).isValid, false);
});

await runTest("mudança posterior nos links não altera a round", () => {
    const fixture = createFixture();
    const round = createRound(fixture);
    fixture.links[0].active = false;
    fixture.links.push(createLink("new-link", "bar", "ITEM-D"));
    assert.equal(round.locations.find((location) => location.locationId === "bar").plannedItems.length, 1);
});

await runTest("mudança posterior na árvore não altera snapshots", () => {
    const fixture = createFixture();
    const round = createRound(fixture);
    fixture.nodes.find((node) => node.id === "kitchen").name = "Nome alterado";
    const shelf = round.locations.find((location) => location.locationId === "shelf");
    assert.deepEqual(shelf.locationPathSnapshot, ["Cozinha", "Geladeira", "Prateleira"]);
});

await runTest("criação do scope não muta inputs", () => {
    const fixture = createFixture();
    const before = JSON.stringify(fixture);
    buildCountRoundScope(fixture);
    assert.equal(JSON.stringify(fixture), before);
});

await runTest("uma active por template é validada", () => {
    const first = createRound({ id: "first" });
    const second = createRound({ id: "second" });
    assert.equal(validateCountRoundCollection([first, second]).isValid, false);
});

await runTest("templates distintos podem ter rounds ativas", () => {
    const first = createRound({ id: "first" });
    const second = createRound({ ...createFixture("other-template"), id: "second", rounds: [first] });
    assert.equal(validateCountRoundCollection([first, second]).isValid, true);
});

await runTest("active duplicada/corrompida falha fechado no read model", () => {
    const first = createRound({ id: "first" });
    const second = { ...structuredClone(first), id: "second" };
    assert.throws(() => findActiveCountRound([first, second], templateId));
});

await runTest("open session draft bloqueia start", () => {
    const baseRound = createRound();
    const session = createSession(baseRound, 0, "draft");
    assert.throws(() => createRound({ sessions: [session] }), /sessões abertas/i);
});

await runTest("open session in_progress bloqueia start", () => {
    const baseRound = createRound();
    const session = createSession(baseRound, 0, "in_progress");
    assert.throws(() => createRound({ sessions: [session] }), /sessões abertas/i);
});

await runTest("completed e canceled históricos não bloqueiam", () => {
    const baseRound = createRound();
    const sessions = [createSession(baseRound, 0, "completed"), createSession(baseRound, 1, "canceled")];
    assert.equal(createRound({ sessions, id: "new-round" }).status, "active");
});

await runTest("sessionId nasce null em toda ocorrência", () => {
    assert.equal(createRound().locations.every((location) => location.sessionId === null), true);
});

await runTest("round não possui skippedAt", () => {
    const round = createRound();
    assert.equal(round.locations.every((location) => !Object.hasOwn(location, "skippedAt")), true);
    const invalidRound = structuredClone(round);
    invalidRound.locations[0].skippedAt = timestamp;
    assert.equal(validateCountRound(invalidRound).isValid, false);
});

await runTest("read model deriva not_started sem lançamento", () => {
    const model = buildCountRoundReadModel({ round: createRound() });
    assert.equal(model.locations.every((location) => location.operationalState === "not_started"), true);
});

await runTest("read model deriva in_progress com cobertura parcial", () => {
    const baseRound = createRound();
    const locationIndex = baseRound.locations.findIndex((location) => location.locationId === "shelf");
    const session = createSession(baseRound, locationIndex, "in_progress");
    const round = linkSession(baseRound, locationIndex, session);
    const entry = createEntry(session, session.plannedItems[0]);
    const state = buildCountRoundReadModel({ round, sessions: [session], entries: [entry] }).locations[locationIndex];
    assert.equal(state.operationalState, "in_progress");
});

await runTest("read model deriva filled com cobertura completa", () => {
    const baseRound = createRound();
    const locationIndex = baseRound.locations.findIndex((location) => location.locationId === "shelf");
    const session = createSession(baseRound, locationIndex, "in_progress");
    const round = linkSession(baseRound, locationIndex, session);
    const entries = session.plannedItems.map((item) => createEntry(session, item));
    const state = buildCountRoundReadModel({ round, sessions: [session], entries }).locations[locationIndex];
    assert.equal(state.operationalState, "filled");
});

await runTest("múltiplas entries do mesmo item contam cobertura uma vez", () => {
    const baseRound = createRound();
    const session = createSession(baseRound, 0, "in_progress");
    const round = linkSession(baseRound, 0, session);
    const first = createEntry(session, session.plannedItems[0], { id: "entry-1" });
    const second = createEntry(session, session.plannedItems[0], { id: "entry-2", rawQuantityText: "9" });
    const state = buildCountRoundReadModel({ round, sessions: [session], entries: [first, second] }).locations[0];
    assert.equal(state.coveredPlannedItemCount, 1);
    assert.equal(state.activeEntryCount, 2);
});

await runTest("item sem entry não vira zero", () => {
    const model = buildCountRoundReadModel({ round: createRound() });
    assert.equal(model.summary.coveredPlannedItems, 0);
    assert.equal(model.summary.activeEntryCount, 0);
    assert.equal(JSON.stringify(model).includes('"0"'), false);
});

await runTest("progresso não usa quantidade", () => {
    const baseRound = createRound();
    const session = createSession(baseRound, 0, "in_progress");
    const round = linkSession(baseRound, 0, session);
    const low = createEntry(session, session.plannedItems[0], { id: "low", rawQuantityText: "1" });
    const high = createEntry(session, session.plannedItems[0], {
        id: "high", rawQuantityText: "999999", quantityDecimal: "999999"
    });
    const lowModel = buildCountRoundReadModel({ round, sessions: [session], entries: [low] });
    const highModel = buildCountRoundReadModel({ round, sessions: [session], entries: [high] });
    assert.equal(lowModel.summary.coveredPlannedItems, highModel.summary.coveredPlannedItems);
});

await runTest("relação de session inválida produz attention", () => {
    const baseRound = createRound();
    const round = structuredClone(baseRound);
    round.locations[0].sessionId = "missing-session";
    const state = buildCountRoundReadModel({ round }).locations[0];
    assert.equal(state.operationalState, "attention");
});

await runTest("plannedItems da round são semanticamente iguais aos da sessão", () => {
    const fixture = createFixture();
    const round = createRound(fixture);
    const location = fixture.nodes.find((node) => node.id === "shelf");
    const session = createLocationCountSessionDraftModel({
        template: fixture.template,
        location,
        links: fixture.links,
        locations: fixture.nodes
    });
    const roundLocation = round.locations.find((item) => item.locationId === "shelf");
    assert.deepEqual(roundLocation.plannedItems, session.plannedItems);
    assert.deepEqual(roundLocation.plannedItems, buildPlannedItemsForLocation(
        fixture.template, location, fixture.links, fixture.nodes
    ));
});

await runTest("listagem do read model preserva presentationOrder", () => {
    const round = createRound();
    assert.deepEqual(
        listCountRoundLocations(round).map((location) => location.presentationOrder),
        [0, 1, 2, 3]
    );
});

globalThis.localStorage = createMemoryStorage();
const storage = await import(`../src/storage.js?phase4b=${Date.now()}`);
await storage.initializeStorage();

await runTest("fallback persiste e relê round", async () => {
    const fixture = createFixture();
    seedFallback({ templates: [fixture.template], nodes: fixture.nodes, links: fixture.links });
    const created = await storage.startCountRound(templateId);
    assert.equal((await storage.getCountRound(created.id)).id, created.id);
    assert.equal((await storage.getActiveCountRound(templateId)).id, created.id);
    assert.equal((await storage.listCountRounds()).length, 1);
});

await runTest("storage rejeita segunda active do mesmo template", async () => {
    await assert.rejects(() => storage.startCountRound(templateId), /rodada ativa/i);
});

await runTest("storage permite active de outro template", async () => {
    const firstFixture = createFixture();
    const otherFixture = createFixture("other-template");
    const rounds = JSON.parse(localStorage.getItem("countRounds"));
    seedFallback({
        templates: [firstFixture.template, otherFixture.template],
        nodes: firstFixture.nodes,
        links: [...firstFixture.links, ...otherFixture.links],
        rounds
    });
    const otherRound = await storage.startCountRound("other-template");
    assert.equal(otherRound.templateId, "other-template");
    assert.equal((await storage.listCountRounds()).length, 2);
});

await runTest("fallback corrompido com duas active falha fechado", async () => {
    const fixture = createFixture();
    const first = createRound({ id: "first" });
    const second = { ...structuredClone(first), id: "second" };
    seedFallback({ templates: [fixture.template], nodes: fixture.nodes, links: fixture.links, rounds: [first, second] });
    await assert.rejects(() => storage.getActiveCountRound(templateId), /múltiplas rodadas ativas/i);
});

await runTest("storage bloqueia draft legado sem modificá-lo", async () => {
    const fixture = createFixture();
    const baseRound = createRound();
    const draft = createSession(baseRound, 0, "draft");
    seedFallback({ templates: [fixture.template], nodes: fixture.nodes, links: fixture.links, sessions: [draft] });
    const before = localStorage.getItem("locationCountSessions");
    await assert.rejects(() => storage.startCountRound(templateId), /sessões abertas/i);
    assert.equal(localStorage.getItem("locationCountSessions"), before);
});

await runTest("storage bloqueia in_progress legado", async () => {
    const fixture = createFixture();
    const baseRound = createRound();
    const session = createSession(baseRound, 0, "in_progress");
    seedFallback({ templates: [fixture.template], nodes: fixture.nodes, links: fixture.links, sessions: [session] });
    await assert.rejects(() => storage.startCountRound(templateId), /sessões abertas/i);
});

await runTest("storage ignora completed/canceled históricos no start", async () => {
    const fixture = createFixture();
    const baseRound = createRound();
    const sessions = [createSession(baseRound, 0, "completed"), createSession(baseRound, 1, "canceled")];
    seedFallback({ templates: [fixture.template], nodes: fixture.nodes, links: fixture.links, sessions });
    assert.equal((await storage.startCountRound(templateId)).status, "active");
});

await runTest("IndexedDB foi atualizado aditivamente para v7", () => {
    const source = readSource("src/db.js");
    assert.match(source, /const databaseVersion = 7;/);
    ["appState", "locationNodes", "itemLocationLinks", "locationCountSessions", "locationCountEntries"]
        .forEach((storeName) => assert.match(source, new RegExp(`${storeName}: "${storeName}"`)));
});

await runTest("store countRounds possui índice unique activeTemplateId", () => {
    const source = readSource("src/db.js");
    assert.match(source, /countRounds: "countRounds"/);
    assert.match(source, /createIndex\("activeTemplateId", "activeTemplateId", \{ unique: true \}\)/);
});

await runTest("Backup Schema 2 não inclui countRounds", () => {
    assert.doesNotMatch(readSource("src/backup.js"), /countRounds/);
});

await runTest("round não duplica matemática de estoque", () => {
    const roundSource = readSource("src/countRounds.js");
    const readModelSource = readSource("src/countRoundReadModel.js");
    assert.doesNotMatch(`${roundSource}\n${readModelSource}`, /factorToBase|convertEntryToBase|BigInt|quantityDecimal/);
});

await runTest("lifecycle atual de session permanece imediato e separado", () => {
    const sessionSource = readSource("src/locationCountSessions.js");
    assert.match(sessionSource, /createLocationCountSessionDraftModel/);
    assert.match(sessionSource, /status: "draft"/);
    assert.doesNotMatch(sessionSource, /countRound|sessionId: null/);
});

await runTest("UI 4C não introduz fechamento, skip ou zero na fundação", () => {
    const mainSource = readSource("src/main.js");
    const indexSource = readSource("index.html");
    const roundUiSource = readSource("src/countRoundUi.js");
    assert.match(`${mainSource}\n${indexSource}`, /countRound|count-round/);
    assert.doesNotMatch(roundUiSource, /skippedAt|completion_zero|Concluir local|Finalizar contagem/);
});

assert.ok(executedTestCount >= 40);
console.log(`PASS validate-phase4-count-round: ${executedTestCount} casos.`);
