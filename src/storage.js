import { initialCatalogItems } from "./seed.js";
import { buildBackupPayload, buildBackupRestorePlan } from "./backup.js";
import { normalizeHistoryEntry } from "./history.js";
import { normalizeCountTemplate } from "./countTemplates.js";
import {
    findTemplateItem,
    normalizeItemLocationLinks,
    validateItemLocationLink
} from "./itemLocationLinks.js";
import {
    buildAssistedUnitSuggestionPlan,
    inferUnitForTemplateItem,
    normalizeItemUnitSettings,
    validateAssistedUnitSuggestion,
    validateControlledItemUnitProfile,
    validateItemUnitSetting
} from "./itemUnitSettings.js";
import {
    areItemUnitSettingsSemanticallyEqual,
    buildUnitProfileTemplateImportPlan,
    mergeImportedItemUnitSettings
} from "./itemUnitTemplatePortability.js";
import {
    getLocationPath,
    normalizeLocationNodes,
    validateLocationNode
} from "./locationNodes.js";
import {
    buildPlannedItemsForLocation,
    createLocationCountSessionDraftModel,
    LOCATION_COUNT_SESSION_STATUSES,
    normalizeLocationCountSessions,
    validateLocationCountSession
} from "./locationCountSessions.js";
import {
    assertValidCountRoundCollection,
    buildCountRoundFallbackReconciliationPlan,
    buildCountRoundLocationSessionMutation,
    CountRoundError,
    createCountRoundModel
} from "./countRounds.js";
import {
    buildCountRoundFinalizationPlan,
    CountRoundFinalizationError
} from "./countRoundFinalization.js";
import {
    createLocationCountEntryModel,
    hasActiveEntriesForItemInOpenSessions,
    normalizeLocationCountEntries,
    validateLocationCountEntry
} from "./locationCountEntries.js";
import { resolveAllowedUnitForNewEntry } from "./unitConversion.js";
import { normalizeWhatsappSettings, validateWhatsappSettings } from "./whatsappSettings.js";
import {
    markConsolidationSnapshotFinalized,
    normalizeConsolidationSnapshots,
    validateConsolidationSnapshot
} from "./consolidationSnapshots.js";
import { normalizeCustomUnits } from "./units.js";
import {
    addRecordFromStoreSnapshot,
    bulkPut,
    deleteConsolidationSnapshotAtomically,
    deleteFromStore,
    finalizeCountRoundAtomically,
    getAllFromStore,
    getFromStore,
    isIndexedDBAvailable,
    mutateCountRoundLocationSession,
    openDatabase,
    putInStore,
    reconcileCountRoundFallbackMappings,
    replaceStore,
    replaceStoresAtomically,
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
const countRoundsStorageKey = "countRounds";
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
let itemUnitSettingsMutationQueue = Promise.resolve();
let countRoundMutationQueue = Promise.resolve();

function serializeItemUnitSettingsMutation(mutation) {
    const operation = itemUnitSettingsMutationQueue.then(mutation, mutation);

    // A fila precisa continuar utilizável mesmo quando uma mutação individual falha.
    itemUnitSettingsMutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
}

function serializeCountRoundMutation(mutation) {
    const operation = countRoundMutationQueue.then(mutation, mutation);

    // A fila fecha corridas no mesmo contexto; o índice unique protege o IndexedDB entre contextos.
    countRoundMutationQueue = operation.then(() => undefined, () => undefined);
    return operation;
}

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

function sortCountRounds(rounds) {
    return assertValidCountRoundCollection(rounds).sort((firstRound, secondRound) => (
        new Date(secondRound.createdAt) - new Date(firstRound.createdAt)
        || firstRound.id.localeCompare(secondRound.id, "pt-BR")
    ));
}

function loadLocalCountRounds() {
    const rounds = readJson(countRoundsStorageKey);
    return sortCountRounds(Array.isArray(rounds) ? rounds : []);
}

function saveLocalCountRound(round) {
    const rounds = loadLocalCountRounds().filter((item) => item.id !== round.id);
    const nextRounds = sortCountRounds([...rounds, round]);

    writeJson(countRoundsStorageKey, nextRounds);
    return nextRounds.find((item) => item.id === round.id);
}

function restoreLocalRoundSessionSnapshot(snapshot) {
    snapshot.forEach(({ key, value }) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
    });
}

