import {
    CONTROLLED_ITEM_UNIT_CATALOG,
    CONTROLLED_UNIT_VARIANT_FAMILIES,
    buildControlledUnitVariant,
    doesItemUnitProfileNeedReview,
    formatUnitVariantLabel,
    getAllowedUnitVariant,
    getDeterministicFactorToBase,
    getUnitVariantSemanticKey,
    isItemUnitProfileComplete
} from "./itemUnitSettings.js";

let currentViewModel = null;
let itemSearchQuery = "";
let activeProfileFilter = "all";
let activeItemIndex = 0;
let currentNavigationItems = [];
let editorInitialValues = "";
let editorReturnFocus = null;
let pendingDiscardAction = null;
let pendingDiscardCancellation = null;
let variantDraftSequence = 0;

const variableFamilyNames = new Set(CONTROLLED_UNIT_VARIANT_FAMILIES.map((definition) => definition.family));
const simpleControlledUnits = CONTROLLED_ITEM_UNIT_CATALOG.filter((unit) => !variableFamilyNames.has(unit.label));

const sourceLabels = {
    manual: "manual",
    group_name: "nome do grupo",
    item_name: "nome do item",
    previous_entry: "entrada anterior",
    unknown: "sem regra"
};

const confidenceLabels = {
    high: "alta",
    medium: "média",
    low: "baixa",
    unknown: "desconhecida"
};

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function appendOption(select, value, label, selected = false) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
}

function renderTemplateOptions(viewModel) {
    const select = getElement("item-unit-template");
    select.innerHTML = "";
    viewModel.templates.forEach((template) => appendOption(
        select,
        template.id,
        template.name,
        template.id === viewModel.selectedTemplate?.id
    ));
    getElement("item-unit-template-field").hidden = viewModel.templates.length === 0;
}

function renderSummary(summary) {
    getElement("item-unit-summary").innerHTML = `
        <p class="item-unit-summary-primary">
            <strong>${summary.itemCount} itens</strong>
            <span>${summary.completeProfileCount} prontos</span>
            <span>${summary.needsReviewCount} revisar</span>
        </p>
        <details class="item-unit-summary-details">
            <summary>Ver detalhes</summary>
            <dl>
                <div><dt>Sem perfil</dt><dd>${summary.withoutProfileCount}</dd></div>
                <div><dt>Pacote ambíguo</dt><dd>${summary.ambiguousPackageCount}</dd></div>
                <div><dt>Porção sem peso</dt><dd>${summary.portionWithoutWeightCount}</dd></div>
            </dl>
        </details>
    `;
}

function matchesSearch(item, group, searchQuery) {
    const query = searchQuery.trim().toLocaleLowerCase("pt-BR");
    if (!query) return true;
    return `${item.code} ${item.name} ${group.name}`.toLocaleLowerCase("pt-BR").includes(query);
}

function matchesProfileFilter(setting, profileFilter) {
    if (profileFilter === "review") return doesItemUnitProfileNeedReview(setting);
    if (profileFilter === "missing") return !isItemUnitProfileComplete(setting);
    return true;
}

export function buildItemUnitNavigationItems(template, settings = [], searchQuery = "", profileFilter = "all") {
    const settingsByItem = new Map(settings.map((setting) => [setting.itemCode, setting]));
    return (template?.groups || []).flatMap((group) => (group.items || []).filter((item) => {
        const setting = settingsByItem.get(item.code);
        return matchesSearch(item, group, searchQuery) && matchesProfileFilter(setting, profileFilter);
    }).map((item) => ({ item, group, setting: settingsByItem.get(item.code) })));
}

export function clampItemUnitNavigationIndex(index, itemCount) {
    if (itemCount <= 0) return 0;
    return Math.min(Math.max(Number(index) || 0, 0), itemCount - 1);
}

export function resolveItemUnitIndexAfterSave(items, currentIndex, nextItemCode, didSave) {
    if (!didSave || !nextItemCode) return clampItemUnitNavigationIndex(currentIndex, items.length);
    const nextIndex = items.findIndex((entry) => entry.item.code === nextItemCode);
    return nextIndex >= 0 ? nextIndex : clampItemUnitNavigationIndex(currentIndex, items.length);
}

export function buildUnitEquivalenceView(baseUnit, allowedUnit, savedFactor = "") {
    const automaticFactor = getDeterministicFactorToBase(baseUnit, allowedUnit);
    const value = automaticFactor || String(savedFactor || "");
    const baseLabel = baseUnit || "unidade base";
    return {
        value,
        isAutomatic: Boolean(automaticFactor),
        expression: `1 ${allowedUnit} = ${value || "…"} ${baseLabel}`,
        help: automaticFactor
            ? "Equivalência automática."
            : `Quanto 1 ${allowedUnit} representa em ${baseLabel}?`
    };
}

function renderAllowedUnit(unit, baseUnit) {
    const equivalence = unit.factorToBase
        ? `1 ${unit.label} = ${unit.factorToBase} ${baseUnit}`
        : `1 ${unit.label} = equivalência pendente`;
    const review = unit.requiresReview ? " · revisar" : "";
    return `
        <li>
            <strong>${escapeHtml(unit.label)}</strong>
            <span>${escapeHtml(equivalence)}${review}</span>
        </li>
    `;
}

