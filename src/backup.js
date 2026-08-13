import { validateCountTemplate } from "./countTemplates.js";
import { normalizeHistoryEntry } from "./history.js";
import {
    getUnitVariantFactorToBase,
    getUnitVariantSemanticKey,
    normalizeItemUnitSetting,
    normalizeItemUnitSettings,
    validateItemUnitSetting
} from "./itemUnitSettings.js";
import { normalizeCustomUnits } from "./units.js";

const appName = "estoque-casa-praca";
const appVersion = 1;
export const BACKUP_SCHEMA_VERSION = 2;
const supportedSchemaVersions = new Set([1, BACKUP_SCHEMA_VERSION]);
const restoreModes = new Set(["merge-history", "replace-catalog", "replace-all"]);
const canonicalProfileSources = new Set(["manual", "group_name", "item_name", "previous_entry", "unknown"]);
const canonicalProfileConfidences = new Set(["high", "medium", "low", "unknown"]);

function formatDatePart(value) {
    return String(value).padStart(2, "0");
}

function createBackupFileName(date = new Date()) {
    const year = date.getFullYear();
    const month = formatDatePart(date.getMonth() + 1);
    const day = formatDatePart(date.getDate());
    const hour = formatDatePart(date.getHours());
    const minute = formatDatePart(date.getMinutes());
    return `estoque-casa-praca-backup-${year}-${month}-${day}-${hour}-${minute}.json`;
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function hasOwn(object, fieldName) {
    return Object.prototype.hasOwnProperty.call(object || {}, fieldName);
}

function normalizeCatalogItems(items) {
    if (!Array.isArray(items)) return [];
    return items.map((item, index) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        return {
            id: item.id || `backup_item_${index}`,
            name: String(item.name || item.nome || "").trim(),
            unitId: item.unitId || item.unidade || "un",
            active: item.active !== false,
            order: Number.isInteger(item.order) ? item.order : index
        };
    }).filter((item) => item?.name).map((item, index) => ({ ...item, order: index }));
}

function getBackupCatalog(payload) {
    return payload.catalog?.items || payload.items || payload.catalog || [];
}

function getBackupHistory(payload) {
    return payload.countingHistory || payload.finalizedCounts || [];
}

function getBackupCustomUnits(payload) {
    return payload.customUnits || payload.units?.custom || [];
}

function normalizeTemplates(templates) {
    if (!Array.isArray(templates)) return [];
    return templates.map((template) => validateCountTemplate(template).template).filter(Boolean);
}

function collectRawTemplateItemCodes(template) {
    if (!Array.isArray(template?.groups)) return null;
    const itemCodes = [];
    for (const group of template.groups) {
        if (!group || typeof group !== "object" || Array.isArray(group) || !Array.isArray(group.items)) return null;
        for (const item of group.items) {
            if (!item || typeof item !== "object" || Array.isArray(item)) return null;
            itemCodes.push(normalizeText(item.code));
        }
    }
    return itemCodes;
}

export function buildBackupPayload(data) {
    return {
        appName,
        appVersion,
        schemaVersion: BACKUP_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        catalog: { items: clone(data.catalogItems || []) },
        countingHistory: clone(data.countingHistory || []),
        finalizedCounts: clone(data.countingHistory || []),
        lastFinalizedCount: data.lastFinalizedCount ? clone(data.lastFinalizedCount) : null,
        countingDraft: null,
        includesActiveDraft: false,
        customUnits: clone(data.customUnits || []),
        countTemplates: clone(data.countTemplates || []),
        itemUnitSettings: clone(data.itemUnitSettings || [])
    };
}

export function downloadBackup(payload) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = createBackupFileName(new Date(payload.exportedAt || Date.now()));
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export function parseBackupText(text) {
    try {
        return { payload: JSON.parse(text), error: "" };
    } catch {
        return { payload: null, error: "Arquivo JSON malformado." };
    }
}

export function normalizeBackupPayload(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const schemaVersion = Number(payload.schemaVersion);
    const rawHistory = getBackupHistory(payload);
    const countingHistory = (Array.isArray(rawHistory) ? rawHistory : []).map(normalizeHistoryEntry).filter(Boolean);
    const isSchema2 = schemaVersion === BACKUP_SCHEMA_VERSION;
    return {
        appName: payload.appName,
        appVersion: payload.appVersion || null,
        schemaVersion,
        exportedAt: payload.exportedAt || "",
        catalogItems: normalizeCatalogItems(getBackupCatalog(payload)),
        countingHistory,
        lastFinalizedCount: normalizeHistoryEntry(payload.lastFinalizedCount) || countingHistory[0] || null,
        countingDraft: payload.countingDraft || null,
        includesActiveDraft: Boolean(payload.countingDraft || payload.includesActiveDraft),
        customUnits: normalizeCustomUnits(Array.isArray(getBackupCustomUnits(payload)) ? getBackupCustomUnits(payload) : []),
        countTemplates: isSchema2 ? normalizeTemplates(payload.countTemplates) : null,
        itemUnitSettings: isSchema2 ? normalizeItemUnitSettings(payload.itemUnitSettings) : null,
        preservesLocalUnitConfiguration: !isSchema2
    };
}

