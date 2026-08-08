import { normalizeUnitAlias } from "./itemUnitSettings.js";

const maximumFractionDigits = 12;

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function greatestCommonDivisor(firstValue, secondValue) {
    let first = firstValue < 0n ? -firstValue : firstValue;
    let second = secondValue < 0n ? -secondValue : secondValue;
    while (second !== 0n) {
        const remainder = first % second;
        first = second;
        second = remainder;
    }
    return first || 1n;
}

function createRational(numerator, denominator = 1n) {
    if (denominator === 0n) return null;
    const sign = denominator < 0n ? -1n : 1n;
    const divisor = greatestCommonDivisor(numerator, denominator);
    return {
        numerator: (numerator / divisor) * sign,
        denominator: (denominator / divisor) * sign
    };
}

function parseDecimal(value) {
    const decimal = normalizeText(value).replace(",", ".");
    if (!/^\d+(?:\.\d+)?$/.test(decimal)) return null;
    const [integerPart, fractionPart = ""] = decimal.split(".");
    const denominator = 10n ** BigInt(fractionPart.length);
    return createRational(BigInt(`${integerPart}${fractionPart}`), denominator);
}

function multiplyRationals(firstValue, secondValue) {
    return createRational(
        firstValue.numerator * secondValue.numerator,
        firstValue.denominator * secondValue.denominator
    );
}

function divideRationals(firstValue, secondValue) {
    if (secondValue.numerator === 0n) return null;
    return createRational(
        firstValue.numerator * secondValue.denominator,
        firstValue.denominator * secondValue.numerator
    );
}

function addRationals(firstValue, secondValue) {
    return createRational(
        firstValue.numerator * secondValue.denominator + secondValue.numerator * firstValue.denominator,
        firstValue.denominator * secondValue.denominator
    );
}

function formatScaledInteger(value, scale) {
    const padded = value.toString().padStart(scale + 1, "0");
    const integerPart = scale ? padded.slice(0, -scale) : padded;
    const fractionPart = scale ? padded.slice(-scale).replace(/0+$/, "") : "";
    return fractionPart ? `${integerPart}.${fractionPart}` : integerPart;
}

function formatRational(value, fractionDigits = maximumFractionDigits) {
    if (!value) return "";
    const scale = 10n ** BigInt(fractionDigits);
    const absoluteNumerator = value.numerator < 0n ? -value.numerator : value.numerator;
    const scaledNumerator = absoluteNumerator * scale;
    let roundedValue = scaledNumerator / value.denominator;
    if ((scaledNumerator % value.denominator) * 2n >= value.denominator) roundedValue += 1n;
    const sign = value.numerator < 0n ? "-" : "";
    return `${sign}${formatScaledInteger(roundedValue, fractionDigits)}`;
}

function normalizeLabel(value) {
    return normalizeText(value).toLocaleLowerCase("pt-BR");
}

export function findAllowedUnit(profile, rawUnitOrNormalizedUnit) {
    const requestedLabel = normalizeLabel(rawUnitOrNormalizedUnit);
    const allowedUnits = profile?.allowedUnits || [];
    const exactMatch = allowedUnits.find((unit) => normalizeLabel(unit.label) === requestedLabel);
    if (exactMatch) return exactMatch;
    const normalizedUnit = normalizeUnitAlias(rawUnitOrNormalizedUnit);
    const legacyMatches = allowedUnits.filter((unit) => (unit.legacyLabels || []).some(
        (label) => normalizeUnitAlias(label) === normalizedUnit
    ));
    // Um alias legado só é seguro quando aponta para uma única apresentação do produto.
    if (legacyMatches.length === 1) return legacyMatches[0];
    const normalizedLabelMatch = allowedUnits.find((unit) => normalizeUnitAlias(unit.label) === normalizedUnit);
    if (normalizedLabelMatch) return normalizedLabelMatch;
    return allowedUnits.find((unit) => normalizeUnitAlias(unit.normalizedUnit) === normalizedUnit) || null;
}

function getPortionWeight(profile) {
    return (profile?.allowedUnits || []).find((unit) => unit.portionWeightGrams)?.portionWeightGrams || null;
}

function convertPortionQuantity(quantity, allowedUnit, profile) {
    if (normalizeUnitAlias(profile.baseUnit) !== "porção") return null;
    const normalizedUnit = normalizeUnitAlias(allowedUnit.normalizedUnit);
    if (normalizedUnit === "porção") return quantity;
    if (!new Set(["g", "kg"]).has(normalizedUnit)) return null;
    const portionWeight = parseDecimal(getPortionWeight(profile));
    if (!portionWeight) return null;
    const quantityInGrams = normalizedUnit === "kg"
        ? multiplyRationals(quantity, parseDecimal("1000"))
        : quantity;
    return divideRationals(quantityInGrams, portionWeight);
}

