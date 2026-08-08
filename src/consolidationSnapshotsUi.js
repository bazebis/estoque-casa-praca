function getElement(id) {
    return document.getElementById(id);
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = String(value ?? "");
    return element.innerHTML;
}

const dateTimeFormatter = new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
});

function formatDateTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Data indisponível" : dateTimeFormatter.format(date);
}

function getStatusLabel(status) {
    const labels = {
        complete: "Completo",
        partial: "Parcial com pendências",
        empty: "Vazio",
        invalid: "Inválido"
    };
    return labels[status] || "Inválido";
}

function getItemStatusLabel(status) {
    const labels = {
        no_entries: "Sem lançamento",
        complete: "Completo",
        partial: "Parcial com pendências",
        pending: "Pendente sem conversão"
    };
    return labels[status] || status;
}

function renderSnapshotCard(snapshot) {
    const finalizationLabel = snapshot.finalizedAt ? "Finalizado" : "Salvo, não finalizado";
    return `
        <article class="consolidation-snapshot-card is-${escapeHtml(snapshot.status)}">
            <div class="consolidation-snapshot-card-badges">
                <span class="consolidation-snapshot-status">${escapeHtml(getStatusLabel(snapshot.status))}</span>
                <span class="snapshot-finalization-badge ${snapshot.finalizedAt ? "is-finalized" : ""}">${escapeHtml(finalizationLabel)}</span>
            </div>
            <h3>${escapeHtml(snapshot.label)}</h3>
            <p>${escapeHtml(snapshot.templateNameSnapshot)}</p>
            <small>Salvo em ${escapeHtml(formatDateTime(snapshot.createdAt))}</small>
            <span>${snapshot.summary.itemsWithEntries} item(ns) com lançamento · ${snapshot.pendingEntries.length} pendência(s)</span>
            <div class="consolidation-snapshot-actions">
                <button type="button" data-open-consolidation-snapshot="${escapeHtml(snapshot.id)}">Abrir snapshot</button>
                <button type="button" class="consolidation-snapshot-delete" data-delete-consolidation-snapshot="${escapeHtml(snapshot.id)}">Excluir</button>
            </div>
        </article>
    `;
}

export function renderConsolidationSnapshotList(snapshots) {
    getElement("consolidation-snapshots-list-view").hidden = false;
    getElement("consolidation-snapshot-detail").hidden = true;
    getElement("consolidation-snapshots-count").textContent = `${snapshots.length} fechamento(s) salvo(s) neste aparelho.`;
    getElement("consolidation-snapshots-list").innerHTML = snapshots.length
        ? snapshots.map(renderSnapshotCard).join("")
        : '<div class="consolidation-snapshot-empty"><h3>Nenhum fechamento salvo</h3><p>Abra a Prévia da consolidação e use Salvar fechamento.</p></div>';
}

