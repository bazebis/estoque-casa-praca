import assert from "node:assert/strict";
import fs from "node:fs";
import { buildCountConsolidation } from "../src/countConsolidation.js";
import { resolveAreaCountingInputUnit } from "../src/areaCountingUi.js";
import {
    createLocationCountEntryModel,
    normalizeLocationCountEntry
} from "../src/locationCountEntries.js";
import {
    convertEntryToBase,
    summarizeConvertedEntries
} from "../src/unitConversion.js";

const timestamp = "2026-08-14T12:00:00.000Z";
const template = {
    id: "phase2c-safe-counting",
    name: "Template de contagem segura",
    groups: [{
        id: "group-test",
        name: "Grupo de teste",
        order: 1,
        countAreas: ["BAR"],
        totalArea: "TOTAL",
        items: [
            { code: "301910024", name: "VINHO CX 3L MIOLO BRANCO TAÇA", order: 1, countAreas: ["BAR"] },
            { code: "ITEM-MASSA", name: "ITEM MASSA", order: 2, countAreas: ["BAR"] },
            { code: "ITEM-VOLUME", name: "ITEM VOLUME", order: 3, countAreas: ["BAR"] },
            { code: "ITEM-CAIXA", name: "ITEM CAIXA", order: 4, countAreas: ["BAR"] }
        ]
    }]
};
const location = {
    id: "location-test",
    name: "Área de teste",
    type: "room",
    parentId: null,
    reportArea: "BAR",
    order: 1,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp
};

function createMemoryStorage() {
    const values = new Map();
    return {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear()
    };
}

function createAllowedUnit(label, normalizedUnit, factorToBase, overrides = {}) {
    return {
        id: label.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        label,
        normalizedUnit,
        kind: "custom",
        factorToBase,
        portionWeightGrams: null,
        requiresReview: false,
        notes: "",
        legacyLabels: [],
        ...overrides
    };
}

function createProfile(itemCode, baseUnit, defaultInputUnit, allowedUnits) {
    const item = template.groups[0].items.find((candidate) => candidate.code === itemCode);
    return {
        id: `item-unit:${template.id}:${itemCode}`,
        templateId: template.id,
        itemCode,
        itemNameSnapshot: item.name,
        groupId: template.groups[0].id,
        groupNameSnapshot: template.groups[0].name,
        baseUnit,
        defaultInputUnit,
        allowedUnits,
        source: "manual",
        confidence: "high",
        needsReview: false,
        notes: "",
        createdAt: timestamp,
        updatedAt: timestamp,
        suggestedUnit: defaultInputUnit,
        manualUnit: defaultInputUnit,
        effectiveUnit: defaultInputUnit
    };
}

const mioloProfile = createProfile("301910024", "l", "un", [
    createAllowedUnit("un", "un", "3", { legacyLabels: ["unidade"] }),
    createAllowedUnit("l", "l", "1"),
    createAllowedUnit("ml", "ml", "0.001")
]);
const massProfile = createProfile("ITEM-MASSA", "kg", "kg", [
    createAllowedUnit("kg", "kg", "1"),
    createAllowedUnit("g", "g", "0.001")
]);
const volumeProfile = createProfile("ITEM-VOLUME", "l", "l", [
    createAllowedUnit("l", "l", "1"),
    createAllowedUnit("ml", "ml", "0.001")
]);
const boxProfile = createProfile("ITEM-CAIXA", "un", "un", [
    createAllowedUnit("un", "un", "1"),
    createAllowedUnit("caixa 12", "caixa 12", "12", {
        variantFamily: "caixa",
        variantValue: "12",
        variantUnit: "un",
        legacyLabels: ["caixa antiga com doze"]
    })
]);
const explicitProfiles = [mioloProfile, massProfile, volumeProfile, boxProfile];

function createLinks() {
    return template.groups[0].items.map((item) => ({
        id: `link-${item.code}`,
        templateId: template.id,
        itemCode: item.code,
        itemNameSnapshot: item.name,
        groupId: template.groups[0].id,
        groupNameSnapshot: template.groups[0].name,
        locationId: location.id,
        locationPathSnapshot: [location.name],
        reportArea: location.reportArea,
        order: item.order,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp
    }));
}

