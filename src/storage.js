import { initialCatalogItems } from "./seed.js";
import { normalizeHistoryEntry } from "./history.js";
import { normalizeCountTemplate } from "./countTemplates.js";
import {
    findTemplateItem,
    normalizeItemLocationLinks,
    validateItemLocationLink
} from "./itemLocationLinks.js";
import {
    inferUnitForTemplateItem,
    normalizeItemUnitSettings,
    validateItemUnitSetting
} from "./itemUnitSettings.js";
import {
    getLocationPath,
    normalizeLocationNodes,
    validateLocationNode
} from "./locationNodes.js";
import {
    buildPlannedItemsForLocation,
    createLocationCountSessionDraftModel,
    normalizeLocationCountSessions,
    validateLocationCountSession
} from "./locationCountSessions.js";
import {
    createLocationCountEntryModel,
    normalizeLocationCountEntries,
    validateLocationCountEntry
} from "./locationCountEntries.js";
import { normalizeWhatsappSettings, validateWhatsappSettings } from "./whatsappSettings.js";
import {
    normalizeConsolidationSnapshots,
    validateConsolidationSnapshot
} from "./consolidationSnapshots.js";
import { normalizeCustomUnits } from "./units.js";
import {
    bulkPut,
    deleteFromStore,
    getAllFromStore,
    getFromStore,
    isIndexedDBAvailable,
    openDatabase,
    putInStore,
    replaceStore,
    storeNames
} from "./db.js";

const catalogStorageKey = "itensEstoque";
const countingDraftStorageKey = "countingDraft";
const countingHistoryStorageKey = "countingHistory";
const catalogBackupBeforeImportStorageKey = "catalogBackupBeforeImport";
const backupBeforeJsonImportStorageKey = "backupBeforeJsonImport";
const customUnitsStorageKey = "customUnits";
const countTemplatesStorageKey = "countTemplates";
const locationNodesStorageKey = "locationNodes";
const itemLocationLinksStorageKey = "itemLocationLinks";
const locationCountSessionsStorageKey = "locationCountSessions";
const locationCountEntriesStorageKey = "locationCountEntries";
const whatsappSettingsStorageKey = "whatsappSettings";
const itemUnitSettingsStorageKey = "itemUnitSettings";
const consolidationSnapshotsStorageKey = "consolidationSnapshots";
const migrationFlagKey = "localStorageMigrationCompleted";
const countTemplatesMigrationFlagKey = "countTemplatesLocalStorageMigrationCompleted";
const locationNodesMigrationFlagKey = "locationNodesLocalStorageMigrationCompleted";
const itemLocationLinksMigrationFlagKey = "itemLocationLinksLocalStorageMigrationCompleted";
const locationCountSessionsMigrationFlagKey = "locationCountSessionsLocalStorageMigrationCompleted";
const locationCountEntriesMigrationFlagKey = "locationCountEntriesLocalStorageMigrationCompleted";
const catalogInitializedKey = "catalogInitialized";
const currentDraftKey = "current";

let isStorageInitialized = false;
let shouldUseIndexedDB = false;
let storageWarning = "";

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

function writeJson(storageKey, value) {
    localStorage.setItem(storageKey, JSON.stringify(value));
}

function sortHistory(history) {
    return history
        .map(normalizeHistoryEntry)
        .filter(Boolean)
        .sort((firstEntry, secondEntry) => new Date(secondEntry.finishedAt) - new Date(firstEntry.finishedAt));
}

