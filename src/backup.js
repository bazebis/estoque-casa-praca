import { normalizeHistoryEntry } from "./history.js";

const appName = "estoque-casa-praca";
const schemaVersion = 1;
const appVersion = 1;

function formatDatePart(value) {
    return String(value).padStart(2, "0");
}

function createBackupFileName(date = new Date()) {
    const year = date.getFullYear();
    const month = formatDatePart(date.getMonth() + 1);
    const day = formatDatePart(date.getDate());
    const hour = formatDatePart(date.getHours());
    const minute = formatDatePart(date.getMinutes());

    return `estoque-casa-praca-backup-${year}-${month}-${day}-${hour}-${minute}.json`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeCatalogItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map((item, index) => ({
            id: item.id || `backup_item_${index}`,
            name: String(item.name || item.nome || "").trim(),
            unitId: item.unitId || item.unidade || "un",
            active: item.active !== false,
            order: Number.isInteger(item.order) ? item.order : index
        }))
        .filter((item) => item.name)
        .map((item, index) => ({ ...item, order: index }));
}

function getBackupCatalog(payload) {
    return payload.catalog?.items || payload.items || payload.catalog || [];
}

function getBackupHistory(payload) {
    return payload.countingHistory || payload.finalizedCounts || [];
}

export function buildBackupPayload(data) {
    return {
        appName,
        appVersion,
        schemaVersion,
        exportedAt: new Date().toISOString(),
        catalog: {
            items: clone(data.catalogItems || [])
        },
        countingHistory: clone(data.countingHistory || []),
        finalizedCounts: clone(data.countingHistory || []),
        lastFinalizedCount: data.lastFinalizedCount ? clone(data.lastFinalizedCount) : null,
        countingDraft: null,
        includesActiveDraft: false,
        customUnits: data.customUnits || null,
        localStorageKeys: clone(data.localStorageKeys || {})
    };
}

export function downloadBackup(payload) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = createBackupFileName(new Date(payload.exportedAt || Date.now()));
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function parseBackupText(text) {
    try {
        return {
            payload: JSON.parse(text),
            error: ""
        };
    } catch {
        return {
            payload: null,
            error: "Arquivo JSON malformado."
        };
    }
}

export function normalizeBackupPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return null;
    }

    const catalogItems = normalizeCatalogItems(getBackupCatalog(payload));
    const countingHistory = getBackupHistory(payload)
        .map(normalizeHistoryEntry)
        .filter(Boolean);

    return {
        appName: payload.appName,
        appVersion: payload.appVersion || null,
        schemaVersion: payload.schemaVersion || null,
        exportedAt: payload.exportedAt || "",
        catalogItems,
        countingHistory,
        lastFinalizedCount: normalizeHistoryEntry(payload.lastFinalizedCount) || countingHistory[0] || null,
        countingDraft: payload.countingDraft || null,
        includesActiveDraft: Boolean(payload.countingDraft || payload.includesActiveDraft),
        customUnits: payload.customUnits || null,
        localStorageKeys: payload.localStorageKeys || {}
    };
}

export function validateBackupPayload(payload) {
    const normalizedPayload = normalizeBackupPayload(payload);

    if (!normalizedPayload) {
        return { isValid: false, error: "Arquivo inválido." };
    }

    if (normalizedPayload.appName !== appName) {
        return { isValid: false, error: "Este JSON não parece ser um backup da Casa da Praça." };
    }

    if (!normalizedPayload.schemaVersion) {
        return { isValid: false, error: "Backup sem versão de schema." };
    }

    if (!Array.isArray(normalizedPayload.catalogItems) || !Array.isArray(normalizedPayload.countingHistory)) {
        return { isValid: false, error: "Backup sem estrutura mínima de catálogo e histórico." };
    }

    return { isValid: true, error: "" };
}

export function previewBackupPayload(payload) {
    const normalizedPayload = normalizeBackupPayload(payload);
    const validation = validateBackupPayload(payload);

    if (!validation.isValid) {
        return {
            isValid: false,
            error: validation.error
        };
    }

    return {
        isValid: true,
        error: "",
        exportedAt: normalizedPayload.exportedAt,
        schemaVersion: normalizedPayload.schemaVersion,
        catalogCount: normalizedPayload.catalogItems.length,
        historyCount: normalizedPayload.countingHistory.length,
        hasDraft: normalizedPayload.includesActiveDraft
    };
}

export function mergeCountingHistory(currentHistory, importedHistory) {
    const historyById = new Map();

    [...currentHistory, ...importedHistory]
        .map(normalizeHistoryEntry)
        .filter(Boolean)
        .forEach((entry) => {
            historyById.set(entry.id, entry);
        });

    return [...historyById.values()]
        .sort((firstEntry, secondEntry) => new Date(secondEntry.finishedAt) - new Date(firstEntry.finishedAt));
}
