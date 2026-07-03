import { formatQuantity, getUnitById, getUnits } from "./units.js";

let editingItemId = null;

function getElement(id) {
    return document.getElementById(id);
}

function openModal(modalId) {
    getElement(modalId).style.display = "block";
}

function closeModal(modalId) {
    getElement(modalId).style.display = "none";
}

function clearNewItemInputs() {
    getElement("novo-item-nome").value = "";
    getElement("novo-item-unidade").value = "";
}

function getNewItemFormValues() {
    return {
        name: getElement("novo-item-nome").value.trim(),
        unitId: getElement("novo-item-unidade").value
    };
}

function getQuantityValue() {
    return getElement("modal-quantidade").value;
}

function clearQuantityInput() {
    getElement("modal-quantidade").value = "";
}

function buildFinalMessage(items) {
    let message = "Itens em Estoque:\n";

    items.forEach((item) => {
        message += `- ${item.name}: ${formatQuantity(item.qtd, item.unitId)}\n`;
    });

    return message;
}

function createUnitOption(unit, selectedUnitId) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.label;
    option.selected = unit.id === selectedUnitId;
    return option;
}

function renderUnitSelect(selectElement, selectedUnitId = "") {
    selectElement.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Selecione a unidade...";
    placeholderOption.disabled = true;
    placeholderOption.selected = !selectedUnitId;
    selectElement.appendChild(placeholderOption);

    getUnits().forEach((unit) => {
        selectElement.appendChild(createUnitOption(unit, selectedUnitId));
    });
}

function createButton(text, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    return button;
}

function createDragHandle() {
    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "catalog-drag-handle";
    handle.textContent = "☰";
    handle.setAttribute("aria-label", "Reordenar item");
    return handle;
}

function renderItemContent(item) {
    const content = document.createElement("div");
    content.className = "catalog-item-content";

    const name = document.createElement("strong");
    name.textContent = item.name;

    const unit = document.createElement("span");
    unit.textContent = ` — ${getUnitById(item.unitId).label}`;

    content.append(name, unit);
    return content;
}

function renderItemActions(item, handlers) {
    const actions = document.createElement("div");
    actions.className = "catalog-item-actions";

    const editButton = createButton("Editar", "catalog-action-button");
    editButton.addEventListener("click", () => {
        editingItemId = item.id;
        updateConfigList(handlers.getItems(), handlers);
    });

    const deleteButton = createButton("Excluir", "catalog-action-button catalog-danger-button");
    deleteButton.addEventListener("click", () => handlers.onDeleteItem(item.id));

    actions.append(editButton, deleteButton);
    return actions;
}

function renderEditForm(item, handlers) {
    const form = document.createElement("div");
    form.className = "catalog-edit-form";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = item.name;
    nameInput.placeholder = "Nome do Item";

    const unitSelect = document.createElement("select");
    renderUnitSelect(unitSelect, item.unitId);

    const saveButton = createButton("Salvar", "catalog-action-button");
    saveButton.addEventListener("click", () => saveEditedItem(item.id, nameInput, unitSelect, handlers));

    const cancelButton = createButton("Cancelar", "catalog-action-button");
    cancelButton.addEventListener("click", () => {
        editingItemId = null;
        updateConfigList(handlers.getItems(), handlers);
    });

    form.append(nameInput, unitSelect, saveButton, cancelButton);
    return form;
}

function saveEditedItem(itemId, nameInput, unitSelect, handlers) {
    const wasSaved = handlers.onUpdateItem(itemId, {
        name: nameInput.value.trim(),
        unitId: unitSelect.value
    });

    if (!wasSaved) {
        alert("Informe nome e unidade para salvar.");
        return;
    }

    editingItemId = null;
    updateConfigList(handlers.getItems(), handlers);
}

