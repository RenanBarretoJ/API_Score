import { pgTable, uuid, varchar, text, integer, jsonb, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

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
  planId: varchar("plan_id", { length: 32 }).notNull().references(() => plans.id),
  stripeCustomerId: varchar("stripe_customer_id", { length: 128 }),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
