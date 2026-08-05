import { filterLocationItemMap, summarizeLocationItemMap } from "./locationItemMap.js";

const locationTypeLabels = {
    room: "Cômodo",
    equipment: "Equipamento",
    shelf: "Prateleira",
    section: "Seção",
    custom: "Personalizado"
};

const orphanReasonLabels = {
    "missing-template": "template inexistente",
    "missing-item": "item ausente no template",
    "missing-location": "local inexistente"
};

let currentReport = null;
let selectedTemplateId = null;
let filters = createDefaultFilters();

function createDefaultFilters() {
    return { query: "", locationId: "", onlyProblems: false, showItemsWithoutLocation: true };
}

function getElement(id) {
    return document.getElementById(id);
}

function createTextElement(tagName, text, className = "") {
    const element = document.createElement(tagName);
    element.textContent = text;
    element.className = className;
    return element;
}

export function showLocationItemMapFeedback(message, tone = "info") {
    const feedback = getElement("location-item-map-feedback");
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

function renderTemplateOptions(templates, templateId) {
    const select = getElement("location-item-map-template");
    select.innerHTML = "";
    templates.forEach((template) => appendSelectOption(select, template.id, template.name, template.id === templateId));
    getElement("location-item-map-template-field").hidden = templates.length === 0;
}

function renderRequirementStates(templates, report) {
    const hasTemplate = templates.length > 0 && Boolean(report);
    const hasLocations = (report?.locations?.length || 0) > 0;
    const hasLinks = (report?.selectedLinks?.length || 0) > 0;

    getElement("location-item-map-no-template").hidden = hasTemplate;
    getElement("location-item-map-no-locations").hidden = !hasTemplate || hasLocations;
    getElement("location-item-map-no-links").hidden = !hasTemplate || !hasLocations || hasLinks;
    getElement("location-item-map-workspace").hidden = !hasTemplate || !hasLocations;
}

function createSummaryItem(label, value) {
    const item = document.createElement("div");
    item.className = "location-item-map-stat";
    item.append(createTextElement("dt", label), createTextElement("dd", String(value)));
    return item;
}

function renderSummary(report) {
    const summary = getElement("location-item-map-summary");
    const stats = summarizeLocationItemMap(report);
    const entries = [
        ["Templates", stats.templateCount], ["Template", stats.templateName],
        ["Itens do template", stats.templateItemCount], ["Locais", stats.totalLocations],
        ["Locais ativos", stats.activeLocations], ["Locais com vínculos", stats.linkedLocations],
        ["Vínculos ativos", stats.activeLinks], ["Vínculos inativos", stats.inactiveLinks],
        ["Itens sem local", stats.itemsWithoutLocation], ["Vínculos órfãos", stats.orphanLinks]
    ];
    summary.innerHTML = "";
    entries.forEach(([label, value]) => summary.appendChild(createSummaryItem(label, value)));
}

function getLocationPathLabel(location) {
    return location.pathLabel || location.name;
}

function renderLocationFilter(report) {
    const select = getElement("location-item-map-location-filter");
    select.innerHTML = "";
    appendSelectOption(select, "", "Todos os locais", !filters.locationId);
    report.locationEntries.forEach((entry) => appendSelectOption(
        select,
        entry.location.id,
        getLocationPathLabel(entry.location),
        entry.location.id === filters.locationId
    ));
}

function getLinkIssueLabels(link) {
    const labels = [];
    if (link.issues.includes("area-snapshot-mismatch")) labels.push("área do vínculo desatualizada");
    if (link.issues.includes("area-outside-item")) labels.push("área fora do item/grupo");
    if (link.issues.includes("location-without-area")) labels.push("local sem área");
    if (link.issues.includes("inactive-location")) labels.push("local inativo");
    return labels;
}

function createLinkItem(link) {
    const item = document.createElement("li");
    item.className = `location-item-map-item${link.active ? "" : " is-inactive"}`;
    const status = link.active ? "Ativo" : "Inativo";
    const area = link.reportArea || "sem área no vínculo";
    item.append(
        createTextElement("strong", `${link.itemCode} — ${link.itemNameSnapshot}`),
        createTextElement("span", `Grupo: ${link.groupNameSnapshot || "sem grupo"}`),
        createTextElement("span", `Área do vínculo: ${area} · ${status} · ordem ${link.order}`)
    );
    const issueLabels = getLinkIssueLabels(link);
    if (issueLabels.length > 0) item.appendChild(createTextElement("small", issueLabels.join(" · "), "location-item-map-warning"));
    return item;
}

function createLinkList(links) {
    const list = document.createElement("ul");
    list.className = "location-item-map-item-list";
    links.forEach((link) => list.appendChild(createLinkItem(link)));
    return list;
}

function createInactiveLinkDetail(links) {
    const detail = document.createElement("details");
    detail.className = "location-item-map-inactive-links";
    detail.append(createTextElement("summary", `${links.length} vínculo(s) inativo(s)`), createLinkList(links));
    return detail;
}

function createLocationCard(entry) {
    const card = document.createElement("article");
    const area = entry.location.reportArea || "Sem área de relatório";
    card.className = `location-item-map-card${entry.hasProblems ? " has-warning" : ""}`;
    card.style.setProperty("--location-map-depth", String(entry.depth));
    card.append(
        createTextElement("h4", getLocationPathLabel(entry.location)),
        createTextElement("p", `${locationTypeLabels[entry.location.type] || entry.location.type} · ${area}`),
        createTextElement("p", `${entry.activeLinks.length} ativo(s) · ${entry.inactiveLinks.length} inativo(s)`, "location-item-map-counts")
    );
    if (entry.activeLinks.length > 0) card.appendChild(createLinkList(entry.activeLinks));
    if (entry.activeLinks.length === 0) card.appendChild(createTextElement("p", "Nenhum vínculo ativo.", "location-item-map-empty-note"));
    if (entry.inactiveLinks.length > 0) card.appendChild(createInactiveLinkDetail(entry.inactiveLinks));
    return card;
}

function renderLocationMap(report) {
    const container = getElement("location-item-map-locations");
    container.innerHTML = "";
    if (report.locationEntries.length === 0) {
        container.appendChild(createTextElement("p", "Nenhum local corresponde aos filtros.", "location-item-map-empty-note"));
        return;
    }
    report.locationEntries.forEach((entry) => container.appendChild(createLocationCard(entry)));
}

function createDiagnosticBlock(title, entries, emptyMessage, renderEntry) {
    const detail = document.createElement("details");
    detail.className = "location-item-map-diagnostic";
    detail.appendChild(createTextElement("summary", `${title} — ${entries.length}`));
    if (entries.length === 0) {
        detail.appendChild(createTextElement("p", emptyMessage, "location-item-map-empty-note"));
        return detail;
    }
    const list = document.createElement("ul");
    entries.forEach((entry) => list.appendChild(createTextElement("li", renderEntry(entry))));
    detail.appendChild(list);
    return detail;
}

function linkLabel(link) {
    return `${link.itemCode} — ${link.itemNameSnapshot || "item sem nome"}`;
}

function renderDiagnostics(report) {
    const container = getElement("location-item-map-diagnostics");
    const diagnostics = report.diagnostics;
    container.innerHTML = "";
    const blocks = [
        createDiagnosticBlock("Locais ativos sem itens", diagnostics.locationsWithoutItems, "Todos possuem vínculo.", getLocationPathLabel),
        createDiagnosticBlock("Vínculos inativos", diagnostics.inactiveLinks, "Nenhum vínculo inativo.", linkLabel),
        createDiagnosticBlock("Vínculos órfãos", diagnostics.orphanLinks, "Nenhum vínculo órfão.", ({ link, reasons }) => `${linkLabel(link)} · ${reasons.map((reason) => orphanReasonLabels[reason]).join(", ")}`),
        createDiagnosticBlock("Área do vínculo diferente do local", diagnostics.areaSnapshotMismatches, "Nenhuma divergência de snapshot.", linkLabel),
        createDiagnosticBlock("Vínculos em local sem área", diagnostics.linksInLocationsWithoutArea, "Nenhum vínculo nessa situação.", linkLabel),
        createDiagnosticBlock("Vínculos em local inativo", diagnostics.linksInInactiveLocations, "Nenhum vínculo nessa situação.", linkLabel),
        createDiagnosticBlock("Área do local fora do item/grupo", diagnostics.linksOutsideItemAreas, "Nenhuma área incompatível.", linkLabel),
        createDiagnosticBlock("Locais sem área de relatório", diagnostics.locationsWithoutArea, "Nenhum local sem área.", getLocationPathLabel),
        createDiagnosticBlock("Locais com área fora do template", diagnostics.locationsOutsideTemplate, "Nenhuma área fora do template.", (location) => `${getLocationPathLabel(location)} · ${location.reportArea}`)
    ];
    if (report.appliedFilters?.showItemsWithoutLocation !== false) {
        blocks.splice(1, 0, createDiagnosticBlock(
            "Itens do template sem local",
            diagnostics.itemsWithoutLocation,
            "Todos possuem local.",
            ({ item, group }) => `${item.code} — ${item.name} · ${group.name}`
        ));
    }
    container.append(...blocks);
}

function renderMapContent() {
    if (!currentReport) return;
    const filteredReport = filterLocationItemMap(currentReport, filters);
    renderLocationMap(filteredReport);
    renderDiagnostics(filteredReport);
}

export function renderLocationItemMap({ templates, selectedTemplate, report }) {
    if (selectedTemplateId !== selectedTemplate?.id) {
        selectedTemplateId = selectedTemplate?.id || null;
        filters = createDefaultFilters();
        getElement("location-item-map-search").value = "";
        getElement("location-item-map-only-problems").checked = false;
        getElement("location-item-map-show-unlinked").checked = true;
    }
    currentReport = report;
    renderTemplateOptions(templates, selectedTemplateId);
    renderRequirementStates(templates, report);
    if (!report || report.locations.length === 0) return;
    renderSummary(report);
    renderLocationFilter(report);
    renderMapContent();
}

export function connectLocationItemMapEvents(handlers) {
    getElement("location-item-map-template").addEventListener("change", (event) => handlers.onSelectTemplate(event.target.value));
    getElement("location-item-map-search").addEventListener("input", (event) => { filters.query = event.target.value; renderMapContent(); });
    getElement("location-item-map-location-filter").addEventListener("change", (event) => { filters.locationId = event.target.value; renderMapContent(); });
    getElement("location-item-map-only-problems").addEventListener("change", (event) => { filters.onlyProblems = event.target.checked; renderMapContent(); });
    getElement("location-item-map-show-unlinked").addEventListener("change", (event) => { filters.showItemsWithoutLocation = event.target.checked; renderMapContent(); });
    getElement("btn-location-item-map-templates").addEventListener("click", handlers.onOpenTemplates);
    getElement("btn-location-item-map-locations").addEventListener("click", handlers.onOpenLocations);
    getElement("btn-location-item-map-links").addEventListener("click", handlers.onOpenLinks);
}
