const systemUnits = [
    { id: "un", label: "Unidade (un)", baseUnit: "un", factor: 1, active: true, custom: false },
    { id: "kg", label: "Kg", baseUnit: "g", factor: 1000, active: true, custom: false },
    { id: "g", label: "g", baseUnit: "g", factor: 1, active: true, custom: false },
    { id: "l", label: "L", baseUnit: "ml", factor: 1000, active: true, custom: false },
    { id: "ml", label: "mL", baseUnit: "ml", factor: 1, active: true, custom: false },
    { id: "fardo_6", label: "Fardo 6 un", baseUnit: "un", factor: 6, active: true, custom: false },
    { id: "fardo_12", label: "Fardo 12 un", baseUnit: "un", factor: 12, active: true, custom: false },
    { id: "caixa", label: "Caixa", baseUnit: "un", factor: 1, active: true, custom: false },
    { id: "pacote", label: "Pacote", baseUnit: "un", factor: 1, active: true, custom: false },
    { id: "garrafa", label: "Garrafa", baseUnit: "un", factor: 1, active: true, custom: false },
    { id: "lata", label: "Lata", baseUnit: "un", factor: 1, active: true, custom: false }
];

const baseUnits = ["un", "g", "ml"];

const unitAliases = {
    unidade: "un",
    unidades: "un",
    un: "un",
    "unidade (un)": "un",
    fardos: "fardo_6",
    fardo: "fardo_6",
    "fardos 6 un": "fardo_6",
    "fardos 6un": "fardo_6",
    "fardo 6 un": "fardo_6",
    "fardo 6un": "fardo_6",
    fardo_6: "fardo_6",
    "fardos 12 un": "fardo_12",
    "fardos 12un": "fardo_12",
    "fardo 12 un": "fardo_12",
    "fardo 12un": "fardo_12",
    fardo_12: "fardo_12",
    kg: "kg",
    g: "g",
    l: "l",
    litro: "l",
    litros: "l",
    ml: "ml",
    caixa: "caixa",
    pacote: "pacote",
    garrafa: "garrafa",
    lata: "lata"
};

let customUnits = [];

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
    return String(value || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
}

function normalizeIdText(value) {
    return normalizeText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");
}

function createCustomUnitId(label, existingIds) {
    const baseId = `custom_${normalizeIdText(label) || "unidade"}`;

    if (!existingIds.has(baseId)) {
        return baseId;
    }

    return `${baseId}_${Date.now()}`;
}

function isValidBaseUnit(baseUnit) {
    return baseUnits.includes(baseUnit);
}

function sanitizeCustomUnit(unit, index = 0) {
    const label = String(unit?.label || "").trim();
    const baseUnit = String(unit?.baseUnit || "").trim().toLowerCase();
    const factor = Number(unit?.factor);
    const id = String(unit?.id || `custom_unidade_${index}`).trim();

    if (!id || !label || !isValidBaseUnit(baseUnit) || !Number.isFinite(factor) || factor <= 0) {
        return null;
    }

    if (systemUnits.some((systemUnit) => systemUnit.id === id)) {
        return null;
    }

    return {
        id,
        label,
        baseUnit,
        factor,
        active: unit.active !== false,
        custom: true
    };
}

function getUnitMatch(rawUnit) {
    const normalizedUnit = normalizeText(rawUnit);

    if (!normalizedUnit) {
        return null;
    }

    const aliasId = unitAliases[normalizedUnit];

    if (aliasId) {
        return getAllUnits().find((unit) => unit.id === aliasId) || null;
    }

    return getAllUnits().find((unit) => (
        normalizeText(unit.id) === normalizedUnit ||
        normalizeText(unit.label) === normalizedUnit
    )) || null;
}

function hasUnitReferenceInEntries(unitId, entriesByItemId = {}) {
    return Object.values(entriesByItemId).some((entries) => (
        Array.isArray(entries) &&
        entries.some((entry) => entry.unitId === unitId || entry.unitSnapshot?.unitId === unitId)
    ));
}

function hasUnitReferenceInSummaries(unitId, summaries = []) {
    return summaries.some((summary) => (
        summary.item?.unitId === unitId ||
        summary.entries?.some((entry) => entry.unitId === unitId || entry.unitSnapshot?.unitId === unitId)
    ));
}

export function getSystemUnits() {
    return clone(systemUnits);
}

export function getBaseUnits() {
    return [...baseUnits];
}

export function normalizeCustomUnits(units) {
    if (!Array.isArray(units)) {
        return [];
    }

    const usedIds = new Set(systemUnits.map((unit) => unit.id));

    return units
        .map(sanitizeCustomUnit)
        .filter(Boolean)
        .filter((unit) => {
            if (usedIds.has(unit.id)) {
                return false;
            }

            usedIds.add(unit.id);
            return true;
        });
}

