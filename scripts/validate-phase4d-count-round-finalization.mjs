import assert from "node:assert/strict";
import fs from "node:fs";
import {
    buildCountRoundFinalizationPlan,
    CountRoundFinalizationError
} from "../src/countRoundFinalization.js";
import { validateCountRound } from "../src/countRounds.js";
import {
    createLocationCountEntryModel,
    parseQuantityText,
    validateLocationCountCompletionEntry
} from "../src/locationCountEntries.js";
import { createLocationCountSessionDraftFromPlanModel } from "../src/locationCountSessions.js";

const timestamp = "2026-08-15T18:00:00.000Z";
const templateId = "phase4d-template";

function createTemplate() {
    return {
        id: templateId,
        name: "Template Fase 4D",
        importedAt: timestamp,
        groups: [{
            id: "group-1",
            name: "Grupo",
            order: 0,
            countAreas: ["BAR"],
            totalArea: "TOTAL",
            items: ["A", "B"].map((code, order) => ({
                code,
                name: `Item ${code}`,
                order,
                countAreas: ["BAR"]
            }))
        }]
    };
}

function createPlannedItem(locationId, itemCode, linkId, order) {
    return {
        itemCode,
        itemNameSnapshot: `Item ${itemCode}`,
        groupId: "group-1",
        groupNameSnapshot: "Grupo",
        linkId,
        locationId,
        locationPathSnapshot: [locationId === "bar" ? "Bar" : "Estoque"],
        reportArea: "BAR",
        order,
        active: true
    };
}

function createRound() {
    return {
        id: "round-4d",
        templateId,
        templateNameSnapshot: "Template Fase 4D",
        status: "active",
        activeTemplateId: templateId,
        locations: [{
            locationId: "bar",
            locationPathSnapshot: ["Bar"],
            reportAreaSnapshot: "BAR",
            presentationOrder: 0,
            plannedItems: [
                createPlannedItem("bar", "A", "link-bar-a", 0),
                createPlannedItem("bar", "B", "link-bar-b", 1)
            ],
            sessionId: "session-bar"
        }, {
            locationId: "stock",
            locationPathSnapshot: ["Estoque"],
            reportAreaSnapshot: "BAR",
            presentationOrder: 1,
            plannedItems: [createPlannedItem("stock", "A", "link-stock-a", 0)],
            sessionId: null
        }],
        createdAt: timestamp,
        updatedAt: timestamp,
        finishedAt: null,
        completion: null
    };
}

function createSession(round, locationIndex, overrides = {}) {
    const location = round.locations[locationIndex];
    return createLocationCountSessionDraftFromPlanModel({
        id: overrides.id || location.sessionId || `session-${location.locationId}`,
        templateId: round.templateId,
        templateNameSnapshot: round.templateNameSnapshot,
        locationId: location.locationId,
        locationPathSnapshot: location.locationPathSnapshot,
        reportAreaSnapshot: location.reportAreaSnapshot,
        plannedItems: location.plannedItems,
        timestamp: overrides.createdAt || timestamp
    });
}

function createEntry(session, plannedItem, overrides = {}) {
    const active = overrides.active ?? true;
    return {
        id: overrides.id || `entry-${session.id}-${plannedItem.linkId}`,
        sessionId: session.id,
        templateId: session.templateId,
        locationId: session.locationId,
        linkId: plannedItem.linkId,
        itemCode: plannedItem.itemCode,
        itemNameSnapshot: plannedItem.itemNameSnapshot,
        groupId: plannedItem.groupId,
        groupNameSnapshot: plannedItem.groupNameSnapshot,
        reportAreaSnapshot: session.reportAreaSnapshot,
        rawQuantityText: overrides.quantity || "2",
        quantityDecimal: overrides.quantity || "2",
        rawUnit: "un",
        normalizedUnit: "un",
        notes: "",
        active,
        createdAt: timestamp,
        updatedAt: timestamp,
        removedAt: active ? null : timestamp
    };
}