function findCurrentControlledUnit(setting, label) {
    return setting?.allowedUnits.find((unit) => unit.label.toLocaleLowerCase("pt-BR") === label) || null;
}

function resolveControlledBaseLabel(setting) {
    return CONTROLLED_ITEM_UNIT_CATALOG.find((unit) => unit.label === setting?.baseUnit)?.label || "";
}

function renderControlledBaseOptions(setting) {
    const currentBase = resolveControlledBaseLabel(setting);
    return [
        '<option value="">Escolha a unidade usada no total</option>',
        ...CONTROLLED_ITEM_UNIT_CATALOG.map((unit) => `
            <option value="${escapeHtml(unit.label)}" ${unit.label === currentBase ? "selected" : ""}>
                ${escapeHtml(unit.label)}
            </option>
        `)
    ].join("");
}

function renderControlledUnitOption(setting, definition) {
    const currentUnit = findCurrentControlledUnit(setting, definition.label);
    const selected = Boolean(currentUnit);
    return `
        <label class="item-unit-chip" data-controlled-unit-chip="${escapeHtml(definition.label)}">
            <input type="checkbox" value="${escapeHtml(definition.label)}" data-controlled-unit ${selected ? "checked" : ""}>
            <span>${escapeHtml(definition.label)}</span>
        </label>
    `;
}

function getSettingUnitVariants(setting) {
    return (setting?.allowedUnits || []).map(getAllowedUnitVariant).filter(Boolean);
}

function renderVariableFamilyOption(setting, definition) {
    const hasVariant = getSettingUnitVariants(setting).some((variant) => variant.variantFamily === definition.family);
    const hasLegacyFamily = Boolean(findCurrentControlledUnit(setting, definition.family));
    return `
        <label class="item-unit-chip" data-unit-family-chip="${escapeHtml(definition.family)}">
            <input type="checkbox" value="${escapeHtml(definition.family)}" data-unit-family
                ${hasVariant || hasLegacyFamily ? "checked" : ""}>
            <span>${escapeHtml(definition.family)}</span>
        </label>
    `;
}

function renderVariantUnitControl(variant, definition) {
    if (definition.variantUnits.length === 1) {
        return `<span class="item-unit-variant-unit">${escapeHtml(definition.variantUnits[0])}</span>`;
    }
    return `
        <select data-variant-unit aria-label="Unidade da apresentação">
            ${definition.variantUnits.map((unit) => `
                <option value="${escapeHtml(unit)}" ${unit === variant.variantUnit ? "selected" : ""}>${escapeHtml(unit)}</option>
            `).join("")}
        </select>
    `;
}

function renderUnitVariantRow(variant, definition) {
    const draftId = variant.id || `variant-draft-${variantDraftSequence += 1}`;
    const legacyLabels = escapeHtml(JSON.stringify(variant.legacyLabels || []));
    return `
        <div class="item-unit-variant-row" data-unit-variant-row data-variant-id="${escapeHtml(draftId)}"
            data-variant-family="${escapeHtml(definition.family)}" data-legacy-labels="${legacyLabels}">
            <input type="text" inputmode="decimal" autocomplete="off" data-variant-value
                aria-label="Apresentação de ${escapeHtml(definition.family)}" value="${escapeHtml(variant.variantValue || "")}" placeholder="Quantidade">
            ${renderVariantUnitControl(variant, definition)}
            <button type="button" class="item-unit-variant-remove" data-remove-unit-variant>Remover</button>
            <small data-unit-variant-equivalence></small>
        </div>
    `;
}

function renderUnitVariantFamily(setting, definition) {
    const variants = getSettingUnitVariants(setting).filter((variant) => variant.variantFamily === definition.family);
    const hasLegacyFamily = Boolean(findCurrentControlledUnit(setting, definition.family));
    const isActive = variants.length > 0 || hasLegacyFamily;
    const editableVariants = variants.length > 0 ? variants : (hasLegacyFamily ? [{
        variantFamily: definition.family,
        variantValue: "",
        variantUnit: definition.variantUnits[0],
        legacyLabels: [definition.family]
    }] : []);
    return `
        <section class="item-unit-variant-family" data-unit-variant-family="${escapeHtml(definition.family)}" ${isActive ? "" : "hidden"}>
            <header><strong>${escapeHtml(definition.family === "porção" ? "Porções" : `${definition.family}s`)}</strong></header>
            <div class="item-unit-variant-list" data-unit-variant-list>
                ${editableVariants.map((variant) => renderUnitVariantRow(variant, definition)).join("")}
            </div>
            <button type="button" class="item-unit-variant-add" data-add-unit-variant="${escapeHtml(definition.family)}">
                + Adicionar ${escapeHtml(definition.family)}
            </button>
        </section>
    `;
}

