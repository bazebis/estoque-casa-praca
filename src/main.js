import "./styles.css";
import {
    buildAreaCountingOverview,
    buildAreaCountingViewModel,
    listOpenAreaSessions
} from "./areaCounting.js";
import {
    connectAreaCountingEvents,
    hideAreaCountingView,
    renderAreaCountingOverview,
    renderAreaCountingView,
    showAreaCountingFeedback,
    showAreaCountingView
} from "./areaCountingUi.js";
import {
    buildBackupPayload,
    downloadBackup,
    mergeCountingHistory,
    normalizeBackupPayload,
    parseBackupText,
    previewBackupPayload
} from "./backup.js";
import { createCatalog } from "./catalog.js";
import { createCounting } from "./counting.js";
import { buildCountConsolidation } from "./countConsolidation.js";
import {
    connectCountConsolidationEvents,
    hideCountConsolidationView,
    renderCountConsolidation,
    showCountConsolidationFeedback,
    showCountConsolidationView
} from "./countConsolidationUi.js";
import { createConsolidationSnapshotFromPreview } from "./consolidationSnapshots.js";
import {
    connectConsolidationSnapshotsEvents,
    hideConsolidationSnapshotsView,
    renderConsolidationSnapshotDetail,
    renderConsolidationSnapshotList,
    renderSnapshotXlsxExportPlan,
    resetSnapshotXlsxExport,
    selectSnapshotShareMessage,
    setSnapshotXlsxExportBusy,
    showConsolidationSnapshotsFeedback,
    showConsolidationSnapshotsView,
    showSnapshotFinalizationFeedback,
    showSnapshotCsvExportFeedback,
    showSnapshotXlsxExportFeedback,
    showSnapshotShareFeedback
} from "./consolidationSnapshotsUi.js";
import { buildSnapshotCsvBundle, downloadTextFile as downloadSnapshotCsvFile } from "./snapshotCsvExport.js";
import {
    buildWhatsappMessage,
    copyShareMessageToClipboard,
    getShareCapability,
    openWhatsappForSnapshot,
    shareSnapshotCsv
} from "./snapshotShare.js";
import { buildCoverageReport } from "./countPreparation.js";
import {
    connectCountPreparationEvents,
    renderCountPreparation,
    showCountPreparationFeedback
} from "./countPreparationUi.js";
import { validateCountTemplate } from "./countTemplates.js";
import {
    connectCountTemplateEvents,
    renderCountTemplateDetail,
    renderCountTemplateList,
    showCountTemplateFeedback
} from "./countTemplatesUi.js";
import { parseCatalogCsv } from "./csvImport.js";
import { createHistoryEntry } from "./history.js";
import { findTemplateItem } from "./itemLocationLinks.js";
import {
    connectItemLocationLinkEvents,
    renderItemLocationLinks,
    showItemLocationLinksFeedback
} from "./itemLocationLinksUi.js";
import {
    buildControlledItemUnitProfile,
    resolveItemUnitSettings,
    summarizeItemUnitSettings
} from "./itemUnitSettings.js";
import {
    buildUnitProfileTemplateExport,
    formatSanitizedUnitTemplateFilename
} from "./itemUnitTemplatePortability.js";
import {
    connectItemUnitSettingsEvents,
    renderItemUnitSettings,
    showItemUnitSettingsFeedback
} from "./itemUnitSettingsUi.js";
import { buildLocationItemMap } from "./locationItemMap.js";
import {
    connectLocationItemMapEvents,
    renderLocationItemMap,
    showLocationItemMapFeedback
} from "./locationItemMapUi.js";
import {
    connectLocationCountSessionEvents,
    renderLocationCountSessions,
    showLocationCountSessionsFeedback
} from "./locationCountSessionsUi.js";
import {
    connectLocationNodeEvents,
    renderLocationNodes,
    showLocationNodesFeedback
} from "./locationNodesUi.js";
import { registerPwa } from "./pwa.js";
import {
    buildQuickPilotLinkCandidates,
    buildQuickPilotPlan,
    summarizeQuickPilotStatus
} from "./quickPilot.js";
import {
    connectQuickPilotEvents,
    renderPilotDashboardStatus,
    renderQuickPilot,
    showQuickPilotFeedback
} from "./quickPilotUi.js";
import {
    addCountHistoryEntry,
    cancelLocationCountSession,
    clearCountingDraft,
    createLocationCountSessionDraft,
    deleteCountTemplate,
    deleteConsolidationSnapshot,
    deleteItemUnitSetting,
    deleteItemLocationLink,
    deleteLocationNode,
    deleteLocationCountSession,
    getCountTemplate,
    getConsolidationSnapshot,
    getItemLocationLink,
    getLocationCountSession,
    getStorageStatus,
    importCountTemplateWithUnitProfiles,
    finalizeConsolidationSnapshot,
    initializeStorage,
    loadCatalog,
    loadCountingDraft,
    loadCountingHistory,
    loadLastFinalizedCount,
    loadCustomUnits,
    loadRelevantLocalStorageKeys,
    listCountTemplates,
    listConsolidationSnapshots,
    listItemUnitSettings,
    listItemLocationLinks,
    listLinksByTemplate,
    listLocationNodes,
    listLocationCountSessions,
    listLocationCountEntries,
    loadWhatsappSettings,
    saveBackupBeforeJsonImport,
    saveCatalogBackupBeforeImport,
    saveCatalog,
    saveCountingHistory,
    saveCountingDraft,
    saveConsolidationSnapshot,
    saveItemUnitSetting,
    saveItemLocationLink,
    saveItemLocationLinksBatch,
    saveLocationCountSession,
    saveLocationNode,
    saveCustomUnits,
    saveWhatsappSettings,
    clearWhatsappSettings,
    addLocationCountEntry,
    removeLocationCountEntry,
    startLocationCountSession
} from "./storage.js";
import {
    createCustomUnit,
    getAllUnits,
    getCustomUnits,
    setCustomUnits,
    updateCustomUnitList
} from "./units.js";
import {
    confirmStartWithDraft,
    connectEvents,
    hideHistoryView,
    hideDraftNotice,
    openConfigModal,
    renderUnitOptions,
    renderCountingView,
    renderDraftNotice,
    renderLastFinalizedNotice,
    renderCatalogImportPreview,
    resetCatalogImportPreview,
    resetBackupImportPreview,
    renderBackupImportPreview,
    renderUnitsList,
    renderStorageStatusNotice,
    showHistoryDetail,
    showHistoryList,
    showAdminMenu,
    showFinalSummary,
    showBackupImportStatus,
    showCatalogImportStatus,
    showCountPreparationAdminSection,
    showCountTemplatesAdminSection,
    showItemLocationLinksAdminSection,
    showItemUnitSettingsAdminSection,
    showLocationCountSessionsAdminSection,
    showLocationItemMapAdminSection,
    showLocationNodesAdminSection,
    showQuickPilotAdminSection,
    showWhatsappSettingsAdminSection,
    showUnitsFeedback,
    updateConfigList
} from "./ui.js";
import { isWhatsappConfigured, normalizeWhatsappSettings } from "./whatsappSettings.js";
import {
    connectWhatsappSettingsEvents,
    renderWhatsappSettings,
    showWhatsappSettingsFeedback
} from "./whatsappSettingsUi.js";

registerPwa();

const storageStatus = await initializeStorage();
renderStorageStatusNotice(storageStatus || getStorageStatus());
setCustomUnits(await loadCustomUnits());

const catalog = createCatalog(await loadCatalog());
const counting = createCounting(catalog.listItems, await loadCountingDraft());
let lastFinalizedCount = await loadLastFinalizedCount();
let isCountingVisible = false;
let pendingCatalogImport = null;
let pendingBackupImport = null;
let selectedCountPreparationTemplateId = null;
let selectedItemLinksTemplateId = null;
let selectedLocationItemMapTemplateId = null;
let selectedLocationCountSessionTemplateId = null;
let selectedLocationCountSessionLocationId = null;
let selectedQuickPilotTemplateId = null;
let selectedItemUnitTemplateId = null;
let selectedCountConsolidationTemplateId = null;
let activeCountConsolidationReport = null;
let activeConsolidationSnapshotId = null;
let activeConsolidationSnapshot = null;
let activeSnapshotXlsxSelection = null;

function loadSnapshotXlsxExport() {
    // XLSX is loaded only when selected because it is substantially larger than the rest of the app.
    return import("./snapshotXlsxExport.js");
}
let activeSnapshotWhatsappSettings = normalizeWhatsappSettings();
let activeAreaCountSessionId = null;
let activeAreaOpenSessionCount = 0;
let selectedLinkItemCode = null;
let itemLinksLocationFilter = "";
let itemLinksItemFilter = "";

await saveCatalog(catalog.listItems());

