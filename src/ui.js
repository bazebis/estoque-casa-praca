import { formatQuantity, getUnitById, getUnits } from "./units.js";

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

export function renderUnitOptions() {
    const unitSelect = getElement("novo-item-unidade");
    unitSelect.innerHTML = "";

    const placeholderOption = document.createElement("option");
    placeholderOption.value = "";
    placeholderOption.textContent = "Selecione a unidade...";
    placeholderOption.disabled = true;
    placeholderOption.selected = true;
    unitSelect.appendChild(placeholderOption);

    getUnits().forEach((unit) => {
        const option = document.createElement("option");
        option.value = unit.id;
        option.textContent = unit.label;
        unitSelect.appendChild(option);
    });
}

export function updateConfigList(items, onDeleteItem) {
    const list = getElement("lista-config");
    list.innerHTML = "";

    items.forEach((item, index) => {
        const unit = getUnitById(item.unitId);
        list.innerHTML += `<li>${item.name} — ${unit.label} 
            <button data-index="${index}" class="btn-excluir-item">🗑️</button></li>`;
    });

    document.querySelectorAll(".btn-excluir-item").forEach((button) => {
        button.addEventListener("click", () => {
            onDeleteItem(Number(button.dataset.index));
        });
    });
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

export function openConfigModal(items, onDeleteItem) {
    openModal("configModal");
    updateConfigList(items, onDeleteItem);
}

export function closeConfigModal() {
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
