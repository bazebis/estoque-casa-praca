const allowedSources = new Set(["manual", "group_name", "item_name", "previous_entry", "unknown"]);
const allowedConfidences = new Set(["high", "medium", "low", "unknown"]);

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeUnit(value) {
    return normalizeText(value).toLocaleLowerCase("pt-BR");
}

function normalizeTimestamp(value, fallback = null) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeComparableText(value) {
    return normalizeText(value)
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLocaleUpperCase("pt-BR");
}

function createSettingId(templateId, itemCode) {
    return `item-unit:${encodeURIComponent(templateId)}:${encodeURIComponent(itemCode)}`;
}

export function normalizeItemUnitSetting(setting, timestamp = new Date().toISOString()) {
    if (!setting || typeof setting !== "object" || Array.isArray(setting)) return null;
    const templateId = normalizeText(setting.templateId);
    const itemCode = normalizeText(setting.itemCode);
    const suggestedUnit = normalizeUnit(setting.suggestedUnit);
    const manualUnit = normalizeUnit(setting.manualUnit);
    const source = manualUnit ? "manual" : normalizeText(setting.source);
    const confidence = manualUnit ? "high" : normalizeText(setting.confidence);
    const createdAt = normalizeTimestamp(setting.createdAt, timestamp);

    return {
        id: normalizeText(setting.id) || createSettingId(templateId, itemCode),
        templateId,
        itemCode,
        itemNameSnapshot: normalizeText(setting.itemNameSnapshot),
        groupId: normalizeText(setting.groupId),
        groupNameSnapshot: normalizeText(setting.groupNameSnapshot),
        suggestedUnit,
        manualUnit,
        effectiveUnit: manualUnit || suggestedUnit,
        source: allowedSources.has(source) ? source : "unknown",
        confidence: allowedConfidences.has(confidence) ? confidence : "unknown",
        notes: normalizeText(setting.notes),
        createdAt,
        updatedAt: normalizeTimestamp(setting.updatedAt, createdAt)
    };
}

export function normalizeItemUnitSettings(settings) {
    if (!Array.isArray(settings)) return [];
    return settings.map((setting) => normalizeItemUnitSetting(setting)).filter((setting) => setting?.id);
}

export function validateItemUnitSetting(setting) {
    const candidate = normalizeItemUnitSetting(setting);
    const errors = [];
    if (!candidate?.templateId) errors.push("A configuração precisa identificar o template.");
    if (!candidate?.itemCode || !candidate.itemNameSnapshot) errors.push("A configuração precisa identificar o item.");
    if (!candidate?.groupId || !candidate.groupNameSnapshot) errors.push("A configuração precisa identificar o grupo.");
    if (candidate?.suggestedUnit.length > 60 || candidate?.manualUnit.length > 60) {
        errors.push("A unidade deve ter no máximo 60 caracteres.");
    }
    if (candidate?.notes.length > 500) errors.push("As notas devem ter no máximo 500 caracteres.");

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        setting: errors.length === 0 ? candidate : null
    };
}

function findTemplateItemContext(template, requestedItem) {
    const itemCode = normalizeText(requestedItem?.code || requestedItem?.itemCode || requestedItem);
    for (const group of template?.groups || []) {
        const item = (group.items || []).find((candidate) => candidate.code === itemCode);
        if (item) return { group, item };
    }
    return null;
}

function findPreviousUnit(entries, templateId, itemCode) {
    const matchingEntry = [...(entries || [])]
        .filter((entry) => entry.active !== false
            && entry.templateId === templateId
            && entry.itemCode === itemCode
            && normalizeUnit(entry.rawUnit))
        .sort((firstEntry, secondEntry) => new Date(secondEntry.updatedAt) - new Date(firstEntry.updatedAt))[0];
    return normalizeUnit(matchingEntry?.rawUnit);
}

