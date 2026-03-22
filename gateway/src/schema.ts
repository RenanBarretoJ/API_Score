import { pgTable, uuid, varchar, integer, jsonb, timestamp, uniqueIndex, index, boolean } from "drizzle-orm/pg-core";

export const plans = pgTable("plans", {
  id: varchar("id", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  monthlyQuota: integer("monthly_quota").notNull().default(0),
  stripePriceId: varchar("stripe_price_id", { length: 128 }),
});

export const clients = pgTable("clients", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 256 }).notNull(),
  email: varchar("email", { length: 256 }),
  company: varchar("company", { length: 256 }),
  planId: varchar("plan_id", { length: 32 }).notNull().references(() => plans.id),
  stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
  credits: integer("credits").notNull().default(0),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Pacotes de créditos disponíveis para compra
export const creditPacks = pgTable("credit_packs", {
  id: varchar("id", { length: 32 }).primaryKey(),
  name: varchar("name", { length: 128 }).notNull(),
  credits: integer("credits").notNull(),
  priceReais: integer("price_reais").notNull(),     // em centavos
  stripePriceId: varchar("stripe_price_id", { length: 128 }),
  active: boolean("active").notNull().default(true),
});

// Histórico de transações de crédito
export const creditTransactions = pgTable(
  "credit_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    type: varchar("type", { length: 16 }).notNull(), // "purchase" | "usage" | "adjustment"
    credits: integer("credits").notNull(),            // positivo = entrada, negativo = saída
    balanceAfter: integer("balance_after").notNull(),
    description: varchar("description", { length: 256 }),
    stripeSessionId: varchar("stripe_session_id", { length: 128 }),
    packId: varchar("pack_id", { length: 32 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("credit_tx_client_idx").on(t.clientId, t.createdAt)]
);

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    keyPrefix: varchar("key_prefix", { length: 20 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    scopes: jsonb("scopes").$type<string[]>().default([]),
    rateLimitPerMin: integer("rate_limit_per_min").notNull().default(30),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("api_keys_key_prefix_idx").on(t.keyPrefix)]
);

export const usage = pgTable(
  "usage",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    month: integer("month").notNull(),
    year: integer("year").notNull(),
    count: integer("count").notNull().default(0),
    byService: jsonb("by_service").$type<Record<string, number>>().default({}),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("usage_client_month_year").on(t.clientId, t.month, t.year)]
);

export const queryLogs = pgTable(
  "query_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clientId: uuid("client_id").notNull().references(() => clients.id),
    service: varchar("service", { length: 64 }).notNull(),
    endpoint: varchar("endpoint", { length: 128 }).notNull(),
    documentType: varchar("document_type", { length: 8 }),
    documentValue: varchar("document_value", { length: 32 }),
    requestBody: jsonb("request_body").$type<Record<string, unknown>>().default({}),
    responseStatus: integer("response_status").notNull(),
    responseBody: jsonb("response_body").$type<Record<string, unknown> | string | null>(),
    errorMessage: varchar("error_message", { length: 512 }),
    durationMs: integer("duration_ms").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("query_logs_client_created_idx").on(t.clientId, t.createdAt),
    index("query_logs_service_created_idx").on(t.service, t.createdAt),
  ]
);
