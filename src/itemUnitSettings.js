const allowedSources = new Set(["manual", "group_name", "item_name", "previous_entry", "unknown"]);
const allowedConfidences = new Set(["high", "medium", "low", "unknown"]);

export const CONTROLLED_ITEM_UNIT_CATALOG = Object.freeze([
    { label: "un", kind: "unit" },
    { label: "kg", kind: "mass" },
    { label: "g", kind: "mass" },
    { label: "l", kind: "volume" },
    { label: "ml", kind: "volume" },
    { label: "porção", kind: "portion" },
    { label: "garrafa", kind: "bottle" },
    { label: "caixa", kind: "package" },
    { label: "pacote", kind: "package" },
    { label: "fardo", kind: "package" }
].map((unit) => Object.freeze(unit)));

export const CONTROLLED_UNIT_VARIANT_FAMILIES = Object.freeze([
    { family: "porção", kind: "portion", variantUnits: ["g", "kg"], compatibleBaseUnits: ["g", "kg"] },
    { family: "fardo", kind: "package", variantUnits: ["un"], compatibleBaseUnits: ["un"] },
    { family: "caixa", kind: "package", variantUnits: ["un", "garrafa"], compatibleBaseUnits: ["un", "garrafa"] },
    { family: "pacote", kind: "package", variantUnits: ["un"], compatibleBaseUnits: ["un"] }
].map((definition) => Object.freeze({
    ...definition,
    variantUnits: Object.freeze(definition.variantUnits),
    compatibleBaseUnits: Object.freeze(definition.compatibleBaseUnits)
})));

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeUnitAlias(value) {
    const unit = normalizeText(value).toLocaleLowerCase("pt-BR");
    const aliases = new Map([
        ["gr", "g"], ["grama", "g"], ["gramas", "g"],
        ["uni", "un"], ["und", "un"], ["unidade", "un"], ["unidades", "un"],
        ["lt", "l"], ["litro", "l"], ["litros", "l"],
        ["garrafas", "garrafa"]
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

function findUnitVariantFamily(value) {
    const family = normalizeUnitAlias(value);
    return CONTROLLED_UNIT_VARIANT_FAMILIES.find((definition) => definition.family === family) || null;
}

function normalizePositiveDecimal(value) {
    const decimal = normalizeText(value).replace(",", ".");
    const numericValue = Number(decimal);
    if (!/^\d+(?:\.\d+)?$/.test(decimal) || !Number.isFinite(numericValue) || numericValue <= 0) return "";
    const [integerPart, fractionPart = ""] = decimal.split(".");
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
    const normalizedFraction = fractionPart.replace(/0+$/, "");
    return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

function normalizeUnitVariantValue(definition, value) {
    const decimal = normalizePositiveDecimal(value);
    if (!decimal || !definition) return "";
    if (definition.family === "porção") return decimal;
    return /^\d+$/.test(decimal) ? decimal : "";
}

function shiftDecimal(value, places) {
    const decimal = normalizePositiveDecimal(value);
    if (!decimal) return "";
    const [integerPart, fractionPart = ""] = decimal.split(".");
    const digits = `${integerPart}${fractionPart}`;
    const decimalPosition = integerPart.length + places;
    if (decimalPosition <= 0) return normalizePositiveDecimal(`0.${"0".repeat(-decimalPosition)}${digits}`);
    if (decimalPosition >= digits.length) {
        return normalizePositiveDecimal(`${digits}${"0".repeat(decimalPosition - digits.length)}`);
    }
    return normalizePositiveDecimal(`${digits.slice(0, decimalPosition)}.${digits.slice(decimalPosition)}`);
}

function getPortionWeightGrams(variantValue, variantUnit) {
    return variantUnit === "kg" ? shiftDecimal(variantValue, 3) : normalizePositiveDecimal(variantValue);
}

function normalizeLegacyLabels(values) {
    const labels = Array.isArray(values) ? values : [];
    return [...new Set(labels.map(normalizeText).filter(Boolean))];
}

function parseVariantFromLabel(label, portionWeightGrams) {
    const normalizedLabel = normalizeUnitAlias(label);
    if (normalizedLabel === "porção" && portionWeightGrams) {
        return { variantFamily: "porção", variantValue: String(portionWeightGrams), variantUnit: "g" };
    }
    const match = normalizedLabel.match(/^(porção|fardo|caixa|pacote)\s+(\d+(?:[.,]\d+)?)\s*(g|kg|un)?$/);
    if (!match) return null;
    const definition = findUnitVariantFamily(match[1]);
    const variantUnit = match[3] || (definition?.family === "porção" ? "" : "un");
    return { variantFamily: definition?.family, variantValue: match[2], variantUnit };
}

function normalizeUnitVariantFields(unit, label, portionWeightGrams) {
    const suppliedFamily = findUnitVariantFamily(unit.variantFamily);
    const parsedVariant = suppliedFamily ? unit : parseVariantFromLabel(label, portionWeightGrams);
    const definition = suppliedFamily || findUnitVariantFamily(parsedVariant?.variantFamily);
    const variantValue = normalizeUnitVariantValue(definition, parsedVariant?.variantValue);
    const variantUnit = normalizeUnitAlias(parsedVariant?.variantUnit);
    if (!definition || !variantValue || !definition.variantUnits.includes(variantUnit)) return null;
    const inferredLegacyLabels = label === definition.family ? [label] : [];
    return {
        variantFamily: definition.family,
        variantValue,
        variantUnit,
        legacyLabels: normalizeLegacyLabels(unit.legacyLabels || inferredLegacyLabels)
    };
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
    const portionWeightGrams = Number.isFinite(portionWeight) && portionWeight > 0 ? portionWeight : null;
    const variantFields = normalizeUnitVariantFields(unit, label, portionWeightGrams);
    const normalized = {
        id: normalizeText(unit.id) || createUnitId(label),
        label,
        normalizedUnit: normalizeUnitAlias(unit.normalizedUnit || label),
        kind: normalizeText(unit.kind) || "custom",
        factorToBase: normalizeFactor(unit.factorToBase),
        portionWeightGrams,
        requiresReview: unit.requiresReview === true,
        notes: normalizeText(unit.notes)
    };
    // Variantes reconhecidas precisam manter identidade própria para que o fator continue autoritativo.
    if (variantFields && label !== variantFields.variantFamily) normalized.normalizedUnit = normalizeUnitAlias(label);
    return variantFields ? { ...normalized, ...variantFields } : normalized;
}

function normalizeAllowedUnits(units) {
    const normalizedById = new Map();
    (Array.isArray(units) ? units : []).forEach((unit) => {
        const normalizedUnit = normalizeAllowedUnit(unit);
        if (normalizedUnit) normalizedById.set(normalizedUnit.id, normalizedUnit);
    });
    return [...normalizedById.values()];
}

function findControlledUnitDefinition(value) {
    const label = normalizeText(value).toLocaleLowerCase("pt-BR");
    return CONTROLLED_ITEM_UNIT_CATALOG.find((unit) => unit.label === label) || null;
}

export function getDeterministicFactorToBase(baseUnit, allowedUnit) {
    const baseLabel = findControlledUnitDefinition(baseUnit)?.label;
    const allowedLabel = findControlledUnitDefinition(allowedUnit)?.label;
    if (!baseLabel || !allowedLabel) return null;
    if (baseLabel === allowedLabel) return "1";

    const deterministicFactors = new Map([
        ["kg:g", "0.001"],
        ["g:kg", "1000"],
        ["l:ml", "0.001"],
        ["ml:l", "1000"]
    ]);
    return deterministicFactors.get(`${baseLabel}:${allowedLabel}`) || null;
}

export function formatUnitVariantLabel(variant = {}) {
    const definition = findUnitVariantFamily(variant.variantFamily);
    const value = normalizeUnitVariantValue(definition, variant.variantValue);
    const variantUnit = normalizeUnitAlias(variant.variantUnit);
    if (!definition || !value || !definition.variantUnits.includes(variantUnit)) return "";
    return definition.family === "porção"
        ? `${definition.family} ${value} ${variantUnit}`
        : `${definition.family} ${value}`;
}

export function getUnitVariantSemanticKey(variant = {}) {
    const definition = findUnitVariantFamily(variant.variantFamily);
    const value = normalizeUnitVariantValue(definition, variant.variantValue);
    const variantUnit = normalizeUnitAlias(variant.variantUnit);
    if (!definition || !value || !definition.variantUnits.includes(variantUnit)) return "";
    if (definition.family === "porção") {
        const weightGrams = getPortionWeightGrams(value, variantUnit);
        return weightGrams ? `${definition.family}:${weightGrams}:g` : "";
    }
    return `${definition.family}:${value}:${variantUnit}`;
}

export function getAllowedUnitVariant(unit) {
    const normalized = normalizeAllowedUnit(unit);
    if (!normalized?.variantFamily) return null;
    const label = formatUnitVariantLabel(normalized);
    if (!label) return null;
    const legacyLabels = normalizeLegacyLabels([
        ...(normalized.legacyLabels || []),
        ...(normalized.label !== label ? [normalized.label] : [])
    ]);
    return {
        id: createUnitId(label),
        label,
        variantFamily: normalized.variantFamily,
        variantValue: normalized.variantValue,
        variantUnit: normalized.variantUnit,
        legacyLabels
    };
}

export function getUnitVariantFactorToBase(baseUnit, variant = {}) {
    const definition = findUnitVariantFamily(variant.variantFamily);
    const normalizedBase = normalizeUnitAlias(baseUnit);
    const value = normalizeUnitVariantValue(definition, variant.variantValue);
    const variantUnit = normalizeUnitAlias(variant.variantUnit);
    if (!definition || !definition.compatibleBaseUnits.includes(normalizedBase)) return null;
    if (!value || !definition.variantUnits.includes(variantUnit)) return null;
    if (definition.family !== "porção") return value;
    const grams = getPortionWeightGrams(value, variantUnit);
    const exactFactor = normalizedBase === "kg" ? shiftDecimal(grams, -3) : grams;
    return normalizeFactor(formatFactor(Number(exactFactor)));
}

export function buildControlledUnitVariant(baseUnit, variant = {}) {
    const definition = findUnitVariantFamily(variant.variantFamily);
    const label = formatUnitVariantLabel(variant);
    const factorToBase = getUnitVariantFactorToBase(baseUnit, variant);
    if (!definition) return { isValid: false, error: "Escolha uma família de variante válida.", allowedUnit: null };
    if (!label) return { isValid: false, error: `Informe uma apresentação válida para ${definition.family}.`, allowedUnit: null };
    if (!factorToBase) {
        return { isValid: false, error: `${definition.family} exige uma unidade usada no total compatível.`, allowedUnit: null };
    }
    const variantValue = normalizeUnitVariantValue(definition, variant.variantValue);
    const variantUnit = normalizeUnitAlias(variant.variantUnit);
    const portionWeightGrams = definition.family === "porção"
        ? Number(getPortionWeightGrams(variantValue, variantUnit))
        : null;
    // A identidade própria evita que a conversão confunda uma variante com uma unidade base de mesmo tipo.
    const allowedUnit = createAllowedUnit(label, label, definition.kind, factorToBase, {
        id: createUnitId(label),
        variantFamily: definition.family,
        variantValue,
        variantUnit,
        legacyLabels: variant.legacyLabels,
        portionWeightGrams
    });
    return { isValid: true, error: "", allowedUnit };
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

export function isItemUnitProfileComplete(setting) {
    const profile = normalizeItemUnitSetting(setting);
    if (!profile?.baseUnit || !profile.defaultInputUnit || profile.allowedUnits.length === 0) return false;
    const hasBaseUnit = profile.allowedUnits.some((unit) => unit.normalizedUnit === profile.baseUnit);
    const hasDefaultUnit = profile.allowedUnits.some((unit) => unit.label === profile.defaultInputUnit);
    return hasBaseUnit && hasDefaultUnit;
}

export function doesItemUnitProfileNeedReview(setting) {
    const profile = normalizeItemUnitSetting(setting);
    if (!isItemUnitProfileComplete(profile)) return true;
    if (profile.needsReview || profile.allowedUnits.some((unit) => unit.requiresReview)) return true;
    return profile.allowedUnits.some((unit) => !unit.factorToBase);
}

function hasValidAssistedSuggestionVariant(unit, normalizedUnit, baseUnit) {
    const variantFields = ["variantFamily", "variantValue", "variantUnit"];
    const hasVariantMetadata = variantFields.some((fieldName) => normalizeText(unit?.[fieldName]));
    if (!hasVariantMetadata) return true;
    if (variantFields.some((fieldName) => !normalizeText(unit?.[fieldName]))) return false;

    const semanticKey = getUnitVariantSemanticKey(normalizedUnit);
    const expectedFactor = getUnitVariantFactorToBase(baseUnit, normalizedUnit);
    if (!semanticKey || !normalizedUnit.variantFamily) return false;
    if (expectedFactor) return Number(expectedFactor) === Number(normalizedUnit.factorToBase);

    // Porções legadas podem ser a própria base operacional, mantendo o peso apenas como metadado físico.
    return normalizedUnit.label === baseUnit && normalizedUnit.factorToBase === "1";
}

export function validateAssistedUnitSuggestion(setting) {
    const normalizedSetting = normalizeItemUnitSetting(setting);
    const validation = validateItemUnitSetting(setting);
    if (!validation.isValid || !normalizedSetting) {
        return { isEligible: false, error: validation.error || "A sugestão é inválida.", setting: null };
    }
    if (!isItemUnitProfileComplete(normalizedSetting)) {
        return { isEligible: false, error: "A sugestão está incompleta.", setting: null };
    }
    if (normalizedSetting.needsReview || normalizedSetting.allowedUnits.some((unit) => unit.requiresReview)) {
        return { isEligible: false, error: "A sugestão ainda precisa de revisão.", setting: null };
    }
    if (normalizedSetting.allowedUnits.length !== (Array.isArray(setting?.allowedUnits) ? setting.allowedUnits.length : 0)) {
        return { isEligible: false, error: "A sugestão possui unidades inválidas ou duplicadas.", setting: null };
    }

    const invalidFactor = normalizedSetting.allowedUnits.find((unit) => (
        !unit.factorToBase || !Number.isFinite(Number(unit.factorToBase)) || Number(unit.factorToBase) <= 0
    ));
    if (invalidFactor) {
        return { isEligible: false, error: `A unidade ${invalidFactor.label} possui fator inválido.`, setting: null };
    }

    const invalidVariantIndex = normalizedSetting.allowedUnits.findIndex((unit, unitIndex) => (
        !hasValidAssistedSuggestionVariant(setting.allowedUnits[unitIndex], unit, normalizedSetting.baseUnit)
    ));
    if (invalidVariantIndex >= 0) {
        return { isEligible: false, error: "A sugestão possui variante inválida.", setting: null };
    }
    return { isEligible: true, error: "", setting: normalizedSetting };
}

function listTemplateItemCodes(template) {
    return (template?.groups || []).flatMap((group) => (group.items || []).map((item) => normalizeText(item.code)));
}

export function buildAssistedUnitSuggestionPlan({ template, explicitSettings = [], previousEntries = [] } = {}) {
    const itemCodes = listTemplateItemCodes(template);
    const validItemCodes = itemCodes.filter(Boolean);
    if (!template?.id || validItemCodes.length !== itemCodes.length || new Set(validItemCodes).size !== validItemCodes.length) {
        return { isValid: false, error: "O template possui itens sem código válido ou com código duplicado.", candidates: [] };
    }

    const explicitByItem = new Map(normalizeItemUnitSettings(explicitSettings)
        .filter((setting) => setting.templateId === template.id)
        .map((setting) => [setting.itemCode, setting]));
    const inferredByItem = new Map(inferUnitsForTemplate(template, previousEntries)
        .map((setting) => [setting.itemCode, setting]));
    const candidates = [];
    let remainingNeedsReviewCount = 0;

    validItemCodes.forEach((itemCode) => {
        const explicitSetting = explicitByItem.get(itemCode);
        if (explicitSetting) {
            if (doesItemUnitProfileNeedReview(explicitSetting)) remainingNeedsReviewCount += 1;
            return;
        }
        const eligibility = validateAssistedUnitSuggestion(inferredByItem.get(itemCode));
        if (eligibility.isEligible) candidates.push(eligibility.setting);
        else remainingNeedsReviewCount += 1;
    });

    return {
        isValid: true,
        error: "",
        candidates,
        summary: {
            itemCount: validItemCodes.length,
            explicitProfileCount: [...explicitByItem.keys()].filter((itemCode) => validItemCodes.includes(itemCode)).length,
            eligibleSuggestionCount: candidates.length,
            remainingNeedsReviewCount
        }
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

function createAllowedUnit(label, normalizedUnit, kind, factorToBase, options = {}) {
    return normalizeAllowedUnit({
        id: options.id || createUnitId(label),
        label,
        normalizedUnit,
        kind,
        factorToBase,
        portionWeightGrams: options.portionWeightGrams,
        variantFamily: options.variantFamily,
        variantValue: options.variantValue,
        variantUnit: options.variantUnit,
        legacyLabels: options.legacyLabels,
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
    const match = text.match(/(\d+(?:[.,]\d+)?)\s*(KG|GR|G)(?=$|[^A-Z])/);
    if (!match) return null;
    const value = Number(match[1].replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value * (match[2] === "KG" ? 1000 : 1) : null;
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

function removeTerminalParenthetical(text) {
    return text.replace(/\s+\([^()]*\)\s*$/, "").trim();
}

function detectExplicitOperationalUnit(itemText) {
    const comparableText = removeTerminalParenthetical(itemText);
    const markerMatch = comparableText.match(/(?:^|[^A-Z0-9])(UNIDADES|UNIDADE|UND|UNI|UN|LITRO|LT|ML|GR|G|L)$/);
    if (!markerMatch) return "";

    const marker = markerMatch[1];
    const markerStart = markerMatch.index + markerMatch[0].lastIndexOf(marker);
    const precedingText = comparableText.slice(0, markerStart).trim().replace(/[\s\-–—/]+$/, "");
    // Um número antes do marcador descreve capacidade/peso comercial, não necessariamente a contagem.
    if (/\d+(?:[.,]\d+)?$/.test(precedingText)) return "";
    return normalizeUnitAlias(marker);
}

function inferExplicitOperationalUnitProfile(itemText) {
    const explicitUnit = detectExplicitOperationalUnit(itemText);
    if (explicitUnit === "g") {
        return createProfileSpec("kg", "g", massOptions(), "item_name", "high");
    }
    if (explicitUnit === "ml" || explicitUnit === "l") {
        const options = [
            createAllowedUnit("l", "l", "volume", "1"),
            createAllowedUnit("ml", "ml", "volume", "0.001")
        ];
        return createProfileSpec("l", explicitUnit, options, "item_name", "high");
    }
    return explicitUnit === "un"
        ? createProfileSpec("un", "un", [unitOption()], "item_name", "high")
        : null;
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

function isWasteBagProduct(itemText) {
    return /SAC(?:O|OLA)\s+DE\s+LIXO/.test(itemText);
}

function inferWasteBagProfile(itemText) {
    if (!isWasteBagProduct(itemText)) return null;
    const packageUnit = createAllowedUnit("pacote", "pacote", "package", "1");
    return createProfileSpec("pacote", "pacote", [packageUnit], "item_name", "high");
}

function inferFurst600BeerProfile(itemText, groupText) {
    const isConfirmedFamily = /CERVEJAS?/.test(groupText)
        && /\bCERVEJA\s+FURST\b/.test(itemText)
        && /\b600\s*ML\b/.test(itemText);
    if (!isConfirmedFamily) return null;

    const boxVariant = buildControlledUnitVariant("garrafa", {
        variantFamily: "caixa",
        variantValue: "12",
        variantUnit: "garrafa"
    });
    if (!boxVariant.isValid) return null;
    const bottle = createAllowedUnit("garrafa", "garrafa", "bottle", "1");
    return createProfileSpec("garrafa", "garrafa", [bottle, boxVariant.allowedUnit], "item_name", "high");
}

function isEmporioCachaca750Family(itemText, groupText) {
    if (groupText !== "EMPORIO" || !/^CACHACA\s+EMPORIO\b/.test(itemText)) return false;
    const explicitVolumeLiters = detectVolumeLiters(itemText);
    return !explicitVolumeLiters || explicitVolumeLiters === 0.75;
}

function inferEmporioCachaca750Profile(itemText, groupText) {
    if (!isEmporioCachaca750Family(itemText, groupText)) return null;
    const bottle = createAllowedUnit("garrafa", "garrafa", "bottle", "1");
    // Mais casas decimais fazem 750 ml consolidar como 1 garrafa na precisão pública atual.
    const milliliter = createAllowedUnit("ml", "ml", "volume", "0.001333333333333333");
    return createProfileSpec("garrafa", "garrafa", [bottle, milliliter], "item_name", "high");
}

function inferConfirmedOperationalProfile(itemText, groupText) {
    return inferWasteBagProfile(itemText)
        || inferFurst600BeerProfile(itemText, groupText)
        || inferEmporioCachaca750Profile(itemText, groupText);
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
    return inferConfirmedOperationalProfile(itemText, groupText)
        || inferPortionProfile(itemText, groupText)
        || inferPackagingProfile(itemText, groupText)
        || inferExplicitOperationalUnitProfile(itemText)
        || inferMassProfile(itemText, groupText)
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

function createControlledAllowedUnit(baseLabel, input) {
    const definition = findControlledUnitDefinition(input?.label);
    if (!definition) return null;
    const deterministicFactor = getDeterministicFactorToBase(baseLabel, definition.label);
    const explicitFactor = normalizeFactor(normalizeText(input.factorToBase).replace(",", "."));
    const factorToBase = deterministicFactor || explicitFactor;
    return createAllowedUnit(definition.label, definition.label, definition.kind, factorToBase, {
        requiresReview: !factorToBase,
        notes: factorToBase ? "" : "Fator de conversão precisa ser informado manualmente."
    });
}

function createControlledSelectionUnit(baseLabel, value) {
    const input = typeof value === "string" ? { label: value } : value;
    if (input?.variantFamily) return buildControlledUnitVariant(baseLabel, input);
    const allowedUnit = createControlledAllowedUnit(baseLabel, input);
    return allowedUnit
        ? { isValid: true, error: "", allowedUnit }
        : { isValid: false, error: "O perfil contém unidade fora do catálogo controlado.", allowedUnit: null };
}

function normalizeControlledAllowedUnitInputs(values, baseLabel) {
    const unitsById = new Map();
    const variantSemanticKeys = new Set();
    const errors = [];
    (Array.isArray(values) ? values : []).forEach((value) => {
        const result = createControlledSelectionUnit(baseLabel, value);
        if (!result.isValid) {
            errors.push(result.error);
            return;
        }
        const semanticKey = getUnitVariantSemanticKey(result.allowedUnit);
        if (unitsById.has(result.allowedUnit.id) || (semanticKey && variantSemanticKeys.has(semanticKey))) {
            errors.push(`A variante ${result.allowedUnit.label} está duplicada.`);
            return;
        }
        unitsById.set(result.allowedUnit.id, result.allowedUnit);
        if (semanticKey) variantSemanticKeys.add(semanticKey);
    });
    return { units: [...unitsById.values()], errors };
}

export function validateControlledItemUnitProfileInput(overrides = {}) {
    const baseDefinition = findControlledUnitDefinition(overrides.baseUnit);
    const baseLabel = baseDefinition?.label || normalizeUnitAlias(overrides.baseUnit);
    const selection = normalizeControlledAllowedUnitInputs(overrides.allowedUnits, baseLabel);
    const selectedLabels = new Set(selection.units.map((unit) => unit.label));
    const hasBaseUnit = selection.units.some((unit) => unit.normalizedUnit === baseLabel);
    const defaultInputUnit = normalizeText(overrides.defaultInputUnit);
    const errors = [...selection.errors];

    if (!baseDefinition) errors.unshift("Escolha uma unidade base do catálogo controlado.");
    if (selection.units.length === 0) errors.push("Selecione ao menos uma unidade permitida.");
    if (baseDefinition && !hasBaseUnit) errors.push("A unidade base precisa estar entre as unidades permitidas.");
    if (!defaultInputUnit || !selectedLabels.has(defaultInputUnit)) {
        errors.push("A unidade padrão precisa estar entre as unidades permitidas.");
    }
    return { isValid: errors.length === 0, error: errors[0] || "", errors, baseDefinition, selection };
}

export function buildControlledItemUnitProfile(profile, overrides = {}) {
    const inputValidation = validateControlledItemUnitProfileInput(overrides);
    if (!inputValidation.isValid) return { ...inputValidation, setting: null, isResolved: false, warnings: [] };

    const baseLabel = inputValidation.baseDefinition.label;
    const allowedUnits = inputValidation.selection.units;
    const hasMissingFactor = allowedUnits.some((unit) => !unit.factorToBase);
    const setting = normalizeItemUnitSetting({
        ...profile,
        baseUnit: baseLabel,
        defaultInputUnit: normalizeText(overrides.defaultInputUnit),
        manualUnit: normalizeText(overrides.defaultInputUnit),
        allowedUnits,
        source: "manual",
        confidence: "high",
        needsReview: overrides.needsReview === true || hasMissingFactor
    });
    const settingValidation = validateItemUnitSetting(setting);
    const warnings = hasMissingFactor ? ["Há unidade permitida sem fator; o perfil continuará pendente."] : [];
    return {
        ...settingValidation,
        setting: settingValidation.setting,
        isResolved: settingValidation.isValid && !setting.needsReview,
        warnings
    };
}

export function summarizeItemUnitSettings(template, settings = []) {
    const itemCount = (template?.groups || []).reduce((total, group) => total + (group.items || []).length, 0);
    const profiles = settings.filter((setting) => setting.templateId === template?.id);
    const completeProfiles = profiles.filter((profile) => !doesItemUnitProfileNeedReview(profile));
    const profilesWithoutStructure = profiles.filter((profile) => !isItemUnitProfileComplete(profile));
    return {
        itemCount,
        completeProfileCount: completeProfiles.length,
        needsReviewCount: profiles.filter(doesItemUnitProfileNeedReview).length,
        withoutProfileCount: itemCount - profiles.length + profilesWithoutStructure.length,
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