const links = createLinks();

function createSession(status = "draft") {
    const startedAt = status === "in_progress" ? timestamp : null;
    const plannedItems = links.map((link) => ({
        itemCode: link.itemCode,
        itemNameSnapshot: link.itemNameSnapshot,
        groupId: link.groupId,
        groupNameSnapshot: link.groupNameSnapshot,
        linkId: link.id,
        locationId: location.id,
        locationPathSnapshot: [location.name],
        reportArea: location.reportArea,
        order: link.order,
        active: true
    }));
    return {
        id: "session-test",
        templateId: template.id,
        templateNameSnapshot: template.name,
        locationId: location.id,
        locationPathSnapshot: [location.name],
        reportAreaSnapshot: location.reportArea,
        status,
        plannedItems,
        plannedItemCount: plannedItems.length,
        activeLinkCountSnapshot: plannedItems.length,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt,
        finishedAt: null,
        canceledAt: null,
        notes: ""
    };
}

function setStoredState({ profiles = explicitProfiles, entries = [], session = createSession() } = {}) {
    localStorage.clear();
    localStorage.setItem("countTemplates", JSON.stringify([template]));
    localStorage.setItem("locationNodes", JSON.stringify([location]));
    localStorage.setItem("itemLocationLinks", JSON.stringify(links));
    localStorage.setItem("locationCountSessions", JSON.stringify([session]));
    localStorage.setItem("locationCountEntries", JSON.stringify(entries));
    localStorage.setItem("itemUnitSettings", JSON.stringify(profiles));
}

function getPlannedItem(session, itemCode) {
    return session.plannedItems.find((item) => item.itemCode === itemCode);
}

function createEntry(session, itemCode, rawQuantityText, rawUnit) {
    return createLocationCountEntryModel({
        session,
        plannedItem: getPlannedItem(session, itemCode),
        rawQuantityText,
        rawUnit
    });
}

async function addEntry(storage, itemCode, rawQuantityText, rawUnit) {
    const session = await storage.getLocationCountSession("session-test");
    return storage.addLocationCountEntry({
        session,
        plannedItem: getPlannedItem(session, itemCode),
        rawQuantityText,
        rawUnit
    });
}

globalThis.localStorage = createMemoryStorage();
const storage = await import("../src/storage.js");
await storage.initializeStorage();

let executedTestCount = 0;
async function runTest(name, test) {
    await test();
    executedTestCount += 1;
    console.log(`OK ${executedTestCount} ${name}`);
}

await runTest("Miolo consolida 2 un + 500 ml + 1 l em 7.5 l", async () => {
    setStoredState();
    await addEntry(storage, "301910024", "2", "un");
    await addEntry(storage, "301910024", "500", "ml");
    await addEntry(storage, "301910024", "1", "l");
    const entries = (await storage.listLocationCountEntries()).filter((entry) => entry.itemCode === "301910024");
    const summary = summarizeConvertedEntries(entries, mioloProfile);
    assert.equal(summary.totalConvertedDecimal, "7.5");
    assert.equal(summary.isComplete, true);
});

await runTest("defaultInputUnit é usado e lastUsedUnit só prevalece quando permitido", async () => {
    assert.equal(resolveAreaCountingInputUnit(mioloProfile)?.label, "un");
    assert.equal(resolveAreaCountingInputUnit(mioloProfile, "ml")?.label, "ml");
    assert.equal(resolveAreaCountingInputUnit(mioloProfile, "balde")?.label, "un");
    assert.equal(resolveAreaCountingInputUnit(null), null);
});

await runTest("unidade permitida por alias é persistida com label canônica", async () => {
    setStoredState();
    const entry = await addEntry(storage, "301910024", "1", "UNIDADE");
    assert.equal(entry.rawUnit, "un");
});

