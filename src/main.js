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
import { parseCatalogCsv } from "./csvImport.js";
import { createHistoryEntry } from "./history.js";
import {
    addCountHistoryEntry,
    clearCountingDraft,
    loadCatalog,
    loadCountingDraft,
    loadCountingHistory,
    loadLastFinalizedCount,
    loadCustomUnits,
    loadRelevantLocalStorageKeys,
    saveBackupBeforeJsonImport,
    saveCatalogBackupBeforeImport,
    saveCatalog,
    saveCountingHistory,
    saveCountingDraft,
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
    showHistoryDetail,
    showHistoryList,
    showFinalSummary,
    showBackupImportStatus,
    showCatalogImportStatus,
    showUnitsFeedback,
    updateConfigList
} from "./ui.js";

setCustomUnits(loadCustomUnits());

const catalog = createCatalog(loadCatalog());
const counting = createCounting(catalog.listItems, loadCountingDraft());
let lastFinalizedCount = loadLastFinalizedCount();
let isCountingVisible = false;
let pendingCatalogImport = null;
let pendingBackupImport = null;

saveCatalog(catalog.listItems());

function mergeCustomUnitLists(currentUnits, importedUnits) {
    const unitById = new Map();

    [...currentUnits, ...importedUnits].forEach((unit) => {
        unitById.set(unit.id, unit);
    });

    return [...unitById.values()];
}

function saveCustomUnitState(units) {
    const savedUnits = saveCustomUnits(units);
    setCustomUnits(savedUnits);
    return savedUnits;
}

function refreshUnitsView() {
    renderUnitOptions();
    renderUnitsList(getAllUnits(), unitHandlers);
    refreshConfigList();
}

function finishCounting() {
    const draft = counting.getDraft();
    const summaries = counting.finishCounting();
    const finishedAt = new Date();

    try {
        lastFinalizedCount = addCountHistoryEntry(createHistoryEntry(draft, summaries, finishedAt))[0];
    } catch {
        alert("Não foi possível salvar a contagem finalizada. O rascunho foi mantido.");
        return;
    }

    counting.clearSession();
    clearCountingDraft();
    isCountingVisible = false;
    showFinalSummary(summaries, finishedAt);
}

function refreshConfigList() {
    updateConfigList(catalog.listItems(), catalogHandlers);
}

function addItem(item) {
    const previousLength = catalog.listItems().length;
    const items = catalog.addItem(item);
    const wasAdded = items.length > previousLength;

    if (!wasAdded) {
        return false;
    }

    saveCatalog(items);
    refreshConfigList();
    return true;
}

function updateItem(itemId, values) {
    if (!values.name.trim() || !values.unitId) {
        return false;
    }

    const items = catalog.updateItem(itemId, values);
    saveCatalog(items);
    refreshConfigList();
    return true;
}

function deleteItem(itemId) {
    const item = catalog.listItems().find((catalogItem) => catalogItem.id === itemId);

    if (!item || !window.confirm(`Excluir ${item.name}?`)) {
        return;
    }

    saveCatalog(catalog.deleteItem(itemId));
    refreshConfigList();
}

function reorderItems(orderedIds) {
    saveCatalog(catalog.reorderItems(orderedIds));
    refreshConfigList();
}

function addCustomUnit(values) {
    const result = createCustomUnit(values);

    if (result.error) {
        showUnitsFeedback(result.error);
        return false;
    }

    saveCustomUnitState([...getCustomUnits(), result.unit]);
    refreshUnitsView();
    showUnitsFeedback("Unidade adicionada.");
    return true;
}

function updateCustomUnit(unitId, values) {
    const result = updateCustomUnitList(getCustomUnits(), unitId, values);

    if (result.error) {
        showUnitsFeedback(result.error);
        return false;
    }

    saveCustomUnitState(result.units);
    refreshUnitsView();
    showUnitsFeedback("Unidade atualizada.");
    return true;
}

