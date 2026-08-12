import assert from "node:assert/strict";
import fs from "node:fs";

import {
    buildControlledItemUnitProfile,
    doesItemUnitProfileNeedReview,
    inferUnitForTemplateItem,
    normalizeItemUnitSetting,
    normalizeUnitAlias
} from "../src/itemUnitSettings.js";
import { convertEntryToBase } from "../src/unitConversion.js";

function createTemplate(itemName, groupName = "Grupo neutro") {
    return {
        id: "template-inference-test",
        name: "Template de validação",
        groups: [{
            id: "group-1",
            name: groupName,
            items: [{ code: "ITEM-1", name: itemName }]
        }]
    };
}

function inferProfile(itemName, groupName) {
    const template = createTemplate(itemName, groupName);
    return inferUnitForTemplateItem(template, "ITEM-1", []);
}

function findAllowedUnit(profile, label) {
    return profile.allowedUnits.find((unit) => unit.label === label);
}

function assertFactor(profile, label, expectedFactor) {
    const actualFactor = Number(findAllowedUnit(profile, label).factorToBase);
    assert.ok(Math.abs(actualFactor - expectedFactor) < 1e-12, `${profile.itemNameSnapshot}: ${label}`);
}

function assertExplicitProfile(itemName, expectedBase, expectedDefault) {
    const profile = inferProfile(itemName);
    assert.equal(profile.baseUnit, expectedBase, itemName);
    assert.equal(profile.defaultInputUnit, expectedDefault, itemName);
    assert.equal(profile.source, "item_name", itemName);
    assert.equal(doesItemUnitProfileNeedReview(profile), false, itemName);
    return profile;
}

function assertPortionWeight(itemName, expectedWeightGrams) {
    const profile = inferProfile(itemName, "202PORÇÕES");
    const portion = findAllowedUnit(profile, "porção");
    assert.equal(portion.portionWeightGrams, expectedWeightGrams, itemName);
    assertFactor(profile, "kg", 1000 / expectedWeightGrams);
    assertFactor(profile, "g", 1 / expectedWeightGrams);
    assert.equal(doesItemUnitProfileNeedReview(profile), false, itemName);
}

function assertCommercialCapacityIsNotOperational(itemName, groupName) {
    const profile = inferProfile(itemName, groupName);
    assert.notEqual(profile.defaultInputUnit, "ml", itemName);
    assert.notEqual(profile.defaultInputUnit, "l", itemName);
}

function createEmptyProfile() {
    return normalizeItemUnitSetting({
        templateId: "template-inference-test",
        itemCode: "ITEM-1",
        itemNameSnapshot: "Item",
        groupId: "group-1",
        groupNameSnapshot: "Grupo",
        source: "manual",
        confidence: "high"
    });
}

function assertControlledVariantsRemainValid() {
    const profile = createEmptyProfile();
    const massResult = buildControlledItemUnitProfile(profile, {
        baseUnit: "kg",
        defaultInputUnit: "porção 200 g",
        allowedUnits: ["kg", "g", { variantFamily: "porção", variantValue: "200", variantUnit: "g" }]
    });
    assert.equal(massResult.isResolved, true);

    ["fardo", "caixa", "pacote"].forEach((variantFamily) => {
        const result = buildControlledItemUnitProfile(profile, {
            baseUnit: "un",
            defaultInputUnit: `${variantFamily} 12`,
            allowedUnits: ["un", { variantFamily, variantValue: "12", variantUnit: "un" }]
        });
        assert.equal(result.isResolved, true, variantFamily);
    });

    const bottleBoxResult = buildControlledItemUnitProfile(profile, {
        baseUnit: "garrafa",
        defaultInputUnit: "caixa 12",
        allowedUnits: ["garrafa", { variantFamily: "caixa", variantValue: "12", variantUnit: "garrafa" }]
    });
    assert.equal(bottleBoxResult.isResolved, true, "caixa de garrafas");
    assertFactor(bottleBoxResult.setting, "caixa 12", 12);
}

