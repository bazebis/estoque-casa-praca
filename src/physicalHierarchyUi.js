import {
    getOperationalNode,
    getOperationalRoots
} from "./physicalHierarchyReadModel.js";

const locationTypeLabels = {
    room: "Cômodo",
    equipment: "Equipamento",
    shelf: "Prateleira",
    section: "Seção",
    custom: "Local"
};

function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
    })[character]);
}

function pluralize(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}

export function resolvePhysicalHierarchyNodeAction(node) {
    if (node?.hasChildren) {
        return "navigate";
    }

    return resolvePhysicalHierarchyCountingMode(node) === "blocked" ? "empty" : "count";
}

export function resolvePhysicalHierarchyCountingMode(node) {
    if (node?.openSession) {
        return "resume";
    }

    return node?.hasDirectItems ? "start" : "blocked";
}

function buildNavigationGuidance(hasTemplate, selectedNode, listedNodes) {
    if (!hasTemplate) {
        return "Importe um template para acessar os locais de contagem.";
    }

    if (!selectedNode && listedNodes.length === 0) {
        return "Nenhum local operacional está disponível. Revise Locais físicos nas Configurações.";
    }

    if (selectedNode && listedNodes.length === 0) {
        return "Este local não possui subdivisões operacionais.";
    }

    return selectedNode
        ? "Escolha um sublocal ou conte os itens vinculados diretamente a este local."
        : "Escolha um local para navegar ou iniciar uma contagem.";
}

export function buildPhysicalHierarchyNavigationView({ hierarchy, selectedNodeId = null, templateName = "" } = {}) {
    const hasTemplate = Boolean(hierarchy?.templateId);
    const requestedNodeId = String(selectedNodeId ?? "").trim();
    const selectedNode = hasTemplate && requestedNodeId ? getOperationalNode(hierarchy, requestedNodeId) : null;
    const listedNodes = hasTemplate
        ? selectedNode?.directChildren || getOperationalRoots(hierarchy)
        : [];

    return {
        hasTemplate,
        templateName,
        mode: selectedNode ? "node" : "roots",
        selectedNode,
        selectedNodeId: selectedNode?.id || null,
        invalidSelection: Boolean(requestedNodeId && !selectedNode),
        backNodeId: selectedNode?.parentId || null,
        breadcrumb: selectedNode?.path.map((part) => part.name).join(" / ") || "",
        listedNodes,
        guidance: buildNavigationGuidance(hasTemplate, selectedNode, listedNodes)
    };
}

export function getCountingReturnNodeId(navigationView) {
    return navigationView?.selectedNode?.id || null;
}

function renderNodeMetadata(node) {
    const metadata = [
        pluralize(node.directLinkCount, "item neste local", "itens neste local"),
        pluralize(node.descendantCount, "sublocal", "sublocais"),
        pluralize(node.subtreeLinkCount, "vínculo na estrutura", "vínculos na estrutura")
    ];
    return metadata.map((item) => `<span>${escapeHtml(item)}</span>`).join("");
}

function getNodeActionLabel(node, action) {
    if (action === "navigate") {
        return "Abrir local";
    }

    if (action === "count") {
        return node.openSession ? "Retomar contagem" : "Iniciar contagem";
    }

    return "Sem itens configurados";
}

function renderNodeCard(node) {
    const action = resolvePhysicalHierarchyNodeAction(node);
    const actionAttribute = action === "navigate"
        ? `data-open-hierarchy-node="${escapeHtml(node.id)}"`
        : `data-open-location-counting="${escapeHtml(node.id)}"`;
    const disabled = action === "empty" ? "disabled" : "";

    return `
        <button type="button" class="physical-location-card" ${action === "empty" ? "" : actionAttribute} ${disabled}>
            <strong>${escapeHtml(node.name)}</strong>
            <span class="physical-location-action">${escapeHtml(getNodeActionLabel(node, action))}</span>
            <span class="physical-location-type">${escapeHtml(locationTypeLabels[node.type] || "Local")}</span>
            <span class="physical-location-metadata">${renderNodeMetadata(node)}</span>
        </button>
    `;
}

function renderEmptyList(view) {
    if (view.listedNodes.length > 0) {
        return view.listedNodes.map(renderNodeCard).join("");
    }

    return `<p class="physical-hierarchy-empty">${escapeHtml(view.guidance)}</p>`;
}

function renderDirectItemsPanel(selectedNode) {
    const panel = getElement("physical-hierarchy-direct-items");
    const count = getElement("physical-hierarchy-direct-count");
    const button = getElement("btn-count-physical-location");
    panel.hidden = !selectedNode;

    if (!selectedNode) {
        return;
    }

    const countingMode = resolvePhysicalHierarchyCountingMode(selectedNode);
    if (selectedNode.hasDirectItems) {
        count.textContent = pluralize(
            selectedNode.directLinkCount,
            "item vinculado diretamente.",
            "itens vinculados diretamente."
        );
    } else if (countingMode === "resume") {
        count.textContent = "A sessão aberta preserva os itens planejados anteriormente.";
    } else {
        count.textContent = "Nenhum item está vinculado diretamente a este local.";
    }

    button.hidden = countingMode === "blocked";
    button.dataset.openLocationCounting = countingMode === "blocked" ? "" : selectedNode.id;
    button.textContent = countingMode === "resume"
        ? "Retomar contagem deste local"
        : "Iniciar contagem deste local";
}

function renderActiveTemplate(view) {
    const activeTemplate = getElement("pilot-active-template");
    activeTemplate.hidden = !view.hasTemplate;
    activeTemplate.textContent = view.hasTemplate
        ? `Template ativo: ${view.templateName}`
        : "";
}

export function renderPhysicalHierarchyNavigation(options = {}) {
    const view = buildPhysicalHierarchyNavigationView(options);
    const guidance = options.message || view.guidance;
    const backButton = getElement("btn-back-physical-hierarchy");
    const breadcrumb = getElement("physical-hierarchy-breadcrumb");

    getElement("pilot-area-title").textContent = view.selectedNode ? "Locais filhos" : "Locais para contar";
    getElement("pilot-area-guidance").textContent = guidance;
    getElement("pilot-area-list").innerHTML = renderEmptyList(view);
    renderActiveTemplate(view);
    backButton.hidden = !view.selectedNode;
    breadcrumb.hidden = !view.selectedNode;
    breadcrumb.textContent = view.breadcrumb;
    renderDirectItemsPanel(view.selectedNode);
    return view;
}

export function connectPhysicalHierarchyEvents(handlers) {
    getElement("pilot-area-list").addEventListener("click", (event) => {
        const navigationButton = event.target.closest("[data-open-hierarchy-node]");
        const countingButton = event.target.closest("[data-open-location-counting]");
        if (navigationButton && !navigationButton.disabled) {
            handlers.onSelectNode(navigationButton.dataset.openHierarchyNode);
        } else if (countingButton && !countingButton.disabled) {
            handlers.onOpenCounting(countingButton.dataset.openLocationCounting);
        }
    });
    getElement("btn-count-physical-location").addEventListener("click", (event) => {
        const locationId = event.currentTarget.dataset.openLocationCounting;
        if (locationId) handlers.onOpenCounting(locationId);
    });
    getElement("btn-back-physical-hierarchy").addEventListener("click", handlers.onBack);
}