function createFailedConversion(code, reason, allowedUnit = null, baseUnit = "") {
    return {
        isConvertible: false,
        code,
        reason,
        allowedUnit,
        baseUnit,
        convertedValue: null,
        convertedQuantityDecimal: null
    };
}

export function convertQuantityToBase(quantityDecimal, allowedUnit, profile) {
    const quantity = parseDecimal(quantityDecimal);
    const baseUnit = normalizeUnitAlias(profile?.baseUnit);
    if (!quantity) return createFailedConversion("invalid_quantity", "Quantidade inválida para conversão.", allowedUnit, baseUnit);
    if (!allowedUnit || !baseUnit) return createFailedConversion("missing_profile", "Perfil de conversão indisponível.", allowedUnit, baseUnit);

    const normalizedUnit = normalizeUnitAlias(allowedUnit.normalizedUnit);
    const portionValue = convertPortionQuantity(quantity, allowedUnit, profile);
    let convertedValue = portionValue;
    if (!convertedValue && normalizedUnit === baseUnit) convertedValue = quantity;
    if (!convertedValue && allowedUnit.factorToBase) {
        const factor = parseDecimal(allowedUnit.factorToBase);
        if (factor) convertedValue = multiplyRationals(quantity, factor);
    }
    if (!convertedValue) {
        return createFailedConversion("missing_factor", "Unidade sem conversão definida.", allowedUnit, baseUnit);
    }
    return {
        isConvertible: true,
        code: "converted",
        reason: "",
        allowedUnit,
        baseUnit,
        convertedValue,
        convertedQuantityDecimal: formatRational(convertedValue)
    };
}

export function convertEntryToBase(entry, profile) {
    if (!profile?.baseUnit || !profile.allowedUnits?.length) {
        return createFailedConversion("missing_profile", "Item sem perfil de conversão.");
    }
    const requestedUnit = entry?.rawUnit || entry?.normalizedUnit;
    if (!requestedUnit) return createFailedConversion("missing_unit", "Entrada sem unidade.", null, profile.baseUnit);
    const allowedUnit = findAllowedUnit(profile, requestedUnit);
    if (!allowedUnit) {
        return createFailedConversion("unit_not_allowed", "Unidade fora do perfil; conversão não definida.", null, profile.baseUnit);
    }
    return convertQuantityToBase(entry.quantityDecimal, allowedUnit, profile);
}

export function formatConvertedQuantity(value, baseUnit) {
    const decimalValue = typeof value === "string" ? value : formatRational(value);
    if (!decimalValue) return "";
    const normalizedBase = normalizeUnitAlias(baseUnit);
    const unitLabel = normalizedBase === "porção" && decimalValue !== "1" ? "porções" : normalizedBase;
    return `${decimalValue} ${unitLabel}`.trim();
}

export function explainConversion(entry, profile) {
    const conversion = convertEntryToBase(entry, profile);
    if (!conversion.isConvertible) return conversion.reason;
    return `equivale a ${formatConvertedQuantity(conversion.convertedValue, conversion.baseUnit)}`;
}

export function summarizeConvertedEntries(entries, profile) {
    const activeEntries = (entries || []).filter((entry) => entry.active !== false);
    const conversions = activeEntries.map((entry) => ({ entry, conversion: convertEntryToBase(entry, profile) }));
    const converted = conversions.filter((result) => result.conversion.isConvertible);
    const totalConvertedValue = converted.reduce(
        (total, result) => addRationals(total, result.conversion.convertedValue),
        createRational(0n)
    );
    return {
        conversions,
        activeEntryCount: activeEntries.length,
        convertibleEntryCount: converted.length,
        unconvertibleEntryCount: activeEntries.length - converted.length,
        isComplete: activeEntries.length > 0 && converted.length === activeEntries.length,
        baseUnit: normalizeUnitAlias(profile?.baseUnit),
        totalConvertedValue: converted.length ? totalConvertedValue : null,
        totalConvertedDecimal: converted.length ? formatRational(totalConvertedValue) : null
    };
}

export function formatPortionBreakdown(value) {
    if (!value || value.denominator === 1n) return "";
    const completePortions = value.numerator / value.denominator;
    if (completePortions <= 0n) return "";
    const remainder = createRational(value.numerator % value.denominator, value.denominator);
    const completeLabel = completePortions === 1n ? "porção completa" : "porções completas";
    return `${completePortions} ${completeLabel} + ${formatRational(remainder)} porção`;
}
