export function createCatalog(initialItems) {
    let items = [...initialItems];

    function listItems() {
        return [...items];
    }

    function addItem(item) {
        const nome = item.nome.trim();
        const unidade = item.unidade.trim();

        if (!nome || !unidade) {
            return listItems();
        }

        items.push({ nome, unidade });
        return listItems();
    }

    function deleteItem(index) {
        items.splice(index, 1);
        return listItems();
    }

    function updateItem() {
        return listItems();
    }

    function reorderItems() {
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
