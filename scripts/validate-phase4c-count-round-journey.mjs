import assert from "node:assert/strict";
import fs from "node:fs";
import {
    buildCountRoundFallbackReconciliationPlan,
    buildCountRoundLocationSessionMutation,
    createCountRoundModel,
    validateCountRound
} from "../src/countRounds.js";
import { buildCountRoundReadModel } from "../src/countRoundReadModel.js";
import { buildCountRoundHomeView } from "../src/countRoundUi.js";
import { buildBackupPayload } from "../src/backup.js";
import { buildOperationalHierarchy, getOperationalNode } from "../src/physicalHierarchyReadModel.js";
import {
    buildPhysicalHierarchyNavigationView,
    resolvePhysicalHierarchyCountingMode,
    resolvePhysicalHierarchyNodeAction
} from "../src/physicalHierarchyUi.js";
import { summarizeConvertedEntries } from "../src/unitConversion.js";

const timestamp = "2026-08-15T15:00:00.000Z";
const templateId = "phase4c-template";

function createTemplate(id = templateId) {
    return {
        id,
        name: `Template ${id}`,
        importedAt: timestamp,
        groups: [{
            id: "group-1",
            name: "Grupo",
            order: 1,
            countAreas: ["BAR"],
            totalArea: "TOTAL",
            items: ["A", "B", "C", "D"].map((code, index) => ({
                code,
                name: `Item ${code}`,
                order: index + 1,
                countAreas: ["BAR"]
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
        reportArea: overrides.reportArea || "BAR",
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
        reportArea: "BAR",
        order: overrides.order ?? 0,
        active: overrides.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp
    };
}

function createFixture(id = templateId) {
    const nodes = [
        createNode("root", "Bar"),
        createNode("child", "Geladeira", { parentId: "root", type: "equipment" }),
        createNode("other", "Estoque", { order: 1 }),
        createNode("free", "Sem vínculo", { order: 2 }),
        createNode("inactive", "Inativo", { order: 3, active: false }),
        createNode("hidden", "Oculto", { parentId: "inactive" })
    ];
    const links = [
        createLink(`${id}-root-a`, "root", "A", { templateId: id }),
        createLink(`${id}-child-b`, "child", "B", { templateId: id, order: 1 }),
        createLink(`${id}-child-c`, "child", "C", { templateId: id, order: 2 }),
        createLink(`${id}-other-a`, "other", "A", { templateId: id }),
        createLink(`${id}-hidden-d`, "hidden", "D", { templateId: id })
    ];
    return { template: createTemplate(id), nodes, links };
}

function createRound(overrides = {}) {
    const fixture = createFixture(overrides.template?.id || templateId);
    return createCountRoundModel({
        ...fixture,
        ...overrides,
        id: overrides.id || "round-4c",
        timestamp: overrides.timestamp || timestamp
    });
}

function createEntry(session, plannedItem, overrides = {}) {
    return {
        id: overrides.id || `entry-${plannedItem.linkId}`,
        sessionId: session.id,
        templateId: session.templateId,
        locationId: session.locationId,
        linkId: plannedItem.linkId,
        itemCode: plannedItem.itemCode,
        itemNameSnapshot: plannedItem.itemNameSnapshot,
        groupId: plannedItem.groupId,
        groupNameSnapshot: plannedItem.groupNameSnapshot,
        reportAreaSnapshot: session.reportAreaSnapshot,
        rawQuantityText: overrides.quantity || "1",
        quantityDecimal: overrides.quantity || "1",
        rawUnit: "un",
        normalizedUnit: "un",
        notes: "",
        active: overrides.active ?? true,
        createdAt: timestamp,
        updatedAt: timestamp,
        removedAt: overrides.active === false ? timestamp : null
    };
}

function createProfile(template, itemCode, overrides = {}) {
    const item = template.groups[0].items.find((candidate) => candidate.code === itemCode);
    return {
        id: `item-unit:${template.id}:${itemCode}`,
        templateId: template.id,
        itemCode,
        itemNameSnapshot: item.name,
        groupId: template.groups[0].id,
        groupNameSnapshot: template.groups[0].name,
        baseUnit: "un",
        defaultInputUnit: "un",
        allowedUnits: [{
            id: "un",
            label: "un",
            normalizedUnit: "un",
            kind: "base",
            factorToBase: "1",
            portionWeightGrams: null,
            requiresReview: false,
            notes: "",
            legacyLabels: []
        }],
        source: "manual",
        confidence: "high",
        needsReview: false,
        notes: overrides.notes || "",
        createdAt: timestamp,
        updatedAt: timestamp,
        suggestedUnit: "un",
        manualUnit: "un",
        effectiveUnit: "un"
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

function seedFallback({ template = null, templates = null, nodes, links, rounds = [], sessions = [], entries = [], settings = [] }) {
    const storedTemplates = templates || [template].filter(Boolean);
    localStorage.clear();
    localStorage.setItem("countTemplates", JSON.stringify(storedTemplates));
    localStorage.setItem("locationNodes", JSON.stringify(nodes));
    localStorage.setItem("itemLocationLinks", JSON.stringify(links));
    localStorage.setItem("countRounds", JSON.stringify(rounds));
    localStorage.setItem("locationCountSessions", JSON.stringify(sessions));
    localStorage.setItem("locationCountEntries", JSON.stringify(entries));
    localStorage.setItem("itemUnitSettings", JSON.stringify(settings));
    localStorage.setItem("countingHistory", "[]");
    localStorage.setItem("customUnits", "[]");
}

function linkFirstLocation(round) {
    return buildCountRoundLocationSessionMutation({ round, locationId: round.locations[0].locationId });
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

globalThis.localStorage = createMemoryStorage();
const storage = await import(`../src/storage.js?phase4c=${Date.now()}`);
await storage.initializeStorage();

await runTest("iniciar round pela jornada usa o writer real", async () => {
    const fixture = createFixture();
    seedFallback({ templates: [fixture.template], nodes: fixture.nodes, links: fixture.links });
    assert.equal((await storage.startCountRound(templateId)).status, "active");
});

await runTest("segunda tentativa não duplica active", async () => {
    await assert.rejects(() => storage.startCountRound(templateId), /rodada ativa/i);
    assert.equal((await storage.listCountRounds()).length, 1);
});

await runTest("home sem active oferece Iniciar contagem", () => {
    assert.equal(buildCountRoundHomeView({ template: createTemplate() }).actionLabel, "Iniciar contagem");
});

await runTest("home com active oferece Continuar contagem", () => {
    const model = buildCountRoundReadModel({ round: createRound() });
    assert.equal(buildCountRoundHomeView({ template: createTemplate(), roundViewModel: model }).actionLabel, "Continuar contagem");
});

await runTest("reload lógico recupera a active", async () => {
    assert.equal((await storage.getActiveCountRound(templateId)).templateId, templateId);
});

await runTest("reload não cria session", async () => {
    assert.equal((await storage.listLocationCountSessions()).length, 0);
});

await runTest("occurrence sem session é não iniciada", () => {
    assert.equal(buildCountRoundReadModel({ round: createRound() }).locations[0].operationalState, "not_started");
});

await runTest("draft sem entry permanece não iniciado", () => {
    const mutation = linkFirstLocation(createRound());
    const model = buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session] });
    assert.equal(model.locations[0].operationalState, "not_started");
    assert.equal(model.locations[0].cta, "resume");
});

await runTest("cobertura parcial é em andamento", () => {
    const round = createRound();
    const childIndex = round.locations.findIndex((location) => location.locationId === "child");
    const mutation = buildCountRoundLocationSessionMutation({ round, locationId: "child" });
    const entry = createEntry(mutation.session, mutation.session.plannedItems[0]);
    const state = buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session], entries: [entry] })
        .locations[childIndex];
    assert.equal(state.operationalState, "in_progress");
});

await runTest("cobertura total é preenchido", () => {
    const mutation = linkFirstLocation(createRound());
    const entry = createEntry(mutation.session, mutation.session.plannedItems[0]);
    const state = buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session], entries: [entry] }).locations[0];
    assert.equal(state.operationalState, "filled");
});