function createLegacyItemId(item, index) {
    const name = String(item?.name || item?.nome || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-");

    return `legacy_${name}_${index}_${Date.now()}`;
}

function normalizeCatalogRecords(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map((item, index) => ({
            ...item,
            id: item.id || createLegacyItemId(item, index)
        }))
        .filter((item) => item.id);
}

function loadLocalCatalog() {
    const storedCatalog = readJson(catalogStorageKey);

    if (!Array.isArray(storedCatalog)) {
        return [...initialCatalogItems];
    }

    return storedCatalog;
}

function saveLocalCatalog(items) {
    writeJson(catalogStorageKey, items);
}

function loadLocalCustomUnits() {
    return normalizeCustomUnits(readJson(customUnitsStorageKey));
}

function saveLocalCustomUnits(units) {
    const normalizedUnits = normalizeCustomUnits(units);

    writeJson(customUnitsStorageKey, normalizedUnits);
    return normalizedUnits;
}

function loadLocalCountingDraft() {
    return readJson(countingDraftStorageKey);
}

function saveLocalCountingDraft(draft) {
    writeJson(countingDraftStorageKey, draft);
}

function clearLocalCountingDraft() {
    localStorage.removeItem(countingDraftStorageKey);
}

function loadLocalCountingHistory() {
    const storedHistory = readJson(countingHistoryStorageKey);

    return Array.isArray(storedHistory) ? sortHistory(storedHistory) : [];
}

function saveLocalCountingHistory(history) {
    const sortedHistory = sortHistory(Array.isArray(history) ? history : []);

    writeJson(countingHistoryStorageKey, sortedHistory);
    return sortedHistory;
}

function sortCountTemplates(templates) {
    return templates
        .map(normalizeCountTemplate)
        .filter(Boolean)
        .sort((firstTemplate, secondTemplate) => {
            const dateDifference = new Date(secondTemplate.importedAt) - new Date(firstTemplate.importedAt);

            return Number.isNaN(dateDifference)
                ? firstTemplate.name.localeCompare(secondTemplate.name, "pt-BR")
                : dateDifference;
        });
}

function loadLocalCountTemplates() {
    const templates = readJson(countTemplatesStorageKey);

    return sortCountTemplates(Array.isArray(templates) ? templates : []);
}

function saveLocalCountTemplate(template) {
    const templates = loadLocalCountTemplates().filter((item) => item.id !== template.id);
    const nextTemplates = sortCountTemplates([...templates, template]);

    writeJson(countTemplatesStorageKey, nextTemplates);
    return template;
}

function deleteLocalCountTemplate(templateId) {
    const templates = loadLocalCountTemplates().filter((template) => template.id !== templateId);

    writeJson(countTemplatesStorageKey, templates);
}

function sortLocationNodes(nodes) {
    return normalizeLocationNodes(nodes).sort((firstNode, secondNode) => {
        const parentComparison = String(firstNode.parentId).localeCompare(String(secondNode.parentId), "pt-BR");
        const orderComparison = firstNode.order - secondNode.order;

        return parentComparison || orderComparison || firstNode.name.localeCompare(secondNode.name, "pt-BR");
    });
}

function loadLocalLocationNodes() {
    const nodes = readJson(locationNodesStorageKey);
    return sortLocationNodes(Array.isArray(nodes) ? nodes : []);
}

function saveLocalLocationNode(node) {
    const nodes = loadLocalLocationNodes().filter((item) => item.id !== node.id);

    writeJson(locationNodesStorageKey, sortLocationNodes([...nodes, node]));
    return node;
}

function deleteLocalLocationNode(locationId) {
    const nodes = loadLocalLocationNodes().filter((node) => node.id !== locationId);
    writeJson(locationNodesStorageKey, nodes);
}

function sortItemLocationLinks(links) {
    return normalizeItemLocationLinks(links).sort((firstLink, secondLink) => {
        const templateComparison = firstLink.templateId.localeCompare(secondLink.templateId, "pt-BR");
        const locationComparison = firstLink.locationId.localeCompare(secondLink.locationId, "pt-BR");
        const orderComparison = firstLink.order - secondLink.order;

        return templateComparison
            || locationComparison
            || orderComparison
            || firstLink.itemNameSnapshot.localeCompare(secondLink.itemNameSnapshot, "pt-BR");
    });
}

function loadLocalItemLocationLinks() {
    const links = readJson(itemLocationLinksStorageKey);
    return sortItemLocationLinks(Array.isArray(links) ? links : []);
}

function saveLocalItemLocationLink(link) {
    const links = loadLocalItemLocationLinks().filter((item) => item.id !== link.id);

    writeJson(itemLocationLinksStorageKey, sortItemLocationLinks([...links, link]));
    return link;
}

function deleteLocalItemLocationLink(linkId) {
    const links = loadLocalItemLocationLinks().filter((link) => link.id !== linkId);
    writeJson(itemLocationLinksStorageKey, links);
}

function saveLocalItemLocationLinksBatch(links) {
    const linkById = new Map(loadLocalItemLocationLinks().map((link) => [link.id, link]));

    links.forEach((link) => linkById.set(link.id, link));
    writeJson(itemLocationLinksStorageKey, sortItemLocationLinks([...linkById.values()]));
    return links;
}

function loadLocalWhatsappSettings() {
    return normalizeWhatsappSettings(readJson(whatsappSettingsStorageKey));
}

function saveLocalWhatsappSettings(settings) {
    writeJson(whatsappSettingsStorageKey, settings);
    return settings;
}

function clearLocalWhatsappSettings() {
    localStorage.removeItem(whatsappSettingsStorageKey);
}

function sortItemUnitSettings(settings) {
    return normalizeItemUnitSettings(settings).sort((firstSetting, secondSetting) => (
        firstSetting.templateId.localeCompare(secondSetting.templateId, "pt-BR")
        || firstSetting.groupNameSnapshot.localeCompare(secondSetting.groupNameSnapshot, "pt-BR")
        || firstSetting.itemNameSnapshot.localeCompare(secondSetting.itemNameSnapshot, "pt-BR")
    ));
}

function loadLocalItemUnitSettings() {
    return sortItemUnitSettings(readJson(itemUnitSettingsStorageKey) || []);
}

function saveLocalItemUnitSettings(settings) {
    const normalizedSettings = sortItemUnitSettings(settings);
    writeJson(itemUnitSettingsStorageKey, normalizedSettings);
    return normalizedSettings;
}

function sortConsolidationSnapshots(snapshots) {
    return normalizeConsolidationSnapshots(snapshots).sort((firstSnapshot, secondSnapshot) => (
        new Date(secondSnapshot.createdAt) - new Date(firstSnapshot.createdAt)
        || firstSnapshot.id.localeCompare(secondSnapshot.id, "pt-BR")
    ));
}

function loadLocalConsolidationSnapshots() {
    return sortConsolidationSnapshots(readJson(consolidationSnapshotsStorageKey) || []);
}

function saveLocalConsolidationSnapshots(snapshots) {
    const normalizedSnapshots = sortConsolidationSnapshots(snapshots);
    writeJson(consolidationSnapshotsStorageKey, normalizedSnapshots);
    return normalizedSnapshots;
}

function sortLocationCountSessions(sessions) {
    return normalizeLocationCountSessions(sessions).sort((firstSession, secondSession) => (
        new Date(secondSession.createdAt) - new Date(firstSession.createdAt)
        || firstSession.id.localeCompare(secondSession.id, "pt-BR")
    ));
}

function loadLocalLocationCountSessions() {
    const sessions = readJson(locationCountSessionsStorageKey);
    return sortLocationCountSessions(Array.isArray(sessions) ? sessions : []);
}

function saveLocalLocationCountSession(session) {
    const sessions = loadLocalLocationCountSessions().filter((item) => item.id !== session.id);

    writeJson(locationCountSessionsStorageKey, sortLocationCountSessions([...sessions, session]));
    return session;
}

function deleteLocalLocationCountSession(sessionId) {
    const sessions = loadLocalLocationCountSessions().filter((session) => session.id !== sessionId);
    writeJson(locationCountSessionsStorageKey, sessions);
}

function sortLocationCountEntries(entries) {
    return normalizeLocationCountEntries(entries).sort((firstEntry, secondEntry) => (
        new Date(firstEntry.createdAt) - new Date(secondEntry.createdAt)
        || firstEntry.id.localeCompare(secondEntry.id, "pt-BR")
    ));
}

function loadLocalLocationCountEntries() {
    const entries = readJson(locationCountEntriesStorageKey);
    return sortLocationCountEntries(Array.isArray(entries) ? entries : []);
}

function saveLocalLocationCountEntry(entry) {
    const entries = loadLocalLocationCountEntries().filter((item) => item.id !== entry.id);
    writeJson(locationCountEntriesStorageKey, sortLocationCountEntries([...entries, entry]));
    return entry;
}

function saveLocalCatalogBackupBeforeImport(items) {
    const backup = {
        createdAt: new Date().toISOString(),
        items
    };

    writeJson(catalogBackupBeforeImportStorageKey, backup);
}

function saveLocalBackupBeforeJsonImport(state) {
    const backup = {
        createdAt: new Date().toISOString(),
        state
    };

    writeJson(backupBeforeJsonImportStorageKey, backup);
}

function loadLocalRelevantStorageKeys() {
    return {
        catalogBackupBeforeImport: readJson(catalogBackupBeforeImportStorageKey),
        backupBeforeJsonImport: readJson(backupBeforeJsonImportStorageKey)
    };
}

function createBackupRecord(key, value) {
    return value ? { ...value, key } : null;
}

async function saveBackupRecord(key, value) {
    const backup = createBackupRecord(key, value);

    if (backup) {
        await putInStore(storeNames.backups, backup, key);
    }
}

async function migrateLocalStorageToIndexedDB() {
    const migrationState = await getFromStore(storeNames.appState, migrationFlagKey);

    if (migrationState?.value === true) {
        return false;
    }

    const localCatalog = readJson(catalogStorageKey);
    const localCustomUnits = loadLocalCustomUnits();
    const localDraft = loadLocalCountingDraft();
    const localHistory = loadLocalCountingHistory();
    const lastFinalizedCount = normalizeHistoryEntry(readJson("lastFinalizedCount"));

    if (Array.isArray(localCatalog)) {
        await replaceStore(storeNames.catalog, normalizeCatalogRecords(localCatalog));
        await putInStore(storeNames.appState, { key: catalogInitializedKey, value: true });
    }

    if (localCustomUnits.length > 0) {
        await replaceStore(storeNames.customUnits, localCustomUnits);
    }

    if (localDraft) {
        await putInStore(storeNames.countingDraft, { value: localDraft }, currentDraftKey);
    }

    if (localHistory.length > 0 || lastFinalizedCount) {
        const historyById = new Map(localHistory.map((entry) => [entry.id, entry]));

        if (lastFinalizedCount) {
            historyById.set(lastFinalizedCount.id, lastFinalizedCount);
        }

        await bulkPut(storeNames.countingHistory, [...historyById.values()]);
    }

    await saveBackupRecord(catalogBackupBeforeImportStorageKey, readJson(catalogBackupBeforeImportStorageKey));
    await saveBackupRecord(backupBeforeJsonImportStorageKey, readJson(backupBeforeJsonImportStorageKey));
    await putInStore(storeNames.appState, {
        key: migrationFlagKey,
        value: true,
        completedAt: new Date().toISOString()
    });

    return true;
}

async function migrateCountTemplatesToIndexedDB() {
    const migrationState = await getFromStore(storeNames.appState, countTemplatesMigrationFlagKey);

    if (migrationState?.value === true) {
        return false;
    }

    const localTemplates = loadLocalCountTemplates();

    if (localTemplates.length > 0) {
        await bulkPut(storeNames.countTemplates, localTemplates);
    }

    await putInStore(storeNames.appState, {
        key: countTemplatesMigrationFlagKey,
        value: true,
        completedAt: new Date().toISOString()
    });

    return localTemplates.length > 0;
}

async function migrateLocationNodesToIndexedDB() {
    const migrationState = await getFromStore(storeNames.appState, locationNodesMigrationFlagKey);

    if (migrationState?.value === true) {
        return false;
    }

    const localNodes = loadLocalLocationNodes();

    if (localNodes.length > 0) {
        await bulkPut(storeNames.locationNodes, localNodes);
    }

    await putInStore(storeNames.appState, {
        key: locationNodesMigrationFlagKey,
        value: true,
        completedAt: new Date().toISOString()
    });

    return localNodes.length > 0;
}

async function migrateItemLocationLinksToIndexedDB() {
    const migrationState = await getFromStore(storeNames.appState, itemLocationLinksMigrationFlagKey);

    if (migrationState?.value === true) {
        return false;
    }

    const localLinks = loadLocalItemLocationLinks();

    if (localLinks.length > 0) {
        await bulkPut(storeNames.itemLocationLinks, localLinks);
    }

    await putInStore(storeNames.appState, {
        key: itemLocationLinksMigrationFlagKey,
        value: true,
        completedAt: new Date().toISOString()
    });

    return localLinks.length > 0;
}

async function migrateLocationCountSessionsToIndexedDB() {
    const migrationState = await getFromStore(storeNames.appState, locationCountSessionsMigrationFlagKey);

    if (migrationState?.value === true) {
        return false;
    }

    const localSessions = loadLocalLocationCountSessions();

    if (localSessions.length > 0) {
        await bulkPut(storeNames.locationCountSessions, localSessions);
    }

    await putInStore(storeNames.appState, {
        key: locationCountSessionsMigrationFlagKey,
        value: true,
        completedAt: new Date().toISOString()
    });

    return localSessions.length > 0;
}

async function migrateLocationCountEntriesToIndexedDB() {
    const migrationState = await getFromStore(storeNames.appState, locationCountEntriesMigrationFlagKey);
    if (migrationState?.value === true) return false;
    const localEntries = loadLocalLocationCountEntries();

    if (localEntries.length > 0) await bulkPut(storeNames.locationCountEntries, localEntries);
    await putInStore(storeNames.appState, {
        key: locationCountEntriesMigrationFlagKey,
        value: true,
        completedAt: new Date().toISOString()
    });
    return localEntries.length > 0;
}

async function runWithFallback(dbOperation, fallbackOperation) {
    if (!shouldUseIndexedDB) {
        return fallbackOperation();
    }

    try {
        return await dbOperation();
    } catch (error) {
        shouldUseIndexedDB = false;
        storageWarning = "IndexedDB falhou. Usando LocalStorage como fallback.";
        console.warn(storageWarning, error);
        return fallbackOperation();
    }
}

export async function initializeStorage() {
    if (isStorageInitialized) {
        return getStorageStatus();
    }

    if (!isIndexedDBAvailable()) {
        shouldUseIndexedDB = false;
        storageWarning = "IndexedDB indisponível. Usando LocalStorage como fallback.";
        isStorageInitialized = true;
        return getStorageStatus();
    }

    try {
        await openDatabase();
        shouldUseIndexedDB = true;
        const wasLegacyDataMigrated = await migrateLocalStorageToIndexedDB();
        const wereCountTemplatesMigrated = await migrateCountTemplatesToIndexedDB();
        const wereLocationNodesMigrated = await migrateLocationNodesToIndexedDB();
        const wereItemLocationLinksMigrated = await migrateItemLocationLinksToIndexedDB();
        const wereLocationCountSessionsMigrated = await migrateLocationCountSessionsToIndexedDB();
        const wereLocationCountEntriesMigrated = await migrateLocationCountEntriesToIndexedDB();
        isStorageInitialized = true;
        return {
            ...getStorageStatus(),
            migrated: wasLegacyDataMigrated
                || wereCountTemplatesMigrated
                || wereLocationNodesMigrated
                || wereItemLocationLinksMigrated
                || wereLocationCountSessionsMigrated
                || wereLocationCountEntriesMigrated
        };
    } catch (error) {
        shouldUseIndexedDB = false;
        storageWarning = "IndexedDB falhou. Usando LocalStorage como fallback.";
        isStorageInitialized = true;
        console.warn(storageWarning, error);
        return getStorageStatus();
    }
}

export function getStorageStatus() {
    return {
        isIndexedDBAvailable: isIndexedDBAvailable(),
        isUsingIndexedDB: shouldUseIndexedDB,
        warning: storageWarning
    };
}

export async function loadCatalog() {
    return runWithFallback(
        async () => {
            const catalogItems = await getAllFromStore(storeNames.catalog);
            const catalogState = await getFromStore(storeNames.appState, catalogInitializedKey);

            if (catalogItems.length > 0 || catalogState?.value === true) {
                return catalogItems;
            }

            return [...initialCatalogItems];
        },
        loadLocalCatalog
    );
}

export async function saveCatalog(items) {
    const catalogItems = normalizeCatalogRecords(items);

    await runWithFallback(
        async () => {
            await replaceStore(storeNames.catalog, catalogItems);
            await putInStore(storeNames.appState, { key: catalogInitializedKey, value: true });
        },
        () => saveLocalCatalog(catalogItems)
    );
    saveLocalCatalog(catalogItems);
}

export async function saveCatalogBackupBeforeImport(items) {
    const backup = {
        createdAt: new Date().toISOString(),
        items
    };

    await runWithFallback(
        () => saveBackupRecord(catalogBackupBeforeImportStorageKey, backup),
        () => saveLocalCatalogBackupBeforeImport(items)
    );
    saveLocalCatalogBackupBeforeImport(items);
}

export async function loadRelevantLocalStorageKeys() {
    return runWithFallback(
        async () => ({
            catalogBackupBeforeImport: await getFromStore(storeNames.backups, catalogBackupBeforeImportStorageKey),
            backupBeforeJsonImport: await getFromStore(storeNames.backups, backupBeforeJsonImportStorageKey)
        }),
        loadLocalRelevantStorageKeys
    );
}

export async function loadCustomUnits() {
    return runWithFallback(
        async () => normalizeCustomUnits(await getAllFromStore(storeNames.customUnits)),
        loadLocalCustomUnits
    );
}

export async function saveCustomUnits(units) {
    const normalizedUnits = normalizeCustomUnits(units);

    await runWithFallback(
        async () => {
            await replaceStore(storeNames.customUnits, normalizedUnits);
        },
        () => saveLocalCustomUnits(normalizedUnits)
    );
    saveLocalCustomUnits(normalizedUnits);

    return normalizedUnits;
}

export async function loadCountingDraft() {
    return runWithFallback(
        async () => (await getFromStore(storeNames.countingDraft, currentDraftKey))?.value || null,
        loadLocalCountingDraft
    );
}

export async function saveCountingDraft(draft) {
    await runWithFallback(
        () => putInStore(storeNames.countingDraft, { value: draft }, currentDraftKey),
        () => saveLocalCountingDraft(draft)
    );
    saveLocalCountingDraft(draft);
}

export async function clearCountingDraft() {
    await runWithFallback(
        () => deleteFromStore(storeNames.countingDraft, currentDraftKey),
        clearLocalCountingDraft
    );
    clearLocalCountingDraft();
}

export async function loadCountingHistory() {
    return runWithFallback(
        async () => sortHistory(await getAllFromStore(storeNames.countingHistory)),
        loadLocalCountingHistory
    );
}

export async function saveCountingHistory(history) {
    const sortedHistory = sortHistory(Array.isArray(history) ? history : []);

    await runWithFallback(
        async () => {
            await replaceStore(storeNames.countingHistory, sortedHistory);
        },
        () => saveLocalCountingHistory(sortedHistory)
    );
    saveLocalCountingHistory(sortedHistory);

    return sortedHistory;
}

export async function addCountHistoryEntry(entry) {
    const history = await loadCountingHistory();
    const nextHistoryById = new Map(history.map((historyEntry) => [historyEntry.id, historyEntry]));
    const normalizedEntry = normalizeHistoryEntry(entry);

    if (!normalizedEntry) {
        return history;
    }

    nextHistoryById.set(normalizedEntry.id, normalizedEntry);

    return saveCountingHistory([...nextHistoryById.values()]);
}

export async function loadLastFinalizedCount() {
    return (await loadCountingHistory())[0] || null;
}

export async function saveBackupBeforeJsonImport(state) {
    const backup = {
        createdAt: new Date().toISOString(),
        state
    };

    await runWithFallback(
        () => saveBackupRecord(backupBeforeJsonImportStorageKey, backup),
        () => saveLocalBackupBeforeJsonImport(state)
    );
    saveLocalBackupBeforeJsonImport(state);
}

export async function listCountTemplates() {
    return runWithFallback(
        async () => sortCountTemplates(await getAllFromStore(storeNames.countTemplates)),
        loadLocalCountTemplates
    );
}

export async function getCountTemplate(templateId) {
    const normalizedId = String(templateId || "").trim();

    if (!normalizedId) {
        return null;
    }

    return runWithFallback(
        async () => normalizeCountTemplate(await getFromStore(storeNames.countTemplates, normalizedId)),
        () => loadLocalCountTemplates().find((template) => template.id === normalizedId) || null
    );
}

export async function saveCountTemplate(template) {
    const normalizedTemplate = normalizeCountTemplate(template);

    if (!normalizedTemplate) {
        throw new Error("Template de contagem inválido.");
    }

    await runWithFallback(
        () => putInStore(storeNames.countTemplates, normalizedTemplate),
        () => saveLocalCountTemplate(normalizedTemplate)
    );
    saveLocalCountTemplate(normalizedTemplate);

    return normalizedTemplate;
}

export async function deleteCountTemplate(templateId) {
    const normalizedId = String(templateId || "").trim();

    if (!normalizedId) {
        return;
    }

    await runWithFallback(
        () => deleteFromStore(storeNames.countTemplates, normalizedId),
        () => deleteLocalCountTemplate(normalizedId)
    );
    deleteLocalCountTemplate(normalizedId);
}

export async function listLocationNodes() {
    return runWithFallback(
        async () => sortLocationNodes(await getAllFromStore(storeNames.locationNodes)),
        loadLocalLocationNodes
    );
}

export async function getLocationNode(locationId) {
    const normalizedId = String(locationId || "").trim();

    if (!normalizedId) {
        return null;
    }

    return runWithFallback(
        async () => normalizeLocationNodes([await getFromStore(storeNames.locationNodes, normalizedId)])[0] || null,
        () => loadLocalLocationNodes().find((node) => node.id === normalizedId) || null
    );
}

export async function saveLocationNode(node) {
    const existingNodes = await listLocationNodes();
    const existingNode = existingNodes.find((item) => item.id === String(node?.id || "").trim());
    const timestamp = new Date().toISOString();
    const validation = validateLocationNode({
        ...node,
        createdAt: existingNode?.createdAt || node?.createdAt || timestamp,
        updatedAt: timestamp
    }, existingNodes);

    if (!validation.isValid) {
        throw new Error(validation.error || "Local físico inválido.");
    }

    await runWithFallback(
        () => putInStore(storeNames.locationNodes, validation.node),
        () => saveLocalLocationNode(validation.node)
    );
    saveLocalLocationNode(validation.node);

    return validation.node;
}

export async function deleteLocationNode(locationId) {
    const normalizedId = String(locationId || "").trim();

    if (!normalizedId) {
        return;
    }

    const existingNodes = await listLocationNodes();

    if (existingNodes.some((node) => node.parentId === normalizedId)) {
        throw new Error("Não é possível remover um local que possui filhos.");
    }

    await runWithFallback(
        () => deleteFromStore(storeNames.locationNodes, normalizedId),
        () => deleteLocalLocationNode(normalizedId)
    );
    deleteLocalLocationNode(normalizedId);
}

export async function listItemLocationLinks() {
    return runWithFallback(
        async () => sortItemLocationLinks(await getAllFromStore(storeNames.itemLocationLinks)),
        loadLocalItemLocationLinks
    );
}

export async function getItemLocationLink(linkId) {
    const normalizedId = String(linkId || "").trim();

    if (!normalizedId) {
        return null;
    }

    return runWithFallback(
        async () => normalizeItemLocationLinks([await getFromStore(storeNames.itemLocationLinks, normalizedId)])[0] || null,
        () => loadLocalItemLocationLinks().find((link) => link.id === normalizedId) || null
    );
}

export async function saveItemLocationLink(link) {
    const [templates, locations, existingLinks] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const existingLink = existingLinks.find((item) => item.id === String(link?.id || "").trim());
    const timestamp = new Date().toISOString();
    const validation = validateItemLocationLink({
        ...link,
        createdAt: existingLink?.createdAt || link?.createdAt || timestamp,
        updatedAt: timestamp
    }, templates, locations, existingLinks);

    if (!validation.isValid) {
        throw new Error(validation.error || "Vínculo entre item e local inválido.");
    }

    await runWithFallback(
        () => putInStore(storeNames.itemLocationLinks, validation.link),
        () => saveLocalItemLocationLink(validation.link)
    );
    saveLocalItemLocationLink(validation.link);

    return validation.link;
}

function validateItemLocationLinkBatch(links, templates, locations, existingLinks) {
    const validatedLinks = [];

    for (const link of links) {
        const timestamp = new Date().toISOString();
        const validation = validateItemLocationLink({
            ...link,
            createdAt: link.createdAt || timestamp,
            updatedAt: timestamp
        }, templates, locations, [...existingLinks, ...validatedLinks]);

        if (!validation.isValid) {
            throw new Error(validation.error || "Vínculo entre item e local inválido.");
        }

        validatedLinks.push(validation.link);
    }

    return validatedLinks;
}

export async function saveItemLocationLinksBatch(links) {
    if (!Array.isArray(links) || links.length === 0) return [];
    const [templates, locations, existingLinks] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const validatedLinks = validateItemLocationLinkBatch(links, templates, locations, existingLinks);

    await runWithFallback(
        () => bulkPut(storeNames.itemLocationLinks, validatedLinks),
        () => saveLocalItemLocationLinksBatch(validatedLinks)
    );
    saveLocalItemLocationLinksBatch(validatedLinks);
    return validatedLinks;
}

export async function deleteItemLocationLink(linkId) {
    const normalizedId = String(linkId || "").trim();

    if (!normalizedId) {
        return;
    }

    await runWithFallback(
        () => deleteFromStore(storeNames.itemLocationLinks, normalizedId),
        () => deleteLocalItemLocationLink(normalizedId)
    );
    deleteLocalItemLocationLink(normalizedId);
}

export async function listLinksByTemplate(templateId) {
    const normalizedTemplateId = String(templateId || "").trim();
    return (await listItemLocationLinks()).filter((link) => link.templateId === normalizedTemplateId);
}

export async function listLinksByLocation(locationId) {
    const normalizedLocationId = String(locationId || "").trim();
    return (await listItemLocationLinks()).filter((link) => link.locationId === normalizedLocationId);
}

export async function listLinksByItem(templateId, itemCode) {
    const normalizedTemplateId = String(templateId || "").trim();
    const normalizedItemCode = String(itemCode || "").trim();

    return (await listItemLocationLinks()).filter((link) => (
        link.templateId === normalizedTemplateId && link.itemCode === normalizedItemCode
    ));
}

export async function loadWhatsappSettings() {
    return runWithFallback(async () => {
        const storedSettings = await getFromStore(storeNames.appState, whatsappSettingsStorageKey);
        return storedSettings ? normalizeWhatsappSettings(storedSettings.value) : loadLocalWhatsappSettings();
    }, loadLocalWhatsappSettings);
}

export async function saveWhatsappSettings(settings) {
    const validation = validateWhatsappSettings({ ...settings, updatedAt: new Date().toISOString() });

    await runWithFallback(
        () => putInStore(storeNames.appState, { key: whatsappSettingsStorageKey, value: validation.settings }),
        () => saveLocalWhatsappSettings(validation.settings)
    );
    saveLocalWhatsappSettings(validation.settings);
    return validation;
}

export async function clearWhatsappSettings() {
    await runWithFallback(
        () => deleteFromStore(storeNames.appState, whatsappSettingsStorageKey),
        clearLocalWhatsappSettings
    );
    clearLocalWhatsappSettings();
}

export async function listItemUnitSettings() {
    return runWithFallback(async () => {
        const storedState = await getFromStore(storeNames.appState, itemUnitSettingsStorageKey);
        return storedState ? sortItemUnitSettings(storedState.value) : loadLocalItemUnitSettings();
    }, loadLocalItemUnitSettings);
}

export async function getItemUnitSetting(templateId, itemCode) {
    const normalizedTemplateId = String(templateId || "").trim();
    const normalizedItemCode = String(itemCode || "").trim();
    return (await listItemUnitSettings()).find((setting) => (
        setting.templateId === normalizedTemplateId && setting.itemCode === normalizedItemCode
    )) || null;
}

async function saveItemUnitSettingsState(settings) {
    const normalizedSettings = sortItemUnitSettings(settings);
    await runWithFallback(
        () => putInStore(storeNames.appState, { key: itemUnitSettingsStorageKey, value: normalizedSettings }),
        () => saveLocalItemUnitSettings(normalizedSettings)
    );
    saveLocalItemUnitSettings(normalizedSettings);
    return normalizedSettings;
}

export async function saveItemUnitSetting(setting) {
    const template = await getCountTemplate(setting?.templateId);
    const match = findTemplateItem(template, setting?.itemCode);
    if (!match) throw new Error("O item não existe no template selecionado.");

    const currentSettings = await listItemUnitSettings();
    const existingSetting = currentSettings.find((item) => item.id === setting.id);
    const timestamp = new Date().toISOString();
    const validation = validateItemUnitSetting({
        ...setting,
        itemNameSnapshot: match.item.name,
        groupId: match.group.id,
        groupNameSnapshot: match.group.name,
        createdAt: existingSetting?.createdAt || setting.createdAt || timestamp,
        updatedAt: timestamp
    });
    if (!validation.isValid) throw new Error(validation.error || "Configuração de unidade inválida.");

    const nextSettings = currentSettings.filter((item) => item.id !== validation.setting.id);
    await saveItemUnitSettingsState([...nextSettings, validation.setting]);
    return validation.setting;
}

export async function deleteItemUnitSetting(templateId, itemCode) {
    const normalizedTemplateId = String(templateId || "").trim();
    const normalizedItemCode = String(itemCode || "").trim();
    const remainingSettings = (await listItemUnitSettings()).filter((setting) => !(
        setting.templateId === normalizedTemplateId && setting.itemCode === normalizedItemCode
    ));
    await saveItemUnitSettingsState(remainingSettings);
}

export async function listConsolidationSnapshots() {
    return runWithFallback(async () => {
        const storedState = await getFromStore(storeNames.appState, consolidationSnapshotsStorageKey);
        return storedState ? sortConsolidationSnapshots(storedState.value) : loadLocalConsolidationSnapshots();
    }, loadLocalConsolidationSnapshots);
}

export async function getConsolidationSnapshot(snapshotId) {
    const normalizedId = String(snapshotId || "").trim();
    if (!normalizedId) return null;
    return (await listConsolidationSnapshots()).find((snapshot) => snapshot.id === normalizedId) || null;
}

async function saveConsolidationSnapshotsState(snapshots) {
    const normalizedSnapshots = sortConsolidationSnapshots(snapshots);
    await runWithFallback(
        () => putInStore(storeNames.appState, { key: consolidationSnapshotsStorageKey, value: normalizedSnapshots }),
        () => saveLocalConsolidationSnapshots(normalizedSnapshots)
    );
    saveLocalConsolidationSnapshots(normalizedSnapshots);
    return normalizedSnapshots;
}

export async function saveConsolidationSnapshot(snapshot) {
    const currentSnapshots = await listConsolidationSnapshots();
    const existingSnapshot = currentSnapshots.find((item) => item.id === String(snapshot?.id || "").trim());
    const timestamp = new Date().toISOString();
    const validation = validateConsolidationSnapshot({
        ...snapshot,
        createdAt: existingSnapshot?.createdAt || snapshot?.createdAt || timestamp,
        updatedAt: timestamp
    });
    if (!validation.isValid) throw new Error(validation.error || "Snapshot de consolidação inválido.");
    const remainingSnapshots = currentSnapshots.filter((item) => item.id !== validation.snapshot.id);
    await saveConsolidationSnapshotsState([...remainingSnapshots, validation.snapshot]);
    return validation.snapshot;
}

export async function deleteConsolidationSnapshot(snapshotId) {
    const normalizedId = String(snapshotId || "").trim();
    if (!normalizedId) return;
    const remainingSnapshots = (await listConsolidationSnapshots()).filter((snapshot) => snapshot.id !== normalizedId);
    await saveConsolidationSnapshotsState(remainingSnapshots);
}

export async function getEffectiveUnit(templateId, itemCode) {
    const savedSetting = await getItemUnitSetting(templateId, itemCode);
    if (savedSetting?.effectiveUnit) return savedSetting.effectiveUnit;

    const [template, entries] = await Promise.all([
        getCountTemplate(templateId),
        listLocationCountEntries()
    ]);
    return inferUnitForTemplateItem(template, itemCode, entries)?.effectiveUnit || "";
}

export async function listLocationCountSessions() {
    return runWithFallback(
        async () => sortLocationCountSessions(await getAllFromStore(storeNames.locationCountSessions)),
        loadLocalLocationCountSessions
    );
}

export async function getLocationCountSession(sessionId) {
    const normalizedId = String(sessionId || "").trim();

    if (!normalizedId) {
        return null;
    }

    return runWithFallback(
        async () => normalizeLocationCountSessions([
            await getFromStore(storeNames.locationCountSessions, normalizedId)
        ])[0] || null,
        () => loadLocalLocationCountSessions().find((session) => session.id === normalizedId) || null
    );
}

function preserveSessionSnapshots(existingSession, candidate) {
    if (!existingSession) {
        return candidate;
    }

    return {
        ...candidate,
        id: existingSession.id,
        templateId: existingSession.templateId,
        templateNameSnapshot: existingSession.templateNameSnapshot,
        locationId: existingSession.locationId,
        locationPathSnapshot: existingSession.locationPathSnapshot,
        reportAreaSnapshot: existingSession.reportAreaSnapshot,
        plannedItems: existingSession.plannedItems,
        plannedItemCount: existingSession.plannedItemCount,
        activeLinkCountSnapshot: existingSession.activeLinkCountSnapshot,
        createdAt: existingSession.createdAt
    };
}

function validateSessionTransition(existingSession, nextSession) {
    if (existingSession?.status === "canceled" && nextSession.status !== "canceled") {
        throw new Error("Uma sessão cancelada não pode voltar para rascunho.");
    }

    if (existingSession?.status === "draft" && !["draft", "in_progress", "canceled"].includes(nextSession.status)) {
        throw new Error("O rascunho só pode ser iniciado ou cancelado nesta etapa.");
    }

    if (existingSession?.status === "in_progress" && nextSession.status !== "in_progress") {
        throw new Error("Uma sessão em andamento ainda não pode ser finalizada ou cancelada.");
    }
}

function validateNewSessionSource(session, templates, locations, links) {
    const template = templates.find((item) => item.id === session.templateId);
    const location = locations.find((item) => item.id === session.locationId);
    const expectedItems = buildPlannedItemsForLocation(template, location, links, locations);
    const expectedPath = getLocationPath(location?.id, locations).map((node) => node.name);

    if (!location?.active) {
        throw new Error("Não é possível criar uma sessão para um local inativo.");
    }

    if (session.templateNameSnapshot !== template?.name
        || session.locationPathSnapshot.join("|") !== expectedPath.join("|")
        || session.reportAreaSnapshot !== (location.reportArea || null)) {
        throw new Error("Os dados da sessão não correspondem ao template e local atuais.");
    }

    if (expectedItems.length === 0 || JSON.stringify(expectedItems) !== JSON.stringify(session.plannedItems)) {
        throw new Error("Os itens planejados não correspondem aos vínculos ativos atuais.");
    }
}

export async function saveLocationCountSession(session) {
    const [templates, locations, links, sessions] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks(),
        listLocationCountSessions()
    ]);
    const existingSession = sessions.find((item) => item.id === String(session?.id || "").trim());
    const timestamp = new Date().toISOString();
    const candidate = preserveSessionSnapshots(existingSession, {
        ...session,
        createdAt: existingSession?.createdAt || session?.createdAt || timestamp,
        updatedAt: timestamp
    });
    const validation = validateLocationCountSession(candidate, templates, locations, links);

    validateSessionTransition(existingSession, candidate);
    if (!validation.isValid) throw new Error(validation.error || "Sessão de contagem inválida.");
    if (!existingSession) validateNewSessionSource(validation.session, templates, locations, links);

    await runWithFallback(
        () => putInStore(storeNames.locationCountSessions, validation.session),
        () => saveLocalLocationCountSession(validation.session)
    );
    saveLocalLocationCountSession(validation.session);
    return validation.session;
}

