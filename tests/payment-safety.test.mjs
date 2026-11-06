import {test} from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {verifyOnvoSignature} from "../lib/onvo-signature.ts";
import {validateDelivery} from "../lib/delivery.ts";

globalThis.crypto ??= webcrypto;

async function signed(body,secret,stamp) {
  const key=await webcrypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  return Buffer.from(await webcrypto.subtle.sign("HMAC",key,new TextEncoder().encode(`${stamp}.${body}`))).toString("hex");
}

test("ONVO: original signed body is accepted, tampering rejected",async()=>{
  const now=Date.now(),stamp=Math.trunc(now/1000),body=JSON.stringify({id:"evt_test",type:"checkout_session.succeeded"}),secret="whsec_example_test_123";
  const header=`t=${stamp},v1=${await signed(body,secret,stamp)}`;
  assert.equal(await verifyOnvoSignature(body,header,secret,now),true);
  assert.equal(await verifyOnvoSignature(body+" ",header,secret,now),false);
  assert.equal(await verifyOnvoSignature(body,header,"whsec_other",now),false);
});
test("ONVO: timestamp replay protection + key rotation",async()=>{
  const now=Date.now(),stale=Math.trunc((now-360000)/1000),fresh=Math.trunc(now/1000),body="{}",secret="whsec_example_test_123";
  assert.equal(await verifyOnvoSignature(body,`t=${stale},v1=${await signed(body,secret,stale)}`,secret,now),false);
  const header=`t=${fresh},v1=${"a".repeat(64)},v1=${await signed(body,secret,fresh)}`;
  assert.equal(await verifyOnvoSignature(body,header,secret,now),true);
  assert.equal(await verifyOnvoSignature(body,"t=bad,v1="+"a".repeat(64),secret,now),false);
});

const delivery={receiverName:"Cliente de prueba",phone:"8888 1234",province:"Puntarenas",canton:"Puntarenas",district:"El Roble",address:"Barrio centro, casa amarilla, frente al parque",instructions:""};
test("Domicilio válido de Costa Rica",()=>assert.equal(validateDelivery(delivery).province,"Puntarenas"));
test("Domicilios incompletos, provincias ajenas y teléfonos malos se rechazan",()=>{
  assert.throws(()=>validateDelivery({...delivery,province:"Miami"}));
  assert.throws(()=>validateDelivery({...delivery,phone:"123"}));
  assert.throws(()=>validateDelivery({...delivery,address:"Calle"}));
});