function renderControlledEquivalence(setting, baseLabel, definition) {
    const currentUnit = findCurrentControlledUnit(setting, definition.label);
    const equivalence = buildUnitEquivalenceView(baseLabel, definition.label, currentUnit?.factorToBase);
    return `
        <div class="item-unit-equivalence" data-controlled-unit-row="${escapeHtml(definition.label)}" ${currentUnit ? "" : "hidden"}>
            <span>1 <strong>${escapeHtml(definition.label)}</strong> =</span>
            <input type="text" inputmode="decimal" autocomplete="off" data-unit-factor="${escapeHtml(definition.label)}"
                aria-label="Equivalência de ${escapeHtml(definition.label)}" value="${escapeHtml(equivalence.value)}"
                ${currentUnit ? "" : "disabled"} ${equivalence.isAutomatic ? "hidden readonly" : ""} placeholder="valor">
            <output data-unit-factor-output ${equivalence.isAutomatic ? "" : "hidden"}>${escapeHtml(equivalence.value)}</output>
            <strong data-equivalence-base>${escapeHtml(baseLabel || "base")}</strong>
            <small data-unit-factor-help>${escapeHtml(equivalence.help)}</small>
        </div>
    `;
}

function renderDefaultUnitOptions(setting) {
    const selectedUnits = simpleControlledUnits.filter((unit) => findCurrentControlledUnit(setting, unit.label));
    const variants = getSettingUnitVariants(setting);
    const variantDefault = variants.find((variant) => variant.legacyLabels.includes(setting?.defaultInputUnit));
    const selectedLabel = variantDefault?.label || setting?.defaultInputUnit;
    const labels = [...selectedUnits.map((unit) => unit.label), ...variants.map((variant) => variant.label)];
    const options = labels.map((label) => `
        <option value="${escapeHtml(label)}" ${label === selectedLabel ? "selected" : ""}>
            ${escapeHtml(label)}
        </option>
    `);
    return ['<option value="">Escolha entre as permitidas</option>', ...options].join("");
}

function renderLegacyUnitNotice(setting) {
    const controlledLabels = new Set(CONTROLLED_ITEM_UNIT_CATALOG.map((unit) => unit.label));
    const legacyLabels = (setting?.allowedUnits || []).filter((unit) => (
        !controlledLabels.has(unit.label) && !getAllowedUnitVariant(unit)
    )).map((unit) => unit.label);
    if (legacyLabels.length === 0) return "";
    return `
        <p class="item-unit-legacy-notice">
            Opções anteriores fora do catálogo: ${escapeHtml(legacyLabels.join(", "))}.
            Elas continuam legíveis acima e só serão substituídas se este editor for salvo.
        </p>
    `;
}

function renderControlledEditor(setting) {
    const baseLabel = resolveControlledBaseLabel(setting);
    return `
        <fieldset class="item-unit-controlled-fields">
            <legend>Unidades e equivalências</legend>
            <label>Unidade usada no total
                <select name="baseUnit" data-controlled-base required>${renderControlledBaseOptions(setting)}</select>
            </label>
            <p class="item-unit-base-help">As outras unidades são convertidas para esta.</p>
            <div class="item-unit-controlled-units">
                <span>Unidades permitidas</span>
                <div class="item-unit-chips">
                    ${simpleControlledUnits.map((unit) => renderControlledUnitOption(setting, unit)).join("")}
                    ${CONTROLLED_UNIT_VARIANT_FAMILIES.map((definition) => renderVariableFamilyOption(setting, definition)).join("")}
                </div>
            </div>
            <div class="item-unit-variant-families">
                ${CONTROLLED_UNIT_VARIANT_FAMILIES.map((definition) => renderUnitVariantFamily(setting, definition)).join("")}
            </div>
            <div class="item-unit-equivalences">
                <span>Equivalências</span>
                ${simpleControlledUnits.map((unit) => renderControlledEquivalence(setting, baseLabel, unit)).join("")}
            </div>
            <label>Unidade padrão ao contar
                <select name="defaultInputUnit" data-controlled-default required>${renderDefaultUnitOptions(setting)}</select>
            </label>
            <p class="item-unit-form-status" data-item-unit-form-status aria-live="polite"></p>
        </fieldset>
    `;
}

function formatAllowedUnits(setting) {
    const labels = (setting?.allowedUnits || []).map((unit) => unit.label);
    return labels.length ? labels.join(", ") : "—";
}

function renderSettingCard(item, setting) {
    const needsReview = doesItemUnitProfileNeedReview(setting);
    return `
        <article class="item-unit-card">
            <header>
                <div><strong>${escapeHtml(item.name)}</strong><span>Código: ${escapeHtml(item.code)}</span></div>
                <span class="item-unit-status" data-tone="${needsReview ? "warning" : "success"}">
                    ${needsReview ? "Revisar" : "Pronto"}
                </span>
            </header>
            <dl class="item-unit-metadata">
                <div><dt>Unidade usada no total</dt><dd>${escapeHtml(setting?.baseUnit || "—")}</dd></div>
                <div><dt>Padrão ao contar</dt><dd><strong>${escapeHtml(setting?.defaultInputUnit || "—")}</strong></dd></div>
                <div class="item-unit-metadata-wide"><dt>Permitidas</dt><dd>${escapeHtml(formatAllowedUnits(setting))}</dd></div>
            </dl>
            <button type="button" class="item-unit-edit-button" data-edit-item-unit>Editar unidades</button>
        </article>
    `;
}

