import { formatConsolidatedCell } from "./countConsolidation.js";

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
});

let currentViewModel = null;
let currentFilter = "all";
let currentSearch = "";

function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data indisponível" : dateTimeFormatter.format(date);
}

function renderTemplateOptions(templates, selectedTemplateId) {
    return templates.map((template) => (
        `<option value="${escapeHtml(template.id)}" ${template.id === selectedTemplateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`
    )).join("");
}

function renderSummary(summary) {
    const stats = [
        ["Sessões consideradas", summary.consideredSessionCount],
        ["Áreas com lançamento", `${summary.areasWithEntries} de ${summary.areaCount}`],
        ["Itens com lançamento", `${summary.itemsWithEntries} de ${summary.itemCount}`],
        ["Itens completos", summary.completeItemCount],
        ["Itens com pendência", summary.pendingItemCount],
        ["Entradas pendentes", summary.pendingEntryCount]
    ];
    return stats.map(([label, value]) => (
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )).join("");
}

function getStatusLabel(status) {
    const labels = {
        no_entries: "Sem lançamento",
        complete: "Completo",
        partial: "Parcial com pendências",
        pending: "Pendente sem conversão"
    };
    return labels[status] || status;
}

function renderAreaCell(cell) {
    const formatted = formatConsolidatedCell(cell);
    const expected = cell.isExpected ? "" : '<span class="count-consolidation-cell-note">Não previsto para o item</span>';
    return `
        <div class="count-consolidation-cell is-${escapeHtml(formatted.status)}">
            <span>${escapeHtml(cell.area)}</span>
            <strong>${escapeHtml(formatted.label)}</strong>
            ${cell.entries.length ? `<small>${cell.entries.length} entrada(s)</small>` : ""}
            ${expected}
        </div>
    `;
}

function renderItemTotal(item) {
    const formatted = formatConsolidatedCell(item.total);
    const pending = item.total.pendingEntries.length
        ? `<small>${item.total.pendingEntries.length} pendência(s); o TOTAL não é definitivo.</small>`
        : "";
    return `
        <div class="count-consolidation-total is-${escapeHtml(item.total.status)}">
            <span>TOTAL calculado</span>
            <strong>${escapeHtml(formatted.label)}</strong>
            ${pending}
        </div>
    `;
}

function renderItem(item) {
    const baseUnit = item.baseUnit || "sem perfil";
    return `
        <article class="count-consolidation-item is-${escapeHtml(item.total.status)}">
            <header>
                <span class="count-consolidation-status">${escapeHtml(getStatusLabel(item.total.status))}</span>
                <h4>${escapeHtml(item.name)}</h4>
                <p>Código: ${escapeHtml(item.code)} · Base: ${escapeHtml(baseUnit)}</p>
            </header>
            <div class="count-consolidation-cells">${item.cells.map(renderAreaCell).join("")}</div>
            ${renderItemTotal(item)}
        </article>
    `;
}

function matchesCurrentFilters(item) {
    const query = currentSearch.trim().toLocaleLowerCase("pt-BR");
    const searchable = `${item.code} ${item.name} ${item.groupName}`.toLocaleLowerCase("pt-BR");
    if (query && !searchable.includes(query)) return false;
    if (currentFilter === "with_entries") return item.total.entryCount > 0;
    if (currentFilter === "pending") return ["partial", "pending"].includes(item.total.status);
    if (currentFilter === "without_entries") return item.total.status === "no_entries";
    return true;
}

function renderGroups() {
    const container = getElement("count-consolidation-groups");
    if (!currentViewModel?.report) {
        container.innerHTML = "";
        return;
    }
    const groups = currentViewModel.report.groups.map((group) => ({
        ...group,
        items: group.items.filter(matchesCurrentFilters)
    })).filter((group) => group.items.length > 0);
    container.innerHTML = groups.length ? groups.map((group, index) => `
        <details class="count-consolidation-group" ${currentFilter !== "all" || currentSearch || index === 0 ? "open" : ""}>
            <summary>${escapeHtml(group.name)} <span>${group.items.length} item(ns)</span></summary>
            <div class="count-consolidation-item-list">${group.items.map(renderItem).join("")}</div>
        </details>
    `).join("") : '<p class="count-consolidation-empty">Nenhum item corresponde aos filtros.</p>';
}

function renderSession(session, tone = "") {
    const path = session.locationPathSnapshot?.join(" › ") || session.locationId;
    return `
        <li class="count-consolidation-session ${tone}">
            <strong>${escapeHtml(path)}</strong>
            <span>${escapeHtml(session.reportAreaSnapshot || "Sem área")} · ${escapeHtml(session.status)}</span>
            <small>Atualizada em ${escapeHtml(formatDateTime(session.updatedAt || session.createdAt))}</small>
        </li>
    `;
}

function renderSessions(selection) {
    const ignored = selection.duplicateIgnored;
    getElement("count-consolidation-sessions").innerHTML = `
        <details ${ignored.length ? "open" : ""}>
            <summary>${selection.selected.length} sessão(ões) considerada(s)</summary>
            <ul>${selection.selected.map((session) => renderSession(session)).join("") || "<li>Nenhuma sessão disponível.</li>"}</ul>
        </details>
        ${ignored.length ? `
            <details class="is-warning" open>
                <summary>${ignored.length} sessão(ões) duplicada(s) ignorada(s)</summary>
                <ul>${ignored.map((session) => renderSession(session, "is-ignored")).join("")}</ul>
            </details>
        ` : ""}
    `;
}