await runTest("preenchido não completa session", () => {
    const mutation = linkFirstLocation(createRound());
    assert.equal(mutation.session.status, "draft");
});

await runTest("múltiplas entries do mesmo link cobrem uma vez", () => {
    const mutation = linkFirstLocation(createRound());
    const item = mutation.session.plannedItems[0];
    const entries = [createEntry(mutation.session, item, { id: "one" }), createEntry(mutation.session, item, { id: "two" })];
    const state = buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session], entries }).locations[0];
    assert.equal(state.coveredPlannedItemCount, 1);
    assert.equal(state.activeEntryCount, 2);
});

await runTest("entry inativa não conta", () => {
    const mutation = linkFirstLocation(createRound());
    const entry = createEntry(mutation.session, mutation.session.plannedItems[0], { active: false });
    assert.equal(buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session], entries: [entry] }).locations[0].coveredPlannedItemCount, 0);
});

await runTest("soft delete reduz cobertura", async () => {
    const fixture = createFixture();
    const mutation = linkFirstLocation(createRound());
    const profile = createProfile(fixture.template, mutation.session.plannedItems[0].itemCode);
    const entry = createEntry(mutation.session, mutation.session.plannedItems[0]);
    seedFallback({ ...fixture, rounds: [mutation.round], sessions: [mutation.session], entries: [entry], settings: [profile] });
    await storage.removeLocationCountEntry(entry.id);
    const model = buildCountRoundReadModel({
        round: await storage.getCountRound(mutation.round.id),
        sessions: await storage.listLocationCountSessions(),
        entries: await storage.listLocationCountEntries()
    });
    assert.equal(model.locations[0].coveredPlannedItemCount, 0);
});

await runTest("quantidade não afeta progresso", () => {
    const mutation = linkFirstLocation(createRound());
    const item = mutation.session.plannedItems[0];
    const low = createEntry(mutation.session, item, { quantity: "1" });
    const high = createEntry(mutation.session, item, { quantity: "999" });
    const lowSummary = buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session], entries: [low] }).summary;
    const highSummary = buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session], entries: [high] }).summary;
    assert.equal(lowSummary.percent, highSummary.percent);
});

await runTest("mesmo item em locais distintos conta ocorrências distintas", () => {
    const round = createRound();
    const itemAOccurrences = round.locations.flatMap((location) => (
        location.plannedItems.filter((item) => item.itemCode === "A")
    ));
    assert.equal(itemAOccurrences.length, 2);
});

await runTest("total global usa todos os plannedItems", () => {
    assert.equal(buildCountRoundReadModel({ round: createRound() }).summary.totalPlannedOccurrences, 4);
});

await runTest("percent deriva de covered sobre total", () => {
    const mutation = linkFirstLocation(createRound());
    const entry = createEntry(mutation.session, mutation.session.plannedItems[0]);
    const summary = buildCountRoundReadModel({ round: mutation.round, sessions: [mutation.session], entries: [entry] }).summary;
    assert.equal(summary.percent, 25);
});

await runTest("ausência nunca infere zero", () => {
    const model = buildCountRoundReadModel({ round: createRound() });
    assert.equal(model.summary.coveredPlannedOccurrences, 0);
    assert.doesNotMatch(JSON.stringify(model), /completion_zero/);
});

await runTest("abrir local cria draft a partir da round", async () => {
    const fixture = createFixture();
    const round = createRound();
    seedFallback({ ...fixture, rounds: [round] });
    const mutation = await storage.openOrCreateCountRoundLocationSession({ roundId: round.id, locationId: "child" });
    assert.equal(mutation.created, true);
    assert.equal(mutation.session.status, "draft");
});

await runTest("session copia semanticamente o plano congelado", async () => {
    const round = await storage.getCountRound("round-4c");
    const session = (await storage.listLocationCountSessions())[0];
    assert.deepEqual(session.plannedItems, round.locations.find((location) => location.locationId === "child").plannedItems);
});

await runTest("plannedItems não compartilham referência mutável", () => {
    const mutation = linkFirstLocation(createRound());
    mutation.session.plannedItems[0].itemNameSnapshot = "Mutado";
    assert.notEqual(mutation.round.locations[0].plannedItems[0].itemNameSnapshot, "Mutado");
});

