import { convertToBase, createUnitSnapshot, getUnitById, normalizeUnitId, resolveUnitSnapshot } from "./units.js";

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
    const createdAt = new Date().toISOString();

    return {
        version: 1,
        status: "em_andamento",
        startedAt: createdAt,
        updatedAt: createdAt,
        items: sortActiveItems(items),
        currentIndex: 0,
        entriesByItemId: {}
    };
}

function isValidSession(draft) {
    return Boolean(
        draft &&
        draft.status !== "finalizada" &&
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
    return entries.reduce((total, entry) => (
        total + convertToBase(entry.quantity, entry.unitId, entry.unitSnapshot)
    ), 0);
}

function getTimestampOrNow(value) {
    const timestamp = new Date(value);

    if (Number.isNaN(timestamp.getTime())) {
        return new Date().toISOString();
    }

    return timestamp.toISOString();
}

function summarizeItem(item, entries) {
    const unit = entries[0]?.unitSnapshot
        ? resolveUnitSnapshot(entries[0].unitId, entries[0].unitSnapshot)
        : getUnitById(item.unitId);
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
    const rawUnit = entry.unitId || entry.unidade || entry.unitSnapshot?.unitId;

    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
    }

    return {
        id: entry.id || createEntryId(),
        quantity,
        unitId: normalizeUnitId(rawUnit),
        unitSnapshot: entry.unitSnapshot
            ? resolveUnitSnapshot(rawUnit, entry.unitSnapshot)
            : null,
        createdAt: entry.createdAt || new Date().toISOString()
    };
}

function sanitizeSession(draft) {
    if (!isValidSession(draft)) {
        return null;
    }

    const items = sortActiveItems(draft.items.map(normalizeSessionItem).filter((item) => item.name));
    const entriesByItemId = {};
    const startedAt = getTimestampOrNow(draft.startedAt);

    items.forEach((item) => {
        entriesByItemId[item.id] = getEntriesForItem(draft, item.id)
            .map(normalizeSessionEntry)
            .filter(Boolean);
    });

    return {
        version: 1,
        status: "em_andamento",
        startedAt,
        updatedAt: getTimestampOrNow(draft.updatedAt || startedAt),
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

    function touchSession() {
        if (!session) {
            return;
        }

        session.updatedAt = new Date().toISOString();
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
                unitSnapshot: createUnitSnapshot(unitId),
                createdAt: new Date().toISOString()
            }
        ];
        touchSession();

        return true;
    }

    function removeEntry(entryId) {
        const currentItem = getCurrentItem();

        if (!currentItem) {
            return;
        }

        session.entriesByItemId[currentItem.id] = getEntriesForItem(session, currentItem.id)
            .filter((entry) => entry.id !== entryId);
        touchSession();
    }

    function goToPreviousItem() {
        if (!session || session.currentIndex === 0) {
            return getViewModel();
        }

        session.currentIndex--;
        touchSession();
        return getViewModel();
    }

    function goToNextItem() {
        if (!session || session.currentIndex >= session.items.length - 1) {
            return getViewModel();
        }

        session.currentIndex++;
        touchSession();
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