function collectTemplateErrors(rawTemplates, normalizedTemplates) {
    if (!Array.isArray(rawTemplates)) return ["Backup schema 2 precisa conter countTemplates como lista."];
    const errors = [];
    rawTemplates.forEach((template, index) => {
        const validation = validateCountTemplate(template);
        if (!validation.isValid) errors.push(`Template ${index + 1}: ${validation.error}`);
        const itemCodes = collectRawTemplateItemCodes(template);
        if (!itemCodes) return;
        if (itemCodes.some((itemCode) => !itemCode) || new Set(itemCodes).size !== itemCodes.length) {
            errors.push(`Template ${index + 1} possui itemCode vazio ou duplicado.`);
        }
    });
    const templateIds = rawTemplates.map((template) => normalizeText(template?.id)).filter(Boolean);
    if (new Set(templateIds).size !== templateIds.length) errors.push("O backup possui templateId duplicado.");
    if (normalizedTemplates.length !== rawTemplates.length) errors.push("Um template inválido seria perdido na normalização.");
    return errors;
}

function collectAllowedUnitErrors(rawUnit, normalizedUnit, profileLabel) {
    if (!rawUnit || typeof rawUnit !== "object" || Array.isArray(rawUnit) || !normalizedUnit) {
        return [`${profileLabel} possui unidade permitida inválida.`];
    }
    const errors = [];
    ["id", "label", "normalizedUnit", "kind"].forEach((fieldName) => {
        if (!normalizeText(rawUnit[fieldName])) errors.push(`${profileLabel} possui unidade sem ${fieldName}.`);
    });
    if (typeof rawUnit.requiresReview !== "boolean") {
        errors.push(`${profileLabel} possui requiresReview fora do formato booleano.`);
    }
    const rawFactor = rawUnit.factorToBase;
    if (rawFactor !== null && rawFactor !== "" && rawFactor !== undefined) {
        const factor = Number(rawFactor);
        if (!Number.isFinite(factor) || factor <= 0) errors.push(`${profileLabel} possui factorToBase inválido.`);
    }
    if (hasOwn(rawUnit, "legacyLabels") && !Array.isArray(rawUnit.legacyLabels)) {
        errors.push(`${profileLabel} possui legacyLabels inválido.`);
    }
    if (Array.isArray(rawUnit.legacyLabels)) {
        const labels = rawUnit.legacyLabels.map(normalizeText).filter(Boolean);
        if (labels.length !== rawUnit.legacyLabels.length || new Set(labels).size !== labels.length) {
            errors.push(`${profileLabel} possui legacyLabels vazio ou duplicado.`);
        }
    }
    const variantFields = ["variantFamily", "variantValue", "variantUnit"];
    const hasVariant = variantFields.some((fieldName) => hasOwn(rawUnit, fieldName));
    if (hasVariant && variantFields.some((fieldName) => !normalizeText(rawUnit[fieldName]))) {
        errors.push(`${profileLabel} possui variante incompleta.`);
    }
    if (hasVariant && !getUnitVariantSemanticKey(normalizedUnit)) errors.push(`${profileLabel} possui variante inválida.`);
    return errors;
}

function hasCompatibleVariantFactor(unit, baseUnit) {
    const expectedFactor = getUnitVariantFactorToBase(baseUnit, unit);
    if (expectedFactor) return Number(expectedFactor) === Number(unit.factorToBase);

    // Apresentações legadas podem ser a própria base e manter a variante como metadado físico.
    return unit.label === baseUnit && unit.factorToBase === "1";
}