await runTest("alias legado persiste rawUnit e normalizedUnit canônicas no registro bruto", async () => {
    setStoredState();
    const legacyLabel = "caixa antiga com doze";
    const canonicalLabel = "caixa 12";
    const expectedNormalizedUnit = normalizeLocationCountEntry({ rawUnit: canonicalLabel }).normalizedUnit;
    const legacyNormalizedUnit = normalizeLocationCountEntry({ rawUnit: legacyLabel }).normalizedUnit;
    assert.notEqual(legacyNormalizedUnit, expectedNormalizedUnit);

    const savedEntry = await addEntry(storage, "ITEM-CAIXA", "1", legacyLabel);
    assert.equal(savedEntry.rawUnit, canonicalLabel);
    assert.equal(savedEntry.normalizedUnit, expectedNormalizedUnit);

    const rawEntries = JSON.parse(localStorage.getItem("locationCountEntries"));
    const rawPersistedEntry = rawEntries.find((entry) => entry.id === savedEntry.id);
    assert.equal(rawPersistedEntry.rawUnit, canonicalLabel);
    assert.equal(rawPersistedEntry.normalizedUnit, expectedNormalizedUnit);
    assert.notEqual(rawPersistedEntry.rawUnit, legacyLabel);
    assert.notEqual(rawPersistedEntry.normalizedUnit, legacyNormalizedUnit);

    const reloadedEntry = (await storage.listLocationCountEntries())
        .find((entry) => entry.id === savedEntry.id);
    assert.equal(reloadedEntry.rawUnit, canonicalLabel);
    assert.equal(reloadedEntry.normalizedUnit, expectedNormalizedUnit);
    assert.equal(convertEntryToBase(reloadedEntry, boxProfile).convertedQuantityDecimal, "12");
    assert.equal(boxProfile.allowedUnits.find((unit) => unit.label === canonicalLabel).factorToBase, "12");
});

await runTest("unidade arbitrária é rejeitada sem criar entry", async () => {
    setStoredState();
    await assert.rejects(addEntry(storage, "301910024", "1", "balde"), /não pertence ao perfil/);
    assert.equal((await storage.listLocationCountEntries()).length, 0);
});

await runTest("unidade vazia é rejeitada", async () => {
    setStoredState();
    await assert.rejects(addEntry(storage, "301910024", "1", ""), /Selecione uma unidade permitida/);
    assert.equal((await storage.listLocationCountEntries()).length, 0);
});

await runTest("inferência possível não substitui perfil explícito ausente", async () => {
    setStoredState({ profiles: [] });
    await assert.rejects(addEntry(storage, "301910024", "1", "un"), /perfil explícito/);
    assert.equal((await storage.listLocationCountEntries()).length, 0);
});

await runTest("perfil explícito inválido bloqueia novo lançamento", async () => {
    setStoredState({ profiles: [{ ...mioloProfile, needsReview: true }] });
    await assert.rejects(addEntry(storage, "301910024", "1", "un"), /precisa ser corrigido/);
    assert.equal((await storage.listLocationCountEntries()).length, 0);
});

await runTest("massa consolida 0.75 kg + 350 g em 1.1 kg", async () => {
    setStoredState();
    await addEntry(storage, "ITEM-MASSA", "0.75", "kg");
    await addEntry(storage, "ITEM-MASSA", "350", "g");
    const entries = (await storage.listLocationCountEntries()).filter((entry) => entry.itemCode === "ITEM-MASSA");
    assert.equal(summarizeConvertedEntries(entries, massProfile).totalConvertedDecimal, "1.1");
});

await runTest("volume consolida 0.5 l + 250 ml em 0.75 l", async () => {
    setStoredState();
    await addEntry(storage, "ITEM-VOLUME", "0.5", "l");
    await addEntry(storage, "ITEM-VOLUME", "250", "ml");
    const entries = (await storage.listLocationCountEntries()).filter((entry) => entry.itemCode === "ITEM-VOLUME");
    assert.equal(summarizeConvertedEntries(entries, volumeProfile).totalConvertedDecimal, "0.75");
});

await runTest("variante caixa 12 preserva factorToBase comercial", async () => {
    setStoredState();
    const entry = await addEntry(storage, "ITEM-CAIXA", "1", "caixa 12");
    const conversion = convertEntryToBase(entry, boxProfile);
    assert.equal(entry.rawUnit, "caixa 12");
    assert.equal(conversion.convertedQuantityDecimal, "12");
});