export async function createLocationCountSessionDraft({ templateId, locationId, notes = "" }) {
    const [templates, locations, links] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const template = templates.find((item) => item.id === String(templateId || "").trim());
    const location = locations.find((item) => item.id === String(locationId || "").trim());
    const draft = createLocationCountSessionDraftModel({ template, location, links, locations, notes });

    return saveLocationCountSession(draft);
}

export async function startLocationCountSession(sessionId) {
    const session = await getLocationCountSession(sessionId);
    if (!session) throw new Error("Sessão de contagem não encontrada.");
    if (session.status === "in_progress") return session;
    if (session.status !== "draft") throw new Error("Somente um rascunho pode ser iniciado.");

    return saveLocationCountSession({
        ...session,
        status: "in_progress",
        startedAt: new Date().toISOString()
    });
}

export async function cancelLocationCountSession(sessionId) {
    const session = await getLocationCountSession(sessionId);

    if (!session) throw new Error("Sessão de contagem não encontrada.");
    if (session.status !== "draft") throw new Error("Somente sessões em rascunho podem ser canceladas.");

    return saveLocationCountSession({
        ...session,
        status: "canceled",
        canceledAt: new Date().toISOString()
    });
}

export async function deleteLocationCountSession(sessionId) {
    const normalizedId = String(sessionId || "").trim();

    if (!normalizedId) {
        return;
    }

    const relatedEntries = await listEntriesBySession(normalizedId);
    if (relatedEntries.length > 0) {
        throw new Error("Não é possível remover uma sessão que já possui entradas de contagem.");
    }

    await runWithFallback(
        () => deleteFromStore(storeNames.locationCountSessions, normalizedId),
        () => deleteLocalLocationCountSession(normalizedId)
    );
    deleteLocalLocationCountSession(normalizedId);
}

