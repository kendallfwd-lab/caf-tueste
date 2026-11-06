function hexToBytes(hex:string) {
  if(!/^[a-f0-9]{64}$/i.test(hex)) return null;
  return Uint8Array.from(hex.match(/../g)!,part=>parseInt(part,16));
}

export async function verifyOnvoSignature(raw:string,header:string|null,secret:string,nowMs=Date.now()):Promise<boolean> {
  if(!header || !secret.startsWith("whsec_")) return false;
  const parts=header.split(",").map(s=>s.trim());
  const stamp=parts.find(x=>x.startsWith("t="))?.slice(2);
  const signatures=parts.filter(x=>x.startsWith("v1=")).map(x=>x.slice(3));
  if(!stamp || !/^\d{10}$/.test(stamp) || Math.abs(nowMs-Number(stamp)*1000)>300000) return false;
  const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["verify"]);
  const payload=new TextEncoder().encode(`${stamp}.${raw}`);
  for(const hex of signatures) {
    const sig=hexToBytes(hex);
    if(sig && await crypto.subtle.verify("HMAC",key,sig,payload)) return true;
  }
  return false;
}
