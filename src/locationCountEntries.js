function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeNotes(value) {
    return String(value ?? "").trim();
}

function normalizeTimestamp(value, fallback = null) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

function normalizeDecimalParts(integerPart, fractionPart = "") {
    const normalizedInteger = integerPart.replace(/^0+(?=\d)/, "") || "0";
    const normalizedFraction = fractionPart.replace(/0+$/, "");
    return normalizedFraction ? `${normalizedInteger}.${normalizedFraction}` : normalizedInteger;
}

export function parseQuantityText(text) {
    const rawText = String(text ?? "");
    const trimmedText = rawText.trim();

    if (trimmedText.length > 80) {
        return { isValid: false, error: "A quantidade informada é longa demais.", quantityDecimal: null };
    }

    if (!/^(?:\d+(?:[.,]\d+)?|[.,]\d+)$/.test(trimmedText)) {
        return { isValid: false, error: "Informe uma quantidade numérica válida.", quantityDecimal: null };
    }

    const normalizedInput = trimmedText.replace(",", ".");
    const [integerPart = "0", fractionPart = ""] = normalizedInput.split(".");
    const quantityDecimal = normalizeDecimalParts(integerPart || "0", fractionPart);

    if (/^0(?:\.0*)?$/.test(quantityDecimal)) {
        return { isValid: false, error: "A quantidade precisa ser maior que zero.", quantityDecimal: null };
    }

    return { isValid: true, error: "", quantityDecimal };
}

export function normalizeUnit(unit) {
    return normalizeText(unit).toLocaleLowerCase("pt-BR");
}

export function normalizeLocationCountEntry(entry, timestamp = new Date().toISOString()) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
    const createdAt = normalizeTimestamp(entry.createdAt, timestamp);

    return {
        id: normalizeText(entry.id),
        sessionId: normalizeText(entry.sessionId),
        templateId: normalizeText(entry.templateId),
        locationId: normalizeText(entry.locationId),
        linkId: normalizeText(entry.linkId),
        itemCode: normalizeText(entry.itemCode),
        itemNameSnapshot: normalizeText(entry.itemNameSnapshot),
        groupId: normalizeText(entry.groupId),
        groupNameSnapshot: normalizeText(entry.groupNameSnapshot),
        reportAreaSnapshot: normalizeText(entry.reportAreaSnapshot).toLocaleUpperCase("pt-BR") || null,
        rawQuantityText: String(entry.rawQuantityText ?? ""),
        quantityDecimal: normalizeText(entry.quantityDecimal),
        rawUnit: normalizeText(entry.rawUnit),
        normalizedUnit: normalizeUnit(entry.rawUnit),
        notes: normalizeNotes(entry.notes),
        active: entry.active !== false,
        createdAt,
        updatedAt: normalizeTimestamp(entry.updatedAt, createdAt),
        removedAt: normalizeTimestamp(entry.removedAt)
    };
}

export function normalizeLocationCountEntries(entries) {
    if (!Array.isArray(entries)) return [];
    return entries.map((entry) => normalizeLocationCountEntry(entry)).filter((entry) => entry?.id);
}

function collectIdentityErrors(entry) {
    const errors = [];
    if (!entry?.id) errors.push("A entrada precisa de um identificador.");
    if (!entry?.sessionId || !entry.templateId || !entry.locationId) {
        errors.push("A entrada precisa identificar sessão, template e local.");
    }
    if (!entry?.linkId || !entry.itemCode || !entry.itemNameSnapshot) {
        errors.push("A entrada precisa identificar o item planejado.");
    }
    if (!entry?.groupId || !entry.groupNameSnapshot) errors.push("A entrada precisa do grupo do item.");
    return errors;
}

export function validateLocationCountEntry(entry) {
    const candidate = normalizeLocationCountEntry(entry);
    const quantity = parseQuantityText(candidate?.quantityDecimal);
    const rawQuantity = parseQuantityText(candidate?.rawQuantityText);
    const errors = [...collectIdentityErrors(candidate)];

    if (!quantity.isValid) errors.push(quantity.error);
    if (!rawQuantity.isValid) errors.push("O texto original da quantidade é inválido.");
    if (quantity.isValid && rawQuantity.isValid && quantity.quantityDecimal !== rawQuantity.quantityDecimal) {
        errors.push("A quantidade normalizada não corresponde ao texto digitado.");
    }
    if (candidate?.rawUnit.length > 60) errors.push("A unidade deve ter no máximo 60 caracteres.");
    if (candidate?.notes.length > 500) errors.push("A observação deve ter no máximo 500 caracteres.");
    if (candidate?.active && candidate.removedAt) errors.push("Uma entrada ativa não pode ter data de remoção.");
    if (candidate && !candidate.active && !candidate.removedAt) errors.push("Uma entrada removida precisa da data de remoção.");

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        entry: errors.length === 0 ? { ...candidate, quantityDecimal: quantity.quantityDecimal } : null
    };
}