function mergeCustomUnitLists(currentUnits, importedUnits) {
    const unitById = new Map();

    [...currentUnits, ...importedUnits].forEach((unit) => {
        unitById.set(unit.id, unit);
    });

    return [...unitById.values()];
}

async function saveCustomUnitState(units) {
    const savedUnits = await saveCustomUnits(units);
    setCustomUnits(savedUnits);
    return savedUnits;
}

function refreshUnitsView() {
    renderUnitOptions();
    renderUnitsList(getAllUnits(), unitHandlers);
    refreshConfigList();
}

async function finishCounting() {
    const draft = counting.getDraft();
    const summaries = counting.finishCounting();
    const finishedAt = new Date();

    try {
        lastFinalizedCount = (await addCountHistoryEntry(createHistoryEntry(draft, summaries, finishedAt)))[0];
    } catch {
        alert("Não foi possível salvar a contagem finalizada. O rascunho foi mantido.");
        return;
    }

    counting.clearSession();
    await clearCountingDraft();
    isCountingVisible = false;
    showFinalSummary(lastFinalizedCount.summaries || summaries, lastFinalizedCount.finishedAt || finishedAt, lastFinalizedCount);
}

function refreshConfigList() {
    updateConfigList(catalog.listItems(), catalogHandlers);
}

async function addItem(item) {
    const previousLength = catalog.listItems().length;
    const items = catalog.addItem(item);
    const wasAdded = items.length > previousLength;

    if (!wasAdded) {
        return false;
    }

    await saveCatalog(items);
    refreshConfigList();
    return true;
}

async function updateItem(itemId, values) {
    if (!values.name.trim() || !values.unitId) {
        return false;
    }

    const items = catalog.updateItem(itemId, values);
    await saveCatalog(items);
    refreshConfigList();
    return true;
}

async function deleteItem(itemId) {
    const item = catalog.listItems().find((catalogItem) => catalogItem.id === itemId);

    if (!item || !window.confirm(`Excluir ${item.name}?`)) {
        return;
    }

    await saveCatalog(catalog.deleteItem(itemId));
    refreshConfigList();
}

async function reorderItems(orderedIds) {
    await saveCatalog(catalog.reorderItems(orderedIds));
    refreshConfigList();
}

async function addCustomUnit(values) {
    const result = createCustomUnit(values);

    if (result.error) {
        showUnitsFeedback(result.error);
        return false;
    }

    await saveCustomUnitState([...getCustomUnits(), result.unit]);
    refreshUnitsView();
    showUnitsFeedback("Unidade adicionada.");
    return true;
}

async function updateCustomUnit(unitId, values) {
    const result = updateCustomUnitList(getCustomUnits(), unitId, values);

    if (result.error) {
        showUnitsFeedback(result.error);
        return false;
    }

    await saveCustomUnitState(result.units);
    refreshUnitsView();
    showUnitsFeedback("Unidade atualizada.");
    return true;
}

async function toggleCustomUnit(unitId, shouldActivate) {
    await updateCustomUnit(unitId, {
        ...getCustomUnits().find((unit) => unit.id === unitId),
        active: shouldActivate
    });
}

function analyzeCatalogImport(csvText) {
    pendingCatalogImport = parseCatalogCsv(csvText, catalog.listItems());
    renderCatalogImportPreview(pendingCatalogImport);
}

function confirmReplaceImport() {
    return window.confirm(
        "Substituir o catálogo atual pelos itens do CSV? Um backup simples do catálogo atual será salvo."
    );
}

async function applyCatalogImport(mode) {
    if (!pendingCatalogImport?.items?.length) {
        showCatalogImportStatus("Analise um CSV válido antes de importar.");
        return;
    }

    if (mode === "replace" && !confirmReplaceImport()) {
        return;
    }

    if (mode === "replace") {
        await saveCatalogBackupBeforeImport(catalog.listItems());
        await saveCatalog(catalog.replaceWithImportedItems(pendingCatalogImport.items));
    } else if (mode === "upsert") {
        await saveCatalog(catalog.upsertImportedItems(pendingCatalogImport.items));
    } else {
        await saveCatalog(catalog.appendImportedItems(pendingCatalogImport.items));
    }

    pendingCatalogImport = null;
    refreshConfigList();
    resetCatalogImportPreview();
    showCatalogImportStatus("Catálogo importado com sucesso.");
}

function cancelCatalogImport() {
    pendingCatalogImport = null;
}

async function createCurrentBackupPayload() {
    return buildBackupPayload({
        catalogItems: catalog.listItems(),
        countingHistory: await loadCountingHistory(),
        lastFinalizedCount: await loadLastFinalizedCount(),
        customUnits: getCustomUnits(),
        localStorageKeys: await loadRelevantLocalStorageKeys()
    });
}

async function exportBackup() {
    downloadBackup(await createCurrentBackupPayload());
    showBackupImportStatus("Backup exportado.");
}

function analyzeBackupImport(jsonText) {
    const parsed = parseBackupText(jsonText);

    if (parsed.error) {
        pendingBackupImport = null;
        renderBackupImportPreview({ isValid: false, error: parsed.error });
        return;
    }

    const preview = previewBackupPayload(parsed.payload);

    if (!preview.isValid) {
        pendingBackupImport = null;
        renderBackupImportPreview(preview);
        return;
    }

    pendingBackupImport = normalizeBackupPayload(parsed.payload);
    renderBackupImportPreview(preview);
}

function confirmActiveDraftRisk(mode) {
    if (mode === "merge-history" || !counting.hasSession()) {
        return true;
    }

    return window.confirm(
        "Existe uma contagem em andamento. Importar este backup pode trocar o catálogo usado no app. Deseja continuar?"
    );
}

function confirmBackupImportMode(mode) {
    if (mode === "replace-all") {
        return window.confirm(
            "Substituir catálogo e histórico locais pelo backup? Um backup interno do estado atual será salvo antes."
        );
    }

    if (mode === "replace-catalog") {
        return window.confirm(
            "Substituir apenas o catálogo local pelo catálogo do backup? O histórico atual será mantido."
        );
    }

    return true;
}

async function applyBackupImport(mode) {
    if (!pendingBackupImport) {
        showBackupImportStatus("Analise um backup válido antes de importar.");
        return;
    }

    if (!confirmActiveDraftRisk(mode) || !confirmBackupImportMode(mode)) {
        return;
    }

    await saveBackupBeforeJsonImport(await createCurrentBackupPayload());

    if (mode === "replace-all") {
        await saveCustomUnitState(pendingBackupImport.customUnits);
        await saveCatalog(catalog.replaceItems(pendingBackupImport.catalogItems));
        await saveCountingHistory(pendingBackupImport.countingHistory);
    } else if (mode === "replace-catalog") {
        await saveCustomUnitState(mergeCustomUnitLists(getCustomUnits(), pendingBackupImport.customUnits));
        await saveCatalog(catalog.replaceItems(pendingBackupImport.catalogItems));
    } else {
        const currentHistory = await loadCountingHistory();
        await saveCustomUnitState(mergeCustomUnitLists(getCustomUnits(), pendingBackupImport.customUnits));
        await saveCountingHistory(mergeCountingHistory(currentHistory, pendingBackupImport.countingHistory));
    }

    lastFinalizedCount = await loadLastFinalizedCount();
    pendingBackupImport = null;
    refreshUnitsView();
    resetBackupImportPreview();
    showBackupImportStatus("Backup importado com sucesso.");
}

function cancelBackupImport() {
    pendingBackupImport = null;
}

async function saveCountingState() {
    const draft = counting.getDraft();

    if (draft) {
        await saveCountingDraft(draft);
    }
}

function renderCountingState() {
    hideDraftNotice();
    hideHistoryView();
    isCountingVisible = true;
    renderCountingView(counting.getViewModel(), countingHandlers);
}

async function startCounting() {
    if (counting.hasSession()) {
        confirmStartWithDraft(draftConflictHandlers);
        return;
    }

    await startNewCounting();
}

async function startNewCounting() {
    counting.startCounting();
    await saveCountingState();
    renderCountingState();
}

function renderInitialSavedState() {
    if (counting.hasSession()) {
        renderDraftNotice(counting.getDraft(), draftNoticeHandlers);
        return;
    }

    if (lastFinalizedCount) {
        renderLastFinalizedNotice(lastFinalizedCount, finalizedNoticeHandlers);
    }
}

async function continueDraft() {
    if (!counting.hasSession()) {
        return;
    }

    await saveCountingState();
    renderCountingState();
}

async function discardDraft() {
    const shouldDiscard = window.confirm("Descartar a contagem em andamento? O catálogo será mantido.");

    if (!shouldDiscard) {
        return;
    }

    counting.clearSession();
    await clearCountingDraft();
    isCountingVisible = false;
    hideDraftNotice();
}

async function discardDraftAndStartNew() {
    const shouldDiscard = window.confirm(
        "Descartar a contagem em andamento e iniciar uma nova? As entradas salvas serão apagadas."
    );

    if (!shouldDiscard) {
        return;
    }

    counting.clearSession();
    await clearCountingDraft();
    await startNewCounting();
}

