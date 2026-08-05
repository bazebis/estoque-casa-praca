import { initialCatalogItems } from "./seed.js";
import { normalizeHistoryEntry } from "./history.js";
import { normalizeCountTemplate } from "./countTemplates.js";
import {
    normalizeItemLocationLinks,
    validateItemLocationLink
} from "./itemLocationLinks.js";
import {
    normalizeLocationNodes,
    validateLocationNode
} from "./locationNodes.js";
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
const migrationFlagKey = "localStorageMigrationCompleted";
const countTemplatesMigrationFlagKey = "countTemplatesLocalStorageMigrationCompleted";
const locationNodesMigrationFlagKey = "locationNodesLocalStorageMigrationCompleted";
const itemLocationLinksMigrationFlagKey = "itemLocationLinksLocalStorageMigrationCompleted";
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
        isStorageInitialized = true;
        return {
            ...getStorageStatus(),
            migrated: wasLegacyDataMigrated
                || wereCountTemplatesMigrated
                || wereLocationNodesMigrated
                || wereItemLocationLinksMigrated
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