await runTest("mudança em link live não reconstrói session", async () => {
    const session = (await storage.listLocationCountSessions())[0];
    const originalPlan = structuredClone(session.plannedItems);
    localStorage.setItem("itemLocationLinks", "[]");
    const reopened = await storage.openOrCreateCountRoundLocationSession({ roundId: "round-4c", locationId: "child" });
    assert.deepEqual(reopened.session.plannedItems, originalPlan);
});

await runTest("sessionId é persistido na occurrence", async () => {
    const round = await storage.getCountRound("round-4c");
    assert.equal(round.locations.find((location) => location.locationId === "child").sessionId, (await storage.listLocationCountSessions())[0].id);
});

await runTest("reabrir local retorna a mesma session", async () => {
    const first = (await storage.listLocationCountSessions())[0];
    const second = await storage.openOrCreateCountRoundLocationSession({ roundId: "round-4c", locationId: "child" });
    assert.equal(second.session.id, first.id);
    assert.equal(second.created, false);
});

await runTest("reabrir não cria segunda session", async () => {
    assert.equal((await storage.listLocationCountSessions()).length, 1);
});

await runTest("session incompatível gera attention", () => {
    const mutation = linkFirstLocation(createRound());
    const incompatible = { ...mutation.session, templateNameSnapshot: "Outro" };
    assert.equal(buildCountRoundReadModel({ round: mutation.round, sessions: [incompatible] }).locations[0].operationalState, "attention");
});

await runTest("sessionId inexistente gera attention", () => {
    const round = structuredClone(createRound());
    round.locations[0].sessionId = "missing";
    assert.equal(buildCountRoundReadModel({ round }).locations[0].operationalState, "attention");
});

await runTest("atomicidade IndexedDB usa transação dos dois stores", () => {
    const source = readSource("src/db.js");
    const body = source.slice(source.indexOf("export function mutateCountRoundLocationSession"));
    assert.match(body, /\[storeNames\.countRounds, storeNames\.locationCountSessions\]/);
    assert.match(body, /"readwrite"/);
    assert.match(body, /sessionStore\.add/);
    assert.match(body, /roundStore\.put/);
});

await runTest("falha local entre session e round executa rollback", async () => {
    const fixture = createFixture();
    const round = createRound();
    seedFallback({ ...fixture, rounds: [round] });
    const beforeSessions = localStorage.getItem("locationCountSessions");
    const beforeRounds = localStorage.getItem("countRounds");
    const originalSetItem = localStorage.setItem.bind(localStorage);
    let shouldFail = true;
    localStorage.setItem = (key, value) => {
        if (key === "countRounds" && shouldFail) {
            shouldFail = false;
            throw new Error("falha simulada");
        }
        originalSetItem(key, value);
    };
    await assert.rejects(() => storage.openOrCreateCountRoundLocationSession({ roundId: round.id, locationId: "root" }), /falha simulada/);
    localStorage.setItem = originalSetItem;
    assert.equal(localStorage.getItem("locationCountSessions"), beforeSessions);
    assert.equal(localStorage.getItem("countRounds"), beforeRounds);
});

await runTest("rollback não deixa session órfã", () => {
    assert.deepEqual(JSON.parse(localStorage.getItem("locationCountSessions")), []);
});

await runTest("rollback não deixa sessionId órfão", () => {
    const rounds = JSON.parse(localStorage.getItem("countRounds"));
    assert.equal(rounds[0].locations.every((location) => location.sessionId === null), true);
});

await runTest("criação avulsa é bloqueada durante active round", async () => {
    await assert.rejects(() => storage.createLocationCountSessionDraft({ templateId, locationId: "root" }), /jornada da rodada/i);
});

async function seedLinkedRound() {
    const fixture = createFixture();
    const mutation = linkFirstLocation(createRound());
    const settings = [createProfile(fixture.template, mutation.session.plannedItems[0].itemCode)];
    seedFallback({ ...fixture, rounds: [mutation.round], sessions: [mutation.session], settings });
    return { fixture, mutation, settings };
}

await runTest("linked session não pode ser cancelada", async () => {
    const { mutation } = await seedLinkedRound();
    await assert.rejects(() => storage.cancelLocationCountSession(mutation.session.id), /finalização global/i);
});

await runTest("linked session não pode ser removida", async () => {
    const { mutation } = await seedLinkedRound();
    await assert.rejects(() => storage.deleteLocationCountSession(mutation.session.id), /não pode ser removida/i);
});

await runTest("linked session não pode ser completed por writer legado", async () => {
    const { mutation } = await seedLinkedRound();
    await assert.rejects(() => storage.completeLocationCountSession(mutation.session.id), /finalização global/i);
});

await runTest("add entry normal continua permitido", async () => {
    const { mutation } = await seedLinkedRound();
    const entry = await storage.addLocationCountEntry({
        session: mutation.session,
        plannedItem: mutation.session.plannedItems[0],
        rawQuantityText: "2",
        rawUnit: "un"
    });
    assert.equal(entry.active, true);
});

await runTest("soft delete de entry continua permitido", async () => {
    const entry = (await storage.listLocationCountEntries())[0];
    assert.equal((await storage.removeLocationCountEntry(entry.id)).active, false);
});

await runTest("primeira entry ainda promove draft para in_progress", async () => {
    const { mutation } = await seedLinkedRound();
    await storage.addLocationCountEntry({
        session: mutation.session,
        plannedItem: mutation.session.plannedItems[0],
        rawQuantityText: "1",
        rawUnit: "un"
    });
    assert.equal((await storage.startLocationCountSession(mutation.session.id)).status, "in_progress");
});

await runTest("save de profile planejado é bloqueado sem session", async () => {
    const fixture = createFixture();
    const round = createRound();
    const profile = createProfile(fixture.template, "A");
    seedFallback({ ...fixture, rounds: [round], settings: [profile] });
    await assert.rejects(() => storage.saveItemUnitSetting({ ...profile, notes: "alterado" }), /contagem em andamento/i);
});

