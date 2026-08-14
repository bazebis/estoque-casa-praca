import {
    getLocationCountSessionPreparation,
    summarizeLocationCountSessions
} from "./locationCountSessions.js";
import { getLocationPath } from "./locationNodes.js";

const statusLabels = {
    draft: "Rascunho",
    in_progress: "Em andamento",
    completed: "Finalizada",
    canceled: "Cancelada"
};

function getElement(id) {
    return document.getElementById(id);
}

function createTextElement(tagName, text, className = "") {
    const element = document.createElement(tagName);
    element.textContent = text;
    element.className = className;
    return element;
}

function createButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

function formatDateTime(value) {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function showLocationCountSessionsFeedback(message, tone = "info") {
    const feedback = getElement("location-count-sessions-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function appendSelectOption(select, value, label, selected = false) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
}

function getLocationPathLabel(location, locations) {
    const path = getLocationPath(location.id, locations).map((node) => node.name);
    return path.join(" › ") || location.name;
}

function renderTemplateOptions(viewModel) {
    const select = getElement("location-count-session-template");
    select.innerHTML = "";
    viewModel.templates.forEach((template) => appendSelectOption(
        select,
        template.id,
        template.name,
        template.id === viewModel.selectedTemplate?.id
    ));
    getElement("location-count-session-template-field").hidden = viewModel.templates.length === 0;
}

function renderLocationOptions(viewModel) {
    const select = getElement("location-count-session-location");
    select.innerHTML = "";
    viewModel.locations.forEach((location) => {
        const area = location.reportArea || "sem área";
        const status = location.active ? "" : " · inativo";
        appendSelectOption(
            select,
            location.id,
            `${getLocationPathLabel(location, viewModel.locations)} · ${area}${status}`,
            location.id === viewModel.selectedLocation?.id
        );
    });
    getElement("location-count-session-location-field").hidden = viewModel.locations.length === 0;
}

function renderRequirementStates(viewModel) {
    const hasTemplate = Boolean(viewModel.selectedTemplate);
    const hasLocations = viewModel.locations.length > 0;

    getElement("location-count-session-no-template").hidden = hasTemplate;
    getElement("location-count-session-no-locations").hidden = !hasTemplate || hasLocations;
    getElement("location-count-session-form").hidden = !hasTemplate || !hasLocations;
}

function renderMessages(containerId, messages, tone) {
    const container = getElement(containerId);
    container.innerHTML = "";
    container.hidden = messages.length === 0;
    container.dataset.tone = tone;
    messages.forEach((message) => container.appendChild(createTextElement("p", message)));
}

function createPlannedItem(item) {
    const listItem = document.createElement("li");
    listItem.append(
        createTextElement("strong", `${item.itemCode} — ${item.itemNameSnapshot}`),
        createTextElement("span", `Grupo: ${item.groupNameSnapshot} · ordem ${item.order}`)
    );
    return listItem;
}

function createPlannedItemList(items) {
    const list = document.createElement("ol");
    list.className = "location-count-session-item-list";
    items.forEach((item) => list.appendChild(createPlannedItem(item)));
    return list;
}

function renderPlannedItems(preparation) {
    const container = getElement("location-count-session-planned-items");
    container.innerHTML = "";
    container.appendChild(createTextElement(
        "p",
        `${preparation.plannedItems.length} item(ns) planejado(s) a partir de vínculos ativos.`,
        "location-count-session-preview-count"
    ));
    if (preparation.plannedItems.length > 0) {
        container.appendChild(createPlannedItemList(preparation.plannedItems));
    }
}

function renderPreparation(viewModel) {
    const preparation = getLocationCountSessionPreparation(
        viewModel.selectedTemplate,
        viewModel.selectedLocation,
        viewModel.links,
        viewModel.locations
    );
    renderMessages("location-count-session-errors", preparation.errors, "error");
    renderMessages("location-count-session-warnings", preparation.warnings, "warning");
    renderPlannedItems(preparation);
    getElement("btn-create-location-count-session").disabled = !preparation.canCreate;
}

function createSummaryItem(label, value) {
    const item = document.createElement("div");
    item.className = "location-count-session-stat";
    item.append(createTextElement("dt", label), createTextElement("dd", String(value)));
    return item;
}

function renderSessionSummary(sessions) {
    const container = getElement("location-count-sessions-summary");
    const summary = summarizeLocationCountSessions(sessions);
    const entries = [
        ["Sessões", summary.total],
        ["Rascunhos", summary.totalsByStatus.draft],
        ["Em andamento", summary.totalsByStatus.in_progress],
        ["Canceladas", summary.totalsByStatus.canceled],
        ["Itens planejados", summary.plannedItemCount],
        ["Locais", summary.locationCount],
        ["Templates", summary.templateCount]
    ];
    container.innerHTML = "";
    entries.forEach(([label, value]) => container.appendChild(createSummaryItem(label, value)));
}

function createSessionMetadata(session) {
    const metadata = document.createElement("dl");
    metadata.className = "location-count-session-metadata";
    const entries = [
        ["Template", session.templateNameSnapshot],
        ["Local", session.locationPathSnapshot.join(" › ")],
        ["Área", session.reportAreaSnapshot || "Sem área"],
        ["Criada", formatDateTime(session.createdAt)],
        ["Iniciada", formatDateTime(session.startedAt)],
        ["Atualizada", formatDateTime(session.updatedAt)],
        ["Cancelada", formatDateTime(session.canceledAt)]
    ];
    entries.forEach(([label, value]) => metadata.append(
        createTextElement("dt", label),
        createTextElement("dd", value)
    ));
    return metadata;
}

function createSessionDetails(session) {
    const details = document.createElement("details");
    details.className = "location-count-session-details";
    details.append(
        createTextElement("summary", `Ver ${session.plannedItemCount} item(ns) planejado(s)`),
        createPlannedItemList(session.plannedItems)
    );
    return details;
}

function getSessionRemovalUnavailableMessage(session, hasEntries) {
    if (hasEntries) return "Remoção permanente indisponível: esta sessão possui entradas preservadas.";
    if (session.status === "in_progress") return "Sessões em andamento devem ser finalizadas; elas não podem ser removidas.";
    if (session.status === "completed") return "Sessões finalizadas são históricas e não podem ser removidas.";
    return "Esta sessão não pode ser removida no estado atual.";
}

function createSessionActions(session, handlers, hasEntries) {
    const actions = document.createElement("div");
    actions.className = "location-count-session-actions";
    if (session.status === "draft") {
        actions.appendChild(createButton(
            "Cancelar sessão",
            "location-count-session-secondary-button",
            () => handlers.onCancelSession(session.id)
        ));
    }
    const canRemovePermanently = ["draft", "canceled"].includes(session.status) && !hasEntries;
    if (canRemovePermanently) {
        actions.appendChild(createButton(
            "Remover permanentemente",
            "location-count-session-danger-button",
            () => handlers.onDeleteSession(session.id)
        ));
    } else {
        actions.appendChild(createTextElement(
            "p",
            getSessionRemovalUnavailableMessage(session, hasEntries),
            "location-count-session-removal-note"
        ));
    }
    return actions;
}

function createSessionCard(session, handlers, hasEntries) {
    const card = document.createElement("article");
    const status = statusLabels[session.status] || session.status;
    card.className = `location-count-session-card is-${session.status}`;
    card.append(
        createTextElement("h5", session.locationPathSnapshot.join(" › ") || "Local sem caminho"),
        createTextElement("span", status, `location-count-session-status is-${session.status}`),
        createSessionMetadata(session)
    );
    if (session.notes) card.appendChild(createTextElement("p", `Observações: ${session.notes}`));
    card.append(createSessionDetails(session), createSessionActions(session, handlers, hasEntries));
    return card;
}

function renderSessions(sessions, entries, handlers) {
    const container = getElement("location-count-sessions-list");
    const sessionIdsWithEntries = new Set((entries || []).map((entry) => entry.sessionId));
    container.innerHTML = "";
    renderSessionSummary(sessions);
    if (sessions.length === 0) {
        container.appendChild(createTextElement("p", "Nenhuma sessão preparada neste aparelho.", "location-count-session-empty"));
        return;
    }
    sessions.forEach((session) => container.appendChild(createSessionCard(
        session,
        handlers,
        sessionIdsWithEntries.has(session.id)
    )));
}

export function renderLocationCountSessions(viewModel, handlers) {
    renderTemplateOptions(viewModel);
    renderLocationOptions(viewModel);
    renderRequirementStates(viewModel);
    if (viewModel.selectedTemplate && viewModel.locations.length > 0) renderPreparation(viewModel);
    renderSessions(viewModel.sessions, viewModel.entries, handlers);
}

export function connectLocationCountSessionEvents(handlers) {
    getElement("location-count-session-template").addEventListener("change", (event) => {
        handlers.onSelectTemplate(event.target.value);
    });
    getElement("location-count-session-location").addEventListener("change", (event) => {
        handlers.onSelectLocation(event.target.value);
    });
    getElement("location-count-session-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = getElement("btn-create-location-count-session");
        button.disabled = true;

        try {
            const wasCreated = await handlers.onCreateDraft(getElement("location-count-session-notes").value);
            if (wasCreated) getElement("location-count-session-notes").value = "";
        } finally {
            button.disabled = false;
        }
    });
    getElement("btn-location-count-session-templates").addEventListener("click", handlers.onOpenTemplates);
    getElement("btn-location-count-session-locations").addEventListener("click", handlers.onOpenLocations);
    getElement("btn-location-count-session-links").addEventListener("click", handlers.onOpenLinks);
}
