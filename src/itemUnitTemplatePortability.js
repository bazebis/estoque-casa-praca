import { validateCountTemplate } from "./countTemplates.js";
import {
    doesItemUnitProfileNeedReview,
    getDeterministicFactorToBase,
    getUnitVariantFactorToBase,
    getUnitVariantSemanticKey,
    normalizeItemUnitSetting,
    validateItemUnitSetting
} from "./itemUnitSettings.js";
import {
    hasActiveEntriesForItemInOpenSessions,
    normalizeLocationCountEntries
} from "./locationCountEntries.js";
import { normalizeLocationCountSessions } from "./locationCountSessions.js";

export const UNIT_PROFILES_SCHEMA_VERSION = 1;

const portableAllowedUnitFields = [
    "id",
    "label",
    "normalizedUnit",
    "kind",
    "factorToBase",
    "portionWeightGrams",
    "requiresReview",
    "notes"
];

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function hasOwn(object, fieldName) {
    return Object.prototype.hasOwnProperty.call(object || {}, fieldName);
}

function findTemplateItemContext(template, itemCode) {
    const normalizedItemCode = normalizeText(itemCode);

    for (const group of template?.groups || []) {
        const item = (group.items || []).find((candidate) => candidate.code === normalizedItemCode);
        if (item) return { group, item };
    }

    return null;
}

function stripLocalTemplateMetadata(template) {
    const {
        unitProfilesSchemaVersion: _schemaVersion,
        itemUnitSettings: _itemUnitSettings,
        importedAt: _importedAt,
        importFileName: _importFileName,
        ...portableTemplate
    } = template || {};

    return portableTemplate;
}

export function stripUnitProfileTransport(template) {
    const {
        unitProfilesSchemaVersion: _schemaVersion,
        itemUnitSettings: _itemUnitSettings,
        ...baseTemplate
    } = template || {};

    return baseTemplate;
}

function buildPortableAllowedUnit(allowedUnit) {
    const portableUnit = Object.fromEntries(portableAllowedUnitFields.map((fieldName) => (
        [fieldName, allowedUnit[fieldName] ?? null]
    )));

    if (allowedUnit.variantFamily) portableUnit.variantFamily = allowedUnit.variantFamily;
    if (allowedUnit.variantValue) portableUnit.variantValue = allowedUnit.variantValue;
    if (allowedUnit.variantUnit) portableUnit.variantUnit = allowedUnit.variantUnit;
    if (Array.isArray(allowedUnit.legacyLabels)) portableUnit.legacyLabels = [...allowedUnit.legacyLabels];

    return portableUnit;
}

export function buildPortableItemUnitSetting(setting) {
    const normalizedSetting = normalizeItemUnitSetting(setting);
    if (!normalizedSetting) return null;

    return {
        itemCode: normalizedSetting.itemCode,
        baseUnit: normalizedSetting.baseUnit,
        defaultInputUnit: normalizedSetting.defaultInputUnit,
        allowedUnits: normalizedSetting.allowedUnits.map(buildPortableAllowedUnit),
        needsReview: normalizedSetting.needsReview,
        notes: normalizedSetting.notes
    };
}

function validatePortableAllowedUnit(unit, unitIndex) {
    const label = `Unidade permitida ${unitIndex + 1}`;
    if (!unit || typeof unit !== "object" || Array.isArray(unit)) return [`${label} precisa ser um objeto.`];

    const errors = [];
    ["id", "label", "normalizedUnit", "kind"].forEach((fieldName) => {
        if (!normalizeText(unit[fieldName])) errors.push(`${label} precisa informar ${fieldName}.`);
    });
    if (typeof unit.requiresReview !== "boolean") errors.push(`${label} precisa informar requiresReview.`);
    if (!hasOwn(unit, "factorToBase")) errors.push(`${label} precisa informar factorToBase.`);
    if (!hasOwn(unit, "portionWeightGrams")) errors.push(`${label} precisa informar portionWeightGrams.`);

    const factor = unit.factorToBase;
    if (factor !== null && factor !== "" && factor !== undefined) {
        const normalizedFactor = normalizeText(factor);
        if (!/^\d+(?:\.\d+)?$/.test(normalizedFactor) || Number(normalizedFactor) <= 0) {
            errors.push(`${label} possui fator inválido.`);
        }
    }

    const portionWeight = unit.portionWeightGrams;
    if (portionWeight !== null && portionWeight !== "" && portionWeight !== undefined) {
        if (!Number.isFinite(Number(portionWeight)) || Number(portionWeight) <= 0) {
            errors.push(`${label} possui peso de porção inválido.`);
        }
    }

    const hasVariantField = ["variantFamily", "variantValue", "variantUnit"].some((fieldName) => hasOwn(unit, fieldName));
    if (hasVariantField && ["variantFamily", "variantValue", "variantUnit"].some((fieldName) => !normalizeText(unit[fieldName]))) {
        errors.push(`${label} possui metadados de variante incompletos.`);
    }
    if (hasOwn(unit, "legacyLabels") && !Array.isArray(unit.legacyLabels)) {
        errors.push(`${label} possui aliases legados inválidos.`);
    }

    return errors;
}