await runTest("delete de profile planejado é bloqueado", async () => {
    await assert.rejects(() => storage.deleteItemUnitSetting(templateId, "A"), /contagem em andamento/i);
});

await runTest("profile não planejado continua mutável", async () => {
    const fixture = createFixture();
    const profile = createProfile(fixture.template, "D");
    localStorage.setItem("itemUnitSettings", JSON.stringify([profile]));
    assert.equal((await storage.saveItemUnitSetting({ ...profile, notes: "livre" })).notes, "livre");
});

await runTest("profile de outro template continua mutável", async () => {
    const fixture = createFixture();
    const other = createFixture("other-template");
    const profile = createProfile(other.template, "A");
    localStorage.setItem("countTemplates", JSON.stringify([fixture.template, other.template]));
    localStorage.setItem("itemUnitSettings", JSON.stringify([profile]));
    assert.equal((await storage.saveItemUnitSetting({ ...profile, notes: "outro" })).templateId, "other-template");
});

await runTest("restore que muda profile relacionado é bloqueado", async () => {
    const fixture = createFixture();
    const round = createRound();
    const profile = createProfile(fixture.template, "A");
    seedFallback({ ...fixture, rounds: [round], settings: [profile] });
    const payload = buildBackupPayload({
        catalogItems: [], countingHistory: [], customUnits: [],
        countTemplates: [fixture.template],
        itemUnitSettings: [{ ...profile, notes: "backup alterado" }]
    });
    await assert.rejects(() => storage.restoreBackupState(payload, "replace-all"), /contagem em andamento/i);
});

await runTest("restore não relacionado preserva a active round e seus perfis", async () => {
    const fixture = createFixture();
    const other = createFixture("other-template");
    const protectedProfile = createProfile(fixture.template, "A", { notes: "protegido" });
    const otherProfile = createProfile(other.template, "A", { notes: "antes" });
    seedFallback({
        templates: [fixture.template, other.template],
        nodes: fixture.nodes,
        links: [...fixture.links, ...other.links],
        rounds: [createRound()],
        settings: [protectedProfile, otherProfile]
    });
    const payload = buildBackupPayload({
        catalogItems: [], countingHistory: [], customUnits: [],
        countTemplates: [fixture.template, other.template],
        itemUnitSettings: [protectedProfile, { ...otherProfile, notes: "depois" }]
    });
    await storage.restoreBackupState(payload, "replace-all");
    assert.equal((await storage.getActiveCountRound(templateId)).id, "round-4c");
    assert.equal((await storage.getItemUnitSetting(templateId, "A")).notes, "protegido");
    assert.equal((await storage.getItemUnitSetting("other-template", "A")).notes, "depois");
});

await runTest("template da active round não pode ser mutado", async () => {
    const fixture = createFixture();
    seedFallback({ ...fixture, rounds: [createRound()] });
    await assert.rejects(() => storage.saveCountTemplate({ ...fixture.template, name: "Alterado" }), /contagem em andamento/i);
});

await runTest("link do template active não pode ser mutado", async () => {
    const fixture = createFixture();
    seedFallback({ ...fixture, rounds: [createRound()] });
    await assert.rejects(() => storage.saveItemLocationLink({ ...fixture.links[0], active: false }), /estrutura desta contagem/i);
});

await runTest("link de outro template continua livre", async () => {
    const fixture = createFixture();
    const other = createFixture("other-template");
    seedFallback({
        templates: [fixture.template, other.template],
        nodes: fixture.nodes,
        links: [...fixture.links, ...other.links],
        rounds: [createRound()]
    });
    assert.equal((await storage.saveItemLocationLink({ ...other.links[0], active: false })).active, false);
});

await runTest("node relacionado ou ancestral não pode ser mutado", async () => {
    const fixture = createFixture();
    seedFallback({ ...fixture, rounds: [createRound()] });
    await assert.rejects(() => storage.saveLocationNode({ ...fixture.nodes[0], name: "Bar alterado" }), /estrutura desta contagem/i);
});

await runTest("node não relacionado continua livre", async () => {
    const fixture = createFixture();
    seedFallback({ ...fixture, rounds: [createRound()] });
    const free = fixture.nodes.find((node) => node.id === "free");
    assert.equal((await storage.saveLocationNode({ ...free, name: "Livre" })).name, "Livre");
});

await runTest("customUnits não recebe guard sem dependência efetiva", async () => {
    const saved = await storage.saveCustomUnits([{ id: "custom_teste", label: "Teste", baseUnit: "un", factor: 2 }]);
    assert.equal(saved.length, 1);
    assert.doesNotMatch(readSource("src/itemUnitSettings.js"), /customUnits/);
});

await runTest("modelo não possui skippedAt", () => {
    assert.equal(createRound().locations.some((location) => Object.hasOwn(location, "skippedAt")), false);
});

await runTest("UI não possui ação Pular", () => {
    assert.doesNotMatch(readSource("src/countRoundUi.js"), /Pular/);
});

await runTest("UI não possui Concluir local", () => {
    assert.doesNotMatch(readSource("src/countRoundUi.js"), /Concluir local/);
});

await runTest("UI 4D adiciona somente finalização global ao card da round", () => {
    assert.match(readSource("index.html"), /btn-finalize-count-round[^>]*>Finalizar contagem/);
    assert.doesNotMatch(readSource("src/countRoundUi.js"), /Concluir local|Pular|skippedAt/);
});

await runTest("não existe completion_zero", () => {
    assert.doesNotMatch(`${readSource("src/countRounds.js")}\n${readSource("src/countRoundUi.js")}`, /completion_zero/);
});

await runTest("nenhuma session 4C vira completed", () => {
    const mutation = linkFirstLocation(createRound());
    assert.equal(mutation.session.status, "draft");
    assert.doesNotMatch(readSource("src/countRoundUi.js"), /completed/);
});

await runTest("navegação permanece livre", () => {
    const fixture = createFixture();
    const hierarchy = buildOperationalHierarchy({ ...fixture, sessions: [], templateId });
    const roundModel = buildCountRoundReadModel({ round: createRound() });
    const view = buildPhysicalHierarchyNavigationView({ hierarchy, roundViewModel: roundModel });
    assert.equal(view.listedNodes.length, 3);
});

