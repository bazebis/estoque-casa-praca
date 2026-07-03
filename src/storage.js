import { initialCatalogItems } from "./seed.js";

const catalogStorageKey = "itensEstoque";
const countingDraftStorageKey = "countingDraft";
const countingHistoryStorageKey = "countingHistory";

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
    const storedCatalog = readJson(catalogStorageKey);

    if (!Array.isArray(storedCatalog)) {
        return [...initialCatalogItems];
    }

    return storedCatalog;
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

export function loadCountingHistory() {
    const storedHistory = readJson(countingHistoryStorageKey);

    if (!Array.isArray(storedHistory)) {
        return [];
    }

    return storedHistory.filter((entry) => entry?.status === "finalizada");
}

export function addCountHistoryEntry(entry) {
    const history = loadCountingHistory();
    const nextHistory = [entry, ...history];
    localStorage.setItem(countingHistoryStorageKey, JSON.stringify(nextHistory));
    return nextHistory;
}

export function loadLastFinalizedCount() {
    return loadCountingHistory()[0] || null;
}
