import test from "node:test";
import assert from "node:assert/strict";
import {unitEconomics,ltv12,cashCurve,simulate24,customersFromAds,rewardCost} from "../lib/finance.ts";
import {quoteCart} from "../lib/catalog.ts";

test("Contribución del dúo comprobada contra el caso",()=>{
  assert.ok(Math.abs(unitEconomics.duo-15.89)<.000001);
  assert.ok(Math.abs(unitEconomics.subscription-12.643)<.000001);
  assert.ok(Math.abs(unitEconomics.discounted-6.149)<.000001);
  assert.ok(Math.abs(unitEconomics.pack-23.62)<.000001);
});
test("CAC y LTV de 12 meses",()=>{
  assert.equal((9000/165).toFixed(2),"54.55");
  assert.equal(ltv12().oneOff.toFixed(2),"47.67");
  assert.equal(ltv12().subscription.toFixed(2),"95.18");
  assert.equal(ltv12().blend.toFixed(2),"54.80");
  assert.equal(cashCurve(9000/165).find(point=>point.cash>=0)?.month,12);
  assert.equal(cashCurve(5000/100).find(point=>point.cash>=0)?.month,11);
  assert.equal(cashCurve(17000/235,10.2).find(point=>point.cash>=0),undefined);
});
test("Interpolación lineal completa y rendimientos decrecientes",()=>{
  assert.equal(customersFromAds(0),0);
  assert.equal(customersFromAds(4000),100);
  assert.equal(customersFromAds(8000),165);
  assert.equal(customersFromAds(10000),187.5);
  assert.equal(customersFromAds(16000),235);
  assert.equal(customersFromAds(20000),250);
});
test("Mes 1 verificado manualmente y restricción de caja",()=>{
  const s=simulate24(8000);
  assert.equal(s.rows[0].newTotal,212);
  assert.equal(s.rows[0].cohortContribution.toFixed(4),"3265.4254");
  assert.equal(s.rows[0].cash.toFixed(2),"31765.43");
  assert.equal(s.rows.length,24);
  assert.equal(simulate24(16000,{firstDiscount:10.2}).viable,false);
  assert.equal(simulate24(4000).viable,true);
});
test("Todo premio cumple el tope de US$25",()=>{
  assert.ok(rewardCost("one_off")<=25);
  assert.ok(rewardCost("one_off",true)<=25);
  assert.ok(rewardCost("subscription")<=25);
  assert.equal(rewardCost("subscription").toFixed(2),"24.58");
});
test("Cotización recalculada en servidor sin confiar en precio de cliente",()=>{
  const quote=quoteCart([{sku:"duo",quantity:1}],true);
  assert.equal(quote.subtotalCents,3400);
  assert.equal(quote.discountCents,800);
  assert.equal(quote.totalCents,2600);
  assert.throws(()=>quoteCart([{sku:"duo",quantity:99}]));
  assert.throws(()=>quoteCart([{sku:"unknown",quantity:1}]));
});
test("El catálogo administrado determina el precio; nunca se usa el importe del navegador",()=>{
  const catalog=[{sku:"duo",name:"Edición especial",description:"Dos bolsas",priceCents:3750}];
  const quote=quoteCart([{sku:"duo",quantity:2}],false,catalog);
  assert.equal(quote.totalCents,7500);
  assert.equal(quote.normalized[0].product.name,"Edición especial");
  assert.throws(()=>quoteCart([{sku:"duo",quantity:1},{sku:"duo",quantity:1}],false,catalog),/repitas/);
});
test("La invitación no convierte productos baratos en pedidos gratuitos",()=>{
  const quote=quoteCart([{sku:"duo",quantity:1}],true,[{sku:"duo",name:"Mini",description:"Taza",priceCents:500}]);
  assert.equal(quote.discountCents,0);
  assert.equal(quote.totalCents,500);
});
