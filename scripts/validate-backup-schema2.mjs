import nodeAssert from "node:assert/strict";
import fs from "node:fs";
import {
    BACKUP_SCHEMA_VERSION,
    buildBackupPayload,
    buildBackupRestorePlan,
    normalizeBackupPayload,
    previewBackupPayload,
    validateBackupPayload
} from "../src/backup.js";
import { normalizeItemUnitSetting } from "../src/itemUnitSettings.js";

const timestamp = "2026-01-01T00:00:00.000Z";
let validationCaseCount = 0;

const assert = {
    deepEqual(...argumentsList) {
        nodeAssert.deepEqual(...argumentsList);
        validationCaseCount += 1;
    },
    equal(...argumentsList) {
        nodeAssert.equal(...argumentsList);
        validationCaseCount += 1;
    },
    ok(...argumentsList) {
        nodeAssert.ok(...argumentsList);
        validationCaseCount += 1;
    },
    rejects(...argumentsList) {
        const assertion = nodeAssert.rejects(...argumentsList);
        validationCaseCount += 1;
        return assertion;
    }
};

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function createMemoryStorage() {
    const values = new Map();
    let nextReadCallback = null;
    let failingStorageKey = "";
    return {
        getItem(storageKey) {
            const callback = nextReadCallback;
            nextReadCallback = null;
            if (callback) callback(storageKey);
            return values.has(storageKey) ? values.get(storageKey) : null;
        },
        setItem(storageKey, value) {
            if (storageKey === failingStorageKey) {
                failingStorageKey = "";
                throw new Error(`Falha injetada em ${storageKey}`);
            }
            values.set(storageKey, String(value));
        },
        removeItem: (storageKey) => values.delete(storageKey),
        clear: () => values.clear(),
        onNextRead: (callback) => { nextReadCallback = callback; },
        failNextWriteFor: (storageKey) => { failingStorageKey = storageKey; }
    };
}

function createTemplate(templateId = "template-a", name = "Template A") {
    return {
        id: templateId,
        name,
        groups: [{
            id: "grupo-1",
            name: "Grupo 1",
            order: 1,
            countAreas: ["AREA"],
            totalArea: "TOTAL",
            items: [
                { code: "ITEM-1", name: "Item 1", order: 1, countAreas: ["AREA"] },
                { code: "ITEM-2", name: "Item 2", order: 2, countAreas: ["AREA"] }
            ]
        }]
    };
}

function createAllowedUnit(label = "un", factorToBase = "1", extra = {}) {
    return {
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        normalizedUnit: label,
        kind: "unit",
        factorToBase,
        portionWeightGrams: null,
        requiresReview: factorToBase === null,
        notes: "",
        ...extra
    };
}

function createProfile(itemCode = "ITEM-1", extra = {}) {
    const templateId = extra.templateId || "template-a";
    const allowedUnits = extra.allowedUnits || [createAllowedUnit()];
    return normalizeItemUnitSetting({
        templateId,
        itemCode,
        itemNameSnapshot: `Nome ${itemCode}`,
        groupId: "grupo-1",
        groupNameSnapshot: "Grupo 1",
        baseUnit: extra.baseUnit || "un",
        defaultInputUnit: extra.defaultInputUnit || allowedUnits[0].label,
        allowedUnits,
        source: "manual",
        confidence: "high",
        needsReview: false,
        notes: extra.notes || "",
        createdAt: timestamp,
        updatedAt: timestamp,
        manualUnit: extra.defaultInputUnit || allowedUnits[0].label
    }, timestamp);
}

function createBoxVariantProfile(baseUnit = "un", boxFactor = "12") {
    const baseKind = baseUnit === "l" ? "volume" : "unit";
    return createProfile("ITEM-1", {
        baseUnit,
        defaultInputUnit: baseUnit,
        allowedUnits: [
            createAllowedUnit(baseUnit, "1", { normalizedUnit: baseUnit, kind: baseKind }),
            createAllowedUnit("caixa 12", boxFactor, {
                normalizedUnit: "caixa 12",
                kind: "package",
                variantFamily: "caixa",
                variantValue: "12",
                variantUnit: "un",
                legacyLabels: []
            })
        ]
    });
}

