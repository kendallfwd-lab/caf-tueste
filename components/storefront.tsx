"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCircle2, ChevronDown, Coffee, Gift, Leaf, Menu, Minus, Package, Plus, ShoppingBag, Sparkles, Truck, Users, X } from "lucide-react";
import { PRODUCTS, priceText, quoteCart, type SKU } from "../lib/catalog";
import type { Delivery } from "../lib/delivery";
import CartDrawer from "./cart-drawer";
import { CoffeeFinder, PurchaseConfidence } from "./commerce-guide";

type CartItem = {sku:SKU;quantity:number};
type CatalogEntry = {sku:string;name:string;description:string;priceCents:number;stock:number;active:number};
type ReferralProfile = {code:string|null;total:number;oneOff:number;subscribers:number;rewards:{kind:string;costCents:number;createdAt:number}[]};
const REWARDS:Record<string,string>={friend_discount:"Regalo de US$8 al amigo",sample_100g:"Muestra de 100 g",milestone_340g:"Bolsa de 340 g por 3 amigos",free_month_demo:"Mes de Club Tueste (demo)"};
function newClientId(){
  return typeof crypto!=="undefined"&&typeof crypto.randomUUID==="function"
    ? crypto.randomUUID() : `demo-${Date.now()}-${Math.random().toString(36).slice(2,12)}`;
}

