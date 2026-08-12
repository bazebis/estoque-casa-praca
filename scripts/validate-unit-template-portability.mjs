import assert from "node:assert/strict";
import {
    areItemUnitSettingsSemanticallyEqual,
    buildUnitProfileTemplateExport,
    buildUnitProfileTemplateImportPlan,
    mergeImportedItemUnitSettings,
    stripUnitProfileTransport
} from "../src/itemUnitTemplatePortability.js";
import { normalizeItemUnitSetting } from "../src/itemUnitSettings.js";
import { convertEntryToBase, findAllowedUnit } from "../src/unitConversion.js";

const timestamp = "2026-01-01T00:00:00.000Z";
const itemCodes = ["ITEM-UN", "ITEM-KG", "ITEM-L", "ITEM-PORCAO", "ITEM-FARDO", "ITEM-CAIXA", "ITEM-PACOTE", "ITEM-SEM-PERFIL"];

function createTemplate(templateId = "template-a") {
    return {
        id: templateId,
        name: "Template de validação",
        groups: [{
            id: "grupo-1",
            name: "Grupo de validação",
            order: 1,
            countAreas: ["AREA"],
            totalArea: "TOTAL",
            items: itemCodes.map((code, index) => ({ code, name: `Item ${index + 1}`, order: index + 1, countAreas: ["AREA"] }))
        }]
    };
}

function createAllowedUnit(label, normalizedUnit, kind, factorToBase, extra = {}) {
    return {
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        normalizedUnit,
        kind,
        factorToBase,
        portionWeightGrams: null,
        requiresReview: !factorToBase,
        notes: "",
        ...extra
    };
}

function createProfile(itemCode, baseUnit, defaultInputUnit, allowedUnits, extra = {}) {
    return normalizeItemUnitSetting({
        templateId: extra.templateId || "template-a",
        itemCode,
        itemNameSnapshot: `Nome ${itemCode}`,
        groupId: "grupo-1",
        groupNameSnapshot: "Grupo de validação",
        baseUnit,
        defaultInputUnit,
        allowedUnits,
        source: "manual",
        confidence: "high",
        needsReview: extra.needsReview === true,
        notes: extra.notes || "",
        createdAt: timestamp,
        updatedAt: timestamp,
        suggestedUnit: defaultInputUnit,
        manualUnit: defaultInputUnit,
        effectiveUnit: defaultInputUnit
    }, timestamp);
}

const unitProfile = createProfile("ITEM-UN", "un", "un", [
    createAllowedUnit("un", "un", "unit", "1")
]);
const massProfile = createProfile("ITEM-KG", "kg", "kg", [
    createAllowedUnit("kg", "kg", "mass", "1"),
    createAllowedUnit("g", "g", "mass", "0.001")
]);
const volumeProfile = createProfile("ITEM-L", "l", "l", [
    createAllowedUnit("l", "l", "volume", "1"),
    createAllowedUnit("ml", "ml", "volume", "0.001")
]);
const portionProfile = createProfile("ITEM-PORCAO", "kg", "porção 200 g", [
    createAllowedUnit("kg", "kg", "mass", "1"),
    createAllowedUnit("g", "g", "mass", "0.001"),
    createAllowedUnit("porção 200 g", "porção 200 g", "portion", "0.2", {
        portionWeightGrams: 200,
        variantFamily: "porção",
        variantValue: "200",
        variantUnit: "g",
        legacyLabels: ["porção"]
    }),
    createAllowedUnit("porção 500 g", "porção 500 g", "portion", "0.5", {
        portionWeightGrams: 500,
        variantFamily: "porção",
        variantValue: "500",
        variantUnit: "g",
        legacyLabels: []
    })
]);
const fardoProfile = createProfile("ITEM-FARDO", "un", "fardo 12", [
    createAllowedUnit("un", "un", "unit", "1"),
    createAllowedUnit("fardo 12", "fardo 12", "package", "12", {
        variantFamily: "fardo", variantValue: "12", variantUnit: "un", legacyLabels: []
    })
]);
const boxProfile = createProfile("ITEM-CAIXA", "un", "caixa 6", [
    createAllowedUnit("un", "un", "unit", "1"),
    createAllowedUnit("caixa 6", "caixa 6", "package", "6", {
        variantFamily: "caixa", variantValue: "6", variantUnit: "un", legacyLabels: []
    })
]);
const packageProfile = createProfile("ITEM-PACOTE", "un", "pacote 10", [
    createAllowedUnit("un", "un", "unit", "1"),
    createAllowedUnit("pacote 10", "pacote 10", "package", "10", {
        variantFamily: "pacote", variantValue: "10", variantUnit: "un", legacyLabels: []
    })
]);
const explicitProfiles = [unitProfile, massProfile, volumeProfile, portionProfile, fardoProfile, boxProfile, packageProfile];
const template = createTemplate();
const exportResult = buildUnitProfileTemplateExport(template, [
    ...explicitProfiles,
    createProfile("ITEM-UN", "un", "un", [createAllowedUnit("un", "un", "unit", "1")], { templateId: "template-b" })
]);

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function payloadWithProfiles(...itemCodesToInclude) {
    const payload = clone(exportResult.template);
    payload.itemUnitSettings = payload.itemUnitSettings.filter((profile) => itemCodesToInclude.includes(profile.itemCode));
    return payload;
}