function createProfile(itemCode, overrides = {}) {
    return {
        id: `item-unit:${templateId}:${itemCode}`,
        templateId,
        itemCode,
        itemNameSnapshot: `Item ${itemCode}`,
        groupId: "group-1",
        groupNameSnapshot: "Grupo",
        baseUnit: "un",
        defaultInputUnit: overrides.defaultInputUnit ?? "un",
        allowedUnits: [{
            id: "un", label: "un", normalizedUnit: "un", kind: "base", factorToBase: "1",
            portionWeightGrams: null, requiresReview: false, notes: "", legacyLabels: []
        }],
        source: "manual",
        confidence: "high",
        needsReview: overrides.needsReview ?? false,
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        suggestedUnit: "un",
        manualUnit: "un",
        effectiveUnit: "un"
    };
}

function createPlanInput(overrides = {}) {
    const round = structuredClone(overrides.round || createRound());
    const barSession = createSession(round, 0);
    return {
        round,
        template: createTemplate(),
        sessions: overrides.sessions ?? [barSession],
        entries: overrides.entries ?? [],
        unitSettings: overrides.unitSettings ?? [createProfile("A"), createProfile("B")],
        snapshots: overrides.snapshots ?? [],
        timestamp,
        createSessionId: overrides.createSessionId || (() => "session-stock"),
        createEntryId: overrides.createEntryId || ((session, item) => `zero-${session.id}-${item.linkId}`),
        createSnapshotId: overrides.createSnapshotId || (() => "snapshot-4d")
    };
}

function finalize(overrides = {}) {
    return buildCountRoundFinalizationPlan(createPlanInput(overrides));
}

function allFinalEntries(plan, originalEntries = []) {
    return [...originalEntries, ...plan.entriesToAdd];
}

function createCompletedPlanInput() {
    const activeInput = createPlanInput();
    const firstPlan = buildCountRoundFinalizationPlan(activeInput);
    return {
        firstPlan,
        completedInput: {
            ...activeInput,
            round: structuredClone(firstPlan.round),
            sessions: structuredClone(firstPlan.sessionsToPut),
            entries: structuredClone(allFinalEntries(firstPlan, activeInput.entries)),
            snapshots: structuredClone(firstPlan.snapshots)
        }
    };
}

function createMemoryStorage() {
    const values = new Map();
    let failureKey = null;
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem(key, value) {
            if (failureKey === key) {
                failureKey = null;
                throw new Error(`Falha simulada em ${key}`);
            }
            values.set(key, String(value));
        },
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
        failOnce: (key) => { failureKey = key; }
    };
}