await runTest("múltiplas entries permanecem registros independentes", async () => {
    setStoredState();
    await addEntry(storage, "ITEM-VOLUME", "1", "l");
    await addEntry(storage, "ITEM-VOLUME", "500", "ml");
    const entries = await storage.listLocationCountEntries();
    assert.equal(entries.length, 2);
    assert.notEqual(entries[0].id, entries[1].id);
});

await runTest("releitura preserva quantidade e unidade canônica", async () => {
    setStoredState();
    const saved = await addEntry(storage, "ITEM-MASSA", "350", "g");
    const reloaded = (await storage.listLocationCountEntries()).find((entry) => entry.id === saved.id);
    assert.equal(reloaded.quantityDecimal, "350");
    assert.equal(reloaded.rawUnit, "g");
    assert.equal(convertEntryToBase(reloaded, massProfile).convertedQuantityDecimal, "0.35");
});

await runTest("primeiro lançamento válido permite promoção draft para in_progress", async () => {
    setStoredState();
    await addEntry(storage, "301910024", "1", "un");
    const startedSession = await storage.startLocationCountSession("session-test");
    assert.equal(startedSession.status, "in_progress");
});

await runTest("lançamento inválido não persiste nem promove o draft", async () => {
    setStoredState();
    await assert.rejects(addEntry(storage, "301910024", "1", "balde"));
    assert.equal((await storage.listLocationCountEntries()).length, 0);
    assert.equal((await storage.getLocationCountSession("session-test")).status, "draft");
});

await runTest("entry legada inválida continua legível como pendência", async () => {
    const session = createSession();
    const legacyEntry = createEntry(session, "301910024", "1", "balde");
    setStoredState({ entries: [legacyEntry] });
    const reloaded = (await storage.listLocationCountEntries())[0];
    assert.equal(reloaded.rawUnit, "balde");
    assert.equal(convertEntryToBase(reloaded, mioloProfile).isConvertible, false);
});

await runTest("entry legada inválida continua removível por soft delete", async () => {
    const session = createSession();
    const legacyEntry = createEntry(session, "301910024", "1", "balde");
    setStoredState({ profiles: [], entries: [legacyEntry] });
    const removed = await storage.removeLocationCountEntry(legacyEntry.id);
    assert.equal(removed.active, false);
    assert.ok(removed.removedAt);
});

await runTest("chamada direta a saveLocationCountEntry não contorna allowedUnits", async () => {
    const session = createSession();
    setStoredState({ session });
    const directEntry = createEntry(session, "301910024", "1", "qualquer-coisa");
    await assert.rejects(storage.saveLocationCountEntry(directEntry), /não pertence ao perfil/);
    assert.equal((await storage.listLocationCountEntries()).length, 0);
});

await runTest("guard de perfil continua bloqueando mutação com entry ativa", async () => {
    setStoredState();
    await addEntry(storage, "301910024", "1", "un");
    await assert.rejects(
        storage.saveItemUnitSetting({ ...mioloProfile, notes: "tentativa bloqueada" }),
        /contagem aberta/
    );
});

await runTest("consolidação continua usando total racional na baseUnit", async () => {
    setStoredState();
    await addEntry(storage, "301910024", "2", "un");
    await addEntry(storage, "301910024", "500", "ml");
    await addEntry(storage, "301910024", "1", "l");
    const entries = await storage.listLocationCountEntries();
    const sessions = await storage.listLocationCountSessions();
    const report = buildCountConsolidation({
        template,
        sessions,
        entries,
        unitSettings: explicitProfiles,
        locationNodes: [location],
        itemLocationLinks: links
    });
    const miolo = report.items.find((item) => item.code === "301910024");
    assert.equal(miolo.total.conversion.totalConvertedDecimal, "7.5");
    assert.equal(miolo.total.status, "complete");
});

await runTest("UI moderna não contém Outra unidade nem fallback textual", async () => {
    const source = fs.readFileSync("src/areaCountingUi.js", "utf8");
    assert.doesNotMatch(source, /Outra unidade|customUnit|Unidade livre/);
    assert.match(source, /<select name="unit" data-profile-unit-select>/);
});

console.log(`PHASE2C_SAFE_COUNTING_UNITS_VALIDATION_OK ${executedTestCount} casos`);
