import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";

export function emailIsAdmin(email: string, list: string | undefined) {
  if (!list) return false;
  const normalized = email.trim().toLowerCase();
  return list.split(",").map(value=>value.trim().toLowerCase()).filter(Boolean).includes(normalized);
}

export async function getAdmin() {
  const user = await getChatGPTUser();
  const allowed = (env as unknown as Record<string,unknown>).TUESTE_ADMIN_EMAILS;
  return user && emailIsAdmin(user.email,typeof allowed === "string" ? allowed : undefined) ? user : null;
}

export function validSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; }
  catch { return false; }
}

export function adminDenied() {
  return Response.json({error:"Acceso restringido a administración."},{status:403});
}
