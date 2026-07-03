export function createCounting(getCatalogItems) {
    let currentIndex = 0;
    let countedItems = [];

    function getCurrentItem() {
        return getCatalogItems()[currentIndex] || null;
    }

    function startCounting() {
        countedItems = [];
        currentIndex = 0;
        return getCurrentItem();
    }

    function confirmQuantity(quantity) {
        const currentItem = getCurrentItem();

        if (quantity > 0 && currentItem) {
            countedItems.push({ ...currentItem, qtd: quantity });
        }

        currentIndex++;
        return getCurrentItem();
    }

    function finishCounting() {
        return [...countedItems];
    }

    function restartCounting() {
        location.reload();
    }

    return {
        startCounting,
        confirmQuantity,
        finishCounting,
        restartCounting
    };
}
