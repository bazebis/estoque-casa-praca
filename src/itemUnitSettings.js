const allowedSources = new Set(["manual", "group_name", "item_name", "previous_entry", "unknown"]);
const allowedConfidences = new Set(["high", "medium", "low", "unknown"]);

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeUnitAlias(value) {
    const unit = normalizeText(value).toLocaleLowerCase("pt-BR");
    const aliases = new Map([
        ["gr", "g"], ["grama", "g"], ["gramas", "g"],
        ["und", "un"], ["unidade", "un"], ["unidades", "un"],
        ["litro", "l"], ["litros", "l"],
        ["garrafa", "un"], ["garrafas", "un"]
    ]);
    return aliases.get(unit) || unit;
}

function normalizeTimestamp(value, fallback = null) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeComparableText(value) {
    return normalizeText(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase();
}

function createSettingId(templateId, itemCode) {
    return `item-unit:${encodeURIComponent(templateId)}:${encodeURIComponent(itemCode)}`;
}

function createUnitId(label) {
    return normalizeComparableText(label).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeFactor(value) {
    const factor = normalizeText(value);
    return factor && /^\d+(?:\.\d+)?$/.test(factor) && Number(factor) > 0 ? factor : null;
}

function normalizeAllowedUnit(unit) {
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) return null;
    const label = normalizeText(unit.label);
    if (!label) return null;
    const portionWeight = Number(unit.portionWeightGrams);
    return {
        id: normalizeText(unit.id) || createUnitId(label),
        label,
        normalizedUnit: normalizeUnitAlias(unit.normalizedUnit || label),
        kind: normalizeText(unit.kind) || "custom",
        factorToBase: normalizeFactor(unit.factorToBase),
        portionWeightGrams: Number.isFinite(portionWeight) && portionWeight > 0 ? portionWeight : null,
        requiresReview: unit.requiresReview === true,
        notes: normalizeText(unit.notes)
    };
}

function normalizeAllowedUnits(units) {
    const normalizedById = new Map();
    (Array.isArray(units) ? units : []).forEach((unit) => {
        const normalizedUnit = normalizeAllowedUnit(unit);
        if (normalizedUnit) normalizedById.set(normalizedUnit.id, normalizedUnit);
    });
    return [...normalizedById.values()];
}

export function normalizeItemUnitSetting(setting, timestamp = new Date().toISOString()) {
    if (!setting || typeof setting !== "object" || Array.isArray(setting)) return null;
    const templateId = normalizeText(setting.templateId);
    const itemCode = normalizeText(setting.itemCode);
    const manualUnit = normalizeText(setting.manualUnit);
    const defaultInputUnit = normalizeText(setting.defaultInputUnit || manualUnit || setting.effectiveUnit || setting.suggestedUnit);
    const source = normalizeText(setting.source);
    const confidence = normalizeText(setting.confidence);
    const createdAt = normalizeTimestamp(setting.createdAt, timestamp);

    return {
        id: normalizeText(setting.id) || createSettingId(templateId, itemCode),
        templateId,
        itemCode,
        itemNameSnapshot: normalizeText(setting.itemNameSnapshot),
        groupId: normalizeText(setting.groupId),
        groupNameSnapshot: normalizeText(setting.groupNameSnapshot),
        baseUnit: normalizeUnitAlias(setting.baseUnit),
        defaultInputUnit,
        allowedUnits: normalizeAllowedUnits(setting.allowedUnits),
        source: allowedSources.has(source) ? source : "unknown",
        confidence: allowedConfidences.has(confidence) ? confidence : "unknown",
        needsReview: setting.needsReview === true,
        notes: normalizeText(setting.notes),
        createdAt,
        updatedAt: normalizeTimestamp(setting.updatedAt, createdAt),
        suggestedUnit: normalizeText(setting.suggestedUnit || defaultInputUnit),
        manualUnit,
        effectiveUnit: defaultInputUnit
    };
}

export function normalizeItemUnitSettings(settings) {
    if (!Array.isArray(settings)) return [];
    return settings.map((setting) => normalizeItemUnitSetting(setting)).filter((setting) => setting?.id);
}

function collectAllowedUnitErrors(profile) {
    const errors = [];
    if (new Set(profile.allowedUnits.map((unit) => unit.id)).size !== profile.allowedUnits.length) {
        errors.push("As unidades permitidas precisam ter identificadores únicos.");
    }
    if (profile.allowedUnits.some((unit) => !unit.normalizedUnit)) {
        errors.push("Toda unidade permitida precisa ter uma forma normalizada.");
    }
    if (profile.defaultInputUnit && !profile.allowedUnits.some((unit) => unit.label === profile.defaultInputUnit)) {
        errors.push("A unidade padrão precisa estar na lista de unidades permitidas.");
    }
    return errors;
}

export function validateItemUnitSetting(setting) {
    const candidate = normalizeItemUnitSetting(setting);
    const errors = [];
    if (!candidate?.templateId) errors.push("O perfil precisa identificar o template.");
    if (!candidate?.itemCode || !candidate.itemNameSnapshot) errors.push("O perfil precisa identificar o item.");
    if (!candidate?.groupId || !candidate.groupNameSnapshot) errors.push("O perfil precisa identificar o grupo.");
    if (candidate?.baseUnit.length > 60 || candidate?.defaultInputUnit.length > 60) {
        errors.push("A unidade deve ter no máximo 60 caracteres.");
    }
    if (candidate) errors.push(...collectAllowedUnitErrors(candidate));
    if (candidate?.notes.length > 500) errors.push("As notas devem ter no máximo 500 caracteres.");
    return { isValid: errors.length === 0, error: errors[0] || "", errors, setting: errors.length ? null : candidate };
}

function findTemplateItemContext(template, requestedItem) {
    const itemCode = normalizeText(requestedItem?.code || requestedItem?.itemCode || requestedItem);
    for (const group of template?.groups || []) {
        const item = (group.items || []).find((candidate) => candidate.code === itemCode);
        if (item) return { group, item };
    }
    return null;
}

function createAllowedUnit(label, normalizedUnit, kind, factorToBase, options = {}) {
    return normalizeAllowedUnit({
        id: options.id || createUnitId(label),
        label,
        normalizedUnit,
        kind,
        factorToBase,
        portionWeightGrams: options.portionWeightGrams,
        requiresReview: options.requiresReview,
        notes: options.notes
    });
}

function unitOption() {
    return createAllowedUnit("un", "un", "unit", "1");
}

function packageOption(label, quantity) {
    return createAllowedUnit(label, label, "package", String(quantity));
}

function ambiguousPackageOption(label = "pacote") {
    return createAllowedUnit(label, label, "package", null, {
        requiresReview: true,
        notes: "Quantidade interna não informada; fator não definido."
    });
}

function massOptions(portionWeightGrams = null) {
    const kgFactor = portionWeightGrams ? formatFactor(1000 / portionWeightGrams) : "1";
    const gramFactor = portionWeightGrams ? formatFactor(1 / portionWeightGrams) : "0.001";
    return [
        createAllowedUnit("kg", "kg", "mass", kgFactor, { portionWeightGrams }),
        createAllowedUnit("g", "g", "mass", gramFactor, { portionWeightGrams }),
        createAllowedUnit("gr", "g", "mass", gramFactor, { portionWeightGrams, id: "gr" })
    ];
}

function formatFactor(value) {
    return Number(value.toFixed(12)).toString();
}

function detectWeightGrams(text) {
    const match = text.match(/(^|[^A-Z0-9])(\d+(?:[.,]\d+)?)\s*(KG|G)($|[^A-Z])/);
    if (!match) return null;
    const value = Number(match[2].replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value * (match[3] === "KG" ? 1000 : 1) : null;
}

function detectVolumeLiters(text) {
    const match = text.match(/(^|[^A-Z0-9])(\d+(?:[.,]\d+)?)\s*(ML|L)($|[^A-Z])/);
    if (!match) return null;
    const value = Number(match[2].replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value * (match[3] === "ML" ? 0.001 : 1) : null;
}

function findPreviousUnit(entries, templateId, itemCode) {
    const matchingEntry = [...(entries || [])].filter((entry) => (
        entry.active !== false && entry.templateId === templateId
        && entry.itemCode === itemCode && normalizeUnitAlias(entry.rawUnit)
    )).sort((first, second) => new Date(second.updatedAt) - new Date(first.updatedAt))[0];
    return normalizeUnitAlias(matchingEntry?.rawUnit);
}

function detectSource(pattern, itemText, groupText) {
    if (pattern.test(groupText)) return "group_name";
    return pattern.test(itemText) ? "item_name" : null;
}

function createProfileSpec(baseUnit, defaultInputUnit, allowedUnits, source, confidence, needsReview = false) {
    return { baseUnit, defaultInputUnit, allowedUnits, source, confidence, needsReview };
}

function simpleUnitProfile(packSizes, source, confidence = "high", needsReview = false) {
    const allowedUnits = [unitOption(), ...packSizes.map((size) => packageOption(`fardo ${size}`, size))];
    return createProfileSpec("un", "un", allowedUnits, source, confidence, needsReview);
}

function inferPortionProfile(itemText, groupText) {
    const source = detectSource(/PORC(?:AO|OES)/, itemText, groupText);
    if (!source) return null;
    const portionWeightGrams = detectWeightGrams(itemText);
    const portion = createAllowedUnit("porção", "porção", "portion", "1", { portionWeightGrams });
    if (!portionWeightGrams) return createProfileSpec("porção", "porção", [portion], source, "low", true);
    return createProfileSpec("porção", "porção", [portion, ...massOptions(portionWeightGrams)], source, "high");
}

function inferMassProfile(itemText, groupText) {
    const source = detectSource(/CARNES?|(^|[^A-Z])KG($|[^A-Z])/, itemText, groupText)
        || detectSource(/QUEIJOS?|LATICINIOS?/, itemText, groupText);
    return source ? createProfileSpec("kg", "kg", massOptions(), source, "high") : null;
}

function inferPackagingProfile(itemText, groupText) {
    const source = detectSource(/EMBALAGENS?|DESCARTAVEIS?/, itemText, groupText);
    if (!source) return null;
    const units = [unitOption(), ambiguousPackageOption(), packageOption("caixa 12", 12), packageOption("caixa 24", 24)];
    return createProfileSpec("un", "un", units, source, "high");
}

function createVolumeOptions(volumeLiters, includePackage = false) {
    const hasVolume = Boolean(volumeLiters);
    const unitFactor = hasVolume ? formatFactor(volumeLiters) : "1";
    const volumeNeedsReview = !hasVolume;
    const options = [
        createAllowedUnit("un", "un", "unit", unitFactor),
        createAllowedUnit("l", "l", "volume", hasVolume ? "1" : null, { requiresReview: volumeNeedsReview }),
        createAllowedUnit("ml", "ml", "volume", hasVolume ? "0.001" : null, { requiresReview: volumeNeedsReview })
    ];
    if (includePackage) options.push(ambiguousPackageOption());
    return options;
}

function inferCleaningProfile(itemText, groupText) {
    const source = detectSource(/LIMPEZA|DETERGENTE|SANITIZANTE|ALCOOL|DESINFETANTE/, itemText, groupText);
    if (!source) return null;
    const volumeLiters = detectVolumeLiters(itemText);
    const baseUnit = volumeLiters ? "l" : "un";
    return createProfileSpec(baseUnit, volumeLiters ? "l" : "un", createVolumeOptions(volumeLiters, true), source, volumeLiters ? "high" : "medium", !volumeLiters);
}

function inferDrinkProfile(itemText, groupText) {
    const combinedText = `${itemText} ${groupText}`;
    let source = detectSource(/ENERGETICOS?/, itemText, groupText);
    if (source) return simpleUnitProfile([6, 24], source);
    source = detectSource(/LONG\s*NECK/, itemText, groupText);
    if (source) return simpleUnitProfile([6, 24], source);
    if (/CERVEJAS?/.test(combinedText) && /LATAS?/.test(combinedText)) {
        return simpleUnitProfile([12], /CERVEJAS?/.test(groupText) ? "group_name" : "item_name");
    }
    source = detectSource(/AGUAS?/, itemText, groupText);
    if (source) return simpleUnitProfile([6, 12], source);
    source = detectSource(/REFRIGERANTES?|REFRI/, itemText, groupText);
    if (source) return simpleUnitProfile([6, 12], source);
    source = detectSource(/LATAS?|(^|[^A-Z])PET($|[^A-Z])/, itemText, groupText);
    return source ? simpleUnitProfile([6, 12], source, "low", true) : null;
}

function inferBottleProfile(itemText, groupText) {
    const source = detectSource(/DESTILADOS?|BEBIDA\s+DESTILADA|VINHOS?|GARRAFAS?/, itemText, groupText);
    if (!source) return null;
    const volumeLiters = detectVolumeLiters(itemText);
    const hasVolume = Boolean(volumeLiters);
    const bottleFactor = hasVolume ? formatFactor(volumeLiters) : "1";
    const units = [
        createAllowedUnit("un", "un", "unit", bottleFactor),
        createAllowedUnit("garrafa", "un", "bottle", bottleFactor),
        createAllowedUnit("l", "l", "volume", hasVolume ? "1" : null, { requiresReview: !hasVolume }),
        createAllowedUnit("ml", "ml", "volume", hasVolume ? "0.001" : null, { requiresReview: !hasVolume })
    ];
    return createProfileSpec(hasVolume ? "l" : "un", "garrafa", units, source, hasVolume ? "high" : "low", !hasVolume);
}

function inferFallbackProfile(itemText, groupText, previousUnit) {
    const explicitUnit = detectSource(/(^|[^A-Z])(UN|UND|UNIDADE|UNIDADES)($|[^A-Z])/, itemText, groupText);
    if (explicitUnit) return createProfileSpec("un", "un", [unitOption()], explicitUnit, "high");
    if (previousUnit) {
        const option = createAllowedUnit(previousUnit, previousUnit, "custom", "1");
        return createProfileSpec(previousUnit, previousUnit, [option], "previous_entry", "medium", true);
    }
    return createProfileSpec("", "", [], "unknown", "unknown", true);
}

function inferProfileSpec(itemText, groupText, previousUnit) {
    return inferPortionProfile(itemText, groupText)
        || inferMassProfile(itemText, groupText)
        || inferPackagingProfile(itemText, groupText)
        || inferCleaningProfile(itemText, groupText)
        || inferDrinkProfile(itemText, groupText)
        || inferBottleProfile(itemText, groupText)
        || inferFallbackProfile(itemText, groupText, previousUnit);
}

export function inferUnitForTemplateItem(template, requestedItem, previousEntries = []) {
    const context = findTemplateItemContext(template, requestedItem);
    if (!context) return null;
    const itemText = normalizeComparableText(context.item.name);
    const groupText = normalizeComparableText(context.group.name);
    const previousUnit = findPreviousUnit(previousEntries, template.id, context.item.code);
    const profile = inferProfileSpec(itemText, groupText, previousUnit);
    return normalizeItemUnitSetting({
        templateId: template.id,
        itemCode: context.item.code,
        itemNameSnapshot: context.item.name,
        groupId: context.group.id,
        groupNameSnapshot: context.group.name,
        ...profile,
        suggestedUnit: profile.defaultInputUnit,
        manualUnit: "",
        notes: ""
    });
}

export function inferUnitsForTemplate(template, previousEntries = []) {
    if (!template) return [];
    return (template.groups || []).flatMap((group) => (
        (group.items || []).map((item) => inferUnitForTemplateItem(template, item, previousEntries))
    )).filter(Boolean);
}

function appendManualUnit(allowedUnits, manualUnit) {
    if (!manualUnit || allowedUnits.some((unit) => unit.label === manualUnit)) return allowedUnits;
    return [...allowedUnits, createAllowedUnit(manualUnit, manualUnit, "custom", null, {
        requiresReview: true,
        notes: "Unidade preservada da configuração manual anterior."
    })];
}

export function resolveItemUnitSettings(template, savedSettings = [], previousEntries = []) {
    const inferredSettings = inferUnitsForTemplate(template, previousEntries);
    const savedByItem = new Map(normalizeItemUnitSettings(savedSettings)
        .filter((setting) => setting.templateId === template?.id)
        .map((setting) => [setting.itemCode, setting]));

    return inferredSettings.map((inferred) => {
        const saved = savedByItem.get(inferred.itemCode);
        if (!saved) return inferred;
        const hasProfileOverrides = saved.allowedUnits.length > 0 && saved.baseUnit;
        const manualDefault = saved.defaultInputUnit || saved.manualUnit;
        const sourceAllowedUnits = hasProfileOverrides ? saved.allowedUnits : inferred.allowedUnits;
        const didAppendLegacyUnit = Boolean(manualDefault)
            && !sourceAllowedUnits.some((unit) => unit.label === manualDefault);
        return normalizeItemUnitSetting({
            ...inferred,
            baseUnit: hasProfileOverrides ? saved.baseUnit : inferred.baseUnit,
            allowedUnits: appendManualUnit(sourceAllowedUnits, manualDefault),
            defaultInputUnit: manualDefault || inferred.defaultInputUnit,
            manualUnit: manualDefault || "",
            source: "manual",
            confidence: saved.confidence === "unknown" ? "high" : saved.confidence,
            needsReview: saved.needsReview || didAppendLegacyUnit,
            notes: saved.notes,
            createdAt: saved.createdAt,
            updatedAt: saved.updatedAt
        });
    });
}

export function applyManualItemUnitProfile(profile, overrides) {
    const baseUnit = normalizeUnitAlias(overrides.baseUnit || profile.baseUnit);
    const defaultInputUnit = normalizeText(overrides.defaultInputUnit || profile.defaultInputUnit);
    const didBaseChange = baseUnit !== profile.baseUnit;
    const allowedUnits = profile.allowedUnits.map((unit) => ({
        ...unit,
        factorToBase: didBaseChange ? (unit.normalizedUnit === baseUnit ? "1" : null) : unit.factorToBase,
        requiresReview: didBaseChange && unit.normalizedUnit !== baseUnit ? true : unit.requiresReview
    }));
    return normalizeItemUnitSetting({
        ...profile,
        baseUnit,
        defaultInputUnit,
        manualUnit: defaultInputUnit,
        allowedUnits,
        source: "manual",
        confidence: "high",
        needsReview: overrides.needsReview === true || didBaseChange
    });
}

export function summarizeItemUnitSettings(template, settings = []) {
    const itemCount = (template?.groups || []).reduce((total, group) => total + (group.items || []).length, 0);
    const profiles = settings.filter((setting) => setting.templateId === template?.id);
    const completeProfiles = profiles.filter((profile) => (
        profile.baseUnit && profile.defaultInputUnit && profile.allowedUnits.length > 0
    ));
    return {
        itemCount,
        completeProfileCount: completeProfiles.length,
        needsReviewCount: profiles.filter((profile) => profile.needsReview).length,
        withoutProfileCount: itemCount - completeProfiles.length,
        ambiguousPackageCount: profiles.filter((profile) => profile.allowedUnits.some((unit) => (
            unit.kind === "package" && unit.requiresReview
        ))).length,
        portionWithoutWeightCount: profiles.filter((profile) => (
            profile.allowedUnits.some((unit) => unit.kind === "portion")
            && !profile.allowedUnits.some((unit) => unit.portionWeightGrams)
        )).length,
        effectiveUnitCount: profiles.filter((profile) => profile.effectiveUnit).length,
        withoutUnitCount: profiles.filter((profile) => !profile.effectiveUnit).length,
        manualCount: profiles.filter((profile) => profile.source === "manual").length,
        suggestedCount: profiles.filter((profile) => profile.effectiveUnit && profile.source !== "manual").length
    };
}
