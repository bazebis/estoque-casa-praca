function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function formatSessionStatus(status) {
    return status === "in_progress" ? "Em andamento" : "Rascunho";
}

// The guided position is UI-only so counting records remain independent from navigation preferences.
let activeViewModel = null;
let currentItemIndex = 0;

const shortDateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
});

function renderOverviewGuidance(overview) {
    if (!overview.hasTemplate) {
        return "Importe um template e execute Configurações → Piloto rápido para liberar as áreas.";
    }
    if (overview.configuredAreaCount === 0) {
        return "Nenhuma área macro está configurada. Execute Configurações → Piloto rápido.";
    }
    if (overview.availableAreaCount === 0) {
        return "As áreas ainda não possuem vínculos ativos. Revise Configurações → Piloto rápido.";
    }
    return "Escolha uma área para continuar uma contagem ou iniciar um novo rascunho.";
}

function renderAreaCard(area) {
    const sessionWarning = area.openSessionCount > 1
        ? `<span class="pilot-area-warning">${area.openSessionCount} sessões abertas; a mais recente será usada.</span>`
        : "";
    return `
        <button type="button" class="pilot-area-card" data-area-location-id="${escapeHtml(area.location.id)}" ${area.available ? "" : "disabled"}>
            <strong>${escapeHtml(area.name)}</strong>
            <span>${area.itemCount} item(ns)</span>
            <span>${area.progress.countedItems} de ${area.progress.totalItems} com entrada</span>
            <span class="pilot-area-status">${escapeHtml(area.status)}</span>
            ${sessionWarning}
        </button>
    `;
}

export function renderAreaCountingOverview(overview) {
    getElement("pilot-area-guidance").textContent = renderOverviewGuidance(overview);
    getElement("pilot-area-list").innerHTML = overview.areas.map(renderAreaCard).join("");
}

function renderEntry(entry) {
    const unit = entry.rawUnit || "sem unidade";
    const createdAt = new Date(entry.createdAt);
    const timestamp = Number.isNaN(createdAt.getTime())
        ? "horário indisponível"
        : shortDateTimeFormatter.format(createdAt);
    return `
        <li class="area-count-entry">
            <div>
                <strong>${escapeHtml(entry.rawQuantityText.trim())} ${escapeHtml(unit)}</strong>
                <span>${escapeHtml(timestamp)}</span>
                ${entry.notes ? `<span>Observação registrada anteriormente: ${escapeHtml(entry.notes)}</span>` : ""}
            </div>
            <button type="button" data-remove-area-entry="${escapeHtml(entry.id)}">Remover</button>
        </li>
    `;
}

function formatSubtotal(summary) {
    if (!summary?.activeEntries.length) return "Nenhuma entrada";
    if (summary.hasMixedUnits) return "Unidades diferentes — subtotal não calculado";
    const unit = summary.normalizedUnit ? ` ${summary.normalizedUnit}` : " (sem unidade)";
    return `${summary.subtotal}${unit}`;
}

function formatUnitHint(profile) {
    if (!profile?.baseUnit) return "";
    const review = profile.needsReview ? " · perfil marcado para revisão" : "";
    return `<p class="area-count-unit-hint">Base: <strong>${escapeHtml(profile.baseUnit)}</strong>. Conversões serão aplicadas em etapa futura${review}.</p>`;
}

function renderAllowedUnitOptions(profile) {
    return profile.allowedUnits.map((unit) => {
        const review = unit.requiresReview ? " (revisar)" : "";
        const selected = unit.label === profile.defaultInputUnit ? "selected" : "";
        return `<option value="${escapeHtml(unit.label)}" ${selected}>${escapeHtml(unit.label)}${review}</option>`;
    }).join("");
}

function renderUnitField(profile, lastUsedUnit) {
    if (!profile?.allowedUnits.length) {
        const initialUnit = profile?.effectiveUnit || lastUsedUnit;
        return `
            <label>Unidade livre
                <input type="text" name="unit" maxlength="60" autocomplete="off" value="${escapeHtml(initialUnit)}" placeholder="Ex.: un, kg, caixa">
            </label>
        `;
    }
    return `
        <label>Unidade permitida
            <select name="unit" data-profile-unit-select>
                ${renderAllowedUnitOptions(profile)}
                <option value="__other__">Outra unidade</option>
            </select>
        </label>
        <label data-custom-unit-field hidden>Outra unidade
            <input type="text" name="customUnit" maxlength="60" autocomplete="off" placeholder="Digite a unidade">
        </label>
        <p class="area-count-other-unit-warning" data-custom-unit-warning hidden>Unidade fora do perfil; revise esta entrada futuramente.</p>
    `;
}