function seedFallback(storage, input) {
    storage.clear();
    storage.setItem("countTemplates", JSON.stringify([input.template]));
    storage.setItem("locationNodes", "[]");
    storage.setItem("itemLocationLinks", "[]");
    storage.setItem("countRounds", JSON.stringify([input.round]));
    storage.setItem("locationCountSessions", JSON.stringify(input.sessions));
    storage.setItem("locationCountEntries", JSON.stringify(input.entries));
    storage.setItem("itemUnitSettings", JSON.stringify(input.unitSettings));
    storage.setItem("consolidationSnapshots", JSON.stringify(input.snapshots));
    storage.setItem("countingHistory", "[]");
    storage.setItem("customUnits", "[]");
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

await runTest("round parcial cria zeros exatos e materializa local nunca aberto", () => {
    const plan = finalize();
    assert.equal(plan.entriesToAdd.length, 3);
    assert.equal(plan.round.completion.materializedSessionCount, 1);
});

await runTest("contrato completed omite activeTemplateId e possui snapshot", () => {
    const plan = finalize();
    assert.equal(validateCountRound(plan.round).isValid, true);
    assert.equal(Object.hasOwn(plan.round, "activeTemplateId"), false);
    assert.equal(plan.round.completion.snapshotId, plan.snapshot.id);
});

await runTest("round 100% coberta finaliza sem zero", () => {
    const round = createRound();
    round.locations[1].sessionId = "session-stock";
    const sessions = [createSession(round, 0), createSession(round, 1)];
    const entries = sessions.flatMap((session) => session.plannedItems.map((item) => createEntry(session, item)));
    const plan = finalize({ round, sessions, entries });
    assert.equal(plan.entriesToAdd.length, 0);
    assert.equal(plan.round.completion.coveredBeforeFinalization, 3);
});

await runTest("local parcial preserva existente e zera somente faltante", () => {
    const input = createPlanInput();
    input.entries = [createEntry(input.sessions[0], input.sessions[0].plannedItems[0])];
    const plan = buildCountRoundFinalizationPlan(input);
    assert.equal(plan.entriesToAdd.length, 2);
    assert.equal(plan.round.completion.coveredBeforeFinalization, 1);
});

await runTest("múltiplas entries do mesmo link são preservadas e impedem zero", () => {
    const input = createPlanInput();
    const item = input.sessions[0].plannedItems[0];
    input.entries = [
        createEntry(input.sessions[0], item, { id: "entry-a-1" }),
        createEntry(input.sessions[0], item, { id: "entry-a-2" })
    ];
    const plan = buildCountRoundFinalizationPlan(input);
    assert.equal(plan.entriesToAdd.some((entry) => entry.linkId === item.linkId), false);
    assert.equal(plan.mirrorEntries.filter((entry) => entry.linkId === item.linkId).length, 2);
});

await runTest("entry removida não cobre, não é reativada e gera novo zero", () => {
    const input = createPlanInput();
    const removed = createEntry(input.sessions[0], input.sessions[0].plannedItems[0], { active: false });
    input.entries = [removed];
    const plan = buildCountRoundFinalizationPlan(input);
    assert.equal(plan.entriesToAdd.some((entry) => entry.linkId === removed.linkId), true);
    assert.equal(plan.mirrorEntries.find((entry) => entry.id === removed.id).active, false);
});

await runTest("zero explícito interno usa quantidade zero e unidade default", () => {
    const zero = finalize().entriesToAdd[0];
    assert.deepEqual([zero.rawQuantityText, zero.quantityDecimal, zero.rawUnit], ["0", "0", "un"]);
    assert.equal(validateLocationCountCompletionEntry(zero).isValid, true);
});

await runTest("entrada manual continua rejeitando zero", () => {
    assert.equal(parseQuantityText("0").isValid, false);
    const input = createPlanInput();
    assert.throws(() => createLocationCountEntryModel({
        session: input.sessions[0],
        plannedItem: input.sessions[0].plannedItems[0],
        rawQuantityText: "0",
        rawUnit: "un"
    }), /maior que zero/i);
});

await runTest("profile inválido falha antes de produzir plano", () => {
    assert.throws(() => finalize({
        unitSettings: [createProfile("A"), createProfile("B", { needsReview: true })]
    }), CountRoundFinalizationError);
});

await runTest("mesmo item em dois locais permanece ocorrência independente", () => {
    const plan = finalize();
    const itemAZeros = plan.entriesToAdd.filter((entry) => entry.itemCode === "A");
    assert.equal(itemAZeros.length, 2);
    assert.equal(new Set(itemAZeros.map((entry) => entry.linkId)).size, 2);
});

await runTest("plano congelado não consulta nodes ou links live", () => {
    const source = readSource("src/countRoundFinalization.js");
    assert.doesNotMatch(source, /from "\.\/locationNodes|from "\.\/itemLocationLinks|buildOperationalHierarchy/);
});

await runTest("pai não agrega descendants no plano final", () => {
    const plan = finalize();
    assert.deepEqual(plan.round.locations.map((location) => location.plannedItems.length), [2, 1]);
});

await runTest("session incompatível falha fechado", () => {
    const input = createPlanInput();
    input.sessions[0].locationPathSnapshot = ["Outro local"];
    assert.throws(() => buildCountRoundFinalizationPlan(input), /diverge do plano congelado/i);
});

await runTest("sessionId apontando para session ausente falha fechado", () => {
    assert.throws(() => finalize({ sessions: [] }), /session ausente/i);
});

await runTest("colisão de session materializada falha fechado", () => {
    const input = createPlanInput({ createSessionId: () => "session-bar" });
    assert.throws(() => buildCountRoundFinalizationPlan(input), /ID da session materializada/i);
});

await runTest("colisão de entry zero falha fechado", () => {
    const input = createPlanInput({ createEntryId: () => "entry-collision" });
    input.entries = [createEntry(input.sessions[0], input.sessions[0].plannedItems[0], { id: "entry-collision" })];
    assert.throws(() => buildCountRoundFinalizationPlan(input), /ID do zero explícito/i);
});

await runTest("colisão de snapshot falha fechado", () => {
    const completed = finalize();
    assert.throws(() => finalize({ snapshots: [completed.snapshot] }), /ID do snapshot final/i);
});

await runTest("todas as sessions terminam no mesmo timestamp", () => {
    const plan = finalize();
    assert.deepEqual(new Set(plan.sessionsToPut.map((session) => session.finishedAt)), new Set([timestamp]));
    assert.equal(plan.sessionsToPut.every((session) => session.status === "completed"), true);
});

await runTest("startedAt existente é preservado", () => {
    const input = createPlanInput();
    input.sessions[0] = { ...input.sessions[0], status: "in_progress", startedAt: "2026-08-15T17:00:00.000Z" };
    const plan = buildCountRoundFinalizationPlan(input);
    assert.equal(plan.sessionsToPut.find((session) => session.id === "session-bar").startedAt, input.sessions[0].startedAt);
});

await runTest("session draft e sintética recebem timestamp global como startedAt", () => {
    const plan = finalize();
    assert.equal(plan.sessionsToPut.every((session) => session.startedAt === timestamp), true);
});

await runTest("snapshot contém exatamente as sessions da round", () => {
    const plan = finalize();
    assert.deepEqual(
        new Set(plan.snapshot.sessionsIncluded.map((session) => session.id)),
        new Set(plan.round.locations.map((location) => location.sessionId))
    );
});

await runTest("snapshot nasce finalizado", () => {
    const snapshot = finalize().snapshot;
    assert.equal(snapshot.finalizedAt, timestamp);
    assert.equal(snapshot.finalizedStatus, "finalized");
});

await runTest("completion contabiliza cobertura e zeros", () => {
    const plan = finalize();
    assert.deepEqual({
        total: plan.round.completion.totalPlannedOccurrences,
        covered: plan.round.completion.coveredBeforeFinalization,
        zeros: plan.round.completion.explicitZeroEntryCount
    }, { total: 3, covered: 0, zeros: 3 });
});

await runTest("round concluída deixa de ser active", () => {
    const round = finalize().round;
    assert.equal(round.status, "completed");
    assert.equal(round.activeTemplateId, undefined);
});

await runTest("segunda finalização coerente é idempotente", () => {
    const { firstPlan, completedInput } = createCompletedPlanInput();
    let generatedIdCount = 0;
    const second = buildCountRoundFinalizationPlan({
        ...completedInput,
        createSessionId: () => { generatedIdCount += 1; return "unexpected-session"; },
        createEntryId: () => { generatedIdCount += 1; return "unexpected-entry"; },
        createSnapshotId: () => { generatedIdCount += 1; return "unexpected-snapshot"; }
    });
    assert.equal(second.wasAlreadyCompleted, true);
    assert.equal(second.changed, false);
    assert.deepEqual([second.sessionsToPut.length, second.entriesToAdd.length, generatedIdCount], [0, 0, 0]);
    assert.equal(second.snapshot.id, firstPlan.snapshot.id);
    assert.equal(second.snapshots.length, firstPlan.snapshots.length);
});

await runTest("completed rejeita snapshot que omite session final", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.snapshots[0].finalizedSessionIds.pop();
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /sessions finalizadas.*divergem/i);
});

