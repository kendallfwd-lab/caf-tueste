import { env } from "cloudflare:workers";

type Order = {id:string;customerId:string;status:string;totalCents:number;referralCode:string|null};
type Item = {sku:string;quantity:number};

async function rewardStatements(order:Order,items:Item[],now:number) {
  const statements:ReturnType<typeof env.DB.prepare>[]=[];
  if(!order.referralCode) return statements;
  const inviter=await env.DB.prepare("SELECT customer_id AS id FROM referral_codes WHERE code=?").bind(order.referralCode).first<{id:string}>();
  const prior=await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id=? AND status IN ('paid','paid_review','preparing','shipped','delivered') AND id<>?").bind(order.customerId,order.id).first<{n:number}>();
  const awarded=await env.DB.prepare("SELECT id FROM referrals WHERE invitee_id=?").bind(order.customerId).first();
  if(!inviter||inviter.id===order.customerId||prior?.n||awarded) return statements;
  const subscription=items.some(item=>item.sku==="club");
  const referralId=crypto.randomUUID();
  statements.push(env.DB.prepare("INSERT INTO referrals(id,code,inviter_id,invitee_id,order_id,type,created_at) VALUES(?,?,?,?,?,?,?)").bind(referralId,order.referralCode,inviter.id,order.customerId,order.id,subscription?"subscription":"one_off",now));
  statements.push(env.DB.prepare("INSERT INTO rewards(id,referral_id,recipient_id,kind,cost_cents,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),referralId,order.customerId,"friend_discount",800,now));
  statements.push(env.DB.prepare("INSERT INTO rewards(id,referral_id,recipient_id,kind,cost_cents,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),referralId,inviter.id,subscription?"free_month_demo":"sample_100g",subscription?1658:160,now));
  if(!subscription) {
    const count=await env.DB.prepare("SELECT COUNT(*) AS n FROM referrals WHERE inviter_id=? AND type='one_off'").bind(inviter.id).first<{n:number}>();
    if(count?.n===2) statements.push(env.DB.prepare("INSERT INTO rewards(id,referral_id,recipient_id,kind,cost_cents,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),referralId,inviter.id,"milestone_340g",544,now));
  }
  return statements;
}

export async function fulfillVerifiedPayment(input:{orderId:string;reference:string;method:string;actorId:string;eventId?:string;sessionId?:string}) {
  const now=Date.now();
  const order=await env.DB.prepare("SELECT id,customer_id AS customerId,status,total_cents AS totalCents,referral_code AS referralCode FROM orders WHERE id=?").bind(input.orderId).first<Order>();
  if(!order || order.status!=="pending_payment") return {state:"not_pending" as const};
  const lines=await env.DB.prepare("SELECT sku,quantity FROM order_items WHERE order_id=?").bind(order.id).all<Item>();
  if(!lines.results.length) throw new Error("El pedido no tiene artículos.");
  const availability=await env.DB.prepare("SELECT sku,stock FROM products").all<{sku:string;stock:number}>();
  const need=new Map<string,number>();
  for(const line of lines.results) need.set(line.sku,(need.get(line.sku)??0)+line.quantity);
  const short=Array.from(need).some(([sku,qty])=>(availability.results.find(p=>p.sku===sku)?.stock??0)<qty);
  // A successful sandbox charge is never a real sale: no stock movements or real referral credits.
  const simulated=input.method==="onvo_test";
  const status=simulated?"test_paid":short?"paid_review":"paid";
  const statements:ReturnType<typeof env.DB.prepare>[]=[
    env.DB.prepare("INSERT INTO payment_records(id,order_id,method,reference,amount_cents,verified_by,verified_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),order.id,input.method,input.reference,order.totalCents,input.actorId,now),
    env.DB.prepare("UPDATE orders SET status=? WHERE id=? AND status='pending_payment'").bind(status,order.id),
    env.DB.prepare("INSERT INTO order_status_events(id,order_id,from_status,to_status,actor_id,note,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),order.id,"pending_payment",status,input.actorId,simulated?"ONVO sandbox: pago de prueba, sin venta ni movimiento físico.":short?"Pago acreditado: revisar falta de inventario antes de preparar.":`Pago verificado por ${input.method}`,now),
  ];
  if(!short && !simulated) {
    for(const [sku,qty] of need) {
      statements.push(env.DB.prepare("UPDATE products SET stock=stock-?,updated_at=? WHERE sku=?").bind(qty,now,sku));
      statements.push(env.DB.prepare("INSERT INTO stock_movements(id,sku,delta,reason,order_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),sku,-qty,"Venta pagada verificada",order.id,input.actorId,now));
    }
    statements.push(...await rewardStatements(order,lines.results,now));
  }
  if(input.eventId&&input.sessionId) statements.push(env.DB.prepare("INSERT INTO payment_webhook_events(event_id,session_id,event_type,processed_at) VALUES(?,?,?,?)").bind(input.eventId,input.sessionId,"checkout_session.succeeded",now));
  await env.DB.batch(statements);
  return {state:status as "paid"|"paid_review"|"test_paid"};
}

export async function resolvePaidReview(orderId:string,adminId:string) {
  const order=await env.DB.prepare("SELECT id,customer_id AS customerId,status,total_cents AS totalCents,referral_code AS referralCode FROM orders WHERE id=?").bind(orderId).first<Order>();
  if(!order||order.status!=="paid_review") return false;
  const lines=await env.DB.prepare("SELECT sku,quantity FROM order_items WHERE order_id=?").bind(order.id).all<Item>();
  const available=await env.DB.prepare("SELECT sku,stock FROM products").all<{sku:string;stock:number}>();
  const need=new Map<string,number>();for(const line of lines.results)need.set(line.sku,(need.get(line.sku)??0)+line.quantity);
  if(!need.size||Array.from(need).some(([sku,qty])=>(available.results.find(p=>p.sku===sku)?.stock??0)<qty)) return false;
  const now=Date.now();
  const statements:ReturnType<typeof env.DB.prepare>[]=[
    env.DB.prepare("UPDATE orders SET status='paid' WHERE id=? AND status='paid_review'").bind(order.id),
    env.DB.prepare("INSERT INTO order_status_events(id,order_id,from_status,to_status,actor_id,note,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),order.id,"paid_review","paid",adminId,"Existencias restablecidas y asignadas",now),
  ];
  for(const [sku,qty] of need) {
    statements.push(env.DB.prepare("UPDATE products SET stock=stock-?,updated_at=? WHERE sku=?").bind(qty,now,sku));
    statements.push(env.DB.prepare("INSERT INTO stock_movements(id,sku,delta,reason,order_id,actor_id,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),sku,-qty,"Asignación tras revisión de pago",order.id,adminId,now));
  }
  statements.push(...await rewardStatements(order,lines.results,now));
  await env.DB.batch(statements);
  return true;
}
