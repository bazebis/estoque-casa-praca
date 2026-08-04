import { summarizeCountTemplate } from "./countTemplates.js";

function getElement(id) {
    return document.getElementById(id);
}

function createButton(text, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    return button;
}

function formatDateTime(value) {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) {
        return "Não informada";
    }

    return date.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short"
    });
}

function formatAreas(areas) {
    return areas.length > 0 ? areas.join(", ") : "Nenhuma área informada";
}

export function showCountTemplateFeedback(message, tone = "info") {
    const feedback = getElement("count-template-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function createTemplateMeta(template) {
    const summary = summarizeCountTemplate(template);
    const meta = document.createElement("p");
    meta.className = "count-template-card-meta";
    meta.textContent = `${summary.groupCount} grupos · ${summary.itemCount} itens`;
    return meta;
}

function createTemplateCard(template, handlers) {
    const card = document.createElement("article");
    card.className = "count-template-card";

    const title = document.createElement("h4");
    title.textContent = template.name;

    const source = document.createElement("p");
    source.className = "count-template-card-source";
    source.textContent = `Fonte: ${template.sourceFile || "não informada"}`;

    const actions = document.createElement("div");
    actions.className = "count-template-actions";
    const detailButton = createButton("Ver detalhes", "count-template-primary-button");
    detailButton.addEventListener("click", () => handlers.onViewTemplate(template.id));
    const deleteButton = createButton("Remover", "count-template-danger-button");
    deleteButton.addEventListener("click", () => handlers.onDeleteTemplate(template.id));
    actions.append(detailButton, deleteButton);
    card.append(title, createTemplateMeta(template), source, actions);

    return card;
}

function renderEmptyState(container) {
    const message = document.createElement("p");
    message.className = "count-template-empty";
    message.textContent = "Nenhum template importado neste dispositivo.";
    container.appendChild(message);
}

export function renderCountTemplateList(templates, handlers) {
    const list = getElement("count-template-list");
    const detail = getElement("count-template-detail");
    list.innerHTML = "";
    list.hidden = false;
    detail.innerHTML = "";
    detail.hidden = true;

    if (templates.length === 0) {
        renderEmptyState(list);
        return;
    }

    templates.forEach((template) => {
        list.appendChild(createTemplateCard(template, handlers));
    });
}

function createDetailMetadata(template) {
    const summary = summarizeCountTemplate(template);
    const list = document.createElement("dl");
    list.className = "count-template-metadata";
    const entries = [
        ["Arquivo fonte", template.sourceFile || "Não informado"],
        ["Gerado em", formatDateTime(template.generatedAt)],
        ["Importado em", formatDateTime(template.importedAt)],
        ["Grupos", summary.groupCount],
        ["Itens", summary.itemCount],
        ["Áreas", formatAreas(summary.areas)]
    ];

    entries.forEach(([label, value]) => {
        const term = document.createElement("dt");
        term.textContent = label;
        const description = document.createElement("dd");
        description.textContent = String(value);
        list.append(term, description);
    });

    return list;
}

function createItemSample(group) {
    const list = document.createElement("ul");
    list.className = "count-template-sample-list";

    group.items.slice(0, 5).forEach((item) => {
        const listItem = document.createElement("li");
        listItem.textContent = `${item.code} — ${item.name}`;
        list.appendChild(listItem);
    });

    if (group.items.length > 5) {
        const remaining = document.createElement("li");
        remaining.className = "count-template-sample-more";
        remaining.textContent = `Mais ${group.items.length - 5} item(ns).`;
        list.appendChild(remaining);
    }

    return list;
}

function createGroupDetail(group) {
    const details = document.createElement("details");
    details.className = "count-template-group";
    const summary = document.createElement("summary");
    summary.textContent = `${group.name} — ${group.items.length} itens`;
    const areas = document.createElement("p");
    areas.textContent = `Áreas: ${formatAreas(group.countAreas || [])}`;
    details.append(summary, areas, createItemSample(group));
    return details;
}

function createDetailActions(template, handlers) {
    const actions = document.createElement("div");
    actions.className = "count-template-actions";
    const backButton = createButton("Voltar aos templates", "count-template-secondary-button");
    backButton.addEventListener("click", handlers.onBackToList);
    const deleteButton = createButton("Remover template", "count-template-danger-button");
    deleteButton.addEventListener("click", () => handlers.onDeleteTemplate(template.id));
    actions.append(backButton, deleteButton);
    return actions;
}

export function renderCountTemplateDetail(template, handlers) {
    const list = getElement("count-template-list");
    const detail = getElement("count-template-detail");
    list.hidden = true;
    detail.hidden = false;
    detail.innerHTML = "";

    const title = document.createElement("h4");
    title.textContent = template.name;
    const groupsTitle = document.createElement("h5");
    groupsTitle.textContent = "Grupos e amostras";
    const groups = document.createElement("div");
    groups.className = "count-template-groups";
    template.groups.forEach((group) => groups.appendChild(createGroupDetail(group)));
    detail.append(title, createDetailMetadata(template), groupsTitle, groups, createDetailActions(template, handlers));
}

export function clearCountTemplateImportFile() {
    getElement("count-template-import-file").value = "";
}

export function connectCountTemplateEvents(handlers) {
    getElement("btn-importar-count-template").addEventListener("click", async (event) => {
        const file = getElement("count-template-import-file").files[0];

        if (!file) {
            showCountTemplateFeedback("Selecione um arquivo JSON.", "error");
            return;
        }

        const button = event.currentTarget;
        button.disabled = true;

        try {
            const text = await file.text();
            const wasImported = await handlers.onImportTemplate(text, file.name);

            if (wasImported) {
                clearCountTemplateImportFile();
            }
        } catch {
            showCountTemplateFeedback("Não foi possível ler o arquivo selecionado.", "error");
        } finally {
            button.disabled = false;
        }
    });
}