function createBackup({ templates = [createTemplate()], settings = [createProfile()] } = {}) {
    return buildBackupPayload({
        catalogItems: [{ id: "catalog-1", name: "Catálogo", unitId: "un", active: true, order: 0 }],
        countingHistory: [],
        lastFinalizedCount: null,
        customUnits: [],
        countTemplates: templates,
        itemUnitSettings: settings
    });
}

function createSchema1Backup() {
    const schema1 = createBackup();
    schema1.schemaVersion = 1;
    delete schema1.countTemplates;
    delete schema1.itemUnitSettings;
    return schema1;
}

function createCurrentState() {
    return {
        catalogItems: [{ id: "local", name: "Local", unitId: "un", active: true, order: 0 }],
        countingHistory: [],
        customUnits: [],
        countTemplates: [createTemplate("template-local", "Template local")],
        itemUnitSettings: [createProfile("ITEM-1", { templateId: "template-local" })]
    };
}

function setStoredState({ templates = [createTemplate()], settings = [createProfile()], sessions = [], entries = [] } = {}) {
    localStorage.clear();
    localStorage.setItem("itensEstoque", JSON.stringify([]));
    localStorage.setItem("countingHistory", JSON.stringify([]));
    localStorage.setItem("customUnits", JSON.stringify([]));
    localStorage.setItem("countTemplates", JSON.stringify(templates));
    localStorage.setItem("itemUnitSettings", JSON.stringify(settings));
    localStorage.setItem("locationCountSessions", JSON.stringify(sessions));
    localStorage.setItem("locationCountEntries", JSON.stringify(entries));
}

function readStored(storageKey) {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
}

function createSession(status, templateId = "template-a", plannedItemCodes = []) {
    return {
        id: `session-${status}`,
        templateId,
        status,
        plannedItems: plannedItemCodes.map((itemCode) => ({ itemCode, active: true }))
    };
}

function createEntry(status, itemCode = "ITEM-1", templateId = "template-a") {
    return {
        id: `entry-${status}`,
        sessionId: `session-${status}`,
        templateId,
        itemCode,
        rawUnit: "un",
        active: true
    };
}

globalThis.localStorage = createMemoryStorage();
const storage = await import(`../src/storage.js?backup-schema2=${Date.now()}`);

const schema2 = createBackup();
assert.equal(schema2.schemaVersion, BACKUP_SCHEMA_VERSION);
assert.ok(Array.isArray(schema2.countTemplates));
assert.ok(Array.isArray(schema2.itemUnitSettings));
assert.equal(Object.hasOwn(schema2, "localStorageKeys"), false);
assert.equal(Object.hasOwn(schema2, "whatsappSettings"), false);
assert.equal(validateBackupPayload(createSchema1Backup()).isValid, true);
assert.equal(validateBackupPayload({ ...schema2, schemaVersion: 99 }).isValid, false);

const groupsAsObject = createBackup({ settings: [] });
groupsAsObject.countTemplates[0].groups = {};
assert.equal(validateBackupPayload(groupsAsObject).isValid, false);
const nullGroup = createBackup({ settings: [] });
nullGroup.countTemplates[0].groups = [null];
assert.equal(validateBackupPayload(nullGroup).isValid, false);
const itemsAsObject = createBackup({ settings: [] });
itemsAsObject.countTemplates[0].groups[0].items = {};
assert.equal(validateBackupPayload(itemsAsObject).isValid, false);
const nullItem = createBackup({ settings: [] });
nullItem.countTemplates[0].groups[0].items = [null];
assert.equal(validateBackupPayload(nullItem).isValid, false);

const invalidSourceProfile = clone(createProfile());
invalidSourceProfile.source = "batata";
assert.equal(validateBackupPayload(createBackup({ settings: [invalidSourceProfile] })).isValid, false);
const invalidConfidenceProfile = clone(createProfile());
invalidConfidenceProfile.confidence = "improvavel";
assert.equal(validateBackupPayload(createBackup({ settings: [invalidConfidenceProfile] })).isValid, false);
const stringRequiresReviewProfile = clone(createProfile());
stringRequiresReviewProfile.allowedUnits[0].requiresReview = "true";
assert.equal(validateBackupPayload(createBackup({ settings: [stringRequiresReviewProfile] })).isValid, false);

