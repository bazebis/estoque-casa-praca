import { summarizeCoverageReport } from "./countPreparation.js";

function getElement(id) {
    return document.getElementById(id);
}

function createTextElement(tagName, text, className = "") {
    const element = document.createElement(tagName);
    element.textContent = text;
    element.className = className;
    return element;
}

export function showCountPreparationFeedback(message, tone = "info") {
    const feedback = getElement("count-preparation-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function renderTemplateOptions(templates, selectedTemplateId) {
    const select = getElement("count-preparation-template");
    select.innerHTML = "";

    templates.forEach((template) => {
        const option = document.createElement("option");
        option.value = template.id;
        option.textContent = template.name;
        option.selected = template.id === selectedTemplateId;
        select.appendChild(option);
    });

    getElement("count-preparation-template-field").hidden = templates.length === 0;
}

function createSummaryItem(label, value) {
    const item = document.createElement("div");
    item.className = "count-preparation-stat";
    item.append(createTextElement("dt", label), createTextElement("dd", String(value)));
    return item;
}

function renderGeneralSummary(templateCount, report) {
    const summary = getElement("count-preparation-summary");
    const stats = summarizeCoverageReport(report);
    const entries = [
        ["Templates importados", templateCount],
        ["Template selecionado", stats.templateName],
        ["Grupos", stats.groupCount],
        ["Itens", stats.itemCount],
        ["Áreas reais", stats.areaCount],
        ["Locais físicos", stats.totalLocations],
        ["Locais ativos", stats.activeLocations],
        ["Locais sem área", stats.locationsWithoutArea],
        ["Áreas sem local", stats.areasWithoutLocation],
        ["Áreas sem local ativo", stats.areasWithoutActiveLocation],
        ["Locais fora do template", stats.locationsOutsideTemplate]
    ];

    summary.innerHTML = "";
    entries.forEach(([label, value]) => summary.appendChild(createSummaryItem(label, value)));
    summary.hidden = false;
}

function createLocationList(locations) {
    const list = document.createElement("ul");
    list.className = "count-preparation-location-list";

    locations.forEach((location) => {
        const status = location.active ? "ativo" : "inativo";
        list.appendChild(createTextElement("li", `${location.pathLabel} — ${status}`));
    });

    return list;
}

function createGroupItems(group) {
    const list = document.createElement("ul");
    list.className = "count-preparation-item-list";

    group.items.forEach((item) => {
        const code = item.code ? `${item.code} — ` : "";
        list.appendChild(createTextElement("li", `${code}${item.name}`));
    });

    return list;
}

function createGroupDetail(group) {
    const detail = document.createElement("details");
    detail.className = "count-preparation-group";
    const summary = createTextElement("summary", `${group.name} — ${group.itemCount} item(ns)`);
    detail.append(summary, createGroupItems(group));
    return detail;
}

function createAreaStatus(area) {
    if (area.hasActiveLocation) {
        return createTextElement("span", "Coberta", "count-preparation-status is-covered");
    }

    if (area.hasConfiguredLocation) {
        return createTextElement("span", "Somente local inativo", "count-preparation-status is-warning");
    }

    return createTextElement("span", "Sem local físico", "count-preparation-status is-missing");
}

function createAreaCard(area) {
    const card = document.createElement("article");
    card.className = "count-preparation-area-card";
    const header = document.createElement("div");
    header.className = "count-preparation-area-header";
    header.append(createTextElement("h4", area.name), createAreaStatus(area));
    const totals = createTextElement(
        "p",
        `${area.groupCount} grupo(s) · ${area.itemCount} item(ns) · ${area.locations.length} local(is)`,
        "count-preparation-area-meta"
    );
    const locationsTitle = createTextElement("h5", "Locais configurados");
    const locations = area.locations.length > 0
        ? createLocationList(area.locations)
        : createTextElement("p", "Nenhum local físico usa esta área.", "count-preparation-empty-note");
    const groups = document.createElement("div");
    groups.className = "count-preparation-groups";
    area.groups.forEach((group) => groups.appendChild(createGroupDetail(group)));
    card.append(header, totals, locationsTitle, locations, createTextElement("h5", "Grupos e itens"), groups);
    return card;
}

function renderAreaCoverage(report) {
    const container = getElement("count-preparation-areas");
    container.innerHTML = "";

    if (report.areas.length === 0) {
        container.appendChild(createTextElement(
            "p",
            "Nenhuma área física foi encontrada neste template. A área TOTAL não exige local físico.",
            "count-preparation-empty count-preparation-empty-note"
        ));
        return;
    }

    report.areas.forEach((area) => container.appendChild(createAreaCard(area)));
}

function createIssueBlock(title, locations, emptyMessage, includeArea = false) {
    const block = document.createElement("section");
    block.className = "count-preparation-issue-block";
    block.appendChild(createTextElement("h4", title));

    if (locations.length === 0) {
        block.appendChild(createTextElement("p", emptyMessage, "count-preparation-empty-note"));
        return block;
    }

    const list = document.createElement("ul");
    locations.forEach((location) => {
        const area = includeArea && location.reportArea ? ` — área ${location.reportArea}` : "";
        const status = location.active ? "" : " — inativo";
        list.appendChild(createTextElement("li", `${location.pathLabel}${area}${status}`));
    });
    block.appendChild(list);
    return block;
}

function renderLocationIssues(report) {
    const container = getElement("count-preparation-issues");
    container.innerHTML = "";
    const issueDefinitions = [
        ["Locais sem área de relatório", report.locationsWithoutArea, "Nenhum local sem área."],
        ["Locais com área fora do template", report.locationsOutsideTemplate, "Nenhum local usa área fora do template.", true],
        ["Locais inativos", report.inactiveLocations, "Nenhum local inativo.", true]
    ].filter(([, locations]) => locations.length > 0);
    if (issueDefinitions.length === 0) {
        container.appendChild(createTextElement(
            "p",
            "Prontidão confirmada: todas as áreas possuem configuração coerente.",
            "count-preparation-empty-note"
        ));
        return;
    }
    container.append(...issueDefinitions.map((definition) => createIssueBlock(...definition)));
}

function renderEmptyState() {
    getElement("count-preparation-summary").hidden = true;
    getElement("count-preparation-areas").innerHTML = "";
    getElement("count-preparation-issues").innerHTML = "";
    getElement("count-preparation-empty").hidden = false;
}

export function renderCountPreparation({ templates, selectedTemplateId, report }) {
    renderTemplateOptions(templates, selectedTemplateId);

    if (!report) {
        renderEmptyState();
        return;
    }

    getElement("count-preparation-empty").hidden = true;
    renderGeneralSummary(templates.length, report);
    renderAreaCoverage(report);
    renderLocationIssues(report);
}

export function connectCountPreparationEvents(handlers) {
    getElement("count-preparation-template").addEventListener("change", (event) => {
        handlers.onSelectTemplate(event.target.value);
    });
    getElement("btn-count-preparation-templates").addEventListener("click", handlers.onOpenTemplates);
}
