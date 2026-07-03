import { initialCatalogItems } from "./seed.js";

const catalogStorageKey = "itensEstoque";
const countingDraftStorageKey = "countingDraft";

function readJson(storageKey) {
    const storedValue = localStorage.getItem(storageKey);

    if (!storedValue) {
        return null;
    }

    try {
        return JSON.parse(storedValue);
    } catch {
        return null;
    }
}

export function loadCatalog() {
    return readJson(catalogStorageKey) || [...initialCatalogItems];
}

export function saveCatalog(items) {
    localStorage.setItem(catalogStorageKey, JSON.stringify(items));
}

export function loadCountingDraft() {
    return readJson(countingDraftStorageKey);
}

export function saveCountingDraft(draft) {
    localStorage.setItem(countingDraftStorageKey, JSON.stringify(draft));
}

export function clearCountingDraft() {
    localStorage.removeItem(countingDraftStorageKey);
}