function assertConversion(profile, rawUnit, quantityDecimal, expectedQuantity) {
    const result = convertEntryToBase({ rawUnit, quantityDecimal }, profile);
    assert.equal(result.isConvertible, true, `${profile.itemNameSnapshot}: ${rawUnit}`);
    assert.equal(result.convertedQuantityDecimal, expectedQuantity, `${profile.itemNameSnapshot}: ${rawUnit}`);
}

function findRealItems(template, pattern, groupName) {
    return template.groups.flatMap((group) => (
        group.name === groupName ? group.items.filter((item) => pattern.test(item.name)) : []
    ));
}

function assertWasteBagProfile(profile) {
    assert.equal(profile.baseUnit, "pacote", profile.itemNameSnapshot);
    assert.equal(profile.defaultInputUnit, "pacote", profile.itemNameSnapshot);
    assertFactor(profile, "pacote", 1);
    assert.equal(profile.allowedUnits.some((unit) => ["kg", "g", "l", "ml"].includes(unit.normalizedUnit)), false);
    assert.equal(doesItemUnitProfileNeedReview(profile), false, profile.itemNameSnapshot);
}

function assertFurstProfile(profile) {
    assert.equal(profile.baseUnit, "garrafa", profile.itemNameSnapshot);
    assert.equal(profile.defaultInputUnit, "garrafa", profile.itemNameSnapshot);
    assertFactor(profile, "garrafa", 1);
    assertFactor(profile, "caixa 12", 12);
    const box = findAllowedUnit(profile, "caixa 12");
    assert.equal(box.variantFamily, "caixa");
    assert.equal(box.variantValue, "12");
    assert.equal(box.variantUnit, "garrafa");
    assert.equal(profile.allowedUnits.some((unit) => unit.normalizedUnit === "ml"), false);
    assertConversion(profile, "caixa 12", "1", "12");
}

function assertCachacaProfile(profile) {
    assert.equal(profile.baseUnit, "garrafa", profile.itemNameSnapshot);
    assert.equal(profile.defaultInputUnit, "garrafa", profile.itemNameSnapshot);
    assertFactor(profile, "garrafa", 1);
    assert.ok(findAllowedUnit(profile, "ml").factorToBase);
    assertConversion(profile, "ml", "750", "1");
    assertConversion(profile, "ml", "375", "0.5");
    assertConversion(profile, "ml", "1500", "2");
}

const massProfile = assertExplicitProfile("FARINHA DE TRIGO GR", "kg", "g");
assert.equal(findAllowedUnit(massProfile, "g").factorToBase, "0.001");
assertExplicitProfile("CREME DE LEITE G", "kg", "g");
const volumeProfile = assertExplicitProfile("AZEITE ML", "l", "ml");
assertFactor(volumeProfile, "l", 1);
assertFactor(volumeProfile, "ml", 0.001);
assertExplicitProfile("VODKA SMIRNOFF ML", "l", "ml");
assertExplicitProfile("LEITE INTEGRAL L", "l", "l");
assertExplicitProfile("OLEO DE ALGODAO LT", "l", "l");
assertExplicitProfile("BANHA COZINHA LITRO", "l", "l");
assertExplicitProfile("SOFIOLI MUÇARELA BÚF E TOM SECO UNI", "un", "un");
assertExplicitProfile("CEBOLINHA MACO UNI", "un", "un");
assertExplicitProfile("ITEM OPERACIONAL UND", "un", "un");
assertExplicitProfile("ITEM OPERACIONAL UNIDADE", "un", "un");
assertExplicitProfile("ITEM OPERACIONAL UNIDADES", "un", "un");
assertExplicitProfile("AMIDO DE MILHO GR (MAIZENA)", "kg", "g");

assertPortionWeight("PORCAO MAMINHA GRILL400G", 400);
assertPortionWeight("COSTELINHA DEFUMADA 800GR", 800);
assertPortionWeight("ESPAGUETE GRANO DURO PORCAO 300GR", 300);
assertPortionWeight("TALHARIM COZIDO PORCAO UNI 200GR", 200);
assertPortionWeight("PORCAO TESTE 0.5KG", 500);

