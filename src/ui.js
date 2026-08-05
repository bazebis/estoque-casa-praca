import { getActiveUnits, getBaseUnits, getUnitById, resolveUnitSnapshot } from "./units.js";
import { buildCountReport } from "./report.js";
import { exportStockCountCsv, exportStockCountJson } from "./integrations/exportOperational.js";

let editingItemId = null;
let editingUnitId = null;
let finalReportSummaries = [];
let finalReportDate = null;
let finalReportCount = null;

const adminSections = {
    catalog: "admin-section-catalog",
    "catalog-import": "admin-section-catalog-import",
    units: "admin-section-units",
    "quick-pilot": "admin-section-quick-pilot",
    templates: "admin-section-templates",
    "item-unit-settings": "admin-section-item-unit-settings",
    "whatsapp-settings": "admin-section-whatsapp-settings",
    locations: "admin-section-locations",
    preparation: "admin-section-preparation",
    "item-locations": "admin-section-item-locations",
    "location-item-map": "admin-section-location-item-map",
    "location-count-sessions": "admin-section-location-count-sessions",
    history: "admin-section-history",
    backup: "admin-section-backup",
    about: "admin-section-about"
};

function getElement(id) {
    return document.getElementById(id);
}

function openModal(modalId) {
    getElement(modalId).style.display = "block";
}

function closeModal(modalId) {
    getElement(modalId).style.display = "none";
}

function showAdminSection(sectionName) {
    const menu = getElement("admin-menu");
    const shouldShowMenu = !sectionName || sectionName === "menu";

    menu.hidden = !shouldShowMenu;

    Object.entries(adminSections).forEach(([name, sectionId]) => {
        getElement(sectionId).hidden = shouldShowMenu || name !== sectionName;
    });
}

export function showAdminMenu() {
    hideHistoryView();
    showAdminSection("menu");
}

export function showCountTemplatesAdminSection() {
    showAdminSection("templates");
}

export function showItemUnitSettingsAdminSection() {
    showAdminSection("item-unit-settings");
}

export function showQuickPilotAdminSection() {
    showAdminSection("quick-pilot");
}

export function showWhatsappSettingsAdminSection() {
    showAdminSection("whatsapp-settings");
}

export function showLocationNodesAdminSection() {
    showAdminSection("locations");
}

export function showCountPreparationAdminSection() {
    showAdminSection("preparation");
}

export function showItemLocationLinksAdminSection() {
    showAdminSection("item-locations");
}

export function showLocationItemMapAdminSection() {
    showAdminSection("location-item-map");
}

