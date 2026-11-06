"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Coffee, Gift, Minus, Plus, ShoppingBag, X } from "lucide-react";
import { CR_PROVINCES, validateDelivery, type Delivery } from "../lib/delivery";
import { priceText, type SKU, type Sellable } from "../lib/catalog";

type Item={sku:SKU;quantity:number};
type Total={subtotalCents:number;discountCents:number;shippingCents:number;totalCents:number}|null;
type CatalogEntry={sku:string;stock:number;active:number};

export default function CartDrawer({cart,products,quantity,total,referral,delivery,onDelivery,onQty,onClose,onCheckout,busy,catalogConfigured,liveCatalog}:{
  cart:Item[];products:readonly Sellable[];quantity:number;total:Total;referral:string;delivery:Delivery;onDelivery:(d:Delivery)=>void;
  onQty:(sku:SKU,diff:number)=>void;onClose:()=>void;onCheckout:(mode:"request"|"demo")=>void;busy:boolean;
  catalogConfigured:boolean;liveCatalog:CatalogEntry[];
}) {
  const [step,setStep]=useState<"cart"|"delivery">("cart");
  const [error,setError]=useState("");
  const panelRef=useRef<HTMLElement>(null);
  const closeRef=useRef<HTMLButtonElement>(null);
  const closeHandlerRef=useRef(onClose);
  useEffect(()=>{closeHandlerRef.current=onClose;},[onClose]);
  const unavailable=catalogConfigured&&cart.some(item=>{
    const row=liveCatalog.find(p=>p.sku===item.sku);
    return !row||row.active!==1||row.stock<item.quantity;
  });

  useEffect(()=>{
    const last=document.activeElement as HTMLElement|null;
    const previous=document.body.style.overflow;
    document.body.style.overflow="hidden";
    closeRef.current?.focus();
    function keydown(event:KeyboardEvent) {
      if(event.key==="Escape") {event.preventDefault();closeHandlerRef.current();return;}
      if(event.key!=="Tab"||!panelRef.current)return;
      const focusables=Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]'));
      if(!focusables.length)return;
      const first=focusables[0],lastItem=focusables[focusables.length-1];
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();lastItem.focus();}
      else if(!event.shiftKey&&document.activeElement===lastItem){event.preventDefault();first.focus();}
    }
    document.addEventListener("keydown",keydown);
    return ()=>{document.body.style.overflow=previous;document.removeEventListener("keydown",keydown);last?.focus();};
  },[]);

  function requestOrder(event:React.FormEvent<HTMLFormElement>) {
    event.preventDefault();setError("");
    try {validateDelivery(delivery);}catch(problem){setError((problem as Error).message);return;}
    if(unavailable){setError("Una o más unidades no están disponibles. Ajusta tu carrito.");return;}
    onCheckout("request");
  }

  return <div className="cart-overlay" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <aside ref={panelRef} className="cart-panel cart-panel-v4" role="dialog" aria-modal="true" aria-label="Carrito de Tueste Café">
      <div className="cart-head"><div><span className="eyebrow">{step==="cart"?"01 / REVISA TU CAFÉ":"02 / COORDINA LA ENTREGA"}</span><h2>{step==="cart"?"Mi carrito":"Tu entrega"} <span>({quantity})</span></h2></div><button ref={closeRef} aria-label="Cerrar carrito" type="button" onClick={onClose}><X size={23}/></button></div>
      <div className="cart-progress" aria-label="Paso de la solicitud"><span className="active">Carrito</span><span className={step==="delivery"?"active":""}>Datos de entrega</span><span>Confirmación</span></div>
      {step==="cart"?<>
        <div className="cart-products">{cart.length?cart.map(item=>{const product=products.find(p=>p.sku===item.sku)!;return <div className="cart-line" key={item.sku}><div className={`mini-product product-${product.tone}`}><Coffee size={35}/></div><div><h3>{product.name}</h3><p>{priceText(product.priceCents)} por pack</p><div className="qty-control"><button aria-label={`Reducir ${product.name}`} onClick={()=>onQty(item.sku,-1)}><Minus size={13}/></button>{item.quantity}<button aria-label={`Aumentar ${product.name}`} onClick={()=>onQty(item.sku,1)} disabled={item.quantity>=5}><Plus size={13}/></button></div></div><strong>{priceText(product.priceCents*item.quantity)}</strong></div>}):<div className="cart-empty"><ShoppingBag size={42}/><h3>Tu próxima taza te espera.</h3><p>Elige tu café favorito para empezar.</p><button className="button button-dark" onClick={onClose}>Seguir explorando</button></div>}</div>
        {cart.length>0&&<div className="cart-summary v4-summary">{referral&&<div className="cart-gift"><Gift size={16}/> Invitación aplicada* · sujeta a elegibilidad.</div>}<div><span>Subtotal</span><strong>{priceText(total?.subtotalCents??0)}</strong></div>{referral&&<div className="cart-discount"><span>Descuento estimado*</span><strong>−{priceText(total?.discountCents??0)}</strong></div>}<div><span>Envío</span><strong>Se coordina aparte</strong></div><div className="cart-total"><span>Total del café</span><strong>{priceText(total?.totalCents??0)}</strong></div>{unavailable&&<p className="cart-warning" role="alert">No hay suficientes unidades para solicitar este carrito actualmente. Puedes modificar cantidades o probar la simulación.</p>}<button className="button button-dark checkout" disabled={busy||unavailable} onClick={()=>setStep("delivery")}>Continuar a entrega <ArrowRight size={18}/></button><button className="demo-checkout" disabled={busy} onClick={()=>onCheckout("demo")}>Hacer una compra simulada <ArrowRight size={15}/></button><small>*Importe piloto en USD. Solicitar no realiza un cobro; envío, tasas y condiciones comerciales quedan por confirmar.</small></div>}
      </>:<form className="cart-summary cart-delivery-step" onSubmit={requestOrder}>
        <button className="cart-back" type="button" onClick={()=>{setStep("cart");setError("");}}><ArrowLeft size={15}/> Volver a mi carrito</button>
        <div className="delivery-fields"><strong>¿Dónde coordinamos tu pedido?</strong><p>Solo aceptamos direcciones en Costa Rica para esta fase del proyecto.</p><label>Nombre de quien recibe<input required autoComplete="name" value={delivery.receiverName} maxLength={90} minLength={3} onChange={e=>onDelivery({...delivery,receiverName:e.target.value})} placeholder="Nombre y apellido"/></label><label>Teléfono de contacto<input required autoComplete="tel" value={delivery.phone} maxLength={18} inputMode="tel" onChange={e=>onDelivery({...delivery,phone:e.target.value})} placeholder="8888 8888"/></label><label>Provincia<select value={delivery.province} onChange={e=>onDelivery({...delivery,province:e.target.value})}>{CR_PROVINCES.map(p=><option key={p}>{p}</option>)}</select></label><div className="delivery-row"><label>Cantón<input required minLength={2} maxLength={65} value={delivery.canton} onChange={e=>onDelivery({...delivery,canton:e.target.value})}/></label><label>Distrito<input required minLength={2} maxLength={65} value={delivery.district} onChange={e=>onDelivery({...delivery,district:e.target.value})}/></label></div><label>Dirección y señas<textarea required minLength={12} rows={2} maxLength={240} value={delivery.address} onChange={e=>onDelivery({...delivery,address:e.target.value})} placeholder="Barrio, calle, casa, puntos de referencia"/></label><label>Instrucciones opcionales<input value={delivery.instructions} maxLength={240} onChange={e=>onDelivery({...delivery,instructions:e.target.value})}/></label></div>
        <div className="cart-final-recap"><span>Total estimado del café (USD)</span><strong>{priceText(total?.totalCents??0)}</strong></div>
        <p className="cart-terms">El envío no está incluido ni cotizado. El equipo confirmará disponibilidad, tarifa logística y condiciones antes de despachar. ONVO solo funciona en pruebas y no activa pagos reales.</p>
        {error&&<p className="cart-warning" role="alert">{error}</p>}
        <button className="button button-dark checkout" disabled={busy||unavailable} type="submit">{busy?"Guardando solicitud…":"Registrar solicitud · sin cobro"} <ArrowRight size={17}/></button>
        <small>No se crea ninguna suscripción automática. Tus datos son visibles únicamente para administrar la solicitud.</small>
      </form>}
    </aside>
  </div>;
}