assertCommercialCapacityIsNotOperational("SACO DE LIXO 20L", "97Limpeza");
assertCommercialCapacityIsNotOperational("CACHACA EMPORIO AMBURANA 750ML", "EMPÓRIO");
assertCommercialCapacityIsNotOperational("CERVEJA FURST PILSEN LAGER - 600ML", "104CERVEJAS");
assertCommercialCapacityIsNotOperational("CERVEJA FURST WEISSBIER - 600 ML", "104CERVEJAS");
assert.equal(doesItemUnitProfileNeedReview(inferProfile("HAMBURGUEIRA UN", "EMBALAGENS/DESCARTÁVEIS")), true);

assert.equal(inferProfile("CARNE TESTE", "203CARNES KG").baseUnit, "kg");
assert.equal(findAllowedUnit(inferProfile("PORCAO TESTE 200G", "202PORÇÕES"), "porção").portionWeightGrams, 200);
assert.equal(findAllowedUnit(inferProfile("AGUA TESTE", "AGUAS"), "fardo 6").factorToBase, "6");
assert.ok(findAllowedUnit(inferProfile("EMBALAGEM TESTE", "EMBALAGENS"), "caixa 12"));
assert.ok(findAllowedUnit(inferProfile("EMBALAGEM TESTE", "EMBALAGENS"), "pacote"));
assertControlledVariantsRemainValid();
assert.equal(normalizeUnitAlias("UNI"), "un");
assert.equal(normalizeUnitAlias("LT"), "l");

const realTemplate = JSON.parse(fs.readFileSync(new URL("../data/generated/count-template-cdp.json", import.meta.url), "utf8"));
const wasteBags = findRealItems(realTemplate, /SACO(?:LA)? DE LIXO/, "97Limpeza");
assert.equal(wasteBags.length, 3);
wasteBags.forEach((item) => assertWasteBagProfile(inferUnitForTemplateItem(realTemplate, item.code, [])));

const furstBeers = findRealItems(realTemplate, /CERVEJA FURST.*600\s*ML/, "104CERVEJAS");
assert.equal(furstBeers.length, 4);
furstBeers.forEach((item) => assertFurstProfile(inferUnitForTemplateItem(realTemplate, item.code, [])));

const emporioCachacas = findRealItems(realTemplate, /^CACHACA EMPORIO/, "EMPÓRIO");
assert.equal(emporioCachacas.length, 4);
emporioCachacas.forEach((item) => assertCachacaProfile(inferUnitForTemplateItem(realTemplate, item.code, [])));
assert.ok(emporioCachacas.some((item) => /ESPECIAL/.test(item.name)));

const nonFurstBeer = inferProfile("CERVEJA OUTRA MARCA 600ML", "104CERVEJAS");
assert.equal(nonFurstBeer.allowedUnits.some((unit) => unit.label === "caixa 12"), false);
const nonCachacaBottle = inferProfile("GIN OUTRA MARCA 750ML", "103BEBIDAS DESTILADAS");
assert.notEqual(nonCachacaBottle.baseUnit, "garrafa");
const unrelatedPackaging = inferProfile("HAMBURGUEIRA UN", "EMBALAGENS/DESCARTÁVEIS");
assert.notEqual(unrelatedPackaging.baseUnit, "pacote");
const barCachaca = inferProfile("CACHACA BAR CARVALHO ESPECIAL ML", "103BEBIDAS DESTILADAS");
assert.equal(barCachaca.baseUnit, "l");
const otherCachacaCapacity = inferProfile("CACHACA EMPORIO TESTE 1L", "EMPÓRIO");
assert.notEqual(otherCachacaCapacity.baseUnit, "garrafa");

console.log("CONSERVATIVE_UNIT_INFERENCE_VALIDATION_OK");