function renderTechnicalDetails(setting, itemCode) {
    const source = sourceLabels[setting?.source] || sourceLabels.unknown;
    const confidence = confidenceLabels[setting?.confidence] || confidenceLabels.unknown;
    const allowedUnits = setting?.allowedUnits || [];
    return `
        <details class="item-unit-technical-details">
            <summary>Detalhes técnicos</summary>
            <dl>
                <div><dt>Origem</dt><dd>${escapeHtml(source)}</dd></div>
                <div><dt>Confiança</dt><dd>${escapeHtml(confidence)}</dd></div>
                <div><dt>Estado</dt><dd>${doesItemUnitProfileNeedReview(setting) ? "revisar" : "resolvido"}</dd></div>
            </dl>
            ${allowedUnits.length
        ? `<ul class="item-unit-allowed-list">${allowedUnits.map((unit) => renderAllowedUnit(unit, setting.baseUnit)).join("")}</ul>`
        : '<p class="item-unit-empty">Nenhum perfil automático encontrado.</p>'}
            ${renderLegacyUnitNotice(setting)}
            <button type="button" class="item-unit-clear-button" data-clear-item-unit="${escapeHtml(itemCode)}"
                ${setting?.source === "manual" ? "" : "disabled"}>Limpar configuração</button>
        </details>
    `;
}

function renderEditorSurface(entry, itemIndex, itemCount) {
    const setting = entry.setting;
    const previousItemCode = currentNavigationItems[itemIndex - 1]?.item.code || "";
    const nextItemCode = currentNavigationItems[itemIndex + 1]?.item.code || "";
    return `
        <header class="item-unit-editor-header">
            <button type="button" class="item-unit-editor-close" data-close-item-unit-editor aria-label="Fechar editor">Voltar</button>
            <div>
                <span>Item ${itemIndex + 1} de ${itemCount} · ${escapeHtml(entry.group.name)}</span>
                <h3 id="item-unit-editor-title">${escapeHtml(entry.item.name)}</h3>
                <small>Código: ${escapeHtml(entry.item.code)}</small>
            </div>
            <span class="item-unit-unsaved" data-item-unit-unsaved hidden>Não salvo</span>
        </header>
        <div class="item-unit-editor-scroll">
            <form id="item-unit-editor-form" class="item-unit-form" data-item-unit-form data-item-code="${escapeHtml(entry.item.code)}"
                data-factor-base="${escapeHtml(resolveControlledBaseLabel(setting))}">
                ${renderControlledEditor(setting)}
                ${renderTechnicalDetails(setting, entry.item.code)}
                <p class="item-unit-editor-feedback" data-item-unit-editor-feedback aria-live="polite"></p>
            </form>
        </div>
        <nav class="item-unit-editor-actions" aria-label="Ações do editor">
            <button type="button" data-editor-item-code="${escapeHtml(previousItemCode)}" ${previousItemCode ? "" : "disabled"}>Anterior</button>
            <button type="submit" form="item-unit-editor-form">Salvar</button>
            <button type="button" data-editor-item-code="${escapeHtml(nextItemCode)}" ${nextItemCode ? "" : "disabled"}>Próximo</button>
        </nav>
    `;
}

function renderActiveItem(entry, itemIndex, itemCount) {
    const isFirstItem = itemIndex === 0;
    const isLastItem = itemIndex === itemCount - 1;
    return `
        <section class="item-unit-sequence" data-active-item-code="${escapeHtml(entry.item.code)}">
            <header class="item-unit-sequence-header">
                <strong>Item ${itemIndex + 1} de ${itemCount}</strong>
                <span>Grupo: ${escapeHtml(entry.group.name)}</span>
            </header>
            ${renderSettingCard(entry.item, entry.setting)}
            <nav class="item-unit-navigation" aria-label="Navegação entre itens">
                <button type="button" data-previous-item ${isFirstItem ? "disabled" : ""}>Anterior</button>
                <span>Item ${itemIndex + 1} de ${itemCount}</span>
                <button type="button" data-next-item ${isLastItem ? "disabled" : ""}>Próximo</button>
            </nav>
        </section>
    `;
}

function updateFilterButtons() {
    document.querySelectorAll("[data-item-unit-filter]").forEach((button) => {
        const isActive = button.dataset.itemUnitFilter === activeProfileFilter;
        button.dataset.active = String(isActive);
        button.setAttribute("aria-pressed", String(isActive));
    });
}

function renderItems() {
    const template = currentViewModel?.selectedTemplate;
    const container = getElement("item-unit-groups");
    if (!template) {
        container.innerHTML = "";
        return;
    }
    currentNavigationItems = buildItemUnitNavigationItems(
        template,
        currentViewModel.settings,
        itemSearchQuery,
        activeProfileFilter
    );
    activeItemIndex = clampItemUnitNavigationIndex(activeItemIndex, currentNavigationItems.length);
    const activeEntry = currentNavigationItems[activeItemIndex];
    container.innerHTML = activeEntry
        ? renderActiveItem(activeEntry, activeItemIndex, currentNavigationItems.length)
        : '<p class="item-unit-empty">Nenhum item encontrado neste filtro.</p>';
    updateFilterButtons();
}

