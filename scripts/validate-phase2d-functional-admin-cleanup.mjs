import assert from "node:assert/strict";
import fs from "node:fs";
import { summarizeConvertedEntries } from "../src/unitConversion.js";

const timestamp = "2026-08-14T12:00:00.000Z";
const template = {
    id: "phase2d-template",
    name: "Template Fase 2D",
    groups: [{
        id: "group-test",
        name: "Grupo de teste",
        order: 1,
        countAreas: ["BAR"],
        totalArea: "TOTAL",
        items: [{ code: "301910024", name: "VINHO CX 3L MIOLO BRANCO TAÇA", order: 1, countAreas: ["BAR"] }]
    }]
};
const location = {
    id: "location-test",
    name: "Bar",
    type: "room",
    parentId: null,
    reportArea: "BAR",
    order: 1,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp
};
const link = {
    id: "link-test",
    templateId: template.id,
    itemCode: "301910024",
    itemNameSnapshot: "VINHO CX 3L MIOLO BRANCO TAÇA",
    groupId: "group-test",
    groupNameSnapshot: "Grupo de teste",
    locationId: location.id,
    locationPathSnapshot: [location.name],
    reportArea: "BAR",
    order: 1,
    active: true,
    createdAt: timestamp,
    updatedAt: timestamp
};
const plannedItem = {
    itemCode: link.itemCode,
    itemNameSnapshot: link.itemNameSnapshot,
    groupId: link.groupId,
    groupNameSnapshot: link.groupNameSnapshot,
    linkId: link.id,
    locationId: location.id,
    locationPathSnapshot: [location.name],
    reportArea: "BAR",
    order: 1,
    active: true
};
const mioloProfile = {
    id: `item-unit:${template.id}:${link.itemCode}`,
    templateId: template.id,
    itemCode: link.itemCode,
    itemNameSnapshot: link.itemNameSnapshot,
    groupId: link.groupId,
    groupNameSnapshot: link.groupNameSnapshot,
    baseUnit: "l",
    defaultInputUnit: "un",
    allowedUnits: [
        { id: "un", label: "un", normalizedUnit: "un", kind: "unit", factorToBase: "3", portionWeightGrams: null, requiresReview: false, notes: "", legacyLabels: [] },
        { id: "l", label: "l", normalizedUnit: "l", kind: "volume", factorToBase: "1", portionWeightGrams: null, requiresReview: false, notes: "", legacyLabels: [] },
        { id: "ml", label: "ml", normalizedUnit: "ml", kind: "volume", factorToBase: "0.001", portionWeightGrams: null, requiresReview: false, notes: "", legacyLabels: [] }
    ],
    source: "manual",
    confidence: "high",
    needsReview: false,
    notes: "",
    createdAt: timestamp,
    updatedAt: timestamp,
    manualUnit: "un",
    effectiveUnit: "un"
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

function createSession(status = "draft", overrides = {}) {
    return {
        id: overrides.id || `session-${status}`,
        templateId: template.id,
        templateNameSnapshot: template.name,
        locationId: location.id,
        locationPathSnapshot: [location.name],
        reportAreaSnapshot: "BAR",
        status,
        plannedItems: [plannedItem],
        plannedItemCount: 1,
        activeLinkCountSnapshot: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
        startedAt: status === "in_progress" ? timestamp : null,
        finishedAt: status === "completed" ? timestamp : null,
        canceledAt: status === "canceled" ? timestamp : null,
        notes: "",
        ...overrides
    };
}

function createEntry(session = createSession(), active = true) {
    return {
        id: `entry-${session.id}`,
        sessionId: session.id,
        templateId: template.id,
        locationId: location.id,
        linkId: link.id,
        itemCode: link.itemCode,
        itemNameSnapshot: link.itemNameSnapshot,
        groupId: link.groupId,
        groupNameSnapshot: link.groupNameSnapshot,
        reportAreaSnapshot: "BAR",
        rawQuantityText: "1",
        quantityDecimal: "1",
        rawUnit: "un",
        normalizedUnit: "un",
        notes: "",
        active,
        createdAt: timestamp,
        updatedAt: timestamp,
        removedAt: active ? null : timestamp
    };
}

function setStoredState({
    templates = [template],
    locations = [location],
    links = [link],
    profiles = [mioloProfile],
    sessions = [],
    entries = []
} = {}) {
    localStorage.clear();
    localStorage.setItem("countTemplates", JSON.stringify(templates));
    localStorage.setItem("locationNodes", JSON.stringify(locations));
    localStorage.setItem("itemLocationLinks", JSON.stringify(links));
    localStorage.setItem("itemUnitSettings", JSON.stringify(profiles));
    localStorage.setItem("locationCountSessions", JSON.stringify(sessions));
    localStorage.setItem("locationCountEntries", JSON.stringify(entries));
}

function createChildLocation() {
    return { ...location, id: "location-child", name: "Prateleira", type: "shelf", parentId: location.id };
}

globalThis.localStorage = createMemoryStorage();
const storage = await import(`../src/storage.js?phase2d=${Date.now()}`);
await storage.initializeStorage();

let executedTestCount = 0;
async function runTest(name, test) {
    await test();
    executedTestCount += 1;
    console.log(`OK ${executedTestCount} ${name}`);
}

await runTest("template isolado pode ser removido", async () => {
    setStoredState({ links: [], profiles: [] });
    await storage.deleteCountTemplate(template.id);
    assert.equal((await storage.listCountTemplates()).length, 0);
});

await runTest("template com perfil explícito é bloqueado sem escrita", async () => {
    setStoredState({ links: [] });
    const before = localStorage.getItem("countTemplates");
    await assert.rejects(storage.deleteCountTemplate(template.id), /perfis explícitos/);
    assert.equal(localStorage.getItem("countTemplates"), before);
});

await runTest("template com vínculo é bloqueado", async () => {
    setStoredState({ profiles: [] });
    await assert.rejects(storage.deleteCountTemplate(template.id), /vínculos/);
});

for (const status of ["draft", "in_progress"]) {
    await runTest(`template com sessão ${status} é bloqueado`, async () => {
        setStoredState({ links: [], profiles: [], sessions: [createSession(status)] });
        await assert.rejects(storage.deleteCountTemplate(template.id), /sessões de contagem/);
    });
}

await runTest("sessão histórica também preserva o template", async () => {
    setStoredState({ links: [], profiles: [], sessions: [createSession("completed")] });
    await assert.rejects(storage.deleteCountTemplate(template.id), /inclusive históricas/);
});

await runTest("template com entry órfã defensiva é bloqueado", async () => {
    const session = createSession("completed");
    setStoredState({ links: [], profiles: [], sessions: [], entries: [createEntry(session)] });
    await assert.rejects(storage.deleteCountTemplate(template.id), /entradas de contagem/);
});

await runTest("local isolado pode ser removido", async () => {
    setStoredState({ links: [], profiles: [] });
    await storage.deleteLocationNode(location.id);
    assert.equal((await storage.listLocationNodes()).length, 0);
});

await runTest("local com filho é bloqueado", async () => {
    setStoredState({ locations: [location, createChildLocation()], links: [], profiles: [] });
    await assert.rejects(storage.deleteLocationNode(location.id), /subdivisões/);
});

for (const active of [true, false]) {
    await runTest(`local com vínculo ${active ? "ativo" : "inativo"} é bloqueado`, async () => {
        setStoredState({ links: [{ ...link, active }], profiles: [] });
        await assert.rejects(storage.deleteLocationNode(location.id), /vínculos de itens/);
    });
}

await runTest("local com sessão relacionada é bloqueado", async () => {
    setStoredState({ links: [], profiles: [], sessions: [createSession("completed")] });
    await assert.rejects(storage.deleteLocationNode(location.id), /sessões de contagem/);
});

await runTest("local com entry órfã defensiva é bloqueado", async () => {
    const session = createSession("completed");
    setStoredState({ links: [], profiles: [], entries: [createEntry(session)] });
    await assert.rejects(storage.deleteLocationNode(location.id), /entradas de contagem/);
});

await runTest("cancelar draft preserva a sessão como canceled", async () => {
    const draft = createSession("draft");
    setStoredState({ sessions: [draft] });
    const canceled = await storage.cancelLocationCountSession(draft.id);
    assert.equal(canceled.status, "canceled");
    assert.equal((await storage.listLocationCountSessions()).length, 1);
});

for (const status of ["draft", "canceled"]) {
    await runTest(`remover ${status} sem entries é permitido`, async () => {
        const session = createSession(status);
        setStoredState({ sessions: [session] });
        await storage.deleteLocationCountSession(session.id);
        assert.equal((await storage.listLocationCountSessions()).length, 0);
    });
}

for (const status of ["in_progress", "completed"]) {
    await runTest(`remover ${status} é bloqueado`, async () => {
        const session = createSession(status);
        setStoredState({ sessions: [session] });
        await assert.rejects(storage.deleteLocationCountSession(session.id), /rascunho ou canceladas/);
        assert.equal((await storage.listLocationCountSessions()).length, 1);
    });
}

await runTest("qualquer entry, inclusive inativa, bloqueia remoção da sessão", async () => {
    const draft = createSession("draft");
    setStoredState({ sessions: [draft], entries: [createEntry(draft, false)] });
    await assert.rejects(storage.deleteLocationCountSession(draft.id), /entradas de contagem preservadas/);
});

await runTest("item apenas planejado recebe motivo específico", async () => {
    const reason = storage.getItemUnitProfileMutationBlockReason({
        templateId: template.id,
        itemCode: link.itemCode,
        sessions: [createSession("draft")],
        entries: [],
        includePlannedItems: true
    });
    assert.equal(reason.type, "planned-item");
    assert.doesNotMatch(reason.message, /já possui lançamentos/);
});

await runTest("item com entry ativa recebe motivo de lançamento", async () => {
    const session = createSession("in_progress");
    const reason = storage.getItemUnitProfileMutationBlockReason({
        templateId: template.id,
        itemCode: link.itemCode,
        sessions: [session],
        entries: [createEntry(session)],
        includePlannedItems: true
    });
    assert.equal(reason.type, "active-entry");
    assert.match(reason.message, /já possui lançamentos/);
});

await runTest("completed e canceled não bloqueiam perfil", async () => {
    for (const status of ["completed", "canceled"]) {
        const session = createSession(status);
        assert.equal(storage.getItemUnitProfileMutationBlockReason({
            templateId: template.id,
            itemCode: link.itemCode,
            sessions: [session],
            entries: [createEntry(session)],
            includePlannedItems: true
        }), null);
    }
});

await runTest("template e item não relacionados não bloqueiam perfil", async () => {
    assert.equal(storage.getItemUnitProfileMutationBlockReason({
        templateId: "outro-template",
        itemCode: "OUTRO-ITEM",
        sessions: [createSession("draft")],
        entries: [],
        includePlannedItems: true
    }), null);
});

await runTest("limpar perfil preserva guard com entry ativa", async () => {
    const session = createSession("draft");
    setStoredState({ sessions: [session], entries: [createEntry(session)] });
    await assert.rejects(storage.deleteItemUnitSetting(template.id, link.itemCode), /já possui lançamentos/);
    assert.equal((await storage.listItemUnitSettings()).length, 1);
});

await runTest("perfil removido deixa de autorizar nova entry conforme 2C", async () => {
    const session = createSession("draft");
    setStoredState({ sessions: [session] });
    await storage.deleteItemUnitSetting(template.id, link.itemCode);
    await assert.rejects(storage.addLocationCountEntry({
        session,
        plannedItem,
        rawQuantityText: "1",
        rawUnit: "un"
    }), /perfil explícito/);
    assert.equal((await storage.listLocationCountEntries()).length, 0);
});

await runTest("Miolo preserva 2 un + 500 ml + 1 l = 7.5 l", async () => {
    const entries = [
        { active: true, quantityDecimal: "2", rawUnit: "un" },
        { active: true, quantityDecimal: "500", rawUnit: "ml" },
        { active: true, quantityDecimal: "1", rawUnit: "l" }
    ];
    assert.equal(summarizeConvertedEntries(entries, mioloProfile).totalConvertedDecimal, "7.5");
});

await runTest("UI reflete agrupamento, limpeza, sessões e modal aprovados", async () => {
    const html = fs.readFileSync("index.html", "utf8");
    const uiSource = fs.readFileSync("src/ui.js", "utf8");
    const sessionUiSource = fs.readFileSync("src/locationCountSessionsUi.js", "utf8");
    assert.match(html, /Configuração principal[\s\S]*Estrutura e diagnóstico[\s\S]*Segurança e dados/);
    assert.match(html, /Recarregar análise/);
    assert.match(uiSource, /event\.key !== "Escape"/);
    assert.match(sessionUiSource, /Remover permanentemente/);
});

await runTest("menu raiz possui exatamente três controles interativos de grupo", async () => {
    const html = fs.readFileSync("index.html", "utf8");
    const rootStart = html.indexOf('<div id="admin-menu-root"');
    const rootEnd = html.indexOf("</div>", rootStart);
    const rootMarkup = html.slice(rootStart, rootEnd);
    assert.notEqual(rootStart, -1);
    assert.equal(rootMarkup.match(/class="admin-menu-group-button"/g)?.length, 3);
    assert.equal(rootMarkup.match(/data-admin-group=/g)?.length, 3);
    assert.doesNotMatch(rootMarkup, /data-admin-target=/);
});

await runTest("destinos administrativos permanecem associados aos grupos aprovados", async () => {
    const html = fs.readFileSync("index.html", "utf8");
    const primaryPanel = html.slice(html.indexOf('data-admin-group-panel="primary"'), html.indexOf('data-admin-group-panel="structure"'));
    const structurePanel = html.slice(html.indexOf('data-admin-group-panel="structure"'), html.indexOf('data-admin-group-panel="security"'));
    const securityPanel = html.slice(html.indexOf('data-admin-group-panel="security"'), html.indexOf("</section>", html.indexOf('data-admin-group-panel="security"')));
    for (const target of ["quick-pilot", "templates", "item-unit-settings", "whatsapp-settings"]) {
        assert.match(primaryPanel, new RegExp(`data-admin-target="${target}"`));
    }
    for (const target of ["locations", "item-locations", "preparation", "location-item-map", "location-count-sessions"]) {
        assert.match(structurePanel, new RegExp(`data-admin-target="${target}"`));
    }
    for (const target of ["backup", "about"]) {
        assert.match(securityPanel, new RegExp(`data-admin-target="${target}"`));
    }
});

await runTest("submenus começam ocultos e oferecem retorno ao menu raiz", async () => {
    const html = fs.readFileSync("index.html", "utf8");
    assert.equal(html.match(/data-admin-group-panel="[^"]+" hidden/g)?.length, 3);
    assert.equal(html.match(/class="admin-menu-group-back"/g)?.length, 3);
});

await runTest("navegação mostra somente o grupo escolhido e preserva retorno das seções", async () => {
    const uiSource = fs.readFileSync("src/ui.js", "utf8");
    assert.match(uiSource, /panel\.hidden = panel !== selectedPanel/);
    assert.match(uiSource, /button\.dataset\.adminGroup/);
    assert.match(uiSource, /if \(currentAdminGroup\)[\s\S]*showAdminGroup\(currentAdminGroup\)/);
    assert.match(uiSource, /showAdminRootMenu\(\)/);
});

await runTest("destinos piloto e legados continuam ocultos", async () => {
    const html = fs.readFileSync("index.html", "utf8");
    for (const target of ["catalog", "catalog-import", "units", "history"]) {
        const hiddenTarget = new RegExp(`class="[^"]*pilot-hidden[^"]*" data-admin-target="${target}"`);
        assert.match(html, hiddenTarget);
    }
});

await runTest("topbar ocupa a primeira camada opaca da superfície rolável", async () => {
    const html = fs.readFileSync("index.html", "utf8");
    const styles = fs.readFileSync("src/styles.css", "utf8");
    assert.match(html, /class="modal-content admin-content">\s*<div class="admin-topbar">/);
    assert.match(styles, /\.admin-content\s*{[\s\S]*?overflow-y:\s*auto;[\s\S]*?isolation:\s*isolate;/);
    assert.match(styles, /\.admin-topbar\s*{[\s\S]*?position:\s*sticky;[\s\S]*?top:\s*0;[\s\S]*?z-index:\s*10;/);
    assert.match(styles, /\.admin-topbar\s*{[\s\S]*?background-color:\s*var\(--color-surface\);/);
});

await runTest("modal trata safe-area e impede scroll de conteúdo acima da topbar", async () => {
    const styles = fs.readFileSync("src/styles.css", "utf8");
    const uiSource = fs.readFileSync("src/ui.js", "utf8");
    assert.match(styles, /#configModal\s*{[\s\S]*?safe-area-inset-top[\s\S]*?overflow:\s*hidden;/);
    assert.match(styles, /\.admin-content\s*{[\s\S]*?padding-top:\s*0;[\s\S]*?overflow-y:\s*auto;/);
    assert.match(uiSource, /querySelector\("\.admin-content"\)\.scrollTop = 0/);
});

await runTest("Escape, backdrop, foco e scroll lock permanecem conectados", async () => {
    const uiSource = fs.readFileSync("src/ui.js", "utf8");
    assert.match(uiSource, /event\.target === modal/);
    assert.match(uiSource, /event\.key !== "Escape"/);
    assert.match(uiSource, /configModalReturnFocus = document\.activeElement/);
    assert.match(uiSource, /configModalReturnFocus\?\.focus\?\.\(\)/);
    assert.match(uiSource, /document\.body\.style\.overflow = "hidden"/);
    assert.match(uiSource, /document\.body\.style\.overflow = bodyOverflowBeforeConfigModal/);
});

await runTest("diagnósticos vazios são resumidos sem remover os cálculos", async () => {
    const mapSource = fs.readFileSync("src/locationItemMapUi.js", "utf8");
    const preparationSource = fs.readFileSync("src/countPreparationUi.js", "utf8");
    assert.match(mapSource, /Nenhum problema encontrado nos vínculos e locais/);
    assert.match(preparationSource, /Prontidão confirmada/);
});

console.log(`PHASE2D_FUNCTIONAL_ADMIN_CLEANUP_VALIDATION_OK ${executedTestCount} casos`);
