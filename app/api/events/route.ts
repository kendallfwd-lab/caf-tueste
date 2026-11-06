import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { validSameOrigin } from "../../../lib/admin-auth";

export const runtime="edge";
const allowed=new Set(["landing_opened","invitation_shared","cart_started","finder_used","checkout_started"]);
export async function POST(request:Request) {
  if(!validSameOrigin(request)) return Response.json({error:"Origen no autorizado."},{status:403});
  const user=await getChatGPTUser();
  if(!user) return Response.json({ok:false,error:"Autenticación requerida"},{status:401});
  let body:{type?:string;code?:string};
  try{body=await request.json();}catch{return Response.json({error:"Solicitud inválida"},{status:400});}
  if(!body.type||!allowed.has(body.type)) return Response.json({error:"Evento inválido"},{status:400});
  const code=body.code?.trim().toUpperCase()??null;
  if(code && !/^TUE-[A-Z0-9]{8}$/.test(code)) return Response.json({error:"Enlace inválido"},{status:400});
  const known=code ? await env.DB.prepare("SELECT code FROM referral_codes WHERE code=?").bind(code).first() : null;
  await env.DB.prepare("INSERT INTO events(id,referral_code,type,created_at) VALUES(?,?,?,?)").bind(crypto.randomUUID(),known?code:null,body.type,Date.now()).run();
  return Response.json({ok:true});
}
