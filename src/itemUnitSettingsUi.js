import {
    CONTROLLED_ITEM_UNIT_CATALOG,
    doesItemUnitProfileNeedReview,
    getDeterministicFactorToBase,
    isItemUnitProfileComplete
} from "./itemUnitSettings.js";

let currentViewModel = null;
let itemSearchQuery = "";
let activeProfileFilter = "all";

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
        <div><dt>Total de itens</dt><dd>${summary.itemCount}</dd></div>
        <div><dt>Perfis completos</dt><dd>${summary.completeProfileCount}</dd></div>
        <div><dt>Revisão necessária</dt><dd>${summary.needsReviewCount}</dd></div>
        <div><dt>Sem perfil</dt><dd>${summary.withoutProfileCount}</dd></div>
        <div><dt>Pacote ambíguo</dt><dd>${summary.ambiguousPackageCount}</dd></div>
        <div><dt>Porção sem peso</dt><dd>${summary.portionWithoutWeightCount}</dd></div>
    `;
}

function matchesSearch(item, group) {
    const query = itemSearchQuery.trim().toLocaleLowerCase("pt-BR");
    if (!query) return true;
    return `${item.code} ${item.name} ${group.name}`.toLocaleLowerCase("pt-BR").includes(query);
}

function matchesProfileFilter(setting) {
    if (activeProfileFilter === "review") return doesItemUnitProfileNeedReview(setting);
    if (activeProfileFilter === "missing") return !isItemUnitProfileComplete(setting);
    return true;
}

function renderAllowedUnit(unit) {
    const factor = unit.factorToBase ? `fator ${unit.factorToBase}` : "fator indefinido";
    const review = unit.requiresReview ? " · revisar" : "";
    return `
        <li>
            <strong>${escapeHtml(unit.label)}</strong>
            <span>normaliza: ${escapeHtml(unit.normalizedUnit)} · ${escapeHtml(factor)}${review}</span>
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
        '<option value="">Escolha a unidade base</option>',
        ...CONTROLLED_ITEM_UNIT_CATALOG.map((unit) => `
            <option value="${escapeHtml(unit.label)}" ${unit.label === currentBase ? "selected" : ""}>
                ${escapeHtml(unit.label)}
            </option>
        `)
    ].join("");
}

function renderControlledUnitOption(setting, baseLabel, definition) {
    const currentUnit = findCurrentControlledUnit(setting, definition.label);
    const deterministicFactor = getDeterministicFactorToBase(baseLabel, definition.label);
    const factor = deterministicFactor || currentUnit?.factorToBase || "";
    const selected = Boolean(currentUnit);
    return `
        <div class="item-unit-controlled-option" data-controlled-unit-row="${escapeHtml(definition.label)}">
            <label class="item-unit-controlled-check">
                <input type="checkbox" value="${escapeHtml(definition.label)}" data-controlled-unit ${selected ? "checked" : ""}>
                <strong>${escapeHtml(definition.label)}</strong>
            </label>
            <label>Fator para a base
                <input type="text" inputmode="decimal" autocomplete="off" data-unit-factor="${escapeHtml(definition.label)}"
                    value="${escapeHtml(factor)}" ${selected ? "" : "disabled"} ${deterministicFactor ? "readonly" : ""} placeholder="Obrigatório">
            </label>
            <small data-unit-factor-help>${deterministicFactor ? "Fator matemático automático." : "Informe a equivalência deste item."}</small>
        </div>
    `;
}

function renderDefaultUnitOptions(setting) {
    const selectedUnits = CONTROLLED_ITEM_UNIT_CATALOG.filter((unit) => findCurrentControlledUnit(setting, unit.label));
    const options = selectedUnits.map((unit) => `
        <option value="${escapeHtml(unit.label)}" ${unit.label === setting?.defaultInputUnit ? "selected" : ""}>
            ${escapeHtml(unit.label)}
        </option>
    `);
    return ['<option value="">Escolha entre as permitidas</option>', ...options].join("");
}