function toggleCustomUnit(unitId, shouldActivate) {
    updateCustomUnit(unitId, {
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

function applyCatalogImport(mode) {
    if (!pendingCatalogImport?.items?.length) {
        showCatalogImportStatus("Analise um CSV válido antes de importar.");
        return;
    }

    if (mode === "replace" && !confirmReplaceImport()) {
        return;
    }

    if (mode === "replace") {
        saveCatalogBackupBeforeImport(catalog.listItems());
        saveCatalog(catalog.replaceWithImportedItems(pendingCatalogImport.items));
    } else if (mode === "upsert") {
        saveCatalog(catalog.upsertImportedItems(pendingCatalogImport.items));
    } else {
        saveCatalog(catalog.appendImportedItems(pendingCatalogImport.items));
    }

    pendingCatalogImport = null;
    refreshConfigList();
    resetCatalogImportPreview();
    showCatalogImportStatus("Catálogo importado com sucesso.");
}

function cancelCatalogImport() {
    pendingCatalogImport = null;
}

function createCurrentBackupPayload() {
    return buildBackupPayload({
        catalogItems: catalog.listItems(),
        countingHistory: loadCountingHistory(),
        lastFinalizedCount: loadLastFinalizedCount(),
        customUnits: getCustomUnits(),
        localStorageKeys: loadRelevantLocalStorageKeys()
    });
}

function exportBackup() {
    downloadBackup(createCurrentBackupPayload());
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

function applyBackupImport(mode) {
    if (!pendingBackupImport) {
        showBackupImportStatus("Analise um backup válido antes de importar.");
        return;
    }

    if (!confirmActiveDraftRisk(mode) || !confirmBackupImportMode(mode)) {
        return;
    }

    saveBackupBeforeJsonImport(createCurrentBackupPayload());

    if (mode === "replace-all") {
        saveCustomUnitState(pendingBackupImport.customUnits);
        saveCatalog(catalog.replaceItems(pendingBackupImport.catalogItems));
        saveCountingHistory(pendingBackupImport.countingHistory);
    } else if (mode === "replace-catalog") {
        saveCustomUnitState(mergeCustomUnitLists(getCustomUnits(), pendingBackupImport.customUnits));
        saveCatalog(catalog.replaceItems(pendingBackupImport.catalogItems));
    } else {
        saveCustomUnitState(mergeCustomUnitLists(getCustomUnits(), pendingBackupImport.customUnits));
        saveCountingHistory(mergeCountingHistory(loadCountingHistory(), pendingBackupImport.countingHistory));
    }

    lastFinalizedCount = loadLastFinalizedCount();
    pendingBackupImport = null;
    refreshUnitsView();
    resetBackupImportPreview();
    showBackupImportStatus("Backup importado com sucesso.");
}

function cancelBackupImport() {
    pendingBackupImport = null;
}

function saveCountingState() {
    const draft = counting.getDraft();

    if (draft) {
        saveCountingDraft(draft);
    }
}

function renderCountingState() {
    hideDraftNotice();
    hideHistoryView();
    isCountingVisible = true;
    renderCountingView(counting.getViewModel(), countingHandlers);
}

function startCounting() {
    if (counting.hasSession()) {
        confirmStartWithDraft(draftConflictHandlers);
        return;
    }

    startNewCounting();
}

function startNewCounting() {
    counting.startCounting();
    saveCountingState();
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

function continueDraft() {
    if (!counting.hasSession()) {
        return;
    }

    saveCountingState();
    renderCountingState();
}

function discardDraft() {
    const shouldDiscard = window.confirm("Descartar a contagem em andamento? O catálogo será mantido.");

    if (!shouldDiscard) {
        return;
    }

    counting.clearSession();
    clearCountingDraft();
    isCountingVisible = false;
    hideDraftNotice();
}

function discardDraftAndStartNew() {
    const shouldDiscard = window.confirm(
        "Descartar a contagem em andamento e iniciar uma nova? As entradas salvas serão apagadas."
    );

    if (!shouldDiscard) {
        return;
    }

    counting.clearSession();
    clearCountingDraft();
    startNewCounting();
}

function cancelDraftConflict() {
    if (isCountingVisible) {
        hideDraftNotice();
        return;
    }

    renderDraftNotice(counting.getDraft(), draftNoticeHandlers);
}

function addCountingEntry(quantity, unitId) {
    const wasAdded = counting.addEntry(quantity, unitId);

    if (!wasAdded) {
        return false;
    }

    saveCountingState();
    renderCountingState();
    return true;
}

function removeCountingEntry(entryId) {
    counting.removeEntry(entryId);
    saveCountingState();
    renderCountingState();
}

function goToPreviousCountingItem() {
    counting.goToPreviousItem();
    saveCountingState();
    renderCountingState();
}

function goToNextCountingItem() {
    counting.goToNextItem();
    saveCountingState();
    renderCountingState();
}

function openCatalogConfig() {
    openConfigModal(catalog.listItems(), catalogHandlers, unitHandlers);
}

function restartCounting() {
    const shouldRestart = window.confirm(
        "Iniciar nova contagem? O relatório finalizado continuará salvo, mas a tela atual será fechada."
    );

    if (!shouldRestart) {
        return;
    }

    counting.clearSession();
    clearCountingDraft();
    startNewCounting();
}

function viewLastFinalizedCount() {
    if (!lastFinalizedCount) {
        return;
    }

    showFinalSummary(lastFinalizedCount.summaries || [], lastFinalizedCount.finishedAt);
}

function openHistory() {
    showHistoryList(loadCountingHistory(), historyHandlers);
}

function closeHistory() {
    hideHistoryView();

    if (isCountingVisible) {
        renderCountingState();
        return;
    }

    renderInitialSavedState();
}

function viewHistoryEntry(entryId) {
    const entry = loadCountingHistory().find((historyEntry) => historyEntry.id === entryId);

    if (!entry) {
        openHistory();
        return;
    }

    showHistoryDetail(entry, historyHandlers);
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

connectEvents({
    onStartCounting: startCounting,
    onOpenConfig: openCatalogConfig,
    onOpenHistory: openHistory,
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

renderUnitOptions();
renderInitialSavedState();
