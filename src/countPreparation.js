import { summarizeCountTemplate } from "./countTemplates.js";
import { getLocationPath, normalizeLocationNodes } from "./locationNodes.js";

const nonPhysicalAreas = new Set(["TOTAL"]);

function normalizeArea(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleUpperCase("pt-BR");
}

function normalizeAreas(values) {
    if (!Array.isArray(values)) {
        return [];
    }

    return [...new Set(values.map(normalizeArea).filter((area) => area && !nonPhysicalAreas.has(area)))];
}

function getGroupCountAreas(group) {
    const groupAreas = normalizeAreas(group?.countAreas);

    if (groupAreas.length > 0) {
        return groupAreas;
    }

    return normalizeAreas((group?.items || []).flatMap((item) => item.countAreas || []));
}

export function getTemplateCountAreas(template) {
    const groupAreas = normalizeAreas((template?.groups || []).flatMap(getGroupCountAreas));

    if (groupAreas.length > 0) {
        return groupAreas;
    }

    return normalizeAreas(template?.stats?.areas);
}

function getGroupItemsForArea(group, area) {
    const groupAreas = getGroupCountAreas(group);

    return (group?.items || []).filter((item) => {
        const itemAreas = normalizeAreas(item.countAreas);
        return itemAreas.length > 0 ? itemAreas.includes(area) : groupAreas.includes(area);
    });
}

function summarizeGroupForArea(group, area) {
    const items = getGroupItemsForArea(group, area);

    if (!getGroupCountAreas(group).includes(area) && items.length === 0) {
        return null;
    }

    return {
        id: String(group.id || ""),
        name: String(group.name || "Grupo sem nome"),
        itemCount: items.length,
        items
    };
}

export function summarizeTemplateAreas(template) {
    return getTemplateCountAreas(template).map((area) => {
        const groups = (template?.groups || [])
            .map((group) => summarizeGroupForArea(group, area))
            .filter(Boolean);

        return {
            name: area,
            groupCount: groups.length,
            itemCount: groups.reduce((total, group) => total + group.itemCount, 0),
            groups
        };
    });
}

export function mapLocationsByReportArea(locationNodes) {
    const locationsByArea = new Map();

    normalizeLocationNodes(locationNodes).forEach((location) => {
        if (!location.reportArea) {
            return;
        }

        const area = normalizeArea(location.reportArea);
        const areaLocations = locationsByArea.get(area) || [];
        locationsByArea.set(area, [...areaLocations, location]);
    });

    return locationsByArea;
}

function addLocationPath(location, locationNodes) {
    const path = getLocationPath(location.id, locationNodes).map((node) => node.name);
    return { ...location, path, pathLabel: path.join(" › ") || location.name };
}

function buildAreaCoverage(areaSummary, locationsByArea, locationNodes) {
    const locations = (locationsByArea.get(areaSummary.name) || [])
        .map((location) => addLocationPath(location, locationNodes));
    const activeLocations = locations.filter((location) => location.active);

    return {
        ...areaSummary,
        locations,
        activeLocations,
        inactiveLocations: locations.filter((location) => !location.active),
        hasConfiguredLocation: locations.length > 0,
        hasActiveLocation: activeLocations.length > 0
    };
}

export function buildCoverageReport(template, locationNodes) {
    const normalizedLocations = normalizeLocationNodes(locationNodes);
    const decoratedLocations = normalizedLocations.map((location) => addLocationPath(location, normalizedLocations));
    const areaSummaries = summarizeTemplateAreas(template);
    const templateAreas = new Set(areaSummaries.map((area) => area.name));
    const locationsByArea = mapLocationsByReportArea(normalizedLocations);
    const areas = areaSummaries.map((area) => buildAreaCoverage(area, locationsByArea, normalizedLocations));

    return {
        template: { id: template?.id || "", name: template?.name || "Template sem nome" },
        templateSummary: summarizeCountTemplate(template || {}),
        areas,
        locations: decoratedLocations,
        locationsWithoutArea: decoratedLocations.filter((location) => !location.reportArea),
        locationsOutsideTemplate: decoratedLocations.filter((location) => (
            location.reportArea && !templateAreas.has(normalizeArea(location.reportArea))
        )),
        inactiveLocations: decoratedLocations.filter((location) => !location.active)
    };
}

export function summarizeCoverageReport(report) {
    const areas = report?.areas || [];
    const locations = report?.locations || [];

    return {
        templateId: report?.template?.id || "",
        templateName: report?.template?.name || "",
        groupCount: report?.templateSummary?.groupCount || 0,
        itemCount: report?.templateSummary?.itemCount || 0,
        areaCount: areas.length,
        totalLocations: locations.length,
        activeLocations: locations.filter((location) => location.active).length,
        inactiveLocations: locations.filter((location) => !location.active).length,
        locationsWithoutArea: report?.locationsWithoutArea?.length || 0,
        areasWithoutLocation: areas.filter((area) => !area.hasConfiguredLocation).length,
        areasWithoutActiveLocation: areas.filter((area) => !area.hasActiveLocation).length,
        locationsOutsideTemplate: report?.locationsOutsideTemplate?.length || 0
    };
}
