import { getTemplateCountAreas } from "./countPreparation.js";
import {
    findTemplateItem,
    getItemReportAreas,
    normalizeItemLocationLinks
} from "./itemLocationLinks.js";
import {
    buildLocationTree,
    flattenLocationTree,
    getLocationPath,
    normalizeLocationNodes
} from "./locationNodes.js";

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeArea(value) {
    return normalizeText(value).toLocaleUpperCase("pt-BR");
}

function compareLinks(firstLink, secondLink) {
    return firstLink.order - secondLink.order
        || firstLink.itemNameSnapshot.localeCompare(secondLink.itemNameSnapshot, "pt-BR");
}

function getTemplateItems(template) {
    return (template?.groups || []).flatMap((group) => (
        (group.items || []).map((item) => ({ item, group }))
    ));
}

function getRelevantLinks(template, templates, links) {
    const templateIds = new Set((templates || []).map((candidate) => candidate.id));

    return normalizeItemLocationLinks(links).filter((link) => (
        link.templateId === template?.id || !templateIds.has(link.templateId)
    ));
}

function getOrphanReasons(link, template, templateIds, locationIds) {
    const reasons = [];

    if (!templateIds.has(link.templateId)) {
        reasons.push("missing-template");
    }

    if (link.templateId === template?.id && !findTemplateItem(template, link.itemCode)) {
        reasons.push("missing-item");
    }

    if (!locationIds.has(link.locationId)) {
        reasons.push("missing-location");
    }

    return reasons;
}

export function listOrphanLinks(template, templates, locations, links) {
    const templateIds = new Set((templates || []).map((candidate) => candidate.id));
    const locationIds = new Set(normalizeLocationNodes(locations).map((location) => location.id));

    return getRelevantLinks(template, templates, links).map((link) => ({
        link,
        reasons: getOrphanReasons(link, template, templateIds, locationIds)
    })).filter((entry) => entry.reasons.length > 0);
}

export function listItemsWithoutLocation(template, links, locations = []) {
    const locationIds = new Set(normalizeLocationNodes(locations).map((location) => location.id));
    const linkedItemCodes = new Set(normalizeItemLocationLinks(links)
        .filter((link) => link.templateId === template?.id && locationIds.has(link.locationId))
        .map((link) => link.itemCode));

    return getTemplateItems(template).filter(({ item }) => !linkedItemCodes.has(normalizeText(item.code)));
}

export function listLocationsWithoutItems(locations, links, templateId) {
    const linkedLocationIds = new Set(normalizeItemLocationLinks(links)
        .filter((link) => link.templateId === templateId)
        .map((link) => link.locationId));

    return normalizeLocationNodes(locations).filter((location) => (
        location.active && !linkedLocationIds.has(location.id)
    ));
}

function decorateLocation(location, locations) {
    const path = getLocationPath(location.id, locations).map((node) => node.name);

    return {
        ...location,
        path,
        pathLabel: path.join(" › ") || location.name
    };
}

function getLinkIssues(link, template, location) {
    const issues = [];
    const currentArea = normalizeArea(location.reportArea);
    const snapshotArea = normalizeArea(link.reportArea);
    const itemAreas = getItemReportAreas(template, link.itemCode).map(normalizeArea);

    if (!link.active) issues.push("inactive-link");
    if (!location.active) issues.push("inactive-location");
    if (!currentArea) issues.push("location-without-area");
    if (currentArea !== snapshotArea) issues.push("area-snapshot-mismatch");
    if (currentArea && itemAreas.length > 0 && !itemAreas.includes(currentArea)) {
        issues.push("area-outside-item");
    }

    return issues;
}

function createLocationEntry(location, template, selectedLinks, locations) {
    const locationLinks = selectedLinks
        .filter((link) => link.locationId === location.id)
        .sort(compareLinks)
        .map((link) => ({ ...link, issues: getLinkIssues(link, template, location) }));
    const decoratedLocation = decorateLocation(location, locations);

    return {
        location: decoratedLocation,
        depth: location.depth,
        activeLinks: locationLinks.filter((link) => link.active),
        inactiveLinks: locationLinks.filter((link) => !link.active),
        links: locationLinks,
        hasProblems: locationLinks.length === 0
            || !location.reportArea
            || locationLinks.some((link) => link.issues.length > 0)
    };
}

function listLinksByIssue(locationEntries, issue) {
    return locationEntries.flatMap((entry) => entry.links).filter((link) => link.issues.includes(issue));
}

function buildDiagnostics(template, templates, locations, links, locationEntries) {
    const selectedLinks = links.filter((link) => link.templateId === template.id);
    const templateAreas = new Set(getTemplateCountAreas(template).map(normalizeArea));
    const decoratedLocations = locationEntries.map((entry) => entry.location);

    return {
        locationsWithoutItems: locationEntries
            .filter((entry) => entry.location.active && entry.links.length === 0)
            .map((entry) => entry.location),
        itemsWithoutLocation: listItemsWithoutLocation(template, links, locations),
        inactiveLinks: selectedLinks.filter((link) => !link.active),
        orphanLinks: listOrphanLinks(template, templates, locations, links),
        areaSnapshotMismatches: listLinksByIssue(locationEntries, "area-snapshot-mismatch"),
        linksInLocationsWithoutArea: listLinksByIssue(locationEntries, "location-without-area"),
        linksInInactiveLocations: listLinksByIssue(locationEntries, "inactive-location"),
        linksOutsideItemAreas: listLinksByIssue(locationEntries, "area-outside-item"),
        locationsWithoutArea: decoratedLocations.filter((location) => !location.reportArea),
        locationsOutsideTemplate: decoratedLocations.filter((location) => (
            location.reportArea && !templateAreas.has(normalizeArea(location.reportArea))
        ))
    };
}

