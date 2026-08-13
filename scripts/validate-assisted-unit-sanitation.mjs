import assert from "node:assert/strict";
import fs from "node:fs";
import {
    buildAssistedUnitSuggestionPlan,
    inferUnitForTemplateItem,
    validateAssistedUnitSuggestion
} from "../src/itemUnitSettings.js";
import {
    areItemUnitSettingsSemanticallyEqual,
    buildUnitProfileTemplateExport,
    buildUnitProfileTemplateImportPlan
} from "../src/itemUnitTemplatePortability.js";
import { convertEntryToBase } from "../src/unitConversion.js";

const realTemplate = JSON.parse(fs.readFileSync("data/generated/count-template-cdp.json", "utf8"));
const syntheticTemplate = {
    id: "assisted-sanitation-test",
    name: "Template de saneamento assistido",
    groups: [{
        id: "group-test",
        name: "Grupo de teste",
        order: 1,
        countAreas: ["AREA"],
        totalArea: "TOTAL",
        items: [
            { code: "ITEM-UN", name: "PRODUTO UNI", order: 1, countAreas: ["AREA"] },
            { code: "ITEM-G", name: "PRODUTO GR", order: 2, countAreas: ["AREA"] },
            { code: "ITEM-INCOMPLETO", name: "PRODUTO SEM REGRA", order: 3, countAreas: ["AREA"] }
        ]
    }]
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
    const values = new Map();
    let nextReadCallback = null;

    return {
        getItem: (key) => {
            const callback = nextReadCallback;
            nextReadCallback = null;
            if (callback) callback(key);
            return values.has(key) ? values.get(key) : null;
        },
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
        onNextRead: (callback) => { nextReadCallback = callback; }
    };
}

function setStoredState({ template = syntheticTemplate, settings = [], sessions = [], entries = [] } = {}) {
    localStorage.clear();
    localStorage.setItem("countTemplates", JSON.stringify([template]));
    localStorage.setItem("itemUnitSettings", JSON.stringify(settings));
    localStorage.setItem("locationCountSessions", JSON.stringify(sessions));
    localStorage.setItem("locationCountEntries", JSON.stringify(entries));
}

function createSession(status, templateId = syntheticTemplate.id) {
    return { id: "session-test", templateId, status };
}

function createEntry(itemCode = "ITEM-UN", active = true, templateId = syntheticTemplate.id) {
    return {
        id: "entry-test",
        sessionId: "session-test",
        templateId,
        itemCode,
        rawUnit: "un",
        active,
        removedAt: active ? null : "2026-01-01T00:00:00.000Z"
    };
}

function buildSyntheticPlan(explicitSettings = [], entries = []) {
    return buildAssistedUnitSuggestionPlan({
        template: syntheticTemplate,
        explicitSettings,
        previousEntries: entries
    });
}

function findRealItem(namePattern) {
    for (const group of realTemplate.groups) {
        const item = group.items.find((candidate) => namePattern.test(candidate.name));
        if (item) return item;
    }
    throw new Error(`Item real não encontrado: ${namePattern}`);
}

function assertConversion(profile, rawUnit, quantityDecimal, expected) {
    const conversion = convertEntryToBase({ rawUnit, quantityDecimal }, profile);
    assert.equal(conversion.isConvertible, true);
    assert.equal(conversion.convertedQuantityDecimal, expected);
}

const syntheticPlan = buildSyntheticPlan();
assert.equal(syntheticPlan.isValid, true);
assert.equal(syntheticPlan.candidates.length, 2);
const safeSuggestion = syntheticPlan.candidates.find((setting) => setting.itemCode === "ITEM-UN");
const incompleteSuggestion = inferUnitForTemplateItem(syntheticTemplate, "ITEM-INCOMPLETO");

assert.equal(validateAssistedUnitSuggestion(safeSuggestion).isEligible, true);
assert.equal(buildSyntheticPlan([safeSuggestion]).candidates.some((item) => item.itemCode === "ITEM-UN"), false);
assert.equal(validateAssistedUnitSuggestion(incompleteSuggestion).isEligible, false);
assert.equal(validateAssistedUnitSuggestion({ ...safeSuggestion, needsReview: true }).isEligible, false);