function renderItemCard(item, summary, lastUsedUnit, unitSetting) {
    const activeEntries = summary?.activeEntries || [];
    return `
        <article class="area-count-item-card" tabindex="-1">
            <header>
                <span>${escapeHtml(item.groupNameSnapshot)}</span>
                <h3>${escapeHtml(item.itemNameSnapshot)}</h3>
                <p>Código: ${escapeHtml(item.itemCode)}</p>
            </header>
            <p class="area-count-subtotal"><strong>Subtotal:</strong> ${escapeHtml(formatSubtotal(summary))}</p>
            ${formatUnitHint(unitSetting)}
            ${summary?.removedEntryCount ? `<p class="area-count-removed">${summary.removedEntryCount} entrada(s) removida(s)</p>` : ""}
            <section class="area-count-entry-section" aria-label="Aferições do item atual">
                <h4>Aferições deste item</h4>
                ${activeEntries.length
        ? `<ul class="area-count-entry-list">${activeEntries.map(renderEntry).join("")}</ul>`
        : '<p class="area-count-empty-entries">Nenhuma aferição registrada. Você pode pular este item.</p>'}
            </section>
            <form class="area-count-entry-form" data-item-code="${escapeHtml(item.itemCode)}" data-link-id="${escapeHtml(item.linkId)}">
                <label>Quantidade
                    <input type="text" name="quantity" inputmode="decimal" required maxlength="80" autocomplete="off" placeholder="Ex.: 1,5">
                </label>
                ${renderUnitField(unitSetting, lastUsedUnit)}
                <button type="submit">Adicionar entrada</button>
            </form>
        </article>
    `;
}

function getCurrentItemKey() {
    const item = activeViewModel?.session.plannedItems[currentItemIndex];
    return item ? `${item.itemCode}::${item.linkId}` : "";
}

function findItemIndexByKey(items, itemKey) {
    return items.findIndex((item) => `${item.itemCode}::${item.linkId}` === itemKey);
}

function updateNavigationButtons(itemCount) {
    getElement("btn-previous-area-item").disabled = currentItemIndex <= 0;
    getElement("btn-next-area-item").disabled = itemCount === 0 || currentItemIndex >= itemCount - 1;
}

function renderCurrentItem(shouldFocus = false) {
    const items = activeViewModel?.session.plannedItems || [];
    const currentItem = items[currentItemIndex];
    getElement("area-counting-current-index").textContent = currentItem
        ? `Item ${currentItemIndex + 1} de ${items.length}`
        : "Nenhum item planejado";
    updateNavigationButtons(items.length);

    getElement("area-counting-items").innerHTML = currentItem
        ? renderItemCard(
            currentItem,
            activeViewModel.entriesByItem.get(currentItem.itemCode),
            activeViewModel.lastUsedUnit,
            activeViewModel.unitSettingsByItem.get(currentItem.itemCode)
        )
        : '<p class="area-counting-warning">Esta sessão não possui itens planejados.</p>';
    if (shouldFocus) getElement("area-counting-items").querySelector("article")?.focus();
}

function matchesSearch(item, query) {
    const searchText = `${item.itemCode} ${item.itemNameSnapshot} ${item.groupNameSnapshot}`
        .toLocaleLowerCase("pt-BR");
    return searchText.includes(query);
}

function renderSearchResult(item, itemIndex) {
    return `
        <button type="button" class="area-count-search-result" data-area-item-index="${itemIndex}">
            <strong>${escapeHtml(item.itemNameSnapshot)}</strong>
            <span>${escapeHtml(item.itemCode)} · ${escapeHtml(item.groupNameSnapshot)}</span>
        </button>
    `;
}

function renderSearchResults(searchText) {
    const query = searchText.trim().toLocaleLowerCase("pt-BR");
    const resultContainer = getElement("area-counting-search-results");
    const guidance = getElement("area-counting-search-guidance");
    if (!query) {
        guidance.textContent = "Digite para localizar e ir diretamente a outro item.";
        resultContainer.innerHTML = "";
        return;
    }

    const matches = (activeViewModel?.session.plannedItems || [])
        .map((item, itemIndex) => ({ item, itemIndex }))
        .filter(({ item }) => matchesSearch(item, query));
    const visibleMatches = matches.slice(0, 12);
    guidance.textContent = matches.length
        ? `${matches.length} item(ns) encontrado(s)${matches.length > visibleMatches.length ? "; mostrando os primeiros 12" : ""}.`
        : "Nenhum item encontrado.";
    resultContainer.innerHTML = visibleMatches
        .map(({ item, itemIndex }) => renderSearchResult(item, itemIndex))
        .join("");
}

