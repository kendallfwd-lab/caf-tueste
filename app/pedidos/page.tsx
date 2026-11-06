import Link from "next/link";
import { env } from "cloudflare:workers";
import { requireChatGPTUser } from "../chatgpt-auth";
import OrderPayment from "../../components/order-payment";
import { onvoConfig } from "../../lib/onvo";
import "../admin.css";

export const dynamic = "force-dynamic";
type Order = {id:string;status:string;totalCents:number;createdAt:number;discountCents:number};
type Timeline = {orderId:string;toStatus:string;note:string;createdAt:number};
const labels:Record<string,string>={demo_paid:"Simulación",test_paid:"ONVO de prueba",pending_payment:"Pendiente de pago",paid:"Pago verificado",paid_review:"Pago registrado · revisar stock",preparing:"Preparando",shipped:"En camino",delivered:"Entregado",cancelled:"Cancelado"};

export default async function OrdersPage() {
  const user=await requireChatGPTUser("/pedidos");
  const result=await env.DB.prepare("SELECT id,status,total_cents AS totalCents,discount_cents AS discountCents,created_at AS createdAt FROM orders WHERE customer_id=? ORDER BY created_at DESC LIMIT 50").bind(user.userId).all<Order>();
  const events=await env.DB.prepare("SELECT e.order_id AS orderId,e.to_status AS toStatus,e.note,e.created_at AS createdAt FROM order_status_events e JOIN orders o ON o.id=e.order_id WHERE o.customer_id=? ORDER BY e.created_at DESC LIMIT 150").bind(user.userId).all<Timeline>();
  const onvoEnabled=onvoConfig().enabled;
  return <main className="account-page">
    <header><Link href="/" className="admin-logo">TUESTE<span>.</span></Link><Link href="/">← Volver a la tienda</Link></header>
    <section className="account-head"><span>MI CUENTA / HISTORIAL</span><h1>Mis pedidos<span>.</span></h1><p>Consulta tu solicitud y su trazabilidad. Los pagos ONVO solo son de prueba y no representan ventas, cobros reales ni envíos. Precios piloto en USD; condiciones logísticas por confirmar.</p></section>
    <div className="account-orders">{result.results.length ? result.results.map(order=><article key={order.id}>
      <div><small>ORDEN · {new Date(order.createdAt).toLocaleDateString("es-CR")}</small><h2>#{order.id.slice(0,8).toUpperCase()}</h2><p>Importe del café: {new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(order.totalCents/100)} · Descuento: ${(order.discountCents/100).toFixed(2)}</p><div className="account-timeline">{events.results.filter(e=>e.orderId===order.id).slice(0,4).map((e,index)=><p key={`${e.orderId}-${e.createdAt}-${index}`}>{new Date(e.createdAt).toLocaleDateString("es-CR")} · {labels[e.toStatus]??e.toStatus}{e.toStatus==="paid_review"?" · verificar inventario":""}</p>)}</div></div>
      <div className="order-status"><span className={`status-pill ${order.status}`}>{labels[order.status]??order.status}</span><small>{order.status==="pending_payment"?"Pedido sin pagar; la entrega debe coordinarse. No se ha generado un cargo.":order.status==="test_paid"?"Confirmado en entorno de pruebas ONVO. No se descontó stock.":order.status==="demo_paid"?"Pedido de práctica, sin cobro ni envío.":order.status==="paid_review"?"Pago manual acreditado: el equipo debe reponer inventario.":order.status==="paid"?"Pago externo acreditado; pendiente de preparación.":"Estado registrado en Tueste."}</small>{order.status==="pending_payment"&&<OrderPayment id={order.id} enabled={onvoEnabled}/>}</div>
    </article>) : <div className="account-empty"><h2>Tu historia comienza con una taza.</h2><p>Todavía no hay pedidos asociados a tu cuenta.</p><Link href="/">Descubrir el café →</Link></div>}</div>
  </main>;
}
