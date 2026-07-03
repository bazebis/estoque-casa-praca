import { convertToBase, getUnitById, normalizeUnitId } from "./units.js";

function createEntryId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `entry_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function sortActiveItems(items) {
    return items
        .filter((item) => item.active !== false)
        .sort((firstItem, secondItem) => firstItem.order - secondItem.order);
}

function createEmptySession(items) {
    return {
        version: 1,
        items: sortActiveItems(items),
        currentIndex: 0,
        entriesByItemId: {}
    };
}

function isValidSession(draft) {
    return Boolean(
        draft &&
        Array.isArray(draft.items) &&
        Number.isInteger(draft.currentIndex) &&
        draft.entriesByItemId &&
        typeof draft.entriesByItemId === "object"
    );
}

function clampIndex(index, items) {
    if (items.length === 0) {
        return 0;
    }

    return Math.min(Math.max(index, 0), items.length - 1);
}

function cloneSession(session) {
    return JSON.parse(JSON.stringify(session));
}

function getEntriesForItem(session, itemId) {
    const entries = session.entriesByItemId[itemId];

    return Array.isArray(entries) ? entries : [];
}

function calculateItemTotal(entries) {
    return entries.reduce((total, entry) => total + convertToBase(entry.quantity, entry.unitId), 0);
}

function summarizeItem(item, entries) {
    const unit = getUnitById(item.unitId);
    const totalBase = calculateItemTotal(entries);

    return {
        item,
        entries,
        totalBase,
        baseUnit: unit.baseUnit
    };
}

function normalizeSessionItem(item, index) {
    const name = String(item.name || item.nome || "").trim();

    return {
        id: item.id || `draft_item_${index}`,
        name,
        unitId: normalizeUnitId(item.unitId || item.unidade),
        active: item.active !== false,
        order: Number.isInteger(item.order) ? item.order : index
    };
}

function normalizeSessionEntry(entry) {
    const quantity = Number(entry.quantity ?? entry.qtd);

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
    }

    return {
        id: entry.id || createEntryId(),
        quantity,
        unitId: normalizeUnitId(entry.unitId || entry.unidade),
        createdAt: entry.createdAt || new Date().toISOString()
    };
}

function sanitizeSession(draft) {
    if (!isValidSession(draft)) {
        return null;
    }

    const items = sortActiveItems(draft.items.map(normalizeSessionItem).filter((item) => item.name));
    const entriesByItemId = {};

    items.forEach((item) => {
        entriesByItemId[item.id] = getEntriesForItem(draft, item.id)
            .map(normalizeSessionEntry)
            .filter(Boolean);
    });

    return {
        version: 1,
        items,
        currentIndex: clampIndex(draft.currentIndex, items),
        entriesByItemId
    };
}

export function createCounting(getCatalogItems, initialDraft = null) {
    let session = sanitizeSession(initialDraft);

    function hasSession() {
        return Boolean(session);
    }

    function getDraft() {
        return session ? cloneSession(session) : null;
    }

    function startCounting() {
        session = createEmptySession(getCatalogItems());
        return getViewModel();
    }

    function getCurrentItem() {
        return session?.items[session.currentIndex] || null;
    }

    function getViewModel() {
        if (!session) {
            return null;
        }

        const currentItem = getCurrentItem();
        const entries = currentItem ? getEntriesForItem(session, currentItem.id) : [];
        const summary = currentItem ? summarizeItem(currentItem, entries) : null;

        return {
            currentItem,
            currentIndex: session.currentIndex,
            totalItems: session.items.length,
            entries,
            totalBase: summary?.totalBase || 0,
            baseUnit: summary?.baseUnit || "",
            defaultUnitId: currentItem?.unitId || "un"
        };
    }

    function addEntry(quantity, unitId) {
        const currentItem = getCurrentItem();
        const numericQuantity = Number(quantity);

        if (!currentItem || !unitId || !Number.isFinite(numericQuantity) || numericQuantity <= 0) {
            return false;
        }

        const entries = getEntriesForItem(session, currentItem.id);
        session.entriesByItemId[currentItem.id] = [
            ...entries,
            {
                id: createEntryId(),
                quantity: numericQuantity,
                unitId,
                createdAt: new Date().toISOString()
            }
        ];

        return true;
    }

    function removeEntry(entryId) {
        const currentItem = getCurrentItem();

        if (!currentItem) {
            return;
        }

        session.entriesByItemId[currentItem.id] = getEntriesForItem(session, currentItem.id)
            .filter((entry) => entry.id !== entryId);
    }

    function goToPreviousItem() {
        if (!session || session.currentIndex === 0) {
            return getViewModel();
        }

        session.currentIndex--;
        return getViewModel();
    }

    function goToNextItem() {
        if (!session || session.currentIndex >= session.items.length - 1) {
            return getViewModel();
        }

        session.currentIndex++;
        return getViewModel();
    }

    function finishCounting() {
        if (!session) {
            return [];
        }

        return session.items
            .map((item) => summarizeItem(item, getEntriesForItem(session, item.id)));
    }

    function clearSession() {
        session = null;
    }

    return {
        hasSession,
        getDraft,
        getViewModel,
        startCounting,
        addEntry,
        removeEntry,
        goToPreviousItem,
        goToNextItem,
        finishCounting,
        clearSession
    };
}
