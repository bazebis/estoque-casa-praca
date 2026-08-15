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

export function resolvePhysicalHierarchyNodeAction(node, options = {}) {
    if (node?.hasChildren) {
        return "navigate";
    }

    return resolvePhysicalHierarchyCountingMode(node, options) === "blocked" ? "empty" : "count";
}

export function resolvePhysicalHierarchyCountingMode(node, options = {}) {
    if (options.hasActiveRound === false) return "blocked";
    if (options.hasActiveRound === true) {
        if (!options.roundLocation || options.roundLocation.operationalState === "attention") return "blocked";
        return options.roundLocation.sessionId ? "resume" : "start";
    }

    // A forma legada continua útil aos helpers históricos; a produção sempre informa o contexto da rodada.
    if (node?.openSession) {
        return "resume";
    }

    return node?.hasDirectItems ? "start" : "blocked";
}

function buildNavigationGuidance(hasTemplate, selectedNode, listedNodes, hasActiveRound) {
    if (!hasTemplate) {
        return "Importe um template para acessar os locais de contagem.";
    }

    if (!selectedNode && listedNodes.length === 0) {
        return "Nenhum local operacional está disponível. Revise Locais físicos nas Configurações.";
    }

    if (selectedNode && listedNodes.length === 0) {
        return "Este local não possui subdivisões operacionais.";
    }

    if (!hasActiveRound) {
        return selectedNode
            ? "Explore os sublocais ou volte e inicie uma contagem."
            : "Inicie uma contagem para liberar os lançamentos nos locais planejados.";
    }

    return selectedNode
        ? "Escolha um sublocal ou conte os itens vinculados diretamente a este local."
        : "Escolha um local para navegar ou iniciar uma contagem.";
}

export function buildPhysicalHierarchyNavigationView({
    hierarchy,
    selectedNodeId = null,
    templateName = "",
    roundViewModel = null
} = {}) {
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
        roundViewModel,
        roundLocationById: new Map((roundViewModel?.locations || []).map((location) => [location.locationId, location])),
        guidance: buildNavigationGuidance(hasTemplate, selectedNode, listedNodes, Boolean(roundViewModel))
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

function getNodeActionLabel(node, action, roundLocation, hasActiveRound) {
    if (action === "navigate") {
        return "Abrir local";
    }

    if (action === "count") {
        if (roundLocation?.cta === "review") return "Revisar lançamentos";
        return roundLocation?.sessionId ? "Retomar contagem" : "Iniciar contagem";
    }

    return hasActiveRound ? "Fora do plano ou requer atenção" : "Inicie uma contagem";
}

function formatRoundLocationState(roundLocation) {
    const labels = {
        not_started: "Não iniciado",
        in_progress: "Em andamento",
        filled: "Preenchido",
        attention: "Atenção"
    };
    return roundLocation ? labels[roundLocation.operationalState] || "Atenção" : "Estrutural";
}

function renderNodeCard(node, view) {
    const roundLocation = view.roundLocationById.get(node.id) || null;
    const hasActiveRound = Boolean(view.roundViewModel);
    const action = resolvePhysicalHierarchyNodeAction(node, { roundLocation, hasActiveRound });
    const actionAttribute = action === "navigate"
        ? `data-open-hierarchy-node="${escapeHtml(node.id)}"`
        : `data-open-location-counting="${escapeHtml(node.id)}"`;
    const disabled = action === "empty" ? "disabled" : "";

    return `
        <button type="button" class="physical-location-card" ${action === "empty" ? "" : actionAttribute} ${disabled}>
            <strong>${escapeHtml(node.name)}</strong>
            <span class="physical-location-action">${escapeHtml(getNodeActionLabel(node, action, roundLocation, hasActiveRound))}</span>
            ${hasActiveRound ? `<span class="count-round-location-state">${escapeHtml(formatRoundLocationState(roundLocation))}</span>` : ""}
            <span class="physical-location-type">${escapeHtml(locationTypeLabels[node.type] || "Local")}</span>
            <span class="physical-location-metadata">${renderNodeMetadata(node)}</span>
        </button>
    `;
}

function renderEmptyList(view) {
    if (view.listedNodes.length > 0) {
        return view.listedNodes.map((node) => renderNodeCard(node, view)).join("");
    }

    return `<p class="physical-hierarchy-empty">${escapeHtml(view.guidance)}</p>`;
}

function renderDirectItemsPanel(selectedNode, view) {
    const panel = getElement("physical-hierarchy-direct-items");
    const count = getElement("physical-hierarchy-direct-count");
    const button = getElement("btn-count-physical-location");
    panel.hidden = !selectedNode;

    if (!selectedNode) {
        return;
    }

    const roundLocation = view.roundLocationById.get(selectedNode.id) || null;
    const hasActiveRound = Boolean(view.roundViewModel);
    const countingMode = resolvePhysicalHierarchyCountingMode(selectedNode, { roundLocation, hasActiveRound });
    if (!hasActiveRound) {
        count.textContent = "Inicie uma contagem para lançar os itens deste local.";
    } else if (roundLocation) {
        count.textContent = pluralize(
            roundLocation.totalPlannedItems,
            "item planejado neste local.",
            "itens planejados neste local."
        );
    } else {
        count.textContent = "Este local é somente estrutural nesta rodada.";
    }

    button.hidden = countingMode === "blocked";
    button.dataset.openLocationCounting = countingMode === "blocked" ? "" : selectedNode.id;
    button.textContent = roundLocation?.cta === "review"
        ? "Revisar lançamentos deste local"
        : countingMode === "resume" ? "Retomar contagem deste local" : "Iniciar contagem deste local";
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
    renderDirectItemsPanel(view.selectedNode, view);
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
