import "./styles.css";
import { createCatalog } from "./catalog.js";
import { createCounting } from "./counting.js";
import { parseCatalogCsv } from "./csvImport.js";
import { buildCountReport } from "./report.js";
import {
    addCountHistoryEntry,
    clearCountingDraft,
    loadCatalog,
    loadCountingDraft,
    loadLastFinalizedCount,
    saveCatalogBackupBeforeImport,
    saveCatalog,
    saveCountingDraft
} from "./storage.js";
import {
    confirmStartWithDraft,
    connectEvents,
    hideDraftNotice,
    openConfigModal,
    renderUnitOptions,
    renderCountingView,
    renderDraftNotice,
    renderLastFinalizedNotice,
    renderCatalogImportPreview,
    resetCatalogImportPreview,
    showFinalSummary,
    showCatalogImportStatus,
    updateConfigList
} from "./ui.js";

const catalog = createCatalog(loadCatalog());
const counting = createCounting(catalog.listItems, loadCountingDraft());
let lastFinalizedCount = loadLastFinalizedCount();
let isCountingVisible = false;
let pendingCatalogImport = null;

saveCatalog(catalog.listItems());

function createId(prefix) {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function createFinalizedCount(draft, summaries, finishedAt) {
    const finishedAtIso = finishedAt.toISOString();

    return {
        id: createId("count"),
        status: "finalizada",
        startedAt: draft?.startedAt || finishedAtIso,
        finishedAt: finishedAtIso,
        items: draft?.items || summaries.map((summary) => summary.item),
        entriesByItemId: draft?.entriesByItemId || {},
        summaries: JSON.parse(JSON.stringify(summaries)),
        reportText: buildCountReport(summaries, {
            generatedAt: finishedAt,
            showZeroItems: false
        })
    };
}

function finishCounting() {
    const draft = counting.getDraft();
    const summaries = counting.finishCounting();
    const finishedAt = new Date();

    try {
        lastFinalizedCount = addCountHistoryEntry(createFinalizedCount(draft, summaries, finishedAt))[0];
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

function saveCountingState() {
    const draft = counting.getDraft();

    if (draft) {
        saveCountingDraft(draft);
    }
}

function renderCountingState() {
    hideDraftNotice();
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
    openConfigModal(catalog.listItems(), catalogHandlers);
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

const catalogHandlers = {
    getItems: catalog.listItems,
    onDeleteItem: deleteItem,
    onUpdateItem: updateItem,
    onReorderItems: reorderItems
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

connectEvents({
    onStartCounting: startCounting,
    onOpenConfig: openCatalogConfig,
    onAddItem: addItem,
    onAnalyzeCatalogImport: analyzeCatalogImport,
    onConfirmCatalogImport: applyCatalogImport,
    onCancelCatalogImport: cancelCatalogImport,
    onRestartCounting: restartCounting
});

renderUnitOptions();
renderInitialSavedState();
