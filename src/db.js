const databaseName = "estoqueCasaPracaDB";
const databaseVersion = 7;

const storeNames = {
    appState: "appState",
    catalog: "catalog",
    customUnits: "customUnits",
    countingDraft: "countingDraft",
    countingHistory: "countingHistory",
    backups: "backups",
    countTemplates: "countTemplates",
    locationNodes: "locationNodes",
    itemLocationLinks: "itemLocationLinks",
    locationCountSessions: "locationCountSessions",
    locationCountEntries: "locationCountEntries",
    countRounds: "countRounds"
};

const storeKeyFields = {
    [storeNames.appState]: "key",
    [storeNames.catalog]: "id",
    [storeNames.customUnits]: "id",
    [storeNames.countingDraft]: "key",
    [storeNames.countingHistory]: "id",
    [storeNames.backups]: "key",
    [storeNames.countTemplates]: "id",
    [storeNames.locationNodes]: "id",
    [storeNames.itemLocationLinks]: "id",
    [storeNames.locationCountSessions]: "id",
    [storeNames.locationCountEntries]: "id",
    [storeNames.countRounds]: "id"
};

let databasePromise = null;

function createRequestPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function createStore(database, storeName, options, transaction = null) {
    if (database.objectStoreNames.contains(storeName)) {
        return transaction?.objectStore(storeName) || null;
    }

    return database.createObjectStore(storeName, options);
}

function ensureCountRoundsIndex(store) {
    if (store && !store.indexNames.contains("activeTemplateId")) {
        store.createIndex("activeTemplateId", "activeTemplateId", { unique: true });
    }
}

function runStoreOperation(storeName, mode, operation) {
    return openDatabase().then((database) => (
        new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, mode);
            const store = transaction.objectStore(storeName);
            let operationResult;

            transaction.oncomplete = () => resolve(operationResult);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);

            operationResult = operation(store);
        })
    ));
}

function runMultiStoreOperation(selectedStoreNames, operation) {
    const uniqueStoreNames = [...new Set(selectedStoreNames)];

    return openDatabase().then((database) => (
        new Promise((resolve, reject) => {
            const transaction = database.transaction(uniqueStoreNames, "readwrite");
            const stores = Object.fromEntries(uniqueStoreNames.map((storeName) => (
                [storeName, transaction.objectStore(storeName)]
            )));

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error("Transação cancelada."));
            try {
                operation(stores);
            } catch (error) {
                transaction.abort();
                reject(error);
            }
        })
    ));
}

export function isIndexedDBAvailable() {
    return Boolean(globalThis.indexedDB);
}

export function openDatabase() {
    if (!isIndexedDBAvailable()) {
        return Promise.reject(new Error("IndexedDB indisponível."));
    }

    if (databasePromise) {
        return databasePromise;
    }

    databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion);

        request.onupgradeneeded = () => {
            const database = request.result;
            const transaction = request.transaction;

            createStore(database, storeNames.appState, { keyPath: "key" });
            createStore(database, storeNames.catalog, { keyPath: "id" });
            createStore(database, storeNames.customUnits, { keyPath: "id" });
            createStore(database, storeNames.countingDraft, { keyPath: "key" });
            createStore(database, storeNames.countingHistory, { keyPath: "id" });
            createStore(database, storeNames.backups, { keyPath: "key" });
            createStore(database, storeNames.countTemplates, { keyPath: "id" });
            createStore(database, storeNames.locationNodes, { keyPath: "id" });
            createStore(database, storeNames.itemLocationLinks, { keyPath: "id" });
            createStore(database, storeNames.locationCountSessions, { keyPath: "id" });
            createStore(database, storeNames.locationCountEntries, { keyPath: "id" });
            const countRoundsStore = createStore(
                database,
                storeNames.countRounds,
                { keyPath: "id" },
                transaction
            );
            ensureCountRoundsIndex(countRoundsStore);
        };

        request.onsuccess = () => resolve(request.result);
        request.onerror = () => {
            databasePromise = null;
            reject(request.error);
        };
    });

    return databasePromise;
}

export function getAllFromStore(storeName) {
    return runStoreOperation(storeName, "readonly", (store) => createRequestPromise(store.getAll()));
}

export function getFromStore(storeName, key) {
    return runStoreOperation(storeName, "readonly", (store) => createRequestPromise(store.get(key)));
}

export function putInStore(storeName, value, key = null) {
    return runStoreOperation(storeName, "readwrite", (store) => {
        const keyField = storeKeyFields[storeName];
        const valueToSave = key && keyField
            ? { ...value, [keyField]: key }
            : value;

        return createRequestPromise(store.put(valueToSave));
    });
}

export function deleteFromStore(storeName, key) {
    return runStoreOperation(storeName, "readwrite", (store) => createRequestPromise(store.delete(key)));
}

export function clearStore(storeName) {
    return runStoreOperation(storeName, "readwrite", (store) => createRequestPromise(store.clear()));
}

export async function bulkPut(storeName, values) {
    const safeValues = Array.isArray(values) ? values : [];

    await runStoreOperation(storeName, "readwrite", (store) => {
        safeValues.forEach((value) => {
            store.put(value);
        });
    });
}

export async function replaceStore(storeName, values) {
    const safeValues = Array.isArray(values) ? values : [];

    await runStoreOperation(storeName, "readwrite", (store) => {
        const clearRequest = store.clear();

        clearRequest.onsuccess = () => {
            safeValues.forEach((value) => {
                store.put(value);
            });
        };
    });
}

export async function replaceStoresAtomically({ replacements = {}, records = [] } = {}) {
    const selectedStoreNames = [...Object.keys(replacements), ...records.map((record) => record.storeName)];

    if (selectedStoreNames.length === 0) {
        return;
    }

    await runMultiStoreOperation(selectedStoreNames, (stores) => {
        Object.entries(replacements).forEach(([storeName, values]) => {
            const store = stores[storeName];
            store.clear();
            (Array.isArray(values) ? values : []).forEach((value) => store.put(value));
        });
        records.forEach((record) => stores[record.storeName].put(record.value));
    });
}

export function addRecordFromStoreSnapshot({ sourceStoreNames = [], targetStoreName, buildRecord }) {
    const selectedStoreNames = [...new Set([...sourceStoreNames, targetStoreName])];

    return openDatabase().then((database) => (
        new Promise((resolve, reject) => {
            const transaction = database.transaction(selectedStoreNames, "readwrite");
            const stores = Object.fromEntries(selectedStoreNames.map((storeName) => (
                [storeName, transaction.objectStore(storeName)]
            )));
            let createdRecord;

            transaction.oncomplete = () => resolve(createdRecord);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error("Transação cancelada."));

            Promise.all(sourceStoreNames.map(async (storeName) => (
                [storeName, await createRequestPromise(stores[storeName].getAll())]
            ))).then((recordEntries) => {
                createdRecord = buildRecord(Object.fromEntries(recordEntries));
                stores[targetStoreName].add(createdRecord);
            }).catch((error) => {
                transaction.abort();
                reject(error);
            });
        })
    ));
}

export { storeNames };