const requiresReviewSuggestion = clone(safeSuggestion);
requiresReviewSuggestion.allowedUnits[0].requiresReview = true;
assert.equal(validateAssistedUnitSuggestion(requiresReviewSuggestion).isEligible, false);

const invalidFactorSuggestion = clone(safeSuggestion);
invalidFactorSuggestion.allowedUnits[0].factorToBase = "0";
assert.equal(validateAssistedUnitSuggestion(invalidFactorSuggestion).isEligible, false);
assert.equal(validateAssistedUnitSuggestion({ ...safeSuggestion, defaultInputUnit: "caixa" }).isEligible, false);

const furstItem = findRealItem(/FURST PILSEN/);
const furstSuggestion = inferUnitForTemplateItem(realTemplate, furstItem);
const invalidVariantSuggestion = clone(furstSuggestion);
invalidVariantSuggestion.allowedUnits.find((unit) => unit.variantFamily).variantValue = "12.5";
assert.equal(validateAssistedUnitSuggestion(invalidVariantSuggestion).isEligible, false);
console.log("OK 1-8 seleção canônica de candidatos");

globalThis.localStorage = createMemoryStorage();
const storage = await import("../src/storage.js");
await storage.initializeStorage();

setStoredState();
const validPlan = buildSyntheticPlan();
const validResult = await storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, validPlan.candidates);
assert.equal(validResult.confirmedCount, 2);
assert.equal((await storage.listItemUnitSettings()).length, 2);
console.log("OK 9 lote válido persiste todos os candidatos");

setStoredState();
const explicitSetting = { ...safeSuggestion, notes: "decisão humana preservada" };
await storage.saveItemUnitSetting(explicitSetting);
const explicitBefore = await storage.getItemUnitSetting(syntheticTemplate.id, "ITEM-UN");
const planWithExplicit = buildSyntheticPlan([explicitBefore]);
await storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, planWithExplicit.candidates);
const explicitAfter = await storage.getItemUnitSetting(syntheticTemplate.id, "ITEM-UN");
assert.deepEqual(explicitAfter, explicitBefore);
console.log("OK 10 perfil explícito preexistente permanece inalterado");

for (const status of ["draft", "in_progress"]) {
    setStoredState({ sessions: [createSession(status)], entries: [createEntry()] });
    const selected = buildSyntheticPlan([], [createEntry()]).candidates;
    const sessionsBefore = localStorage.getItem("locationCountSessions");
    const entriesBefore = localStorage.getItem("locationCountEntries");
    await assert.rejects(storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, selected), /contagem aberta/);
    assert.deepEqual(await storage.listItemUnitSettings(), []);
    assert.equal(localStorage.getItem("locationCountSessions"), sessionsBefore);
    assert.equal(localStorage.getItem("locationCountEntries"), entriesBefore);
}
console.log("OK 11-12 draft e in_progress bloqueiam o lote inteiro sem mutar contagem");

for (const state of [
    { sessions: [createSession("draft")], entries: [createEntry("ITEM-UN", false)] },
    { sessions: [createSession("completed")], entries: [createEntry()] },
    { sessions: [createSession("canceled")], entries: [createEntry()] }
]) {
    setStoredState(state);
    const selected = buildSyntheticPlan([], state.entries).candidates;
    const result = await storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, selected);
    assert.equal(result.confirmedCount, 2);
}
console.log("OK 13 entrada removida, completed e canceled não bloqueiam");

setStoredState();
const selectionBeforeRace = buildSyntheticPlan().candidates;
await storage.saveItemUnitSetting(safeSuggestion);
const stateBeforeRaceAttempt = localStorage.getItem("itemUnitSettings");
await assert.rejects(
    storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, selectionBeforeRace),
    /sugestões mudaram/
);
assert.equal(localStorage.getItem("itemUnitSettings"), stateBeforeRaceAttempt);
console.log("OK 14 corrida seleção/escrita preserva explícito e aborta o lote");

for (const invalidSelection of [
    [...buildSyntheticPlan().candidates, buildSyntheticPlan().candidates[0]],
    [{ ...buildSyntheticPlan().candidates[0], itemCode: "ITEM-INEXISTENTE" }]
]) {
    setStoredState();
    await assert.rejects(storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, invalidSelection));
    assert.deepEqual(await storage.listItemUnitSettings(), []);
}
console.log("OK 15 item inexistente ou duplicado resulta em zero writes");

