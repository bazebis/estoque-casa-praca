import {
    findTemplateItem,
    getItemLocationWarnings,
    summarizeItemLocationLinks
} from "./itemLocationLinks.js";
import { getLocationPath } from "./locationNodes.js";

let currentViewModel = null;
let itemSearchQuery = "";

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

export function showItemLocationLinksFeedback(message, tone = "info") {
    const feedback = getElement("item-location-links-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function getTemplateItems(template) {
    return (template?.groups || []).flatMap((group) => (
        (group.items || []).map((item) => ({ item, group }))
    ));
}

function getLocationPathLabel(location, locations) {
    return getLocationPath(location.id, locations).map((node) => node.name).join(" › ") || location.name;
}

function appendSelectOption(select, value, label, selected = false) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
}

function renderTemplateOptions(viewModel) {
    const select = getElement("item-location-template");
    select.innerHTML = "";
    viewModel.templates.forEach((template) => appendSelectOption(
        select,
        template.id,
        template.name,
        template.id === viewModel.selectedTemplate?.id
    ));
    getElement("item-location-template-field").hidden = viewModel.templates.length === 0;
}

function renderRequirementStates(viewModel) {
    const hasTemplate = Boolean(viewModel.selectedTemplate);
    const hasLocations = viewModel.locations.length > 0;

    getElement("item-location-no-template").hidden = hasTemplate;
    getElement("item-location-no-locations").hidden = !hasTemplate || hasLocations;
    getElement("item-location-workspace").hidden = !hasTemplate;
    getElement("item-location-link-form").hidden = !hasTemplate || !hasLocations;
}

function matchesSearch(item, query) {
    const comparableQuery = query.toLocaleLowerCase("pt-BR");
    const haystack = `${item.code} ${item.name}`.toLocaleLowerCase("pt-BR");
    return haystack.includes(comparableQuery);
}

function createItemButton(item, handlers) {
    const isSelected = item.code === currentViewModel.selectedItemCode;
    const className = `item-location-item-button${isSelected ? " is-selected" : ""}`;
    return createButton(`${item.code} — ${item.name}`, className, () => handlers.onSelectItem(item.code));
}

function createGroupItems(group, handlers) {
    const matchingItems = (group.items || []).filter((item) => matchesSearch(item, itemSearchQuery));

    if (matchingItems.length === 0) {
        return null;
    }

    const detail = document.createElement("details");
    detail.className = "item-location-group";
    detail.open = Boolean(itemSearchQuery);
    detail.appendChild(createTextElement("summary", `${group.name} — ${matchingItems.length} item(ns)`));
    const list = document.createElement("div");
    list.className = "item-location-item-list";
    matchingItems.forEach((item) => list.appendChild(createItemButton(item, handlers)));
    detail.appendChild(list);
    return detail;
}

function renderItemPicker(handlers) {
    const container = getElement("item-location-item-picker");
    container.innerHTML = "";

    (currentViewModel?.selectedTemplate?.groups || []).forEach((group) => {
        const groupElement = createGroupItems(group, handlers);

        if (groupElement) {
            container.appendChild(groupElement);
        }
    });

    if (!container.hasChildNodes()) {
        container.appendChild(createTextElement("p", "Nenhum item encontrado.", "item-location-empty-note"));
    }
}

function renderSelectedItem(viewModel) {
    const container = getElement("item-location-selected-item");
    const match = findTemplateItem(viewModel.selectedTemplate, viewModel.selectedItemCode);
    container.innerHTML = "";

    if (!match) {
        container.appendChild(createTextElement("p", "Selecione um item do template.", "item-location-empty-note"));
        return;
    }

    container.append(
        createTextElement("strong", `${match.item.code} — ${match.item.name}`),
        createTextElement("span", `Grupo: ${match.group.name}`)
    );
}

function renderLinkLocationOptions(viewModel) {
    const select = getElement("item-location-target");
    select.innerHTML = "";
    appendSelectOption(select, "", "Selecione um local físico");

    viewModel.locations.forEach((location) => {
        const path = getLocationPathLabel(location, viewModel.locations);
        const area = location.reportArea || "sem área";
        const status = location.active ? "" : " · inativo";
        appendSelectOption(select, location.id, `${path} · ${area}${status}`);
    });

    getElement("btn-create-item-location-link").disabled = !viewModel.selectedItemCode;
    renderSelectedLocationWarnings();
}

function renderWarnings(container, warnings) {
    container.innerHTML = "";
    container.hidden = warnings.length === 0;

    warnings.forEach((warning) => container.appendChild(createTextElement("p", warning)));
}

function renderSelectedLocationWarnings() {
    const locationId = getElement("item-location-target").value;
    const location = currentViewModel?.locations.find((item) => item.id === locationId);
    const warnings = getItemLocationWarnings(
        currentViewModel?.selectedTemplate,
        currentViewModel?.selectedItemCode,
        location
    );
    renderWarnings(getElement("item-location-link-warnings"), warnings);
}

function renderFilterOptions(viewModel) {
    const locationFilter = getElement("item-location-filter-location");
    const itemFilter = getElement("item-location-filter-item");
    locationFilter.innerHTML = "";
    itemFilter.innerHTML = "";
    appendSelectOption(locationFilter, "", "Todos os locais", !viewModel.locationFilter);
    appendSelectOption(itemFilter, "", "Todos os itens", !viewModel.itemFilter);

    viewModel.locations.forEach((location) => appendSelectOption(
        locationFilter,
        location.id,
        getLocationPathLabel(location, viewModel.locations),
        location.id === viewModel.locationFilter
    ));
    getTemplateItems(viewModel.selectedTemplate).forEach(({ item }) => appendSelectOption(
        itemFilter,
        item.code,
        `${item.code} — ${item.name}`,
        item.code === viewModel.itemFilter
    ));
}

