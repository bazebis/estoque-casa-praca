const databaseName = "estoqueCasaPracaDB";
const databaseVersion = 4;

const storeNames = {
    appState: "appState",
    catalog: "catalog",
    customUnits: "customUnits",
    countingDraft: "countingDraft",
    countingHistory: "countingHistory",
    backups: "backups",
    countTemplates: "countTemplates",
    locationNodes: "locationNodes",
    itemLocationLinks: "itemLocationLinks"
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
    [storeNames.itemLocationLinks]: "id"
};

let databasePromise = null;

function createRequestPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function createStore(database, storeName, options) {
    if (database.objectStoreNames.contains(storeName)) {
        return;
    }

    database.createObjectStore(storeName, options);
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

            createStore(database, storeNames.appState, { keyPath: "key" });
            createStore(database, storeNames.catalog, { keyPath: "id" });
            createStore(database, storeNames.customUnits, { keyPath: "id" });
            createStore(database, storeNames.countingDraft, { keyPath: "key" });
            createStore(database, storeNames.countingHistory, { keyPath: "id" });
            createStore(database, storeNames.backups, { keyPath: "key" });
            createStore(database, storeNames.countTemplates, { keyPath: "id" });
            createStore(database, storeNames.locationNodes, { keyPath: "id" });
            createStore(database, storeNames.itemLocationLinks, { keyPath: "id" });
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

export { storeNames };