export function showSnapshotCsvExportFeedback(message, tone = "") {
    const feedback = getElement("snapshot-csv-export-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

export function showSnapshotShareFeedback(message, tone = "") {
    const feedback = getElement("snapshot-share-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

export function showSnapshotFinalizationFeedback(message, tone = "") {
    const feedback = getElement("snapshot-finalization-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

export function showSnapshotXlsxExportFeedback(message, tone = "") {
    const feedback = getElement("snapshot-xlsx-export-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

function renderXlsxIssueList(plan) {
    const visibleIssues = plan.issues.slice(0, 20);
    const remainingCount = plan.issues.length - visibleIssues.length;
    if (!visibleIssues.length) return '<p class="snapshot-xlsx-no-issues">Nenhum aviso ou bloqueio.</p>';
    const issueItems = visibleIssues.map((issue) => (
        `<li class="is-${escapeHtml(issue.severity)}"><strong>${issue.severity === "blocker" ? "Bloqueio" : "Aviso"}:</strong> ${escapeHtml(issue.message)}</li>`
    ));
    if (remainingCount > 0) issueItems.push(`<li>Mais ${remainingCount} ocorrência(s) não exibida(s).</li>`);
    return `<ul>${issueItems.join("")}</ul>`;
}

export function renderSnapshotXlsxExportPlan(file, plan) {
    const planElement = getElement("snapshot-xlsx-export-plan");
    const statistics = [
        ["Itens mapeados", plan.mappedItemCount],
        ["Linhas sem item no snapshot", plan.sheetItemWithoutSnapshotCount],
        ["Células preenchidas", plan.filledCellCount],
        ["Células vazias por ausência", plan.emptyCellCount],
        ["Grupos sem TOTAL", plan.groupWithoutTotalCount],
        ["Avisos", plan.warnings.length],
        ["Bloqueios", plan.blockers.length]
    ];
    planElement.innerHTML = `
        <p><strong>Modelo analisado:</strong> ${escapeHtml(file?.name || "arquivo selecionado")}</p>
        <dl>${statistics.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}</dl>
        <div class="snapshot-xlsx-issues">${renderXlsxIssueList(plan)}</div>
    `;
    planElement.hidden = false;
    getElement("btn-export-snapshot-xlsx").disabled = !plan.canExport;
}

export function resetSnapshotXlsxExport(snapshot) {
    const isFinalized = Boolean(snapshot.finalizedAt);
    const fileInput = getElement("snapshot-xlsx-template-file");
    fileInput.value = "";
    fileInput.disabled = !isFinalized;
    getElement("btn-export-snapshot-xlsx").disabled = true;
    getElement("snapshot-xlsx-export-status").textContent = isFinalized
        ? "Selecione a planilha modelo para validar e preparar o preenchimento."
        : "Finalize este fechamento antes de selecionar a planilha e gerar XLSX.";
    getElement("snapshot-xlsx-export-plan").hidden = true;
    getElement("snapshot-xlsx-export-plan").innerHTML = "";
    showSnapshotXlsxExportFeedback("");
}

export function setSnapshotXlsxExportBusy(isBusy, canExport = false) {
    getElement("snapshot-xlsx-template-file").disabled = isBusy;
    getElement("btn-export-snapshot-xlsx").disabled = isBusy || !canExport;
}

function getFinalizationStatusText(snapshot) {
    if (snapshot.finalizedAt) {
        const warningText = snapshot.finalizationNotes ? ` Avisos: ${snapshot.finalizationNotes}` : "";
        return `Finalizado em ${formatDateTime(snapshot.finalizedAt)} · ${snapshot.finalizedSessionIds.length} sessão(ões) fechada(s).${warningText}`;
    }
    if (snapshot.status === "invalid") {
        return "Este snapshot é inválido e não pode finalizar uma contagem.";
    }
    return "Salvar esta foto não encerrou a contagem. Finalize somente quando o ciclo estiver concluído.";
}

function renderSnapshotFinalization(snapshot) {
    const isFinalized = Boolean(snapshot.finalizedAt);
    const isInvalid = snapshot.status === "invalid";
    const badge = getElement("snapshot-finalization-badge");
    const button = getElement("btn-finalize-consolidation-snapshot");
    badge.textContent = isFinalized ? "Finalizado" : "Salvo, não finalizado";
    badge.classList.toggle("is-finalized", isFinalized);
    button.disabled = isFinalized || isInvalid;
    button.title = isInvalid
        ? "Um fechamento inválido não pode ser finalizado"
        : isFinalized ? "Esta contagem já foi finalizada" : "Fechar as sessões deste ciclo";
    getElement("snapshot-finalization-status").textContent = getFinalizationStatusText(snapshot);
    showSnapshotFinalizationFeedback("");
}

function renderShareOptions(snapshot, options) {
    const hasPending = snapshot.pendingEntries.length > 0;
    const canShareFiles = options.shareCapability?.canShareFiles === true;
    const pendingDownloadButton = getElement("btn-download-snapshot-pending-csv");
    const experimentalPanel = getElement("snapshot-experimental-share");
    const shareButtons = [
        getElement("btn-share-snapshot-main-csv"),
        getElement("btn-share-snapshot-pending-csv")
    ];
    pendingDownloadButton.hidden = !hasPending;
    experimentalPanel.hidden = !canShareFiles;
    experimentalPanel.open = false;
    shareButtons[0].disabled = !canShareFiles;
    shareButtons[1].disabled = !canShareFiles || !hasPending;
    shareButtons[1].hidden = !hasPending;
    shareButtons[0].title = canShareFiles ? "Recurso experimental do navegador" : "Use o download como alternativa";
    shareButtons[1].title = !hasPending
        ? "Este fechamento não possui pendências"
        : shareButtons[0].title;
    getElement("snapshot-file-share-capability").textContent = canShareFiles
        ? "O navegador declarou suporte ao compartilhamento de arquivo, disponível abaixo como recurso experimental."
        : "Compartilhamento direto de arquivo não disponível neste navegador. Use Baixar CSV e Abrir WhatsApp.";
    getElement("snapshot-whatsapp-target-status").textContent = options.whatsappConfigured
        ? "Existe um destinatário configurado neste aparelho."
        : "Nenhum número configurado: o WhatsApp abrirá para você escolher a conversa.";
    getElement("btn-copy-snapshot-share-message").title = options.shareCapability?.supportsClipboard
        ? "Copiar a mensagem pronta"
        : "Selecionar a mensagem para copiar manualmente";
    getElement("snapshot-share-message").value = options.shareMessage || "";
    showSnapshotShareFeedback("");
}

function renderSummary(snapshot) {
    const stats = [
        ["Status", getStatusLabel(snapshot.status)],
        ["Sessões incluídas", snapshot.sessionsIncluded.length],
        ["Sessões ignoradas", snapshot.sessionsIgnored.length],
        ["Áreas", snapshot.realAreas.length],
        ["Itens com lançamento", snapshot.summary.itemsWithEntries],
        ["Pendências", snapshot.pendingEntries.length]
    ];
    return stats.map(([label, value]) => (
        `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    )).join("");
}

function formatSavedQuantity(value, baseUnit, fallback = "Sem lançamento") {
    if (!value) return fallback;
    return `${value} ${baseUnit || ""}`.trim();
}

function renderSavedArea(area) {
    const label = formatSavedQuantity(
        area.convertedQuantityDecimal,
        area.baseUnit,
        area.status === "pending" ? "Pendente" : "Sem lançamento"
    );
    return `
        <div class="count-consolidation-cell is-${escapeHtml(area.status)}">
            <span>${escapeHtml(area.area)}</span>
            <strong>${escapeHtml(label)}${area.status === "partial" ? " (parcial)" : ""}</strong>
            ${area.entryCount ? `<small>${area.entryCount} entrada(s)</small>` : ""}
        </div>
    `;
}

function renderSavedItem(item) {
    const totalLabel = formatSavedQuantity(
        item.total.convertedQuantityDecimal,
        item.total.baseUnit,
        item.status === "pending" ? "Pendente" : "Sem lançamento"
    );
    return `
        <article class="count-consolidation-item is-${escapeHtml(item.status)}">
            <header>
                <span class="count-consolidation-status">${escapeHtml(getItemStatusLabel(item.status))}</span>
                <h4>${escapeHtml(item.itemNameSnapshot)}</h4>
                <p>Código: ${escapeHtml(item.itemCode)} · Base: ${escapeHtml(item.baseUnit || "sem perfil")}</p>
            </header>
            <div class="count-consolidation-cells">${item.areas.map(renderSavedArea).join("")}</div>
            <div class="count-consolidation-total is-${escapeHtml(item.status)}">
                <span>TOTAL congelado</span>
                <strong>${escapeHtml(totalLabel)}${item.status === "partial" ? " (parcial)" : ""}</strong>
                ${item.total.pendingEntryCount ? `<small>${item.total.pendingEntryCount} pendência(s)</small>` : ""}
            </div>
        </article>
    `;
}

function groupSnapshotItems(items) {
    const groups = new Map();
    items.forEach((item) => {
        const key = `${item.groupOrder}::${item.groupId}`;
        const group = groups.get(key) || { name: item.groupNameSnapshot || "Grupo sem nome", items: [] };
        group.items.push(item);
        groups.set(key, group);
    });
    return [...groups.values()];
}

function renderSnapshotItems(snapshot) {
    return groupSnapshotItems(snapshot.items).map((group, index) => `
        <details class="count-consolidation-group" ${index === 0 ? "open" : ""}>
            <summary>${escapeHtml(group.name)} <span>${group.items.length} item(ns)</span></summary>
            <div class="count-consolidation-item-list">${group.items.map(renderSavedItem).join("")}</div>
        </details>
    `).join("");
}

function renderSession(session) {
    const path = session.locationPathSnapshot.join(" › ") || session.locationId;
    const reason = session.ignoredReason ? ` · ${session.ignoredReason}` : "";
    return `
        <li><strong>${escapeHtml(path)}</strong><span>${escapeHtml(session.reportAreaSnapshot || "Sem área")} · ${escapeHtml(session.status)}${escapeHtml(reason)}</span></li>
    `;
}

function renderSessions(snapshot) {
    return `
        <details><summary>${snapshot.sessionsIncluded.length} sessão(ões) incluída(s)</summary>
            <ul>${snapshot.sessionsIncluded.map(renderSession).join("") || "<li>Nenhuma sessão incluída.</li>"}</ul>
        </details>
        <details><summary>${snapshot.sessionsIgnored.length} sessão(ões) ignorada(s)</summary>
            <ul>${snapshot.sessionsIgnored.map(renderSession).join("") || "<li>Nenhuma sessão ignorada.</li>"}</ul>
        </details>
    `;
}

function renderPending(pending) {
    const unit = pending.rawUnit || "sem unidade";
    return `
        <li class="count-consolidation-pending-item">
            <strong>${escapeHtml(pending.itemNameSnapshot || "Item ausente")}</strong>
            <span>${escapeHtml(pending.itemCode)} · ${escapeHtml(pending.area)}</span>
            <span>Lançamento: ${escapeHtml(pending.rawQuantityText)} ${escapeHtml(unit)}</span>
            <span class="count-consolidation-pending-reason">${escapeHtml(pending.reason)}</span>
            <small>Sugestão salva: ${escapeHtml(pending.suggestion)}</small>
        </li>
    `;
}

export function renderConsolidationSnapshotDetail(snapshot, options = {}) {
    getElement("consolidation-snapshots-list-view").hidden = true;
    getElement("consolidation-snapshot-detail").hidden = false;
    getElement("consolidation-snapshot-detail-title").textContent = snapshot.label;
    getElement("consolidation-snapshot-detail-meta").textContent = `${snapshot.templateNameSnapshot} · salvo em ${formatDateTime(snapshot.createdAt)}`;
    getElement("consolidation-snapshot-summary").innerHTML = renderSummary(snapshot);
    getElement("consolidation-snapshot-areas").textContent = snapshot.realAreas.join(" · ") || "Nenhuma área salva";
    getElement("consolidation-snapshot-sessions").innerHTML = renderSessions(snapshot);
    getElement("consolidation-snapshot-items").innerHTML = renderSnapshotItems(snapshot);
    getElement("consolidation-snapshot-pending").innerHTML = snapshot.pendingEntries.length
        ? `<ul>${snapshot.pendingEntries.map(renderPending).join("")}</ul>`
        : '<p class="count-consolidation-empty">Nenhuma pendência foi congelada neste snapshot.</p>';
    renderSnapshotFinalization(snapshot);
    resetSnapshotXlsxExport(snapshot);
    getElement("btn-download-snapshot-pending-csv").disabled = snapshot.pendingEntries.length === 0;
    getElement("btn-download-snapshot-pending-csv").title = snapshot.pendingEntries.length
        ? "Baixar as pendências congeladas"
        : "Este fechamento não possui pendências";
    renderShareOptions(snapshot, options);
    showSnapshotCsvExportFeedback("");
}

export function selectSnapshotShareMessage() {
    const message = getElement("snapshot-share-message");
    message.focus();
    message.select();
    message.setSelectionRange(0, message.value.length);
}

export function showConsolidationSnapshotsView() {
    getElement("pilot-dashboard").hidden = true;
    getElement("area-counting-view").hidden = true;
    getElement("count-consolidation-view").hidden = true;
    getElement("consolidation-snapshots-view").hidden = false;
    window.scrollTo({ top: 0, behavior: "smooth" });
}

export function hideConsolidationSnapshotsView() {
    getElement("consolidation-snapshots-view").hidden = true;
    getElement("pilot-dashboard").hidden = false;
}

export function showConsolidationSnapshotsFeedback(message, tone = "") {
    const feedback = getElement("consolidation-snapshots-feedback");
    feedback.textContent = message;
    feedback.dataset.tone = tone;
}

export function connectConsolidationSnapshotsEvents(handlers) {
    getElement("btn-open-consolidation-snapshots").addEventListener("click", handlers.onOpenList);
    getElement("btn-close-consolidation-snapshots").addEventListener("click", handlers.onClose);
    getElement("btn-back-consolidation-snapshot-list").addEventListener("click", handlers.onBackToList);
    getElement("btn-download-snapshot-main-csv").addEventListener("click", handlers.onExportMainCsv);
    getElement("btn-download-snapshot-pending-csv").addEventListener("click", handlers.onExportPendingCsv);
    getElement("btn-share-snapshot-main-csv").addEventListener("click", handlers.onShareMainCsv);
    getElement("btn-share-snapshot-pending-csv").addEventListener("click", handlers.onSharePendingCsv);
    getElement("btn-open-snapshot-whatsapp").addEventListener("click", handlers.onOpenWhatsapp);
    getElement("btn-copy-snapshot-share-message").addEventListener("click", handlers.onCopyMessage);
    getElement("btn-finalize-consolidation-snapshot").addEventListener("click", handlers.onFinalize);
    getElement("snapshot-xlsx-template-file").addEventListener("change", (event) => (
        handlers.onSelectXlsxTemplate(event.target.files?.[0] || null)
    ));
    getElement("btn-export-snapshot-xlsx").addEventListener("click", handlers.onExportXlsx);
    getElement("consolidation-snapshots-list").addEventListener("click", (event) => {
        const openButton = event.target.closest("[data-open-consolidation-snapshot]");
        const deleteButton = event.target.closest("[data-delete-consolidation-snapshot]");
        if (openButton) handlers.onOpenDetail(openButton.dataset.openConsolidationSnapshot);
        if (deleteButton) handlers.onDelete(deleteButton.dataset.deleteConsolidationSnapshot);
    });
}
