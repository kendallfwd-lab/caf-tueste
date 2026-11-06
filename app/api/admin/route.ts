import { env } from "cloudflare:workers";
import { PRODUCTS } from "../../../lib/catalog";
import { getAdmin, adminDenied, validSameOrigin } from "../../../lib/admin-auth";
import { fulfillVerifiedPayment, resolvePaidReview } from "../../../lib/payment-fulfillment";

export const runtime = "edge";

type InventoryProduct = {sku:string;name:string;description:string;priceCents:number;costCents:number|null;stock:number;active:number};
type OrderRow = {id:string;customerId:string;email:string;displayName:string;status:string;totalCents:number;discountCents:number;referralCode:string|null;createdAt:number};
type Action = {action?:string;sku?:string;name?:string;description?:string;priceCents?:number;costCents?:number|null;active?:boolean;delta?:number;reason?:string;orderId?:string;method?:string;paymentReference?:string;note?:string;nextStatus?:string};

async function dashboard() {
  const [products,orders,clients,rewards,events,payments,movements,items,totals,costTotals,repeat,requests] = await Promise.all([
    env.DB.prepare("SELECT sku,name,description,price_cents AS priceCents,cost_cents AS costCents,stock,active FROM products ORDER BY sku").all(),
    env.DB.prepare("SELECT o.id,o.customer_id AS customerId,c.email,c.display_name AS displayName,o.status,o.total_cents AS totalCents,o.discount_cents AS discountCents,o.referral_code AS referralCode,o.created_at AS createdAt,f.receiver_name AS receiverName,f.phone AS deliveryPhone,f.province,f.canton,f.district,f.address,f.instructions FROM orders o JOIN customers c ON c.id=o.customer_id LEFT JOIN order_fulfillment f ON f.order_id=o.id ORDER BY o.created_at DESC LIMIT 80").all(),
    env.DB.prepare("SELECT c.id,c.email,c.display_name AS displayName,c.created_at AS createdAt,COUNT(o.id) AS orders,COALESCE(SUM(CASE WHEN o.status IN ('paid','preparing','shipped','delivered') THEN o.total_cents ELSE 0 END),0) AS verifiedSpend FROM customers c LEFT JOIN orders o ON o.customer_id=c.id GROUP BY c.id ORDER BY verifiedSpend DESC LIMIT 80").all(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM referrals").first<{n:number}>(),
    env.DB.prepare("SELECT type,COUNT(*) AS n FROM events GROUP BY type").all(),
    env.DB.prepare("SELECT COUNT(*) AS n,COALESCE(SUM(amount_cents),0) AS total FROM payment_records WHERE method!='onvo_test'").first<{n:number;total:number}>(),
    env.DB.prepare("SELECT s.sku,s.delta,s.reason,s.created_at AS createdAt FROM stock_movements s ORDER BY s.created_at DESC LIMIT 20").all(),
    env.DB.prepare("SELECT i.order_id AS orderId,i.sku,i.quantity,i.unit_price_cents AS unitPriceCents,i.unit_cost_cents AS unitCostCents FROM order_items i JOIN orders o ON i.order_id=o.id ORDER BY o.created_at DESC LIMIT 240").all(),
    env.DB.prepare("SELECT COUNT(CASE WHEN status IN ('paid','paid_review','preparing','shipped','delivered') THEN 1 END) AS paidOrders,COALESCE(SUM(CASE WHEN status IN ('paid','paid_review','preparing','shipped','delivered') THEN total_cents ELSE 0 END),0) AS paidCents,COUNT(CASE WHEN status IN ('demo_paid','test_paid') THEN 1 END) AS demoOrders,COUNT(CASE WHEN status='pending_payment' THEN 1 END) AS pending FROM orders").first<{paidOrders:number;paidCents:number;demoOrders:number;pending:number}>(),
    env.DB.prepare("SELECT COALESCE(SUM(CASE WHEN unknown=0 THEN lineMargin-discountCents ELSE 0 END),0) AS contributionCents,COUNT(CASE WHEN unknown>0 THEN 1 END) AS unknownCosts FROM (SELECT o.id,o.discount_cents AS discountCents,COALESCE(SUM((i.unit_price_cents-i.unit_cost_cents)*i.quantity),0) AS lineMargin,COALESCE(SUM(CASE WHEN i.unit_cost_cents IS NULL THEN 1 ELSE 0 END),0) AS unknown FROM orders o JOIN order_items i ON i.order_id=o.id WHERE o.status IN ('paid','preparing','shipped','delivered') GROUP BY o.id)").first<{contributionCents:number;unknownCosts:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS payingCustomers,COALESCE(SUM(CASE WHEN paidCount>=2 THEN 1 ELSE 0 END),0) AS repeatCustomers FROM (SELECT customer_id,COUNT(*) AS paidCount FROM orders WHERE status IN ('paid','preparing','shipped','delivered') GROUP BY customer_id)").first<{payingCustomers:number;repeatCustomers:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE status NOT IN ('demo_paid','test_paid')").first<{n:number}>(),
  ]);
  const list = orders.results as OrderRow[];
  const itemsByOrder = new Map<string,Array<{sku:string;quantity:number;unitPriceCents:number;unitCostCents:number|null}>>();
  for(const line of items.results as {orderId:string;sku:string;quantity:number;unitPriceCents:number;unitCostCents:number|null}[]) {
    itemsByOrder.set(line.orderId,[...(itemsByOrder.get(line.orderId)??[]),line]);
  }
  return Response.json({
    products:products.results,orders:list.map(order=>({...order,items:itemsByOrder.get(order.id)??[]})),clients:clients.results,
    events:events.results,movements:movements.results,
    metrics:{paidOrders:totals?.paidOrders??0,paidCents:totals?.paidCents??0,demoOrders:totals?.demoOrders??0,pending:totals?.pending??0,totalRequests:requests?.n??0,referrals:rewards?.n??0,verifiedPayments:payments?.n??0,verifiedAmountCents:payments?.total??0,contributionCents:costTotals?.contributionCents??0,unknownCosts:costTotals?.unknownCosts??0,payingCustomers:repeat?.payingCustomers??0,repeatCustomers:repeat?.repeatCustomers??0,notice:"Ingresos: solo pagos externos verificables; ONVO sandbox excluido. Contribución parcial antes de envío, impuestos y marketing."},
  });
}

export async function GET() {
  if(!await getAdmin()) return adminDenied();
  try { return await dashboard(); }
  catch { return Response.json({error:"No se pudieron consultar los datos administrativos."},{status:503}); }
}

export async function POST(request:Request) {
  const admin=await getAdmin();
  if(!admin) return adminDenied();
  if(!validSameOrigin(request)) return Response.json({error:"Origen no autorizado."},{status:403});
  let body:Action;
  try { body=await request.json() as Action; } catch { return Response.json({error:"Datos JSON inválidos."},{status:400}); }
  const now=Date.now();
  try {
    if(body.action==="seed") {
      const entries=PRODUCTS.map(p=>env.DB.prepare("INSERT OR IGNORE INTO products(sku,name,description,price_cents,cost_cents,stock,active,updated_at) VALUES(?,?,?,?,?,?,?,?)").bind(p.sku,p.name,p.description,p.priceCents,null,0,1,now));
      await env.DB.batch(entries);
      return Response.json({ok:true,message:"Catálogo inicial creado sin inventar existencias ni costos."});
    }
    if(body.action==="product") {
      if(!body.sku || !PRODUCTS.some(p=>p.sku===body.sku)) return Response.json({error:"SKU no permitido para este MVP."},{status:400});
      if(typeof body.name!=="string"||body.name.trim().length<3||body.name.length>80||typeof body.description!=="string"||body.description.trim().length<8||body.description.length>240) return Response.json({error:"Nombre y descripción no válidos."},{status:400});
      if(!Number.isInteger(body.priceCents)||body.priceCents!<100||body.priceCents!>100000) return Response.json({error:"Precio fuera del rango permitido."},{status:400});
      if(body.costCents!==null && body.costCents!==undefined && (!Number.isInteger(body.costCents)||body.costCents<0||body.costCents>100000)) return Response.json({error:"Costo no válido."},{status:400});
      if(body.costCents!==null && body.costCents!==undefined && body.costCents>=body.priceCents!) return Response.json({error:"El precio debe superar el costo variable conocido. Revisa el margen."},{status:400});
      await env.DB.prepare("UPDATE products SET name=?,description=?,price_cents=?,cost_cents=?,active=?,updated_at=? WHERE sku=?").bind(body.name.trim(),body.description.trim(),body.priceCents,body.costCents??null,body.active?1:0,now,body.sku).run();
      return Response.json({ok:true});
    }
    if(body.action==="stock") {
      if(!body.sku||!PRODUCTS.some(p=>p.sku===body.sku)||!Number.isInteger(body.delta)||!body.delta||Math.abs(body.delta)>10000||typeof body.reason!=="string"||body.reason.trim().length<5||body.reason.length>160) return Response.json({error:"Movimiento de inventario inválido."},{status:400});
      await env.DB.batch([
        env.DB.prepare("UPDATE products SET stock=stock+?,updated_at=? WHERE sku=?").bind(body.delta,now,body.sku),
        env.DB.prepare("INSERT INTO stock_movements(id,sku,delta,reason,order_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),body.sku,body.delta,body.reason.trim(),null,admin.userId,now),
      ]);
      return Response.json({ok:true});
    }
    if(body.action==="status") {
      const old=await env.DB.prepare("SELECT status FROM orders WHERE id=?").bind(body.orderId).first<{status:string}>();
      const next=body.nextStatus;
      const transitions:Record<string,string[]>={paid:["preparing"],preparing:["shipped"],shipped:["delivered"],pending_payment:["cancelled"]};
      if(!old || !next || !transitions[old.status]?.includes(next)) return Response.json({error:"Transición de estado no permitida."},{status:409});
      if(old.status==="pending_payment") {
        const session=await env.DB.prepare("SELECT order_id FROM payment_sessions WHERE order_id=?").bind(body.orderId).first();
        if(session) return Response.json({error:"No se puede cancelar un pedido con checkout iniciado hasta reconciliarlo con ONVO."},{status:409});
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE orders SET status=? WHERE id=? AND status=?").bind(next,body.orderId,old.status),
        env.DB.prepare("INSERT INTO order_status_events(id,order_id,from_status,to_status,actor_id,note,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),body.orderId,old.status,next,admin.userId,(body.note??"").slice(0,160),now),
      ]);
      return Response.json({ok:true});
    }
    if(body.action==="verify_payment") {
      if(typeof body.paymentReference!=="string"||!(/^[a-zA-Z0-9_./:-]{6,100}$/.test(body.paymentReference))||!(["transfer","sinpe","other"].includes(body.method??""))) return Response.json({error:"Indica una referencia verificable y un método de pago válido."},{status:400});
      const session=await env.DB.prepare("SELECT order_id FROM payment_sessions WHERE order_id=?").bind(body.orderId).first();
      if(session) return Response.json({error:"Este pedido tiene sesión ONVO: verifica en la pasarela antes de cualquier ajuste manual."},{status:409});
      const outcome=await fulfillVerifiedPayment({orderId:body.orderId??"",reference:body.paymentReference,method:body.method??"other",actorId:admin.userId});
      if(outcome.state==="not_pending") return Response.json({error:"Solo los pedidos pendientes pueden acreditarse."},{status:409});
      return Response.json({ok:true,message:outcome.state==="paid_review"?"Pago acreditado; falta inventario. Abastece y resuelve la revisión antes del despacho.":"Pago externo acreditado; inventario y recompensas actualizados."});
    }
    if(body.action==="resolve_review") {
      if(!body.orderId || !await resolvePaidReview(body.orderId,admin.userId)) return Response.json({error:"No hay stock suficiente para conciliar este pedido."},{status:409});
      return Response.json({ok:true,message:"Revisión conciliada, inventario asignado y pedido listo para preparar."});
    }
    return Response.json({error:"Acción desconocida."},{status:400});
  } catch {
    return Response.json({error:"Operación rechazada. Comprueba stock, referencias duplicadas y estado del pedido."},{status:409});
  }
}
