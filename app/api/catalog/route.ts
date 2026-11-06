import { env } from "cloudflare:workers";
import { PRODUCTS } from "../../../lib/catalog";

export const runtime = "edge";
export async function GET() {
  try {
    const result = await env.DB.prepare("SELECT sku,name,description,price_cents AS priceCents,stock,active FROM products ORDER BY CASE sku WHEN 'duo' THEN 1 WHEN 'explorer' THEN 2 WHEN 'club' THEN 3 ELSE 4 END, name").all();
    return Response.json({products:result.results,configured:result.results.length>0});
  } catch {
    return Response.json({products:PRODUCTS.map(product=>({...product,stock:0,active:false})),configured:false,warning:"El catálogo administrativo todavía no está disponible."});
  }
}