function collectPortableProfileErrors(profile, profileIndex) {
    const label = `Perfil ${profileIndex + 1}`;
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) return [`${label} precisa ser um objeto.`];

    const errors = [];
    if (!normalizeText(profile.itemCode)) errors.push(`${label} precisa informar itemCode.`);
    if (!normalizeText(profile.baseUnit)) errors.push(`${label} precisa informar baseUnit.`);
    if (!normalizeText(profile.defaultInputUnit)) errors.push(`${label} precisa informar defaultInputUnit.`);
    if (typeof profile.needsReview !== "boolean") errors.push(`${label} precisa informar needsReview.`);
    if (!Array.isArray(profile.allowedUnits) || profile.allowedUnits.length === 0) {
        errors.push(`${label} precisa possuir allowedUnits.`);
        return errors;
    }

    profile.allowedUnits.forEach((unit, unitIndex) => {
        errors.push(...validatePortableAllowedUnit(unit, unitIndex));
    });

    const ids = profile.allowedUnits.map((unit) => normalizeText(unit?.id)).filter(Boolean);
    const labels = profile.allowedUnits.map((unit) => normalizeText(unit?.label).toLocaleLowerCase("pt-BR")).filter(Boolean);
    if (new Set(ids).size !== ids.length) errors.push(`${label} possui identificadores de unidade duplicados.`);
    if (new Set(labels).size !== labels.length) errors.push(`${label} possui labels de unidade duplicados.`);

    return errors;
}

function hydratePortableProfile(profile, template, timestamp) {
    if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        return { error: "O perfil de unidade precisa ser um objeto." };
    }
    const context = findTemplateItemContext(template, profile.itemCode);
    if (!context) return { error: `O item ${normalizeText(profile.itemCode) || "sem código"} não existe no template.` };

    const candidate = normalizeItemUnitSetting({
        ...profile,
        templateId: template.id,
        itemNameSnapshot: context.item.name,
        groupId: context.group.id,
        groupNameSnapshot: context.group.name,
        source: "manual",
        confidence: "high",
        suggestedUnit: profile.defaultInputUnit,
        manualUnit: profile.defaultInputUnit,
        effectiveUnit: profile.defaultInputUnit,
        createdAt: timestamp,
        updatedAt: timestamp
    }, timestamp);
    const validation = validateItemUnitSetting(candidate);
    if (!validation.isValid) return { error: validation.error || "Perfil de unidade inválido." };
    if (!validation.setting.allowedUnits.some((unit) => unit.normalizedUnit === validation.setting.baseUnit)) {
        return { error: `O item ${profile.itemCode} não possui a unidade base entre as unidades permitidas.` };
    }

    const inconsistentUnit = validation.setting.allowedUnits.find((unit) => {
        const expectedFactor = unit.variantFamily
            ? getUnitVariantFactorToBase(validation.setting.baseUnit, unit)
            : getDeterministicFactorToBase(validation.setting.baseUnit, unit.label);
        if (unit.normalizedUnit === validation.setting.baseUnit && unit.factorToBase !== "1") return true;
        return expectedFactor && unit.factorToBase !== expectedFactor;
    });
    if (inconsistentUnit) {
        return { error: `O item ${profile.itemCode} possui fator incompatível para ${inconsistentUnit.label}.` };
    }

    const semanticKeys = validation.setting.allowedUnits.map(getUnitVariantSemanticKey).filter(Boolean);
    if (new Set(semanticKeys).size !== semanticKeys.length) {
        return { error: `O item ${profile.itemCode} possui variantes semanticamente duplicadas.` };
    }
    if (validation.setting.allowedUnits.length !== profile.allowedUnits.length) {
        return { error: `O item ${profile.itemCode} possui unidades que não puderam ser preservadas.` };
    }

    return { setting: validation.setting };
}

function canonicalizePortableProfile(profile) {
    const portableProfile = buildPortableItemUnitSetting(profile);
    if (!portableProfile) return null;

    return {
        ...portableProfile,
        allowedUnits: portableProfile.allowedUnits
            .map((unit) => ({
                ...unit,
                legacyLabels: Array.isArray(unit.legacyLabels) ? [...unit.legacyLabels].sort() : undefined
            }))
            .sort((firstUnit, secondUnit) => firstUnit.id.localeCompare(secondUnit.id, "pt-BR"))
    };
}