export async function listLocationCountEntries() {
    return runWithFallback(
        async () => sortLocationCountEntries(await getAllFromStore(storeNames.locationCountEntries)),
        loadLocalLocationCountEntries
    );
}

export async function listEntriesBySession(sessionId) {
    const normalizedSessionId = String(sessionId || "").trim();
    return (await listLocationCountEntries()).filter((entry) => entry.sessionId === normalizedSessionId);
}

export async function listEntriesByItem(sessionId, itemCode) {
    const normalizedItemCode = String(itemCode || "").trim();
    return (await listEntriesBySession(sessionId)).filter((entry) => entry.itemCode === normalizedItemCode);
}

function preserveEntrySnapshots(existingEntry, candidate) {
    if (!existingEntry) return candidate;
    const snapshotFields = [
        "id", "sessionId", "templateId", "locationId", "linkId", "itemCode",
        "itemNameSnapshot", "groupId", "groupNameSnapshot", "reportAreaSnapshot", "createdAt"
    ];
    const preservedEntry = { ...candidate };
    snapshotFields.forEach((field) => { preservedEntry[field] = existingEntry[field]; });
    return preservedEntry;
}

function validateEntrySource(entry, session) {
    if (!session) throw new Error("A sessão da entrada não existe neste dispositivo.");
    if (!["draft", "in_progress"].includes(session.status)) {
        throw new Error("A sessão não está aberta para registrar entradas.");
    }
    const plannedItem = session.plannedItems.find((item) => (
        item.itemCode === entry.itemCode && item.linkId === entry.linkId
    ));
    if (!plannedItem) throw new Error("O item não faz parte da sessão planejada.");
    if (entry.templateId !== session.templateId || entry.locationId !== session.locationId) {
        throw new Error("A entrada não corresponde ao template e local da sessão.");
    }
    if (entry.itemNameSnapshot !== plannedItem.itemNameSnapshot
        || entry.groupId !== plannedItem.groupId
        || entry.groupNameSnapshot !== plannedItem.groupNameSnapshot
        || entry.reportAreaSnapshot !== session.reportAreaSnapshot) {
        throw new Error("Os snapshots da entrada não correspondem à sessão planejada.");
    }
}