function getFilteredLinks(viewModel) {
    return viewModel.links.filter((link) => (
        (!viewModel.locationFilter || link.locationId === viewModel.locationFilter)
        && (!viewModel.itemFilter || link.itemCode === viewModel.itemFilter)
    ));
}

function getLinkWarnings(link, viewModel) {
    const location = viewModel.locations.find((item) => item.id === link.locationId);
    const warnings = getItemLocationWarnings(viewModel.selectedTemplate, link.itemCode, location);

    if (!location) {
        warnings.unshift("O local físico deste vínculo não existe mais.");
    }

    if (!findTemplateItem(viewModel.selectedTemplate, link.itemCode)) {
        warnings.unshift("O item deste vínculo não existe mais no template.");
    }

    return warnings;
}

function createLinkActions(link, siblings, handlers) {
    const actions = document.createElement("div");
    actions.className = "item-location-link-actions";
    const linkIndex = siblings.findIndex((item) => item.id === link.id);
    const toggleButton = createButton(
        link.active ? "Desativar" : "Ativar",
        "item-location-action-button",
        () => handlers.onToggleLink(link.id, !link.active)
    );
    const upButton = createButton("Subir", "item-location-action-button", () => handlers.onMoveLink(link.id, -1));
    const downButton = createButton("Descer", "item-location-action-button", () => handlers.onMoveLink(link.id, 1));
    const deleteButton = createButton(
        "Remover",
        "item-location-action-button item-location-danger-button",
        () => handlers.onDeleteLink(link.id)
    );
    upButton.disabled = linkIndex <= 0;
    downButton.disabled = linkIndex === siblings.length - 1;
    actions.append(toggleButton, upButton, downButton, deleteButton);
    return actions;
}

function createLinkCard(link, viewModel, handlers) {
    const card = document.createElement("article");
    const location = viewModel.locations.find((item) => item.id === link.locationId);
    const siblings = viewModel.links
        .filter((item) => item.locationId === link.locationId)
        .sort((first, second) => first.order - second.order);
    const currentPath = location ? getLocationPathLabel(location, viewModel.locations) : "";
    const path = currentPath || link.locationPathSnapshot.join(" › ") || "Local sem caminho";
    const area = location?.reportArea || link.reportArea || "Sem área de relatório";
    const status = link.active ? "Ativo" : "Inativo";
    card.className = `item-location-link-card${link.active ? "" : " is-inactive"}`;
    card.append(
        createTextElement("h4", `${link.itemCode} — ${link.itemNameSnapshot}`),
        createTextElement("p", `Grupo: ${link.groupNameSnapshot}`),
        createTextElement("p", `${path} · ${area} · ${status}`, "item-location-link-meta")
    );
    const warningContainer = document.createElement("div");
    warningContainer.className = "item-location-link-warnings";
    renderWarnings(warningContainer, getLinkWarnings(link, viewModel));
    card.append(warningContainer, createLinkActions(link, siblings, handlers));
    return card;
}

function renderLinkSummary(viewModel) {
    const summary = summarizeItemLocationLinks(
        [viewModel.selectedTemplate],
        viewModel.locations,
        viewModel.links
    );
    getElement("item-location-links-summary").textContent = (
        `${summary.total} vínculo(s) · ${summary.active} ativo(s) · `
        + `${summary.linkedItems} item(ns) · ${summary.linkedLocations} local(is)`
    );
}

function renderExistingLinks(viewModel, handlers) {
    const container = getElement("item-location-links-list");
    const links = getFilteredLinks(viewModel);
    container.innerHTML = "";
    renderLinkSummary(viewModel);

    if (links.length === 0) {
        container.appendChild(createTextElement("p", "Nenhum vínculo encontrado.", "item-location-empty-note"));
        return;
    }

    links.forEach((link) => container.appendChild(createLinkCard(link, viewModel, handlers)));
}

export function renderItemLocationLinks(viewModel, handlers) {
    if (currentViewModel?.selectedTemplate?.id !== viewModel.selectedTemplate?.id) {
        itemSearchQuery = "";
        getElement("item-location-search").value = "";
    }

    currentViewModel = viewModel;
    renderTemplateOptions(viewModel);
    renderRequirementStates(viewModel);

    if (!viewModel.selectedTemplate) {
        return;
    }

    renderItemPicker(handlers);
    renderSelectedItem(viewModel);
    renderLinkLocationOptions(viewModel);
    renderFilterOptions(viewModel);
    renderExistingLinks(viewModel, handlers);
}

export function connectItemLocationLinkEvents(handlers) {
    getElement("item-location-template").addEventListener("change", (event) => handlers.onSelectTemplate(event.target.value));
    getElement("item-location-search").addEventListener("input", (event) => {
        itemSearchQuery = event.target.value.trim();
        renderItemPicker(handlers);
    });
    getElement("item-location-target").addEventListener("change", renderSelectedLocationWarnings);
    getElement("item-location-link-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const button = getElement("btn-create-item-location-link");
        button.disabled = true;

        try {
            await handlers.onCreateLink(getElement("item-location-target").value);
        } finally {
            button.disabled = false;
        }
    });
    getElement("item-location-filter-location").addEventListener("change", (event) => handlers.onFilterLocation(event.target.value));
    getElement("item-location-filter-item").addEventListener("change", (event) => handlers.onFilterItem(event.target.value));
    getElement("btn-item-location-open-templates").addEventListener("click", handlers.onOpenTemplates);
    getElement("btn-item-location-open-locations").addEventListener("click", handlers.onOpenLocations);
}