function focusActiveItem() {
    getElement("item-unit-groups").querySelector(".item-unit-sequence-header")?.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

function moveActiveItem(offset, shouldFocusQueue = true) {
    const nextIndex = clampItemUnitNavigationIndex(activeItemIndex + offset, currentNavigationItems.length);
    if (nextIndex === activeItemIndex) return;
    activeItemIndex = nextIndex;
    renderItems();
    if (shouldFocusQueue) focusActiveItem();
}

function getEditorDialog() {
    return getElement("item-unit-editor-dialog");
}

function getEditorForm() {
    return getElement("item-unit-editor-surface").querySelector("[data-item-unit-form]");
}

function getCurrentEditorValues() {
    const form = getEditorForm();
    return form ? JSON.stringify(collectControlledFormValues(form)) : "";
}

export function hasItemUnitFormChanged(initialValues, currentValues) {
    return String(initialValues || "") !== String(currentValues || "");
}

function isEditorDirty() {
    return getEditorDialog().open && hasItemUnitFormChanged(editorInitialValues, getCurrentEditorValues());
}

function updateEditorDirtyIndicator() {
    const indicator = getElement("item-unit-editor-surface").querySelector("[data-item-unit-unsaved]");
    if (indicator) indicator.hidden = !isEditorDirty();
}

function rememberEditorState() {
    editorInitialValues = getCurrentEditorValues();
    updateEditorDirtyIndicator();
}

function renderCurrentEditor() {
    const entry = currentNavigationItems[activeItemIndex];
    if (!entry) return false;
    const surface = getElement("item-unit-editor-surface");
    surface.innerHTML = renderEditorSurface(entry, activeItemIndex, currentNavigationItems.length);
    synchronizeControlledForm(getEditorForm());
    rememberEditorState();
    return true;
}

function lockPageForEditor() {
    document.body.classList.add("item-unit-editor-open");
}

function unlockPageAfterEditor() {
    document.body.classList.remove("item-unit-editor-open");
}

function openCurrentEditor(trigger) {
    if (!renderCurrentEditor()) return;
    editorReturnFocus = trigger || document.activeElement;
    lockPageForEditor();
    getEditorDialog().showModal();
    getElement("item-unit-editor-surface").querySelector("[data-close-item-unit-editor]")?.focus();
}

function closeCurrentEditor() {
    editorInitialValues = "";
    getEditorDialog().close();
    unlockPageAfterEditor();
    const fallbackFocus = getElement("item-unit-groups").querySelector("[data-edit-item-unit]");
    (editorReturnFocus?.isConnected ? editorReturnFocus : fallbackFocus)?.focus();
    editorReturnFocus = null;
}

function requestDiscardChanges(action, cancellation = null) {
    if (!isEditorDirty()) {
        action();
        return;
    }
    pendingDiscardAction = action;
    pendingDiscardCancellation = cancellation;
    getElement("item-unit-discard-dialog").showModal();
}

function continueEditing() {
    pendingDiscardCancellation?.();
    pendingDiscardAction = null;
    pendingDiscardCancellation = null;
    getElement("item-unit-discard-dialog").close();
    getEditorForm()?.querySelector("input:not([disabled]), select:not([disabled])")?.focus();
}

async function discardChanges() {
    const action = pendingDiscardAction;
    pendingDiscardAction = null;
    pendingDiscardCancellation = null;
    editorInitialValues = getCurrentEditorValues();
    getElement("item-unit-discard-dialog").close();
    await action?.();
}

function moveInsideEditor(itemCode) {
    requestDiscardChanges(() => {
        const nextIndex = currentNavigationItems.findIndex((entry) => entry.item.code === itemCode);
        if (nextIndex < 0) return;
        activeItemIndex = nextIndex;
        renderItems();
        renderCurrentEditor();
    });
}

function findControlledCheckbox(form, label) {
    return [...form.querySelectorAll("[data-controlled-unit]")].find((input) => input.value === label) || null;
}

function parseVariantLegacyLabels(row) {
    try {
        const labels = JSON.parse(row.dataset.legacyLabels || "[]");
        return Array.isArray(labels) ? labels : [];
    } catch {
        return [];
    }
}

function collectVariantRowValue(row) {
    const fixedUnit = CONTROLLED_UNIT_VARIANT_FAMILIES.find(
        (definition) => definition.family === row.dataset.variantFamily
    )?.variantUnits[0];
    return {
        variantFamily: row.dataset.variantFamily,
        variantValue: row.querySelector("[data-variant-value]").value,
        variantUnit: row.querySelector("[data-variant-unit]")?.value || fixedUnit || "",
        legacyLabels: parseVariantLegacyLabels(row)
    };
}

function getVariantLabels(form) {
    return [...form.querySelectorAll("[data-unit-variant-row]")]
        .map((row) => formatUnitVariantLabel(collectVariantRowValue(row)))
        .filter(Boolean);
}

function updateDefaultOptions(form) {
    const select = form.querySelector("[data-controlled-default]");
    const previousValue = select.value;
    const selectedLabels = [
        ...form.querySelectorAll("[data-controlled-unit]:checked")
    ].map((input) => input.value);
    selectedLabels.push(...getVariantLabels(form));
    select.innerHTML = "";
    appendOption(select, "", "Escolha entre as permitidas");
    selectedLabels.forEach((label) => appendOption(select, label, label, label === previousValue));
}

function isPositiveFactor(value) {
    const normalizedValue = String(value || "").trim().replace(",", ".");
    return /^\d+(?:\.\d+)?$/.test(normalizedValue) && Number(normalizedValue) > 0;
}

function updateFactorField(form, checkbox) {
    const baseLabel = form.elements.baseUnit.value;
    const factorInput = form.querySelector(`[data-unit-factor="${checkbox.value}"]`);
    const row = factorInput.closest("[data-controlled-unit-row]");
    const help = row.querySelector("[data-unit-factor-help]");
    const chip = form.querySelector(`[data-controlled-unit-chip="${checkbox.value}"]`);
    const factorOutput = row.querySelector("[data-unit-factor-output]");
    const equivalence = buildUnitEquivalenceView(baseLabel, checkbox.value, factorInput.value);
    checkbox.disabled = Boolean(baseLabel) && checkbox.value === baseLabel;
    row.hidden = !checkbox.checked;
    chip.dataset.selected = String(checkbox.checked);
    factorInput.disabled = !checkbox.checked;
    factorInput.readOnly = equivalence.isAutomatic;
    factorInput.hidden = equivalence.isAutomatic;
    factorOutput.hidden = !equivalence.isAutomatic;
    factorOutput.textContent = equivalence.value;
    if (checkbox.checked && equivalence.isAutomatic) factorInput.value = equivalence.value;
    row.querySelector("[data-equivalence-base]").textContent = baseLabel || "base";
    help.textContent = equivalence.help;
}

function updateVariantRow(form, row) {
    const result = buildControlledUnitVariant(form.elements.baseUnit.value, collectVariantRowValue(row));
    const equivalence = row.querySelector("[data-unit-variant-equivalence]");
    if (!result.isValid) {
        equivalence.textContent = result.error;
        equivalence.dataset.tone = "warning";
        return;
    }
    equivalence.textContent = `1 ${result.allowedUnit.label} = ${result.allowedUnit.factorToBase} ${form.elements.baseUnit.value}`;
    equivalence.dataset.tone = "success";
}

function findDuplicateVariantLabel(form) {
    const semanticKeys = new Set();
    for (const row of form.querySelectorAll("[data-unit-variant-row]")) {
        const variant = collectVariantRowValue(row);
        const semanticKey = getUnitVariantSemanticKey(variant);
        if (semanticKey && semanticKeys.has(semanticKey)) return formatUnitVariantLabel(variant);
        if (semanticKey) semanticKeys.add(semanticKey);
    }
    return "";
}

function updateFormReviewState(form) {
    const selectedCheckboxes = [...form.querySelectorAll("[data-controlled-unit]:checked")];
    const missingFactor = selectedCheckboxes.some((checkbox) => {
        const factorInput = form.querySelector(`[data-unit-factor="${checkbox.value}"]`);
        return !isPositiveFactor(factorInput.value);
    });
    const status = form.querySelector("[data-item-unit-form-status]");
    const variantRows = [...form.querySelectorAll("[data-unit-variant-row]")];
    const hasInvalidVariant = variantRows.some((row) => (
        !buildControlledUnitVariant(form.elements.baseUnit.value, collectVariantRowValue(row)).isValid
    ));
    const duplicateVariant = findDuplicateVariantLabel(form);
    if (hasInvalidVariant || duplicateVariant) {
        status.textContent = duplicateVariant
            ? `A variante ${duplicateVariant} está duplicada.`
            : "Complete as variantes e use uma unidade compatível no total.";
        status.dataset.tone = "warning";
        return;
    }
    if (missingFactor) {
        status.textContent = "Há unidade sem equivalência. O perfil poderá ser salvo, mas continuará pendente.";
        status.dataset.tone = "warning";
        return;
    }
    const selectedUnitCount = selectedCheckboxes.length + variantRows.length;
    status.textContent = selectedUnitCount ? "Todas as equivalências selecionadas estão definidas." : "Selecione as unidades permitidas.";
    status.dataset.tone = selectedUnitCount ? "success" : "warning";
}

function synchronizeControlledForm(form) {
    const baseLabel = form.elements.baseUnit.value;
    if (baseLabel) {
        const baseCheckbox = findControlledCheckbox(form, baseLabel);
        if (baseCheckbox) baseCheckbox.checked = true;
    }
    form.querySelectorAll("[data-controlled-unit]").forEach((checkbox) => updateFactorField(form, checkbox));
    form.querySelectorAll("[data-unit-variant-row]").forEach((row) => updateVariantRow(form, row));
    form.querySelectorAll("[data-unit-family]").forEach((checkbox) => {
        const chip = form.querySelector(`[data-unit-family-chip="${checkbox.value}"]`);
        if (chip) chip.dataset.selected = String(checkbox.checked);
    });
    updateDefaultOptions(form);
    updateFormReviewState(form);
}

function resetFactorsForBaseChange(form) {
    const nextBase = form.elements.baseUnit.value;
    if (form.dataset.factorBase === nextBase) return;
    form.querySelectorAll("[data-controlled-unit]").forEach((checkbox) => {
        const factorInput = form.querySelector(`[data-unit-factor="${checkbox.value}"]`);
        factorInput.value = getDeterministicFactorToBase(nextBase, checkbox.value) || "";
    });
    form.dataset.factorBase = nextBase;
}

function collectControlledFormValues(form) {
    const allowedUnits = [...form.querySelectorAll("[data-controlled-unit]:checked")].map((checkbox) => ({
        label: checkbox.value,
        factorToBase: form.querySelector(`[data-unit-factor="${checkbox.value}"]`).value
    }));
    allowedUnits.push(...[...form.querySelectorAll("[data-unit-variant-row]")].map(collectVariantRowValue));
    return {
        baseUnit: form.elements.baseUnit.value,
        defaultInputUnit: form.elements.defaultInputUnit.value,
        allowedUnits,
        // Revisão manual herdada não deve impedir que uma configuração completa seja resolvida.
        needsReview: false
    };
}

export function renderItemUnitSettings(viewModel) {
    const previousTemplateId = currentViewModel?.selectedTemplate?.id;
    currentViewModel = viewModel;
    if (previousTemplateId !== viewModel.selectedTemplate?.id) {
        itemSearchQuery = "";
        activeProfileFilter = "all";
        activeItemIndex = 0;
    }
    renderTemplateOptions(viewModel);
    const hasTemplate = Boolean(viewModel.selectedTemplate);
    getElement("item-unit-no-template").hidden = hasTemplate;
    getElement("item-unit-workspace").hidden = !hasTemplate;
    if (!hasTemplate) return;
    getElement("item-unit-search").value = itemSearchQuery;
    renderSummary(viewModel.summary);
    renderItems();
}

export function showItemUnitSettingsFeedback(message, tone = "") {
    const feedback = getElement("item-unit-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function connectItemUnitQueueControlEvents(handlers) {
    getElement("item-unit-template").addEventListener("change", (event) => {
        const nextTemplateId = event.target.value;
        requestDiscardChanges(async () => {
            if (getEditorDialog().open) closeCurrentEditor();
            await handlers.onSelectTemplate(nextTemplateId);
        }, () => {
            event.target.value = currentViewModel?.selectedTemplate?.id || "";
        });
    });
    getElement("btn-analyze-item-units").addEventListener("click", handlers.onAnalyze);
    getElement("item-unit-search").addEventListener("input", (event) => {
        const nextQuery = event.target.value;
        requestDiscardChanges(() => {
            if (getEditorDialog().open) closeCurrentEditor();
            itemSearchQuery = nextQuery;
            activeItemIndex = 0;
            renderItems();
        }, () => {
            event.target.value = itemSearchQuery;
        });
    });
    getElement("item-unit-filters").addEventListener("click", (event) => {
        const button = event.target.closest("[data-item-unit-filter]");
        if (!button) return;
        requestDiscardChanges(() => {
            if (getEditorDialog().open) closeCurrentEditor();
            activeProfileFilter = button.dataset.itemUnitFilter;
            activeItemIndex = 0;
            renderItems();
        });
    });
}

function connectItemUnitQueueNavigationEvents() {
    getElement("item-unit-groups").addEventListener("click", (event) => {
        const editButton = event.target.closest("[data-edit-item-unit]");
        if (editButton) {
            openCurrentEditor(editButton);
            return;
        }
        if (event.target.closest("[data-previous-item]")) moveActiveItem(-1);
        if (event.target.closest("[data-next-item]")) moveActiveItem(1);
    });
}

function getVariantFamilySection(form, family) {
    return [...form.querySelectorAll("[data-unit-variant-family]")].find(
        (section) => section.dataset.unitVariantFamily === family
    ) || null;
}

function addUnitVariantRow(form, family) {
    const definition = CONTROLLED_UNIT_VARIANT_FAMILIES.find((item) => item.family === family);
    const section = getVariantFamilySection(form, family);
    if (!definition || !section) return;
    const checkbox = [...form.querySelectorAll("[data-unit-family]")].find((input) => input.value === family);
    checkbox.checked = true;
    section.hidden = false;
    section.querySelector("[data-unit-variant-list]").insertAdjacentHTML("beforeend", renderUnitVariantRow({
        variantFamily: family,
        variantValue: "",
        variantUnit: definition.variantUnits[0],
        legacyLabels: []
    }, definition));
    synchronizeControlledForm(form);
}

function containsLegacyVariant(section) {
    return [...section.querySelectorAll("[data-unit-variant-row]")].some(
        (row) => parseVariantLegacyLabels(row).length > 0
    );
}

function confirmLegacyVariantRemoval() {
    return window.confirm("Esta variante mantém compatibilidade com lançamentos anteriores. Deseja removê-la mesmo assim?");
}

function toggleUnitVariantFamily(form, checkbox) {
    const section = getVariantFamilySection(form, checkbox.value);
    if (!section) return;
    if (!checkbox.checked && containsLegacyVariant(section) && !confirmLegacyVariantRemoval()) {
        checkbox.checked = true;
        return;
    }
    section.hidden = !checkbox.checked;
    if (!checkbox.checked) section.querySelector("[data-unit-variant-list]").innerHTML = "";
    if (checkbox.checked && !section.querySelector("[data-unit-variant-row]")) addUnitVariantRow(form, checkbox.value);
}

function removeUnitVariantRow(form, row) {
    if (parseVariantLegacyLabels(row).length > 0 && !confirmLegacyVariantRemoval()) return;
    const section = row.closest("[data-unit-variant-family]");
    row.remove();
    if (!section.querySelector("[data-unit-variant-row]")) {
        section.hidden = true;
        const family = section.dataset.unitVariantFamily;
        const checkbox = [...form.querySelectorAll("[data-unit-family]")].find((input) => input.value === family);
        if (checkbox) checkbox.checked = false;
    }
    synchronizeControlledForm(form);
    updateEditorDirtyIndicator();
}

function connectItemUnitEditorFieldEvents() {
    getElement("item-unit-editor-surface").addEventListener("change", (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        if (!form) return;
        if (event.target.matches("[data-unit-family]")) toggleUnitVariantFamily(form, event.target);
        if (event.target.matches("[data-controlled-base]")) resetFactorsForBaseChange(form);
        synchronizeControlledForm(form);
        updateEditorDirtyIndicator();
    });
    getElement("item-unit-editor-surface").addEventListener("input", (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        if (form && event.target.matches("[data-unit-factor]")) updateFormReviewState(form);
        if (form && event.target.matches("[data-variant-value]")) synchronizeControlledForm(form);
        if (form) updateEditorDirtyIndicator();
    });
}

function copyItemUnitFeedbackToEditor(form) {
    const globalFeedback = getElement("item-unit-feedback");
    const editorFeedback = form.querySelector("[data-item-unit-editor-feedback]");
    editorFeedback.textContent = globalFeedback.textContent;
    editorFeedback.dataset.tone = globalFeedback.dataset.tone || "";
}

function connectItemUnitEditorSubmitEvent(handlers) {
    getElement("item-unit-editor-surface").addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        if (!form) return;
        event.preventDefault();
        const didSave = await handlers.onSaveManual(form.dataset.itemCode, collectControlledFormValues(form));
        copyItemUnitFeedbackToEditor(form);
        if (!didSave) {
            updateEditorDirtyIndicator();
            return;
        }
        rememberEditorState();
    });
}