export async function saveLocationCountEntry(entry) {
    const [entries, session] = await Promise.all([
        listLocationCountEntries(),
        getLocationCountSession(entry?.sessionId)
    ]);
    const existingEntry = entries.find((item) => item.id === String(entry?.id || "").trim());
    const timestamp = new Date().toISOString();
    const candidate = preserveEntrySnapshots(existingEntry, {
        ...entry,
        createdAt: existingEntry?.createdAt || entry?.createdAt || timestamp,
        updatedAt: timestamp
    });
    const validation = validateLocationCountEntry(candidate);

    if (!validation.isValid) throw new Error(validation.error || "Entrada de contagem inválida.");
    validateEntrySource(validation.entry, session);
    await runWithFallback(
        () => putInStore(storeNames.locationCountEntries, validation.entry),
        () => saveLocalLocationCountEntry(validation.entry)
    );
    saveLocalLocationCountEntry(validation.entry);
    return validation.entry;
}

export async function addLocationCountEntry({ session, plannedItem, rawQuantityText, rawUnit = "", notes = "" }) {
    const storedSession = await getLocationCountSession(session?.id);
    if (!storedSession) throw new Error("Sessão de contagem não encontrada.");
    const storedItem = storedSession.plannedItems.find((item) => (
        item.itemCode === plannedItem?.itemCode && item.linkId === plannedItem?.linkId
    ));
    if (!storedItem) throw new Error("O item selecionado não faz parte desta sessão.");
    const entry = createLocationCountEntryModel({
        session: storedSession,
        plannedItem: storedItem,
        rawQuantityText,
        rawUnit,
        notes
    });
    return saveLocationCountEntry(entry);
}

export async function removeLocationCountEntry(entryId) {
    const normalizedId = String(entryId || "").trim();
    const entry = (await listLocationCountEntries()).find((item) => item.id === normalizedId);
    if (!entry) throw new Error("Entrada de contagem não encontrada.");
    if (!entry.active) return entry;

    return saveLocationCountEntry({
        ...entry,
        active: false,
        removedAt: new Date().toISOString()
    });
}