export function setCustomUnits(units) {
    customUnits = normalizeCustomUnits(units);
    return getCustomUnits();
}

export function getCustomUnits() {
    return clone(customUnits);
}

export function getAllUnits() {
    return [...getSystemUnits(), ...getCustomUnits()];
}

export function getActiveUnits() {
    return getAllUnits().filter((unit) => unit.active !== false);
}

export function getUnits() {
    return getAllUnits();
}

export function getUnitById(unitId) {
    return getAllUnits().find((unit) => unit.id === unitId) || systemUnits[0];
}

export function createUnitSnapshot(unitId) {
    const unit = getUnitById(unitId);

    return {
        unitId: unit.id,
        unitLabel: unit.label,
        baseUnit: unit.baseUnit,
        factor: unit.factor
    };
}

export function resolveUnitSnapshot(unitId, snapshot = null) {
    const factor = Number(snapshot?.factor);

    if (
        snapshot &&
        snapshot.unitId &&
        snapshot.unitLabel &&
        snapshot.baseUnit &&
        Number.isFinite(factor) &&
        factor > 0
    ) {
        return {
            unitId: snapshot.unitId,
            unitLabel: snapshot.unitLabel,
            baseUnit: snapshot.baseUnit,
            factor
        };
    }

    return createUnitSnapshot(unitId);
}

export function convertToBase(value, unitId, snapshot = null) {
    const numericValue = Number(value);
    const unitSnapshot = resolveUnitSnapshot(unitId, snapshot);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return numericValue * unitSnapshot.factor;
}

export function formatQuantity(value, unitId, snapshot = null) {
    const unitSnapshot = resolveUnitSnapshot(unitId, snapshot);
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

    return `${safeValue} ${unitSnapshot.unitLabel}`;
}

export function isKnownUnitInput(rawUnit) {
    return Boolean(getUnitMatch(rawUnit));
}

export function normalizeUnitId(rawUnit) {
    return getUnitMatch(rawUnit)?.id || "un";
}

export function createCustomUnit(values) {
    const label = String(values?.label || "").trim();
    const baseUnit = String(values?.baseUnit || "").trim().toLowerCase();
    const factor = Number(values?.factor);

    if (!label) {
        return { unit: null, error: "Informe o nome da unidade." };
    }

    if (!isValidBaseUnit(baseUnit)) {
        return { unit: null, error: "Selecione uma unidade base válida." };
    }

    if (!Number.isFinite(factor) || factor <= 0) {
        return { unit: null, error: "Informe um fator maior que zero." };
    }

    const existingIds = new Set(getAllUnits().map((unit) => unit.id));
    const unit = {
        id: createCustomUnitId(label, existingIds),
        label,
        baseUnit,
        factor,
        active: true,
        custom: true
    };

    return { unit, error: "" };
}

export function updateCustomUnitList(units, unitId, values) {
    const customUnitList = normalizeCustomUnits(units);
    const unitExists = customUnitList.some((unit) => unit.id === unitId);

    if (!unitExists) {
        return { units: customUnitList, error: "Unidade personalizada não encontrada." };
    }

    const label = String(values?.label || "").trim();
    const baseUnit = String(values?.baseUnit || "").trim().toLowerCase();
    const factor = Number(values?.factor);

    if (!label) {
        return { units: customUnitList, error: "Informe o nome da unidade." };
    }

    if (!isValidBaseUnit(baseUnit)) {
        return { units: customUnitList, error: "Selecione uma unidade base válida." };
    }

    if (!Number.isFinite(factor) || factor <= 0) {
        return { units: customUnitList, error: "Informe um fator maior que zero." };
    }

    return {
        units: customUnitList.map((unit) => {
            if (unit.id !== unitId) {
                return unit;
            }

            return {
                ...unit,
                label,
                baseUnit,
                factor,
                active: values.active !== false
            };
        }),
        error: ""
    };
}

export function isUnitInUse(unitId, data = {}) {
    const catalogItems = Array.isArray(data.catalogItems) ? data.catalogItems : [];
    const history = Array.isArray(data.history) ? data.history : [];
    const draft = data.draft || null;

    return (
        catalogItems.some((item) => item.unitId === unitId) ||
        hasUnitReferenceInEntries(unitId, draft?.entriesByItemId) ||
        history.some((entry) => (
            entry.items?.some((item) => item.unitId === unitId) ||
            hasUnitReferenceInEntries(unitId, entry.entriesByItemId) ||
            hasUnitReferenceInSummaries(unitId, entry.summaries)
        ))
    );
}