function renderLegacyUnitNotice(setting) {
    const controlledLabels = new Set(CONTROLLED_ITEM_UNIT_CATALOG.map((unit) => unit.label));
    const legacyLabels = (setting?.allowedUnits || []).filter((unit) => !controlledLabels.has(unit.label)).map((unit) => unit.label);
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
            <legend>Perfil controlado</legend>
            <label>Unidade base
                <select name="baseUnit" data-controlled-base required>${renderControlledBaseOptions(setting)}</select>
            </label>
            <div class="item-unit-controlled-units">
                <span>Unidades permitidas</span>
                ${CONTROLLED_ITEM_UNIT_CATALOG.map((unit) => renderControlledUnitOption(setting, baseLabel, unit)).join("")}
            </div>
            <label>Unidade padrão ao contar
                <select name="defaultInputUnit" data-controlled-default required>${renderDefaultUnitOptions(setting)}</select>
            </label>
            <label class="item-unit-review-field">
                <input type="checkbox" name="needsReview" ${setting?.needsReview ? "checked" : ""}>
                Manter marcado para revisão
            </label>
            <p class="item-unit-form-status" data-item-unit-form-status aria-live="polite"></p>
        </fieldset>
    `;
}

function renderSettingCard(item, setting) {
    const source = sourceLabels[setting?.source] || sourceLabels.unknown;
    const confidence = confidenceLabels[setting?.confidence] || confidenceLabels.unknown;
    const needsReview = doesItemUnitProfileNeedReview(setting);
    return `
        <article class="item-unit-card">
            <header><strong>${escapeHtml(item.name)}</strong><span>Código: ${escapeHtml(item.code)}</span></header>
            <dl class="item-unit-metadata">
                <div><dt>Unidade base atual</dt><dd>${escapeHtml(setting?.baseUnit || "—")}</dd></div>
                <div><dt>Padrão atual</dt><dd><strong>${escapeHtml(setting?.defaultInputUnit || "—")}</strong></dd></div>
                <div><dt>Origem</dt><dd>${escapeHtml(source)}</dd></div>
                <div><dt>Confiança</dt><dd>${escapeHtml(confidence)}</dd></div>
                <div><dt>Revisão necessária</dt><dd>${needsReview ? "sim" : "não"}</dd></div>
            </dl>
            <h5>Perfil atual</h5>
            ${setting?.allowedUnits.length
        ? `<ul class="item-unit-allowed-list">${setting.allowedUnits.map(renderAllowedUnit).join("")}</ul>`
        : '<p class="item-unit-empty">Nenhum perfil automático encontrado.</p>'}
            ${renderLegacyUnitNotice(setting)}
            <details class="item-unit-editor">
                <summary>Configurar perfil controlado</summary>
                <form class="item-unit-form" data-item-unit-form data-item-code="${escapeHtml(item.code)}"
                    data-factor-base="${escapeHtml(resolveControlledBaseLabel(setting))}">
                    ${renderControlledEditor(setting)}
                    <div class="item-unit-actions">
                        <button type="submit">Salvar perfil controlado</button>
                        <button type="button" data-clear-item-unit="${escapeHtml(item.code)}" ${setting?.source === "manual" ? "" : "disabled"}>Limpar configuração</button>
                    </div>
                </form>
            </details>
        </article>
    `;
}

function renderGroup(group, settingsByItem) {
    const matchingItems = (group.items || []).filter((item) => {
        const setting = settingsByItem.get(item.code);
        return matchesSearch(item, group) && matchesProfileFilter(setting);
    });
    if (matchingItems.length === 0) return "";
    const shouldOpen = itemSearchQuery || activeProfileFilter !== "all";
    return `
        <details class="item-unit-group" ${shouldOpen ? "open" : ""}>
            <summary>${escapeHtml(group.name)} — ${matchingItems.length} item(ns)</summary>
            <div class="item-unit-list">
                ${matchingItems.map((item) => renderSettingCard(item, settingsByItem.get(item.code))).join("")}
            </div>
        </details>
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
    const settingsByItem = new Map(currentViewModel.settings.map((setting) => [setting.itemCode, setting]));
    const content = template.groups.map((group) => renderGroup(group, settingsByItem)).join("");
    container.innerHTML = content || '<p class="item-unit-empty">Nenhum item encontrado neste filtro.</p>';
    container.querySelectorAll("[data-item-unit-form]").forEach((form) => synchronizeControlledForm(form));
    updateFilterButtons();
}

