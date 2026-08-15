function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

function formatLocationAction(action) {
    const labels = {
        create: "será criado",
        reuse: "já configurado",
        reactivate: "será reativado",
        blocked: "requer ajuste manual"
    };

    return labels[action] || action;
}

function formatLinkState(state) {
    const labels = {
        create: "será criado",
        existing: "já existe",
        inactive: "já existe, mas está inativo"
    };
    return labels[state] || state;
}

function renderTemplateOptions(templates, selectedTemplateId) {
    const select = getElement("quick-pilot-template");
    select.innerHTML = templates.map((template) => (
        `<option value="${escapeHtml(template.id)}" ${template.id === selectedTemplateId ? "selected" : ""}>${escapeHtml(template.name)}</option>`
    )).join("");
}

function renderQuickPilotSummary(plan) {
    const summary = getElement("quick-pilot-summary");
    summary.hidden = !plan;
    summary.innerHTML = plan ? `
        <div><dt>Áreas encontradas</dt><dd>${plan.areaCount}</dd></div>
        <div><dt>Locais a criar</dt><dd>${plan.newLocationCount}</dd></div>
        <div><dt>Locais reutilizados</dt><dd>${plan.reusedLocationCount}</dd></div>
        <div><dt>Locais a reativar</dt><dd>${plan.reactivatedLocationCount}</dd></div>
        <div><dt>Vínculos a criar</dt><dd>${plan.newLinkCount}</dd></div>
        <div><dt>Vínculos existentes</dt><dd>${plan.existingLinkCount}</dd></div>
        <div><dt>Vínculos inativos</dt><dd>${plan.inactiveLinkCount}</dd></div>
        <div><dt>Vínculos esperados</dt><dd>${plan.expectedLinkCount}</dd></div>
    ` : "";
}

function renderAreaCard(area) {
    const itemPreview = area.items.map((item) => `
        <li>
            <strong>${escapeHtml(item.itemCode)} — ${escapeHtml(item.itemName)}</strong>
            <span>→ ${escapeHtml(area.name)} · ${escapeHtml(formatLinkState(item.linkState))}</span>
        </li>
    `).join("");

    return `
        <article class="quick-pilot-area-card ${area.locationPlan.action === "blocked" ? "has-problem" : ""}">
            <h4>${escapeHtml(area.name)}</h4>
            <p><strong>Local macro:</strong> ${escapeHtml(formatLocationAction(area.locationPlan.action))}</p>
            <p><strong>Itens candidatos:</strong> ${area.itemCount}</p>
            <p><strong>Novos vínculos:</strong> ${area.newLinkCount}</p>
            ${area.inactiveLinkCount ? `<p><strong>Vínculos inativos preservados:</strong> ${area.inactiveLinkCount}</p>` : ""}
            ${area.locationPlan.warning ? `<p class="quick-pilot-warning">${escapeHtml(area.locationPlan.warning)}</p>` : ""}
            <details class="quick-pilot-item-preview">
                <summary>Ver prévia dos vínculos desta área</summary>
                <ul>${itemPreview || "<li>Nenhum item candidato.</li>"}</ul>
            </details>
        </article>
    `;
}

function renderWarnings(plan) {
    const warningContainer = getElement("quick-pilot-warnings");
    warningContainer.hidden = !plan?.warnings.length;
    warningContainer.innerHTML = plan?.warnings.length
        ? `<strong>Avisos</strong><ul>${plan.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
        : "";
}

export function renderQuickPilot({ templates, selectedTemplateId, plan }) {
    const hasTemplates = templates.length > 0;
    getElement("quick-pilot-template-field").hidden = !hasTemplates;
    getElement("quick-pilot-no-template").hidden = hasTemplates;
    getElement("quick-pilot-workspace").hidden = !hasTemplates;

    if (hasTemplates) renderTemplateOptions(templates, selectedTemplateId);
    renderQuickPilotSummary(plan);
    getElement("quick-pilot-areas").innerHTML = plan?.areas.map(renderAreaCard).join("") || "";
    renderWarnings(plan);

    const applyButton = getElement("btn-apply-quick-pilot");
    applyButton.disabled = !plan?.canApply;
    applyButton.textContent = plan?.canApply
        ? "Aplicar configuração automática"
        : "Resolva os conflitos antes de aplicar";
}

export function showQuickPilotFeedback(message, tone = "") {
    const feedback = getElement("quick-pilot-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

export function connectQuickPilotEvents(handlers) {
    getElement("quick-pilot-template").addEventListener("change", (event) => {
        handlers.onSelectTemplate(event.target.value);
    });
    getElement("btn-quick-pilot-templates").addEventListener("click", handlers.onOpenTemplates);
    getElement("btn-apply-quick-pilot").addEventListener("click", async () => {
        const shouldApply = window.confirm(
            "Aplicar a configuração automática? Locais e vínculos existentes serão preservados."
        );
        if (shouldApply) await handlers.onApply();
    });
}
