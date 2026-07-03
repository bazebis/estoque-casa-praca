const units = [
    { id: "un", label: "Unidade (un)", baseUnit: "un", factor: 1 },
    { id: "kg", label: "Kg", baseUnit: "g", factor: 1000 },
    { id: "g", label: "g", baseUnit: "g", factor: 1 },
    { id: "l", label: "L", baseUnit: "ml", factor: 1000 },
    { id: "ml", label: "mL", baseUnit: "ml", factor: 1 },
    { id: "fardo_6", label: "Fardo 6 un", baseUnit: "un", factor: 6 },
    { id: "fardo_12", label: "Fardo 12 un", baseUnit: "un", factor: 12 },
    { id: "caixa", label: "Caixa", baseUnit: "un", factor: 1 },
    { id: "pacote", label: "Pacote", baseUnit: "un", factor: 1 },
    { id: "garrafa", label: "Garrafa", baseUnit: "un", factor: 1 },
    { id: "lata", label: "Lata", baseUnit: "un", factor: 1 }
];

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

export function getUnits() {
    return [...units];
}

export function getUnitById(unitId) {
    return units.find((unit) => unit.id === unitId) || units[0];
}

export function convertToBase(value, unitId) {
    const numericValue = Number(value);
    const unit = getUnitById(unitId);

    if (!Number.isFinite(numericValue)) {
        return 0;
    }

    return numericValue * unit.factor;
}

export function formatQuantity(value, unitId) {
    const unit = getUnitById(unitId);
    const numericValue = Number(value);
    const safeValue = Number.isFinite(numericValue) ? numericValue : 0;

    return `${safeValue} ${unit.label}`;
}

export function isKnownUnitInput(rawUnit) {
    const normalizedUnit = String(rawUnit || "")
        .trim()
        .toLowerCase();

    return Boolean(unitAliases[normalizedUnit]);
}

export function normalizeUnitId(rawUnit) {
    const normalizedUnit = String(rawUnit || "")
        .trim()
        .toLowerCase();

    return unitAliases[normalizedUnit] || "un";
}
