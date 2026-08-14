import {
    findAllowedUnit,
    formatConvertedQuantity,
    formatPortionBreakdown
} from "./unitConversion.js";
import { validateControlledItemUnitProfile } from "./itemUnitSettings.js";

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

function renderEntryConversion(conversion) {
    if (!conversion?.isConvertible) {
        return `<span class="area-count-conversion-warning">${escapeHtml(conversion?.reason || "Conversão indisponível.")}</span>`;
    }
    return `<span class="area-count-conversion-success">Equivale a ${escapeHtml(formatConvertedQuantity(
        conversion.convertedValue,
        conversion.baseUnit
    ))}</span>`;
}

function renderEntry(entry, conversion) {
    const unit = entry.rawUnit || "sem unidade";
    const createdAt = new Date(entry.createdAt);
    const timestamp = Number.isNaN(createdAt.getTime())
        ? "horário indisponível"
        : shortDateTimeFormatter.format(createdAt);
    return `
        <li class="area-count-entry">
            <div>
                <strong>${escapeHtml(entry.rawQuantityText.trim())} ${escapeHtml(unit)}</strong>
                ${renderEntryConversion(conversion)}
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

function renderConvertedTotal(summary) {
    if (!summary?.activeEntryCount) return '<p class="area-count-converted-total">Total convertido: nenhuma entrada.</p>';
    if (!summary.totalConvertedValue) {
        return `<p class="area-count-converted-total is-warning">Total convertido indisponível. ${summary.unconvertibleEntryCount} entrada(s) pendente(s).</p>`;
    }
    const total = formatConvertedQuantity(summary.totalConvertedValue, summary.baseUnit);
    const portionBreakdown = summary.baseUnit === "porção"
        ? formatPortionBreakdown(summary.totalConvertedValue)
        : "";
    const label = summary.isComplete ? "Total convertido" : "Total parcial convertido";
    const pending = summary.unconvertibleEntryCount
        ? `<span>${summary.unconvertibleEntryCount} entrada(s) sem conversão definida.</span>`
        : "";
    return `
        <p class="area-count-converted-total ${summary.isComplete ? "" : "is-warning"}">
            <strong>${label}: ${escapeHtml(total)}</strong>
            ${portionBreakdown ? `<span>${escapeHtml(portionBreakdown)}</span>` : ""}
            ${pending}
        </p>
    `;
}

function formatUnitHint(profile) {
    if (!profile?.baseUnit) return "";
    const review = profile.needsReview ? " · perfil marcado para revisão" : "";
    return `<p class="area-count-unit-hint">Base de conversão: <strong>${escapeHtml(profile.baseUnit)}</strong>${review}.</p>`;
}

export function resolveAreaCountingInputUnit(profile, lastUsedUnit = "") {
    const profileValidation = validateControlledItemUnitProfile(profile);
    if (!profileValidation.isValid) return null;

    return findAllowedUnit(profileValidation.profile, lastUsedUnit)
        || findAllowedUnit(profileValidation.profile, profileValidation.profile.defaultInputUnit);
}

function renderAllowedUnitOptions(profile, selectedUnit) {
    return profile.allowedUnits.map((unit) => {
        const selected = unit.id === selectedUnit.id ? "selected" : "";
        return `<option value="${escapeHtml(unit.label)}" ${selected}>${escapeHtml(unit.label)}</option>`;
    }).join("");
}

function renderUnitField(profile, lastUsedUnit) {
    const selectedUnit = resolveAreaCountingInputUnit(profile, lastUsedUnit);
    if (!selectedUnit) return null;

    return `
        <label>Unidade permitida
            <select name="unit" data-profile-unit-select>
                ${renderAllowedUnitOptions(profile, selectedUnit)}
            </select>
        </label>
    `;
}

function renderEntryForm(item, profile, lastUsedUnit) {
    const unitField = renderUnitField(profile, lastUsedUnit);
    if (!unitField) {
        return '<p class="area-counting-warning">Corrija o perfil de unidade deste item antes de lançar uma quantidade.</p>';
    }

    return `
        <form class="area-count-entry-form" data-item-code="${escapeHtml(item.itemCode)}" data-link-id="${escapeHtml(item.linkId)}">
            <label>Quantidade
                <input type="text" name="quantity" inputmode="decimal" required maxlength="80" autocomplete="off" placeholder="Ex.: 1,5">
            </label>
            ${unitField}
            <button type="submit">Adicionar entrada</button>
        </form>
    `;
}

function renderItemCard(item, summary, convertedSummary, lastUsedUnit, unitSetting) {
    const activeEntries = summary?.activeEntries || [];
    const conversionsByEntry = new Map((convertedSummary?.conversions || []).map((result) => (
        [result.entry.id, result.conversion]
    )));
    return `
        <article class="area-count-item-card" tabindex="-1">
            <header>
                <span>${escapeHtml(item.groupNameSnapshot)}</span>
                <h3>${escapeHtml(item.itemNameSnapshot)}</h3>
                <p>Código: ${escapeHtml(item.itemCode)}</p>
            </header>
            <p class="area-count-subtotal"><strong>Subtotal original:</strong> ${escapeHtml(formatSubtotal(summary))}</p>
            ${renderConvertedTotal(convertedSummary)}
            ${formatUnitHint(unitSetting)}
            ${summary?.removedEntryCount ? `<p class="area-count-removed">${summary.removedEntryCount} entrada(s) removida(s)</p>` : ""}
            <section class="area-count-entry-section" aria-label="Aferições do item atual">
                <h4>Aferições deste item</h4>
                ${activeEntries.length
        ? `<ul class="area-count-entry-list">${activeEntries.map((entry) => renderEntry(
            entry,
            conversionsByEntry.get(entry.id)
        )).join("")}</ul>`
        : '<p class="area-count-empty-entries">Nenhuma aferição registrada. Você pode pular este item.</p>'}
            </section>
            ${renderEntryForm(item, unitSetting, lastUsedUnit)}
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
            activeViewModel.convertedSummariesByItem.get(currentItem.itemCode),
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
    const {
        session,
        entriesByItem,
        unitSettingsByItem,
        convertedSummariesByItem,
        progress,
        lastUsedUnit
    } = viewModel;
    activeViewModel = {
        session,
        entriesByItem,
        unitSettingsByItem,
        convertedSummariesByItem,
        progress,
        lastUsedUnit
    };
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
    return {
        itemCode: form.dataset.itemCode,
        linkId: form.dataset.linkId,
        rawQuantityText: form.elements.quantity.value,
        rawUnit: form.elements.unit.value,
        notes: ""
    };
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
    getElement("area-counting-items").addEventListener("click", async (event) => {
        const button = event.target.closest("[data-remove-area-entry]");
        if (!button || !window.confirm("Remover esta entrada da contagem?")) return;
        await handlers.onRemoveEntry(button.dataset.removeAreaEntry);
    });
}
