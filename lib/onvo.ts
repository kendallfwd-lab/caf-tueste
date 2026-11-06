import { env } from "cloudflare:workers";

// Deliberately test-only until the owner separately authorizes production charging.
export function onvoConfig() {
  const variables = env as unknown as Record<string,unknown>;
  const key = typeof variables.ONVO_SECRET_KEY === "string" ? variables.ONVO_SECRET_KEY : "";
  const webhookSecret = typeof variables.ONVO_WEBHOOK_SECRET === "string" ? variables.ONVO_WEBHOOK_SECRET : "";
  const enabled = variables.TUESTE_ONVO_MODE === "test" && key.startsWith("onvo_test_secret_key_");
  return { enabled, key: enabled ? key : "", webhookSecret: webhookSecret.startsWith("whsec_") ? webhookSecret : "", currency:"USD" as const, mode:"test" as const };
}

export type OnvoSession = {
  id: string;
  url?: string;
  amountTotal?: number;
  currency?: string;
  paymentStatus?: string;
  status?: string;
  metadata?: {orderId?:string};
};

async function onvoCall<T>(path:string, options?:{method?:"POST";body?:object}):Promise<T> {
  const cfg=onvoConfig();
  if(!cfg.enabled) throw new Error("ONVO no está configurado para pruebas.");
  const response=await fetch(`https://api.onvopay.com${path}`,{
    method:options?.method??"GET",
    headers:{Authorization:`Bearer ${cfg.key}`,"Content-Type":"application/json"},
    body:options?.body?JSON.stringify(options.body):undefined,
    signal:AbortSignal.timeout(7500),
  });
  if(!response.ok) throw new Error(`ONVO rechazó la operación (${response.status}).`);
  return await response.json() as T;
}

export async function createTestCheckout(order:{id:string;amountCents:number;email:string},siteOrigin:string) {
  const session=await onvoCall<OnvoSession>("/v1/checkout/sessions/one-time-link",{
    method:"POST",
    body:{
      lineItems:[{quantity:1,unitAmount:order.amountCents,currency:"USD",description:`Tueste Café · Pedido ${order.id.slice(0,8)}`}],
      customerEmail:order.email,
      redirectUrl:`${siteOrigin}/pedidos?resultado=onvo`,
      cancelUrl:`${siteOrigin}/pedidos?resultado=cancelado`,
      metadata:{orderId:order.id},
    },
  });
  if(typeof session.id!=="string" || !/^[a-zA-Z0-9_-]{5,150}$/.test(session.id) || typeof session.url!=="string") throw new Error("ONVO devolvió una sesión inválida.");
  const link=new URL(session.url);
  if(link.protocol!=="https:" || !(link.hostname==="onvopay.com" || link.hostname.endsWith(".onvopay.com"))) throw new Error("ONVO devolvió una URL no permitida.");
  return {id:session.id,url:session.url};
}

export async function retrieveTestCheckout(sessionId:string) {
  if(!/^[a-zA-Z0-9_-]{5,150}$/.test(sessionId)) throw new Error("Identificador de sesión inválido.");
  return onvoCall<OnvoSession>(`/v1/checkout/sessions/${encodeURIComponent(sessionId)}`);
}

export { verifyOnvoSignature } from "./onvo-signature";
