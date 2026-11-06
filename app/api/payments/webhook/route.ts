import { env } from "cloudflare:workers";
import { fulfillVerifiedPayment } from "../../../../lib/payment-fulfillment";
import { onvoConfig, retrieveTestCheckout, verifyOnvoSignature } from "../../../../lib/onvo";

export const runtime="edge";

type Event={id?:string;object?:string;mode?:string;type?:string;data?:{object?:{id?:string;object?:string;paymentStatus?:string;amountTotal?:number;currency?:string;metadata?:{orderId?:string}}}};

export async function POST(request:Request) {
  const config=onvoConfig();
  if(!config.enabled || !config.webhookSecret) return Response.json({error:"Webhook no habilitado."},{status:503});
  const raw=await request.text();
  if(raw.length>100000) return Response.json({error:"Evento demasiado grande."},{status:413});
  if(!await verifyOnvoSignature(raw,request.headers.get("X-Onvo-Signature"),config.webhookSecret)) return Response.json({error:"Firma de webhook inválida."},{status:401});
  let event:Event;
  try {event=JSON.parse(raw) as Event;}catch{return Response.json({error:"JSON inválido."},{status:400});}
  if(event.object!=="event" || event.mode!=="test" || !event.id || !/^evt_[\w-]{6,140}$/.test(event.id) || request.headers.get("X-Onvo-Event-Id")!==event.id) return Response.json({error:"Sobre del evento inválido."},{status:400});
  if(event.type!=="checkout_session.succeeded") return Response.json({ok:true,ignored:true});
  const session=event.data?.object;
  if(session?.object!=="checkout_session" || !session.id || !session.metadata?.orderId || session.paymentStatus!=="paid") return Response.json({error:"Checkout no confirmado."},{status:409});
  const duplicate=await env.DB.prepare("SELECT event_id FROM payment_webhook_events WHERE event_id=?").bind(event.id).first();
  if(duplicate) return Response.json({ok:true,duplicate:true});
  const row=await env.DB.prepare("SELECT o.status,o.total_cents AS totalCents,s.currency,s.amount_cents AS amountCents,s.mode FROM orders o JOIN payment_sessions s ON s.order_id=o.id WHERE o.id=? AND s.provider_session_id=? AND s.state='created'").bind(session.metadata.orderId,session.id).first<{status:string;totalCents:number;currency:string;amountCents:number;mode:string}>();
  if(!row || row.mode!=="test" || row.amountCents!==row.totalCents || session.amountTotal!==row.totalCents || session.currency?.toUpperCase()!==row.currency) return Response.json({error:"No coincide el monto o la referencia de la sesión."},{status:409});
  if(row.status!=="pending_payment") return Response.json({ok:true,status:row.status});
  try {
    // Double-check the signed event against ONVO's current server-side session.
    const current=await retrieveTestCheckout(session.id);
    if(current.id!==session.id || current.metadata?.orderId!==session.metadata.orderId || current.paymentStatus!=="paid" || current.amountTotal!==row.totalCents || current.currency?.toUpperCase()!==row.currency) return Response.json({error:"Estado actual del proveedor no coincide."},{status:409});
    const result=await fulfillVerifiedPayment({orderId:session.metadata.orderId,reference:session.id,method:"onvo_test",actorId:"onvo:signed-webhook",eventId:event.id,sessionId:session.id});
    return Response.json({ok:true,status:result.state});
  } catch {
    return Response.json({error:"Falló la conciliación; ONVO debe reintentar."},{status:503});
  }
}
