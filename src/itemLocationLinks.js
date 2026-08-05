import { getTemplateCountAreas } from "./countPreparation.js";
import { getLocationPath, normalizeLocationNodes } from "./locationNodes.js";

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeArea(value) {
    return normalizeText(value).toLocaleUpperCase("pt-BR") || null;
}

function normalizePath(value) {
    if (Array.isArray(value)) {
        return value.map(normalizeText).filter(Boolean);
    }

    const path = normalizeText(value);
    return path ? [path] : [];
}

function normalizeTimestamp(value, fallback) {
    const date = new Date(value);
    return value && !Number.isNaN(date.getTime()) ? date.toISOString() : fallback;
}

export function normalizeItemLocationLink(link, timestamp = new Date().toISOString()) {
    if (!link || typeof link !== "object" || Array.isArray(link)) {
        return null;
    }

    const createdAt = normalizeTimestamp(link.createdAt, timestamp);
    const numericOrder = Number(link.order);

    return {
        id: normalizeText(link.id),
        templateId: normalizeText(link.templateId),
        itemCode: normalizeText(link.itemCode),
        itemNameSnapshot: normalizeText(link.itemNameSnapshot),
        groupId: normalizeText(link.groupId),
        groupNameSnapshot: normalizeText(link.groupNameSnapshot),
        locationId: normalizeText(link.locationId),
        locationPathSnapshot: normalizePath(link.locationPathSnapshot),
        reportArea: normalizeArea(link.reportArea),
        order: Number.isFinite(numericOrder) ? numericOrder : 0,
        active: link.active !== false,
        createdAt,
        updatedAt: normalizeTimestamp(link.updatedAt, createdAt)
    };
}

export function normalizeItemLocationLinks(links) {
    if (!Array.isArray(links)) {
        return [];
    }

    return links.map((link) => normalizeItemLocationLink(link)).filter((link) => link?.id);
}

export function findTemplateItem(template, itemCode) {
    const normalizedCode = normalizeText(itemCode);

    for (const group of template?.groups || []) {
        const item = (group.items || []).find((candidate) => normalizeText(candidate.code) === normalizedCode);

        if (item) {
            return { group, item };
        }
    }

    return null;
}

function normalizePhysicalAreas(values) {
    if (!Array.isArray(values)) {
        return [];
    }

    return [...new Set(values.map(normalizeArea).filter((area) => area && area !== "TOTAL"))];
}

export function getItemReportAreas(template, itemCode) {
    const match = findTemplateItem(template, itemCode);

    if (!match) {
        return [];
    }

    const itemAreas = normalizePhysicalAreas(match.item.countAreas);
    const groupAreas = normalizePhysicalAreas(match.group.countAreas);

    if (itemAreas.length > 0) {
        return itemAreas;
    }

    return groupAreas.length > 0 ? groupAreas : getTemplateCountAreas(template);
}

export function getItemLocationWarnings(template, itemCode, location) {
    if (!location) {
        return [];
    }

    const warnings = [];
    const itemAreas = getItemReportAreas(template, itemCode);

    if (!location.reportArea) {
        warnings.push("Este local não possui área de relatório para uma futura consolidação.");
    } else if (itemAreas.length > 0 && !itemAreas.includes(normalizeArea(location.reportArea))) {
        warnings.push(`A área ${location.reportArea} não aparece entre as áreas deste item ou grupo.`);
    }

    if (!location.active) {
        warnings.push("Este local físico está inativo.");
    }

    return warnings;
}

function hasValidOrder(link) {
    return Object.prototype.hasOwnProperty.call(link || {}, "order")
        && link.order !== null
        && link.order !== ""
        && Number.isFinite(Number(link.order));
}

function hasDuplicateLink(candidate, existingLinks) {
    return existingLinks.some((link) => (
        link.id !== candidate.id
        && link.templateId === candidate.templateId
        && link.itemCode === candidate.itemCode
        && link.locationId === candidate.locationId
    ));
}