function inferFromNames(itemName, groupName) {
    const explicitUnitPattern = /(^|[^A-Z])(UN|UND|UNIDADE|UNIDADES)($|[^A-Z])/;
    if (/(^|[^A-Z])KG($|[^A-Z])/.test(groupName)) {
        return { unit: "kg", source: "group_name", confidence: "high" };
    }
    if (explicitUnitPattern.test(`${itemName} ${groupName}`)) {
        return { unit: "un", source: explicitUnitPattern.test(itemName) ? "item_name" : "group_name", confidence: "high" };
    }

    const packageUnit = [
        ["CAIXAS?", "caixa"],
        ["FARDOS?", "fardo"],
        ["PACOTES?", "pacote"]
    ].find(([term]) => new RegExp(`(^|[^A-Z])${term}($|[^A-Z])`).test(itemName));
    if (packageUnit) return { unit: packageUnit[1], source: "item_name", confidence: "medium" };

    if (/(^|[^A-Z])(LATAS?|GARRAFAS?|LONG\s+NECK|PET|VIDROS?|SACHETS?)($|[^A-Z])/.test(itemName)) {
        return { unit: "un", source: "item_name", confidence: "medium" };
    }
    if (/(^|[^A-Z])\d+(?:[.,]\d+)?\s*(ML|G)($|[^A-Z])/.test(itemName)) {
        return { unit: "un", source: "item_name", confidence: "low" };
    }
    return { unit: "", source: "unknown", confidence: "unknown" };
}

export function inferUnitForTemplateItem(template, requestedItem, previousEntries = []) {
    const context = findTemplateItemContext(template, requestedItem);
    if (!context) return null;
    const itemName = normalizeComparableText(context.item.name);
    const groupName = normalizeComparableText(context.group.name);
    let inference = inferFromNames(itemName, groupName);
    const previousUnit = findPreviousUnit(previousEntries, template.id, context.item.code);

    if (!inference.unit && previousUnit) {
        inference = { unit: previousUnit, source: "previous_entry", confidence: "medium" };
    }
    return normalizeItemUnitSetting({
        templateId: template.id,
        itemCode: context.item.code,
        itemNameSnapshot: context.item.name,
        groupId: context.group.id,
        groupNameSnapshot: context.group.name,
        suggestedUnit: inference.unit,
        manualUnit: "",
        source: inference.source,
        confidence: inference.confidence,
        notes: ""
    });
}

export function inferUnitsForTemplate(template, previousEntries = []) {
    if (!template) return [];
    return (template.groups || []).flatMap((group) => (
        (group.items || []).map((item) => inferUnitForTemplateItem(template, item, previousEntries))
    )).filter(Boolean);
}

export function resolveItemUnitSettings(template, savedSettings = [], previousEntries = []) {
    const inferredSettings = inferUnitsForTemplate(template, previousEntries);
    const savedByItem = new Map(normalizeItemUnitSettings(savedSettings)
        .filter((setting) => setting.templateId === template?.id)
        .map((setting) => [setting.itemCode, setting]));

    return inferredSettings.map((inferredSetting) => {
        const savedSetting = savedByItem.get(inferredSetting.itemCode);
        if (!savedSetting?.manualUnit) return inferredSetting;
        return normalizeItemUnitSetting({
            ...inferredSetting,
            manualUnit: savedSetting.manualUnit,
            source: "manual",
            confidence: "high",
            notes: savedSetting.notes,
            createdAt: savedSetting.createdAt,
            updatedAt: savedSetting.updatedAt
        });
    });
}

export function summarizeItemUnitSettings(template, settings = []) {
    const itemCount = (template?.groups || []).reduce((total, group) => total + (group.items || []).length, 0);
    const relevantSettings = settings.filter((setting) => setting.templateId === template?.id);
    return {
        itemCount,
        effectiveUnitCount: relevantSettings.filter((setting) => setting.effectiveUnit).length,
        withoutUnitCount: relevantSettings.filter((setting) => !setting.effectiveUnit).length,
        manualCount: relevantSettings.filter((setting) => setting.manualUnit).length,
        suggestedCount: relevantSettings.filter((setting) => setting.effectiveUnit && !setting.manualUnit).length,
        needsReviewCount: relevantSettings.filter((setting) => (
            setting.confidence === "low" || setting.confidence === "unknown"
        )).length
    };
}
