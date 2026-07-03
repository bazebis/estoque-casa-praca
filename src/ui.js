import { getUnitById, getUnits } from "./units.js";
import { buildCountReport } from "./report.js";

let editingItemId = null;
let finalReportSummaries = [];
let finalReportDate = null;

function getElement(id) {
    return document.getElementById(id);
}

function openModal(modalId) {
    getElement(modalId).style.display = "block";
}

function closeModal(modalId) {
    getElement(modalId).style.display = "none";
}

function formatNumber(value) {
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

    return safeValue.toLocaleString("pt-BR", {
        maximumFractionDigits: 3
    });
}

function formatDateTime(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    return date.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    });
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

function getCatalogImportMode() {
    return document.querySelector("input[name='catalog-import-mode']:checked")?.value || "append";
}

function clearCatalogImportFile() {
    getElement("catalog-import-file").value = "";
}

function setCatalogImportStatus(message) {
    getElement("catalog-import-status").textContent = message;
}

function setCatalogImportActionsVisible(isVisible) {
    getElement("catalog-import-actions").hidden = !isVisible;
}

function createUnitOption(unit, selectedUnitId) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.label;
    option.selected = unit.id === selectedUnitId;
    return option;
}

function renderUnitSelect(selectElement, selectedUnitId = "", includePlaceholder = true) {
    selectElement.innerHTML = "";

    if (includePlaceholder) {
        const placeholderOption = document.createElement("option");
        placeholderOption.value = "";
        placeholderOption.textContent = "Selecione a unidade...";
        placeholderOption.disabled = true;
        placeholderOption.selected = !selectedUnitId;
        selectElement.appendChild(placeholderOption);
    }

    getUnits().forEach((unit) => {
        selectElement.appendChild(createUnitOption(unit, selectedUnitId));
    });
}

