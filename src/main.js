import "./styles.css";
import { createCatalog } from "./catalog.js";
import { createCounting } from "./counting.js";
import { loadCatalog, saveCatalog } from "./storage.js";
import {
    connectEvents,
    openConfigModal,
    showCurrentItem,
    showFinalSummary,
    updateConfigList
} from "./ui.js";

const catalog = createCatalog(loadCatalog());
const counting = createCounting(catalog.listItems);

function finishCounting() {
    showFinalSummary(counting.finishCounting());
}

function refreshConfigList() {
    updateConfigList(catalog.listItems(), deleteItem);
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

function deleteItem(index) {
    const items = catalog.deleteItem(index);
    saveCatalog(items);
    refreshConfigList();
}

function startCounting() {
    showCurrentItem(counting.startCounting(), finishCounting);
}

function confirmQuantity(quantity) {
    showCurrentItem(counting.confirmQuantity(quantity), finishCounting);
}

function openCatalogConfig() {
    openConfigModal(catalog.listItems(), deleteItem);
}

connectEvents({
    onStartCounting: startCounting,
    onOpenConfig: openCatalogConfig,
    onConfirmQuantity: confirmQuantity,
    onFinishCounting: finishCounting,
    onAddItem: addItem,
    onRestartCounting: counting.restartCounting
});
