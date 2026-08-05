import { getTemplateCountAreas } from "./countPreparation.js";
import {
    convertEntryToBase,
    formatConvertedQuantity,
    summarizeConvertedEntries
} from "./unitConversion.js";

const acceptedSessionStatuses = new Set(["draft", "in_progress", "completed"]);

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeArea(value) {
    const area = normalizeText(value).toLocaleUpperCase("pt-BR");
    return area === "TOTAL" ? "" : area;
}

function uniqueAreas(values) {
    return [...new Set((values || []).map(normalizeArea).filter(Boolean))];
}

export function getTemplateRealAreas(template) {
    return uniqueAreas(getTemplateCountAreas(template));
}

function getSessionRecency(session) {
    const timestamps = [session?.updatedAt, session?.startedAt, session?.createdAt];
    for (const timestamp of timestamps) {
        const milliseconds = new Date(timestamp || 0).getTime();
        if (!Number.isNaN(milliseconds)) return milliseconds;
    }
    return 0;
}

function compareSessionsByRecency(firstSession, secondSession) {
    return getSessionRecency(secondSession) - getSessionRecency(firstSession)
        || normalizeText(secondSession.id).localeCompare(normalizeText(firstSession.id), "pt-BR");
}

export function groupSessionsByTemplateAndLocation(sessions = []) {
    const groups = new Map();
    sessions.forEach((session) => {
        const key = `${normalizeText(session?.templateId)}::${normalizeText(session?.locationId)}`;
        if (key === "::") return;
        groups.set(key, [...(groups.get(key) || []), session]);
    });
    return groups;
}

export function selectLatestOpenSessionPerLocation(sessions = []) {
    const selected = [];
    const duplicateIgnored = [];
    groupSessionsByTemplateAndLocation(sessions).forEach((group) => {
        const sorted = [...group].sort(compareSessionsByRecency);
        selected.push(sorted[0]);
        duplicateIgnored.push(...sorted.slice(1));
    });
    return { selected, duplicateIgnored };
}

export function selectSessionsForConsolidation(sessions = [], templateId = "") {
    const templateSessions = sessions.filter((session) => session.templateId === templateId);
    const canceledIgnored = templateSessions.filter((session) => session.status === "canceled");
    const unsupportedIgnored = templateSessions.filter((session) => (
        session.status !== "canceled" && !acceptedSessionStatuses.has(session.status)
    ));
    const eligible = templateSessions.filter((session) => acceptedSessionStatuses.has(session.status));
    return { ...selectLatestOpenSessionPerLocation(eligible), canceledIgnored, unsupportedIgnored };
}

function buildTemplateItems(template) {
    return (template?.groups || []).flatMap((group, groupIndex) => (
        (group.items || []).map((item, itemIndex) => ({
            code: normalizeText(item.code),
            name: normalizeText(item.name),
            order: Number.isFinite(Number(item.order)) ? Number(item.order) : itemIndex,
            groupId: normalizeText(group.id),
            groupName: normalizeText(group.name) || "Grupo sem nome",
            groupOrder: Number.isFinite(Number(group.order)) ? Number(group.order) : groupIndex,
            expectedAreas: uniqueAreas(item.countAreas?.length ? item.countAreas : group.countAreas)
        }))
    ));
}

function buildLookupMaps(sessions, locations, links, profiles) {
    return {
        sessions: new Map(sessions.map((session) => [session.id, session])),
        locations: new Map((locations || []).map((location) => [location.id, location])),
        links: new Map((links || []).map((link) => [link.id, link])),
        profiles: new Map((profiles || []).map((profile) => [profile.itemCode, profile]))
    };
}

function resolveEntryArea(entry, lookups) {
    const session = lookups.sessions.get(entry.sessionId);
    const location = lookups.locations.get(session?.locationId || entry.locationId);
    const link = lookups.links.get(entry.linkId);
    return normalizeArea(
        entry.reportAreaSnapshot || session?.reportAreaSnapshot || link?.reportArea || location?.reportArea
    );
}

function buildEntryContexts(entries, selectedSessions, lookups) {
    const selectedSessionIds = new Set(selectedSessions.map((session) => session.id));
    return (entries || []).filter((entry) => (
        entry.active !== false && selectedSessionIds.has(entry.sessionId)
    )).map((entry) => ({
        entry,
        session: lookups.sessions.get(entry.sessionId),
        area: resolveEntryArea(entry, lookups)
    }));
}

