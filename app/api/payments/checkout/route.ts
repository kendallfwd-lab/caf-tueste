import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../../chatgpt-auth";
import { validSameOrigin } from "../../../../lib/admin-auth";
import { createTestCheckout, onvoConfig } from "../../../../lib/onvo";

export const runtime="edge";

export async function POST(request:Request) {
  const user=await getChatGPTUser();
  if(!user) return Response.json({error:"Inicia sesión para pagar tu pedido."},{status:401});
  if(!validSameOrigin(request)) return Response.json({error:"Origen no autorizado."},{status:403});
  const config=onvoConfig();
  if(!config.enabled) return Response.json({error:"Los pagos en línea están desactivados. Necesitamos una llave de prueba ONVO y autorización de configuración."},{status:503});
  let orderId="";
  try {const body=await request.json() as {orderId?:string};orderId=body.orderId??"";}catch{}
  if(!/^[0-9a-f-]{36}$/i.test(orderId)) return Response.json({error:"Pedido inválido."},{status:400});
  const order=await env.DB.prepare("SELECT o.id,o.status,o.total_cents AS totalCents,c.email FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=? AND o.customer_id=?").bind(orderId,user.userId).first<{id:string;status:string;totalCents:number;email:string}>();
  if(!order || order.status!=="pending_payment" || !Number.isSafeInteger(order.totalCents) || order.totalCents<=0) return Response.json({error:"El pedido no está disponible para pago."},{status:409});
  const rows=await env.DB.prepare("SELECT i.sku,i.quantity,p.stock,p.active FROM order_items i LEFT JOIN products p ON i.sku=p.sku WHERE i.order_id=?").bind(orderId).all<{sku:string;quantity:number;stock:number|null;active:number|null}>();
  if(!rows.results.length || rows.results.some(i=>i.active!==1||(i.stock??0)<i.quantity)) return Response.json({error:"Inventario insuficiente. Revisaremos tu pedido antes de enviarte a pagar."},{status:409});
  const prior=await env.DB.prepare("SELECT state,checkout_url AS checkoutUrl FROM payment_sessions WHERE order_id=?").bind(orderId).first<{state:string;checkoutUrl:string|null}>();
  if(prior?.state==="created" && prior.checkoutUrl) return Response.json({ok:true,testMode:true,url:prior.checkoutUrl,replayed:true});
  if(prior) return Response.json({error:"La sesión de pago ya está en preparación o necesita revisión administrativa."},{status:409});
  const now=Date.now();
  const claim=await env.DB.prepare("INSERT OR IGNORE INTO payment_sessions(order_id,state,amount_cents,currency,mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?)").bind(orderId,"creating",order.totalCents,config.currency,"test",now,now).run();
  if(!claim.meta.changes) return Response.json({error:"Otro intento ya está generando esta sesión."},{status:409});
  try {
    // The amount is immutable and comes from the server-side order, not browser input.
    const session=await createTestCheckout({id:order.id,amountCents:order.totalCents,email:order.email},new URL(request.url).origin);
    await env.DB.prepare("UPDATE payment_sessions SET provider_session_id=?,checkout_url=?,state='created',updated_at=? WHERE order_id=? AND state='creating'").bind(session.id,session.url,Date.now(),orderId).run();
    return Response.json({ok:true,testMode:true,url:session.url,notice:"Checkout de pruebas ONVO. No se realizan cargos reales."});
  } catch {
    await env.DB.prepare("UPDATE payment_sessions SET state='needs_review',updated_at=? WHERE order_id=? AND state='creating'").bind(Date.now(),orderId).run().catch(()=>{});
    return Response.json({error:"No se pudo abrir el checkout. No vuelvas a pagar este pedido hasta revisar su estado con el equipo."},{status:502});
  }
}