function collectProfileErrors(rawProfile, normalizedProfile, profileIndex) {
    const profileLabel = `Perfil ${profileIndex + 1}`;
    if (!rawProfile || typeof rawProfile !== "object" || Array.isArray(rawProfile) || !normalizedProfile) {
        return [`${profileLabel} precisa ser um objeto válido.`];
    }
    const validation = validateItemUnitSetting(rawProfile);
    const errors = validation.isValid ? [] : validation.errors.map((error) => `${profileLabel}: ${error}`);
    ["id", "templateId", "itemCode", "itemNameSnapshot", "groupId", "groupNameSnapshot", "source", "confidence"]
        .forEach((fieldName) => {
            if (!normalizeText(rawProfile[fieldName])) errors.push(`${profileLabel} precisa informar ${fieldName}.`);
        });
    if (!canonicalProfileSources.has(rawProfile.source)) errors.push(`${profileLabel} possui source inválido.`);
    if (!canonicalProfileConfidences.has(rawProfile.confidence)) errors.push(`${profileLabel} possui confidence inválida.`);
    ["createdAt", "updatedAt"].forEach((fieldName) => {
        if (!rawProfile[fieldName] || Number.isNaN(new Date(rawProfile[fieldName]).getTime())) {
            errors.push(`${profileLabel} precisa informar ${fieldName} válido.`);
        }
    });
    if (typeof rawProfile.needsReview !== "boolean") errors.push(`${profileLabel} precisa informar needsReview.`);
    const rawUnits = Array.isArray(rawProfile.allowedUnits) ? rawProfile.allowedUnits : [];
    if (rawUnits.length === 0 || rawUnits.length !== normalizedProfile.allowedUnits.length) {
        errors.push(`${profileLabel} perderia unidades durante a normalização.`);
    }
    rawUnits.forEach((unit, unitIndex) => {
        errors.push(...collectAllowedUnitErrors(unit, normalizedProfile.allowedUnits[unitIndex], profileLabel));
    });
    const labels = normalizedProfile.allowedUnits.map((unit) => unit.label.toLocaleLowerCase("pt-BR"));
    if (new Set(labels).size !== labels.length) errors.push(`${profileLabel} possui labels de unidade duplicados.`);
    const variantKeys = normalizedProfile.allowedUnits.map(getUnitVariantSemanticKey).filter(Boolean);
    if (new Set(variantKeys).size !== variantKeys.length) errors.push(`${profileLabel} possui variantes duplicadas.`);
    const baseUnit = normalizedProfile.allowedUnits.find((unit) => unit.normalizedUnit === normalizedProfile.baseUnit);
    if (!baseUnit || baseUnit.factorToBase !== "1") errors.push(`${profileLabel} não possui unidade base coerente com fator 1.`);
    if (!normalizedProfile.allowedUnits.some((unit) => unit.label === normalizedProfile.defaultInputUnit)) {
        errors.push(`${profileLabel} possui defaultInputUnit fora de allowedUnits.`);
    }
    const invalidVariant = normalizedProfile.allowedUnits.find((unit) => (
        unit.variantFamily && !hasCompatibleVariantFactor(unit, normalizedProfile.baseUnit)
    ));
    if (invalidVariant) errors.push(`${profileLabel} possui fator de variante incompatível.`);
    return errors;
}

function collectSchema2Errors(payload, normalizedPayload) {
    const errors = collectTemplateErrors(payload.countTemplates, normalizedPayload.countTemplates || []);
    const rawCatalog = getBackupCatalog(payload);
    const rawHistory = getBackupHistory(payload);
    const rawCustomUnits = getBackupCustomUnits(payload);
    if (Array.isArray(rawCatalog) && normalizedPayload.catalogItems.length !== rawCatalog.length) {
        errors.push("Um item de catálogo inválido seria perdido na normalização.");
    }
    if (Array.isArray(rawHistory) && normalizedPayload.countingHistory.length !== rawHistory.length) {
        errors.push("Uma contagem histórica inválida seria perdida na normalização.");
    }
    if (Array.isArray(rawCustomUnits) && normalizedPayload.customUnits.length !== rawCustomUnits.length) {
        errors.push("Uma unidade personalizada inválida seria perdida na normalização.");
    }
    if (!Array.isArray(payload.itemUnitSettings)) {
        return [...errors, "Backup schema 2 precisa conter itemUnitSettings como lista."];
    }
    if (normalizedPayload.itemUnitSettings.length !== payload.itemUnitSettings.length) {
        errors.push("Um perfil inválido seria perdido na normalização.");
    }
    const templateById = new Map((normalizedPayload.countTemplates || []).map((template) => [template.id, template]));
    const seenKeys = new Set();
    payload.itemUnitSettings.forEach((profile, index) => {
        const normalizedProfile = normalizeItemUnitSetting(profile);
        errors.push(...collectProfileErrors(profile, normalizedProfile, index));
        const key = `${normalizedProfile?.templateId || ""}\u0000${normalizedProfile?.itemCode || ""}`;
        if (seenKeys.has(key)) errors.push(`Perfil duplicado para ${normalizedProfile?.templateId}/${normalizedProfile?.itemCode}.`);
        seenKeys.add(key);
        const template = templateById.get(normalizedProfile?.templateId);
        if (!template) errors.push(`O perfil ${index + 1} aponta para template inexistente.`);
        const itemExists = template?.groups.some((group) => group.items.some((item) => item.code === normalizedProfile?.itemCode));
        if (template && !itemExists) errors.push(`O perfil ${index + 1} aponta para itemCode inexistente.`);
    });
    return errors;
}

