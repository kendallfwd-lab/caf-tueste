"use client";

import { useState } from "react";
import { ArrowRight, Check, Coffee, Package, ShieldCheck, Truck } from "lucide-react";
import type { SKU, Sellable } from "../lib/catalog";
import { priceText } from "../lib/catalog";

type Choice="everyday"|"explore"|"monthly";
const suggestions:Record<Choice,{sku:SKU;eyebrow:string;why:string;detail:string}>={
  everyday:{sku:"duo",eyebrow:"PARA EMPEZAR",why:"Dos bolsas, sin complicaciones.",detail:"Ideal si quieres conocer el catálogo con una compra puntual de 2 × 340 g."},
  explore:{sku:"explorer",eyebrow:"PARA COMPARTIR",why:"Un pack con más café.",detail:"Tres bolsas de 340 g para tener más unidades por pedido. Comprueba el costo de envío antes de decidir."},
  monthly:{sku:"club",eyebrow:"PARA REPETIR",why:"Tu ritual mensual, a tu ritmo.",detail:"El Club es una propuesta del caso académico: la compra actual es única y no activa cobros recurrentes."},
};

export function CoffeeFinder({products,onAdd,onChoose}:{products:readonly Sellable[];onAdd:(sku:SKU)=>void;onChoose?:(choice:Choice)=>void}) {
  const [choice,setChoice]=useState<Choice>("everyday");
  const selected=suggestions[choice];
  const product=products.find(p=>p.sku===selected.sku);
  function choose(next:Choice) {setChoice(next);onChoose?.(next);}
  return <section className="coffee-finder section-pad" id="elige" aria-labelledby="finder-title">
    <div className="finder-copy"><span className="eyebrow">02 — ENCUENTRA TU RITUAL</span><h2 id="finder-title">El buen café<br/><em>empieza eligiendo bien.</em></h2><p>No necesitas saber de tueste ni de variedades para comenzar. Elige cómo quieres disfrutar tu café y te mostramos el formato que mejor encaja.</p><div className="finder-trust"><span><Coffee size={16}/> Bolsas de 340 g</span><span><ShieldCheck size={16}/> Sin cobro al solicitar</span><span><Truck size={16}/> Entrega por coordinar</span></div></div>
    <div className="finder-panel"><span className="finder-step">TU GUÍA DE COMPRA / 01</span><h3>¿Qué estás buscando?</h3><div className="finder-options" role="group" aria-label="Seleccionar formato de café">
      <button aria-pressed={choice==="everyday"} className={choice==="everyday"?"selected":""} onClick={()=>choose("everyday")}><span>01</span><strong>Para mi día a día</strong><small>Empezar con dos bolsas</small>{choice==="everyday"&&<Check size={16}/>}</button>
      <button aria-pressed={choice==="explore"} className={choice==="explore"?"selected":""} onClick={()=>choose("explore")}><span>02</span><strong>Quiero compartir</strong><small>Tres bolsas en un pack</small>{choice==="explore"&&<Check size={16}/>}</button>
      <button aria-pressed={choice==="monthly"} className={choice==="monthly"?"selected":""} onClick={()=>choose("monthly")}><span>03</span><strong>Me gusta repetir</strong><small>Probar el formato Club</small>{choice==="monthly"&&<Check size={16}/>}</button>
    </div><div className="finder-result" aria-live="polite"><div><span>{selected.eyebrow}</span><h4>{product?.name??"Tueste Café"}</h4><strong>{selected.why}</strong><p>{selected.detail}</p></div><div className="finder-result-footer"><span>{product?priceText(product.priceCents):"Consultar precio"}</span><button onClick={()=>onAdd(selected.sku)} disabled={!product}>Agregar al carrito <ArrowRight size={16}/></button></div></div></div>
  </section>;
}

const questions=[
  {q:"¿Ya puedo pagar con tarjeta?",a:"La pasarela ONVO está integrada únicamente para pruebas y permanece desactivada hasta configurar credenciales de sandbox. Tu solicitud inicial no realiza ningún cargo real."},
  {q:"¿En qué moneda están los precios?",a:"Los precios visibles corresponden al caso académico y están en dólares estadounidenses (USD). Antes de vender en Costa Rica se definirán precios, impuestos y condiciones comerciales finales."},
  {q:"¿Cuánto cuesta el envío en Costa Rica?",a:"La cobertura, el costo y el plazo se coordinan con cada solicitud. El monto visible en el carrito corresponde al café y no incluye una tarifa de envío pendiente de definir."},
  {q:"¿El Club me cobra automáticamente cada mes?",a:"No. El Club se presenta como propuesta comercial, pero actualmente solo crea una solicitud de compra única. No existen cargos recurrentes activados."},
  {q:"¿Qué ocurre después de solicitar el pedido?",a:"Guardamos tu solicitud y tus datos de entrega; podrás ver el estado en Mis pedidos. El equipo debe confirmar existencias, logística y método de pago antes de preparar un envío real."},
  {q:"¿Qué pasa si tengo un código de un amigo?",a:"El sistema comprueba que sea tu primera compra elegible. Las recompensas reales solo se acreditan tras confirmar un pago externo válido; las pruebas no representan ventas ni premios físicos."},
];

export function PurchaseConfidence() {
  return <>
    <section className="purchase-steps section-pad" id="como-funciona" aria-labelledby="purchase-title"><div className="purchase-heading"><span className="eyebrow">03 — DE TU ELECCIÓN A TU TAZA</span><h2 id="purchase-title">Una compra clara.<br/><em>Sin sorpresas.</em></h2><p>La plataforma conserva el estado de cada solicitud y separa con claridad los ensayos de las ventas verificadas.</p></div><div className="purchase-grid"><article><span>01</span><Package size={27}/><h3>Elige tu pack</h3><p>Explora los formatos, verifica cantidades y revisa el total estimado del café.</p></article><article><span>02</span><Coffee size={27}/><h3>Deja tu solicitud</h3><p>Completa tus datos de entrega en Costa Rica. Solicitar no significa pagar.</p></article><article><span>03</span><ShieldCheck size={27}/><h3>Sigue tu pedido</h3><p>Consulta el historial. El pago y las condiciones de despacho deben confirmarse.</p></article></div></section>
    <section className="faq-section section-pad" id="faq" aria-labelledby="faq-title"><div className="faq-intro"><span className="eyebrow">PREGUNTAS FRECUENTES</span><h2 id="faq-title">Todo claro,<br/><em>desde el primer sorbo.</em></h2><p>La confianza también se construye diciendo qué está disponible y qué sigue en preparación.</p><a href="/pedidos">Consultar mis pedidos <ArrowRight size={16}/></a></div><div className="faq-list">{questions.map((item,i)=><details key={item.q} open={i===0}><summary><span>{String(i+1).padStart(2,"0")}</span>{item.q}<span aria-hidden="true" className="faq-plus">+</span></summary><p>{item.a}</p></details>)}</div></section>
  </>;
}
