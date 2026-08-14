import { summarizeEntriesByItem, summarizeSessionProgress } from "./locationCountEntries.js";
import { summarizeConvertedEntries } from "./unitConversion.js";

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