setStoredState();
const firstSelection = buildSyntheticPlan().candidates;
await storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, firstSelection);
const settingsAfterFirstConfirmation = await storage.listItemUnitSettings();
const secondPlan = buildSyntheticPlan(settingsAfterFirstConfirmation);
assert.equal(secondPlan.candidates.length, 0);
const secondResult = await storage.confirmReadyItemUnitSuggestions(syntheticTemplate.id, secondPlan.candidates);
assert.equal(secondResult.confirmedCount, 0);
assert.deepEqual(await storage.listItemUnitSettings(), settingsAfterFirstConfirmation);
console.log("OK 16 segunda execução é idempotente e não escreve duplicatas");

setStoredState({ template: realTemplate });
const realPlan = buildAssistedUnitSuggestionPlan({ template: realTemplate });
const realConfirmation = await storage.confirmReadyItemUnitSuggestions(realTemplate.id, realPlan.candidates);
const confirmedRealSettings = await storage.listItemUnitSettings();
assert.equal(realConfirmation.confirmedCount, realPlan.candidates.length);

const wasteBag = confirmedRealSettings.find((setting) => setting.itemCode === "502130008");
assert.equal(wasteBag.baseUnit, "pacote");
assert.equal(wasteBag.allowedUnits.find((unit) => unit.label === "pacote").factorToBase, "1");

const confirmedFurst = confirmedRealSettings.find((setting) => setting.itemCode === furstItem.code);
assert.equal(confirmedFurst.baseUnit, "garrafa");
assert.equal(confirmedFurst.allowedUnits.find((unit) => unit.label === "caixa 12").factorToBase, "12");
assertConversion(confirmedFurst, "caixa 12", "1", "12");

const cachaca = confirmedRealSettings.find((setting) => setting.itemCode === "981910291");
assert.equal(cachaca.baseUnit, "garrafa");
assertConversion(cachaca, "ml", "750", "1");
assertConversion(cachaca, "ml", "375", "0.5");
assertConversion(cachaca, "ml", "1500", "2");
assert.equal(areItemUnitSettingsSemanticallyEqual(confirmedFurst, furstSuggestion), true);
console.log("OK 17-20 regras reais, variantes e fatores sobrevivem à persistência");

const exportResult = buildUnitProfileTemplateExport(realTemplate, confirmedRealSettings);
assert.equal(exportResult.isValid, true);
assert.equal(exportResult.summary.explicitProfileCount, confirmedRealSettings.length);
const roundTrip = buildUnitProfileTemplateImportPlan({ payload: exportResult.template, localSettings: [] });
assert.equal(roundTrip.isValid, true);
assert.equal(roundTrip.settingsToApply.length, confirmedRealSettings.length);
roundTrip.settingsToApply.forEach((setting) => {
    const original = confirmedRealSettings.find((candidate) => candidate.itemCode === setting.itemCode);
    assert.equal(areItemUnitSettingsSemanticallyEqual(setting, original), true);
});
console.log("OK 21-22 exportação schema 1 e round-trip preservam confirmados");

setStoredState();
const selectionForConcurrentSave = buildSyntheticPlan().candidates;
let concurrentSavePromise;
localStorage.onNextRead(() => {
    concurrentSavePromise = storage.saveItemUnitSetting({
        ...safeSuggestion,
        notes: "alteração manual posterior ao lote"
    });
});
const concurrentBatchResult = await storage.confirmReadyItemUnitSuggestions(
    syntheticTemplate.id,
    selectionForConcurrentSave
);
assert.ok(concurrentSavePromise, "O save concorrente deve ser disparado durante a leitura interna do batch.");
await concurrentSavePromise;
const settingsAfterConcurrentSave = await storage.listItemUnitSettings();
assert.equal(concurrentBatchResult.confirmedCount, 2);
assert.equal(settingsAfterConcurrentSave.length, 2);
assert.equal(
    settingsAfterConcurrentSave.find((setting) => setting.itemCode === "ITEM-UN").notes,
    "alteração manual posterior ao lote"
);
assert.ok(settingsAfterConcurrentSave.some((setting) => setting.itemCode === "ITEM-G"));
console.log("OK 23 batch em andamento serializa save manual sem perder alterações");