export function renderAreaCountingView(viewModel, multipleSessionCount = 0) {
    const previousSessionId = activeViewModel?.session.id;
    const previousItemKey = getCurrentItemKey();
    const { session, entriesByItem, unitSettingsByItem, progress, lastUsedUnit } = viewModel;
    activeViewModel = { session, entriesByItem, unitSettingsByItem, progress, lastUsedUnit };
    const preservedIndex = previousSessionId === session.id
        ? findItemIndexByKey(session.plannedItems, previousItemKey)
        : -1;
    currentItemIndex = preservedIndex >= 0 ? preservedIndex : 0;

    getElement("area-counting-title").textContent = session.reportAreaSnapshot || session.locationPathSnapshot.at(-1);
    getElement("area-counting-template").textContent = session.templateNameSnapshot;
    getElement("area-counting-status").textContent = formatSessionStatus(session.status);
    getElement("area-counting-progress-text").textContent = `${progress.countedItems} de ${progress.totalItems} itens com entrada`;
    getElement("area-counting-progress").max = Math.max(progress.totalItems, 1);
    getElement("area-counting-progress").value = progress.countedItems;
    getElement("area-counting-session-warning").hidden = multipleSessionCount < 2;
    getElement("area-counting-session-warning").textContent = multipleSessionCount < 2
        ? ""
        : `${multipleSessionCount} sessões abertas foram encontradas. A sessão mais recente está sendo usada.`;
    if (previousSessionId !== session.id) getElement("area-counting-search").value = "";
    renderCurrentItem();
    renderSearchResults(getElement("area-counting-search").value);
}

export function showAreaCountingView() {
    getElement("pilot-dashboard").hidden = true;
    getElement("area-counting-view").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

export function hideAreaCountingView() {
    getElement("area-counting-view").hidden = true;
    getElement("pilot-dashboard").hidden = false;
    activeViewModel = null;
    currentItemIndex = 0;
}

export function showAreaCountingFeedback(message, tone = "") {
    const feedback = getElement("area-counting-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function goToItem(itemIndex) {
    const itemCount = activeViewModel?.session.plannedItems.length || 0;
    if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= itemCount) return;
    currentItemIndex = itemIndex;
    showAreaCountingFeedback("");
    renderCurrentItem(true);
}

function getEntryFormValues(form) {
    const selectedUnit = form.elements.unit.value;
    const rawUnit = selectedUnit === "__other__" ? form.elements.customUnit.value : selectedUnit;
    return {
        itemCode: form.dataset.itemCode,
        linkId: form.dataset.linkId,
        rawQuantityText: form.elements.quantity.value,
        rawUnit,
        notes: ""
    };
}

function toggleCustomUnitField(select) {
    const form = select.closest("form");
    const shouldShowCustomUnit = select.value === "__other__";
    const customField = form.querySelector("[data-custom-unit-field]");
    const customInput = form.elements.customUnit;
    customField.hidden = !shouldShowCustomUnit;
    form.querySelector("[data-custom-unit-warning]").hidden = !shouldShowCustomUnit;
    customInput.required = shouldShowCustomUnit;
    if (shouldShowCustomUnit) customInput.focus();
}

export function connectAreaCountingEvents(handlers) {
    getElement("pilot-area-list").addEventListener("click", (event) => {
        const button = event.target.closest("[data-area-location-id]");
        if (button && !button.disabled) handlers.onOpenArea(button.dataset.areaLocationId);
    });
    getElement("btn-close-area-counting").addEventListener("click", handlers.onCloseArea);
    getElement("btn-previous-area-item").addEventListener("click", () => goToItem(currentItemIndex - 1));
    getElement("btn-next-area-item").addEventListener("click", () => goToItem(currentItemIndex + 1));
    getElement("area-counting-search").addEventListener("input", (event) => renderSearchResults(event.target.value));
    getElement("area-counting-search-results").addEventListener("click", (event) => {
        const button = event.target.closest("[data-area-item-index]");
        if (button) goToItem(Number(button.dataset.areaItemIndex));
    });
    getElement("area-counting-items").addEventListener("submit", async (event) => {
        const form = event.target.closest(".area-count-entry-form");
        if (!form) return;
        event.preventDefault();
        await handlers.onAddEntry(getEntryFormValues(form));
    });
    getElement("area-counting-items").addEventListener("change", (event) => {
        const select = event.target.closest("[data-profile-unit-select]");
        if (select) toggleCustomUnitField(select);
    });
    getElement("area-counting-items").addEventListener("click", async (event) => {
        const button = event.target.closest("[data-remove-area-entry]");
        if (!button || !window.confirm("Remover esta entrada da contagem?")) return;
        await handlers.onRemoveEntry(button.dataset.removeAreaEntry);
    });
}
