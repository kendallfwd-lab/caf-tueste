import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { validSameOrigin } from "../../../../lib/admin-auth";
import { fulfillVerifiedPayment } from "../../../../lib/payment-fulfillment";
import { onvoConfig, retrieveTestCheckout } from "../../../../lib/onvo";

export const runtime="edge";

export async function POST(request:Request) {
  const user=await getChatGPTUser();
  if(!user) return Response.json({error:"Sesión requerida."},{status:401});
  if(!validSameOrigin(request)) return Response.json({error:"Origen no autorizado."},{status:403});
  if(!onvoConfig().enabled) return Response.json({error:"Verificación ONVO no configurada."},{status:503});
  let orderId="";
  try {orderId=(await request.json() as {orderId?:string}).orderId??"";}catch{}
  if(!/^[0-9a-f-]{36}$/i.test(orderId)) return Response.json({error:"Pedido inválido."},{status:400});
  const row=await env.DB.prepare("SELECT o.status,o.total_cents AS totalCents,s.provider_session_id AS sessionId,s.currency,s.amount_cents AS amountCents,s.mode FROM orders o JOIN payment_sessions s ON s.order_id=o.id WHERE o.id=? AND o.customer_id=?").bind(orderId,user.userId).first<{status:string;totalCents:number;sessionId:string|null;currency:string;amountCents:number;mode:string}>();
  if(!row?.sessionId) return Response.json({error:"El pedido no tiene sesión ONVO."},{status:404});
  if(row.status!=="pending_payment") return Response.json({ok:true,status:row.status});
  try {
    const checkout=await retrieveTestCheckout(row.sessionId);
    if(checkout.id!==row.sessionId || checkout.metadata?.orderId!==orderId || checkout.amountTotal!==row.totalCents || row.amountCents!==row.totalCents || checkout.currency?.toUpperCase()!==row.currency || row.mode!=="test") return Response.json({error:"La sesión requiere reconciliación manual por discrepancia de datos."},{status:409});
    if(checkout.paymentStatus!=="paid") return Response.json({ok:true,status:"pending_payment",notice:"ONVO todavía no confirma el pago. No se descontó inventario."});
    const outcome=await fulfillVerifiedPayment({orderId,reference:row.sessionId,method:"onvo_test",actorId:"onvo:api-verified"});
    return Response.json({ok:true,status:outcome.state});
  } catch {
    return Response.json({error:"No fue posible verificar con ONVO. Consulta nuevamente más tarde."},{status:503});
  }
}