export function validateBackupPayload(payload) {
    const normalizedPayload = normalizeBackupPayload(payload);
    if (!normalizedPayload) return { isValid: false, error: "Arquivo inválido.", errors: ["Arquivo inválido."] };
    const errors = [];
    if (normalizedPayload.appName !== appName) errors.push("Este JSON não parece ser um backup da Casa da Praça.");
    if (!supportedSchemaVersions.has(normalizedPayload.schemaVersion)) {
        errors.push(`Versão de backup não suportada: ${payload?.schemaVersion ?? "ausente"}.`);
    }
    if (!Array.isArray(getBackupCatalog(payload)) || !Array.isArray(getBackupHistory(payload))) {
        errors.push("Backup sem estrutura mínima de catálogo e histórico.");
    }
    if (!Array.isArray(getBackupCustomUnits(payload))) errors.push("Backup sem lista válida de unidades personalizadas.");
    if (normalizedPayload.schemaVersion === BACKUP_SCHEMA_VERSION) {
        errors.push(...collectSchema2Errors(payload, normalizedPayload));
    }
    return { isValid: errors.length === 0, error: errors[0] || "", errors, payload: errors.length ? null : normalizedPayload };
}

export function previewBackupPayload(payload) {
    const validation = validateBackupPayload(payload);
    if (!validation.isValid) return { isValid: false, error: validation.error };
    const normalizedPayload = validation.payload;
    return {
        isValid: true,
        error: "",
        exportedAt: normalizedPayload.exportedAt,
        schemaVersion: normalizedPayload.schemaVersion,
        catalogCount: normalizedPayload.catalogItems.length,
        historyCount: normalizedPayload.countingHistory.length,
        customUnitsCount: normalizedPayload.customUnits.length,
        templateCount: normalizedPayload.countTemplates?.length || 0,
        itemUnitSettingsCount: normalizedPayload.itemUnitSettings?.length || 0,
        preservesLocalUnitConfiguration: normalizedPayload.preservesLocalUnitConfiguration,
        hasDraft: normalizedPayload.includesActiveDraft
    };
}

export function mergeCountingHistory(currentHistory, importedHistory) {
    const historyById = new Map();
    [...currentHistory, ...importedHistory].map(normalizeHistoryEntry).filter(Boolean)
        .forEach((entry) => historyById.set(entry.id, entry));
    return [...historyById.values()]
        .sort((firstEntry, secondEntry) => new Date(secondEntry.finishedAt) - new Date(firstEntry.finishedAt));
}

function mergeCustomUnitLists(currentUnits, importedUnits) {
    const unitsById = new Map(normalizeCustomUnits(currentUnits).map((unit) => [unit.id, unit]));
    normalizeCustomUnits(importedUnits).forEach((unit) => unitsById.set(unit.id, unit));
    return [...unitsById.values()];
}

export function buildBackupRestorePlan({ payload, currentState, mode } = {}) {
    const validation = validateBackupPayload(payload);
    if (!validation.isValid) return { isValid: false, error: validation.error, errors: validation.errors };
    if (!restoreModes.has(mode)) return { isValid: false, error: "Modo de restauração inválido.", errors: ["Modo de restauração inválido."] };
    const backup = validation.payload;
    const nextState = {
        catalogItems: clone(currentState.catalogItems || []),
        countingHistory: clone(currentState.countingHistory || []),
        customUnits: clone(currentState.customUnits || []),
        countTemplates: clone(currentState.countTemplates || []),
        itemUnitSettings: clone(currentState.itemUnitSettings || [])
    };
    const writeFields = [];
    if (mode === "merge-history") {
        nextState.countingHistory = mergeCountingHistory(nextState.countingHistory, backup.countingHistory);
        nextState.customUnits = mergeCustomUnitLists(nextState.customUnits, backup.customUnits);
        writeFields.push("countingHistory", "customUnits");
    } else if (mode === "replace-catalog") {
        nextState.catalogItems = backup.catalogItems;
        nextState.customUnits = mergeCustomUnitLists(nextState.customUnits, backup.customUnits);
        writeFields.push("catalogItems", "customUnits");
    } else {
        nextState.catalogItems = backup.catalogItems;
        nextState.countingHistory = backup.countingHistory;
        nextState.customUnits = backup.customUnits;
        writeFields.push("catalogItems", "countingHistory", "customUnits");
        if (backup.schemaVersion === BACKUP_SCHEMA_VERSION) {
            nextState.countTemplates = backup.countTemplates;
            nextState.itemUnitSettings = backup.itemUnitSettings;
            writeFields.push("countTemplates", "itemUnitSettings");
        }
    }
    return { isValid: true, error: "", backup, mode, nextState, writeFields };
}
