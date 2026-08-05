import { getTemplateCountAreas } from "./countPreparation.js";

function normalizeText(value) {
    return String(value ?? "").trim().replace(/\s+/g, " ");
}

function normalizeArea(value) {
    return normalizeText(value).toLocaleUpperCase("pt-BR");
}

function normalizeAreas(values) {
    if (!Array.isArray(values)) return [];
    return [...new Set(values.map(normalizeArea).filter((area) => area && area !== "TOTAL"))];
}

function slugify(value) {
    return normalizeText(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "") || "area";
}

function getItemAreas(group, item) {
    const itemAreas = normalizeAreas(item?.countAreas);
    return itemAreas.length > 0 ? itemAreas : normalizeAreas(group?.countAreas);
}

function collectAreaItems(template) {
    const itemsByArea = new Map(getTemplateCountAreas(template).map((area) => [area, []]));

    (template?.groups || []).forEach((group) => {
        (group.items || []).forEach((item) => {
            getItemAreas(group, item).forEach((area) => {
                const areaItems = itemsByArea.get(area) || [];
                if (areaItems.some((candidate) => candidate.itemCode === normalizeText(item.code))) return;
                areaItems.push({
                    itemCode: normalizeText(item.code),
                    itemName: normalizeText(item.name),
                    groupId: normalizeText(group.id),
                    groupName: normalizeText(group.name),
                    order: areaItems.length + 1
                });
                itemsByArea.set(area, areaItems);
            });
        });
    });

    return itemsByArea;
}

function createAvailableLocationId(area, locations) {
    const baseId = `location_area_${slugify(area)}`;
    const existingIds = new Set(locations.map((location) => location.id));
    let candidateId = baseId;
    let suffix = 2;

    while (existingIds.has(candidateId)) {
        candidateId = `${baseId}_${suffix}`;
        suffix += 1;
    }

    return candidateId;
}

function findAreaLocation(area, locations) {
    const roots = locations.filter((location) => location.parentId === null);
    const exactLocation = roots.find((location) => (
        normalizeArea(location.name) === area && normalizeArea(location.reportArea) === area
    ));
    const nameConflict = roots.find((location) => normalizeArea(location.name) === area);

    return { exactLocation: exactLocation || null, nameConflict: exactLocation ? null : nameConflict || null };
}

function buildLocationPlan(area, locations, rootOrder) {
    const { exactLocation, nameConflict } = findAreaLocation(area, locations);

    if (exactLocation) {
        return {
            action: exactLocation.active ? "reuse" : "reactivate",
            location: exactLocation,
            warning: exactLocation.active ? "" : `O local ${area} será reativado.`
        };
    }

    if (nameConflict) {
        return {
            action: "blocked",
            location: nameConflict,
            warning: `Já existe um local raiz chamado ${area}, mas sua área de relatório é diferente.`
        };
    }

    return {
        action: "create",
        location: {
            id: createAvailableLocationId(area, locations),
            name: area,
            type: "room",
            parentId: null,
            reportArea: area,
            order: rootOrder,
            active: true
        },
        warning: ""
    };
}

function buildAreaPlan(area, items, locations, links, templateId, rootOrder) {
    const locationPlan = buildLocationPlan(area, locations, rootOrder);
    const existingLinks = links.filter((link) => (
        link.templateId === templateId
        && link.locationId === locationPlan.location.id
        && items.some((item) => item.itemCode === link.itemCode)
    ));
    const linkedItemCodes = new Set(existingLinks.map((link) => link.itemCode));
    const plannedItems = items.map((item) => {
        const existingLink = existingLinks.find((link) => link.itemCode === item.itemCode);
        const linkState = existingLink ? (existingLink.active ? "existing" : "inactive") : "create";
        return { ...item, linkState };
    });

    return {
        name: area,
        items: plannedItems,
        itemCount: items.length,
        locationPlan,
        existingLinkCount: linkedItemCodes.size,
        activeExistingLinkCount: new Set(existingLinks.filter((link) => link.active).map((link) => link.itemCode)).size,
        inactiveLinkCount: new Set(existingLinks.filter((link) => !link.active).map((link) => link.itemCode)).size,
        newLinkCount: items.length - linkedItemCodes.size
    };
}