function createCell(area, contexts, profile, expectedAreas) {
    const entries = contexts.filter((context) => context.area === area).map((context) => context.entry);
    const conversion = summarizeConvertedEntries(entries, profile);
    const status = entries.length === 0
        ? "empty"
        : conversion.convertibleEntryCount === 0 ? "pending"
            : conversion.isComplete ? "complete" : "partial";
    return { area, entries, conversion, status, isExpected: expectedAreas.includes(area) };
}

export function consolidateEntriesByItemArea(item, contexts, areas, profile) {
    const itemContexts = contexts.filter((context) => context.entry.itemCode === item.code);
    const cells = areas.map((area) => createCell(area, itemContexts, profile, item.expectedAreas));
    return { itemContexts, cells };
}

function createPendingEntry(context, profile, type, reason) {
    const conversion = convertEntryToBase(context.entry, profile);
    return {
        type,
        entry: context.entry,
        itemCode: context.entry.itemCode,
        itemName: context.entry.itemNameSnapshot,
        groupName: context.entry.groupNameSnapshot,
        area: context.area || "Sem área",
        reason: reason || conversion.reason,
        suggestion: getPendingSuggestion(type, conversion.code)
    };
}

function getPendingSuggestion(type, conversionCode) {
    if (type === "missing_area") return "Defina a área do local ou revise o snapshot da sessão.";
    if (type === "outside_area") return "Revise a área do local antes da consolidação oficial.";
    if (type === "missing_item") return "Revise a sessão ou o template importado.";
    if (conversionCode === "missing_factor") return "Revise o perfil e defina um fator confiável para esta unidade.";
    if (conversionCode === "unit_not_allowed") return "Troque Outra unidade por uma opção permitida ou revise o perfil.";
    if (conversionCode === "missing_unit") return "Ajuste a unidade desta aferição.";
    return "Revise o perfil de unidade deste item.";
}

function listItemPendingEntries(itemContexts, profile, realAreaSet) {
    return itemContexts.flatMap((context) => {
        if (!context.area) return [createPendingEntry(context, profile, "missing_area", "Entrada sem área de relatório.")];
        if (!realAreaSet.has(context.area)) {
            return [createPendingEntry(context, profile, "outside_area", "Área fora do template; entrada excluída do TOTAL.")];
        }
        const conversion = convertEntryToBase(context.entry, profile);
        return conversion.isConvertible ? [] : [createPendingEntry(context, profile, "conversion", conversion.reason)];
    });
}

export function consolidateItemTotals(item, itemContexts, realAreas, profile) {
    const realAreaSet = new Set(realAreas);
    const totalEntries = itemContexts
        .filter((context) => realAreaSet.has(context.area))
        .map((context) => context.entry);
    const conversion = summarizeConvertedEntries(totalEntries, profile);
    const pendingEntries = listItemPendingEntries(itemContexts, profile, realAreaSet);
    const entryCount = itemContexts.length;
    let status = "no_entries";
    if (entryCount && conversion.convertibleEntryCount === 0) status = "pending";
    if (conversion.convertibleEntryCount > 0) status = pendingEntries.length ? "partial" : "complete";
    return { conversion, pendingEntries, entryCount, status };
}

function buildItemReport(item, contexts, realAreas, profile) {
    const { itemContexts, cells } = consolidateEntriesByItemArea(item, contexts, realAreas, profile);
    const total = consolidateItemTotals(item, itemContexts, realAreas, profile);
    return { ...item, profile, baseUnit: profile?.baseUnit || "", cells, total };
}

function groupItemReports(template, itemReports) {
    return (template?.groups || []).map((group, groupIndex) => ({
        id: normalizeText(group.id),
        name: normalizeText(group.name) || "Grupo sem nome",
        order: Number.isFinite(Number(group.order)) ? Number(group.order) : groupIndex,
        items: itemReports.filter((item) => item.groupId === normalizeText(group.id))
            .sort((first, second) => first.order - second.order
                || first.code.localeCompare(second.code, "pt-BR")
                || first.name.localeCompare(second.name, "pt-BR"))
    })).filter((group) => group.items.length > 0);
}