const falseRequiresReviewBackup = createBackup();
const falseRequiresReviewValidation = validateBackupPayload(falseRequiresReviewBackup);
assert.equal(falseRequiresReviewValidation.isValid, true);
assert.equal(falseRequiresReviewValidation.payload.itemUnitSettings[0].allowedUnits[0].requiresReview, false);
const trueRequiresReviewProfile = clone(createProfile());
trueRequiresReviewProfile.allowedUnits[0].requiresReview = true;
const trueRequiresReviewValidation = validateBackupPayload(createBackup({ settings: [trueRequiresReviewProfile] }));
assert.equal(trueRequiresReviewValidation.isValid, true);
assert.equal(trueRequiresReviewValidation.payload.itemUnitSettings[0].allowedUnits[0].requiresReview, true);

const nullCatalogItem = createBackup();
nullCatalogItem.catalog.items = [null];
assert.equal(validateBackupPayload(nullCatalogItem).isValid, false);
const undefinedCatalogItem = createBackup();
undefinedCatalogItem.catalog.items = [undefined];
assert.equal(validateBackupPayload(undefinedCatalogItem).isValid, false);
const primitiveCatalogItem = createBackup();
primitiveCatalogItem.catalog.items = ["item inválido"];
assert.equal(validateBackupPayload(primitiveCatalogItem).isValid, false);
assert.equal(validateBackupPayload(createBackup()).isValid, true);

const currentState = createCurrentState();
const schema1Plan = buildBackupRestorePlan({ payload: createSchema1Backup(), currentState, mode: "replace-all" });
assert.deepEqual(schema1Plan.nextState.countTemplates, currentState.countTemplates);
assert.deepEqual(schema1Plan.nextState.itemUnitSettings, currentState.itemUnitSettings);
const mergePlan = buildBackupRestorePlan({ payload: schema2, currentState, mode: "merge-history" });
assert.deepEqual(mergePlan.nextState.countTemplates, currentState.countTemplates);
assert.deepEqual(mergePlan.nextState.itemUnitSettings, currentState.itemUnitSettings);
const catalogPlan = buildBackupRestorePlan({ payload: schema2, currentState, mode: "replace-catalog" });
assert.deepEqual(catalogPlan.nextState.countTemplates, currentState.countTemplates);
assert.deepEqual(catalogPlan.nextState.itemUnitSettings, currentState.itemUnitSettings);
const replacePlan = buildBackupRestorePlan({ payload: schema2, currentState, mode: "replace-all" });
assert.deepEqual(replacePlan.nextState.countTemplates, normalizeBackupPayload(schema2).countTemplates);
assert.deepEqual(replacePlan.nextState.itemUnitSettings, normalizeBackupPayload(schema2).itemUnitSettings);

setStoredState({ templates: currentState.countTemplates, settings: currentState.itemUnitSettings });
await storage.restoreBackupState(createSchema1Backup(), "replace-all");
assert.deepEqual(readStored("countTemplates"), currentState.countTemplates);
assert.deepEqual(readStored("itemUnitSettings"), currentState.itemUnitSettings);

setStoredState({ templates: currentState.countTemplates, settings: currentState.itemUnitSettings });
await storage.restoreBackupState(schema2, "merge-history");
assert.deepEqual(readStored("countTemplates"), currentState.countTemplates);
assert.deepEqual(readStored("itemUnitSettings"), currentState.itemUnitSettings);

setStoredState({ templates: currentState.countTemplates, settings: currentState.itemUnitSettings });
await storage.restoreBackupState(schema2, "replace-all");
assert.deepEqual(readStored("countTemplates"), normalizeBackupPayload(schema2).countTemplates);
assert.deepEqual(readStored("itemUnitSettings"), normalizeBackupPayload(schema2).itemUnitSettings);

setStoredState();
await storage.restoreBackupState(createBackup({ templates: [], settings: [] }), "replace-all");
assert.deepEqual(readStored("countTemplates"), []);
assert.deepEqual(readStored("itemUnitSettings"), []);

const duplicateTemplate = createBackup({ templates: [createTemplate(), createTemplate()], settings: [] });
assert.equal(validateBackupPayload(duplicateTemplate).isValid, false);
const duplicateProfile = createBackup({ settings: [createProfile(), createProfile()] });
assert.equal(validateBackupPayload(duplicateProfile).isValid, false);
const orphanTemplateProfile = createBackup({ settings: [createProfile("ITEM-1", { templateId: "missing" })] });
assert.equal(validateBackupPayload(orphanTemplateProfile).isValid, false);
const orphanItemProfile = createBackup({ settings: [createProfile("MISSING")] });
assert.equal(validateBackupPayload(orphanItemProfile).isValid, false);