export function areItemUnitSettingsSemanticallyEqual(firstSetting, secondSetting) {
    return JSON.stringify(canonicalizePortableProfile(firstSetting))
        === JSON.stringify(canonicalizePortableProfile(secondSetting));
}

function createTemplateItemSignature(template, itemCode) {
    const context = findTemplateItemContext(template, itemCode);
    if (!context) return "missing";

    return JSON.stringify({
        group: {
            id: context.group.id,
            name: context.group.name,
            countAreas: context.group.countAreas || [],
            totalArea: context.group.totalArea || null
        },
        item: {
            code: context.item.code,
            name: context.item.name,
            order: context.item.order,
            countAreas: context.item.countAreas || []
        }
    });
}

function findProtectedTemplateReplacement(existingTemplate, nextTemplate, sessions, entries) {
    if (!existingTemplate || existingTemplate.id !== nextTemplate.id) return null;

    const normalizedSessions = normalizeLocationCountSessions(sessions);
    const normalizedEntries = normalizeLocationCountEntries(entries);
    const openSessionIds = new Set(normalizedSessions.filter((session) => (
        session.templateId === nextTemplate.id && ["draft", "in_progress"].includes(session.status)
    )).map((session) => session.id));
    const protectedItemCodes = new Set(normalizedEntries.filter((entry) => (
        entry.active && entry.templateId === nextTemplate.id && openSessionIds.has(entry.sessionId)
    )).map((entry) => entry.itemCode));

    return [...protectedItemCodes].find((itemCode) => (
        createTemplateItemSignature(existingTemplate, itemCode) !== createTemplateItemSignature(nextTemplate, itemCode)
    )) || null;
}

export function buildUnitProfileTemplateExport(template, explicitSettings = []) {
    const baseValidation = validateCountTemplate(stripLocalTemplateMetadata(template));
    if (!baseValidation.isValid) return { isValid: false, error: baseValidation.error, errors: baseValidation.errors };

    const matchingSettings = explicitSettings.filter((setting) => setting.templateId === baseValidation.template.id);
    const explicitByItem = new Map();
    for (const setting of matchingSettings) {
        if (explicitByItem.has(setting.itemCode)) {
            return { isValid: false, error: `Há mais de um perfil explícito para o item ${setting.itemCode}.` };
        }
        explicitByItem.set(setting.itemCode, setting);
    }
    const orderedProfiles = (baseValidation.template.groups || []).flatMap((group) => (
        (group.items || []).map((item) => explicitByItem.get(item.code)).filter(Boolean)
    ));
    const portableProfiles = orderedProfiles.map(buildPortableItemUnitSetting);
    const invalidProfile = orderedProfiles.find((profile, index) => {
        const errors = collectPortableProfileErrors(portableProfiles[index], index);
        const hydrated = hydratePortableProfile(portableProfiles[index], baseValidation.template, profile.updatedAt);
        return errors.length > 0 || hydrated.error;
    });
    if (invalidProfile) {
        return { isValid: false, error: `O perfil explícito do item ${invalidProfile.itemCode} é inválido para exportação.` };
    }

    const itemCount = baseValidation.template.stats.itemCount;
    return {
        isValid: true,
        error: "",
        template: {
            ...baseValidation.template,
            unitProfilesSchemaVersion: UNIT_PROFILES_SCHEMA_VERSION,
            itemUnitSettings: portableProfiles
        },
        summary: {
            itemCount,
            explicitProfileCount: portableProfiles.length,
            remainingWithoutExplicitProfileCount: Math.max(itemCount - portableProfiles.length, 0),
            explicitNeedsReviewCount: orderedProfiles.filter(doesItemUnitProfileNeedReview).length
        }
    };
}

function validateTransportSection(payload) {
    const hasVersion = hasOwn(payload, "unitProfilesSchemaVersion");
    const hasProfiles = hasOwn(payload, "itemUnitSettings");
    if (!hasVersion && !hasProfiles) return { isLegacy: true, profiles: [] };
    if (!hasVersion || !hasProfiles) return { error: "A seção de perfis de unidade está incompleta." };
    if (payload.unitProfilesSchemaVersion !== UNIT_PROFILES_SCHEMA_VERSION) {
        return { error: `Versão de perfis de unidade não suportada: ${payload.unitProfilesSchemaVersion}.` };
    }
    if (!Array.isArray(payload.itemUnitSettings)) return { error: "itemUnitSettings precisa ser uma lista." };
    return { isLegacy: false, profiles: payload.itemUnitSettings };
}