function createEntryId() {
    if (globalThis.crypto?.randomUUID) return `location_entry_${globalThis.crypto.randomUUID()}`;
    return `location_entry_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function createLocationCountEntryModel({ session, plannedItem, rawQuantityText, rawUnit = "", notes = "" }) {
    const quantity = parseQuantityText(rawQuantityText);
    if (!quantity.isValid) throw new Error(quantity.error);
    const timestamp = new Date().toISOString();

    return normalizeLocationCountEntry({
        id: createEntryId(),
        sessionId: session.id,
        templateId: session.templateId,
        locationId: session.locationId,
        linkId: plannedItem.linkId,
        itemCode: plannedItem.itemCode,
        itemNameSnapshot: plannedItem.itemNameSnapshot,
        groupId: plannedItem.groupId,
        groupNameSnapshot: plannedItem.groupNameSnapshot,
        reportAreaSnapshot: session.reportAreaSnapshot,
        rawQuantityText: String(rawQuantityText),
        quantityDecimal: quantity.quantityDecimal,
        rawUnit,
        notes,
        active: true,
        createdAt: timestamp,
        updatedAt: timestamp,
        removedAt: null
    }, timestamp);
}

function getDecimalParts(value) {
    const [integerPart, fractionPart = ""] = value.split(".");
    return { integerPart, fractionPart, scale: fractionPart.length };
}

function sumDecimalStrings(values) {
    const parts = values.map(getDecimalParts);
    const scale = Math.max(0, ...parts.map((part) => part.scale));
    const total = parts.reduce((sum, part) => {
        const digits = `${part.integerPart}${part.fractionPart.padEnd(scale, "0")}`;
        return sum + BigInt(digits);
    }, 0n);
    const padded = total.toString().padStart(scale + 1, "0");
    const integerPart = scale ? padded.slice(0, -scale) : padded;
    const fractionPart = scale ? padded.slice(-scale) : "";
    return normalizeDecimalParts(integerPart, fractionPart);
}

function summarizeItemEntries(itemEntries) {
    const activeEntries = itemEntries.filter((entry) => entry.active);
    const normalizedUnits = new Set(activeEntries.map((entry) => entry.normalizedUnit));
    const hasMixedUnits = normalizedUnits.size > 1;

    return {
        entries: itemEntries,
        activeEntries,
        removedEntryCount: itemEntries.length - activeEntries.length,
        hasMixedUnits,
        subtotal: activeEntries.length > 0 && !hasMixedUnits
            ? sumDecimalStrings(activeEntries.map((entry) => entry.quantityDecimal))
            : null,
        normalizedUnit: hasMixedUnits ? null : activeEntries[0]?.normalizedUnit ?? ""
    };
}

export function summarizeEntriesByItem(entries) {
    const entriesByItem = new Map();
    normalizeLocationCountEntries(entries).forEach((entry) => {
        const itemEntries = entriesByItem.get(entry.itemCode) || [];
        entriesByItem.set(entry.itemCode, [...itemEntries, entry]);
    });

    return new Map([...entriesByItem.entries()].map(([itemCode, itemEntries]) => (
        [itemCode, summarizeItemEntries(itemEntries)]
    )));
}

export function summarizeSessionProgress(session, entries) {
    const activeEntries = normalizeLocationCountEntries(entries).filter((entry) => (
        entry.active && entry.sessionId === session?.id
    ));
    const plannedItemCodes = new Set((session?.plannedItems || []).map((item) => item.itemCode));
    const countedItemCodes = new Set(activeEntries
        .filter((entry) => plannedItemCodes.has(entry.itemCode))
        .map((entry) => entry.itemCode));
    const totalItems = session?.plannedItemCount || plannedItemCodes.size;

    return {
        totalItems,
        countedItems: countedItemCodes.size,
        activeEntryCount: activeEntries.length,
        progressPercent: totalItems > 0 ? Math.round((countedItemCodes.size / totalItems) * 100) : 0
    };
}