await runTest("presentationOrder não vira Próximo automático", () => {
    assert.doesNotMatch(readSource("src/countRoundUi.js"), /presentationOrder|Próximo/);
});

await runTest("parent não agrega plannedItems de descendants", () => {
    const round = createRound();
    assert.deepEqual(round.locations.find((location) => location.locationId === "root").plannedItems.map((item) => item.itemCode), ["A"]);
});

await runTest("ancestor inactive continua fail-closed", () => {
    assert.equal(createRound().locations.some((location) => location.locationId === "hidden"), false);
});

await runTest("Backup Schema 2 continua excluindo round", () => {
    assert.doesNotMatch(readSource("src/backup.js"), /countRounds/);
});

await runTest("payload de backup não recebe CountRound", () => {
    assert.equal(Object.hasOwn(buildBackupPayload({ countRounds: [createRound()] }), "countRounds"), false);
});

await runTest("Miolo continua consolidando 7.5 l", () => {
    const profile = {
        baseUnit: "l",
        allowedUnits: [
            { label: "un", normalizedUnit: "un", factorToBase: "3" },
            { label: "ml", normalizedUnit: "ml", factorToBase: "0.001" },
            { label: "l", normalizedUnit: "l", factorToBase: "1" }
        ]
    };
    const entries = [
        { rawQuantityText: "2", quantityDecimal: "2", rawUnit: "un", active: true },
        { rawQuantityText: "500", quantityDecimal: "500", rawUnit: "ml", active: true },
        { rawQuantityText: "1", quantityDecimal: "1", rawUnit: "l", active: true }
    ];
    assert.equal(summarizeConvertedEntries(entries, profile).totalConvertedDecimal, "7.5");
});

await runTest("UI visível continua usando Configurações", () => {
    const index = readSource("index.html");
    assert.match(index, /Abrir configurações/);
    assert.doesNotMatch(readSource("src/countRoundUi.js"), />Admin</);
});

await runTest("home não recupera cards administrativos da Fase 3", () => {
    const index = readSource("index.html");
    assert.doesNotMatch(index, /Fase piloto|Áreas macro configuradas|Vínculos por área/);
    assert.match(index, /id="pilot-active-template"/);
});

await runTest("finalizador legado faz preflight antes de completar sessions", () => {
    const source = readSource("src/storage.js");
    const body = source.slice(
        source.indexOf("export async function finalizeConsolidationSnapshot"),
        source.indexOf("export async function getEffectiveUnit")
    );
    assert.ok(body.indexOf("assertSessionsNotLinkedToActiveRound") < body.indexOf("completeSnapshotOpenSessions"));
});

await runTest("template da active round não pode ser destruído", async () => {
    const fixture = createFixture();
    seedFallback({ ...fixture, rounds: [createRound()] });
    await assert.rejects(() => storage.deleteCountTemplate(templateId), /contagem em andamento/i);
});

await runTest("lote de links do template active também é bloqueado", async () => {
    const fixture = createFixture();
    seedFallback({ ...fixture, rounds: [createRound()] });
    await assert.rejects(() => storage.saveItemLocationLinksBatch(fixture.links), /estrutura desta contagem/i);
});

await runTest("node relacionado não pode ser excluído", async () => {
    const fixture = createFixture();
    seedFallback({ ...fixture, rounds: [createRound()] });
    await assert.rejects(() => storage.deleteLocationNode("root"), /estrutura desta contagem/i);
});

await runTest("uma session não pode mapear duas occurrences", () => {
    const mutation = linkFirstLocation(createRound());
    const invalid = structuredClone(mutation.round);
    invalid.locations[1].sessionId = mutation.session.id;
    assert.equal(validateCountRound(invalid).isValid, false);
});

function createFallbackRecoveryFixture() {
    const indexedDbRound = createRound();
    const mutation = linkFirstLocation(indexedDbRound);
    return {
        indexedDbRound,
        localRound: mutation.round,
        localSession: mutation.session
    };
}

function assertNoIndexedDbReconciliationWrites(plan) {
    assert.deepEqual(plan.roundsToPut, []);
    assert.deepEqual(plan.sessionsToAdd, []);
    assert.deepEqual(plan.sessionsToPut, []);
    assert.deepEqual(plan.entriesToAdd, []);
    assert.deepEqual(plan.entriesToPut, []);
}

function mergePlanRecords(records, updates) {
    const recordsById = new Map(records.map((record) => [record.id, record]));
    updates.forEach((record) => recordsById.set(record.id, record));
    return [...recordsById.values()];
}

function applyIndexedDbReconciliationPlan(state, plan) {
    return {
        rounds: mergePlanRecords(state.rounds, plan.roundsToPut),
        sessions: mergePlanRecords(state.sessions, [...plan.sessionsToAdd, ...plan.sessionsToPut]),
        entries: mergePlanRecords(state.entries, [...plan.entriesToAdd, ...plan.entriesToPut])
    };
}

function promoteSession(session) {
    return {
        ...session,
        status: "in_progress",
        startedAt: "2026-08-15T15:01:00.000Z",
        updatedAt: "2026-08-15T15:01:00.000Z"
    };
}

await runTest("mapping local novo produz plano de reconciliação", () => {
    const fixture = createFallbackRecoveryFixture();
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [fixture.localSession]
    });
    assert.equal(plan.sessionsToAdd[0].id, fixture.localSession.id);
    assert.equal(plan.roundsToPut[0].locations[0].sessionId, fixture.localSession.id);
});

await runTest("session local é obrigatória para reconciliar mapping", () => {
    const fixture = createFallbackRecoveryFixture();
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.indexedDbRound]
    }), /sessão ausente/i);
});

await runTest("session local incompatível falha fechado", () => {
    const fixture = createFallbackRecoveryFixture();
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [{ ...fixture.localSession, templateNameSnapshot: "Incompatível" }]
    }), /plano congelado/i);
});

await runTest("mapping local para session inexistente falha fechado", () => {
    const fixture = createFallbackRecoveryFixture();
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.indexedDbRound], localSessions: []
    }), /sessão ausente/i);
});

