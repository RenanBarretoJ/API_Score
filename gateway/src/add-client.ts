/**
 * Script para adicionar clientes manualmente.
 * Uso: npx tsx src/add-client.ts
 */
import "dotenv/config";
import { db } from "./db.js";
import { plans, clients, apiKeys, creditPacks } from "./schema.js";
import { generateApiKey } from "./lib/api-key.js";

async function addClient() {
  // Garante que os planos existem
  await db.insert(plans).values([
    { id: "free",    name: "Free",    monthlyQuota: 100 },
    { id: "paid",    name: "Pago",    monthlyQuota: 0   },
    { id: "credits", name: "Créditos", monthlyQuota: 0  },
  ]).onConflictDoNothing({ target: plans.id });

  // Garante que os pacotes de créditos existem
  await db.insert(creditPacks).values([
    { id: "starter",      name: "Starter",      credits: 100,  priceReais: 4500  },
    { id: "professional", name: "Professional",  credits: 500,  priceReais: 19000 },
    { id: "enterprise",   name: "Enterprise",    credits: 2000, priceReais: 65000 },
  ]).onConflictDoNothing({ target: creditPacks.id });

  // Cria o cliente Matchhub / SCP
  const [client] = await db.insert(clients).values({
    name:    "Raul Barreto — SCP / Matchhub",
    email:   "raul.barreto@smartcp.com.br",
    company: "SCP / Matchhub",
    planId:  "credits",
    credits: 50,   // 50 créditos gratuitos para começar
    status:  "active",
  }).returning();

  if (!client) throw new Error("Falha ao criar cliente");

  const { raw, prefix, hash } = generateApiKey();
  await db.insert(apiKeys).values({
    clientId:       client.id,
    keyPrefix:      prefix,
    keyHash:        hash,
    scopes:         ["score-bw:read"],
    rateLimitPerMin: 60,
  });

  console.log("\n╔══════════════════════════════════════════════════╗");
  console.log("║           CLIENTE CRIADO COM SUCESSO             ║");
  console.log("╠══════════════════════════════════════════════════╣");
  console.log(`║  ID:      ${client.id}`);
  console.log(`║  Nome:    ${client.name}`);
  console.log(`║  Email:   ${client.email}`);
  console.log(`║  Empresa: ${client.company}`);
  console.log(`║  Plano:   ${client.planId}`);
  console.log(`║  Créditos iniciais: 50`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║  API KEY (guarde em local seguro):               ║");
  console.log(`║  ${raw}`);
  console.log("╠══════════════════════════════════════════════════╣");
  console.log("║  Header: X-API-Key: <api_key acima>              ║");
  console.log("║  Gateway: https://api-score-vmn2.onrender.com    ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  process.exit(0);
}

addClient().catch((e) => {
  console.error(e);
  process.exit(1);
});