export default function Storefront() {
  const [cart,setCart]=useState<CartItem[]>([]);
  const [cartOpen,setCartOpen]=useState(false);
  const [referral,setReferral]=useState("");
  const [toast,setToast]=useState("");
  const [busy,setBusy]=useState(false);
  const [ordered,setOrdered]=useState(false);
  const [hasOrder,setHasOrder]=useState(false);
  const [delivered,setDelivered]=useState(false);
  const [referralProfile,setReferralProfile]=useState<ReferralProfile|null>(null);
  const [rewardBusy,setRewardBusy]=useState(false);
  const [section,setSection]=useState<"shop"|"rewards">("shop");
  const [mobileOpen,setMobileOpen]=useState(false);
  const [consent,setConsent]=useState<"all"|"essential"|null>(null);
  const [refCopied,setRefCopied]=useState(false);
  const [liveCatalog,setLiveCatalog]=useState<CatalogEntry[]>([]);
  const [catalogConfigured,setCatalogConfigured]=useState(false);
  const [orderKind,setOrderKind]=useState<"demo"|"request">("demo");
  const [orderId,setOrderId]=useState("");
  const [delivery,setDelivery]=useState<Delivery>({receiverName:"",phone:"",province:"Puntarenas",canton:"",district:"",address:"",instructions:""});

  useEffect(()=>{
    const code=new URLSearchParams(window.location.search).get("ref");
    if(code && /^TUE-[A-Z0-9]{8}$/i.test(code)) {
      setReferral(code.toUpperCase());
    }
    const accepted=window.localStorage.getItem("tueste-cookie-choice");
    if(accepted==="all"||accepted==="essential") setConsent(accepted);
    fetch("/api/referrals").then(r=>r.ok?r.json():null).then((data:unknown)=>{if(data&&typeof data==="object")setReferralProfile(data as ReferralProfile);}).catch(()=>{});
    fetch("/api/catalog").then(r=>r.ok?r.json():null).then((value:unknown)=>{const data=value as {products?:CatalogEntry[];configured?:boolean}|null;if(data?.configured){setLiveCatalog(data.products??[]);setCatalogConfigured(true);}}).catch(()=>{});
  },[]);

  useEffect(()=>{
    if(consent!=="all"||!referral) return;
    fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"landing_opened",code:referral})}).catch(()=>{});
  },[consent,referral]);

  useEffect(()=>{
    if(!toast)return;
    const id=setTimeout(()=>setToast(""),4600);
    return ()=>clearTimeout(id);
  },[toast]);

  const displayProducts=useMemo(()=>PRODUCTS.map(p=>{const live=liveCatalog.find(c=>c.sku===p.sku);return live?{...p,name:live.name,description:live.description.replace(/envío incluido/gi,"entrega por coordinar"),priceCents:live.priceCents}:p;}),[liveCatalog]);
  const cartTotal=useMemo(()=>{
    try{return quoteCart(cart,!!referral,displayProducts);}catch{return null;}
  },[cart,referral,displayProducts]);
  const cartQuantity=cart.reduce((sum,i)=>sum+i.quantity,0);

  function go(to:"shop"|"rewards") {
    setSection(to);setMobileOpen(false);setCartOpen(false);
    window.scrollTo({top:0,behavior:"smooth"});
  }
  function jumpTo(id:string) {
    setSection("shop");setMobileOpen(false);setCartOpen(false);
    requestAnimationFrame(()=>document.getElementById(id)?.scrollIntoView({behavior:"smooth",block:"start"}));
  }
  function add(sku:SKU) {
    setCart(items=>{
      const found=items.find(item=>item.sku===sku);
      return found?items.map(item=>item.sku===sku?{...item,quantity:Math.min(5,item.quantity+1)}:item):[...items,{sku,quantity:1}];
    });
    setCartOpen(true);
    if(consent==="all")fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"cart_started",code:referral||undefined})}).catch(()=>{});
  }
  function changeQty(sku:SKU,diff:number) {
    setCart(items=>items.map(item=>item.sku===sku?{...item,quantity:Math.max(0,Math.min(5,item.quantity+diff))}:item).filter(item=>item.quantity>0));
  }
  async function checkout(mode:"demo"|"request") {
    if(!cart.length||busy)return;
    setBusy(true);
    try{
      if(consent==="all"&&mode==="request")fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"checkout_started",code:referral||undefined})}).catch(()=>{});
      const res=await fetch("/api/orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:cart,referralCode:referral||undefined,idempotencyKey:newClientId(),mode,delivery:mode==="request"?delivery:undefined})});
      const body=await res.json() as {ok?:boolean;error?:string;order?:{totalCents:number;id:string};referred?:boolean};
      if(!res.ok) {
        if(res.status===401&&mode==="demo") {
          setToast("Modo vista previa: el pedido se simuló en tu navegador. Inicia sesión para guardar pedidos de prueba.");
        } else throw Error(body.error||"No se pudo crear el pedido.");
      } else setToast(mode==="request"?"Solicitud registrada. Está pendiente de pago; revisa Mis pedidos.":body.referred?"¡Pedido de prueba registrado! Tu regalo se aplicó y el premio se acreditó.":"¡Pedido de prueba registrado! No se realizó ningún cobro.");
      setOrderKind(mode);setOrderId(body.order?.id??"");setOrdered(true);setHasOrder(mode==="demo");setDelivered(false);setCart([]);setCartOpen(false);
    }catch(error){setToast((error as Error).message);}finally{setBusy(false);}
  }
  async function makeLink() {
    if(rewardBusy)return;
    setRewardBusy(true);
    try{
      const result=await fetch("/api/referrals",{method:"POST"});
      const data=await result.json() as ReferralProfile&{error?:string};
      if(!result.ok)throw Error(data.error||"No pudimos crear tu enlace.");
      setReferralProfile(data);
      setToast("Tu enlace personal está listo para compartir.");
    }catch(e){setToast((e as Error).message+" En la web publicada privada puedes usar tu cuenta de ChatGPT.");}
    finally{setRewardBusy(false);}
  }
  const link=referralProfile?.code?`${typeof window!=="undefined"?window.location.origin:""}/?ref=${referralProfile.code}`:"";
  async function share() {
    if(!link)return;
    const message=`Probé un café de especialidad increíble ☕ Te regalo US$8 en tu primera compra de Tueste. Entra aquí y ya tendrás el regalo aplicado: ${link}`;
    if(consent==="all")fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"invitation_shared",code:referralProfile?.code})}).catch(()=>{});
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`,"_blank","noopener,noreferrer");
  }
  async function copy() {
    if(!link)return;
    try{await navigator.clipboard.writeText(link);setRefCopied(true);setTimeout(()=>setRefCopied(false),2200);}catch{setToast("No se pudo copiar automáticamente. Puedes seleccionar el enlace.");}
  }
  function chooseCookie(choice:"all"|"essential") {
    window.localStorage.setItem("tueste-cookie-choice",choice);setConsent(choice);
  }

  return <div className="site-root">
    <div className="announcement"><span className="announcement-dot"/> CAFÉ DE ESPECIALIDAD, SIN PRISA Y SIN INTERMEDIARIOS <span className="announcement-divider">•</span> <a href="#coleccion" onClick={()=>setSection("shop")}>EXPLORA NUESTRO CAFÉ <ArrowUpRight size={12}/></a></div>
    <header className="topbar">
      <a className="brand" href="/" onClick={e=>{e.preventDefault();go("shop")}}><span className="brand-icon"><Coffee size={22} strokeWidth={1.8}/></span><span>TUESTE<span className="brand-period">.</span></span></a>
      <nav className={`navigation ${mobileOpen?"navigation-open":""}`} aria-label="Navegación principal">
        <button onClick={()=>go("shop")} className={section==="shop"?"active":""}>Nuestro café</button>
        <button onClick={()=>jumpTo("elige")}>¿Cuál elegir?</button>
        <button onClick={()=>go("rewards")} className={section==="rewards"?"active":""}>Regala una taza <span className="tiny-pill">NUEVO</span></button>
        <button onClick={()=>jumpTo("faq")}>Preguntas</button>
        <a href="/pedidos">Mis pedidos <ArrowUpRight size={12}/></a>
      </nav>
      <div className="header-actions">
        <span className="header-caption">TU RITUAL DIARIO</span>
        <button className="cart-trigger" aria-label={`Abrir carrito con ${cartQuantity} artículos`} onClick={()=>setCartOpen(true)}><ShoppingBag size={19}/>{cartQuantity>0&&<span>{cartQuantity}</span>}</button>
        <button className="menu-trigger" aria-label="Abrir menú" onClick={()=>setMobileOpen(!mobileOpen)}>{mobileOpen?<X size={23}/>:<Menu size={23}/>}</button>
      </div>
    </header>

    {section==="shop"?<>
      {referral && <div className="gift-banner"><Gift size={17}/> <span>¡Alguien te invitó a descubrir Tueste! Tu regalo de <strong>US$8</strong> está listo para tu primera compra de demostración.</span><button onClick={()=>document.getElementById("coleccion")?.scrollIntoView({behavior:"smooth"})}>Elegir café <ArrowRight size={14}/></button></div>}
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-image"/>
        <div className="hero-vignette"/>
        <div className="hero-content">
          <span className="eyebrow light"><span className="accent-line"/> DE LA FINCA A TU TAZA</span>
          <h1 id="hero-title">Buen café.<br/><em>Buenas historias.</em></h1>
          <p>Una selección de café para tu ritual diario. Elige el formato, registra tu interés y coordina la entrega desde Costa Rica sin cargos inesperados.</p>
          <div className="hero-ctas"><a href="#coleccion" className="button button-cream">Descubrir el café <ArrowUpRight size={18}/></a><button className="hero-text-button" onClick={()=>go("rewards")}>Conoce el club de amigos <ArrowRight size={17}/></button></div>
        </div>
        <div className="hero-bottom"><span>01 / 03 &nbsp; — &nbsp; TOSTADO CON INTENCIÓN</span><a href="#coleccion">SCROLL PARA EXPLORAR <ArrowDown size={14}/></a></div>
      </section>

      <div className="editorial-strip"><div><Leaf size={20}/><span>Concepto de café de especialidad</span></div><span className="strip-star">✳</span><div><Coffee size={20}/><span>Formatos para cada rutina</span></div><span className="strip-star">✳</span><div><Truck size={20}/><span>Entrega por coordinar</span></div></div>

      <section className="collection section-pad" id="coleccion">
        <div className="section-heading"><div><span className="eyebrow">01 — LA COLECCIÓN</span><h2>Encuentra tu<br/><em>próximo favorito.</em></h2></div><p>Para quienes saben que los mejores días empiezan con una buena taza. Tres formas de disfrutar Tueste.</p></div>
        <div className="product-grid">{displayProducts.map((product,index)=><article className={`product-card product-${product.tone}`} key={product.sku}>
          <div className="product-art"><div className="art-circle"/><div className={`coffee-bag bag-${index}`}><div className="bag-fold"/><span className="bag-logo">TUESTE<span>.</span></span><span className="bag-middle">{index===0?"ORIGEN":index===1?"EXPLORADOR":"CLUB"}</span><span className="bag-bottom">SPECIALTY COFFEE<br/>340 G · WHOLE BEANS</span></div>{index===1&&<div className="coffee-bag small-bag"><div className="bag-fold"/><span className="bag-logo">TUESTE<span>.</span></span><span className="bag-middle">EDICIÓN</span><span className="bag-bottom">340 G</span></div>}<div className="product-tag">{index===0?"EL FAVORITO":index===1?"MÁS CAFÉ, MEJOR VALOR":"10 % DE DESCUENTO"}</div></div>
          <div className="product-description"><div><span className="product-index">0{index+1} / CAFÉ TUESTE</span><h3>{product.name}</h3><p>{product.description}</p>{catalogConfigured&&<small className="stock-hint">{liveCatalog.find(p=>p.sku===product.sku)?.stock??0} unidades de pack disponibles para solicitar</small>}</div><div className="product-purchase"><strong>{priceText(product.priceCents)}</strong>{product.sku==="club"&&<span>/mes</span>}<button onClick={()=>add(product.sku)} aria-label={`Agregar ${product.name} al carrito`}><Plus size={22}/></button></div></div>
        </article>)}</div>
        <p className="demo-note"><span className="dot"/> Catálogo piloto académico (USD). Los precios y existencias requieren validación comercial. ONVO está preparado solo para pruebas; no hay cargos reales ni despacho automático.</p>
      </section>

      <CoffeeFinder products={displayProducts} onAdd={add} onChoose={()=>{if(consent==="all")fetch("/api/events",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({type:"finder_used",code:referral||undefined})}).catch(()=>{});}}/>

      <section className="story" id="origen"><div className="story-photo"/><div className="story-content"><span className="eyebrow light">04 — EL ORIGEN IMPORTA</span><h2>Detrás de cada taza,<br/><em>hay una historia.</em></h2><p>El caso de Tueste imagina una pequeña tostadora que comenzó con cinco kilos de café y una idea sencilla: acercar una buena experiencia de origen a cada taza.</p><p>Esta tienda es un prototipo comercial. Los orígenes, proveedores y existencias definitivos se anunciarán después de validarlos, sin inventar certificaciones ni reseñas.</p><button className="button button-outline" onClick={()=>go("rewards")}>Comparte la experiencia <ArrowUpRight size={18}/></button><span className="story-stamp">UNA HISTORIA DE CAFÉ POR CONSTRUIR.</span></div></section>

      <PurchaseConfidence/>

      <section className="referral-teaser section-pad"><div className="teaser-graphic"><span className="ring ring-one"/><span className="ring ring-two"/><div className="teaser-badge"><Gift size={30}/><span>REGALA<br/>UNA TAZA</span></div></div><div><span className="eyebrow">05 — EL CAFÉ SABE MEJOR CUANDO SE COMPARTE</span><h2>Tu buen gusto<br/><em>tiene recompensa.</em></h2><p>El programa piloto propone US$8 de descuento elegible para un amigo y recompensas después de una venta verificada. Las pruebas no generan premios físicos.</p><button className="button button-dark" onClick={()=>go("rewards")}>Descubre el programa <ArrowUpRight size={18}/></button></div></section>
    </>:<section className="rewards-page section-pad">
      <button className="back-link" onClick={()=>go("shop")}><ArrowLeft size={16}/> Volver a la tienda</button>
      <div className="rewards-hero"><div><span className="eyebrow light">UN BUEN CAFÉ SE COMPARTE</span><h1>Regala una taza.<br/><em>Recibe mucho más.</em></h1><p>Un detalle que sabe mejor: invita después de la primera taza, no antes de probarla.</p><span className="rewards-small">PROGRAMA DE REFERIDOS · PROTOTIPO ACADÉMICO</span></div><div className="gift-icon-big"><Gift size={100} strokeWidth={1}/></div></div>
      <div className="rewards-steps"><div><span>01</span><Package size={25}/><h3>Recibe tu café</h3><p>Tu pedido llega en aproximadamente 3 días según el caso.</p></div><div><span>02</span><Coffee size={25}/><h3>Disfruta tu primera taza</h3><p>En el momento perfecto, activa tu enlace personal.</p></div><div><span>03</span><Users size={25}/><h3>Invita por WhatsApp</h3><p>Tu amigo entra con el regalo aplicado, sin copiar códigos.</p></div></div>
      <div className="rewards-dashboard"><div className="reward-primary"><span className="eyebrow">TU ENLACE PERSONAL</span><h2>Que empiece<br/><em>lo bueno.</em></h2>{!delivered?<><p>¿Ya recibiste y probaste tu café? Así comienza el programa, justo cuando más apetece compartirlo.</p>{hasOrder?<button className="button button-dark" onClick={()=>setDelivered(true)}>Sí, ya probé mi café <Check size={17}/></button>:<><button className="button button-dark" onClick={()=>setDelivered(true)}>Probar recorrido de invitación <ArrowRight size={17}/></button><small className="rewards-disclaimer">Acción de demostración. En producción se activaría al confirmar la entrega del pedido.</small></>}</>:<><p>Tu experiencia puede convertirse en la próxima taza favorita de alguien.</p>{!referralProfile?.code?<button className="button button-dark" disabled={rewardBusy} onClick={makeLink}>{rewardBusy?"Creando…":"Crear mi enlace personal"} <ArrowRight size={17}/></button>:<><div className="link-field"><span>{link}</span><button onClick={copy}>{refCopied?<Check size={17}/>:"Copiar"}</button></div><button className="button button-whatsapp" onClick={share}>Compartir por WhatsApp <ArrowUpRight size={17}/></button></>}</>}
      </div><div className="reward-progress"><span className="eyebrow">TUS LOGROS</span><div className="progress-number"><strong>{referralProfile?.oneOff??0}</strong><span>amigos con compra<br/>simulada confirmada</span></div><div className="progress-track"><span style={{width:`${Math.min(100,((referralProfile?.oneOff??0)%3)/3*100)}%`}}/></div><div className="progress-labels"><span>0 amigos</span><span>3 amigos</span></div><p><Sparkles size={16}/> A los 3 amigos de compra suelta: una bolsa de 340 g para tu próximo pedido.</p><div className="earned-list"><h4>Notificaciones de premios</h4>{referralProfile?.rewards?.length?referralProfile.rewards.map((reward,i)=><div key={i}><CheckCircle2 size={16}/><span>{REWARDS[reward.kind]??reward.kind}</span><small>SIMULADO</small></div>):<div className="empty-rewards"><Gift size={17}/> Tus recompensas aparecerán aquí después de la primera compra referida.</div>}</div></div></div>
      <div className="reward-rules"><span className="eyebrow">PREMIOS SOSTENIBLES</span><h2>Compartir es bueno.<br/><em>Hacerlo bien, mejor.</em></h2><div className="rule-grid"><div><span>PARA TU AMIGO</span><strong>US$8</strong><p>Descuento en su primer pedido de demostración, aplicado automáticamente.</p></div><div><span>POR CADA AMIGO</span><strong>100 g</strong><p>Una muestra de café para tu siguiente pedido si compra bolsas sueltas.</p></div><div><span>AL LLEGAR A 3</span><strong>340 g</strong><p>Una bolsa de regalo al sumar tres amigos con compras sueltas.</p></div><div><span>SI SE SUSCRIBE</span><strong>1 mes</strong><p>En vez de la muestra, un mes del Club como recompensa simulada.</p></div></div><small>Recompensas condicionadas a pedidos válidos. Las opciones de 100 g / 340 g y el mes gratis no se acumulan en una misma conversión. Costos por referido menores de US$25; ver tablero del dueño.</small></div>
    </section>}

    <footer className="footer"><div className="footer-top"><div><a className="brand footer-brand" href="/">TUESTE<span className="brand-period">.</span></a><p>Buenas historias empiezan<br/>con un buen café.</p></div><div><span>DESCUBRE</span><button onClick={()=>go("shop")}>Nuestro café</button><button onClick={()=>jumpTo("elige")}>Elige tu pack</button><button onClick={()=>go("rewards")}>Regala una taza</button><button onClick={()=>jumpTo("faq")}>Ayuda y preguntas</button></div><div><span>EL PROYECTO</span><p>Demostración académica<br/>inspirada en el caso ficticio Tueste.<br/>Precios en USD.</p><a href="/dashboard">Tablero del dueño</a><a href="/admin">Operación interna</a></div></div><div className="footer-bottom"><span>© 2026 TUESTE — PROTOTIPO ACADÉMICO</span><span>DISEÑADO PARA CONVERTIR CON MARGEN.</span><button onClick={()=>{setConsent(null);window.localStorage.removeItem("tueste-cookie-choice")}}>Preferencias de cookies</button></div></footer>

    {cartOpen&&<CartDrawer cart={cart} products={displayProducts} quantity={cartQuantity} total={cartTotal} referral={referral} delivery={delivery} onDelivery={setDelivery} onQty={changeQty} onClose={()=>setCartOpen(false)} onCheckout={checkout} busy={busy} catalogConfigured={catalogConfigured} liveCatalog={liveCatalog}/>}

    {ordered&&<div className="order-toast" role="dialog" aria-label="Confirmación de pedido"><button aria-label="Cerrar" onClick={()=>setOrdered(false)}><X size={19}/></button><div className="order-check"><Check size={28}/></div><span className="eyebrow">{orderKind==="request"?"SOLICITUD REGISTRADA · SIN PAGAR":"PEDIDO SIMULADO"}</span><h3>{orderKind==="request"?"Tu pedido está en espera.":"¡Gracias por elegir Tueste!"}</h3><p>{orderKind==="request"?`Solicitud ${orderId.slice(0,8).toUpperCase()} guardada. No hay cargo ni envío: el equipo coordinará condiciones y el medio de pago antes de preparar el café.`:"Esta es una compra de prueba: no se cobró dinero. Imagina que el café llega en 3 días; después podrás probar el ciclo de referidos."}</p>{orderKind==="request"?<a className="button button-dark" href="/pedidos">Consultar mis pedidos <ArrowRight size={16}/></a>:<button className="button button-dark" onClick={()=>{setOrdered(false);go("rewards")}}>Ver mi recompensa <ArrowRight size={16}/></button>}</div>}
    {toast&&<div className="toast" role="status"><CheckCircle2 size={18}/>{toast}<button aria-label="Cerrar aviso" onClick={()=>setToast("")}><X size={14}/></button></div>}
    {consent===null&&<div className="cookie-banner" role="dialog" aria-label="Preferencias de cookies"><div><strong>Tu café, tus preferencias.</strong><p>Usamos almacenamiento esencial para el carrito y, solo si lo permites, medimos visitas y clics del programa de referidos. No hay rastreadores publicitarios en esta demo.</p></div><button onClick={()=>chooseCookie("essential")}>Solo necesarias</button><button className="cookie-accept" onClick={()=>chooseCookie("all")}>Aceptar medición</button></div>}
  </div>;
}