function filterPendingEntries(pendingEntries) {
    const query = currentSearch.trim().toLocaleLowerCase("pt-BR");
    if (!query) return pendingEntries;
    return pendingEntries.filter((pending) => (
        `${pending.itemCode} ${pending.itemName} ${pending.groupName}`.toLocaleLowerCase("pt-BR").includes(query)
    ));
}

function renderPendingEntry(pending) {
    const entry = pending.entry;
    const unit = entry.rawUnit || "sem unidade";
    return `
        <li class="count-consolidation-pending-item">
            <strong>${escapeHtml(pending.itemName || "Item ausente")}</strong>
            <span>${escapeHtml(pending.itemCode)} · ${escapeHtml(pending.area)}</span>
            <span>Lançamento: ${escapeHtml(entry.rawQuantityText)} ${escapeHtml(unit)}</span>
            <span class="count-consolidation-pending-reason">${escapeHtml(pending.reason)}</span>
            <small>Sugestão: ${escapeHtml(pending.suggestion)}</small>
        </li>
    `;
}

function renderPendingEntries() {
    const pendingEntries = filterPendingEntries(currentViewModel?.report?.pendingEntries || []);
    const container = getElement("count-consolidation-pending-list");
    getElement("count-consolidation-pending-count").textContent = `${pendingEntries.length} pendência(s)`;
    container.innerHTML = pendingEntries.length
        ? `<ul>${pendingEntries.map(renderPendingEntry).join("")}</ul>`
        : '<p class="count-consolidation-empty">Nenhuma entrada pendente para este filtro.</p>';
}

function renderWarnings(report) {
    const warnings = [];
    if (report.areaSource === "locations") warnings.push("O template não informou áreas; foram usadas as áreas dos locais físicos.");
    if (!report.sessionSelection.selected.length) warnings.push("Nenhuma sessão válida foi encontrada para este template.");
    if (report.sessionSelection.duplicateIgnored.length) warnings.push("Sessões duplicadas foram ignoradas para evitar dupla contagem.");
    if (report.sessionSelection.canceledIgnored.length) warnings.push(`${report.sessionSelection.canceledIgnored.length} sessão(ões) cancelada(s) ignorada(s).`);
    if (report.sessionSelection.unsupportedIgnored.length) warnings.push("Há sessões com status não reconhecido que foram ignoradas.");
    if (report.sessionAreaIssues.length) warnings.push(`${report.sessionAreaIssues.length} sessão(ões) está(ão) sem área válida do template.`);
    const outsideCount = report.pendingEntries.filter((pending) => pending.type === "outside_area").length;
    if (outsideCount) warnings.push(`${outsideCount} entrada(s) usa(m) área fora do template e não entra(m) no TOTAL.`);
    const container = getElement("count-consolidation-warnings");
    container.hidden = warnings.length === 0;
    container.innerHTML = warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("");
}

function renderWorkspace(viewModel) {
    const { report } = viewModel;
    getElement("count-consolidation-summary").innerHTML = renderSummary(report.summary);
    getElement("count-consolidation-area-list").textContent = report.realAreas.join(" · ") || "Nenhuma área identificada";
    renderWarnings(report);
    renderSessions(report.sessionSelection);
    renderGroups();
    renderPendingEntries();
}

export function renderCountConsolidation(viewModel) {
    currentViewModel = viewModel;
    const hasTemplate = Boolean(viewModel.selectedTemplate);
    getElement("count-consolidation-template-field").hidden = viewModel.templates.length < 2;
    getElement("count-consolidation-template").innerHTML = renderTemplateOptions(
        viewModel.templates,
        viewModel.selectedTemplate?.id
    );
    getElement("count-consolidation-no-template").hidden = hasTemplate;
    getElement("count-consolidation-workspace").hidden = !hasTemplate;
    if (hasTemplate) renderWorkspace(viewModel);
}

export function showCountConsolidationView() {
    getElement("pilot-dashboard").hidden = true;
    getElement("area-counting-view").hidden = true;
    getElement("count-consolidation-view").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

export function hideCountConsolidationView() {
    getElement("count-consolidation-view").hidden = true;
    getElement("pilot-dashboard").hidden = false;
    currentViewModel = null;
}

export function showCountConsolidationFeedback(message, tone = "") {
    const feedback = getElement("count-consolidation-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

export function connectCountConsolidationEvents(handlers) {
    getElement("btn-open-count-consolidation").addEventListener("click", handlers.onOpen);
    getElement("btn-close-count-consolidation").addEventListener("click", handlers.onClose);
    getElement("count-consolidation-template").addEventListener("change", (event) => handlers.onSelectTemplate(event.target.value));
    getElement("count-consolidation-filter").addEventListener("change", (event) => {
        currentFilter = event.target.value;
        renderGroups();
    });
    getElement("count-consolidation-search").addEventListener("input", (event) => {
        currentSearch = event.target.value;
        renderGroups();
        renderPendingEntries();
    });
}
