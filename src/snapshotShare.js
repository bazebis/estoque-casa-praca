import { buildSnapshotCsvBundle } from "./snapshotCsvExport.js";
import { normalizeWhatsappSettings } from "./whatsappSettings.js";

const defaultCsvMimeType = "text/csv;charset=utf-8";

function normalizeShareKind(kind) {
    return kind === "pending" ? "pending" : "main";
}

function getStatusLabel(status) {
    const labels = {
        complete: "completo",
        partial: "parcial com pendências",
        empty: "vazio",
        invalid: "inválido"
    };
    return labels[status] || "inválido";
}

function formatSnapshotDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "data não disponível";
    return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function getSnapshotMetrics(snapshot) {
    return {
        itemsWithEntries: Number(snapshot?.summary?.itemsWithEntries) || 0,
        pendingCount: Array.isArray(snapshot?.pendingEntries) ? snapshot.pendingEntries.length : 0
    };
}

export function buildSnapshotShareMessage(snapshot, kind = "main") {
    const normalizedKind = normalizeShareKind(kind);
    const metrics = getSnapshotMetrics(snapshot);
    const lines = [
        `Segue fechamento de contagem: ${snapshot?.label || "Fechamento sem título"}.`,
        `Gerado em: ${formatSnapshotDate(snapshot?.createdAt)}.`,
        `Status: ${getStatusLabel(snapshot?.status)}.`,
        `Itens com lançamento: ${metrics.itemsWithEntries}. Pendências: ${metrics.pendingCount}.`,
        normalizedKind === "pending" ? "Arquivo preparado: CSV de pendências." : "Arquivo preparado: CSV da consolidação."
    ];
    if (metrics.pendingCount) {
        lines.push("Atenção: há pendências no fechamento. Verifique o CSV de pendências.");
    }
    return lines.join("\n");
}

export function buildWhatsappMessage(snapshot, kind = "main", settings = {}) {
    const normalizedSettings = normalizeWhatsappSettings(settings);
    const greeting = normalizedSettings.recipientName
        ? `Olá, ${normalizedSettings.recipientName}.`
        : "";
    return [
        greeting,
        normalizedSettings.defaultMessage,
        buildSnapshotShareMessage(snapshot, kind)
    ].filter(Boolean).join("\n\n");
}

export function buildWhatsappUrl(settings, message) {
    const normalizedSettings = normalizeWhatsappSettings(settings);
    const recipient = normalizedSettings.whatsappNumberNormalized;
    const baseUrl = recipient ? `https://wa.me/${recipient}` : "https://wa.me/";
    return `${baseUrl}?text=${encodeURIComponent(String(message || ""))}`;
}

function getCsvFileData(snapshot, kind) {
    const normalizedKind = normalizeShareKind(kind);
    const bundle = buildSnapshotCsvBundle(snapshot);
    if (normalizedKind === "pending" && !bundle.hasPending) {
        throw new Error("Este fechamento não possui pendências para compartilhar.");
    }
    return normalizedKind === "pending" ? bundle.pending : bundle.main;
}

export function createCsvFileFromSnapshot(snapshot, kind = "main") {
    if (typeof globalThis.File !== "function") {
        throw new Error("Este navegador não consegue preparar arquivos para compartilhamento.");
    }
    const csvFile = getCsvFileData(snapshot, kind);
    const snapshotTimestamp = new Date(snapshot?.createdAt).getTime();
    return new File([csvFile.content], csvFile.filename, {
        type: csvFile.mimeType || defaultCsvMimeType,
        lastModified: Number.isNaN(snapshotTimestamp) ? Date.now() : snapshotTimestamp
    });
}

export function canShareFiles(files) {
    const browserNavigator = globalThis.navigator;
    if (!browserNavigator?.share || typeof browserNavigator.canShare !== "function") return false;
    if (!Array.isArray(files) || !files.length) return false;
    try {
        return browserNavigator.canShare({ files });
    } catch {
        return false;
    }
}

export function getShareCapability() {
    const browserNavigator = globalThis.navigator;
    const supportsClipboard = typeof browserNavigator?.clipboard?.writeText === "function";
    if (!browserNavigator?.share || typeof globalThis.File !== "function") {
        return { canShareFiles: false, supportsClipboard };
    }
    try {
        const probe = new File(["teste"], "fechamento-teste.csv", { type: defaultCsvMimeType });
        return { canShareFiles: canShareFiles([probe]), supportsClipboard };
    } catch {
        return { canShareFiles: false, supportsClipboard };
    }
}

function isShareCancellation(error) {
    return error?.name === "AbortError";
}

export async function shareSnapshotCsv(snapshot, kind = "main", settings = {}) {
    if (!globalThis.navigator?.share || typeof globalThis.File !== "function") {
        return { status: "unsupported", file: null };
    }
    const file = createCsvFileFromSnapshot(snapshot, kind);
    if (!canShareFiles([file])) return { status: "unsupported", file };
    try {
        await navigator.share({
            files: [file],
            title: snapshot?.label || "Fechamento de contagem",
            text: buildWhatsappMessage(snapshot, kind, settings)
        });
        return { status: "shared", file };
    } catch (error) {
        if (isShareCancellation(error)) return { status: "canceled", file };
        throw error;
    }
}

export function openWhatsappForSnapshot(snapshot, kind = "main", settings = {}) {
    const message = buildWhatsappMessage(snapshot, kind, settings);
    const url = buildWhatsappUrl(settings, message);
    const openedWindow = globalThis.window?.open(url, "_blank");
    if (openedWindow) {
        // Some embedded browsers expose the new window but restrict its properties.
        try { openedWindow.opener = null; } catch { /* The navigation still succeeded. */ }
        return { status: "opened", message, url };
    }
    if (typeof globalThis.window?.location?.assign === "function") {
        globalThis.window.location.assign(url);
        return { status: "redirected", message, url };
    }
    return { status: "blocked", message, url };
}

export async function copyShareMessageToClipboard(message) {
    const clipboard = globalThis.navigator?.clipboard;
    if (typeof clipboard?.writeText !== "function") return { status: "unsupported" };
    try {
        await clipboard.writeText(String(message || ""));
        return { status: "copied" };
    } catch {
        return { status: "denied" };
    }
}
