import { env } from "cloudflare:workers";
import { getAdmin } from "../../../lib/admin-auth";

export const runtime="edge";
export async function GET() {
  const admin=await getAdmin();
  if(!admin) return Response.json({error:"Acceso administrativo requerido"},{status:403});
  const [orders,visits,shares,referrals]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<{n:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='landing_opened'").first<{n:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM events WHERE type='invitation_shared'").first<{n:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS n FROM referrals").first<{n:number}>(),
  ]);
  return Response.json({orders:orders?.n??0,visits:visits?.n??0,shares:shares?.n??0,referrals:referrals?.n??0,source:"Datos de demostración registrados en este prototipo; no ventas reales."});
}