await runTest("completed rejeita snapshot com session estrangeira", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.snapshots[0].finalizedSessionIds.push("session-foreign");
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /sessions finalizadas.*divergem/i);
});

await runTest("completed rejeita session final duplicada no snapshot", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.snapshots[0].finalizedSessionIds.push(
        completedInput.snapshots[0].finalizedSessionIds[0]
    );
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /sessions finalizadas.*divergem/i);
});

await runTest("completed rejeita status divergente entre snapshot e completion", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.snapshots[0].status = completedInput.round.completion.snapshotStatus === "complete"
        ? "partial"
        : "complete";
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /snapshot final diverge/i);
});

await runTest("completed rejeita timestamp final divergente", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.snapshots[0].finalizedAt = "2026-08-15T19:00:00.000Z";
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /snapshot final diverge/i);
});

await runTest("completed rejeita template divergente no snapshot", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.snapshots[0].templateNameSnapshot = "Outro template";
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /snapshot final diverge/i);
});

await runTest("completed rejeita entry com link esperado e item incompatível", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.entries[0].itemCode = "B";
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /entry diverge/i);
});

await runTest("completed rejeita corrupção de grupo antes aceita apenas pelo linkId", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.entries[0].groupNameSnapshot = "Grupo incompatível";
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /entry diverge/i);
});

