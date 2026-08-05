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
    return `
        <li class="area-count-entry">
            <div>
                <strong>${escapeHtml(entry.rawQuantityText.trim())} ${escapeHtml(unit)}</strong>
                ${entry.notes ? `<span>${escapeHtml(entry.notes)}</span>` : ""}
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

function renderItemCard(item, summary, lastUsedUnit) {
    const activeEntries = summary?.activeEntries || [];
    const searchText = `${item.itemCode} ${item.itemNameSnapshot} ${item.groupNameSnapshot}`.toLocaleLowerCase("pt-BR");
    return `
        <article class="area-count-item-card" data-area-item-search="${escapeHtml(searchText)}">
            <header>
                <span>${escapeHtml(item.groupNameSnapshot)}</span>
                <h3>${escapeHtml(item.itemNameSnapshot)}</h3>
                <p>Código: ${escapeHtml(item.itemCode)}</p>
            </header>
            <p class="area-count-subtotal"><strong>Subtotal:</strong> ${escapeHtml(formatSubtotal(summary))}</p>
            ${summary?.removedEntryCount ? `<p class="area-count-removed">${summary.removedEntryCount} entrada(s) removida(s)</p>` : ""}
            <ul class="area-count-entry-list">${activeEntries.map(renderEntry).join("")}</ul>
            <form class="area-count-entry-form" data-item-code="${escapeHtml(item.itemCode)}" data-link-id="${escapeHtml(item.linkId)}">
                <label>Quantidade
                    <input type="text" name="quantity" inputmode="decimal" required maxlength="80" autocomplete="off" placeholder="Ex.: 1,5">
                </label>
                <label>Unidade livre
                    <input type="text" name="unit" maxlength="60" autocomplete="off" value="${escapeHtml(lastUsedUnit)}" placeholder="Ex.: un, kg, caixa">
                </label>
                <label>Observação opcional
                    <input type="text" name="notes" maxlength="500" autocomplete="off">
                </label>
                <button type="submit">Adicionar entrada</button>
            </form>
        </article>
    `;
}

export function renderAreaCountingView(viewModel, multipleSessionCount = 0) {
    const { session, entriesByItem, progress, lastUsedUnit } = viewModel;
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
    getElement("area-counting-items").innerHTML = session.plannedItems.map((item) => (
        renderItemCard(item, entriesByItem.get(item.itemCode), lastUsedUnit)
    )).join("");
    getElement("area-counting-search").value = "";
}

export function showAreaCountingView() {
    getElement("pilot-dashboard").hidden = true;
    getElement("area-counting-view").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

export function hideAreaCountingView() {
    getElement("area-counting-view").hidden = true;
    getElement("pilot-dashboard").hidden = false;
}

export function showAreaCountingFeedback(message, tone = "") {
    const feedback = getElement("area-counting-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function filterVisibleItems(searchText) {
    const query = searchText.trim().toLocaleLowerCase("pt-BR");
    document.querySelectorAll("[data-area-item-search]").forEach((card) => {
        card.hidden = Boolean(query) && !card.dataset.areaItemSearch.includes(query);
    });
}

function getEntryFormValues(form) {
    return {
        itemCode: form.dataset.itemCode,
        linkId: form.dataset.linkId,
        rawQuantityText: form.elements.quantity.value,
        rawUnit: form.elements.unit.value,
        notes: form.elements.notes.value
    };
}

export function connectAreaCountingEvents(handlers) {
    getElement("pilot-area-list").addEventListener("click", (event) => {
        const button = event.target.closest("[data-area-location-id]");
        if (button && !button.disabled) handlers.onOpenArea(button.dataset.areaLocationId);
    });
    getElement("btn-close-area-counting").addEventListener("click", handlers.onCloseArea);
    getElement("area-counting-search").addEventListener("input", (event) => filterVisibleItems(event.target.value));
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