export function showLocationCountSessionsAdminSection() {
    showAdminSection("location-count-sessions");
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

function clearNewUnitInputs() {
    getElement("nova-unidade-label").value = "";
    getElement("nova-unidade-base").value = "un";
    getElement("nova-unidade-factor").value = "";
}

function getNewItemFormValues() {
    return {
        name: getElement("novo-item-nome").value.trim(),
        unitId: getElement("novo-item-unidade").value
    };
}

function getNewUnitFormValues() {
    return {
        label: getElement("nova-unidade-label").value.trim(),
        baseUnit: getElement("nova-unidade-base").value,
        factor: getElement("nova-unidade-factor").value
    };
}

function getCatalogImportMode() {
    return document.querySelector("input[name='catalog-import-mode']:checked")?.value || "append";
}

function getBackupImportMode() {
    return document.querySelector("input[name='backup-import-mode']:checked")?.value || "merge-history";
}

function clearCatalogImportFile() {
    getElement("catalog-import-file").value = "";
}

function clearBackupImportFile() {
    getElement("backup-import-file").value = "";
}

function setCatalogImportStatus(message) {
    getElement("catalog-import-status").textContent = message;
}

function setBackupImportStatus(message) {
    getElement("backup-import-status").textContent = message;
}

function setCatalogImportActionsVisible(isVisible) {
    getElement("catalog-import-actions").hidden = !isVisible;
}

function setBackupImportActionsVisible(isVisible) {
    getElement("backup-import-actions").hidden = !isVisible;
}

function createUnitOption(unit, selectedUnitId) {
    const option = document.createElement("option");
    option.value = unit.id;
    option.textContent = unit.active === false ? `${unit.label} (inativa)` : unit.label;
    option.selected = unit.id === selectedUnitId;
    return option;
}

function getSelectableUnits(selectedUnitId = "") {
    const activeUnits = getActiveUnits();
    const selectedUnit = selectedUnitId ? getUnitById(selectedUnitId) : null;
    const shouldIncludeSelectedUnit = selectedUnitId && !activeUnits.some((unit) => unit.id === selectedUnitId);

    return shouldIncludeSelectedUnit ? [...activeUnits, selectedUnit] : activeUnits;
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

    getSelectableUnits(selectedUnitId).forEach((unit) => {
        selectElement.appendChild(createUnitOption(unit, selectedUnitId));
    });
}

function renderCompatibleUnitSelect(selectElement, selectedUnitId, baseUnit) {
    selectElement.innerHTML = "";
    const selectedUnit = getUnitById(selectedUnitId);
    const compatibleActiveUnits = getActiveUnits().filter((unit) => unit.baseUnit === baseUnit);
    const units = compatibleActiveUnits.length > 0
        ? compatibleActiveUnits
        : [selectedUnit].filter((unit) => unit.baseUnit === baseUnit);
    const selectedActiveUnitId = selectedUnit.active === false ? units[0]?.id : selectedUnitId;

    units.forEach((unit) => {
        selectElement.appendChild(createUnitOption(unit, selectedActiveUnitId));
    });
}

function renderBaseUnitSelect(selectElement, selectedBaseUnit = "un") {
    selectElement.innerHTML = "";

    getBaseUnits().forEach((baseUnit) => {
        const option = document.createElement("option");
        option.value = baseUnit;
        option.textContent = baseUnit;
        option.selected = baseUnit === selectedBaseUnit;
        selectElement.appendChild(option);
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
    const itemUnit = getUnitById(item.unitId);

    const name = document.createElement("strong");
    name.textContent = item.name;

    const unit = document.createElement("span");
    unit.textContent = ` — ${itemUnit.label}`;

    content.append(name, unit);

    if (itemUnit.active === false) {
        const warning = document.createElement("small");
        warning.className = "unit-warning";
        warning.textContent = "Unidade inativa";
        content.appendChild(warning);
    }

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

async function saveEditedItem(itemId, nameInput, unitSelect, handlers) {
    const wasSaved = await handlers.onUpdateItem(itemId, {
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

function setUnitsFeedback(message) {
    getElement("unidades-feedback").textContent = message;
}

function createUnitStatusText(unit) {
    const type = unit.custom ? "Personalizada" : "Padrão";
    const status = unit.active === false ? "Inativa" : "Ativa";

    return `${unit.baseUnit} | fator ${formatNumber(unit.factor)} | ${type} | ${status}`;
}

function renderUnitReadOnlyContent(unit) {
    const content = document.createElement("div");
    content.className = "unit-item-content";

    const label = document.createElement("strong");
    label.textContent = unit.label;

    const meta = document.createElement("span");
    meta.textContent = createUnitStatusText(unit);

    content.append(label, meta);
    return content;
}

function renderUnitActions(unit, handlers) {
    const actions = document.createElement("div");
    actions.className = "unit-item-actions";

    if (!unit.custom) {
        const badge = document.createElement("span");
        badge.className = "unit-system-badge";
        badge.textContent = "Sistema";
        actions.appendChild(badge);
        return actions;
    }

    const editButton = createButton("Editar", "catalog-action-button");
    editButton.addEventListener("click", () => {
        editingUnitId = unit.id;
        renderUnitsList(handlers.getUnits(), handlers);
    });

    const toggleButton = createButton(
        unit.active === false ? "Ativar" : "Desativar",
        unit.active === false ? "catalog-action-button" : "catalog-action-button catalog-danger-button"
    );
    toggleButton.addEventListener("click", () => {
        handlers.onToggleUnit(unit.id, unit.active === false);
    });

    actions.append(editButton, toggleButton);
    return actions;
}

function renderUnitEditForm(unit, handlers) {
    const form = document.createElement("div");
    form.className = "unit-edit-form";

    const labelInput = document.createElement("input");
    labelInput.type = "text";
    labelInput.value = unit.label;
    labelInput.placeholder = "Nome da unidade";
    labelInput.setAttribute("aria-label", "Nome da unidade");

    const baseSelect = document.createElement("select");
    baseSelect.setAttribute("aria-label", "Unidade base");
    renderBaseUnitSelect(baseSelect, unit.baseUnit);

    const factorInput = document.createElement("input");
    factorInput.type = "number";
    factorInput.min = "0";
    factorInput.step = "any";
    factorInput.value = unit.factor;
    factorInput.placeholder = "Fator";
    factorInput.setAttribute("aria-label", "Fator da unidade");

    const activeLabel = document.createElement("label");
    activeLabel.className = "unit-active-toggle";

    const activeInput = document.createElement("input");
    activeInput.type = "checkbox";
    activeInput.checked = unit.active !== false;
    activeLabel.append(activeInput, "Ativa");

    const saveButton = createButton("Salvar", "catalog-action-button");
    saveButton.addEventListener("click", async () => {
        const wasSaved = await handlers.onUpdateUnit(unit.id, {
            label: labelInput.value.trim(),
            baseUnit: baseSelect.value,
            factor: factorInput.value,
            active: activeInput.checked
        });

        if (!wasSaved) {
            return;
        }

        editingUnitId = null;
        renderUnitsList(handlers.getUnits(), handlers);
    });

    const cancelButton = createButton("Cancelar", "catalog-action-button");
    cancelButton.addEventListener("click", () => {
        editingUnitId = null;
        renderUnitsList(handlers.getUnits(), handlers);
    });

    form.append(labelInput, baseSelect, factorInput, activeLabel, saveButton, cancelButton);
    return form;
}

export function renderUnitsList(units, handlers) {
    const list = getElement("lista-unidades");
    list.innerHTML = "";

    units.forEach((unit) => {
        const listItem = document.createElement("li");
        listItem.className = unit.custom ? "unit-item" : "unit-item unit-item-system";

        if (unit.id === editingUnitId && unit.custom) {
            listItem.appendChild(renderUnitEditForm(unit, handlers));
        } else {
            listItem.append(renderUnitReadOnlyContent(unit), renderUnitActions(unit, handlers));
        }

        list.appendChild(listItem);
    });
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
        const unit = resolveUnitSnapshot(entry.unitId, entry.unitSnapshot);

        const text = document.createElement("span");
        text.textContent = `${formatNumber(entry.quantity)} ${unit.unitLabel}`;

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
    addButton.addEventListener("click", async () => {
        const wasAdded = await handlers.onAddEntry(quantityInput.value, unitSelect.value);

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

function getFinalReportCount() {
    if (finalReportCount) {
        return finalReportCount;
    }

    const finishedAt = finalReportDate || new Date();

    return {
        id: "",
        status: "finalizada",
        startedAt: finishedAt.toISOString(),
        finishedAt: finishedAt.toISOString(),
        summaries: finalReportSummaries,
        reportText: buildCountReport(finalReportSummaries, {
            generatedAt: finishedAt,
            showZeroItems: false
        })
    };
}

function exportFinalReportJson() {
    exportStockCountJson(getFinalReportCount());
}

function exportFinalReportCsv() {
    exportStockCountCsv(getFinalReportCount());
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

function createHistoryMetaText(entry) {
    const finishedAt = formatDateTime(entry.finishedAt);
    const totalItems = Number(entry.totalItemsCounted) || 0;

    return `${finishedAt || "Data não informada"} - Finalizada - ${totalItems} itens contados`;
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

function formatBackupDate(value) {
    return formatDateTime(value) || "Não informado";
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

async function copyTextWithFeedback(text, feedbackElement) {
    try {
        if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        } else if (!copyWithFallback(text)) {
            throw new Error("copy failed");
        }

        feedbackElement.textContent = "Texto copiado";
    } catch {
        feedbackElement.textContent = "Não foi possível copiar";
    }
}

async function copyFinalReport() {
    await copyTextWithFeedback(
        getElement("mensagem-whatsapp").textContent,
        getElement("copiar-feedback")
    );
}

function sendWhatsappText(text) {
    const message = encodeURIComponent(text);
    window.open(`https://wa.me/?text=${message}`, "_blank");
}

function renderHistoryEmptyState(container) {
    const empty = document.createElement("p");
    empty.className = "history-empty";
    empty.textContent = "Nenhuma contagem finalizada salva neste navegador.";
    container.appendChild(empty);
}

function renderHistoryListItem(entry, handlers) {
    const item = document.createElement("li");

    const button = createButton(createHistoryMetaText(entry), "history-item-button");
    button.addEventListener("click", () => handlers.onViewHistoryEntry(entry.id));

    item.appendChild(button);
    return item;
}

function renderHistoryList(container, history, handlers) {
    if (history.length === 0) {
        renderHistoryEmptyState(container);
        return;
    }

    const list = document.createElement("ul");
    list.className = "history-list";

    history.forEach((entry) => {
        list.appendChild(renderHistoryListItem(entry, handlers));
    });

    container.appendChild(list);
}

export function renderUnitOptions() {
    renderUnitSelect(getElement("novo-item-unidade"));
    renderBaseUnitSelect(getElement("nova-unidade-base"));
}

export function showUnitsFeedback(message) {
    setUnitsFeedback(message);
}

export function resetCatalogImportPreview() {
    getElement("catalog-import-preview").innerHTML = "";
    setCatalogImportStatus("");
    setCatalogImportActionsVisible(false);
}

export function showCatalogImportStatus(message) {
    setCatalogImportStatus(message);
}

export function resetBackupImportPreview() {
    getElement("backup-import-preview").innerHTML = "";
    setBackupImportStatus("");
    setBackupImportActionsVisible(false);
}

export function showBackupImportStatus(message) {
    setBackupImportStatus(message);
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

export function renderBackupImportPreview(preview) {
    const container = getElement("backup-import-preview");
    container.innerHTML = "";

    if (!preview.isValid) {
        setBackupImportStatus(preview.error || "Backup inválido.");
        setBackupImportActionsVisible(false);
        return;
    }

    setBackupImportStatus("Backup válido. Confira os dados antes de importar.");

    const list = document.createElement("ul");
    list.className = "backup-preview-list";

    [
        `Exportado em: ${formatBackupDate(preview.exportedAt)}`,
        `Schema: ${preview.schemaVersion}`,
        `Itens no catálogo: ${preview.catalogCount}`,
        `Contagens no histórico: ${preview.historyCount}`,
        `Unidades personalizadas: ${preview.customUnitsCount || 0}`,
        `Rascunho no arquivo: ${preview.hasDraft ? "sim" : "não"}`
    ].forEach((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        list.appendChild(item);
    });

    container.appendChild(list);
    setBackupImportActionsVisible(true);
}

export function renderStorageStatusNotice(status) {
    const container = getElement("storage-status");

    if (!container) {
        return;
    }

    if (status?.warning) {
        container.textContent = status.warning;
        container.hidden = false;
        return;
    }

    if (status?.migrated && status?.isUsingIndexedDB) {
        container.textContent = "Dados locais preparados no IndexedDB.";
        container.hidden = false;
        return;
    }

    container.textContent = "";
    container.hidden = true;
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

export function showHistoryList(history, handlers) {
    showAdminSection("history");
    const container = getElement("historico-container");
    const content = getElement("historico-conteudo");

    hideCountingView();
    hideDraftNotice();
    getElement("lista-final").style.display = "none";
    getElement("historico-feedback").textContent = "";
    content.innerHTML = "";
    renderHistoryList(content, history, handlers);
    container.hidden = false;
}

export function showHistoryDetail(entry, handlers) {
    const content = getElement("historico-conteudo");
    content.innerHTML = "";
    getElement("historico-feedback").textContent = "";

    const meta = document.createElement("p");
    meta.className = "history-detail-meta";
    meta.textContent = createHistoryMetaText(entry);

    const report = document.createElement("pre");
    report.className = "history-report";
    report.textContent = entry.reportText || "";

    const actions = document.createElement("div");
    actions.className = "history-actions";

    const copyButton = createButton("Copiar texto", "history-primary-button");
    copyButton.addEventListener("click", () => {
        copyTextWithFeedback(entry.reportText || "", getElement("historico-feedback"));
    });

    const whatsappButton = createButton("Enviar WhatsApp", "history-primary-button");
    whatsappButton.addEventListener("click", () => sendWhatsappText(entry.reportText || ""));

    const jsonButton = createButton("Exportar JSON", "history-secondary-button");
    jsonButton.addEventListener("click", () => exportStockCountJson(entry));

    const csvButton = createButton("Exportar CSV", "history-secondary-button");
    csvButton.addEventListener("click", () => exportStockCountCsv(entry));

    const backButton = createButton("Voltar ao histórico", "history-secondary-button");
    backButton.addEventListener("click", handlers.onBackToHistory);

    actions.append(copyButton, whatsappButton, jsonButton, csvButton, backButton);
    content.append(meta, report, actions);
}

export function hideHistoryView() {
    const container = getElement("historico-container");
    getElement("historico-conteudo").innerHTML = "";
    getElement("historico-feedback").textContent = "";
    container.hidden = true;
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

export function showFinalSummary(summaries, generatedAt = new Date(), finalizedCount = null) {
    finalReportSummaries = summaries;
    finalReportDate = new Date(generatedAt);
    finalReportCount = finalizedCount;
    hideCountingView();
    hideDraftNotice();
    hideHistoryView();
    getElement("mostrar-zerados").checked = false;
    getElement("copiar-feedback").textContent = "";
    renderFinalReport();
    getElement("lista-final").style.display = "block";
}

export function openConfigModal(items, handlers, unitHandlers, initialSection = "menu") {
    openModal("configModal");
    updateConfigList(items, handlers);
    renderUnitsList(unitHandlers.getUnits(), unitHandlers);
    showAdminSection(initialSection);
}

export function closeConfigModal() {
    editingItemId = null;
    editingUnitId = null;
    hideHistoryView();
    showAdminSection("menu");
    closeModal("configModal");
}

export function sendWhatsappMessage() {
    sendWhatsappText(getElement("mensagem-whatsapp").textContent);
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

    getElement("btn-confirmar-importacao").addEventListener("click", async () => {
        await handlers.onConfirmCatalogImport(getCatalogImportMode());
    });

    getElement("btn-cancelar-importacao").addEventListener("click", () => {
        resetCatalogImportPreview();
        clearCatalogImportFile();
        handlers.onCancelCatalogImport();
    });
}

function connectBackupEvents(handlers) {
    getElement("btn-exportar-backup").addEventListener("click", handlers.onExportBackup);

    getElement("backup-import-file").addEventListener("change", () => {
        resetBackupImportPreview();
        handlers.onCancelBackupImport();
    });

    getElement("btn-analisar-backup").addEventListener("click", async () => {
        const file = getElement("backup-import-file").files[0];

        if (!file) {
            setBackupImportStatus("Selecione um arquivo JSON.");
            return;
        }

        try {
            const text = await file.text();
            handlers.onAnalyzeBackupImport(text);
        } catch {
            setBackupImportStatus("Não foi possível ler o arquivo JSON.");
            setBackupImportActionsVisible(false);
        }
    });

    getElement("btn-confirmar-backup").addEventListener("click", async () => {
        await handlers.onConfirmBackupImport(getBackupImportMode());
    });

    getElement("btn-cancelar-backup").addEventListener("click", () => {
        resetBackupImportPreview();
        clearBackupImportFile();
        handlers.onCancelBackupImport();
    });
}

function connectUnitEvents(handlers) {
    getElement("btn-adicionar-unidade").addEventListener("click", async () => {
        const wasAdded = await handlers.onAddUnit(getNewUnitFormValues());

        if (wasAdded) {
            clearNewUnitInputs();
        }
    });
}

function connectAdminNavigationEvents(handlers) {
    document.querySelectorAll(".admin-back-button").forEach((button) => {
        button.addEventListener("click", showAdminMenu);
    });

    document.querySelectorAll(".admin-menu-button").forEach((button) => {
        button.addEventListener("click", () => {
            const target = button.dataset.adminTarget;

            if (target === "history") {
                handlers.onOpenHistory();
                return;
            }

            if (target === "templates") {
                handlers.onOpenCountTemplates();
                return;
            }

            if (target === "item-unit-settings") {
                handlers.onOpenItemUnitSettings();
                return;
            }

            if (target === "quick-pilot") {
                handlers.onOpenQuickPilot();
                return;
            }

            if (target === "whatsapp-settings") {
                handlers.onOpenWhatsappSettings();
                return;
            }

            if (target === "locations") {
                handlers.onOpenLocationNodes();
                return;
            }

            if (target === "preparation") {
                handlers.onOpenCountPreparation();
                return;
            }

            if (target === "item-locations") {
                handlers.onOpenItemLocationLinks();
                return;
            }

            if (target === "location-item-map") {
                handlers.onOpenLocationItemMap();
                return;
            }

            if (target === "location-count-sessions") {
                handlers.onOpenLocationCountSessions();
                return;
            }

            showAdminSection(target);
        });
    });
}

export function connectEvents(handlers) {
    getElement("btn-iniciar-contagem").addEventListener("click", handlers.onStartCounting);
    getElement("btn-config").addEventListener("click", handlers.onOpenConfig);
    getElement("btn-historico").addEventListener("click", handlers.onOpenHistory);
    getElement("btn-fechar-historico").addEventListener("click", handlers.onCloseHistory);
    getElement("btn-adicionar-item").addEventListener("click", async () => {
        const wasAdded = await handlers.onAddItem(getNewItemFormValues());

        if (wasAdded) {
            clearNewItemInputs();
        }
    });
    getElement("btn-fechar-config").addEventListener("click", closeConfigModal);
    connectAdminNavigationEvents(handlers);
    connectCatalogImportEvents(handlers);
    connectBackupEvents(handlers);
    connectUnitEvents(handlers);
    getElement("mostrar-zerados").addEventListener("change", () => {
        getElement("copiar-feedback").textContent = "";
        renderFinalReport();
    });
    getElement("btn-copiar-texto").addEventListener("click", copyFinalReport);
    getElement("btn-enviar-mensagem").addEventListener("click", sendWhatsappMessage);
    getElement("btn-exportar-json").addEventListener("click", exportFinalReportJson);
    getElement("btn-exportar-csv").addEventListener("click", exportFinalReportCsv);
    getElement("btn-recomecar-contagem").addEventListener("click", handlers.onRestartCounting);
}
