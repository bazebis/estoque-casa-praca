function getElement(id) {
    return document.getElementById(id);
}

function pluralize(count, singular, plural) {
    return `${count} ${count === 1 ? singular : plural}`;
}

export function buildCountRoundHomeView({ template = null, roundViewModel = null } = {}) {
    if (!roundViewModel) {
        return {
            mode: "start",
            title: "Iniciar contagem",
            description: template
                ? "Crie uma rodada com todos os locais e itens planejados deste template."
                : "Importe um template nas Configurações antes de iniciar.",
            actionLabel: "Iniciar contagem",
            actionDisabled: !template,
            summary: null
        };
    }

    const { summary } = roundViewModel;
    return {
        mode: "continue",
        title: "Contagem em andamento",
        description: `${summary.coveredPlannedOccurrences} de ${summary.totalPlannedOccurrences} ocorrências preenchidas`,
        actionLabel: "Continuar contagem",
        actionDisabled: false,
        summary
    };
}

function renderLocationSummary(summary) {
    if (!summary) return "";
    const parts = [
        pluralize(summary.notStartedLocations, "local não iniciado", "locais não iniciados"),
        pluralize(summary.inProgressLocations, "local em andamento", "locais em andamento"),
        pluralize(summary.filledLocations, "local preenchido", "locais preenchidos")
    ];
    if (summary.attentionLocations > 0) {
        parts.push(pluralize(summary.attentionLocations, "local requer atenção", "locais requerem atenção"));
    }
    return parts.map((part) => `<li>${part}</li>`).join("");
}

export function renderCountRoundHome(options = {}) {
    const view = buildCountRoundHomeView(options);
    const card = getElement("count-round-card");
    const progress = getElement("count-round-progress");
    const summary = getElement("count-round-location-summary");
    const action = getElement("btn-count-round-action");
    const finalizeAction = getElement("btn-finalize-count-round");

    card.dataset.mode = view.mode;
    getElement("count-round-title").textContent = view.title;
    getElement("count-round-description").textContent = view.description;
    progress.hidden = !view.summary;
    progress.value = view.summary?.coveredPlannedOccurrences || 0;
    progress.max = view.summary?.totalPlannedOccurrences || 1;
    summary.hidden = !view.summary;
    summary.innerHTML = renderLocationSummary(view.summary);
    action.textContent = view.actionLabel;
    action.disabled = view.actionDisabled;
    action.dataset.countRoundAction = view.mode;
    finalizeAction.hidden = view.mode !== "continue";
    finalizeAction.disabled = false;
    return view;
}

export function setCountRoundActionsBusy(isBusy) {
    getElement("btn-count-round-action").disabled = isBusy;
    getElement("btn-finalize-count-round").disabled = isBusy;
}

export function connectCountRoundEvents(handlers) {
    getElement("btn-count-round-action").addEventListener("click", (event) => {
        const action = event.currentTarget.dataset.countRoundAction;
        if (action === "start") handlers.onStart();
        if (action === "continue") handlers.onContinue();
    });
    getElement("btn-finalize-count-round").addEventListener("click", () => handlers.onFinalize());
}