function renderCompatibleUnitSelect(selectElement, selectedUnitId, baseUnit) {
    selectElement.innerHTML = "";

    getUnits()
        .filter((unit) => unit.baseUnit === baseUnit)
        .forEach((unit) => {
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
    nameInput.setAttribute("aria-label", "Nome do item");

    const unitSelect = document.createElement("select");
    unitSelect.setAttribute("aria-label", "Unidade do item");
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

function renderEntryList(entries, handlers) {
    const list = document.createElement("ul");
    list.className = "counting-entry-list";

    if (entries.length === 0) {
        const emptyItem = document.createElement("li");
        emptyItem.className = "counting-entry-empty";
        emptyItem.textContent = "Nenhuma entrada adicionada.";
        list.appendChild(emptyItem);
        return list;
    }

    entries.forEach((entry) => {
        const item = document.createElement("li");
        item.className = "counting-entry-item";

        const text = document.createElement("span");
        text.textContent = `${formatNumber(entry.quantity)} ${getUnitById(entry.unitId).label}`;

        const removeButton = createButton("Remover", "counting-secondary-button counting-remove-button");
        removeButton.addEventListener("click", () => handlers.onRemoveEntry(entry.id));

        item.append(text, removeButton);
        list.appendChild(item);
    });

    return list;
}

function renderCountingEmptyState(container, handlers) {
    const card = document.createElement("div");
    card.className = "counting-card";

    const title = document.createElement("h2");
    title.textContent = "Nenhum item ativo para contar";

    const finishButton = createButton("Finalizar", "counting-primary-button");
    finishButton.addEventListener("click", handlers.onFinishCounting);

    card.append(title, finishButton);
    container.appendChild(card);
}

function renderCountingForm(card, viewModel, handlers) {
    const quantityInput = document.createElement("input");
    quantityInput.type = "number";
    quantityInput.min = "0";
    quantityInput.step = "any";
    quantityInput.placeholder = "Quantidade";
    quantityInput.className = "counting-input";
    quantityInput.setAttribute("aria-label", "Quantidade da entrada");

    const unitSelect = document.createElement("select");
    unitSelect.className = "counting-select";
    unitSelect.setAttribute("aria-label", "Unidade da entrada");
    renderCompatibleUnitSelect(unitSelect, viewModel.defaultUnitId, viewModel.baseUnit);

    const addButton = createButton("+ Adicionar entrada", "counting-primary-button");
    addButton.addEventListener("click", () => {
        const wasAdded = handlers.onAddEntry(quantityInput.value, unitSelect.value);

        if (!wasAdded) {
            alert("Informe uma quantidade maior que zero.");
        }
    });

    const form = document.createElement("div");
    form.className = "counting-form";
    form.append(quantityInput, unitSelect, addButton);
    card.appendChild(form);
}

function renderCountingNavigation(card, viewModel, handlers) {
    const actions = document.createElement("div");
    actions.className = "counting-actions";

    const previousButton = createButton("Voltar", "counting-secondary-button");
    previousButton.disabled = viewModel.currentIndex === 0;
    previousButton.addEventListener("click", handlers.onPreviousItem);

    const nextButton = createButton("Próximo", "counting-secondary-button");
    nextButton.disabled = viewModel.currentIndex >= viewModel.totalItems - 1;
    nextButton.addEventListener("click", handlers.onNextItem);

    const finishButton = createButton("Finalizar", "counting-primary-button");
    finishButton.addEventListener("click", handlers.onFinishCounting);

    actions.append(previousButton, nextButton, finishButton);
    card.appendChild(actions);
}

function renderFinalReport() {
    const showZeroItems = getElement("mostrar-zerados").checked;
    const message = buildCountReport(finalReportSummaries, {
        generatedAt: finalReportDate,
        showZeroItems
    });

    getElement("mensagem-whatsapp").textContent = message;
}

function createDraftDateText(draft) {
    const startedAt = formatDateTime(draft?.startedAt);
    const updatedAt = formatDateTime(draft?.updatedAt);

    if (startedAt && updatedAt) {
        return `Iniciada em ${startedAt}. Última atualização em ${updatedAt}.`;
    }

    if (startedAt) {
        return `Iniciada em ${startedAt}.`;
    }

    if (updatedAt) {
        return `Última atualização em ${updatedAt}.`;
    }

    return "Há uma contagem salva neste dispositivo.";
}

function createDraftNoticeActions(handlers) {
    const actions = document.createElement("div");
    actions.className = "draft-actions";

    const continueButton = createButton("Continuar contagem", "draft-primary-button");
    continueButton.addEventListener("click", handlers.onContinueDraft);

    const discardButton = createButton("Descartar contagem", "draft-secondary-button draft-danger-button");
    discardButton.addEventListener("click", handlers.onDiscardDraft);

    actions.append(continueButton, discardButton);
    return actions;
}

function createLastFinalizedDateText(finalizedCount) {
    const finishedAt = formatDateTime(finalizedCount?.finishedAt);

    if (finishedAt) {
        return `Finalizada em ${finishedAt}.`;
    }

    return "Existe uma contagem finalizada salva neste dispositivo.";
}

function createImportItemStatus(item) {
    const statuses = [];

    if (!item.wasUnitRecognized) {
        statuses.push("unidade não reconhecida");
    }

    if (item.duplicateInFile) {
        statuses.push("duplicado no arquivo");
    } else if (item.duplicateWithCatalog) {
        statuses.push("já existe no catálogo");
    }

    return statuses.length ? statuses.join(", ") : "ok";
}

function renderImportWarningList(warnings) {
    if (warnings.length === 0) {
        return null;
    }

    const list = document.createElement("ul");
    list.className = "catalog-import-warnings";

    warnings.forEach((warning) => {
        const item = document.createElement("li");
        item.textContent = `Linha ${warning.row}: ${warning.message}`;
        list.appendChild(item);
    });

    return list;
}

function renderImportItemPreview(items) {
    const list = document.createElement("ul");
    list.className = "catalog-import-list";

    items.forEach((item) => {
        const listItem = document.createElement("li");
        listItem.className = "catalog-import-item";

        const name = document.createElement("strong");
        name.textContent = item.name;

        const unitText = document.createElement("span");
        unitText.textContent = `${item.rawUnit || "(sem unidade)"} -> ${item.unitLabel}`;

        const status = document.createElement("small");
        status.textContent = createImportItemStatus(item);

        listItem.append(name, unitText, status);
        list.appendChild(listItem);
    });

    return list;
}

function copyWithFallback(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    const wasCopied = document.execCommand("copy");
    textarea.remove();
    return wasCopied;
}

async function copyFinalReport() {
    const feedback = getElement("copiar-feedback");
    const text = getElement("mensagem-whatsapp").textContent;

    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        } else if (!copyWithFallback(text)) {
            throw new Error("copy failed");
        }

        feedback.textContent = "Texto copiado";
    } catch {
        feedback.textContent = "Não foi possível copiar";
    }
}

export function renderUnitOptions() {
    renderUnitSelect(getElement("novo-item-unidade"));
}

export function resetCatalogImportPreview() {
    getElement("catalog-import-preview").innerHTML = "";
    setCatalogImportStatus("");
    setCatalogImportActionsVisible(false);
}

export function showCatalogImportStatus(message) {
    setCatalogImportStatus(message);
}

export function renderCatalogImportPreview(result) {
    const preview = getElement("catalog-import-preview");
    preview.innerHTML = "";

    if (result.error) {
        setCatalogImportStatus(result.error);
        setCatalogImportActionsVisible(false);
        return;
    }

    setCatalogImportStatus(
        `${result.validCount} linha(s) válida(s). ${result.ignoredCount} linha(s) ignorada(s).`
    );

    const warningList = renderImportWarningList(result.warnings);

    if (warningList) {
        preview.appendChild(warningList);
    }

    preview.appendChild(renderImportItemPreview(result.items));
    setCatalogImportActionsVisible(result.items.length > 0);
}

export function renderDraftNotice(draft, handlers) {
    const container = getElement("rascunho-aviso");
    container.innerHTML = "";
    container.hidden = false;

    const title = document.createElement("h2");
    title.textContent = "Contagem em andamento";

    const description = document.createElement("p");
    description.textContent = createDraftDateText(draft);

    container.append(title, description, createDraftNoticeActions(handlers));
}

export function hideDraftNotice() {
    const container = getElement("rascunho-aviso");
    container.innerHTML = "";
    container.hidden = true;
}

export function renderLastFinalizedNotice(finalizedCount, handlers) {
    const container = getElement("rascunho-aviso");
    container.innerHTML = "";
    container.hidden = false;

    const title = document.createElement("h2");
    title.textContent = "Última contagem finalizada";

    const description = document.createElement("p");
    description.textContent = createLastFinalizedDateText(finalizedCount);

    const actions = document.createElement("div");
    actions.className = "draft-actions";

    const viewButton = createButton("Ver última contagem finalizada", "draft-secondary-button");
    viewButton.addEventListener("click", handlers.onViewLastFinalized);

    actions.appendChild(viewButton);
    container.append(title, description, actions);
}

export function confirmStartWithDraft(handlers) {
    const container = getElement("rascunho-aviso");
    container.innerHTML = "";
    container.hidden = false;

    const title = document.createElement("h2");
    title.textContent = "Já existe uma contagem em andamento";

    const description = document.createElement("p");
    description.textContent = "Escolha se deseja continuar a contagem salva ou descartá-la para iniciar uma nova.";

    const actions = document.createElement("div");
    actions.className = "draft-actions";

    const continueButton = createButton("Continuar contagem atual", "draft-primary-button");
    continueButton.addEventListener("click", handlers.onContinueDraft);

    const startNewButton = createButton("Descartar e iniciar nova", "draft-secondary-button draft-danger-button");
    startNewButton.addEventListener("click", handlers.onDiscardAndStartNew);

    const cancelButton = createButton("Cancelar", "draft-secondary-button");
    cancelButton.addEventListener("click", handlers.onCancel);

    actions.append(continueButton, startNewButton, cancelButton);
    container.append(title, description, actions);
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

export function renderCountingView(viewModel, handlers) {
    const container = getElement("contagem-container");
    container.innerHTML = "";
    container.style.display = "block";
    getElement("lista-final").style.display = "none";

    if (!viewModel?.currentItem) {
        renderCountingEmptyState(container, handlers);
        return;
    }

    const card = document.createElement("div");
    card.className = "counting-card";

    const position = document.createElement("p");
    position.className = "counting-position";
    position.textContent = `Item ${viewModel.currentIndex + 1} de ${viewModel.totalItems}`;

    const title = document.createElement("h2");
    title.textContent = viewModel.currentItem.name;

    const unit = document.createElement("p");
    unit.className = "counting-unit";
    unit.textContent = `Unidade padrão: ${getUnitById(viewModel.currentItem.unitId).label}`;

    const total = document.createElement("p");
    total.className = "counting-total";
    total.textContent = `Total: ${formatNumber(viewModel.totalBase)} ${viewModel.baseUnit}`;

    card.append(position, title, unit);
    renderCountingForm(card, viewModel, handlers);
    card.append(renderEntryList(viewModel.entries, handlers), total);
    renderCountingNavigation(card, viewModel, handlers);
    container.appendChild(card);
}

export function hideCountingView() {
    const container = getElement("contagem-container");
    container.innerHTML = "";
    container.style.display = "none";
}

export function showFinalSummary(summaries, generatedAt = new Date()) {
    finalReportSummaries = summaries;
    finalReportDate = new Date(generatedAt);
    hideCountingView();
    hideDraftNotice();
    getElement("mostrar-zerados").checked = false;
    getElement("copiar-feedback").textContent = "";
    renderFinalReport();
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

function connectCatalogImportEvents(handlers) {
    getElement("catalog-import-file").addEventListener("change", () => {
        resetCatalogImportPreview();
        handlers.onCancelCatalogImport();
    });

    getElement("btn-analisar-csv").addEventListener("click", async () => {
        const file = getElement("catalog-import-file").files[0];

        if (!file) {
            setCatalogImportStatus("Selecione um arquivo CSV.");
            return;
        }

        try {
            const text = await file.text();
            handlers.onAnalyzeCatalogImport(text);
        } catch {
            setCatalogImportStatus("Não foi possível ler o arquivo CSV.");
            setCatalogImportActionsVisible(false);
        }
    });

    getElement("btn-confirmar-importacao").addEventListener("click", () => {
        handlers.onConfirmCatalogImport(getCatalogImportMode());
    });

    getElement("btn-cancelar-importacao").addEventListener("click", () => {
        resetCatalogImportPreview();
        clearCatalogImportFile();
        handlers.onCancelCatalogImport();
    });
}

export function connectEvents(handlers) {
    getElement("btn-iniciar-contagem").addEventListener("click", handlers.onStartCounting);
    getElement("btn-config").addEventListener("click", handlers.onOpenConfig);
    getElement("btn-adicionar-item").addEventListener("click", () => {
        const wasAdded = handlers.onAddItem(getNewItemFormValues());

        if (wasAdded) {
            clearNewItemInputs();
        }
    });
    getElement("btn-fechar-config").addEventListener("click", closeConfigModal);
    connectCatalogImportEvents(handlers);
    getElement("mostrar-zerados").addEventListener("change", () => {
        getElement("copiar-feedback").textContent = "";
        renderFinalReport();
    });
    getElement("btn-copiar-texto").addEventListener("click", copyFinalReport);
    getElement("btn-enviar-mensagem").addEventListener("click", sendWhatsappMessage);
    getElement("btn-recomecar-contagem").addEventListener("click", handlers.onRestartCounting);
}
