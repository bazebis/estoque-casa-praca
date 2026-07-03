import "./styles.css";
import { createCatalog } from "./catalog.js";
import { createCounting } from "./counting.js";
import { loadCatalog, saveCatalog } from "./storage.js";
import {
    connectEvents,
    openConfigModal,
    renderUnitOptions,
    showCurrentItem,
    showFinalSummary,
    updateConfigList
} from "./ui.js";

const catalog = createCatalog(loadCatalog());
const counting = createCounting(catalog.listItems);

saveCatalog(catalog.listItems());

function finishCounting() {
    showFinalSummary(counting.finishCounting());
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
    const previousItem = catalog.listItems().find((item) => item.id === itemId);
    const items = catalog.updateItem(itemId, values);
    const currentItem = items.find((item) => item.id === itemId);
    const wasUpdated = Boolean(
        previousItem &&
        currentItem &&
        (previousItem.name !== currentItem.name || previousItem.unitId !== currentItem.unitId)
    );

    if (!wasUpdated) {
        return false;
    }

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

function startCounting() {
    showCurrentItem(counting.startCounting(), finishCounting);
}

function confirmQuantity(quantity) {
    showCurrentItem(counting.confirmQuantity(quantity), finishCounting);
}

function openCatalogConfig() {
    openConfigModal(catalog.listItems(), catalogHandlers);
}

const catalogHandlers = {
    getItems: catalog.listItems,
    onDeleteItem: deleteItem,
    onUpdateItem: updateItem,
    onReorderItems: reorderItems
};

connectEvents({
    onStartCounting: startCounting,
    onOpenConfig: openCatalogConfig,
    onConfirmQuantity: confirmQuantity,
    onFinishCounting: finishCounting,
    onAddItem: addItem,
    onRestartCounting: counting.restartCounting
});

renderUnitOptions();
