import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { validSameOrigin } from "../../../lib/admin-auth";

export const runtime = "edge";

async function customer() {
  const user = await getChatGPTUser();
  if (!user) return null;
  await env.DB.prepare("INSERT OR IGNORE INTO customers(id,email,display_name,created_at) VALUES(?,?,?,?)")
    .bind(user.userId, user.email, user.displayName, Date.now()).run();
  return user;
}

async function readProfile(userId:string) {
  const code = await env.DB.prepare("SELECT code FROM referral_codes WHERE customer_id=?").bind(userId).first<{code:string}>();
  const summary = await env.DB.prepare("SELECT COUNT(*) AS total, SUM(CASE WHEN type='one_off' THEN 1 ELSE 0 END) AS one_off, SUM(CASE WHEN type='subscription' THEN 1 ELSE 0 END) AS subscribers FROM referrals WHERE inviter_id=?").bind(userId).first<{total:number;one_off:number;subscribers:number}>();
  const rewards = await env.DB.prepare("SELECT kind,cost_cents AS costCents,created_at AS createdAt FROM rewards WHERE recipient_id=? ORDER BY created_at DESC LIMIT 30").bind(userId).all();
  return {code:code?.code??null,total:summary?.total??0,oneOff:summary?.one_off??0,subscribers:summary?.subscribers??0,rewards:rewards.results??[]};
}

export async function GET() {
  const user=await customer();
  if (!user) return Response.json({error:"Inicia sesión para ver tu programa."},{status:401});
  return Response.json(await readProfile(user.userId));
}

export async function POST(request:Request) {
  if(!validSameOrigin(request)) return Response.json({error:"Origen no autorizado."},{status:403});
  const user=await customer();
  if (!user) return Response.json({error:"Inicia sesión para crear tu enlace."},{status:401});
  const existing=await env.DB.prepare("SELECT code FROM referral_codes WHERE customer_id=?").bind(user.userId).first();
  if (!existing) {
    const code=`TUE-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    await env.DB.prepare("INSERT INTO referral_codes(code,customer_id,created_at) VALUES(?,?,?)").bind(code,user.userId,Date.now()).run();
  }
  return Response.json(await readProfile(user.userId));
}