await runTest("mesmo sessionId nos dois lados é idempotente", () => {
    const fixture = createFallbackRecoveryFixture();
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.localRound],
        localSessions: [fixture.localSession],
        indexedDbSessions: [fixture.localSession]
    });
    assertNoIndexedDbReconciliationWrites(plan);
});

await runTest("mapping somente no IndexedDB preserva sua autoridade", () => {
    const fixture = createFallbackRecoveryFixture();
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.indexedDbRound],
        indexedDbRounds: [fixture.localRound],
        indexedDbSessions: [fixture.localSession]
    });
    assertNoIndexedDbReconciliationWrites(plan);
});

await runTest("sessionIds diferentes falham fechado", () => {
    const fixture = createFallbackRecoveryFixture();
    const competing = linkFirstLocation(fixture.indexedDbRound);
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [competing.round],
        localSessions: [fixture.localSession],
        indexedDbSessions: [competing.session]
    }), /sessions diferentes/i);
});

await runTest("mesmo ID com conteúdo incompatível falha fechado", () => {
    const fixture = createFallbackRecoveryFixture();
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [fixture.localSession],
        indexedDbSessions: [{ ...fixture.localSession, notes: "conflito" }]
    }), /conflita com o registro/i);
});

await runTest("reconciliação repetida não cria duplicata", () => {
    const fixture = createFallbackRecoveryFixture();
    const firstPlan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [fixture.localSession]
    });
    const secondPlan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: firstPlan.roundsToPut,
        localSessions: [fixture.localSession],
        indexedDbSessions: firstPlan.sessionsToAdd
    });
    assertNoIndexedDbReconciliationWrites(secondPlan);
});

await runTest("reconciliação preserva plano path e reportArea congelados", () => {
    const fixture = createFallbackRecoveryFixture();
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [fixture.localSession]
    });
    const reconciled = plan.roundsToPut[0].locations[0];
    const original = fixture.indexedDbRound.locations[0];
    assert.deepEqual(reconciled.plannedItems, original.plannedItems);
    assert.deepEqual(reconciled.locationPathSnapshot, original.locationPathSnapshot);
    assert.equal(reconciled.reportAreaSnapshot, original.reportAreaSnapshot);
});

await runTest("reconciliação aceita somente session aberta", () => {
    const fixture = createFallbackRecoveryFixture();
    const completed = { ...fixture.localSession, status: "completed", finishedAt: timestamp };
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [completed]
    }), /plano congelado/i);
});

await runTest("reconciliação IndexedDB usa os três stores em readwrite", () => {
    const source = readSource("src/db.js");
    const body = source.slice(source.indexOf("export function reconcileCountRoundFallbackMappings"));
    assert.match(body, /storeNames\.countRounds/);
    assert.match(body, /storeNames\.locationCountSessions/);
    assert.match(body, /storeNames\.locationCountEntries/);
    assert.match(body, /"readwrite"/);
    assert.match(body, /sessionStore\.add/);
    assert.match(body, /entryStore\.add/);
    assert.match(body, /roundStore\.put/);
});

await runTest("pure fallback continua abrindo e retomando session", async () => {
    const fixture = createFixture();
    const round = createRound();
    seedFallback({ ...fixture, rounds: [round] });
    const first = await storage.openOrCreateCountRoundLocationSession({ roundId: round.id, locationId: "root" });
    const second = await storage.openOrCreateCountRoundLocationSession({ roundId: round.id, locationId: "root" });
    assert.equal(first.session.id, second.session.id);
});

await runTest("rollback local focalizado permanece coberto", () => {
    const source = readSource("src/storage.js");
    assert.match(source, /restoreLocalRoundSessionSnapshot\(snapshot\)/);
    assert.match(source, /commitLocalRoundSessionPair/);
});

await runTest("recuperação independe da flag histórica de sessions", () => {
    const source = readSource("src/storage.js");
    const initializeBody = source.slice(source.indexOf("export async function initializeStorage"), source.indexOf("export function getStorageStatus"));
    assert.match(initializeBody, /reconcileLocalCountRoundMappingsToIndexedDB/);
    assert.ok(initializeBody.indexOf("reconcileLocalCountRoundMappingsToIndexedDB") < initializeBody.indexOf("migrateLocationCountSessionsToIndexedDB"));
});

await runTest("planner não adota relação por timestamp", () => {
    const source = readSource("src/countRounds.js");
    const body = source.slice(source.indexOf("function reconcileRoundLocation"), source.indexOf("export function validateCountRound"));
    assert.doesNotMatch(body, /new Date|sort\([^)]*(updatedAt|createdAt)|updatedAt\s*[<>]/);
});

await runTest("correção focalizada não introduz UI nem escopo 4D", () => {
    const roundSource = readSource("src/countRounds.js");
    const reconciliationSource = roundSource.slice(
        roundSource.indexOf("function createFrozenRoundSignature"),
        roundSource.indexOf("export function validateCountRound")
    );
    assert.doesNotMatch(reconciliationSource, /completion_zero|skippedAt/);
    assert.match(readSource("src/countRoundUi.js"), /onFinalize/);
    assert.doesNotMatch(readSource("src/countRoundUi.js"), /Concluir local|Pular|skippedAt/);
});

await runTest("F3 recupera avanço draft para in_progress e entry nova", () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    const entry = createEntry(progressedSession, progressedSession.plannedItems[0]);
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.localRound],
        localSessions: [progressedSession],
        indexedDbSessions: [fixture.localSession],
        localEntries: [entry]
    });
    assert.equal(plan.sessionsToPut[0].status, "in_progress");
    assert.equal(plan.entriesToAdd[0].id, entry.id);
});

await runTest("F3 recupera mapping session e entry na mesma operação", () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    const entry = createEntry(progressedSession, progressedSession.plannedItems[0]);
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound],
        indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [progressedSession],
        localEntries: [entry]
    });
    assert.equal(plan.roundsToPut[0].locations[0].sessionId, progressedSession.id);
    assert.equal(plan.sessionsToAdd[0].status, "in_progress");
    assert.equal(plan.entriesToAdd[0].id, entry.id);
});