for (const invalidFactor of ["0", "-1", "NaN"]) {
    const invalidProfile = clone(createProfile());
    invalidProfile.allowedUnits[0].factorToBase = invalidFactor;
    assert.equal(validateBackupPayload(createBackup({ settings: [invalidProfile] })).isValid, false);
}
const invalidDefault = clone(createProfile());
invalidDefault.defaultInputUnit = "caixa";
assert.equal(validateBackupPayload(createBackup({ settings: [invalidDefault] })).isValid, false);
const invalidVariant = clone(createProfile());
invalidVariant.allowedUnits[0].variantFamily = "caixa";
assert.equal(validateBackupPayload(createBackup({ settings: [invalidVariant] })).isValid, false);
assert.equal(validateBackupPayload(createBackup({ settings: [createBoxVariantProfile("l")] })).isValid, false);
assert.equal(validateBackupPayload(createBackup({ settings: [createBoxVariantProfile("un")] })).isValid, true);
assert.equal(validateBackupPayload(createBackup({ settings: [createBoxVariantProfile("un", "12.0")] })).isValid, true);
assert.equal(validateBackupPayload(createBackup({ settings: [createBoxVariantProfile("un", "13")] })).isValid, false);

const legacyBaseVariant = createProfile("ITEM-1", {
    baseUnit: "porção 200 g",
    defaultInputUnit: "porção 200 g",
    allowedUnits: [createAllowedUnit("porção 200 g", "1", {
        normalizedUnit: "porção 200 g",
        kind: "portion",
        portionWeightGrams: 200,
        variantFamily: "porção",
        variantValue: "200",
        variantUnit: "g",
        legacyLabels: ["porção"]
    })]
});
assert.equal(validateBackupPayload(createBackup({ settings: [legacyBaseVariant] })).isValid, true);
const discardedUnit = clone(createProfile());
discardedUnit.allowedUnits.push({ label: "" });
assert.equal(validateBackupPayload(createBackup({ settings: [discardedUnit] })).isValid, false);

const variantProfile = createProfile("ITEM-1", {
    baseUnit: "kg",
    defaultInputUnit: "porção 200 g",
    allowedUnits: [
        createAllowedUnit("kg", "1", { normalizedUnit: "kg", kind: "mass" }),
        createAllowedUnit("g", "0.001", { normalizedUnit: "g", kind: "mass" }),
        createAllowedUnit("porção 200 g", "0.2", {
            normalizedUnit: "porção 200 g",
            kind: "portion",
            portionWeightGrams: 200,
            variantFamily: "porção",
            variantValue: "200",
            variantUnit: "g",
            legacyLabels: ["porção"]
        })
    ]
});
const roundTripBackup = createBackup({ settings: [variantProfile] });
const roundTrip = normalizeBackupPayload(roundTripBackup).itemUnitSettings[0];
assert.equal(roundTrip.baseUnit, "kg");
assert.equal(roundTrip.defaultInputUnit, "porção 200 g");
assert.equal(roundTrip.allowedUnits[2].factorToBase, "0.2");
assert.deepEqual(roundTrip.allowedUnits[2].legacyLabels, ["porção"]);
assert.equal(roundTrip.allowedUnits[2].variantFamily, "porção");
assert.equal(normalizeBackupPayload(roundTripBackup).countTemplates.length, 1);
assert.equal(normalizeBackupPayload(roundTripBackup).itemUnitSettings.length, 1);

const realTemplate = JSON.parse(fs.readFileSync("data/generated/count-template-cdp.json", "utf8"));
const realProfiles = realTemplate.groups.flatMap((group) => group.items.map((item) => normalizeItemUnitSetting({
    templateId: realTemplate.id,
    itemCode: item.code,
    itemNameSnapshot: item.name,
    groupId: group.id,
    groupNameSnapshot: group.name,
    baseUnit: "un",
    defaultInputUnit: "un",
    allowedUnits: [createAllowedUnit()],
    source: "manual",
    confidence: "high",
    needsReview: false,
    createdAt: timestamp,
    updatedAt: timestamp
}, timestamp)));
assert.equal(realProfiles.length, 270);
const scaleBackup = createBackup({ templates: [realTemplate], settings: realProfiles });
assert.equal(validateBackupPayload(scaleBackup).isValid, true);
assert.equal(buildBackupRestorePlan({ payload: scaleBackup, currentState: createCurrentState(), mode: "replace-all" }).nextState.itemUnitSettings.length, 270);

