import {
    buildLocationTree,
    getLocationPath,
    KNOWN_REPORT_AREAS,
    LOCATION_NODE_TYPES,
    summarizeLocationNodes
} from "./locationNodes.js";

const typeLabels = {
    room: "Cômodo",
    equipment: "Equipamento",
    shelf: "Prateleira",
    section: "Seção",
    custom: "Personalizado"
};

const customReportAreaValue = "__custom__";

let currentFormState = null;

function getElement(id) {
    return document.getElementById(id);
}

function createButton(text, className, onClick) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className;
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
}

export function showLocationNodesFeedback(message, tone = "info") {
    const feedback = getElement("location-nodes-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function getFormValues() {
    const selectedReportArea = getElement("location-report-area-option").value;
    const customReportArea = getElement("location-report-area").value;

    return {
        ...currentFormState,
        name: getElement("location-name").value.trim(),
        type: getElement("location-type").value,
        reportArea: resolveReportAreaSelection(selectedReportArea, customReportArea),
        active: getElement("location-active").checked
    };
}

export function resolveReportAreaSelection(selectedArea, customArea) {
    const normalizedSelectedArea = String(selectedArea || "").trim();

    if (normalizedSelectedArea === customReportAreaValue) {
        return String(customArea || "").trim() || null;
    }

    return normalizedSelectedArea || null;
}

function getReportAreaSelection(reportArea) {
    const normalizedReportArea = String(reportArea || "").trim();

    if (!normalizedReportArea || KNOWN_REPORT_AREAS.includes(normalizedReportArea)) {
        return { selectedArea: normalizedReportArea, customArea: "" };
    }

    return { selectedArea: customReportAreaValue, customArea: normalizedReportArea };
}

function setCustomReportAreaVisibility(shouldShow, shouldFocus = false) {
    const customInput = getElement("location-report-area");
    customInput.hidden = !shouldShow;

    if (shouldShow && shouldFocus) {
        customInput.focus();
    }
}

function setReportAreaFormValue(reportArea) {
    const selection = getReportAreaSelection(reportArea);
    getElement("location-report-area-option").value = selection.selectedArea;
    getElement("location-report-area").value = selection.customArea;
    setCustomReportAreaVisibility(selection.selectedArea === customReportAreaValue);
}

export function resolveLocationFormReportArea(node, parent) {
    if (node) {
        return node.reportArea ?? null;
    }

    return parent?.reportArea ?? null;
}

function hideLocationForm() {
    currentFormState = null;
    getElement("location-form").hidden = true;
}

function showLocationForm(node = null, parent = null) {
    currentFormState = node
        ? { id: node.id, parentId: node.parentId, order: node.order, createdAt: node.createdAt }
        : { id: null, parentId: parent?.id || null, order: null, createdAt: null };

    getElement("location-form-title").textContent = node
        ? "Editar local"
        : parent ? `Novo local em ${parent.name}` : "Novo local raiz";
    getElement("location-name").value = node?.name || "";
    getElement("location-type").value = node?.type || (parent ? "equipment" : "room");
    setReportAreaFormValue(resolveLocationFormReportArea(node, parent));
    getElement("location-active").checked = node?.active !== false;
    getElement("location-parent-path").textContent = parent ? `Local pai: ${parent.name}` : "Local raiz";
    getElement("location-form").hidden = false;
    getElement("location-name").focus();
}

function formatTypeTotals(totalsByType) {
    return LOCATION_NODE_TYPES
        .filter((type) => totalsByType[type] > 0)
        .map((type) => `${typeLabels[type]}: ${totalsByType[type]}`)
        .join(" · ") || "Nenhum tipo cadastrado";
}

function renderLocationSummary(nodes) {
    const summary = summarizeLocationNodes(nodes);
    const container = getElement("location-nodes-summary");
    const areas = summary.reportAreas.length > 0 ? summary.reportAreas.join(", ") : "Nenhuma";

    container.innerHTML = "";
    [
        `Total de locais: ${summary.total}`,
        `Locais raiz: ${summary.rootCount}`,
        `Por tipo: ${formatTypeTotals(summary.totalsByType)}`,
        `Áreas usadas: ${areas}`
    ].forEach((text) => {
        const paragraph = document.createElement("p");
        paragraph.textContent = text;
        container.appendChild(paragraph);
    });
}

function createLocationMeta(node, nodes) {
    const meta = document.createElement("p");
    const path = getLocationPath(node.id, nodes).map((pathNode) => pathNode.name).join(" › ");
    const status = node.active ? "Ativo" : "Inativo";
    const area = node.reportArea || "Sem área de relatório";

    meta.className = "location-node-meta";
    meta.textContent = `${path} · ${typeLabels[node.type]} · ${area} · ${status}`;
    return meta;
}

function createLocationActions(node, siblings, nodes, handlers) {
    const actions = document.createElement("div");
    actions.className = "location-node-actions";
    const nodeIndex = siblings.findIndex((sibling) => sibling.id === node.id);
    const parent = node.parentId ? nodes.find((item) => item.id === node.parentId) : null;
    const addButton = createButton("Adicionar filho", "location-action-button", () => showLocationForm(null, node));
    const editButton = createButton("Editar", "location-action-button", () => showLocationForm(node, parent));
    const upButton = createButton("Subir", "location-action-button", () => handlers.onMoveNode(node.id, -1));
    const downButton = createButton("Descer", "location-action-button", () => handlers.onMoveNode(node.id, 1));
    const deleteButton = createButton("Remover", "location-action-button location-danger-button", () => (
        handlers.onDeleteNode(node.id)
    ));

    upButton.disabled = nodeIndex <= 0;
    downButton.disabled = nodeIndex === siblings.length - 1;
    actions.append(addButton, editButton, upButton, downButton, deleteButton);
    return actions;
}

function createLocationTreeItem(node, siblings, nodes, handlers) {
    const listItem = document.createElement("li");
    const card = document.createElement("article");
    const title = document.createElement("h4");

    listItem.className = "location-tree-item";
    card.className = `location-node-card${node.active ? "" : " is-inactive"}`;
    title.textContent = node.name;
    card.append(title, createLocationMeta(node, nodes), createLocationActions(node, siblings, nodes, handlers));
    listItem.appendChild(card);

    if (node.children.length > 0) {
        listItem.appendChild(createLocationTreeList(node.children, nodes, handlers));
    }

    return listItem;
}

function createLocationTreeList(treeNodes, nodes, handlers) {
    const list = document.createElement("ul");
    list.className = "location-tree-list";
    treeNodes.forEach((node) => list.appendChild(createLocationTreeItem(node, treeNodes, nodes, handlers)));
    return list;
}

function renderEmptyState(container) {
    const message = document.createElement("p");
    message.className = "location-nodes-empty";
    message.textContent = "Nenhum local físico cadastrado neste dispositivo.";
    container.appendChild(message);
}

export function renderLocationNodes(nodes, handlers) {
    const container = getElement("location-nodes-tree");
    const tree = buildLocationTree(nodes);

    hideLocationForm();
    renderLocationSummary(nodes);
    container.innerHTML = "";

    if (tree.length === 0) {
        renderEmptyState(container);
        return;
    }

    container.appendChild(createLocationTreeList(tree, nodes, handlers));
}

function renderLocationTypeOptions() {
    const select = getElement("location-type");
    select.innerHTML = "";

    LOCATION_NODE_TYPES.forEach((type) => {
        const option = document.createElement("option");
        option.value = type;
        option.textContent = typeLabels[type];
        select.appendChild(option);
    });
}

function appendReportAreaOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

function createReportAreaSelect() {
    const customInput = getElement("location-report-area");
    const select = document.createElement("select");
    const label = document.querySelector('label[for="location-report-area"]');

    select.id = "location-report-area-option";
    appendReportAreaOption(select, "", "Sem área de relatório");
    KNOWN_REPORT_AREAS.forEach((area) => appendReportAreaOption(select, area, area));
    appendReportAreaOption(select, customReportAreaValue, "Área personalizada…");

    customInput.removeAttribute("list");
    customInput.placeholder = "Digite a área personalizada";
    customInput.setAttribute("aria-label", "Área de relatório personalizada");
    label.htmlFor = select.id;
    customInput.before(select);
    getElement("location-report-areas").remove();

    select.addEventListener("change", () => {
        const shouldShowCustomInput = select.value === customReportAreaValue;
        setCustomReportAreaVisibility(shouldShowCustomInput, shouldShowCustomInput);
    });
    setCustomReportAreaVisibility(false);
}

function renderReportAreaOptions() {
    if (getElement("location-report-area-option")) {
        return;
    }

    createReportAreaSelect();
}

export function connectLocationNodeEvents(handlers) {
    renderLocationTypeOptions();
    renderReportAreaOptions();
    getElement("btn-add-root-location").addEventListener("click", () => showLocationForm());
    getElement("btn-cancel-location").addEventListener("click", hideLocationForm);
    getElement("location-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const wasSaved = await handlers.onSaveNode(getFormValues());

        if (wasSaved) {
            hideLocationForm();
        }
    });
}