function createSession(status, templateId = "template-a") {
    return { id: "session-1", templateId, status };
}

function createEntry({ itemCode = "ITEM-UN", templateId = "template-a", active = true } = {}) {
    return { id: "entry-1", sessionId: "session-1", templateId, itemCode, active };
}

function buildPlan(payload, options = {}) {
    return buildUnitProfileTemplateImportPlan({
        payload,
        timestamp,
        localSettings: options.localSettings || [],
        existingTemplate: options.existingTemplate || null,
        sessions: options.sessions || [],
        entries: options.entries || []
    });
}

const tests = [];
function test(name, assertion) {
    tests.push({ name, assertion });
}

test("1-9 round-trip preserva perfis, variantes, aliases e fator decimal", () => {
    assert.equal(exportResult.isValid, true);
    assert.equal(exportResult.template.unitProfilesSchemaVersion, 1);
    const cleanPlan = buildPlan(exportResult.template);
    assert.equal(cleanPlan.isValid, true);
    assert.equal(cleanPlan.settingsToApply.length, explicitProfiles.length);
    cleanPlan.settingsToApply.forEach((setting) => {
        const original = explicitProfiles.find((profile) => profile.itemCode === setting.itemCode);
        assert.equal(areItemUnitSettingsSemanticallyEqual(setting, original), true);
    });
});

test("10-13 exporta somente explícitos do template e permite progresso parcial", () => {
    assert.equal(exportResult.summary.explicitProfileCount, explicitProfiles.length);
    assert.equal(exportResult.summary.remainingWithoutExplicitProfileCount, 1);
    assert.equal(exportResult.template.itemUnitSettings.some((profile) => profile.itemCode === "ITEM-SEM-PERFIL"), false);
    assert.equal(exportResult.template.itemUnitSettings.every((profile) => !profile.templateId && !profile.createdAt), true);
});

test("14 template legado continua válido sem mutar perfis", () => {
    const legacyPlan = buildPlan(stripUnitProfileTransport(exportResult.template), { localSettings: [unitProfile] });
    assert.equal(legacyPlan.isValid, true);
    assert.equal(legacyPlan.isLegacy, true);
    assert.deepEqual(legacyPlan.settingsToApply, []);
});

test("15 instalação limpa aplica semanticamente todos os perfis", () => {
    const plan = buildPlan(exportResult.template);
    const merged = mergeImportedItemUnitSettings([], plan.settingsToApply);
    assert.equal(merged.length, explicitProfiles.length);
    assert.equal(merged.every((setting) => explicitProfiles.some((profile) => areItemUnitSettingsSemanticallyEqual(setting, profile))), true);
});

test("16 perfil local igual é no-op", () => {
    const plan = buildPlan(payloadWithProfiles("ITEM-UN"), { localSettings: [{ ...unitProfile, updatedAt: "2026-02-01T00:00:00.000Z" }] });
    assert.equal(plan.isValid, true);
    assert.deepEqual(plan.noOpItemCodes, ["ITEM-UN"]);
    assert.equal(plan.settingsToApply.length, 0);
});

test("17 perfil local diferente é preservado como conflito", () => {
    const localSetting = { ...unitProfile, notes: "decisão local" };
    const plan = buildPlan(payloadWithProfiles("ITEM-UN"), { localSettings: [localSetting] });
    assert.equal(plan.isValid, true);
    assert.equal(plan.conflicts.length, 1);
    assert.deepEqual(mergeImportedItemUnitSettings([localSetting], plan.settingsToApply), [localSetting]);
});