await runTest("completed rejeita identidade divergente da session persistida", () => {
    const { completedInput } = createCompletedPlanInput();
    completedInput.sessions[0].locationPathSnapshot = ["Outro local"];
    assert.throws(() => buildCountRoundFinalizationPlan(completedInput), /diverge do plano congelado/i);
});

await runTest("completed sem snapshot falha fechado", () => {
    const first = finalize();
    assert.throws(() => buildCountRoundFinalizationPlan({
        ...createPlanInput(),
        round: first.round,
        sessions: first.sessionsToPut,
        entries: first.entriesToAdd,
        snapshots: []
    }), /snapshot/i);
});

await runTest("completed sem cobertura integral falha fechado", () => {
    const first = finalize();
    assert.throws(() => buildCountRoundFinalizationPlan({
        ...createPlanInput(),
        round: first.round,
        sessions: first.sessionsToPut,
        entries: first.entriesToAdd.slice(1),
        snapshots: first.snapshots
    }), /cobertura integral/i);
});

await runTest("IndexedDB mantém v7 e finalização abre os cinco stores", () => {
    const source = readSource("src/db.js");
    const body = source.slice(source.indexOf("export function finalizeCountRoundAtomically"));
    assert.match(source, /const databaseVersion = 7;/);
    ["countRounds", "locationCountSessions", "locationCountEntries", "appState", "countTemplates"]
        .forEach((store) => assert.match(body, new RegExp(`storeNames\\.${store}`)));
    assert.match(body, /"readwrite"/);
});

await runTest("planner roda dentro da transaction antes dos writes", () => {
    const source = readSource("src/db.js");
    const body = source.slice(source.indexOf("export function finalizeCountRoundAtomically"));
    assert.ok(body.indexOf("finalizationPlan = buildPlan") < body.indexOf("sessionStore.put"));
    assert.ok(body.indexOf("finalizationPlan = buildPlan") < body.indexOf("entryStore.add"));
    assert.ok(body.indexOf("finalizationPlan = buildPlan") < body.indexOf("roundStore.put"));
    assert.match(body, /transaction\.abort\(\)/);
});

globalThis.localStorage = createMemoryStorage();
const storage = await import(`../src/storage.js?phase4d=${Date.now()}`);
await storage.initializeStorage();

await runTest("fallback de sucesso grava as quatro coleções", async () => {
    const input = createPlanInput();
    seedFallback(localStorage, input);
    const result = await storage.finalizeCountRound(input.round.id);
    assert.equal(result.round.status, "completed");
    assert.equal(JSON.parse(localStorage.getItem("locationCountSessions")).length, 2);
    assert.equal(JSON.parse(localStorage.getItem("locationCountEntries")).length, 3);
    assert.equal(JSON.parse(localStorage.getItem("consolidationSnapshots")).length, 1);
});