function setupPointerReorder(list, handlers) {
    let draggedItem = null;

    list.querySelectorAll(".catalog-drag-handle").forEach((handle) => {
        handle.addEventListener("pointerdown", (event) => {
            draggedItem = event.currentTarget.closest(".catalog-item");
            draggedItem.classList.add("is-dragging");
            handle.setPointerCapture(event.pointerId);
        });

        handle.addEventListener("pointermove", (event) => {
            if (!draggedItem) {
                return;
            }

            event.preventDefault();
            moveDraggedItem(list, draggedItem, event.clientX, event.clientY);
        });

        handle.addEventListener("pointerup", () => {
            if (!draggedItem) {
                return;
            }

            draggedItem.classList.remove("is-dragging");
            draggedItem = null;
            handlers.onReorderItems(getOrderedItemIds(list));
        });
    });
}

function moveDraggedItem(list, draggedItem, clientX, clientY) {
    const targetItem = document.elementFromPoint(clientX, clientY)?.closest(".catalog-item");

    if (!targetItem || targetItem === draggedItem || targetItem.parentElement !== list) {
        return;
    }

    const targetRect = targetItem.getBoundingClientRect();
    const shouldInsertAfter = clientY > targetRect.top + targetRect.height / 2;
    list.insertBefore(draggedItem, shouldInsertAfter ? targetItem.nextSibling : targetItem);
}

function getOrderedItemIds(list) {
    return [...list.querySelectorAll(".catalog-item")].map((item) => item.dataset.itemId);
}

export function renderUnitOptions() {
    renderUnitSelect(getElement("novo-item-unidade"));
}

export function updateConfigList(items, handlers) {
    const list = getElement("lista-config");
    list.innerHTML = "";

    items.forEach((item) => {
        const listItem = document.createElement("li");
        listItem.className = "catalog-item";
        listItem.dataset.itemId = item.id;

        listItem.append(createDragHandle());

        if (item.id === editingItemId) {
            listItem.append(renderEditForm(item, handlers));
        } else {
            listItem.append(renderItemContent(item), renderItemActions(item, handlers));
        }

        list.appendChild(listItem);
    });

    setupPointerReorder(list, handlers);
}

export function showCurrentItem(item, onFinishCounting) {
    if (!item) {
        onFinishCounting();
        return;
    }

    getElement("modal-mensagem").textContent = `Qtd de ${item.name}:`;
    openModal("itemModal");
}

export function showFinalSummary(items) {
    closeModal("itemModal");
    getElement("mensagem-whatsapp").textContent = buildFinalMessage(items);
    getElement("lista-final").style.display = "block";
}

export function openConfigModal(items, handlers) {
    openModal("configModal");
    updateConfigList(items, handlers);
}

export function closeConfigModal() {
    editingItemId = null;
    closeModal("configModal");
}

export function sendWhatsappMessage() {
    const message = encodeURIComponent(getElement("mensagem-whatsapp").textContent);
    window.open(`https://wa.me/5516997530847?text=${message}`, "_blank");
}

export function connectEvents(handlers) {
    getElement("btn-iniciar-contagem").addEventListener("click", handlers.onStartCounting);
    getElement("btn-config").addEventListener("click", handlers.onOpenConfig);
    getElement("btn-confirmar-quantidade").addEventListener("click", () => {
        handlers.onConfirmQuantity(getQuantityValue());
        clearQuantityInput();
    });
    getElement("btn-finalizar-contagem").addEventListener("click", handlers.onFinishCounting);
    getElement("btn-adicionar-item").addEventListener("click", () => {
        const wasAdded = handlers.onAddItem(getNewItemFormValues());

        if (wasAdded) {
            clearNewItemInputs();
        }
    });
    getElement("btn-fechar-config").addEventListener("click", closeConfigModal);
    getElement("btn-enviar-mensagem").addEventListener("click", sendWhatsappMessage);
    getElement("btn-recomecar-contagem").addEventListener("click", handlers.onRestartCounting);
}
