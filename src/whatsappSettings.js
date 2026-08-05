function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeMessage(value) {
    return String(value ?? "").trim();
}

export function normalizeWhatsappNumber(value) {
    return String(value ?? "").replace(/\D/g, "");
}

export function normalizeWhatsappSettings(settings = {}) {
    const sourceSettings = settings && typeof settings === "object" && !Array.isArray(settings)
        ? settings
        : {};

    return {
        recipientName: normalizeText(sourceSettings.recipientName),
        whatsappNumberRaw: normalizeText(sourceSettings.whatsappNumberRaw),
        whatsappNumberNormalized: normalizeWhatsappNumber(sourceSettings.whatsappNumberRaw),
        defaultMessage: normalizeMessage(sourceSettings.defaultMessage),
        updatedAt: normalizeText(sourceSettings.updatedAt) || null
    };
}

export function validateWhatsappSettings(settings) {
    const normalizedSettings = normalizeWhatsappSettings(settings);
    const warnings = [];

    if (!normalizedSettings.whatsappNumberNormalized) {
        warnings.push("O número está vazio. Esta configuração é opcional.");
    } else if (normalizedSettings.whatsappNumberNormalized.length < 8) {
        warnings.push("O número parece curto. Confira país, DDD e telefone.");
    }

    return { settings: normalizedSettings, warnings };
}

export function isWhatsappConfigured(settings) {
    return Boolean(normalizeWhatsappSettings(settings).whatsappNumberNormalized);
}