function commitLocalRoundSessionPair(round, session) {
    const snapshot = [countRoundsStorageKey, locationCountSessionsStorageKey].map((key) => ({
        key,
        value: localStorage.getItem(key)
    }));

    try {
        const sessions = loadLocalLocationCountSessions().filter((item) => item.id !== session.id);
        writeJson(locationCountSessionsStorageKey, sortLocationCountSessions([...sessions, session]));
        const rounds = loadLocalCountRounds().filter((item) => item.id !== round.id);
        writeJson(countRoundsStorageKey, sortCountRounds([...rounds, round]));
    } catch (writeError) {
        try {
            restoreLocalRoundSessionSnapshot(snapshot);
        } catch (rollbackError) {
            throw new Error(`A vinculação falhou e o rollback local também falhou: ${rollbackError.message}`);
        }
        throw writeError;
    }
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

function mergeRecordsById(currentRecords, authoritativeRecords) {
    const recordsById = new Map(currentRecords.map((record) => [record.id, record]));
    authoritativeRecords.forEach((record) => recordsById.set(record.id, record));
    return [...recordsById.values()];
}

function commitLocalCountRoundReconciliationMirror(plan) {
    const storageKeys = [
        countRoundsStorageKey,
        locationCountSessionsStorageKey,
        locationCountEntriesStorageKey
    ];
    const snapshot = storageKeys.map((key) => ({ key, value: localStorage.getItem(key) }));

    try {
        const rounds = mergeRecordsById(loadLocalCountRounds(), plan.mirrorRounds);
        const sessions = mergeRecordsById(loadLocalLocationCountSessions(), plan.mirrorSessions);
        const entries = mergeRecordsById(loadLocalLocationCountEntries(), plan.mirrorEntries);
        writeJson(countRoundsStorageKey, sortCountRounds(rounds));
        writeJson(locationCountSessionsStorageKey, sortLocationCountSessions(sessions));
        writeJson(locationCountEntriesStorageKey, sortLocationCountEntries(entries));
    } catch (mirrorError) {
        restoreLocalRoundSessionSnapshot(snapshot);
        throw mirrorError;
    }
}

function commitLocalCountRoundFinalization(plan) {
    const storageKeys = [
        countRoundsStorageKey,
        locationCountSessionsStorageKey,
        locationCountEntriesStorageKey,
        consolidationSnapshotsStorageKey
    ];
    const snapshot = storageKeys.map((key) => ({ key, value: localStorage.getItem(key) }));

    try {
        const rounds = mergeRecordsById(loadLocalCountRounds(), [plan.round]);
        const sessions = mergeRecordsById(loadLocalLocationCountSessions(), plan.mirrorSessions);
        const entries = mergeRecordsById(loadLocalLocationCountEntries(), plan.mirrorEntries);
        writeJson(countRoundsStorageKey, sortCountRounds(rounds));
        writeJson(locationCountSessionsStorageKey, sortLocationCountSessions(sessions));
        writeJson(locationCountEntriesStorageKey, sortLocationCountEntries(entries));
        writeJson(consolidationSnapshotsStorageKey, sortConsolidationSnapshots(plan.snapshots));
    } catch (writeError) {
        try {
            restoreLocalRoundSessionSnapshot(snapshot);
        } catch (rollbackError) {
            throw new Error(`A finalização falhou e o rollback local também falhou: ${rollbackError.message}`);
        }
        throw writeError;
    }
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

async function migrateCountRoundsToIndexedDB() {
    const localRounds = loadLocalCountRounds();
    if (localRounds.length === 0) return false;

    const storedRounds = assertValidCountRoundCollection(await getAllFromStore(storeNames.countRounds));
    const storedRoundIds = new Set(storedRounds.map((round) => round.id));
    const missingRounds = localRounds.filter((round) => !storedRoundIds.has(round.id));

    assertValidCountRoundCollection([...storedRounds, ...missingRounds]);
    if (missingRounds.length > 0) await bulkPut(storeNames.countRounds, missingRounds);
    return missingRounds.length > 0;
}

async function reconcileLocalCountRoundMappingsToIndexedDB() {
    const localRounds = loadLocalCountRounds();
    const plan = await reconcileCountRoundFallbackMappings({
        localRounds,
        localSessions: loadLocalLocationCountSessions(),
        localEntries: loadLocalLocationCountEntries(),
        buildPlan: buildCountRoundFallbackReconciliationPlan
    });
    let mirrorSynchronized = true;
    if (plan.mirrorRounds.length > 0) {
        try {
            commitLocalCountRoundReconciliationMirror(plan);
        } catch (mirrorError) {
            // O IndexedDB já confirmou a transação; o mirror é best effort e não pode fingir rollback primário.
            mirrorSynchronized = false;
            storageWarning = "A contagem está segura no IndexedDB, mas o espelho local não pôde ser atualizado.";
            console.warn(storageWarning, mirrorError);
        }
    }
    const changed = plan.roundsToPut.length > 0
        || plan.sessionsToAdd.length > 0
        || plan.sessionsToPut.length > 0
        || plan.entriesToAdd.length > 0
        || plan.entriesToPut.length > 0;
    return { changed, mirrorSynchronized };
}

async function runWithFallback(dbOperation, fallbackOperation) {
    if (!shouldUseIndexedDB) {
        return fallbackOperation();
    }

    try {
        return await dbOperation();
    } catch (error) {
        shouldUseIndexedDB = false;
        storageWarning = "O armazenamento principal falhou. Os dados continuarão sendo salvos neste navegador pelo modo alternativo.";
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
        storageWarning = "O armazenamento principal não está disponível. Os dados serão salvos neste navegador pelo modo alternativo.";
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
        const countRoundReconciliation = await reconcileLocalCountRoundMappingsToIndexedDB();
        const wereLocationCountSessionsMigrated = countRoundReconciliation.mirrorSynchronized
            ? await migrateLocationCountSessionsToIndexedDB()
            : false;
        const wereLocationCountEntriesMigrated = countRoundReconciliation.mirrorSynchronized
            ? await migrateLocationCountEntriesToIndexedDB()
            : false;
        const wereCountRoundsMigrated = await migrateCountRoundsToIndexedDB();
        isStorageInitialized = true;
        return {
            ...getStorageStatus(),
            migrated: wasLegacyDataMigrated
                || wereCountTemplatesMigrated
                || wereLocationNodesMigrated
                || wereItemLocationLinksMigrated
                || wereLocationCountSessionsMigrated
                || wereLocationCountEntriesMigrated
                || countRoundReconciliation.changed
                || wereCountRoundsMigrated
        };
    } catch (error) {
        if (error instanceof CountRoundError) throw error;
        shouldUseIndexedDB = false;
        storageWarning = "O armazenamento principal falhou. Os dados continuarão sendo salvos neste navegador pelo modo alternativo.";
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

function createBackupScopedState(values) {
    return {
        catalogItems: values.catalogItems,
        countingHistory: values.countingHistory,
        customUnits: values.customUnits,
        countTemplates: values.countTemplates,
        itemUnitSettings: values.itemUnitSettings
    };
}

async function loadBackupScopedState() {
    const values = await Promise.all([
        loadCatalog(),
        loadCountingHistory(),
        loadCustomUnits(),
        listCountTemplates(),
        listItemUnitSettings()
    ]);
    return createBackupScopedState({
        catalogItems: values[0],
        countingHistory: values[1],
        customUnits: values[2],
        countTemplates: values[3],
        itemUnitSettings: values[4]
    });
}

function serializeComparable(value) {
    return JSON.stringify(value);
}

function findChangedTemplateIds(currentTemplates, nextTemplates) {
    const currentById = new Map(currentTemplates.map((template) => [template.id, template]));
    const nextById = new Map(nextTemplates.map((template) => [template.id, template]));
    const allIds = new Set([...currentById.keys(), ...nextById.keys()]);
    return new Set([...allIds].filter((templateId) => (
        serializeComparable(currentById.get(templateId)) !== serializeComparable(nextById.get(templateId))
    )));
}

function createProfileKey(setting) {
    return `${setting.templateId}\u0000${setting.itemCode}`;
}

function findChangedProfiles(currentSettings, nextSettings) {
    const currentByKey = new Map(currentSettings.map((setting) => [createProfileKey(setting), setting]));
    const nextByKey = new Map(nextSettings.map((setting) => [createProfileKey(setting), setting]));
    const allKeys = new Set([...currentByKey.keys(), ...nextByKey.keys()]);
    return [...allKeys].filter((key) => (
        serializeComparable(currentByKey.get(key)) !== serializeComparable(nextByKey.get(key))
    )).map((key) => currentByKey.get(key) || nextByKey.get(key));
}

const activeEntryProfileMutationMessage = "Este item já possui lançamentos em uma contagem aberta. Remova os lançamentos ou finalize/cancele a contagem antes de alterar as unidades.";
const plannedItemProfileMutationMessage = "Este item está planejado em uma contagem aberta, mesmo sem lançamento. Finalize ou cancele a contagem antes de alterar as unidades.";
const activeRoundProfileMutationMessage = "Este item faz parte de uma contagem em andamento. Finalize a contagem antes de alterar suas unidades.";

export function getItemUnitProfileMutationBlockReason({
    templateId,
    itemCode,
    sessions = [],
    entries = [],
    rounds = [],
    includePlannedItems = false
} = {}) {
    const normalizedTemplateId = String(templateId || "").trim();
    const normalizedItemCode = String(itemCode || "").trim();
    const normalizedSessions = normalizeLocationCountSessions(sessions);
    const isPlannedInActiveRound = listActiveCountRounds(rounds).some((round) => (
        round.templateId === normalizedTemplateId
        && round.locations.some((location) => location.plannedItems.some((item) => (
            item.itemCode === normalizedItemCode
        )))
    ));

    if (isPlannedInActiveRound) {
        return { type: "active-round-item", message: activeRoundProfileMutationMessage };
    }

    if (hasActiveEntriesForItemInOpenSessions({
        templateId: normalizedTemplateId,
        itemCode: normalizedItemCode,
        sessions: normalizedSessions,
        entries
    })) {
        return { type: "active-entry", message: activeEntryProfileMutationMessage };
    }

    if (!includePlannedItems) return null;
    const isPlannedInOpenSession = normalizedSessions.some((session) => (
        session.templateId === normalizedTemplateId
        && ["draft", "in_progress"].includes(session.status)
        && session.plannedItems.some((item) => item.active && item.itemCode === normalizedItemCode)
    ));

    return isPlannedInOpenSession
        ? { type: "planned-item", message: plannedItemProfileMutationMessage }
        : null;
}

function assertBackupRestoreSessionsAreSafe(plan, sessions, entries, rounds) {
    const changedTemplateIds = findChangedTemplateIds(
        plan.currentState.countTemplates,
        plan.nextState.countTemplates
    );
    const hasRelatedOpenSession = normalizeLocationCountSessions(sessions).some((session) => (
        changedTemplateIds.has(session.templateId) && ["draft", "in_progress"].includes(session.status)
    ));
    if (hasRelatedOpenSession) {
        throw new Error("Este backup alteraria um template relacionado a uma sessão aberta. Finalize ou cancele essa contagem antes da restauração.");
    }
    const hasRelatedActiveRound = listActiveCountRounds(rounds).some((round) => (
        changedTemplateIds.has(round.templateId)
    ));
    if (hasRelatedActiveRound) {
        throw new Error("Este backup alteraria o template de uma contagem em andamento. Finalize a contagem antes da restauração.");
    }

    const changedProfiles = findChangedProfiles(
        plan.currentState.itemUnitSettings,
        plan.nextState.itemUnitSettings
    );
    const blockReason = changedProfiles.map((setting) => getItemUnitProfileMutationBlockReason({
        templateId: setting.templateId,
        itemCode: setting.itemCode,
        sessions,
        entries,
        rounds,
        includePlannedItems: true
    })).find(Boolean);
    if (blockReason) throw new Error(blockReason.message);
}

function createInternalBackupRecord(currentState) {
    const state = buildBackupPayload({
        ...currentState,
        lastFinalizedCount: currentState.countingHistory[0] || null
    });
    return { createdAt: new Date().toISOString(), state };
}

function buildLocalRestoreWrites(plan, backupRecord) {
    const fieldToStorageKey = {
        catalogItems: catalogStorageKey,
        countingHistory: countingHistoryStorageKey,
        customUnits: customUnitsStorageKey,
        countTemplates: countTemplatesStorageKey,
        itemUnitSettings: itemUnitSettingsStorageKey
    };
    const writes = plan.writeFields.map((fieldName) => ({
        storageKey: fieldToStorageKey[fieldName],
        value: plan.nextState[fieldName]
    }));
    writes.push({ storageKey: backupBeforeJsonImportStorageKey, value: backupRecord });
    return writes;
}

function restoreLocalStorageSnapshot(snapshot) {
    snapshot.forEach(({ storageKey, value }) => {
        if (value === null) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, value);
    });
}

function applyLocalRestoreWrites(writes) {
    const snapshot = writes.map(({ storageKey }) => ({ storageKey, value: localStorage.getItem(storageKey) }));
    try {
        writes.forEach(({ storageKey, value }) => writeJson(storageKey, value));
    } catch (writeError) {
        try {
            restoreLocalStorageSnapshot(snapshot);
        } catch (rollbackError) {
            throw new Error(`A restauração falhou e o rollback do LocalStorage também falhou: ${rollbackError.message}`);
        }
        throw writeError;
    }
    return snapshot;
}

function buildIndexedDbRestoreOperation(plan, backupRecord) {
    const replacements = {};
    const records = [{
        storeName: storeNames.backups,
        value: { ...backupRecord, key: backupBeforeJsonImportStorageKey }
    }];
    if (plan.writeFields.includes("catalogItems")) {
        replacements[storeNames.catalog] = plan.nextState.catalogItems;
        records.push({ storeName: storeNames.appState, value: { key: catalogInitializedKey, value: true } });
    }
    if (plan.writeFields.includes("countingHistory")) replacements[storeNames.countingHistory] = plan.nextState.countingHistory;
    if (plan.writeFields.includes("customUnits")) replacements[storeNames.customUnits] = plan.nextState.customUnits;
    if (plan.writeFields.includes("countTemplates")) replacements[storeNames.countTemplates] = plan.nextState.countTemplates;
    if (plan.writeFields.includes("itemUnitSettings")) {
        records.push({
            storeName: storeNames.appState,
            value: { key: itemUnitSettingsStorageKey, value: plan.nextState.itemUnitSettings }
        });
    }
    return { replacements, records };
}

async function commitBackupRestorePlan(plan, backupRecord) {
    const localWrites = buildLocalRestoreWrites(plan, backupRecord);
    const localSnapshot = applyLocalRestoreWrites(localWrites);
    if (!shouldUseIndexedDB) return;

    try {
        await replaceStoresAtomically(buildIndexedDbRestoreOperation(plan, backupRecord));
    } catch (databaseError) {
        try {
            restoreLocalStorageSnapshot(localSnapshot);
        } catch (rollbackError) {
            throw new Error(`A transação IndexedDB falhou e o espelho local não pôde ser revertido: ${rollbackError.message}`);
        }
        throw databaseError;
    }
}

async function restoreBackupStateSerialized(payload, mode) {
    const [currentState, sessions, entries, rounds] = await Promise.all([
        loadBackupScopedState(),
        listLocationCountSessions(),
        listLocationCountEntries(),
        listCountRounds()
    ]);
    const plan = buildBackupRestorePlan({ payload, currentState, mode });
    if (!plan.isValid) throw new Error(plan.error || "Backup inválido.");
    plan.currentState = currentState;
    assertBackupRestoreSessionsAreSafe(plan, sessions, entries, rounds);

    // O segundo plano fica no limite da escrita e fecha corridas com outros writers da fila.
    const boundaryState = await loadBackupScopedState();
    const boundaryPlan = buildBackupRestorePlan({ payload, currentState: boundaryState, mode });
    if (!boundaryPlan.isValid) throw new Error(boundaryPlan.error || "Backup inválido.");
    boundaryPlan.currentState = boundaryState;
    assertBackupRestoreSessionsAreSafe(
        boundaryPlan,
        await listLocationCountSessions(),
        await listLocationCountEntries(),
        await listCountRounds()
    );
    const backupRecord = createInternalBackupRecord(boundaryState);
    await commitBackupRestorePlan(boundaryPlan, backupRecord);
    return { mode, schemaVersion: boundaryPlan.backup.schemaVersion, state: boundaryPlan.nextState };
}

export async function restoreBackupState(payload, mode) {
    return serializeItemUnitSettingsMutation(() => restoreBackupStateSerialized(payload, mode));
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

async function assertTemplateCanBeMutated(templateId) {
    const normalizedTemplateId = String(templateId || "").trim();
    const isLocked = listActiveCountRounds(await listCountRounds()).some((round) => (
        round.templateId === normalizedTemplateId
    ));
    if (isLocked) {
        throw new Error("Este template pertence a uma contagem em andamento e não pode ser alterado.");
    }
}

export async function saveCountTemplate(template) {
    const normalizedTemplate = normalizeCountTemplate(template);

    if (!normalizedTemplate) {
        throw new Error("Template de contagem inválido.");
    }
    await assertTemplateCanBeMutated(normalizedTemplate.id);

    await runWithFallback(
        () => putInStore(storeNames.countTemplates, normalizedTemplate),
        () => saveLocalCountTemplate(normalizedTemplate)
    );
    saveLocalCountTemplate(normalizedTemplate);

    return normalizedTemplate;
}

async function deleteCountTemplateSerialized(templateId) {
    const normalizedId = String(templateId || "").trim();

    if (!normalizedId) {
        return;
    }
    await assertTemplateCanBeMutated(normalizedId);

    const [settings, links, sessions, entries] = await Promise.all([
        listItemUnitSettings(),
        listItemLocationLinks(),
        listLocationCountSessions(),
        listLocationCountEntries()
    ]);
    if (settings.some((setting) => setting.templateId === normalizedId)) {
        throw new Error("Este template possui perfis explícitos de unidade. Preserve-os ou remova-os de forma consciente antes de excluir o template.");
    }
    if (links.some((link) => link.templateId === normalizedId)) {
        throw new Error("Este template possui vínculos com locais. Remova os vínculos antes de excluir o template.");
    }
    if (sessions.some((session) => session.templateId === normalizedId)) {
        throw new Error("Este template possui sessões de contagem, inclusive históricas. O template deve ser preservado.");
    }
    if (entries.some((entry) => entry.templateId === normalizedId)) {
        throw new Error("Este template possui entradas de contagem associadas. O template deve ser preservado.");
    }

    await runWithFallback(
        () => deleteFromStore(storeNames.countTemplates, normalizedId),
        () => deleteLocalCountTemplate(normalizedId)
    );
    deleteLocalCountTemplate(normalizedId);
}

export async function deleteCountTemplate(templateId) {
    return serializeItemUnitSettingsMutation(() => deleteCountTemplateSerialized(templateId));
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

function collectActiveRoundNodeIds(rounds, nodes) {
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const relatedIds = new Set();

    listActiveCountRounds(rounds).forEach((round) => {
        round.locations.forEach((location) => {
            let currentId = location.locationId;
            while (currentId && !relatedIds.has(currentId)) {
                relatedIds.add(currentId);
                currentId = nodeById.get(currentId)?.parentId || null;
            }
        });
    });
    return relatedIds;
}

async function assertLocationNodeCanBeMutated(nodeId, candidateParentId = null) {
    const [rounds, nodes] = await Promise.all([listCountRounds(), listLocationNodes()]);
    const relatedIds = collectActiveRoundNodeIds(rounds, nodes);
    const existingParentId = nodes.find((node) => node.id === nodeId)?.parentId || null;
    if (relatedIds.has(nodeId) || relatedIds.has(existingParentId) || relatedIds.has(candidateParentId)) {
        throw new Error("A estrutura desta contagem está congelada enquanto a contagem estiver em andamento.");
    }
}

export async function saveLocationNode(node) {
    await assertLocationNodeCanBeMutated(
        String(node?.id || "").trim(),
        String(node?.parentId || "").trim() || null
    );
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

async function deleteLocationNodeSerialized(locationId) {
    const normalizedId = String(locationId || "").trim();

    if (!normalizedId) {
        return;
    }
    await assertLocationNodeCanBeMutated(normalizedId);

    const [existingNodes, links, sessions, entries] = await Promise.all([
        listLocationNodes(),
        listItemLocationLinks(),
        listLocationCountSessions(),
        listLocationCountEntries()
    ]);

    if (existingNodes.some((node) => node.parentId === normalizedId)) {
        throw new Error("Este local possui subdivisões. Remova ou reorganize os locais filhos antes de excluí-lo.");
    }
    if (links.some((link) => link.locationId === normalizedId)) {
        throw new Error("Este local possui vínculos de itens, ativos ou inativos. Remova os vínculos ou desative o local.");
    }
    if (sessions.some((session) => session.locationId === normalizedId)) {
        throw new Error("Este local possui sessões de contagem, inclusive históricas. Desative o local em vez de excluí-lo.");
    }
    if (entries.some((entry) => entry.locationId === normalizedId)) {
        throw new Error("Este local possui entradas de contagem associadas. Desative o local em vez de excluí-lo.");
    }

    await runWithFallback(
        () => deleteFromStore(storeNames.locationNodes, normalizedId),
        () => deleteLocalLocationNode(normalizedId)
    );
    deleteLocalLocationNode(normalizedId);
}

export async function deleteLocationNode(locationId) {
    return serializeItemUnitSettingsMutation(() => deleteLocationNodeSerialized(locationId));
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

async function assertItemLocationTemplatesCanBeMutated(templateIds) {
    const normalizedTemplateIds = new Set(
        [...templateIds].map((templateId) => String(templateId || "").trim()).filter(Boolean)
    );
    const isLocked = listActiveCountRounds(await listCountRounds()).some((round) => (
        normalizedTemplateIds.has(round.templateId)
    ));
    if (isLocked) {
        throw new Error("A estrutura desta contagem está congelada enquanto a contagem estiver em andamento.");
    }
}

async function assertItemLocationTemplateCanBeMutated(templateId) {
    return assertItemLocationTemplatesCanBeMutated([templateId]);
}

export async function saveItemLocationLink(link) {
    const [templates, locations, existingLinks] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks()
    ]);
    const existingLink = existingLinks.find((item) => item.id === String(link?.id || "").trim());
    await assertItemLocationTemplatesCanBeMutated([
        existingLink?.templateId,
        link?.templateId
    ]);
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
    const existingLinksById = new Map(existingLinks.map((link) => [link.id, link]));
    await assertItemLocationTemplatesCanBeMutated(links.flatMap((link) => [
        existingLinksById.get(String(link?.id || "").trim())?.templateId,
        link?.templateId
    ]));
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
    const existingLink = await getItemLocationLink(normalizedId);
    if (existingLink) await assertItemLocationTemplateCanBeMutated(existingLink.templateId);

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

async function assertItemUnitProfilesCanBeMutated(settings) {
    const [sessions, entries, rounds] = await Promise.all([
        listLocationCountSessions(),
        listLocationCountEntries(),
        listCountRounds()
    ]);
    const blockReason = settings.map((setting) => getItemUnitProfileMutationBlockReason({
        templateId: setting.templateId,
        itemCode: setting.itemCode,
        sessions,
        entries,
        rounds
    })).find(Boolean);

    if (blockReason) throw new Error(blockReason.message);
}

async function assertItemUnitProfileCanBeMutated(templateId, itemCode) {
    return assertItemUnitProfilesCanBeMutated([{ templateId, itemCode }]);
}

async function saveItemUnitSettingSerialized(setting) {
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
    await assertItemUnitProfilesCanBeMutated([
        existingSetting,
        validation.setting
    ].filter(Boolean));
    await saveItemUnitSettingsState([...nextSettings, validation.setting]);
    return validation.setting;
}

export async function saveItemUnitSetting(setting) {
    return serializeItemUnitSettingsMutation(() => saveItemUnitSettingSerialized(setting));
}

async function deleteItemUnitSettingSerialized(templateId, itemCode) {
    const normalizedTemplateId = String(templateId || "").trim();
    const normalizedItemCode = String(itemCode || "").trim();
    const remainingSettings = (await listItemUnitSettings()).filter((setting) => !(
        setting.templateId === normalizedTemplateId && setting.itemCode === normalizedItemCode
    ));
    await assertItemUnitProfileCanBeMutated(normalizedTemplateId, normalizedItemCode);
    await saveItemUnitSettingsState(remainingSettings);
}

export async function deleteItemUnitSetting(templateId, itemCode) {
    return serializeItemUnitSettingsMutation(() => deleteItemUnitSettingSerialized(templateId, itemCode));
}

function validateAssistedSuggestionSelection(selectedCandidates, currentCandidates) {
    const selected = Array.isArray(selectedCandidates) ? selectedCandidates : [];
    const selectedCodes = selected.map((setting) => String(setting?.itemCode || "").trim());
    if (selectedCodes.some((itemCode) => !itemCode) || new Set(selectedCodes).size !== selectedCodes.length) {
        throw new Error("O lote de sugestões possui item inválido ou duplicado.");
    }

    const currentByItem = new Map(currentCandidates.map((setting) => [setting.itemCode, setting]));
    const hasChanged = selected.length !== currentCandidates.length || selected.some((setting) => {
        const currentSetting = currentByItem.get(setting.itemCode);
        return !currentSetting || !areItemUnitSettingsSemanticallyEqual(setting, currentSetting);
    });
    if (hasChanged) throw new Error("As sugestões mudaram desde a confirmação. Atualize a tela e tente novamente.");
}

async function loadAssistedSuggestionState(templateId) {
    const [template, currentSettings, sessions, entries] = await Promise.all([
        getCountTemplate(templateId),
        listItemUnitSettings(),
        listLocationCountSessions(),
        listLocationCountEntries()
    ]);
    if (!template) throw new Error("O template selecionado não existe mais.");

    const plan = buildAssistedUnitSuggestionPlan({ template, explicitSettings: currentSettings, previousEntries: entries });
    if (!plan.isValid) throw new Error(plan.error || "Não foi possível validar as sugestões prontas.");
    return { template, currentSettings, sessions, entries, plan };
}

function buildConfirmedSuggestionSettings(candidates, timestamp) {
    return candidates.map((candidate) => {
        const eligibility = validateAssistedUnitSuggestion(candidate);
        if (!eligibility.isEligible) throw new Error(eligibility.error || "Uma sugestão deixou de ser válida.");
        return normalizeItemUnitSettings([{
            ...eligibility.setting,
            source: "manual",
            confidence: "high",
            manualUnit: eligibility.setting.defaultInputUnit,
            createdAt: timestamp,
            updatedAt: timestamp
        }])[0];
    });
}

function assertNoActiveEntriesForCandidates(state) {
    const blockedSetting = state.plan.candidates.find((setting) => hasActiveEntriesForItemInOpenSessions({
        templateId: state.template.id,
        itemCode: setting.itemCode,
        sessions: state.sessions,
        entries: state.entries
    }));
    if (blockedSetting) throw new Error(activeEntryProfileMutationMessage);
}

async function confirmReadyItemUnitSuggestionsSerialized(templateId, selectedCandidates) {
    const initialState = await loadAssistedSuggestionState(templateId);
    validateAssistedSuggestionSelection(selectedCandidates, initialState.plan.candidates);
    assertNoActiveEntriesForCandidates(initialState);

    await assertItemUnitProfilesCanBeMutated(initialState.plan.candidates);

    const writeBoundaryState = await loadAssistedSuggestionState(templateId);
    validateAssistedSuggestionSelection(selectedCandidates, writeBoundaryState.plan.candidates);
    assertNoActiveEntriesForCandidates(writeBoundaryState);

    const timestamp = new Date().toISOString();
    const confirmedSettings = buildConfirmedSuggestionSettings(writeBoundaryState.plan.candidates, timestamp);
    await saveItemUnitSettingsState([...writeBoundaryState.currentSettings, ...confirmedSettings]);
    return { confirmedCount: confirmedSettings.length, settings: confirmedSettings };
}

export async function confirmReadyItemUnitSuggestions(templateId, selectedCandidates = []) {
    if (!Array.isArray(selectedCandidates) || selectedCandidates.length === 0) {
        return { confirmedCount: 0, settings: [] };
    }

    return serializeItemUnitSettingsMutation(
        () => confirmReadyItemUnitSuggestionsSerialized(templateId, selectedCandidates)
    );
}

function createTemplateImportError(plan) {
    const error = new Error(plan.error || "Não foi possível validar o template e seus perfis de unidade.");
    error.importPlan = plan;
    return error;
}

async function importCountTemplateWithUnitProfilesSerialized(payload, metadata) {
    const templateId = String(payload?.id || "").trim();
    const [existingTemplate, currentSettings, sessions, entries] = await Promise.all([
        getCountTemplate(templateId),
        listItemUnitSettings(),
        listLocationCountSessions(),
        listLocationCountEntries()
    ]);
    const plan = buildUnitProfileTemplateImportPlan({
        payload,
        localSettings: currentSettings,
        existingTemplate,
        sessions,
        entries
    });

    if (!plan.isValid) throw createTemplateImportError(plan);

    // A consulta é repetida no limite de escrita para não abrir um atalho ao redor da guarda existente.
    for (const setting of plan.settingsToApply) {
        await assertItemUnitProfileCanBeMutated(setting.templateId, setting.itemCode);
    }

    const nextSettings = mergeImportedItemUnitSettings(currentSettings, plan.settingsToApply);
    const importedTemplate = {
        ...plan.template,
        importedAt: metadata.importedAt || new Date().toISOString(),
        importFileName: String(metadata.importFileName || "").trim()
    };
    let settingsWereSaved = false;

    try {
        if (plan.settingsToApply.length > 0) {
            await saveItemUnitSettingsState(nextSettings);
            settingsWereSaved = true;
        }
        const savedTemplate = await saveCountTemplate(importedTemplate);
        return { ...plan, template: savedTemplate };
    } catch (error) {
        // O rollback preserva o estado anterior se a segunda persistência falhar tecnicamente.
        if (settingsWereSaved) await saveItemUnitSettingsState(currentSettings);
        throw error;
    }
}

export async function importCountTemplateWithUnitProfiles(payload, metadata = {}) {
    return serializeItemUnitSettingsMutation(
        () => importCountTemplateWithUnitProfilesSerialized(payload, metadata)
    );
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
    const buildNextSnapshots = ({ rounds, snapshots }) => {
        const normalizedRounds = assertValidCountRoundCollection(rounds);
        const isReferenced = normalizedRounds.some((round) => (
            round.status === "completed" && round.completion?.snapshotId === normalizedId
        ));
        if (isReferenced) {
            throw new CountRoundFinalizationError(
                "Este fechamento pertence a uma rodada concluída e não pode ser removido.",
                "referenced-final-snapshot"
            );
        }
        return sortConsolidationSnapshots(snapshots).filter((snapshot) => snapshot.id !== normalizedId);
    };
    const deleteLocal = () => {
        const nextSnapshots = buildNextSnapshots({
            rounds: loadLocalCountRounds(),
            snapshots: loadLocalConsolidationSnapshots()
        });
        return saveLocalConsolidationSnapshots(nextSnapshots);
    };

    if (!shouldUseIndexedDB) {
        deleteLocal();
        return;
    }
    try {
        const nextSnapshots = await deleteConsolidationSnapshotAtomically({
            snapshotId: normalizedId,
            snapshotsKey: consolidationSnapshotsStorageKey,
            buildNextSnapshots
        });
        try {
            saveLocalConsolidationSnapshots(nextSnapshots);
        } catch (mirrorError) {
            console.warn("O snapshot foi removido do IndexedDB, mas o espelho local não pôde ser atualizado.", mirrorError);
        }
    } catch (error) {
        if (isCountRoundBusinessError(error)) throw error;
        setCountRoundFallbackWarning(error);
        deleteLocal();
    }
}

function classifyFinalizationSessions(snapshot, sessions) {
    const includedIds = [...new Set(snapshot.sessionsIncluded.map((session) => session.id).filter(Boolean))];
    const sessionsById = new Map(sessions.map((session) => [session.id, session]));
    const matched = includedIds.map((sessionId) => sessionsById.get(sessionId)).filter(Boolean);
    return {
        missingSessionIds: includedIds.filter((sessionId) => !sessionsById.has(sessionId)),
        canceledSessions: matched.filter((session) => session.status === "canceled"),
        completedSessions: matched.filter((session) => session.status === "completed"),
        openSessions: matched.filter((session) => ["draft", "in_progress"].includes(session.status)),
        unsupportedSessions: matched.filter((session) => !LOCATION_COUNT_SESSION_STATUSES.includes(session.status)),
        matchedCount: matched.length
    };
}

function buildFinalizationWarnings(classification) {
    const warnings = [];
    if (classification.missingSessionIds.length) {
        warnings.push(`${classification.missingSessionIds.length} sessão(ões) incluída(s) não foi(ram) encontrada(s).`);
    }
    if (classification.canceledSessions.length) {
        warnings.push(`${classification.canceledSessions.length} sessão(ões) cancelada(s) foi(ram) preservada(s).`);
    }
    if (classification.unsupportedSessions.length) {
        warnings.push(`${classification.unsupportedSessions.length} sessão(ões) com status desconhecido foi(ram) preservada(s).`);
    }
    return warnings;
}

async function completeSnapshotOpenSessions(openSessions, timestamp) {
    const completed = [];
    for (const session of openSessions) {
        completed.push(await completeLocationCountSession(session.id, timestamp));
    }
    return completed;
}

export async function finalizeConsolidationSnapshot(snapshotId, options = {}) {
    const snapshot = await getConsolidationSnapshot(snapshotId);
    if (!snapshot) throw new Error("Fechamento não encontrado neste aparelho.");
    if (snapshot.status === "invalid") throw new Error("Um fechamento inválido não pode ser finalizado.");
    if (snapshot.finalizedAt) return { snapshot, wasAlreadyFinalized: true, warnings: [] };
    const [sessions, rounds] = await Promise.all([
        listLocationCountSessions(),
        listCountRounds()
    ]);
    const classification = classifyFinalizationSessions(snapshot, sessions);
    if (classification.matchedCount === 0) {
        throw new Error("Nenhuma sessão incluída neste fechamento foi encontrada. A finalização foi cancelada.");
    }
    assertSessionsNotLinkedToActiveRound(classification.openSessions, rounds);
    const timestamp = new Date().toISOString();
    const completed = await completeSnapshotOpenSessions(classification.openSessions, timestamp);
    const finalizedSessionIds = [
        ...classification.completedSessions.map((session) => session.id),
        ...completed.map((session) => session.id)
    ];
    const warnings = buildFinalizationWarnings(classification);
    const notes = [String(options.finalizationNotes || "").trim(), ...warnings].filter(Boolean).join(" ");
    const finalizedSnapshot = markConsolidationSnapshotFinalized(snapshot, {
        finalizedAt: timestamp,
        finalizedBy: options.finalizedBy || "local-user",
        finalizedSessionIds,
        finalizationNotes: notes,
        hasWarnings: warnings.length > 0
    });
    return {
        snapshot: await saveConsolidationSnapshot(finalizedSnapshot),
        completedSessions: completed,
        wasAlreadyFinalized: false,
        warnings
    };
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

function setCountRoundFallbackWarning(error) {
    shouldUseIndexedDB = false;
    storageWarning = "O armazenamento principal falhou. As rodadas continuarão no modo alternativo deste navegador.";
    console.warn(storageWarning, error);
}

function isCountRoundBusinessError(error) {
    return error instanceof CountRoundError
        || error instanceof CountRoundFinalizationError
        || error?.name === "ConstraintError";
}

async function runCountRoundReadWithFallback(databaseOperation, fallbackOperation) {
    if (!shouldUseIndexedDB) return fallbackOperation();

    try {
        return await databaseOperation();
    } catch (error) {
        if (isCountRoundBusinessError(error)) throw error;
        setCountRoundFallbackWarning(error);
        return fallbackOperation();
    }
}

function findTemplateRecord(templates, templateId) {
    return templates.find((template) => String(template?.id || "").trim() === templateId) || null;
}

function createCountRoundFromCollections(templateId, collections) {
    return createCountRoundModel({
        template: findTemplateRecord(collections.countTemplates || [], templateId),
        nodes: collections.locationNodes || [],
        links: collections.itemLocationLinks || [],
        sessions: collections.locationCountSessions || [],
        rounds: collections.countRounds || []
    });
}

async function startIndexedDBCountRound(templateId) {
    const sourceStoreNames = [
        storeNames.countTemplates,
        storeNames.locationNodes,
        storeNames.itemLocationLinks,
        storeNames.locationCountSessions,
        storeNames.countRounds
    ];

    return addRecordFromStoreSnapshot({
        sourceStoreNames,
        targetStoreName: storeNames.countRounds,
        buildRecord: (recordsByStore) => createCountRoundFromCollections(templateId, recordsByStore)
    });
}

function startLocalCountRound(templateId) {
    const round = createCountRoundFromCollections(templateId, {
        countTemplates: loadLocalCountTemplates(),
        locationNodes: loadLocalLocationNodes(),
        itemLocationLinks: loadLocalItemLocationLinks(),
        locationCountSessions: loadLocalLocationCountSessions(),
        countRounds: loadLocalCountRounds()
    });

    return saveLocalCountRound(round);
}

async function startCountRoundSerialized(templateId) {
    const normalizedTemplateId = String(templateId || "").trim();
    if (!normalizedTemplateId) throw new CountRoundError("Selecione um template para iniciar a rodada.");
    if (!shouldUseIndexedDB) return startLocalCountRound(normalizedTemplateId);

    try {
        const round = await startIndexedDBCountRound(normalizedTemplateId);
        try {
            saveLocalCountRound(round);
        } catch (mirrorError) {
            console.warn("A rodada foi salva no IndexedDB, mas o espelho local não pôde ser atualizado.", mirrorError);
        }
        return round;
    } catch (error) {
        if (error?.name === "ConstraintError") {
            throw new CountRoundError("Já existe uma rodada ativa para este template.", "active-round-exists");
        }
        if (error instanceof CountRoundError) throw error;
        setCountRoundFallbackWarning(error);
        return startLocalCountRound(normalizedTemplateId);
    }
}

export async function listCountRounds() {
    return runCountRoundReadWithFallback(
        async () => sortCountRounds(await getAllFromStore(storeNames.countRounds)),
        loadLocalCountRounds
    );
}

export async function getCountRound(roundId) {
    const normalizedRoundId = String(roundId || "").trim();
    if (!normalizedRoundId) return null;
    return (await listCountRounds()).find((round) => round.id === normalizedRoundId) || null;
}

export async function getActiveCountRound(templateId) {
    const normalizedTemplateId = String(templateId || "").trim();
    if (!normalizedTemplateId) return null;
    return (await listCountRounds()).find((round) => (
        round.status === "active" && round.templateId === normalizedTemplateId
    )) || null;
}

function listActiveCountRounds(rounds) {
    return assertValidCountRoundCollection(rounds).filter((round) => round.status === "active");
}

function findActiveRoundLocationBySessionId(rounds, sessionId) {
    for (const round of listActiveCountRounds(rounds)) {
        const location = round.locations.find((item) => item.sessionId === sessionId);
        if (location) return { round, location };
    }
    return null;
}

function assertStandaloneSessionCreationAllowed(session, rounds) {
    const activeRound = listActiveCountRounds(rounds).find((round) => (
        round.templateId === session.templateId
        && round.locations.some((location) => location.locationId === session.locationId)
    ));
    if (activeRound) {
        throw new Error("Este local faz parte de uma contagem em andamento. Abra-o pela jornada da rodada.");
    }
}

function assertLinkedSessionMutationAllowed(existingSession, nextSession, rounds) {
    if (!existingSession) return;
    const reference = findActiveRoundLocationBySessionId(rounds, existingSession.id);
    if (!reference) return;
    if (!["draft", "in_progress"].includes(nextSession.status)) {
        throw new Error("Esta sessão pertence a uma contagem em andamento e só pode ser encerrada na finalização global.");
    }
}

function assertSessionsNotLinkedToActiveRound(sessions, rounds) {
    const linkedSession = sessions.find((session) => (
        findActiveRoundLocationBySessionId(rounds, session.id)
    ));
    if (linkedSession) {
        throw new Error("Este fechamento inclui uma sessão de uma contagem em andamento. Finalize a rodada pelo fluxo global.");
    }
}

export async function startCountRound(templateId) {
    return serializeCountRoundMutation(() => startCountRoundSerialized(templateId));
}

function openLocalCountRoundLocationSession(roundId, locationId) {
    const round = loadLocalCountRounds().find((item) => item.id === roundId) || null;
    const mappedSessionId = round?.locations.find((item) => item.locationId === locationId)?.sessionId;
    const existingSession = mappedSessionId
        ? loadLocalLocationCountSessions().find((session) => session.id === mappedSessionId) || null
        : null;
    const mutation = buildCountRoundLocationSessionMutation({ round, locationId, existingSession });

    if (mutation.created) commitLocalRoundSessionPair(mutation.round, mutation.session);
    return mutation;
}

async function openIndexedDBCountRoundLocationSession(roundId, locationId) {
    return mutateCountRoundLocationSession({
        roundId,
        locationId,
        buildMutation: ({ round, existingSession }) => buildCountRoundLocationSessionMutation({
            round,
            locationId,
            existingSession
        })
    });
}

async function openOrCreateCountRoundLocationSessionSerialized({ roundId, locationId } = {}) {
    const normalizedRoundId = String(roundId || "").trim();
    const normalizedLocationId = String(locationId || "").trim();
    if (!normalizedRoundId || !normalizedLocationId) {
        throw new CountRoundError("Informe a rodada e o local para continuar a contagem.");
    }
    if (!shouldUseIndexedDB) {
        return openLocalCountRoundLocationSession(normalizedRoundId, normalizedLocationId);
    }

    try {
        const mutation = await openIndexedDBCountRoundLocationSession(normalizedRoundId, normalizedLocationId);
        try {
            commitLocalRoundSessionPair(mutation.round, mutation.session);
        } catch (mirrorError) {
            console.warn("A sessão foi vinculada no IndexedDB, mas o espelho local não pôde ser atualizado.", mirrorError);
        }
        return mutation;
    } catch (error) {
        if (isCountRoundBusinessError(error)) throw error;
        setCountRoundFallbackWarning(error);
        return openLocalCountRoundLocationSession(normalizedRoundId, normalizedLocationId);
    }
}

export async function openOrCreateCountRoundLocationSession(request) {
    return serializeCountRoundMutation(() => openOrCreateCountRoundLocationSessionSerialized(request));
}

function buildLocalCountRoundFinalizationPlan(roundId) {
    const round = loadLocalCountRounds().find((item) => item.id === roundId) || null;
    const template = loadLocalCountTemplates().find((item) => item.id === round?.templateId) || null;
    return buildCountRoundFinalizationPlan({
        round,
        template,
        sessions: loadLocalLocationCountSessions(),
        entries: loadLocalLocationCountEntries(),
        unitSettings: loadLocalItemUnitSettings(),
        snapshots: loadLocalConsolidationSnapshots()
    });
}

function finalizeLocalCountRound(roundId) {
    const plan = buildLocalCountRoundFinalizationPlan(roundId);
    if (plan.changed) commitLocalCountRoundFinalization(plan);
    return plan;
}

function finalizeIndexedDBCountRound(roundId) {
    return finalizeCountRoundAtomically({
        roundId,
        itemUnitSettingsKey: itemUnitSettingsStorageKey,
        snapshotsKey: consolidationSnapshotsStorageKey,
        buildPlan: buildCountRoundFinalizationPlan
    });
}

async function finalizeCountRoundSerialized(roundId) {
    const normalizedRoundId = String(roundId || "").trim();
    if (!normalizedRoundId) throw new CountRoundFinalizationError("Informe a rodada que será finalizada.");
    if (!shouldUseIndexedDB) return finalizeLocalCountRound(normalizedRoundId);

    try {
        const plan = await finalizeIndexedDBCountRound(normalizedRoundId);
        try {
            commitLocalCountRoundFinalization(plan);
        } catch (mirrorError) {
            storageWarning = "A contagem foi finalizada no IndexedDB, mas o espelho local não pôde ser atualizado.";
            console.warn(storageWarning, mirrorError);
        }
        return plan;
    } catch (error) {
        if (isCountRoundBusinessError(error)) throw error;
        setCountRoundFallbackWarning(error);
        return finalizeLocalCountRound(normalizedRoundId);
    }
}

export async function finalizeCountRound(roundId) {
    return serializeItemUnitSettingsMutation(
        () => serializeCountRoundMutation(() => finalizeCountRoundSerialized(roundId))
    );
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
    if (!existingSession && nextSession.status !== "draft") {
        throw new Error("Uma nova sessão precisa começar como rascunho.");
    }

    if (existingSession?.status === "canceled" && nextSession.status !== "canceled") {
        throw new Error("Uma sessão cancelada não pode voltar para rascunho.");
    }

    if (existingSession?.status === "completed" && nextSession.status !== "completed") {
        throw new Error("Uma sessão finalizada não pode ser reaberta.");
    }

    if (existingSession?.status === "draft"
        && !["draft", "in_progress", "completed", "canceled"].includes(nextSession.status)) {
        throw new Error("A transição do rascunho é inválida.");
    }

    if (existingSession?.status === "in_progress"
        && !["in_progress", "completed"].includes(nextSession.status)) {
        throw new Error("Uma sessão em andamento só pode continuar ou ser finalizada.");
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
    const [templates, locations, links, sessions, rounds] = await Promise.all([
        listCountTemplates(),
        listLocationNodes(),
        listItemLocationLinks(),
        listLocationCountSessions(),
        listCountRounds()
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
    if (existingSession) assertLinkedSessionMutationAllowed(existingSession, candidate, rounds);
    else assertStandaloneSessionCreationAllowed(candidate, rounds);
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

export async function completeLocationCountSession(sessionId, finishedAt = new Date().toISOString()) {
    const session = await getLocationCountSession(sessionId);
    if (!session) throw new Error("Sessão de contagem não encontrada.");
    if (session.status === "completed") return session;
    if (!["draft", "in_progress"].includes(session.status)) {
        throw new Error("Somente uma sessão aberta pode ser finalizada.");
    }
    return saveLocationCountSession({
        ...session,
        status: "completed",
        finishedAt
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

async function deleteLocationCountSessionSerialized(sessionId) {
    const normalizedId = String(sessionId || "").trim();

    if (!normalizedId) {
        return;
    }

    const session = await getLocationCountSession(normalizedId);
    if (!session) return;
    const rounds = await listCountRounds();
    if (findActiveRoundLocationBySessionId(rounds, session.id)) {
        throw new Error("Esta sessão pertence a uma contagem em andamento e não pode ser removida.");
    }
    if (!["draft", "canceled"].includes(session.status)) {
        throw new Error("Somente sessões em rascunho ou canceladas podem ser removidas permanentemente.");
    }

    const relatedEntries = await listEntriesBySession(normalizedId);
    if (relatedEntries.length > 0) {
        throw new Error("Esta sessão possui entradas de contagem preservadas e não pode ser removida permanentemente.");
    }

    await runWithFallback(
        () => deleteFromStore(storeNames.locationCountSessions, normalizedId),
        () => deleteLocalLocationCountSession(normalizedId)
    );
    deleteLocalLocationCountSession(normalizedId);
}

export async function deleteLocationCountSession(sessionId) {
    return serializeItemUnitSettingsMutation(() => deleteLocationCountSessionSerialized(sessionId));
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

async function applyControlledUnitToActiveEntry(entry) {
    if (!entry.active) return entry;

    const explicitSetting = await getItemUnitSetting(entry.templateId, entry.itemCode);
    if (!explicitSetting) {
        throw new Error("Este item não possui um perfil explícito de unidades. Corrija o perfil antes de lançar.");
    }

    const profileValidation = validateControlledItemUnitProfile(explicitSetting);
    if (!profileValidation.isValid) {
        throw new Error("O perfil de unidades deste item precisa ser corrigido antes da contagem.");
    }

    const unitValidation = resolveAllowedUnitForNewEntry(profileValidation.profile, entry.rawUnit);
    if (!unitValidation.isValid) throw new Error(unitValidation.error);

    const canonicalValidation = validateLocationCountEntry({
        ...entry,
        rawUnit: unitValidation.allowedUnit.label
    });
    if (!canonicalValidation.isValid) {
        throw new Error(canonicalValidation.error || "A entrada canônica de contagem é inválida.");
    }

    // Revalidar evita persistir normalizedUnit calculada a partir de um alias anterior.
    return canonicalValidation.entry;
}

async function saveLocationCountEntrySerialized(entry) {
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
    const controlledEntry = await applyControlledUnitToActiveEntry(validation.entry);
    await runWithFallback(
        () => putInStore(storeNames.locationCountEntries, controlledEntry),
        () => saveLocalLocationCountEntry(controlledEntry)
    );
    saveLocalLocationCountEntry(controlledEntry);
    return controlledEntry;
}

export async function saveLocationCountEntry(entry) {
    // A mesma fila fecha a corrida entre criar uma entrada e remover ou alterar seu perfil explícito.
    return serializeItemUnitSettingsMutation(() => saveLocationCountEntrySerialized(entry));
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