function collectWarnings(areaPlans, template) {
    const warnings = areaPlans.map((area) => area.locationPlan.warning).filter(Boolean);
    const unassignedItems = (template?.groups || []).flatMap((group) => (
        (group.items || []).filter((item) => getItemAreas(group, item).length === 0)
    )).length;

    if (unassignedItems > 0) {
        warnings.push(`${unassignedItems} item(ns) não possuem área no item nem no grupo e serão ignorados.`);
    }

    const inactiveLinks = areaPlans.reduce((total, area) => total + area.inactiveLinkCount, 0);
    if (inactiveLinks > 0) {
        warnings.push(`${inactiveLinks} vínculo(s) existente(s) estão inativos e serão preservados sem reativação automática.`);
    }

    return warnings;
}

export function buildQuickPilotPlan(template, locations = [], links = []) {
    if (!template) return null;
    const itemsByArea = collectAreaItems(template);
    const highestRootOrder = Math.max(-1, ...locations.filter((node) => node.parentId === null).map((node) => node.order));
    const areaPlans = [...itemsByArea.entries()].map(([area, items], index) => (
        buildAreaPlan(area, items, locations, links, template.id, highestRootOrder + index + 1)
    ));

    return {
        templateId: template.id,
        templateName: template.name,
        areas: areaPlans,
        areaCount: areaPlans.length,
        expectedLinkCount: areaPlans.reduce((total, area) => total + area.itemCount, 0),
        newLocationCount: areaPlans.filter((area) => area.locationPlan.action === "create").length,
        reusedLocationCount: areaPlans.filter((area) => area.locationPlan.action === "reuse").length,
        reactivatedLocationCount: areaPlans.filter((area) => area.locationPlan.action === "reactivate").length,
        newLinkCount: areaPlans.reduce((total, area) => total + area.newLinkCount, 0),
        existingLinkCount: areaPlans.reduce((total, area) => total + area.existingLinkCount, 0),
        activeExistingLinkCount: areaPlans.reduce((total, area) => total + area.activeExistingLinkCount, 0),
        inactiveLinkCount: areaPlans.reduce((total, area) => total + area.inactiveLinkCount, 0),
        warnings: collectWarnings(areaPlans, template),
        canApply: areaPlans.length > 0 && areaPlans.every((area) => area.locationPlan.action !== "blocked")
    };
}

export function buildQuickPilotLinkCandidates(plan, existingLinks = []) {
    if (!plan) return [];

    return plan.areas.flatMap((area) => area.items
        .filter((item) => !existingLinks.some((link) => (
            link.templateId === plan.templateId
            && link.itemCode === item.itemCode
            && link.locationId === area.locationPlan.location.id
        )))
        .map((item) => ({
            templateId: plan.templateId,
            itemCode: item.itemCode,
            locationId: area.locationPlan.location.id,
            order: item.order,
            active: true
        })));
}

export function summarizeQuickPilotStatus(plan) {
    if (!plan) {
        return { hasTemplate: false, templateName: "", areasStatus: "não", linksStatus: "não" };
    }

    const configuredAreas = plan.areas.filter((area) => area.locationPlan.action === "reuse").length;
    const activeLinks = plan.activeExistingLinkCount;
    const getStatus = (current, expected) => {
        if (expected === 0) return "não";
        return current === expected ? "sim" : current > 0 ? "parcial" : "não";
    };

    return {
        hasTemplate: true,
        templateName: plan.templateName,
        areasStatus: getStatus(configuredAreas, plan.areaCount),
        linksStatus: getStatus(activeLinks, plan.expectedLinkCount),
        configuredAreas,
        areaCount: plan.areaCount,
        activeLinks,
        expectedLinkCount: plan.expectedLinkCount
    };
}