await runTest("F3 independe da flag histórica de sessions", () => {
    const initializeBody = readSource("src/storage.js").slice(
        readSource("src/storage.js").indexOf("export async function initializeStorage"),
        readSource("src/storage.js").indexOf("export function getStorageStatus")
    );
    assert.ok(initializeBody.indexOf("reconcileLocalCountRoundMappingsToIndexedDB")
        < initializeBody.indexOf("migrateLocationCountSessionsToIndexedDB"));
});

await runTest("F3 independe da flag histórica de entries", () => {
    const source = readSource("src/storage.js");
    const initializeBody = source.slice(
        source.indexOf("export async function initializeStorage"),
        source.indexOf("export function getStorageStatus")
    );
    assert.ok(initializeBody.indexOf("reconcileLocalCountRoundMappingsToIndexedDB")
        < initializeBody.indexOf("migrateLocationCountEntriesToIndexedDB"));
});

await runTest("F3 é idempotente após aplicar session entry e mapping", () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    const entry = createEntry(progressedSession, progressedSession.plannedItems[0]);
    const firstPlan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.indexedDbRound],
        localSessions: [progressedSession], localEntries: [entry]
    });
    const stored = applyIndexedDbReconciliationPlan({
        rounds: [fixture.indexedDbRound], sessions: [], entries: []
    }, firstPlan);
    const secondPlan = buildCountRoundFallbackReconciliationPlan({
        localRounds: firstPlan.mirrorRounds,
        indexedDbRounds: stored.rounds,
        localSessions: firstPlan.mirrorSessions,
        indexedDbSessions: stored.sessions,
        localEntries: firstPlan.mirrorEntries,
        indexedDbEntries: stored.entries
    });
    assertNoIndexedDbReconciliationWrites(secondPlan);
});

await runTest("F3 entry idêntica é idempotente", () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    const entry = createEntry(progressedSession, progressedSession.plannedItems[0]);
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [progressedSession], indexedDbSessions: [progressedSession],
        localEntries: [entry], indexedDbEntries: [entry]
    });
    assertNoIndexedDbReconciliationWrites(plan);
});

await runTest("F3 mesmo entry id incompatível falha fechado", () => {
    const fixture = createFallbackRecoveryFixture();
    const session = promoteSession(fixture.localSession);
    const entry = createEntry(session, session.plannedItems[0]);
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [session], indexedDbSessions: [session],
        localEntries: [entry], indexedDbEntries: [{ ...entry, rawQuantityText: "2", quantityDecimal: "2" }]
    }), /entrada local conflita/i);
});

await runTest("F3 entry nova precisa corresponder ao plannedItem", () => {
    const fixture = createFallbackRecoveryFixture();
    const session = promoteSession(fixture.localSession);
    const entry = { ...createEntry(session, session.plannedItems[0]), linkId: "link-inexistente" };
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [session], indexedDbSessions: [session], localEntries: [entry]
    }), /não corresponde ao item planejado/i);
});

await runTest("F3 soft delete legítimo do fallback é preservado", () => {
    const fixture = createFallbackRecoveryFixture();
    const session = promoteSession(fixture.localSession);
    const activeEntry = createEntry(session, session.plannedItems[0]);
    const removedEntry = { ...activeEntry, active: false, removedAt: timestamp };
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [session], indexedDbSessions: [session],
        localEntries: [removedEntry], indexedDbEntries: [activeEntry]
    });
    assert.equal(plan.entriesToPut[0].active, false);
});

await runTest("F3 soft delete do IndexedDB não é revertido por mirror stale", () => {
    const fixture = createFallbackRecoveryFixture();
    const session = promoteSession(fixture.localSession);
    const activeEntry = createEntry(session, session.plannedItems[0]);
    const removedEntry = { ...activeEntry, active: false, removedAt: timestamp };
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [session], indexedDbSessions: [session],
        localEntries: [activeEntry], indexedDbEntries: [removedEntry]
    });
    assert.equal(plan.entriesToPut.length, 0);
    assert.equal(plan.mirrorEntries[0].active, false);
});

await runTest("F3 avanço monotônico exige snapshots e plano iguais", () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [progressedSession], indexedDbSessions: [fixture.localSession]
    });
    assert.deepEqual(plan.sessionsToPut[0].plannedItems, fixture.localSession.plannedItems);
    assert.deepEqual(plan.sessionsToPut[0].locationPathSnapshot, fixture.localSession.locationPathSnapshot);
    assert.equal(plan.sessionsToPut[0].reportAreaSnapshot, fixture.localSession.reportAreaSnapshot);
});

await runTest("F3 session in_progress no IndexedDB não regride para draft", () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [fixture.localSession], indexedDbSessions: [progressedSession]
    });
    assert.equal(plan.sessionsToPut.length, 0);
    assert.equal(plan.mirrorSessions[0].status, "in_progress");
});

await runTest("F3 alteração arbitrária de session continua conflito", () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    assert.throws(() => buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.localRound], indexedDbRounds: [fixture.localRound],
        localSessions: [{ ...progressedSession, notes: "alterada" }],
        indexedDbSessions: [fixture.localSession]
    }), /sessão local conflita/i);
});

await runTest("F3 transação de recovery abrange round session e entries", () => {
    const source = readSource("src/db.js");
    const body = source.slice(source.indexOf("export function reconcileCountRoundFallbackMappings"));
    assert.match(body, /storeNames\.countRounds/);
    assert.match(body, /storeNames\.locationCountSessions/);
    assert.match(body, /storeNames\.locationCountEntries/);
    assert.match(body, /database\.transaction[\s\S]*"readwrite"/);
});

await runTest("F3 conflito é detectado antes de qualquer write da transação", () => {
    const source = readSource("src/db.js");
    const body = source.slice(source.indexOf("export function reconcileCountRoundFallbackMappings"));
    assert.ok(body.indexOf("reconciliationPlan = buildPlan") < body.indexOf("sessionStore.add"));
    assert.ok(body.indexOf("reconciliationPlan = buildPlan") < body.indexOf("entryStore.add"));
    assert.ok(body.indexOf("reconciliationPlan = buildPlan") < body.indexOf("roundStore.put"));
});

