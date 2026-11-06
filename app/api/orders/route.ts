import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { quoteCart } from "../../../lib/catalog";
import { validSameOrigin } from "../../../lib/admin-auth";
import { validateDelivery, type Delivery } from "../../../lib/delivery";

export const runtime = "edge";
type Body = {items?: {sku:string;quantity:number}[]; referralCode?:string; idempotencyKey?:string;mode?:"request"|"demo";delivery?:Delivery};

export async function POST(request:Request) {
  const user=await getChatGPTUser();
  if(!user) return Response.json({error:"Debes iniciar sesión con ChatGPT para registrar el pedido."},{status:401});
  if(!validSameOrigin(request)) return Response.json({error:"Origen no autorizado."},{status:403});
  let body:Body;
  try{body=await request.json() as Body;}catch{return Response.json({error:"Solicitud inválida."},{status:400});}
  if(!body.idempotencyKey || !/^[a-zA-Z0-9-]{16,80}$/.test(body.idempotencyKey)) return Response.json({error:"Identificador de pedido inválido."},{status:400});
  if(body.mode!=="request" && body.mode!=="demo") return Response.json({error:"Selecciona el tipo de pedido."},{status:400});
  const existing=await env.DB.prepare("SELECT id,total_cents AS totalCents,status FROM orders WHERE idempotency_key=? AND customer_id=?").bind(body.idempotencyKey,user.userId).first();
  if(existing) return Response.json({ok:true,order:existing,replayed:true});
  let cart;
  try{cart=quoteCart(body.items??[]);}catch(error){return Response.json({error:(error as Error).message},{status:400});}
  const refCode=String(body.referralCode??"").toUpperCase().trim();
  const inviter=refCode ? await env.DB.prepare("SELECT customer_id AS customerId FROM referral_codes WHERE code=?").bind(refCode).first<{customerId:string}>() : null;
  const prev=await env.DB.prepare(body.mode==="request" ? "SELECT COUNT(*) AS total FROM orders WHERE customer_id=? AND status NOT IN ('demo_paid','cancelled')" : "SELECT COUNT(*) AS total FROM orders WHERE customer_id=?").bind(user.userId).first<{total:number}>();
  const alreadyReferred=await env.DB.prepare("SELECT id FROM referrals WHERE invitee_id=?").bind(user.userId).first();
  const eligible=!!inviter && inviter.customerId!==user.userId && !prev?.total && !alreadyReferred;
  try {cart=quoteCart(body.items??[],eligible);}catch(error){return Response.json({error:(error as Error).message},{status:400});}
  const now=Date.now(),orderId=crypto.randomUUID();
  if(body.mode==="request") {
    let delivery:Delivery;
    try {delivery=validateDelivery(body.delivery);}catch(error){return Response.json({error:(error as Error).message},{status:400});}
    const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE customer_id=? AND status='pending_payment'").bind(user.userId).first<{n:number}>();
    if((pending?.n??0)>=3) return Response.json({error:"Tienes tres solicitudes pendientes. Consulta primero su estado en Mis pedidos."},{status:429});
    const listed=await env.DB.prepare("SELECT sku,name,description,price_cents AS priceCents,cost_cents AS costCents,stock,active FROM products").all<{sku:string;name:string;description:string;priceCents:number;costCents:number|null;stock:number;active:number}>();
    const products=listed.results.filter(p=>p.active===1);
    if(!products.length) return Response.json({error:"El catálogo comercial aún no está habilitado. Mientras tanto puedes probar el pedido simulado."},{status:409});
    try {cart=quoteCart(body.items??[],eligible,products);}catch(error){return Response.json({error:(error as Error).message},{status:400});}
    const requestReferralEligible=eligible && cart.discountCents===800;
    for(const {product,quantity} of cart.normalized) {
      const inventory=products.find(p=>p.sku===product.sku);
      if(!inventory || inventory.stock<quantity) return Response.json({error:`${product.name} no tiene suficientes unidades disponibles para una solicitud.`},{status:409});
    }
    const statements=[
      env.DB.prepare("INSERT OR IGNORE INTO customers(id,email,display_name,created_at) VALUES(?,?,?,?)").bind(user.userId,user.email,user.displayName,now),
      env.DB.prepare("INSERT INTO orders(id,customer_id,status,subtotal_cents,discount_cents,shipping_cents,total_cents,referral_code,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(orderId,user.userId,"pending_payment",cart.subtotalCents,cart.discountCents,cart.shippingCents,cart.totalCents,requestReferralEligible?refCode:null,body.idempotencyKey,now),
      env.DB.prepare("INSERT INTO order_fulfillment(order_id,receiver_name,phone,province,canton,district,address,instructions,created_at) VALUES(?,?,?,?,?,?,?,?,?)").bind(orderId,delivery.receiverName,delivery.phone,delivery.province,delivery.canton,delivery.district,delivery.address,delivery.instructions,now),
      ...cart.normalized.map(({product,quantity})=>env.DB.prepare("INSERT INTO order_items(id,order_id,sku,quantity,unit_price_cents,unit_cost_cents) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),orderId,product.sku,quantity,product.priceCents,products.find(p=>p.sku===product.sku)?.costCents??null)),
      env.DB.prepare("INSERT INTO order_status_events(id,order_id,from_status,to_status,actor_id,note,created_at) VALUES(?,?,?,?,?,?,?)").bind(crypto.randomUUID(),orderId,"none","pending_payment",user.userId,"Solicitud creada: sin pago ni despacho",now),
    ];
    try { await env.DB.batch(statements); }
    catch { return Response.json({error:"No se pudo crear la solicitud; puedes volver a intentarlo."},{status:409}); }
    return Response.json({ok:true,order:{id:orderId,totalCents:cart.totalCents,discountCents:cart.discountCents,status:"pending_payment"},referred:requestReferralEligible,notice:"Solicitud recibida. El costo y las condiciones de entrega deben confirmarse antes del despacho. ONVO permanece desactivado hasta configurar pruebas."});
  }
  const firstSubscription=cart.normalized.some((item)=>item.product.frequency==="subscription");
  const type=firstSubscription?"subscription":"one_off";
  const instructions=[
    env.DB.prepare("INSERT OR IGNORE INTO customers(id,email,display_name,created_at) VALUES(?,?,?,?)").bind(user.userId,user.email,user.displayName,now),
    env.DB.prepare("INSERT INTO orders(id,customer_id,status,subtotal_cents,discount_cents,shipping_cents,total_cents,referral_code,idempotency_key,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)").bind(orderId,user.userId,"demo_paid",cart.subtotalCents,cart.discountCents,cart.shippingCents,cart.totalCents,eligible?refCode:null,body.idempotencyKey,now),
    ...cart.normalized.map(({product,quantity})=>env.DB.prepare("INSERT INTO order_items(id,order_id,sku,quantity,unit_price_cents) VALUES(?,?,?,?,?)").bind(crypto.randomUUID(),orderId,product.sku,quantity,product.priceCents)),
  ];
  if(eligible && inviter) {
    const referralId=crypto.randomUUID();
    instructions.push(env.DB.prepare("INSERT INTO referrals(id,code,inviter_id,invitee_id,order_id,type,created_at) VALUES(?,?,?,?,?,?,?)").bind(referralId,refCode,inviter.customerId,user.userId,orderId,type,now));
    instructions.push(env.DB.prepare("INSERT INTO rewards(id,referral_id,recipient_id,kind,cost_cents,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),referralId,user.userId,"friend_discount",800,now));
    if(type==="subscription") {
      instructions.push(env.DB.prepare("INSERT INTO rewards(id,referral_id,recipient_id,kind,cost_cents,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),referralId,inviter.customerId,"free_month_demo",1658,now));
    } else {
      instructions.push(env.DB.prepare("INSERT INTO rewards(id,referral_id,recipient_id,kind,cost_cents,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),referralId,inviter.customerId,"sample_100g",160,now));
      const count=await env.DB.prepare("SELECT COUNT(*) AS total FROM referrals WHERE inviter_id=? AND type='one_off'").bind(inviter.customerId).first<{total:number}>();
      if((count?.total??0)===2) instructions.push(env.DB.prepare("INSERT INTO rewards(id,referral_id,recipient_id,kind,cost_cents,created_at) VALUES(?,?,?,?,?,?)").bind(crypto.randomUUID(),referralId,inviter.customerId,"milestone_340g",544,now));
    }
  }
  instructions.push(env.DB.prepare("INSERT INTO events(id,referral_code,type,created_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),eligible?refCode:null,"demo_checkout",now));
  try {
    await env.DB.batch(instructions);
  } catch(error) {
    return Response.json({error:"No fue posible registrar el pedido. Inténtalo de nuevo."},{status:409});
  }
  return Response.json({ok:true,order:{id:orderId,totalCents:cart.totalCents,discountCents:cart.discountCents},referred:eligible,notice:"SIMULACIÓN: no se cobró dinero ni se envió café."});
}
