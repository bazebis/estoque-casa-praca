import "./styles.css";
import { createCatalog } from "./catalog.js";
import { createCounting } from "./counting.js";
import {
    clearCountingDraft,
    loadCatalog,
    loadCountingDraft,
    saveCatalog,
    saveCountingDraft
} from "./storage.js";
import {
    connectEvents,
    openConfigModal,
    renderUnitOptions,
    renderCountingView,
    showFinalSummary,
    updateConfigList
} from "./ui.js";

const catalog = createCatalog(loadCatalog());
const counting = createCounting(catalog.listItems, loadCountingDraft());

saveCatalog(catalog.listItems());

function finishCounting() {
    const summaries = counting.finishCounting();
    counting.clearSession();
    clearCountingDraft();
    showFinalSummary(summaries);
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

function saveCountingState() {
    const draft = counting.getDraft();

    if (draft) {
        saveCountingDraft(draft);
    }
}

function renderCountingState() {
    renderCountingView(counting.getViewModel(), countingHandlers);
}

function startCounting() {
    counting.startCounting();
    saveCountingState();
    renderCountingState();
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
    counting.clearSession();
    clearCountingDraft();
    location.reload();
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

connectEvents({
    onStartCounting: startCounting,
    onOpenConfig: openCatalogConfig,
    onAddItem: addItem,
    onRestartCounting: restartCounting
});

renderUnitOptions();

if (counting.hasSession()) {
    renderCountingState();
}
