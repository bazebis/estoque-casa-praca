function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeStringList(values) {
    if (!Array.isArray(values)) {
        return [];
    }

    return [...new Set(values.map(normalizeText).filter(Boolean))];
}

function hasOwnValue(object, fieldName) {
    return Object.prototype.hasOwnProperty.call(object, fieldName)
        && normalizeText(object[fieldName]);
}

function collectItemErrors(item, groupIndex, itemIndex) {
    const itemLabel = `Item ${itemIndex + 1} do grupo ${groupIndex + 1}`;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
        return [`${itemLabel} precisa ser um objeto.`];
    }

    const errors = [];

    if (!hasOwnValue(item, "code")) {
        errors.push(`${itemLabel} precisa ter código.`);
    }

    if (!hasOwnValue(item, "name")) {
        errors.push(`${itemLabel} precisa ter nome.`);
    }

    if (!Object.prototype.hasOwnProperty.call(item, "order") || !Number.isFinite(Number(item.order))) {
        errors.push(`${itemLabel} precisa ter uma ordem numérica.`);
    }

    return errors;
}

function collectGroupErrors(group, groupIndex) {
    const groupLabel = `Grupo ${groupIndex + 1}`;

    if (!group || typeof group !== "object" || Array.isArray(group)) {
        return [`${groupLabel} precisa ser um objeto.`];
    }

    const errors = [];

    if (!hasOwnValue(group, "id")) {
        errors.push(`${groupLabel} precisa ter identificador.`);
    }

    if (!hasOwnValue(group, "name")) {
        errors.push(`${groupLabel} precisa ter nome.`);
    }

    if (!Array.isArray(group.items)) {
        errors.push(`${groupLabel} precisa ter uma lista de itens.`);
        return errors;
    }

    group.items.forEach((item, itemIndex) => {
        errors.push(...collectItemErrors(item, groupIndex, itemIndex));
    });

    return errors;
}

function collectTemplateErrors(template) {
    if (!template || typeof template !== "object" || Array.isArray(template)) {
        return ["O arquivo precisa conter um objeto JSON de template."];
    }

    const errors = [];

    if (!hasOwnValue(template, "id")) {
        errors.push("O template precisa ter um identificador (id).");
    }

    if (!hasOwnValue(template, "name")) {
        errors.push("O template precisa ter um nome.");
    }

    if (!Array.isArray(template.groups)) {
        errors.push("O template precisa ter uma lista de grupos.");
        return errors;
    }

    if (template.groups.length === 0) {
        errors.push("O template precisa ter pelo menos um grupo.");
        return errors;
    }

    template.groups.forEach((group, groupIndex) => {
        errors.push(...collectGroupErrors(group, groupIndex));
    });

    return errors;
}

function normalizeItem(item) {
    return {
        ...item,
        code: normalizeText(item.code),
        name: normalizeText(item.name),
        order: Number(item.order),
        countAreas: normalizeStringList(item.countAreas)
    };
}

function normalizeGroup(group, groupIndex) {
    const numericOrder = Number(group.order);

    return {
        ...group,
        id: normalizeText(group.id),
        name: normalizeText(group.name),
        order: Number.isFinite(numericOrder) ? numericOrder : groupIndex + 1,
        countAreas: normalizeStringList(group.countAreas),
        totalArea: normalizeText(group.totalArea) || null,
        items: group.items.map(normalizeItem)
    };
}

function appendUniqueAreas(areas, values) {
    normalizeStringList(values).forEach((area) => {
        if (!areas.includes(area)) {
            areas.push(area);
        }
    });
}

function collectTemplateAreas(template) {
    const areas = [];

    (template.groups || []).forEach((group) => {
        appendUniqueAreas(areas, group.countAreas);

        if (normalizeText(group.totalArea)) {
            appendUniqueAreas(areas, [group.totalArea]);
        }

        (group.items || []).forEach((item) => appendUniqueAreas(areas, item.countAreas));
    });
    appendUniqueAreas(areas, template.stats?.areas);

    return areas;
}

export function summarizeCountTemplate(template) {
    const groups = Array.isArray(template?.groups) ? template.groups : [];

    return {
        groupCount: groups.length,
        itemCount: groups.reduce((total, group) => (
            total + (Array.isArray(group.items) ? group.items.length : 0)
        ), 0),
        areas: collectTemplateAreas({ ...template, groups }),
        itemsPerGroup: groups.map((group) => ({
            groupId: normalizeText(group.id),
            groupName: normalizeText(group.name),
            itemCount: Array.isArray(group.items) ? group.items.length : 0
        }))
    };
}

function normalizeValidTemplate(template) {
    const groups = template.groups.map(normalizeGroup);
    const normalizedTemplate = {
        ...template,
        id: normalizeText(template.id),
        name: normalizeText(template.name),
        sourceFile: normalizeText(template.sourceFile),
        generatedAt: normalizeText(template.generatedAt),
        importedAt: normalizeText(template.importedAt),
        importFileName: normalizeText(template.importFileName),
        groups
    };

    return {
        ...normalizedTemplate,
        stats: summarizeCountTemplate(normalizedTemplate)
    };
}

export function validateCountTemplate(template) {
    const errors = collectTemplateErrors(template);

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        template: errors.length === 0 ? normalizeValidTemplate(template) : null
    };
}

export function normalizeCountTemplate(template) {
    return validateCountTemplate(template).template;
}
