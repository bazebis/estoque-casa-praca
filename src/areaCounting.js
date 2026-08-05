import { summarizeEntriesByItem, summarizeSessionProgress } from "./locationCountEntries.js";
import { summarizeConvertedEntries } from "./unitConversion.js";

const openSessionStatuses = new Set(["draft", "in_progress"]);

function compareSessions(firstSession, secondSession) {
    return new Date(secondSession.updatedAt) - new Date(firstSession.updatedAt)
        || new Date(secondSession.createdAt) - new Date(firstSession.createdAt);
}

export function listOpenAreaSessions(sessions, templateId, locationId) {
    return (sessions || []).filter((session) => (
        session.templateId === templateId
        && session.locationId === locationId
        && openSessionStatuses.has(session.status)
    )).sort(compareSessions);
}

function buildAreaOverview(area, plan, sessions, entries) {
    const location = area.locationPlan.location;
    const openSessions = listOpenAreaSessions(sessions, plan.templateId, location.id);
    const currentSession = openSessions[0] || null;
    const progress = currentSession
        ? summarizeSessionProgress(currentSession, entries)
        : { totalItems: area.activeExistingLinkCount, countedItems: 0, activeEntryCount: 0, progressPercent: 0 };

    return {
        name: area.name,
        location,
        itemCount: currentSession?.plannedItemCount || area.activeExistingLinkCount,
        currentSession,
        openSessionCount: openSessions.length,
        progress,
        status: currentSession?.status === "in_progress" ? "em andamento" : "não iniciada",
        available: area.locationPlan.action === "reuse"
            && (currentSession?.plannedItemCount > 0 || area.activeExistingLinkCount > 0)
    };
}

export function buildAreaCountingOverview(plan, sessions = [], entries = []) {
    if (!plan) {
        return { hasTemplate: false, templateName: "", areas: [], availableAreaCount: 0 };
    }

    const configuredAreas = plan.areas.filter((area) => area.locationPlan.action === "reuse");
    const areas = configuredAreas.map((area) => buildAreaOverview(area, plan, sessions, entries));

    return {
        hasTemplate: true,
        templateId: plan.templateId,
        templateName: plan.templateName,
        areas,
        availableAreaCount: areas.filter((area) => area.available).length,
        configuredAreaCount: areas.length,
        expectedAreaCount: plan.areaCount
    };
}

export function buildAreaCountingViewModel(session, entries = [], unitSettings = []) {
    const sessionEntries = entries.filter((entry) => entry.sessionId === session?.id);
    const entriesByItem = summarizeEntriesByItem(sessionEntries);
    const unitSettingsByItem = new Map(unitSettings.map((setting) => [setting.itemCode, setting]));
    const convertedSummariesByItem = new Map([...entriesByItem.entries()].map(([itemCode, summary]) => (
        [itemCode, summarizeConvertedEntries(summary.activeEntries, unitSettingsByItem.get(itemCode))]
    )));
    return {
        session,
        entries: sessionEntries,
        entriesByItem,
        unitSettingsByItem,
        convertedSummariesByItem,
        progress: summarizeSessionProgress(session, sessionEntries),
        lastUsedUnit: [...sessionEntries].reverse().find((entry) => entry.active && entry.rawUnit)?.rawUnit || ""
    };
}