await runTest("F3 initialize reconcilia antes das migrations de session e entry", () => {
    const source = readSource("src/storage.js");
    const body = source.slice(
        source.indexOf("export async function initializeStorage"),
        source.indexOf("export function getStorageStatus")
    );
    const reconcilePosition = body.indexOf("reconcileLocalCountRoundMappingsToIndexedDB");
    assert.ok(reconcilePosition < body.indexOf("migrateLocationCountSessionsToIndexedDB"));
    assert.ok(reconcilePosition < body.indexOf("migrateLocationCountEntriesToIndexedDB"));
});

await runTest("F3 mirror autoritativo impede session duplicada em fallback futuro", async () => {
    const fixture = createFallbackRecoveryFixture();
    const progressedSession = promoteSession(fixture.localSession);
    const entry = createEntry(progressedSession, progressedSession.plannedItems[0]);
    const plan = buildCountRoundFallbackReconciliationPlan({
        localRounds: [fixture.indexedDbRound], indexedDbRounds: [fixture.localRound],
        localSessions: [fixture.localSession], indexedDbSessions: [progressedSession],
        localEntries: [], indexedDbEntries: [entry]
    });
    seedFallback({
        ...createFixture(), rounds: plan.mirrorRounds,
        sessions: plan.mirrorSessions, entries: plan.mirrorEntries
    });
    const mutation = await storage.openOrCreateCountRoundLocationSession({
        roundId: fixture.localRound.id,
        locationId: fixture.localRound.locations[0].locationId
    });
    assert.equal(mutation.created, false);
    assert.equal(mutation.session.id, progressedSession.id);
});

function createIdentityGuardFixture() {
    const protectedFixture = createFixture();
    const otherFixture = createFixture("other-template");
    return {
        protectedFixture,
        otherFixture,
        round: createRound(),
        protectedLink: protectedFixture.links[0],
        otherLink: otherFixture.links[0],
        protectedProfile: createProfile(protectedFixture.template, "A"),
        otherProfile: createProfile(otherFixture.template, "A")
    };
}

await runTest("F4A single save bloqueia troca de identidade de link protegido", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink], rounds: [fixture.round]
    });
    await assert.rejects(() => storage.saveItemLocationLink({
        ...fixture.protectedLink,
        templateId: fixture.otherFixture.template.id
    }), /estrutura desta contagem/i);
});

await runTest("F4A rejeição single preserva link antigo", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink], rounds: [fixture.round]
    });
    await assert.rejects(() => storage.saveItemLocationLink({
        ...fixture.protectedLink,
        templateId: fixture.otherFixture.template.id
    }), /estrutura desta contagem/i);
    assert.equal((await storage.getItemLocationLink(fixture.protectedLink.id)).templateId, templateId);
});

await runTest("F4A batch bloqueia troca de identidade por id", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink], rounds: [fixture.round]
    });
    await assert.rejects(() => storage.saveItemLocationLinksBatch([{
        ...fixture.protectedLink,
        templateId: fixture.otherFixture.template.id
    }]), /estrutura desta contagem/i);
});

await runTest("F4A batch rejeitado não produz escrita parcial", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink, fixture.otherLink], rounds: [fixture.round]
    });
    await assert.rejects(() => storage.saveItemLocationLinksBatch([
        { ...fixture.protectedLink, templateId: fixture.otherFixture.template.id },
        { ...fixture.otherLink, active: false }
    ]), /estrutura desta contagem/i);
    assert.equal((await storage.getItemLocationLink(fixture.protectedLink.id)).templateId, templateId);
    assert.equal((await storage.getItemLocationLink(fixture.otherLink.id)).active, true);
});

await runTest("F4A link genuinamente não relacionado continua mutável", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink, fixture.otherLink], rounds: [fixture.round]
    });
    const saved = await storage.saveItemLocationLink({ ...fixture.otherLink, active: false });
    assert.equal(saved.active, false);
});

await runTest("F4B profile bloqueia troca de identidade por id", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink], rounds: [fixture.round],
        settings: [fixture.protectedProfile]
    });
    await assert.rejects(() => storage.saveItemUnitSetting({
        ...fixture.protectedProfile,
        templateId: fixture.otherFixture.template.id
    }), /contagem em andamento/i);
});

await runTest("F4B rejeição preserva perfil antigo", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink], rounds: [fixture.round],
        settings: [fixture.protectedProfile]
    });
    await assert.rejects(() => storage.saveItemUnitSetting({
        ...fixture.protectedProfile,
        templateId: fixture.otherFixture.template.id
    }), /contagem em andamento/i);
    assert.equal((await storage.getItemUnitSetting(templateId, "A")).id, fixture.protectedProfile.id);
});

await runTest("F4B profile genuinamente não relacionado continua mutável", async () => {
    const fixture = createIdentityGuardFixture();
    seedFallback({
        templates: [fixture.protectedFixture.template, fixture.otherFixture.template],
        nodes: fixture.protectedFixture.nodes,
        links: [fixture.protectedLink], rounds: [fixture.round],
        settings: [fixture.protectedProfile, fixture.otherProfile]
    });
    const saved = await storage.saveItemUnitSetting({ ...fixture.otherProfile, notes: "livre" });
    assert.equal(saved.notes, "livre");
});

await runTest("F3 falha do mirror não libera migrations históricas sobre estado stale", () => {
    const source = readSource("src/storage.js");
    const initializeBody = source.slice(
        source.indexOf("export async function initializeStorage"),
        source.indexOf("export function getStorageStatus")
    );
    assert.match(initializeBody, /countRoundReconciliation\.mirrorSynchronized[\s\S]*migrateLocationCountSessionsToIndexedDB/);
    assert.match(initializeBody, /countRoundReconciliation\.mirrorSynchronized[\s\S]*migrateLocationCountEntriesToIndexedDB/);
    assert.match(source, /A contagem está segura no IndexedDB, mas o espelho local não pôde ser atualizado/);
});

assert.equal(executedTestCount, 114);
console.log(`PASS validate-phase4c-count-round-journey: ${executedTestCount}/114 casos.`);
