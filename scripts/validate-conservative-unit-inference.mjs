import assert from "node:assert/strict";

import {
    buildControlledItemUnitProfile,
    doesItemUnitProfileNeedReview,
    inferUnitForTemplateItem,
    normalizeItemUnitSetting,
    normalizeUnitAlias
} from "../src/itemUnitSettings.js";

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

console.log("CONSERVATIVE_UNIT_INFERENCE_VALIDATION_OK");