test("18 item inexistente falha antes de escrita", () => {
    const payload = payloadWithProfiles("ITEM-UN");
    payload.itemUnitSettings[0].itemCode = "INEXISTENTE";
    const plan = buildPlan(payload);
    assert.equal(plan.isValid, false);
    assert.deepEqual(plan.settingsToApply, []);
});

test("19 itemCode duplicado falha antes de escrita", () => {
    const payload = payloadWithProfiles("ITEM-UN");
    payload.itemUnitSettings.push(clone(payload.itemUnitSettings[0]));
    const plan = buildPlan(payload);
    assert.equal(plan.isValid, false);
    assert.deepEqual(plan.settingsToApply, []);
});

test("20-21 perfil inválido invalida o lote inteiro", () => {
    const payload = payloadWithProfiles("ITEM-UN", "ITEM-KG");
    payload.itemUnitSettings[1].allowedUnits[0].factorToBase = "-1";
    const plan = buildPlan(payload);
    assert.equal(plan.isValid, false);
    assert.deepEqual(plan.settingsToApply, []);
});

for (const status of ["draft", "in_progress"]) {
    test(`${status} com entrada ativa bloqueia`, () => {
        const plan = buildPlan(payloadWithProfiles("ITEM-UN"), {
            sessions: [createSession(status)],
            entries: [createEntry()]
        });
        assert.equal(plan.isValid, false);
        assert.deepEqual(plan.blockedItemCodes, ["ITEM-UN"]);
    });
}

test("24 sessão aberta sem entrada do item permite", () => {
    assert.equal(buildPlan(payloadWithProfiles("ITEM-UN"), { sessions: [createSession("draft")] }).isValid, true);
});

test("25 entrada removida permite", () => {
    const plan = buildPlan(payloadWithProfiles("ITEM-UN"), {
        sessions: [createSession("draft")], entries: [createEntry({ active: false })]
    });
    assert.equal(plan.isValid, true);
});

for (const status of ["completed", "canceled"]) {
    test(`${status} não bloqueia`, () => {
        const plan = buildPlan(payloadWithProfiles("ITEM-UN"), {
            sessions: [createSession(status)], entries: [createEntry()]
        });
        assert.equal(plan.isValid, true);
    });
}

test("28 outro item não interfere", () => {
    const plan = buildPlan(payloadWithProfiles("ITEM-UN"), {
        sessions: [createSession("draft")], entries: [createEntry({ itemCode: "ITEM-KG" })]
    });
    assert.equal(plan.isValid, true);
});

test("29 outro template não interfere", () => {
    const plan = buildPlan(payloadWithProfiles("ITEM-UN"), {
        sessions: [createSession("draft", "template-b")],
        entries: [createEntry({ templateId: "template-b" })]
    });
    assert.equal(plan.isValid, true);
});

test("30 substituição protegida não altera semanticamente item ativo", () => {
    const payload = payloadWithProfiles("ITEM-UN");
    payload.groups[0].items[0].name = "Nome alterado";
    const plan = buildPlan(payload, {
        localSettings: [unitProfile],
        existingTemplate: template,
        sessions: [createSession("draft")],
        entries: [createEntry()]
    });
    assert.equal(plan.isValid, false);
    assert.match(plan.error, /seria alterado pelo template/);
});

test("31-32 falha não modifica sessões nem entradas", () => {
    const sessions = [createSession("draft")];
    const entries = [createEntry()];
    const before = JSON.stringify({ sessions, entries });
    buildPlan(payloadWithProfiles("ITEM-UN"), { sessions, entries });
    assert.equal(JSON.stringify({ sessions, entries }), before);
});