function collectLinkErrors(candidate, sourceLink, template, itemMatch, location, existingLinks) {
    const errors = [];

    if (!candidate?.id) {
        errors.push("O vínculo precisa ter um identificador.");
    }

    if (!template) {
        errors.push("O template selecionado não existe neste dispositivo.");
    }

    if (!candidate?.itemCode) {
        errors.push("Selecione um item do template.");
    }

    if (template && !itemMatch) {
        errors.push("O item não existe no template selecionado.");
    }

    if (!candidate?.locationId) {
        errors.push("Selecione um local físico.");
    }

    if (candidate?.locationId && !location) {
        errors.push("O local físico selecionado não existe.");
    }

    if (!hasValidOrder(sourceLink)) {
        errors.push("A ordem do vínculo precisa ser numérica.");
    }

    if (candidate && hasDuplicateLink(candidate, existingLinks)) {
        errors.push("Este item já está vinculado ao local selecionado.");
    }

    return errors;
}

function buildValidatedLink(candidate, template, itemMatch, location, locations) {
    const locationPath = getLocationPath(location.id, locations);

    return {
        ...candidate,
        templateId: template.id,
        itemCode: normalizeText(itemMatch.item.code),
        itemNameSnapshot: normalizeText(itemMatch.item.name),
        groupId: normalizeText(itemMatch.group.id),
        groupNameSnapshot: normalizeText(itemMatch.group.name),
        locationId: location.id,
        locationPathSnapshot: locationPath.map((node) => node.name),
        reportArea: location.reportArea || null
    };
}

export function validateItemLocationLink(link, templates = [], locations = [], existingLinks = []) {
    const candidate = normalizeItemLocationLink(link);
    const normalizedLocations = normalizeLocationNodes(locations);
    const template = templates.find((item) => item.id === candidate?.templateId) || null;
    const itemMatch = template ? findTemplateItem(template, candidate?.itemCode) : null;
    const baseLocation = normalizedLocations.find((item) => item.id === candidate?.locationId) || null;
    const location = baseLocation || null;
    const normalizedExistingLinks = normalizeItemLocationLinks(existingLinks);
    const errors = collectLinkErrors(candidate, link, template, itemMatch, location, normalizedExistingLinks);

    return {
        isValid: errors.length === 0,
        error: errors[0] || "",
        errors,
        link: errors.length === 0
            ? buildValidatedLink(candidate, template, itemMatch, location, normalizedLocations)
            : null
    };
}

function compareLinks(firstLink, secondLink) {
    return firstLink.order - secondLink.order
        || firstLink.itemNameSnapshot.localeCompare(secondLink.itemNameSnapshot, "pt-BR");
}

export function buildLocationItemMap(template, locations, links) {
    const normalizedLocations = normalizeLocationNodes(locations);
    const templateLinks = normalizeItemLocationLinks(links).filter((link) => link.templateId === template?.id);
    const result = new Map();

    normalizedLocations.forEach((location) => {
        const locationLinks = templateLinks.filter((link) => link.locationId === location.id).sort(compareLinks);
        result.set(location.id, {
            location,
            locationPath: getLocationPath(location.id, normalizedLocations).map((node) => node.name),
            links: locationLinks
        });
    });

    return result;
}

export function summarizeItemLocationLinks(templates, locations, links) {
    const normalizedLinks = normalizeItemLocationLinks(links);
    const normalizedLocations = normalizeLocationNodes(locations);
    const templateIds = new Set((templates || []).map((template) => template.id));
    const locationIds = new Set(normalizedLocations.map((location) => location.id));

    return {
        total: normalizedLinks.length,
        active: normalizedLinks.filter((link) => link.active).length,
        inactive: normalizedLinks.filter((link) => !link.active).length,
        linkedItems: new Set(normalizedLinks.map((link) => `${link.templateId}:${link.itemCode}`)).size,
        linkedLocations: new Set(normalizedLinks.map((link) => link.locationId)).size,
        orphanTemplates: normalizedLinks.filter((link) => !templateIds.has(link.templateId)).length,
        orphanLocations: normalizedLinks.filter((link) => !locationIds.has(link.locationId)).length,
        locationsWithoutArea: normalizedLinks.filter((link) => !link.reportArea).length
    };
}
