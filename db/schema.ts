import { integer, sqliteTable, text, uniqueIndex, index, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(), email: text("email").notNull(), displayName: text("display_name").notNull(), createdAt: integer("created_at").notNull(),
});
export const referralCodes = sqliteTable("referral_codes", {
  code: text("code").primaryKey(), customerId: text("customer_id").notNull().references(() => customers.id), createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("referral_codes_customer_unique").on(t.customerId)]);
export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(), customerId: text("customer_id").notNull().references(() => customers.id), status: text("status").notNull(),
  subtotalCents: integer("subtotal_cents").notNull(), discountCents: integer("discount_cents").notNull(), shippingCents: integer("shipping_cents").notNull(), totalCents: integer("total_cents").notNull(),
  referralCode: text("referral_code").references(() => referralCodes.code), idempotencyKey: text("idempotency_key").notNull(), createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("orders_idempotency_unique").on(t.idempotencyKey), index("orders_customer_idx").on(t.customerId)]);
export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(), orderId: text("order_id").notNull().references(() => orders.id), sku: text("sku").notNull(), quantity: integer("quantity").notNull(), unitPriceCents: integer("unit_price_cents").notNull(), unitCostCents: integer("unit_cost_cents"),
}, (t) => [index("order_items_order_idx").on(t.orderId)]);
export const referrals = sqliteTable("referrals", {
  id: text("id").primaryKey(), code: text("code").notNull().references(() => referralCodes.code), inviterId: text("inviter_id").notNull().references(() => customers.id), inviteeId: text("invitee_id").notNull().references(() => customers.id), orderId: text("order_id").notNull().references(() => orders.id), type: text("type").notNull(), createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("referrals_invitee_unique").on(t.inviteeId), uniqueIndex("referrals_order_unique").on(t.orderId), index("referrals_inviter_idx").on(t.inviterId)]);
export const rewards = sqliteTable("rewards", {
  id: text("id").primaryKey(), referralId: text("referral_id").notNull().references(() => referrals.id), recipientId: text("recipient_id").notNull().references(() => customers.id), kind: text("kind").notNull(), costCents: integer("cost_cents").notNull(), createdAt: integer("created_at").notNull(),
}, (t) => [uniqueIndex("rewards_referral_kind_unique").on(t.referralId,t.kind), index("rewards_recipient_idx").on(t.recipientId)]);
export const events = sqliteTable("events", {
  id: text("id").primaryKey(), referralCode: text("referral_code").references(() => referralCodes.code), type: text("type").notNull(), createdAt: integer("created_at").notNull(),
}, (t) => [index("events_type_idx").on(t.type)]);

// The sellable unit is one pack/membership period, not an individual 340-g bag.
// Price and costs are editable masters; order_items holds the historical snapshot.
export const products = sqliteTable("products", {
  sku: text("sku").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  priceCents: integer("price_cents").notNull(),
  costCents: integer("cost_cents"),
  stock: integer("stock").notNull().default(0),
  active: integer("active", {mode:"boolean"}).notNull().default(true),
  updatedAt: integer("updated_at").notNull(),
}, (t) => [check("products_stock_nonnegative", sql`${t.stock} >= 0`), check("products_price_positive", sql`${t.priceCents} > 0`)]);

export const stockMovements = sqliteTable("stock_movements", {
  id: text("id").primaryKey(),
  sku: text("sku").notNull().references(()=>products.sku),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  orderId: text("order_id").references(()=>orders.id),
  actorId: text("actor_id").notNull(),
  createdAt: integer("created_at").notNull(),
}, t => [index("stock_movements_sku_idx").on(t.sku)]);

export const paymentRecords = sqliteTable("payment_records", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(()=>orders.id),
  method: text("method").notNull(),
  reference: text("reference").notNull(),
  amountCents: integer("amount_cents").notNull(),
  verifiedBy: text("verified_by").notNull(),
  verifiedAt: integer("verified_at").notNull(),
}, t => [uniqueIndex("payment_records_order_unique").on(t.orderId), uniqueIndex("payment_records_method_reference_unique").on(t.method,t.reference)]);

export const orderStatusEvents = sqliteTable("order_status_events", {
  id: text("id").primaryKey(),
  orderId: text("order_id").notNull().references(()=>orders.id),
  fromStatus: text("from_status").notNull(),
  toStatus: text("to_status").notNull(),
  actorId: text("actor_id").notNull(),
  note: text("note").notNull().default(""),
  createdAt: integer("created_at").notNull(),
}, t => [index("order_status_events_order_idx").on(t.orderId)]);

// One immutable checkout amount per order. External provider IDs never double as order IDs.
export const paymentSessions = sqliteTable("payment_sessions", {
  orderId: text("order_id").primaryKey().references(()=>orders.id),
  providerSessionId: text("provider_session_id").unique(),
  checkoutUrl: text("checkout_url"),
  state: text("state").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull(),
  mode: text("mode").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

// Persisted in the same D1 transaction as payment recognition and stock movements.
export const paymentWebhookEvents = sqliteTable("payment_webhook_events", {
  eventId: text("event_id").primaryKey(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(),
  processedAt: integer("processed_at").notNull(),
});

// Optional for old orders; required for new Costa Rica fulfillment requests.
export const orderFulfillment = sqliteTable("order_fulfillment", {
  orderId: text("order_id").primaryKey().references(()=>orders.id),
  receiverName: text("receiver_name").notNull(),
  phone: text("phone").notNull(),
  province: text("province").notNull(),
  canton: text("canton").notNull(),
  district: text("district").notNull(),
  address: text("address").notNull(),
  instructions: text("instructions").notNull().default(""),
  createdAt: integer("created_at").notNull(),
});