function buildOrphanPendingEntries(contexts, templateItemCodes, profiles) {
    return contexts.filter((context) => !templateItemCodes.has(context.entry.itemCode)).map((context) => (
        createPendingEntry(
            context,
            profiles.get(context.entry.itemCode),
            "missing_item",
            "Item da entrada não existe no template selecionado."
        )
    ));
}

function getFallbackAreas(templateAreas, locations) {
    if (templateAreas.length > 0) return templateAreas;
    return uniqueAreas((locations || []).map((location) => location.reportArea));
}

function buildSessionAreaIssues(sessions, locations, realAreas) {
    const locationsById = new Map((locations || []).map((location) => [location.id, location]));
    const realAreaSet = new Set(realAreas);
    return sessions.flatMap((session) => {
        const area = normalizeArea(
            session.reportAreaSnapshot || locationsById.get(session.locationId)?.reportArea
        );
        if (!area) return [{ session, area: "", reason: "Sessão sem área de relatório." }];
        if (!realAreaSet.has(area)) return [{ session, area, reason: "Sessão em área fora do template." }];
        return [];
    });
}

export function listConsolidationPendingEntries(report) {
    const itemPending = (report?.items || []).flatMap((item) => item.total.pendingEntries);
    return [...itemPending, ...(report?.orphanPendingEntries || [])];
}

export function formatConsolidatedCell(cell) {
    const summary = cell?.conversion;
    if (!summary?.activeEntryCount && cell?.status === "pending") {
        return { label: "Pendente", status: "pending" };
    }
    if (!summary?.activeEntryCount) return { label: "Sem lançamento", status: "empty" };
    if (!summary.totalConvertedValue) return { label: "Pendente", status: "pending" };
    const quantity = formatConvertedQuantity(summary.totalConvertedValue, summary.baseUnit);
    const isPartial = cell?.status === "partial" || !summary.isComplete;
    return {
        label: isPartial ? `${quantity} (parcial)` : quantity,
        status: isPartial ? "partial" : "complete"
    };
}

export function summarizeConsolidation(report) {
    const items = report?.items || [];
    const areasWithEntries = new Set(items.flatMap((item) => (
        item.cells.filter((cell) => cell.entries.length > 0).map((cell) => cell.area)
    )));
    return {
        consideredSessionCount: report?.sessionSelection?.selected.length || 0,
        duplicateSessionCount: report?.sessionSelection?.duplicateIgnored.length || 0,
        canceledSessionCount: report?.sessionSelection?.canceledIgnored.length || 0,
        areaCount: report?.realAreas.length || 0,
        areasWithEntries: areasWithEntries.size,
        itemCount: items.length,
        itemsWithEntries: items.filter((item) => item.total.entryCount > 0).length,
        completeItemCount: items.filter((item) => item.total.status === "complete").length,
        pendingItemCount: items.filter((item) => ["partial", "pending"].includes(item.total.status)).length,
        pendingEntryCount: listConsolidationPendingEntries(report).length
    };
}

export function buildCountConsolidation({
    template,
    sessions = [],
    entries = [],
    unitSettings = [],
    locationNodes = [],
    itemLocationLinks = []
}) {
    const sessionSelection = selectSessionsForConsolidation(sessions, template?.id);
    const lookups = buildLookupMaps(sessionSelection.selected, locationNodes, itemLocationLinks, unitSettings);
    const templateAreas = getTemplateRealAreas(template);
    const realAreas = getFallbackAreas(templateAreas, locationNodes);
    const contexts = buildEntryContexts(entries, sessionSelection.selected, lookups);
    const templateItems = buildTemplateItems(template);
    const templateItemCodes = new Set(templateItems.map((item) => item.code));
    const itemReports = templateItems.map((item) => buildItemReport(
        item,
        contexts,
        realAreas,
        lookups.profiles.get(item.code)
    ));
    const report = {
        template: template || null,
        realAreas,
        areaSource: templateAreas.length ? "template" : "locations",
        groups: groupItemReports(template, itemReports),
        items: itemReports,
        sessionSelection,
        sessionAreaIssues: buildSessionAreaIssues(sessionSelection.selected, locationNodes, realAreas),
        orphanPendingEntries: buildOrphanPendingEntries(contexts, templateItemCodes, lookups.profiles)
    };
    return { ...report, pendingEntries: listConsolidationPendingEntries(report), summary: summarizeConsolidation(report) };
}
