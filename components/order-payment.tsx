"use client";
import { useState } from "react";

export default function OrderPayment({id,enabled}:{id:string;enabled:boolean}) {
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function act(action:"checkout"|"confirm") {
    if(busy)return;
    setBusy(true);setNotice("");
    try {
      const res=await fetch(`/api/payments/${action}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({orderId:id})});
      const data=await res.json() as {error?:string;url?:string;notice?:string;status?:string};
      if(!res.ok) throw new Error(data.error||"No se pudo consultar ONVO.");
      if(action==="checkout"&&data.url) {
        const url=new URL(data.url);
        if(url.protocol!=="https:"||!(url.hostname==="onvopay.com"||url.hostname.endsWith(".onvopay.com"))) throw new Error("URL de pago no segura.");
        window.location.assign(url.href);
      } else if(action==="confirm"&&data.status&&data.status!=="pending_payment") window.location.reload();
      else setNotice(data.notice||"El proveedor aún no confirma el pago de prueba.");
    }catch(error){setNotice((error as Error).message);}finally{setBusy(false);}
  }
  if(!enabled) return <small>ONVO: pendiente de configuración con claves de prueba. Nunca se generarán cargos reales desde esta versión.</small>;
  return <div><div className="account-payment-actions"><button type="button" disabled={busy} className="test-pay" onClick={()=>act("checkout")}>{busy?"Consultando…":"Abrir ONVO (solo prueba)"}</button><button type="button" disabled={busy} onClick={()=>act("confirm")}>Verificar prueba</button></div>{notice&&<p className="account-note" role="status">{notice}</p>}</div>;
}
