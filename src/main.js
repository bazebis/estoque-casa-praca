import "./styles.css";
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
import {
    connectLocationNodeEvents,
    renderLocationNodes,
    showLocationNodesFeedback
} from "./locationNodesUi.js";
import { registerPwa } from "./pwa.js";
import {
    addCountHistoryEntry,
    clearCountingDraft,
    deleteCountTemplate,
    deleteLocationNode,
    getCountTemplate,
    getStorageStatus,
    initializeStorage,
    loadCatalog,
    loadCountingDraft,
    loadCountingHistory,
    loadLastFinalizedCount,
    loadCustomUnits,
    loadRelevantLocalStorageKeys,
    listCountTemplates,
    listLocationNodes,
    saveBackupBeforeJsonImport,
    saveCatalogBackupBeforeImport,
    saveCatalog,
    saveCountingHistory,
    saveCountingDraft,
    saveCountTemplate,
    saveLocationNode,
    saveCustomUnits
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
    showLocationNodesAdminSection,
    showUnitsFeedback,
    updateConfigList
} from "./ui.js";

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

async function openPilotCountTemplates() {
    openConfigModal(catalog.listItems(), catalogHandlers, unitHandlers, "templates");
    await openCountTemplates();
}

async function openPilotLocationNodes() {
    openConfigModal(catalog.listItems(), catalogHandlers, unitHandlers, "locations");
    await openLocationNodes();
}

async function openPilotCountPreparation() {
    openConfigModal(catalog.listItems(), catalogHandlers, unitHandlers, "preparation");
    await openCountPreparation();
}

function openPilotAbout() {
    openConfigModal(catalog.listItems(), catalogHandlers, unitHandlers, "about");
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
        await saveCountTemplate({
            ...validation.template,
            importedAt: new Date().toISOString(),
            importFileName
        });
        await refreshCountTemplatesView();
        showCountTemplateFeedback("Template importado e salvo neste dispositivo.", "success");
        return true;
    } catch {
        showCountTemplateFeedback("Não foi possível salvar o template neste dispositivo.", "error");
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

connectEvents({
    onStartCounting: startCounting,
    onOpenConfig: openCatalogConfig,
    onOpenPilotCountTemplates: openPilotCountTemplates,
    onOpenPilotLocationNodes: openPilotLocationNodes,
    onOpenPilotCountPreparation: openPilotCountPreparation,
    onOpenPilotAbout: openPilotAbout,
    onOpenHistory: openHistory,
    onOpenCountTemplates: openCountTemplates,
    onOpenLocationNodes: openLocationNodes,
    onOpenCountPreparation: openCountPreparation,
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
connectLocationNodeEvents(locationNodeHandlers);
connectCountPreparationEvents({
    onSelectTemplate: selectCountPreparationTemplate,
    onOpenTemplates: openCountTemplates
});

renderUnitOptions();
renderInitialSavedState();
