import { normalizeUnitId } from "./units.js";

function createItemId(name) {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    const safeName = name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return `item_${safeName}_${Date.now()}`;
}

function migrateItem(item, index) {
    const name = String(item.name || item.nome || "").trim();
    const unitId = normalizeUnitId(item.unitId || item.unidade);
    const order = Number.isInteger(item.order) ? item.order : index;

    return {
        id: item.id || createItemId(`${name}-${index}`),
        name,
        unitId,
        active: item.active !== false,
        order
    };
}

function sortByOrder(firstItem, secondItem) {
    return firstItem.order - secondItem.order;
}

function normalizeItems(items) {
    if (!Array.isArray(items)) {
        return [];
    }

    return items
        .map(migrateItem)
        .filter((item) => item.name)
        .sort(sortByOrder)
        .map((item, index) => ({ ...item, order: index }));
}

export function createCatalog(initialItems) {
    let items = normalizeItems(initialItems);

    function listItems() {
        return [...items];
    }

    function addItem(item) {
        const name = String(item.name || item.nome || "").trim();
        const rawUnit = item.unitId || item.unidade;

        if (!name || !rawUnit) {
            return listItems();
        }

        const unitId = normalizeUnitId(rawUnit);

        items.push({
            id: createItemId(name),
            name,
            unitId,
            active: true,
            order: items.length
        });

        return listItems();
    }

    function deleteItem(itemId) {
        items = items.filter((item) => item.id !== itemId);
        items = items.map((item, itemIndex) => ({ ...item, order: itemIndex }));
        return listItems();
    }

    function updateItem(itemId, values) {
        const name = String(values.name || values.nome || "").trim();
        const rawUnit = values.unitId || values.unidade;

        if (!name || !rawUnit) {
            return listItems();
        }

        const unitId = normalizeUnitId(rawUnit);
        items = items.map((item) => {
            if (item.id !== itemId) {
                return item;
            }

            return { ...item, name, unitId };
        });

        return listItems();
    }

    function reorderItems(orderedIds) {
        const orderById = new Map(orderedIds.map((itemId, index) => [itemId, index]));

        items = items
            .map((item) => ({
                ...item,
                order: orderById.has(item.id) ? orderById.get(item.id) : Number.MAX_SAFE_INTEGER
            }))
            .sort(sortByOrder)
            .map((item, index) => ({ ...item, order: index }));

        return listItems();
    }

    return {
        listItems,
        addItem,
        deleteItem,
        updateItem,
        reorderItems
    };
}