for (const storageKey of [
    "countRounds", "locationCountSessions", "locationCountEntries", "consolidationSnapshots"
]) {
    await runTest(`fallback restaura as quatro coleções quando falha em ${storageKey}`, async () => {
        const input = createPlanInput();
        seedFallback(localStorage, input);
        const before = Object.fromEntries([
            "countRounds", "locationCountSessions", "locationCountEntries", "consolidationSnapshots"
        ].map((key) => [key, localStorage.getItem(key)]));
        localStorage.failOnce(storageKey);
        await assert.rejects(() => storage.finalizeCountRound(input.round.id), /Falha simulada/i);
        Object.entries(before).forEach(([key, value]) => assert.equal(localStorage.getItem(key), value));
    });
}

await runTest("snapshot referenciado por round completed não pode ser apagado", async () => {
    const input = createPlanInput();
    seedFallback(localStorage, input);
    const result = await storage.finalizeCountRound(input.round.id);
    await assert.rejects(() => storage.deleteConsolidationSnapshot(result.snapshot.id), /não pode ser removido/i);
    assert.equal(JSON.parse(localStorage.getItem("consolidationSnapshots")).length, 1);
});

await runTest("reload lógico não ressuscita round active", async () => {
    const rounds = await storage.listCountRounds();
    assert.equal(rounds.some((round) => round.status === "active"), false);
    assert.equal(rounds[0].status, "completed");
});

await runTest("mirror pós-IDB é best effort com warning explícito", () => {
    const source = readSource("src/storage.js");
    const body = source.slice(
        source.indexOf("async function finalizeCountRoundSerialized"),
        source.indexOf("export async function finalizeCountRound")
    );
    assert.match(body, /A contagem foi finalizada no IndexedDB, mas o espelho local não pôde ser atualizado/);
    assert.doesNotMatch(body, /throw mirrorError/);
});

await runTest("finalizador legado continua bloqueado durante round active", () => {
    const source = readSource("src/storage.js");
    assert.match(source, /assertSessionsNotLinkedToActiveRound/);
    assert.match(source, /Finalize a rodada pelo fluxo global/);
});

await runTest("UI oferece somente fechamento global no card da round", () => {
    const index = readSource("index.html");
    const ui = readSource("src/countRoundUi.js");
    assert.match(index, /id="btn-finalize-count-round"[^>]*>Finalizar contagem</);
    assert.match(ui, /onFinalize/);
    assert.doesNotMatch(`${index}\n${ui}`, /Concluir local|Pular|skippedAt/);
});

await runTest("confirmação global informa zeros e locais nunca abertos", () => {
    const main = readSource("src/main.js");
    assert.match(main, /Finalizar a contagem inteira/);
    assert.match(main, /registrada\(s\) como zero/);
    assert.match(main, /locais nunca abertos/);
});

await runTest("Backup Schema 2 permanece sem CountRound", () => {
    const backup = readSource("src/backup.js");
    assert.match(backup, /BACKUP_SCHEMA_VERSION = 2/);
    assert.doesNotMatch(backup, /countRounds|locationCountSessions|locationCountEntries/);
});

await runTest("nenhuma semântica de skip ou fechamento local foi criada", () => {
    const source = `${readSource("src/countRoundFinalization.js")}\n${readSource("src/countRoundUi.js")}`;
    assert.doesNotMatch(source, /skippedAt|Concluir local|Próximo|Anterior/);
});

await runTest("Miolo 3L continua convertendo para 7.5 l", async () => {
    const { summarizeConvertedEntries } = await import("../src/unitConversion.js");
    const profile = {
        baseUnit: "l",
        allowedUnits: [
            { label: "un", normalizedUnit: "un", factorToBase: "3" },
            { label: "ml", normalizedUnit: "ml", factorToBase: "0.001" },
            { label: "l", normalizedUnit: "l", factorToBase: "1" }
        ]
    };
    const entries = [["2", "un"], ["500", "ml"], ["1", "l"]].map(([quantityDecimal, rawUnit]) => ({
        active: true, quantityDecimal, rawUnit
    }));
    assert.equal(summarizeConvertedEntries(entries, profile).totalConvertedDecimal, "7.5");
});

assert.ok(executedTestCount >= 40);
console.log(`PASS validate-phase4d-count-round-finalization: ${executedTestCount} casos.`);