function cancelDraftConflict() {
    if (isCountingVisible) {
        hideDraftNotice();
        return;
    }

    renderDraftNotice(counting.getDraft(), draftNoticeHandlers);
}

async function addCountingEntry(quantity, unitId) {
    const wasAdded = counting.addEntry(quantity, unitId);

    if (!wasAdded) {
        return false;
    }

    await saveCountingState();
    renderCountingState();
    return true;
}

async function removeCountingEntry(entryId) {
    counting.removeEntry(entryId);
    await saveCountingState();
    renderCountingState();
}

async function goToPreviousCountingItem() {
    counting.goToPreviousItem();
    await saveCountingState();
    renderCountingState();
}

async function goToNextCountingItem() {
    counting.goToNextItem();
    await saveCountingState();
    renderCountingState();
}

function openCatalogConfig() {
    openConfigModal(catalog.listItems(), catalogHandlers, unitHandlers);
}

async function loadQuickPilotContext() {
    const [templates, locations, links] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const selectedTemplate = templates.find((template) => template.id === selectedQuickPilotTemplateId)
        || templates[0]
        || null;

    selectedQuickPilotTemplateId = selectedTemplate?.id || null;
    return {
        templates,
        locations,
        links,
        selectedTemplate,
        plan: buildQuickPilotPlan(selectedTemplate, locations, links)
    };
}

async function refreshPilotDashboard() {
    try {
        const [{ plan }, whatsappSettings, sessions, entries] = await Promise.all([
            loadQuickPilotContext(),
            loadWhatsappSettings(),
            listLocationCountSessions(),
            listLocationCountEntries()
        ]);
        renderPilotDashboardStatus(
            summarizeQuickPilotStatus(plan),
            isWhatsappConfigured(whatsappSettings)
        );
        renderAreaCountingOverview(buildAreaCountingOverview(plan, sessions, entries));
    } catch {
        renderPilotDashboardStatus(summarizeQuickPilotStatus(null), false);
        renderAreaCountingOverview(buildAreaCountingOverview(null));
    }
}

