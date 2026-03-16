import "dotenv/config";
import { db } from "./db.js";
import { plans, clients, apiKeys } from "./schema.js";
import { generateApiKey } from "./lib/api-key.js";

async function seed() {
  await db.insert(plans).values([
    { id: "free", name: "Free", monthlyQuota: 100 },
    { id: "paid", name: "Pago", monthlyQuota: 0 },
  ]).onConflictDoNothing({ target: plans.id });

  const [client] = await db.insert(clients).values({
    name: "Cliente Teste Fintech",
    email: "contato@fintech-teste.com",
    planId: "free",
    status: "active",
  }).returning({ id: clients.id });

  if (!client) throw new Error("Falha ao criar cliente");

  const { raw, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({
    clientId: client.id,
    keyPrefix: prefix,
    keyHash: hash,
    scopes: ["score-bw:read"],
    rateLimitPerMin: 30,
  });

  console.log("\n=== API Key criada (guarde em lugar seguro) ===\n");
  console.log(raw);
  console.log("\n================================================\n");
  console.log("Use no header: X-API-Key:", raw);
  process.exit(0);
}

seed().catch((e) => {
  console.error(e);
  process.exit(1);
});