export function buildLocationItemMap(template, templates, locations, links) {
    const normalizedLocations = normalizeLocationNodes(locations);
    const normalizedLinks = normalizeItemLocationLinks(links);
    const selectedLinks = normalizedLinks.filter((link) => link.templateId === template?.id);
    const orderedLocations = flattenLocationTree(buildLocationTree(normalizedLocations));
    const allLocationEntries = orderedLocations
        .map((location) => createLocationEntry(location, template, selectedLinks, normalizedLocations));
    const locationEntries = allLocationEntries.filter((entry) => entry.location.active);

    return {
        template: { id: template?.id || "", name: template?.name || "Template sem nome" },
        templateCount: templates.length,
        templateItemCount: getTemplateItems(template).length,
        locations: normalizedLocations,
        locationEntries,
        selectedLinks,
        diagnostics: buildDiagnostics(template, templates, normalizedLocations, normalizedLinks, allLocationEntries)
    };
}

export function summarizeLocationItemMap(map) {
    const links = map?.selectedLinks || [];
    const diagnostics = map?.diagnostics || {};

    return {
        templateCount: map?.templateCount || 0,
        templateName: map?.template?.name || "",
        templateItemCount: map?.templateItemCount || 0,
        totalLocations: map?.locations?.length || 0,
        activeLocations: map?.locationEntries?.length || 0,
        linkedLocations: map?.locationEntries?.filter((entry) => entry.links.length > 0).length || 0,
        activeLinks: links.filter((link) => link.active).length,
        inactiveLinks: diagnostics.inactiveLinks?.length || 0,
        itemsWithoutLocation: diagnostics.itemsWithoutLocation?.length || 0,
        orphanLinks: diagnostics.orphanLinks?.length || 0
    };
}

function matchesItemSearch(link, query) {
    const haystack = `${link.itemCode} ${link.itemNameSnapshot} ${link.groupNameSnapshot}`
        .toLocaleLowerCase("pt-BR");
    return haystack.includes(query);
}

function filterDiagnosticLinks(links, query, locationId) {
    return (links || []).filter((link) => (
        (!locationId || link.locationId === locationId)
        && (!query || matchesItemSearch(link, query))
    ));
}

function filterDiagnosticLocations(locations, query, locationId) {
    if (query) {
        return [];
    }

    return (locations || []).filter((location) => !locationId || location.id === locationId);
}

function filterDiagnostics(diagnostics, query, locationId, showItemsWithoutLocation) {
    const filterLinks = (links) => filterDiagnosticLinks(links, query, locationId);
    const filterLocations = (locations) => filterDiagnosticLocations(locations, query, locationId);
    const orphanLinks = (diagnostics.orphanLinks || []).filter(({ link }) => filterLinks([link]).length > 0);
    const itemsWithoutLocation = (diagnostics.itemsWithoutLocation || []).filter(({ item, group }) => (
        showItemsWithoutLocation
        && !locationId
        && (!query || `${item.code} ${item.name} ${group.name}`.toLocaleLowerCase("pt-BR").includes(query))
    ));

    return {
        ...diagnostics,
        locationsWithoutItems: filterLocations(diagnostics.locationsWithoutItems),
        itemsWithoutLocation,
        inactiveLinks: filterLinks(diagnostics.inactiveLinks),
        orphanLinks,
        areaSnapshotMismatches: filterLinks(diagnostics.areaSnapshotMismatches),
        linksInLocationsWithoutArea: filterLinks(diagnostics.linksInLocationsWithoutArea),
        linksInInactiveLocations: filterLinks(diagnostics.linksInInactiveLocations),
        linksOutsideItemAreas: filterLinks(diagnostics.linksOutsideItemAreas),
        locationsWithoutArea: filterLocations(diagnostics.locationsWithoutArea),
        locationsOutsideTemplate: filterLocations(diagnostics.locationsOutsideTemplate)
    };
}

export function filterLocationItemMap(map, filters = {}) {
    const query = normalizeText(filters.query).toLocaleLowerCase("pt-BR");
    const locationId = normalizeText(filters.locationId);
    const locationEntries = (map?.locationEntries || []).map((entry) => ({
        ...entry,
        activeLinks: entry.activeLinks.filter((link) => !query || matchesItemSearch(link, query)),
        inactiveLinks: entry.inactiveLinks.filter((link) => !query || matchesItemSearch(link, query))
    })).map((entry) => ({ ...entry, links: [...entry.activeLinks, ...entry.inactiveLinks] }))
        .filter((entry) => !locationId || entry.location.id === locationId)
        .filter((entry) => !query || entry.links.length > 0)
        .filter((entry) => !filters.onlyProblems || entry.hasProblems || entry.links.some((link) => link.issues.length));
    const showItemsWithoutLocation = filters.showItemsWithoutLocation !== false;

    return {
        ...map,
        locationEntries,
        appliedFilters: { ...filters, showItemsWithoutLocation },
        diagnostics: filterDiagnostics(map.diagnostics, query, locationId, showItemsWithoutLocation)
    };
}