function findControlledCheckbox(form, label) {
    return [...form.querySelectorAll("[data-controlled-unit]")].find((input) => input.value === label) || null;
}

function updateDefaultOptions(form) {
    const select = form.querySelector("[data-controlled-default]");
    const previousValue = select.value;
    const selectedLabels = [...form.querySelectorAll("[data-controlled-unit]:checked")].map((input) => input.value);
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
    const help = factorInput.closest("[data-controlled-unit-row]").querySelector("[data-unit-factor-help]");
    const deterministicFactor = getDeterministicFactorToBase(baseLabel, checkbox.value);
    factorInput.disabled = !checkbox.checked;
    factorInput.readOnly = Boolean(deterministicFactor);
    if (checkbox.checked && deterministicFactor) factorInput.value = deterministicFactor;
    help.textContent = deterministicFactor ? "Fator matemático automático." : "Informe a equivalência deste item.";
}

function updateFormReviewState(form) {
    const selectedCheckboxes = [...form.querySelectorAll("[data-controlled-unit]:checked")];
    const missingFactor = selectedCheckboxes.some((checkbox) => {
        const factorInput = form.querySelector(`[data-unit-factor="${checkbox.value}"]`);
        return !isPositiveFactor(factorInput.value);
    });
    const reviewInput = form.elements.needsReview;
    const status = form.querySelector("[data-item-unit-form-status]");
    if (missingFactor) {
        reviewInput.checked = true;
        reviewInput.disabled = true;
        status.textContent = "Há unidade sem fator. O perfil poderá ser salvo, mas continuará pendente.";
        status.dataset.tone = "warning";
        return;
    }
    reviewInput.disabled = false;
    status.textContent = selectedCheckboxes.length ? "Todos os fatores selecionados estão definidos." : "Selecione as unidades permitidas.";
    status.dataset.tone = selectedCheckboxes.length ? "success" : "warning";
}

function synchronizeControlledForm(form) {
    const baseLabel = form.elements.baseUnit.value;
    if (baseLabel) {
        const baseCheckbox = findControlledCheckbox(form, baseLabel);
        if (baseCheckbox) baseCheckbox.checked = true;
    }
    form.querySelectorAll("[data-controlled-unit]").forEach((checkbox) => updateFactorField(form, checkbox));
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
    return {
        baseUnit: form.elements.baseUnit.value,
        defaultInputUnit: form.elements.defaultInputUnit.value,
        allowedUnits,
        needsReview: form.elements.needsReview.checked
    };
}

export function renderItemUnitSettings(viewModel) {
    const previousTemplateId = currentViewModel?.selectedTemplate?.id;
    currentViewModel = viewModel;
    if (previousTemplateId !== viewModel.selectedTemplate?.id) {
        itemSearchQuery = "";
        activeProfileFilter = "all";
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

export function connectItemUnitSettingsEvents(handlers) {
    getElement("item-unit-template").addEventListener("change", (event) => handlers.onSelectTemplate(event.target.value));
    getElement("btn-analyze-item-units").addEventListener("click", handlers.onAnalyze);
    getElement("item-unit-search").addEventListener("input", (event) => {
        itemSearchQuery = event.target.value;
        renderItems();
    });
    getElement("item-unit-filters").addEventListener("click", (event) => {
        const button = event.target.closest("[data-item-unit-filter]");
        if (!button) return;
        activeProfileFilter = button.dataset.itemUnitFilter;
        renderItems();
    });
    getElement("item-unit-groups").addEventListener("change", (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        if (!form) return;
        if (event.target.matches("[data-controlled-base]")) resetFactorsForBaseChange(form);
        synchronizeControlledForm(form);
    });
    getElement("item-unit-groups").addEventListener("input", (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        if (form && event.target.matches("[data-unit-factor]")) updateFormReviewState(form);
    });
    getElement("item-unit-groups").addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        if (!form) return;
        event.preventDefault();
        await handlers.onSaveManual(form.dataset.itemCode, collectControlledFormValues(form));
    });
    getElement("item-unit-groups").addEventListener("click", async (event) => {
        const button = event.target.closest("[data-clear-item-unit]");
        if (!button || button.disabled) return;
        await handlers.onClearManual(button.dataset.clearItemUnit);
    });
}