setStoredState();
const selectionBeforeConcurrentManualSave = buildSyntheticPlan().candidates;
let concurrentBatchPromise;
localStorage.onNextRead(() => {
    concurrentBatchPromise = storage.confirmReadyItemUnitSuggestions(
        syntheticTemplate.id,
        selectionBeforeConcurrentManualSave
    );
});
await storage.saveItemUnitSetting({ ...safeSuggestion, notes: "explícito criado primeiro" });
assert.ok(concurrentBatchPromise, "O batch concorrente deve ser disparado durante o save manual.");
await assert.rejects(concurrentBatchPromise, /sugestões mudaram/);
const settingsAfterManualSaveFirst = await storage.listItemUnitSettings();
assert.equal(settingsAfterManualSaveFirst.length, 1);
assert.equal(settingsAfterManualSaveFirst[0].notes, "explícito criado primeiro");
console.log("OK 24 save manual em andamento faz o batch reler e preservar o explícito");

setStoredState();
await storage.saveItemUnitSetting({ ...safeSuggestion, notes: "será removido" });
const explicitBeforeConcurrentDelete = await storage.listItemUnitSettings();
const selectionForConcurrentDelete = buildSyntheticPlan(explicitBeforeConcurrentDelete).candidates;
let concurrentDeletePromise;
localStorage.onNextRead(() => {
    concurrentDeletePromise = storage.deleteItemUnitSetting(syntheticTemplate.id, "ITEM-UN");
});
const batchBeforeDelete = await storage.confirmReadyItemUnitSuggestions(
    syntheticTemplate.id,
    selectionForConcurrentDelete
);
assert.ok(concurrentDeletePromise, "O delete concorrente deve ser disparado durante o batch.");
await concurrentDeletePromise;
const settingsAfterConcurrentDelete = await storage.listItemUnitSettings();
assert.equal(batchBeforeDelete.confirmedCount, 1);
assert.equal(settingsAfterConcurrentDelete.length, 1);
assert.equal(settingsAfterConcurrentDelete[0].itemCode, "ITEM-G");

setStoredState();
await storage.saveItemUnitSetting({ ...safeSuggestion, notes: "delete começa primeiro" });
const selectionBeforeDeleteFirst = buildSyntheticPlan(await storage.listItemUnitSettings()).candidates;
let batchAfterDeletePromise;
localStorage.onNextRead(() => {
    batchAfterDeletePromise = storage.confirmReadyItemUnitSuggestions(
        syntheticTemplate.id,
        selectionBeforeDeleteFirst
    );
});
await storage.deleteItemUnitSetting(syntheticTemplate.id, "ITEM-UN");
assert.ok(batchAfterDeletePromise, "O batch concorrente deve ser disparado durante o delete.");
await assert.rejects(batchAfterDeletePromise, /sugestões mudaram/);
assert.deepEqual(await storage.listItemUnitSettings(), []);
console.log("OK 25 delete concorrente é preservado nas duas ordens de execução");

setStoredState();
let saveAfterFailurePromise;
localStorage.onNextRead(() => {
    saveAfterFailurePromise = storage.saveItemUnitSetting({
        ...safeSuggestion,
        notes: "fila recuperada após erro"
    });
});
await assert.rejects(
    storage.saveItemUnitSetting({ ...safeSuggestion, itemCode: "ITEM-INEXISTENTE" }),
    /não existe/
);
assert.ok(saveAfterFailurePromise, "A operação seguinte deve entrar na fila antes da falha anterior.");
await saveAfterFailurePromise;
const settingsAfterQueueFailure = await storage.listItemUnitSettings();
assert.equal(settingsAfterQueueFailure.length, 1);
assert.equal(settingsAfterQueueFailure[0].notes, "fila recuperada após erro");
console.log("OK 26 erro não envenena a fila e a mutação seguinte funciona");

console.log(`ASSISTED_UNIT_SANITATION_VALIDATION_OK ${realPlan.candidates.length} candidatos estáticos seguros`);
