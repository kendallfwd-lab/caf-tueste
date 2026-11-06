export const PRODUCTS = [
  { sku: "duo", name: "Dúo de origen", description: "Dos bolsas de 340 g · tueste fresco", priceCents: 3400, bags: 2, frequency: "one_off", tone: "cream" },
  { sku: "explorer", name: "Pack explorador", description: "Tres bolsas de 340 g · entrega por coordinar", priceCents: 4800, bags: 3, frequency: "one_off", tone: "sage" },
  { sku: "club", name: "Club Tueste", description: "Dos bolsas cada mes · pausa cuando quieras", priceCents: 3060, bags: 2, frequency: "subscription", tone: "terra" },
] as const;

export type Product = typeof PRODUCTS[number];
export type SKU = Product["sku"];
export type Sellable = {sku:string; name:string; description:string; priceCents:number; frequency?:string; bags?:number; tone?:string};

export function priceText(cents: number) {
  return new Intl.NumberFormat("en-US", {style: "currency", currency: "USD"}).format(cents / 100);
}

export function quoteCart(items: {sku: string; quantity: number}[], eligibleReferral = false, catalog: readonly Sellable[] = PRODUCTS) {
  if (!Array.isArray(items) || !items.length || items.length > 8) throw new Error("Selecciona al menos un producto.");
  if (new Set(items.map(item=>item.sku)).size !== items.length) throw new Error("No repitas el mismo producto en líneas separadas.");
  const normalized = items.map((item) => {
    const product = catalog.find((entry) => entry.sku === item.sku);
    if (!product || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 5) throw new Error("La cantidad o el producto no es válido.");
    return {product, quantity: item.quantity};
  });
  const subtotalCents = normalized.reduce((sum, {product, quantity}) => sum + product.priceCents * quantity, 0);
  // Protect the business from free/near-free orders after a price edit.
  const discountCents = eligibleReferral && subtotalCents >= 2000 ? 800 : 0;
  const shippingCents = 0;
  return { normalized, subtotalCents, discountCents, shippingCents, totalCents: subtotalCents - discountCents + shippingCents };
}
