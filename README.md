# KYC-API-platform

Repositório dedicado ao **API Gateway** e **microsserviços** da plataforma BetterWith.

- Começa vazio; cada serviço entra aos poucos.
- O app principal ([KYC-PDF-generator](https://github.com/RenanBarretoJ/KYC-PDF-Generator)) continua rodando em produção e passará a consumir estas APIs de forma gradual (Strangler Fig).

## Documentação

- **[docs/INFRA-RENDER-SUPABASE.md](docs/INFRA-RENDER-SUPABASE.md)** — Infraestrutura com **Render** (hosting) + **Supabase** (PostgreSQL).
- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — Stack (Node vs FastAPI), banco (MySQL/Postgres), hosting (Render etc.), pagamentos (free + Stripe).
- **[docs/database-schema.md](docs/database-schema.md)** — Schema sugerido para Gateway + Billing (clientes, API keys, planos, uso).

## Estrutura prevista

```
KYC-API-platform/
├── gateway/          # API Gateway (auth, rate limit, metering, integração Stripe)
├── services/
│   ├── score-bw/     # API Score BW (PF/PJ)
│   ├── scr/          # API SCR (HBI/Bacen)
│   └── kyc-serasa/   # API KYC (Serasa)
├── shared/           # Contratos, tipos, libs compartilhadas
└── docs/             # OpenAPI, arquitetura, schema
```

## Serviços

### Score BW (`services/score-bw`)

- **Endpoints:** `POST /score`, `POST /score-pj`, `POST /pdf`, `POST /pdf-pj`, `GET /health`
- **Auth:** header `X-API-Key` (chave da plataforma)
- **Doc:** [docs/score-bw-api.md](docs/score-bw-api.md)

Rodar:
```bash
cd services/score-bw && npm install && npm run dev
```
Env: `SCORE_BW_BASE_URL`, `SCORE_BW_API_KEY`, `PLATFORM_API_KEY` (ou `API_KEY`).

## Gateway (`gateway/`)

- **Auth:** API Key por cliente (header `X-API-Key`), chave no banco (hash).
- **Metering:** uso por cliente/mês em PostgreSQL; cota do plano free (ex.: 100/mês).
- **Proxy:** encaminha `/v1/score-bw/*` para o serviço Score BW.
- **Doc:** [gateway/README.md](gateway/README.md) e [docs/END-TO-END-SCORE-BW.md](docs/END-TO-END-SCORE-BW.md).

Rodar: `cd gateway && npm install && npm run db:push && npm run seed && npm run dev`

## Próximos passos

1. [x] Primeiro serviço (Score BW) — esqueleto pronto
2. [x] Gateway com auth + metering + proxy Score BW
3. [ ] Deploy (Replit: Gateway + Score BW + Postgres)
4. [ ] Integrar monolito via feature flag (opcional)
5. [ ] SCR e KYC Serasa