function connectItemUnitEditorNavigationEvents(handlers) {
    getElement("item-unit-editor-surface").addEventListener("click", (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        const addVariantButton = event.target.closest("[data-add-unit-variant]");
        if (form && addVariantButton) {
            addUnitVariantRow(form, addVariantButton.dataset.addUnitVariant);
            updateEditorDirtyIndicator();
            return;
        }
        const removeVariantButton = event.target.closest("[data-remove-unit-variant]");
        if (form && removeVariantButton) {
            removeUnitVariantRow(form, removeVariantButton.closest("[data-unit-variant-row]"));
            return;
        }
        if (event.target.closest("[data-close-item-unit-editor]")) {
            requestDiscardChanges(closeCurrentEditor);
            return;
        }
        const navigationButton = event.target.closest("[data-editor-item-code]");
        if (navigationButton && !navigationButton.disabled) {
            moveInsideEditor(navigationButton.dataset.editorItemCode);
            return;
        }
        const button = event.target.closest("[data-clear-item-unit]");
        if (!button || button.disabled) return;
        requestDiscardChanges(async () => {
            const didClear = await handlers.onClearManual(button.dataset.clearItemUnit);
            if (didClear === null) {
                renderCurrentEditor();
                return;
            }
            if (!didClear) {
                renderCurrentEditor();
                copyItemUnitFeedbackToEditor(getEditorForm());
                return;
            }
            closeCurrentEditor();
        });
    });
}

export function connectItemUnitSettingsEvents(handlers) {
    connectItemUnitQueueControlEvents(handlers);
    connectItemUnitQueueNavigationEvents();
    connectItemUnitEditorFieldEvents();
    connectItemUnitEditorSubmitEvent(handlers);
    connectItemUnitEditorNavigationEvents(handlers);
    connectItemUnitDialogEvents();
    window.addEventListener("beforeunload", protectUnsavedItemUnitChanges);
}

function connectItemUnitDialogEvents() {
    const editorDialog = getEditorDialog();
    editorDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        requestDiscardChanges(closeCurrentEditor);
    });
    editorDialog.addEventListener("click", (event) => {
        if (event.target === editorDialog) requestDiscardChanges(closeCurrentEditor);
    });
    const discardDialog = getElement("item-unit-discard-dialog");
    discardDialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        continueEditing();
    });
    discardDialog.querySelector("[data-continue-item-unit-editing]").addEventListener("click", continueEditing);
    discardDialog.querySelector("[data-discard-item-unit-changes]").addEventListener("click", discardChanges);
}

function protectUnsavedItemUnitChanges(event) {
    if (!isEditorDirty()) return;
    event.preventDefault();
    event.returnValue = "";
}