async function loadCountConsolidationContext() {
    const [templates, sessions, entries, savedSettings, locations, links] = await Promise.all([
        listCountTemplates(),
        listLocationCountSessions(),
        listLocationCountEntries(),
        listItemUnitSettings(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const selectedTemplate = templates.find((template) => template.id === selectedCountConsolidationTemplateId)
        || templates[0]
        || null;
    selectedCountConsolidationTemplateId = selectedTemplate?.id || null;
    const unitSettings = resolveItemUnitSettings(selectedTemplate, savedSettings, entries);
    const report = selectedTemplate ? buildCountConsolidation({
        template: selectedTemplate,
        sessions,
        entries,
        unitSettings,
        locationNodes: locations,
        itemLocationLinks: links
    }) : null;
    return { templates, selectedTemplate, report };
}

async function refreshCountConsolidationView() {
    const context = await loadCountConsolidationContext();
    activeCountConsolidationReport = context.report;
    renderCountConsolidation(context);
    return context;
}

async function openCountConsolidation() {
    showCountConsolidationView();
    showCountConsolidationFeedback("Carregando a prévia…");
    try {
        await refreshCountConsolidationView();
        showCountConsolidationFeedback("");
    } catch (error) {
        showCountConsolidationFeedback(error.message || "Não foi possível montar a consolidação.", "error");
    }
}

function closeCountConsolidation() {
    hideCountConsolidationView();
    activeCountConsolidationReport = null;
}

async function selectCountConsolidationTemplate(templateId) {
    selectedCountConsolidationTemplateId = templateId;
    try {
        await refreshCountConsolidationView();
        showCountConsolidationFeedback("");
    } catch (error) {
        showCountConsolidationFeedback(error.message || "Não foi possível analisar este template.", "error");
    }
}

function getSnapshotConfirmation(status) {
    if (status === "complete") return "Salvar fechamento completo?";
    if (status === "partial") return "Há pendências. Salvar mesmo assim como parcial?";
    if (status === "empty") return "Não há lançamentos. Salvar snapshot vazio?";
    return "Os dados são insuficientes. Salvar mesmo assim como snapshot inválido?";
}

function getSnapshotStatusLabel(status) {
    const labels = { complete: "completo", partial: "parcial", empty: "vazio", invalid: "inválido" };
    return labels[status] || "inválido";
}

async function saveCurrentConsolidationSnapshot() {
    if (!activeCountConsolidationReport) {
        showCountConsolidationFeedback("A prévia precisa ser carregada antes de salvar.", "error");
        return;
    }
    const snapshot = createConsolidationSnapshotFromPreview(activeCountConsolidationReport);
    if (!window.confirm(getSnapshotConfirmation(snapshot.status))) return;
    try {
        const savedSnapshot = await saveConsolidationSnapshot(snapshot);
        const savedAt = new Date(savedSnapshot.createdAt).toLocaleString("pt-BR");
        showCountConsolidationFeedback(
            `Fechamento ${getSnapshotStatusLabel(savedSnapshot.status)} salvo em ${savedAt}. ID: ${savedSnapshot.id}`,
            savedSnapshot.status === "complete" ? "success" : "warning"
        );
    } catch (error) {
        showCountConsolidationFeedback(error.message || "Não foi possível salvar o fechamento.", "error");
    }
}

async function refreshConsolidationSnapshotsList() {
    const snapshots = await listConsolidationSnapshots();
    activeConsolidationSnapshotId = null;
    activeConsolidationSnapshot = null;
    activeSnapshotXlsxSelection = null;
    renderConsolidationSnapshotList(snapshots);
    return snapshots;
}

async function openConsolidationSnapshots() {
    showConsolidationSnapshotsView();
    showConsolidationSnapshotsFeedback("Carregando fechamentos…");
    try {
        await refreshConsolidationSnapshotsList();
        showConsolidationSnapshotsFeedback("");
    } catch {
        showConsolidationSnapshotsFeedback("Não foi possível carregar os fechamentos salvos.", "error");
    }
}

function closeConsolidationSnapshots() {
    activeConsolidationSnapshotId = null;
    activeConsolidationSnapshot = null;
    activeSnapshotXlsxSelection = null;
    hideConsolidationSnapshotsView();
}

async function openConsolidationSnapshotDetail(snapshotId) {
    try {
        const [snapshot, whatsappSettings] = await Promise.all([
            getConsolidationSnapshot(snapshotId),
            loadWhatsappSettings().catch(() => normalizeWhatsappSettings())
        ]);
        if (!snapshot) throw new Error("Fechamento não encontrado neste aparelho.");
        activeConsolidationSnapshotId = snapshot.id;
        activeConsolidationSnapshot = snapshot;
        activeSnapshotXlsxSelection = null;
        activeSnapshotWhatsappSettings = whatsappSettings;
        renderConsolidationSnapshotDetail(snapshot, buildSnapshotDetailOptions(snapshot));
        showConsolidationSnapshotsFeedback("");
    } catch (error) {
        showConsolidationSnapshotsFeedback(error.message || "Não foi possível abrir o fechamento.", "error");
    }
}

function buildSnapshotDetailOptions(snapshot) {
    return {
        shareCapability: getShareCapability(),
        shareMessage: buildWhatsappMessage(snapshot, "main", activeSnapshotWhatsappSettings),
        whatsappConfigured: isWhatsappConfigured(activeSnapshotWhatsappSettings)
    };
}

function confirmSnapshotFinalization(snapshot) {
    const confirmed = window.confirm(
        "Finalizar esta contagem vai fechar as sessões usadas neste fechamento e iniciar o próximo ciclo de contagem limpo. Os dados não serão apagados. Continuar?"
    );
    if (!confirmed) return false;
    if (snapshot.status === "partial") {
        return window.confirm("Este fechamento possui pendências. Finalizar mesmo assim?");
    }
    if (snapshot.status === "empty") {
        return window.confirm("Este fechamento está vazio. Confirma a finalização sem lançamentos?");
    }
    return true;
}

async function finalizeSavedConsolidationSnapshot() {
    try {
        const snapshot = await getConsolidationSnapshot(activeConsolidationSnapshotId);
        if (!snapshot) throw new Error("Abra um fechamento salvo antes de finalizar.");
        if (snapshot.finalizedAt) {
            showSnapshotFinalizationFeedback("Esta contagem já foi finalizada.", "warning");
            return;
        }
        if (snapshot.status === "invalid") throw new Error("Um fechamento inválido não pode ser finalizado.");
        if (!confirmSnapshotFinalization(snapshot)) return;
        const result = await finalizeConsolidationSnapshot(snapshot.id, { finalizedBy: "local-user" });
        activeConsolidationSnapshot = result.snapshot;
        activeSnapshotXlsxSelection = null;
        activeCountConsolidationReport = null;
        renderConsolidationSnapshotDetail(result.snapshot, buildSnapshotDetailOptions(result.snapshot));
        await refreshPilotDashboard();
        const message = result.warnings.length
            ? `Contagem finalizada com avisos: ${result.warnings.join(" ")}`
            : `Contagem finalizada. ${result.completedSessions.length} sessão(ões) foi(ram) fechada(s) agora.`;
        showSnapshotFinalizationFeedback(message, result.warnings.length ? "warning" : "success");
    } catch (error) {
        showSnapshotFinalizationFeedback(error.message || "Não foi possível finalizar a contagem.", "error");
    }
}

function getActiveSnapshotForSharing() {
    if (!activeConsolidationSnapshot || activeConsolidationSnapshot.id !== activeConsolidationSnapshotId) {
        throw new Error("Abra um fechamento salvo antes de compartilhar.");
    }
    return activeConsolidationSnapshot;
}

async function shareSavedSnapshotCsv(kind) {
    try {
        const snapshot = getActiveSnapshotForSharing();
        const result = await shareSnapshotCsv(snapshot, kind, activeSnapshotWhatsappSettings);
        if (result.status === "canceled") {
            showSnapshotShareFeedback("Compartilhamento cancelado. Nenhum arquivo foi enviado.");
            return;
        }
        if (result.status === "unsupported") {
            showSnapshotShareFeedback(
                "Compartilhamento de arquivo não disponível neste navegador. Use Baixar CSV e Abrir WhatsApp.",
                "warning"
            );
            return;
        }
        showSnapshotShareFeedback(`Menu experimental aberto para ${result.file.name}.`, "success");
    } catch {
        showSnapshotShareFeedback(
            "Compartilhamento de arquivo não disponível neste navegador. Use Baixar CSV e Abrir WhatsApp.",
            "warning"
        );
    }
}

function openSavedSnapshotWhatsapp() {
    try {
        const snapshot = getActiveSnapshotForSharing();
        const result = openWhatsappForSnapshot(snapshot, "main", activeSnapshotWhatsappSettings);
        const message = result.status === "blocked"
            ? "O navegador bloqueou o WhatsApp. Copie a mensagem e abra o aplicativo manualmente."
            : "WhatsApp aberto com a mensagem pronta. Anexe o CSV e confirme o envio manualmente.";
        showSnapshotShareFeedback(message, result.status === "blocked" ? "warning" : "success");
    } catch (error) {
        showSnapshotShareFeedback(error.message || "Não foi possível abrir o WhatsApp.", "error");
    }
}

async function copySavedSnapshotMessage() {
    try {
        const snapshot = getActiveSnapshotForSharing();
        const message = buildWhatsappMessage(snapshot, "main", activeSnapshotWhatsappSettings);
        const result = await copyShareMessageToClipboard(message);
        if (result.status === "copied") {
            showSnapshotShareFeedback("Mensagem copiada.", "success");
            return;
        }
        selectSnapshotShareMessage();
        showSnapshotShareFeedback("Cópia automática indisponível. O texto foi selecionado para copiar manualmente.", "warning");
    } catch (error) {
        showSnapshotShareFeedback(error.message || "Não foi possível copiar a mensagem.", "error");
    }
}

async function exportSavedSnapshotCsv(kind) {
    try {
        const snapshot = await getConsolidationSnapshot(activeConsolidationSnapshotId);
        if (!snapshot) throw new Error("Abra um fechamento salvo antes de exportar.");
        const bundle = buildSnapshotCsvBundle(snapshot);
        if (kind === "pending" && !bundle.hasPending) {
            showSnapshotCsvExportFeedback("Este fechamento não possui pendências.", "warning");
            return;
        }
        const file = kind === "pending" ? bundle.pending : bundle.main;
        const method = downloadSnapshotCsvFile(file.filename, file.content, file.mimeType);
        const message = method === "new_tab" ? "CSV aberto em uma nova aba." : `Download iniciado: ${file.filename}`;
        showSnapshotCsvExportFeedback(message, "success");
    } catch (error) {
        showSnapshotCsvExportFeedback(error.message || "Não foi possível gerar o CSV.", "error");
    }
}

function getActiveSnapshotForXlsxExport() {
    if (!activeConsolidationSnapshot || activeConsolidationSnapshot.id !== activeConsolidationSnapshotId) {
        throw new Error("Abra um fechamento salvo antes de exportar XLSX.");
    }
    return activeConsolidationSnapshot;
}

async function selectSnapshotXlsxTemplate(file) {
    let snapshot = null;
    try {
        snapshot = getActiveSnapshotForXlsxExport();
        activeSnapshotXlsxSelection = null;
        if (!file) {
            resetSnapshotXlsxExport(snapshot);
            return;
        }
        setSnapshotXlsxExportBusy(true);
        showSnapshotXlsxExportFeedback("Validando a planilha modelo…");
        const {
            analyzeWorkbookForExport,
            buildXlsxExportPlan,
            readWorkbookFromFile
        } = await loadSnapshotXlsxExport();
        const workbook = await readWorkbookFromFile(file);
        const workbookAnalysis = analyzeWorkbookForExport(workbook);
        const plan = buildXlsxExportPlan(snapshot, workbookAnalysis);
        activeSnapshotXlsxSelection = { file, plan, snapshotId: snapshot.id };
        renderSnapshotXlsxExportPlan(file, plan);
        const message = plan.canExport
            ? "Modelo validado. Confira o resumo e gere a cópia preenchida."
            : "A exportação está bloqueada. Revise os motivos apresentados.";
        const tone = plan.canExport ? (plan.warnings.length ? "warning" : "success") : "error";
        showSnapshotXlsxExportFeedback(message, tone);
        setSnapshotXlsxExportBusy(false, plan.canExport);
    } catch (error) {
        if (snapshot) resetSnapshotXlsxExport(snapshot);
        setSnapshotXlsxExportBusy(false, false);
        showSnapshotXlsxExportFeedback(error.message || "Não foi possível validar a planilha modelo.", "error");
    }
}

async function exportSavedSnapshotXlsx() {
    const selection = activeSnapshotXlsxSelection;
    try {
        const snapshot = getActiveSnapshotForXlsxExport();
        if (!selection?.file || selection.snapshotId !== snapshot.id) {
            showSnapshotXlsxExportFeedback("Selecione e valide uma planilha modelo antes de gerar.", "warning");
            return;
        }
        setSnapshotXlsxExportBusy(true);
        showSnapshotXlsxExportFeedback("Gerando uma cópia preenchida em memória…");
        const { exportSnapshotToXlsx } = await loadSnapshotXlsxExport();
        const result = await exportSnapshotToXlsx({ snapshot, file: selection.file });
        activeSnapshotXlsxSelection = { ...selection, plan: result.plan };
        renderSnapshotXlsxExportPlan(selection.file, result.plan);
        if (result.status === "blocked") {
            showSnapshotXlsxExportFeedback("A planilha mudou ou apresentou bloqueios. Nenhum XLSX foi gerado.", "error");
            setSnapshotXlsxExportBusy(false, false);
            return;
        }
        showSnapshotXlsxExportFeedback(`Download iniciado: ${result.filename}`, "success");
        setSnapshotXlsxExportBusy(false, true);
    } catch (error) {
        showSnapshotXlsxExportFeedback(error.message || "Não foi possível gerar o XLSX.", "error");
        setSnapshotXlsxExportBusy(false, Boolean(selection?.plan?.canExport));
    }
}

async function deleteSavedConsolidationSnapshot(snapshotId) {
    try {
        const snapshot = await getConsolidationSnapshot(snapshotId);
        if (!snapshot || !window.confirm(`Excluir o fechamento "${snapshot.label}"?`)) return;
        await deleteConsolidationSnapshot(snapshotId);
        await refreshConsolidationSnapshotsList();
        showConsolidationSnapshotsFeedback("Fechamento excluído deste aparelho.", "success");
    } catch {
        showConsolidationSnapshotsFeedback("Não foi possível excluir o fechamento.", "error");
    }
}

async function refreshAreaCountingView() {
    const session = await getLocationCountSession(activeAreaCountSessionId);
    if (!session) throw new Error("A sessão de contagem não foi encontrada.");
    const [entries, template, savedUnitSettings] = await Promise.all([
        listLocationCountEntries(),
        getCountTemplate(session.templateId),
        listItemUnitSettings()
    ]);
    const unitSettings = resolveItemUnitSettings(template, savedUnitSettings, entries);
    renderAreaCountingView(
        buildAreaCountingViewModel(session, entries, unitSettings),
        activeAreaOpenSessionCount
    );
    return session;
}

async function openAreaCounting(locationId) {
    try {
        const [{ plan }, sessions] = await Promise.all([loadQuickPilotContext(), listLocationCountSessions()]);
        const area = plan?.areas.find((item) => (
            item.locationPlan.location.id === locationId && item.locationPlan.action === "reuse"
        ));
        if (!area) throw new Error("Esta área não está pronta para contar.");
        const openSessions = listOpenAreaSessions(sessions, plan.templateId, locationId);
        if (openSessions.length === 0 && area.activeExistingLinkCount === 0) {
            throw new Error("Esta área não possui itens vinculados ativos para criar uma sessão.");
        }
        const session = openSessions[0] || await createLocationCountSessionDraft({
            templateId: plan.templateId,
            locationId,
            notes: "Criada pela contagem simples por área."
        });

        activeAreaCountSessionId = session.id;
        activeAreaOpenSessionCount = Math.max(openSessions.length, 1);
        await refreshAreaCountingView();
        showAreaCountingFeedback(openSessions.length ? "Sessão aberta novamente." : "Rascunho criado para esta área.", "success");
        showAreaCountingView();
        await refreshPilotDashboard();
    } catch (error) {
        window.alert(error.message || "Não foi possível abrir a contagem desta área.");
    }
}

async function addAreaCountEntry(values) {
    try {
        let session = await getLocationCountSession(activeAreaCountSessionId);
        const plannedItem = session?.plannedItems.find((item) => (
            item.itemCode === values.itemCode && item.linkId === values.linkId
        ));
        if (!session || !plannedItem) throw new Error("Item planejado não encontrado nesta sessão.");

        await addLocationCountEntry({ session, plannedItem, ...values });
        session = session.status === "draft"
            ? await startLocationCountSession(session.id)
            : await saveLocationCountSession(session);
        await refreshAreaCountingView();
        await refreshPilotDashboard();
        showAreaCountingFeedback(
            values.rawUnit.trim() ? "Entrada adicionada." : "Entrada adicionada sem unidade; confira antes de uma exportação futura.",
            values.rawUnit.trim() ? "success" : "warning"
        );
    } catch (error) {
        showAreaCountingFeedback(error.message || "Não foi possível adicionar a entrada.", "error");
    }
}

async function removeAreaCountEntry(entryId) {
    try {
        const removedEntry = await removeLocationCountEntry(entryId);
        const session = await getLocationCountSession(removedEntry.sessionId);
        if (session?.status === "in_progress") await saveLocationCountSession(session);
        await refreshAreaCountingView();
        await refreshPilotDashboard();
        showAreaCountingFeedback("Entrada removida. O registro foi preservado como inativo.", "success");
    } catch (error) {
        showAreaCountingFeedback(error.message || "Não foi possível remover a entrada.", "error");
    }
}

async function closeAreaCounting() {
    activeAreaCountSessionId = null;
    activeAreaOpenSessionCount = 0;
    hideAreaCountingView();
    await refreshPilotDashboard();
}

async function refreshQuickPilotView() {
    const context = await loadQuickPilotContext();
    renderQuickPilot({
        templates: context.templates,
        selectedTemplateId: selectedQuickPilotTemplateId,
        plan: context.plan
    });
    return context;
}

async function openQuickPilot() {
    showQuickPilotAdminSection();
    showQuickPilotFeedback("");

    try {
        await refreshQuickPilotView();
    } catch {
        showQuickPilotFeedback("Não foi possível preparar a configuração automática.", "error");
    }
}

async function selectQuickPilotTemplate(templateId) {
    selectedQuickPilotTemplateId = templateId;
    await openQuickPilot();
}

async function saveQuickPilotLocations(plan) {
    let created = 0;
    let reactivated = 0;

    for (const area of plan.areas) {
        if (area.locationPlan.action === "create") {
            await saveLocationNode(area.locationPlan.location);
            created += 1;
        } else if (area.locationPlan.action === "reactivate") {
            await saveLocationNode({ ...area.locationPlan.location, active: true });
            reactivated += 1;
        }
    }

    return { created, reactivated };
}

async function applyQuickPilotSetup() {
    try {
        const initialContext = await loadQuickPilotContext();
        if (!initialContext.plan?.canApply) {
            showQuickPilotFeedback("A configuração possui conflitos que precisam de ajuste manual.", "error");
            return;
        }

        const locationResult = await saveQuickPilotLocations(initialContext.plan);
        const updatedContext = await loadQuickPilotContext();
        const candidates = buildQuickPilotLinkCandidates(updatedContext.plan, updatedContext.links)
            .map((link) => ({ ...link, id: createItemLocationLinkId() }));
        await saveItemLocationLinksBatch(candidates);
        await refreshQuickPilotView();
        await refreshPilotDashboard();
        showQuickPilotFeedback(
            `${initialContext.plan.areaCount} área(s): ${locationResult.created} local(is) criado(s), ${initialContext.plan.reusedLocationCount} reutilizado(s), ${locationResult.reactivated} reativado(s), ${candidates.length} vínculo(s) criado(s) e ${initialContext.plan.existingLinkCount} já existente(s).`,
            "success"
        );
    } catch (error) {
        showQuickPilotFeedback(error.message || "Não foi possível aplicar a configuração automática.", "error");
    }
}

async function loadItemUnitSettingsContext() {
    const [templates, savedSettings, entries] = await Promise.all([
        listCountTemplates(),
        listItemUnitSettings(),
        listLocationCountEntries()
    ]);
    const selectedTemplate = templates.find((template) => template.id === selectedItemUnitTemplateId)
        || templates[0]
        || null;
    selectedItemUnitTemplateId = selectedTemplate?.id || null;
    const settings = resolveItemUnitSettings(selectedTemplate, savedSettings, entries);
    const portability = selectedTemplate
        ? buildUnitProfileTemplateExport(selectedTemplate, savedSettings)
        : null;
    return {
        templates,
        selectedTemplate,
        settings,
        summary: summarizeItemUnitSettings(selectedTemplate, settings),
        portabilitySummary: portability?.summary || null
    };
}

async function refreshItemUnitSettingsView() {
    const context = await loadItemUnitSettingsContext();
    renderItemUnitSettings(context);
    return context;
}

async function openItemUnitSettings() {
    showItemUnitSettingsAdminSection();
    showItemUnitSettingsFeedback("");
    try {
        await refreshItemUnitSettingsView();
    } catch {
        showItemUnitSettingsFeedback("Não foi possível analisar as unidades dos itens.", "error");
    }
}

async function selectItemUnitTemplate(templateId) {
    selectedItemUnitTemplateId = templateId;
    await openItemUnitSettings();
}

async function analyzeItemUnits() {
    try {
        const context = await refreshItemUnitSettingsView();
        showItemUnitSettingsFeedback(
            `${context.summary.completeProfileCount} de ${context.summary.itemCount} item(ns) possuem perfil completo.`,
            context.summary.withoutProfileCount || context.summary.needsReviewCount ? "warning" : "success"
        );
    } catch {
        showItemUnitSettingsFeedback("Não foi possível atualizar as sugestões.", "error");
    }
}

async function exportTemplateWithUnitProfiles() {
    try {
        const [template, explicitSettings] = await Promise.all([
            getCountTemplate(selectedItemUnitTemplateId),
            listItemUnitSettings()
        ]);
        if (!template) throw new Error("Selecione um template para exportar.");

        const result = buildUnitProfileTemplateExport(template, explicitSettings);
        if (!result.isValid) throw new Error(result.error || "Não foi possível preparar o template.");

        downloadSnapshotCsvFile(
            formatSanitizedUnitTemplateFilename(result.template),
            `${JSON.stringify(result.template, null, 2)}\n`,
            "application/json;charset=utf-8"
        );
        showItemUnitSettingsFeedback(
            `Template baixado com ${result.summary.explicitProfileCount} perfil(is) explícito(s). ${result.summary.remainingWithoutExplicitProfileCount} item(ns) ainda não possuem perfil explícito.`,
            result.summary.explicitNeedsReviewCount ? "warning" : "success"
        );
    } catch (error) {
        showItemUnitSettingsFeedback(error.message || "Não foi possível baixar o template com unidades.", "error");
    }
}

async function saveManualItemUnit(itemCode, overrides) {
    try {
        const context = await loadItemUnitSettingsContext();
        const profile = context.settings.find((item) => item.itemCode === itemCode);
        if (!profile) throw new Error("Item não encontrado no template selecionado.");
        const result = buildControlledItemUnitProfile(profile, overrides);
        if (!result.isValid) {
            showItemUnitSettingsFeedback(result.error || "A configuração de unidade está incompleta.", "warning");
            return false;
        }
        await saveItemUnitSetting(result.setting);
        await refreshItemUnitSettingsView();
        const message = result.isResolved
            ? "Configuração de unidade salva e marcada como resolvida neste aparelho."
            : `Configuração salva, mas continua pendente. ${result.warnings[0] || "Revise as unidades."}`;
        showItemUnitSettingsFeedback(message, result.isResolved ? "success" : "warning");
        return true;
    } catch (error) {
        showItemUnitSettingsFeedback(error.message || "Não foi possível salvar a unidade.", "error");
        return false;
    }
}

async function clearManualItemUnit(itemCode) {
    if (!window.confirm("Limpar a configuração manual deste item e voltar ao perfil automático?")) return null;
    try {
        await deleteItemUnitSetting(selectedItemUnitTemplateId, itemCode);
        await refreshItemUnitSettingsView();
        showItemUnitSettingsFeedback("Configuração removida; o perfil automático voltou a valer.", "success");
        return true;
    } catch (error) {
        showItemUnitSettingsFeedback(error.message || "Não foi possível limpar a unidade manual.", "error");
        return false;
    }
}

async function openWhatsappSettings() {
    showWhatsappSettingsAdminSection();
    showWhatsappSettingsFeedback("");

    try {
        renderWhatsappSettings(await loadWhatsappSettings());
    } catch {
        showWhatsappSettingsFeedback("Não foi possível carregar a configuração.", "error");
    }
}

async function updateWhatsappSettings(values) {
    try {
        const result = await saveWhatsappSettings(values);
        renderWhatsappSettings(result.settings);
        await refreshPilotDashboard();
        const warning = result.warnings[0];
        showWhatsappSettingsFeedback(
            warning ? `Configuração salva. ${warning}` : "Configuração salva neste aparelho.",
            warning ? "warning" : "success"
        );
    } catch {
        showWhatsappSettingsFeedback("Não foi possível salvar a configuração.", "error");
    }
}

async function removeWhatsappSettings() {
    try {
        await clearWhatsappSettings();
        renderWhatsappSettings(normalizeWhatsappSettings());
        await refreshPilotDashboard();
        showWhatsappSettingsFeedback("Configuração removida deste aparelho.", "success");
    } catch {
        showWhatsappSettingsFeedback("Não foi possível limpar a configuração.", "error");
    }
}

async function restartCounting() {
    const shouldRestart = window.confirm(
        "Iniciar nova contagem? O relatório finalizado continuará salvo, mas a tela atual será fechada."
    );

    if (!shouldRestart) {
        return;
    }

    counting.clearSession();
    await clearCountingDraft();
    await startNewCounting();
}

function viewLastFinalizedCount() {
    if (!lastFinalizedCount) {
        return;
    }

    showFinalSummary(lastFinalizedCount.summaries || [], lastFinalizedCount.finishedAt, lastFinalizedCount);
}

async function openHistory() {
    openConfigModal(catalog.listItems(), catalogHandlers, unitHandlers, "history");
    showHistoryList(await loadCountingHistory(), historyHandlers);
}

function closeHistory() {
    hideHistoryView();
    showAdminMenu();
}

async function viewHistoryEntry(entryId) {
    const entry = (await loadCountingHistory()).find((historyEntry) => historyEntry.id === entryId);

    if (!entry) {
        await openHistory();
        return;
    }

    showHistoryDetail(entry, historyHandlers);
}

async function refreshCountTemplatesView() {
    const templates = await listCountTemplates();
    renderCountTemplateList(templates, countTemplateHandlers);
}

async function openCountTemplates() {
    showCountTemplatesAdminSection();
    showCountTemplateFeedback("");

    try {
        await refreshCountTemplatesView();
    } catch {
        showCountTemplateFeedback("Não foi possível carregar os templates salvos.", "error");
    }
}

async function importCountTemplate(jsonText, importFileName) {
    let payload;

    try {
        payload = JSON.parse(jsonText);
    } catch {
        showCountTemplateFeedback("O arquivo JSON está malformado.", "error");
        return false;
    }

    const validation = validateCountTemplate(payload);

    if (!validation.isValid) {
        showCountTemplateFeedback(`Template inválido: ${validation.errors.slice(0, 3).join(" ")}`, "error");
        return false;
    }

    try {
        const result = await importCountTemplateWithUnitProfiles(payload, {
            importedAt: new Date().toISOString(),
            importFileName
        });
        await refreshCountTemplatesView();
        await refreshPilotDashboard();
        if (selectedItemUnitTemplateId === result.template.id) await refreshItemUnitSettingsView();

        const summary = result.summary;
        const conflictCodes = result.conflicts.slice(0, 3).map((conflict) => conflict.itemCode).join(", ");
        const conflictDetail = conflictCodes ? ` (${conflictCodes}${result.conflicts.length > 3 ? ", …" : ""})` : "";
        const message = result.isLegacy
            ? "Template legado importado. Os perfis locais de unidade foram preservados."
            : `Template importado: ${summary.appliedCount} perfil(is) aplicado(s), ${summary.noOpCount} já igual(is) e ${summary.conflictCount} conflito(s) preservado(s) localmente${conflictDetail}.`;
        showCountTemplateFeedback(message, summary.conflictCount ? "warning" : "success");
        return true;
    } catch (error) {
        showCountTemplateFeedback(error.message || "Não foi possível salvar o template neste dispositivo.", "error");
        return false;
    }
}

async function viewCountTemplate(templateId) {
    try {
        const template = await getCountTemplate(templateId);

        if (!template) {
            showCountTemplateFeedback("Template não encontrado.", "error");
            await refreshCountTemplatesView();
            return;
        }

        renderCountTemplateDetail(template, countTemplateHandlers);
    } catch {
        showCountTemplateFeedback("Não foi possível abrir o template.", "error");
    }
}

async function removeCountTemplate(templateId) {
    try {
        const template = await getCountTemplate(templateId);

        if (!template || !window.confirm(`Remover o template "${template.name}" deste dispositivo?`)) {
            return;
        }

        await deleteCountTemplate(templateId);
        await refreshCountTemplatesView();
        await refreshPilotDashboard();
        showCountTemplateFeedback("Template removido.", "success");
    } catch {
        showCountTemplateFeedback("Não foi possível remover o template.", "error");
    }
}

function createLocationNodeId() {
    if (globalThis.crypto?.randomUUID) {
        return `location_${globalThis.crypto.randomUUID()}`;
    }

    return `location_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function refreshLocationNodesView() {
    const nodes = await listLocationNodes();
    renderLocationNodes(nodes, locationNodeHandlers);
    return nodes;
}

async function openLocationNodes() {
    showLocationNodesAdminSection();
    showLocationNodesFeedback("");

    try {
        await refreshLocationNodesView();
    } catch {
        showLocationNodesFeedback("Não foi possível carregar os locais físicos.", "error");
    }
}

async function refreshCountPreparationView() {
    const [templates, locationNodes] = await Promise.all([listCountTemplates(), listLocationNodes()]);
    const selectedTemplate = templates.find((template) => template.id === selectedCountPreparationTemplateId)
        || templates[0]
        || null;

    selectedCountPreparationTemplateId = selectedTemplate?.id || null;
    renderCountPreparation({
        templates,
        selectedTemplateId: selectedCountPreparationTemplateId,
        report: selectedTemplate ? buildCoverageReport(selectedTemplate, locationNodes) : null
    });
}

async function openCountPreparation() {
    showCountPreparationAdminSection();
    showCountPreparationFeedback("");

    try {
        await refreshCountPreparationView();
    } catch {
        showCountPreparationFeedback("Não foi possível gerar a prévia de cobertura.", "error");
    }
}

async function selectCountPreparationTemplate(templateId) {
    selectedCountPreparationTemplateId = templateId;

    try {
        await refreshCountPreparationView();
    } catch {
        showCountPreparationFeedback("Não foi possível analisar o template selecionado.", "error");
    }
}

function createItemLocationLinkId() {
    if (globalThis.crypto?.randomUUID) {
        return `item_location_${globalThis.crypto.randomUUID()}`;
    }

    return `item_location_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

async function refreshItemLocationLinksView() {
    const [templates, locations, allLinks] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const selectedTemplate = templates.find((template) => template.id === selectedItemLinksTemplateId)
        || templates[0]
        || null;

    selectedItemLinksTemplateId = selectedTemplate?.id || null;
    selectedLinkItemCode = findTemplateItem(selectedTemplate, selectedLinkItemCode)?.item.code || null;
    itemLinksLocationFilter = locations.some((location) => location.id === itemLinksLocationFilter)
        ? itemLinksLocationFilter
        : "";
    itemLinksItemFilter = findTemplateItem(selectedTemplate, itemLinksItemFilter)?.item.code || "";
    renderItemLocationLinks({
        templates,
        selectedTemplate,
        locations,
        links: allLinks.filter((link) => link.templateId === selectedItemLinksTemplateId),
        selectedItemCode: selectedLinkItemCode,
        locationFilter: itemLinksLocationFilter,
        itemFilter: itemLinksItemFilter
    }, itemLocationLinkHandlers);
}

async function openItemLocationLinks() {
    showItemLocationLinksAdminSection();
    showItemLocationLinksFeedback("");

    try {
        await refreshItemLocationLinksView();
    } catch {
        showItemLocationLinksFeedback("Não foi possível carregar os vínculos de itens.", "error");
    }
}

async function selectItemLinksTemplate(templateId) {
    selectedItemLinksTemplateId = templateId;
    selectedLinkItemCode = null;
    itemLinksLocationFilter = "";
    itemLinksItemFilter = "";
    await openItemLocationLinks();
}

async function selectLinkItem(itemCode) {
    selectedLinkItemCode = itemCode;
    await refreshItemLocationLinksView();
}

function getNextLinkOrder(links, templateId, locationId) {
    const orders = links
        .filter((link) => link.templateId === templateId && link.locationId === locationId)
        .map((link) => Number(link.order) || 0);
    return orders.length > 0 ? Math.max(...orders) + 1 : 0;
}

async function createItemLocationLink(locationId) {
    if (!selectedItemLinksTemplateId || !selectedLinkItemCode || !locationId) {
        showItemLocationLinksFeedback("Selecione um item e um local físico.", "error");
        return;
    }

    try {
        const links = await listItemLocationLinks();
        await saveItemLocationLink({
            id: createItemLocationLinkId(),
            templateId: selectedItemLinksTemplateId,
            itemCode: selectedLinkItemCode,
            locationId,
            order: getNextLinkOrder(links, selectedItemLinksTemplateId, locationId),
            active: true
        });
        await refreshItemLocationLinksView();
        await refreshPilotDashboard();
        showItemLocationLinksFeedback("Item vinculado ao local.", "success");
    } catch (error) {
        showItemLocationLinksFeedback(error.message || "Não foi possível criar o vínculo.", "error");
    }
}

async function toggleItemLocationLink(linkId, active) {
    try {
        const link = await getItemLocationLink(linkId);

        if (!link) {
            showItemLocationLinksFeedback("Vínculo não encontrado.", "error");
            return;
        }

        await saveItemLocationLink({ ...link, active });
        await refreshItemLocationLinksView();
        await refreshPilotDashboard();
        showItemLocationLinksFeedback(active ? "Vínculo ativado." : "Vínculo desativado.", "success");
    } catch (error) {
        showItemLocationLinksFeedback(error.message || "Não foi possível atualizar o vínculo.", "error");
    }
}

async function removeItemLocationLink(linkId) {
    try {
        const link = await getItemLocationLink(linkId);

        if (!link || !window.confirm(`Remover o vínculo de "${link.itemNameSnapshot}" com este local?`)) {
            return;
        }

        await deleteItemLocationLink(linkId);
        await refreshItemLocationLinksView();
        await refreshPilotDashboard();
        showItemLocationLinksFeedback("Vínculo removido.", "success");
    } catch {
        showItemLocationLinksFeedback("Não foi possível remover o vínculo.", "error");
    }
}

async function moveItemLocationLink(linkId, direction) {
    try {
        const links = await listLinksByTemplate(selectedItemLinksTemplateId);
        const link = links.find((item) => item.id === linkId);

        if (!link) {
            return;
        }

        const siblings = links
            .filter((item) => item.locationId === link.locationId)
            .sort((first, second) => first.order - second.order);
        const currentIndex = siblings.findIndex((item) => item.id === linkId);
        const targetIndex = currentIndex + direction;

        if (targetIndex < 0 || targetIndex >= siblings.length) {
            return;
        }

        const reordered = [...siblings];
        reordered.splice(currentIndex, 1);
        reordered.splice(targetIndex, 0, link);

        for (const [index, sibling] of reordered.entries()) {
            await saveItemLocationLink({ ...sibling, order: index });
        }

        await refreshItemLocationLinksView();
        showItemLocationLinksFeedback("Ordem dos itens atualizada.", "success");
    } catch (error) {
        showItemLocationLinksFeedback(error.message || "Não foi possível reordenar os vínculos.", "error");
    }
}

async function filterItemLinksByLocation(locationId) {
    itemLinksLocationFilter = locationId;
    await refreshItemLocationLinksView();
}

async function filterItemLinksByItem(itemCode) {
    itemLinksItemFilter = itemCode;
    await refreshItemLocationLinksView();
}

async function refreshLocationItemMapView() {
    const [templates, locations, links] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const selectedTemplate = templates.find((template) => template.id === selectedLocationItemMapTemplateId)
        || templates[0]
        || null;

    selectedLocationItemMapTemplateId = selectedTemplate?.id || null;
    renderLocationItemMap({
        templates,
        selectedTemplate,
        report: selectedTemplate ? buildLocationItemMap(selectedTemplate, templates, locations, links) : null
    });
}

async function openLocationItemMap() {
    showLocationItemMapAdminSection();
    showLocationItemMapFeedback("");

    try {
        await refreshLocationItemMapView();
    } catch {
        showLocationItemMapFeedback("Não foi possível montar o mapa de itens por local.", "error");
    }
}

async function selectLocationItemMapTemplate(templateId) {
    selectedLocationItemMapTemplateId = templateId;

    try {
        await refreshLocationItemMapView();
    } catch {
        showLocationItemMapFeedback("Não foi possível analisar o template selecionado.", "error");
    }
}

async function refreshLocationCountSessionsView() {
    const [templates, locations, links, sessions] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks(),
        listLocationCountSessions()
    ]);
    const selectedTemplate = templates.find((item) => item.id === selectedLocationCountSessionTemplateId)
        || templates[0]
        || null;
    const selectedLocation = locations.find((item) => item.id === selectedLocationCountSessionLocationId)
        || locations.find((item) => item.active)
        || locations[0]
        || null;

    selectedLocationCountSessionTemplateId = selectedTemplate?.id || null;
    selectedLocationCountSessionLocationId = selectedLocation?.id || null;
    renderLocationCountSessions({ templates, locations, links, sessions, selectedTemplate, selectedLocation }, locationCountSessionHandlers);
}

async function openLocationCountSessions() {
    showLocationCountSessionsAdminSection();
    showLocationCountSessionsFeedback("");

    try {
        await refreshLocationCountSessionsView();
    } catch {
        showLocationCountSessionsFeedback("Não foi possível carregar as sessões de contagem.", "error");
    }
}

async function selectLocationCountSessionTemplate(templateId) {
    selectedLocationCountSessionTemplateId = templateId;
    await openLocationCountSessions();
}

async function selectLocationCountSessionLocation(locationId) {
    selectedLocationCountSessionLocationId = locationId;
    await openLocationCountSessions();
}

async function createLocationCountDraft(notes) {
    try {
        await createLocationCountSessionDraft({
            templateId: selectedLocationCountSessionTemplateId,
            locationId: selectedLocationCountSessionLocationId,
            notes
        });
        await refreshLocationCountSessionsView();
        await refreshPilotDashboard();
        showLocationCountSessionsFeedback("Sessão criada em rascunho.", "success");
        return true;
    } catch (error) {
        showLocationCountSessionsFeedback(error.message || "Não foi possível criar a sessão.", "error");
        return false;
    }
}

async function cancelLocationCountDraft(sessionId) {
    try {
        const session = (await listLocationCountSessions()).find((item) => item.id === sessionId);
        const locationPath = session?.locationPathSnapshot.join(" › ") || "este local";

        if (!session || !window.confirm(`Cancelar o rascunho de ${locationPath}?`)) return;

        await cancelLocationCountSession(sessionId);
        await refreshLocationCountSessionsView();
        await refreshPilotDashboard();
        showLocationCountSessionsFeedback("Sessão cancelada.", "success");
    } catch (error) {
        showLocationCountSessionsFeedback(error.message || "Não foi possível cancelar a sessão.", "error");
    }
}

async function removeLocationCountSession(sessionId) {
    try {
        const session = (await listLocationCountSessions()).find((item) => item.id === sessionId);

        if (!session || !window.confirm("Remover permanentemente esta sessão preparada?")) return;

        await deleteLocationCountSession(sessionId);
        await refreshLocationCountSessionsView();
        await refreshPilotDashboard();
        showLocationCountSessionsFeedback("Sessão removida.", "success");
    } catch (error) {
        showLocationCountSessionsFeedback(error.message || "Não foi possível remover a sessão.", "error");
    }
}

function getNextSiblingOrder(parentId, nodes) {
    const siblingOrders = nodes
        .filter((node) => node.parentId === parentId)
        .map((node) => Number(node.order) || 0);

    return siblingOrders.length > 0 ? Math.max(...siblingOrders) + 1 : 0;
}

async function savePhysicalLocation(values) {
    try {
        const nodes = await listLocationNodes();
        const existingNode = values.id ? nodes.find((node) => node.id === values.id) : null;
        await saveLocationNode({
            ...values,
            id: existingNode?.id || createLocationNodeId(),
            order: existingNode?.order ?? getNextSiblingOrder(values.parentId, nodes)
        });
        await refreshLocationNodesView();
        await refreshPilotDashboard();
        showLocationNodesFeedback(existingNode ? "Local atualizado." : "Local criado.", "success");
        return true;
    } catch (error) {
        showLocationNodesFeedback(error.message || "Não foi possível salvar o local.", "error");
        return false;
    }
}

async function removePhysicalLocation(locationId) {
    try {
        const nodes = await listLocationNodes();
        const node = nodes.find((item) => item.id === locationId);

        if (!node) {
            showLocationNodesFeedback("Local não encontrado.", "error");
            return;
        }

        if (nodes.some((item) => item.parentId === locationId)) {
            showLocationNodesFeedback("Remova ou reorganize os locais filhos antes de excluir este local.", "error");
            return;
        }

        if (!window.confirm(`Remover o local "${node.name}"?`)) {
            return;
        }

        await deleteLocationNode(locationId);
        await refreshLocationNodesView();
        await refreshPilotDashboard();
        showLocationNodesFeedback("Local removido.", "success");
    } catch {
        showLocationNodesFeedback("Não foi possível remover o local.", "error");
    }
}

function sortSiblingNodes(nodes, parentId) {
    return nodes
        .filter((node) => node.parentId === parentId)
        .sort((firstNode, secondNode) => (
            firstNode.order - secondNode.order || firstNode.name.localeCompare(secondNode.name, "pt-BR")
        ));
}

async function movePhysicalLocation(locationId, direction) {
    try {
        const nodes = await listLocationNodes();
        const node = nodes.find((item) => item.id === locationId);

        if (!node) {
            return;
        }

        const siblings = sortSiblingNodes(nodes, node.parentId);
        const currentIndex = siblings.findIndex((item) => item.id === locationId);
        const targetIndex = currentIndex + direction;

        if (targetIndex < 0 || targetIndex >= siblings.length) {
            return;
        }

        const reorderedSiblings = [...siblings];
        reorderedSiblings.splice(currentIndex, 1);
        reorderedSiblings.splice(targetIndex, 0, node);

        for (const [index, sibling] of reorderedSiblings.entries()) {
            await saveLocationNode({ ...sibling, order: index });
        }

        await refreshLocationNodesView();
        showLocationNodesFeedback("Ordem dos locais atualizada.", "success");
    } catch (error) {
        showLocationNodesFeedback(error.message || "Não foi possível reordenar os locais.", "error");
    }
}

const catalogHandlers = {
    getItems: catalog.listItems,
    onDeleteItem: deleteItem,
    onUpdateItem: updateItem,
    onReorderItems: reorderItems
};

const unitHandlers = {
    getUnits: getAllUnits,
    onAddUnit: addCustomUnit,
    onUpdateUnit: updateCustomUnit,
    onToggleUnit: toggleCustomUnit
};

const countingHandlers = {
    onAddEntry: addCountingEntry,
    onRemoveEntry: removeCountingEntry,
    onPreviousItem: goToPreviousCountingItem,
    onNextItem: goToNextCountingItem,
    onFinishCounting: finishCounting
};

const draftNoticeHandlers = {
    onContinueDraft: continueDraft,
    onDiscardDraft: discardDraft
};

const draftConflictHandlers = {
    onContinueDraft: continueDraft,
    onDiscardAndStartNew: discardDraftAndStartNew,
    onCancel: cancelDraftConflict
};

const finalizedNoticeHandlers = {
    onViewLastFinalized: viewLastFinalizedCount
};

const historyHandlers = {
    onViewHistoryEntry: viewHistoryEntry,
    onBackToHistory: openHistory
};

const countTemplateHandlers = {
    onImportTemplate: importCountTemplate,
    onViewTemplate: viewCountTemplate,
    onDeleteTemplate: removeCountTemplate,
    onBackToList: refreshCountTemplatesView
};

const locationNodeHandlers = {
    onSaveNode: savePhysicalLocation,
    onDeleteNode: removePhysicalLocation,
    onMoveNode: movePhysicalLocation
};

const itemLocationLinkHandlers = {
    onSelectItem: selectLinkItem,
    onCreateLink: createItemLocationLink,
    onToggleLink: toggleItemLocationLink,
    onDeleteLink: removeItemLocationLink,
    onMoveLink: moveItemLocationLink
};

const locationCountSessionHandlers = {
    onCancelSession: cancelLocationCountDraft,
    onDeleteSession: removeLocationCountSession
};

connectEvents({
    onStartCounting: startCounting,
    onOpenConfig: openCatalogConfig,
    onOpenHistory: openHistory,
    onOpenQuickPilot: openQuickPilot,
    onOpenWhatsappSettings: openWhatsappSettings,
    onOpenCountTemplates: openCountTemplates,
    onOpenItemUnitSettings: openItemUnitSettings,
    onOpenLocationNodes: openLocationNodes,
    onOpenCountPreparation: openCountPreparation,
    onOpenItemLocationLinks: openItemLocationLinks,
    onOpenLocationItemMap: openLocationItemMap,
    onOpenLocationCountSessions: openLocationCountSessions,
    onCloseHistory: closeHistory,
    onAddItem: addItem,
    onAddUnit: addCustomUnit,
    onAnalyzeCatalogImport: analyzeCatalogImport,
    onConfirmCatalogImport: applyCatalogImport,
    onCancelCatalogImport: cancelCatalogImport,
    onExportBackup: exportBackup,
    onAnalyzeBackupImport: analyzeBackupImport,
    onConfirmBackupImport: applyBackupImport,
    onCancelBackupImport: cancelBackupImport,
    onRestartCounting: restartCounting
});

connectCountTemplateEvents(countTemplateHandlers);
connectItemUnitSettingsEvents({
    onSelectTemplate: selectItemUnitTemplate,
    onAnalyze: analyzeItemUnits,
    onExportTemplate: exportTemplateWithUnitProfiles,
    onSaveManual: saveManualItemUnit,
    onClearManual: clearManualItemUnit
});
connectLocationNodeEvents(locationNodeHandlers);
connectCountPreparationEvents({
    onSelectTemplate: selectCountPreparationTemplate,
    onOpenTemplates: openCountTemplates
});
connectItemLocationLinkEvents({
    onSelectTemplate: selectItemLinksTemplate,
    onSelectItem: selectLinkItem,
    onCreateLink: createItemLocationLink,
    onToggleLink: toggleItemLocationLink,
    onDeleteLink: removeItemLocationLink,
    onMoveLink: moveItemLocationLink,
    onFilterLocation: filterItemLinksByLocation,
    onFilterItem: filterItemLinksByItem,
    onOpenTemplates: openCountTemplates,
    onOpenLocations: openLocationNodes
});
connectLocationItemMapEvents({
    onSelectTemplate: selectLocationItemMapTemplate,
    onOpenTemplates: openCountTemplates,
    onOpenLocations: openLocationNodes,
    onOpenLinks: openItemLocationLinks
});
connectLocationCountSessionEvents({
    onSelectTemplate: selectLocationCountSessionTemplate,
    onSelectLocation: selectLocationCountSessionLocation,
    onCreateDraft: createLocationCountDraft,
    onOpenTemplates: openCountTemplates,
    onOpenLocations: openLocationNodes,
    onOpenLinks: openItemLocationLinks
});
connectQuickPilotEvents({
    onSelectTemplate: selectQuickPilotTemplate,
    onOpenTemplates: openCountTemplates,
    onApply: applyQuickPilotSetup
});
connectWhatsappSettingsEvents({
    onSave: updateWhatsappSettings,
    onClear: removeWhatsappSettings
});
connectAreaCountingEvents({
    onOpenArea: openAreaCounting,
    onCloseArea: closeAreaCounting,
    onAddEntry: addAreaCountEntry,
    onRemoveEntry: removeAreaCountEntry
});
connectCountConsolidationEvents({
    onOpen: openCountConsolidation,
    onClose: closeCountConsolidation,
    onSelectTemplate: selectCountConsolidationTemplate,
    onSaveSnapshot: saveCurrentConsolidationSnapshot
});
connectConsolidationSnapshotsEvents({
    onOpenList: openConsolidationSnapshots,
    onClose: closeConsolidationSnapshots,
    onBackToList: refreshConsolidationSnapshotsList,
    onOpenDetail: openConsolidationSnapshotDetail,
    onDelete: deleteSavedConsolidationSnapshot,
    onExportMainCsv: () => exportSavedSnapshotCsv("main"),
    onExportPendingCsv: () => exportSavedSnapshotCsv("pending"),
    onShareMainCsv: () => shareSavedSnapshotCsv("main"),
    onSharePendingCsv: () => shareSavedSnapshotCsv("pending"),
    onOpenWhatsapp: openSavedSnapshotWhatsapp,
    onCopyMessage: copySavedSnapshotMessage,
    onFinalize: finalizeSavedConsolidationSnapshot,
    onSelectXlsxTemplate: selectSnapshotXlsxTemplate,
    onExportXlsx: exportSavedSnapshotXlsx
});

renderUnitOptions();
renderInitialSavedState();
await refreshPilotDashboard();