async function assertSessionGuard(status, shouldBlock) {
    const changedTemplate = createTemplate("template-a", "Template alterado");
    setStoredState({ sessions: [createSession(status)] });
    const operation = storage.restoreBackupState(createBackup({ templates: [changedTemplate] }), "replace-all");
    if (shouldBlock) await assert.rejects(operation, /Finalize ou cancele/);
    else await operation;
}

await assertSessionGuard("draft", true);
await assertSessionGuard("in_progress", true);
await assertSessionGuard("completed", false);
await assertSessionGuard("canceled", false);
setStoredState({ sessions: [createSession("draft", "template-other")] });
await storage.restoreBackupState(createBackup({ templates: [createTemplate("template-a", "Alterado")] }), "replace-all");

setStoredState({ sessions: [createSession("draft")], entries: [createEntry("draft")] });
const changedProfile = createProfile("ITEM-1", { notes: "alterado" });
await assert.rejects(storage.restoreBackupState(createBackup({ settings: [changedProfile] }), "replace-all"), /contagem aberta|Finalize ou cancele/);

setStoredState({ sessions: [createSession("draft", "template-a", ["ITEM-1"])] });
await assert.rejects(storage.restoreBackupState(createBackup({ settings: [changedProfile] }), "replace-all"), /contagem aberta/);
setStoredState({ sessions: [createSession("draft", "template-a", ["ITEM-2"])] });
await storage.restoreBackupState(createBackup({ settings: [changedProfile] }), "replace-all");

setStoredState();
const stateBeforeInvalidRestore = {
    templates: localStorage.getItem("countTemplates"),
    settings: localStorage.getItem("itemUnitSettings")
};
await assert.rejects(storage.restoreBackupState(orphanItemProfile, "replace-all"));
assert.equal(localStorage.getItem("countTemplates"), stateBeforeInvalidRestore.templates);
assert.equal(localStorage.getItem("itemUnitSettings"), stateBeforeInvalidRestore.settings);

setStoredState();
const stateBeforeFailedWrite = new Map([
    ["itensEstoque", localStorage.getItem("itensEstoque")],
    ["countingHistory", localStorage.getItem("countingHistory")],
    ["customUnits", localStorage.getItem("customUnits")],
    ["countTemplates", localStorage.getItem("countTemplates")],
    ["itemUnitSettings", localStorage.getItem("itemUnitSettings")]
]);
localStorage.failNextWriteFor("countTemplates");
await assert.rejects(storage.restoreBackupState(createBackup({ templates: [createTemplate("template-new")] , settings: [] }), "replace-all"), /Falha injetada/);
stateBeforeFailedWrite.forEach((value, storageKey) => assert.equal(localStorage.getItem(storageKey), value));

setStoredState({ settings: [] });
let concurrentSavePromise;
localStorage.onNextRead((storageKey) => {
    assert.ok(storageKey);
    concurrentSavePromise = storage.saveItemUnitSetting(createProfile("ITEM-2", { notes: "salvo depois" }));
});
await storage.restoreBackupState(createBackup({ settings: [createProfile("ITEM-1")] }), "replace-all");
await concurrentSavePromise;
assert.deepEqual(readStored("itemUnitSettings").map((setting) => setting.itemCode).sort(), ["ITEM-1", "ITEM-2"]);

setStoredState({ settings: [] });
localStorage.failNextWriteFor("countTemplates");
await assert.rejects(storage.restoreBackupState(schema2, "replace-all"));
await storage.saveItemUnitSetting(createProfile("ITEM-2", { notes: "fila recuperada" }));
assert.equal(readStored("itemUnitSettings").some((setting) => setting.itemCode === "ITEM-2"), true);

const schema1Preview = previewBackupPayload(createSchema1Backup());
assert.equal(schema1Preview.preservesLocalUnitConfiguration, true);
assert.equal(previewBackupPayload(schema2).templateCount, 1);
assert.equal(previewBackupPayload(schema2).itemUnitSettingsCount, 1);

console.log(`BACKUP_SCHEMA2_VALIDATION_OK ${validationCaseCount} casos`);
