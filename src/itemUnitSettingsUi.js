let currentViewModel = null;
let itemSearchQuery = "";

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

function renderDefaultUnitOptions(setting) {
    if (!setting?.allowedUnits.length) return '<option value="">Sem opções geradas</option>';
    return setting.allowedUnits.map((unit) => `
        <option value="${escapeHtml(unit.label)}" ${unit.label === setting.defaultInputUnit ? "selected" : ""}>
            ${escapeHtml(unit.label)}
        </option>
    `).join("");
}

function renderSettingCard(item, setting) {
    const baseUnit = setting?.baseUnit || "—";
    const defaultInputUnit = setting?.defaultInputUnit || "—";
    const source = sourceLabels[setting?.source] || sourceLabels.unknown;
    const confidence = confidenceLabels[setting?.confidence] || confidenceLabels.unknown;
    const reviewLabel = setting?.needsReview ? "sim" : "não";
    return `
        <article class="item-unit-card">
            <header>
                <strong>${escapeHtml(item.name)}</strong>
                <span>Código: ${escapeHtml(item.code)}</span>
            </header>
            <dl class="item-unit-metadata">
                <div><dt>Unidade base</dt><dd>${escapeHtml(baseUnit)}</dd></div>
                <div><dt>Padrão de entrada</dt><dd><strong>${escapeHtml(defaultInputUnit)}</strong></dd></div>
                <div><dt>Origem</dt><dd>${escapeHtml(source)}</dd></div>
                <div><dt>Confiança</dt><dd>${escapeHtml(confidence)}</dd></div>
                <div><dt>Revisão necessária</dt><dd>${reviewLabel}</dd></div>
            </dl>
            <h5>Unidades permitidas</h5>
            ${setting?.allowedUnits.length
        ? `<ul class="item-unit-allowed-list">${setting.allowedUnits.map(renderAllowedUnit).join("")}</ul>`
        : '<p class="item-unit-empty">Nenhum perfil automático encontrado.</p>'}
            <form class="item-unit-form" data-item-unit-form data-item-code="${escapeHtml(item.code)}">
                <label>Unidade base
                    <input type="text" name="baseUnit" maxlength="60" autocomplete="off" value="${escapeHtml(setting?.baseUnit || "")}" placeholder="Ex.: un, kg, l, porção">
                </label>
                <label>Unidade padrão ao contar
                    <select name="defaultInputUnit" ${setting?.allowedUnits.length ? "" : "disabled"}>
                        ${renderDefaultUnitOptions(setting)}
                    </select>
                </label>
                <label class="item-unit-review-field">
                    <input type="checkbox" name="needsReview" ${setting?.needsReview ? "checked" : ""}>
                    Marcar para revisão
                </label>
                <div class="item-unit-actions">
                    <button type="submit" ${setting?.allowedUnits.length ? "" : "disabled"}>Salvar perfil manual</button>
                    <button type="button" data-clear-item-unit="${escapeHtml(item.code)}" ${setting?.source === "manual" ? "" : "disabled"}>Limpar configuração</button>
                </div>
            </form>
        </article>
    `;
}

function renderGroup(group, settingsByItem) {
    const matchingItems = (group.items || []).filter((item) => matchesSearch(item, group));
    if (matchingItems.length === 0) return "";
    return `
        <details class="item-unit-group" ${itemSearchQuery ? "open" : ""}>
            <summary>${escapeHtml(group.name)} — ${matchingItems.length} item(ns)</summary>
            <div class="item-unit-list">
                ${matchingItems.map((item) => renderSettingCard(item, settingsByItem.get(item.code))).join("")}
            </div>
        </details>
    `;
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
    container.innerHTML = content || '<p class="item-unit-empty">Nenhum item encontrado.</p>';
}

export function renderItemUnitSettings(viewModel) {
    const previousTemplateId = currentViewModel?.selectedTemplate?.id;
    currentViewModel = viewModel;
    if (previousTemplateId !== viewModel.selectedTemplate?.id) itemSearchQuery = "";
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
    getElement("item-unit-groups").addEventListener("submit", async (event) => {
        const form = event.target.closest("[data-item-unit-form]");
        if (!form) return;
        event.preventDefault();
        await handlers.onSaveManual(form.dataset.itemCode, {
            baseUnit: form.elements.baseUnit.value,
            defaultInputUnit: form.elements.defaultInputUnit.value,
            needsReview: form.elements.needsReview.checked
        });
    });
    getElement("item-unit-groups").addEventListener("click", async (event) => {
        const button = event.target.closest("[data-clear-item-unit]");
        if (!button || button.disabled) return;
        await handlers.onClearManual(button.dataset.clearItemUnit);
    });
}