test("33 regressões de conversão continuam válidas", () => {
    const bottleProfile = createProfile("ITEM-L", "l", "garrafa", [
        createAllowedUnit("l", "l", "volume", "1"),
        createAllowedUnit("garrafa", "garrafa", "bottle", "0.75")
    ]);
    const cases = [
        [unitProfile, "un", "2", "2"],
        [massProfile, "g", "500", "0.5"],
        [massProfile, "kg", "0.5", "0.5"],
        [volumeProfile, "ml", "250", "0.25"],
        [portionProfile, "porção 200 g", "2", "0.4"],
        [portionProfile, "porção 500 g", "2", "1"],
        [fardoProfile, "fardo 12", "2", "24"],
        [boxProfile, "caixa 6", "2", "12"],
        [packageProfile, "pacote 10", "2", "20"],
        [bottleProfile, "garrafas", "2", "1.5"]
    ];
    cases.forEach(([profile, rawUnit, quantityDecimal, expected]) => {
        const conversion = convertEntryToBase({ rawUnit, quantityDecimal }, profile);
        assert.equal(conversion.convertedQuantityDecimal, expected);
    });
    const legacyPortion = findAllowedUnit(portionProfile, "porção");
    assert.equal(legacyPortion.label, "porção 200 g");
});

test("33 unidade sem fator continua pendente", () => {
    const pendingProfile = createProfile("ITEM-CAIXA", "un", "caixa", [
        createAllowedUnit("un", "un", "unit", "1"),
        createAllowedUnit("caixa", "caixa", "package", null, { requiresReview: true })
    ], { needsReview: true });
    assert.equal(convertEntryToBase({ rawUnit: "caixa", quantityDecimal: "2" }, pendingProfile).isConvertible, false);
});

test("34 guarda continua diferenciando o escopo da entrada", () => {
    const blocked = buildPlan(payloadWithProfiles("ITEM-UN"), {
        sessions: [createSession("draft")], entries: [createEntry()]
    });
    const allowed = buildPlan(payloadWithProfiles("ITEM-UN"), {
        sessions: [createSession("completed")], entries: [createEntry()]
    });
    assert.equal(blocked.isValid, false);
    assert.equal(allowed.isValid, true);
});

for (const { name, assertion } of tests) {
    assertion();
    console.log(`OK ${name}`);
}

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear()
    };
}

globalThis.localStorage = createMemoryStorage();
const storage = await import("../src/storage.js");
await storage.initializeStorage();
const persistedImport = await storage.importCountTemplateWithUnitProfiles(exportResult.template, {
    importedAt: timestamp,
    importFileName: "template-validacao.json"
});
assert.equal(persistedImport.summary.appliedCount, explicitProfiles.length);
assert.equal((await storage.listItemUnitSettings()).length, explicitProfiles.length);
const storedTemplate = await storage.getCountTemplate("template-a");
assert.equal("itemUnitSettings" in storedTemplate, false);
assert.equal("unitProfilesSchemaVersion" in storedTemplate, false);

const invalidPersistedPayload = payloadWithProfiles("ITEM-UN", "ITEM-KG");
invalidPersistedPayload.itemUnitSettings[1].allowedUnits[0].factorToBase = "inválido";
const stateBeforeInvalidImport = {
    templateJson: localStorage.getItem("countTemplates"),
    settingsJson: localStorage.getItem("itemUnitSettings")
};
await assert.rejects(storage.importCountTemplateWithUnitProfiles(invalidPersistedPayload), /fator inválido/);
assert.equal(localStorage.getItem("countTemplates"), stateBeforeInvalidImport.templateJson);
assert.equal(localStorage.getItem("itemUnitSettings"), stateBeforeInvalidImport.settingsJson);

localStorage.setItem("itemUnitSettings", "[]");
localStorage.setItem("locationCountSessions", JSON.stringify([createSession("draft")]));
localStorage.setItem("locationCountEntries", JSON.stringify([createEntry()]));
const protectedStateBefore = {
    template: await storage.getCountTemplate("template-a"),
    sessionsJson: localStorage.getItem("locationCountSessions"),
    entriesJson: localStorage.getItem("locationCountEntries")
};
await assert.rejects(
    storage.importCountTemplateWithUnitProfiles(payloadWithProfiles("ITEM-UN"), { importedAt: timestamp }),
    /contagem aberta/
);
assert.deepEqual(await storage.listItemUnitSettings(), []);
assert.deepEqual(await storage.getCountTemplate("template-a"), protectedStateBefore.template);
assert.equal(localStorage.getItem("locationCountSessions"), protectedStateBefore.sessionsJson);
assert.equal(localStorage.getItem("locationCountEntries"), protectedStateBefore.entriesJson);
console.log("OK persistência batch e guarda no limite real de escrita");

console.log(`PORTABILITY_VALIDATION_OK ${tests.length + 1} grupos de teste`);