function hydrateTransportProfiles(profiles, template, timestamp) {
    const errors = [];
    const seenItemCodes = new Set();
    const settings = [];

    profiles.forEach((profile, profileIndex) => {
        errors.push(...collectPortableProfileErrors(profile, profileIndex));
        const itemCode = normalizeText(profile?.itemCode);
        if (seenItemCodes.has(itemCode)) errors.push(`O itemCode ${itemCode} está duplicado na seção de perfis.`);
        if (itemCode) seenItemCodes.add(itemCode);

        const hydration = hydratePortableProfile(profile, template, timestamp);
        if (hydration.error) errors.push(hydration.error);
        if (hydration.setting) settings.push(hydration.setting);
    });

    return { errors, settings };
}

function classifyImportedSettings({ importedSettings, localSettings, templateId, sessions, entries }) {
    const localByItem = new Map(localSettings
        .filter((setting) => setting.templateId === templateId)
        .map((setting) => [setting.itemCode, setting]));
    const result = { settingsToApply: [], conflicts: [], noOpItemCodes: [], blockedItemCodes: [] };

    importedSettings.forEach((setting) => {
        const localSetting = localByItem.get(setting.itemCode);
        if (localSetting) {
            if (areItemUnitSettingsSemanticallyEqual(localSetting, setting)) result.noOpItemCodes.push(setting.itemCode);
            else result.conflicts.push({ itemCode: setting.itemCode, localSetting, importedSetting: setting });
            return;
        }

        const isBlocked = hasActiveEntriesForItemInOpenSessions({
            templateId,
            itemCode: setting.itemCode,
            sessions,
            entries
        });
        if (isBlocked) result.blockedItemCodes.push(setting.itemCode);
        else result.settingsToApply.push(setting);
    });

    return result;
}

function buildSuccessfulImportPlan(template, classification, isLegacy = false) {
    return {
        isValid: true,
        isLegacy,
        template,
        ...classification,
        summary: {
            appliedCount: classification.settingsToApply.length,
            noOpCount: classification.noOpItemCodes.length,
            conflictCount: classification.conflicts.length
        }
    };
}

export function buildUnitProfileTemplateImportPlan({
    payload,
    localSettings = [],
    existingTemplate = null,
    sessions = [],
    entries = [],
    timestamp = new Date().toISOString()
} = {}) {
    const baseValidation = validateCountTemplate(stripUnitProfileTransport(payload));
    if (!baseValidation.isValid) return { isValid: false, error: baseValidation.error, errors: baseValidation.errors };

    const transport = validateTransportSection(payload);
    if (transport.error) return { isValid: false, error: transport.error, errors: [transport.error] };

    const protectedItemCode = findProtectedTemplateReplacement(
        existingTemplate,
        baseValidation.template,
        sessions,
        entries
    );
    if (protectedItemCode) {
        const error = `O item ${protectedItemCode} possui lançamentos em uma contagem aberta e seria alterado pelo template.`;
        return { isValid: false, error, errors: [error], blockedItemCodes: [protectedItemCode] };
    }

    if (transport.isLegacy) {
        return buildSuccessfulImportPlan(baseValidation.template, {
            settingsToApply: [], conflicts: [], noOpItemCodes: [], blockedItemCodes: []
        }, true);
    }

    const hydration = hydrateTransportProfiles(transport.profiles, baseValidation.template, timestamp);
    if (hydration.errors.length > 0) {
        return { isValid: false, error: hydration.errors[0], errors: hydration.errors, settingsToApply: [] };
    }
    const classification = classifyImportedSettings({
        importedSettings: hydration.settings,
        localSettings,
        templateId: baseValidation.template.id,
        sessions,
        entries
    });
    if (classification.blockedItemCodes.length > 0) {
        const error = "Existem perfis com lançamentos em uma contagem aberta. Finalize/cancele a contagem ou remova os lançamentos antes de importar.";
        return { isValid: false, error, errors: [error], ...classification, settingsToApply: [] };
    }

    return buildSuccessfulImportPlan(baseValidation.template, classification);
}

export function mergeImportedItemUnitSettings(currentSettings, settingsToApply) {
    const settingsById = new Map(currentSettings.map((setting) => [setting.id, setting]));
    settingsToApply.forEach((setting) => settingsById.set(setting.id, setting));
    return [...settingsById.values()];
}

export function formatSanitizedUnitTemplateFilename(template) {
    const safeName = normalizeText(template?.name || template?.id || "template")
        .normalize("NFD")
        .replace(/\p{Diacritic}/gu, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    return `${safeName || "template"}-com-unidades.json`;
}
