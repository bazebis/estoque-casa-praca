import { initialCatalogItems } from "./seed.js";
import { normalizeHistoryEntry } from "./history.js";
import { normalizeCustomUnits } from "./units.js";

const catalogStorageKey = "itensEstoque";
const countingDraftStorageKey = "countingDraft";
const countingHistoryStorageKey = "countingHistory";
const catalogBackupBeforeImportStorageKey = "catalogBackupBeforeImport";
const backupBeforeJsonImportStorageKey = "backupBeforeJsonImport";
const customUnitsStorageKey = "customUnits";

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

export function saveCatalogBackupBeforeImport(items) {
    const backup = {
        createdAt: new Date().toISOString(),
        items
    };

    localStorage.setItem(catalogBackupBeforeImportStorageKey, JSON.stringify(backup));
}

export function loadRelevantLocalStorageKeys() {
    return {
        catalogBackupBeforeImport: readJson(catalogBackupBeforeImportStorageKey),
        backupBeforeJsonImport: readJson(backupBeforeJsonImportStorageKey)
    };
}

export function loadCustomUnits() {
    return normalizeCustomUnits(readJson(customUnitsStorageKey));
}

export function saveCustomUnits(units) {
    const normalizedUnits = normalizeCustomUnits(units);

    localStorage.setItem(customUnitsStorageKey, JSON.stringify(normalizedUnits));
    return normalizedUnits;
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

    return storedHistory
        .map(normalizeHistoryEntry)
        .filter(Boolean)
        .sort((firstEntry, secondEntry) => new Date(secondEntry.finishedAt) - new Date(firstEntry.finishedAt));
}

export function saveCountingHistory(history) {
    const normalizedHistory = Array.isArray(history)
        ? history.map(normalizeHistoryEntry).filter(Boolean)
        : [];
    const sortedHistory = normalizedHistory
        .sort((firstEntry, secondEntry) => new Date(secondEntry.finishedAt) - new Date(firstEntry.finishedAt));

    localStorage.setItem(countingHistoryStorageKey, JSON.stringify(sortedHistory));
    return sortedHistory;
}

export function addCountHistoryEntry(entry) {
    const history = loadCountingHistory();
    const nextHistoryById = new Map(history.map((historyEntry) => [historyEntry.id, historyEntry]));
    const normalizedEntry = normalizeHistoryEntry(entry);

    if (!normalizedEntry) {
        return history;
    }

    nextHistoryById.set(normalizedEntry.id, normalizedEntry);

    return saveCountingHistory([...nextHistoryById.values()]);
}

export function loadLastFinalizedCount() {
    return loadCountingHistory()[0] || null;
}

export function saveBackupBeforeJsonImport(state) {
    const backup = {
        createdAt: new Date().toISOString(),
        state
    };

    localStorage.setItem(backupBeforeJsonImportStorageKey, JSON.stringify(backup));
}
