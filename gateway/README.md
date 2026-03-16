# Gateway — API Key, metering, proxy

Ponto único de entrada para clientes (white-labels). Valida API Key, verifica cota, encaminha para os serviços e registra uso.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | PostgreSQL (ex: `postgresql://user:pass@host:5432/kyc_gateway`) |
| `SCORE_BW_SERVICE_URL` | Sim* | URL do serviço Score BW (ex: `http://localhost:4001`) |
| `GATEWAY_SERVICE_KEY` | Sim* | Chave que o Gateway envia ao Score BW (mesmo valor do `PLATFORM_API_KEY` do Score BW) |
| `PORT` | Não | Porta do Gateway (padrão: 4000) |
| `ADMIN_SECRET` | Não* | Chave para rotas admin (header `X-Admin-Key`). Necessária para gerenciar clientes e ver uso. |

\* Necessário para as rotas `/v1/score-bw/*`

### Gerar e definir ADMIN_SECRET

O `ADMIN_SECRET` é uma senha que **você define**; não é gerada pelo sistema. Use um valor longo e aleatório.

**Gerar um valor aleatório (no terminal):**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copie a saída e coloque no `.env`:

```
ADMIN_SECRET=a1b2c3d4e5f6...   # o valor que você colou
```

Guarde esse valor em local seguro: você usará no header `X-Admin-Key` para criar clientes e ver uso.

## Banco e seed

```bash
cd gateway
npm install
npm run db:push    # cria tabelas (planos, clientes, api_keys, usage)
npm run seed       # cria plano free, 1 cliente e 1 API Key (a key é impressa no terminal)
```

Guarde a API Key exibida pelo seed; use no header `X-API-Key` nas chamadas.

## Rotas

- `GET /health` — health check (sem auth)
- `GET /dev` — página para o cliente testar a API e ver uso (colar API Key e chamar “Ver meus dados e uso” ou testar Score).
- `GET /v1/me` — dados do cliente e uso do mês (exige `X-API-Key`).
- `GET /v1/me/usage` — contador do mês atual (exige `X-API-Key`).
- `POST /v1/score-bw/score` — Score PF. Body: `{ "cpf": "...", "refresh"?: boolean }`
- `POST /v1/score-bw/score-pj` — Score PJ. Body: `{ "cnpj": "...", "refresh"?: boolean }`
- `POST /v1/score-bw/pdf` — PDF Score PF. Body: `{ "cpf": "..." }`
- `POST /v1/score-bw/pdf-pj` — PDF Score PJ. Body: `{ "cnpj": "..." }`

Todas as rotas `/v1/*` (exceto `/health` e `/dev`) exigem header `X-API-Key` e respeitam a cota mensal do plano.

### Rotas Admin (header `X-Admin-Key: <ADMIN_SECRET>`)

- `GET /admin/clients` — listar clientes (com quantidade de chaves).
- `POST /admin/clients` — criar cliente e uma API Key. Body: `{ "name": "...", "email"?: "...", "planId"?: "free"|"paid" }`. Retorna a API Key **uma vez**.
- `POST /admin/clients/:id/keys` — gerar nova API Key para o cliente. Retorna a key **uma vez**.
- `GET /admin/clients/:id/usage` — uso do cliente. Query: `?month=3&year=2025` (opcional; sem query = todos os meses).

## Rodar

**Local (desenvolvimento):**

```bash
npm run dev
```

O Gateway sobe na porta 4000 (ou na definida em `PORT`).

**Deixar no ar (produção / para o cliente acessar):**

1. Suba o projeto em um provedor que rode Node.js 24/7, por exemplo:
   - **Replit** — crie um Repl com este repo, configure Secrets (`.env`) e use "Run"; a URL será algo como `https://seu-repl--seu-user.repl.co`.
   - **Render** — crie um Web Service, conecte o repo, build: `npm install && npm run build`, start: `node dist/index.js`, e defina as variáveis em Environment.
   - **Railway, Fly.io, etc.** — mesmo esquema: variáveis de ambiente + comando de start (`npm run start` ou `node dist/index.js`).

2. Configure todas as variáveis no painel do provedor (`DATABASE_URL`, `SCORE_BW_SERVICE_URL`, `GATEWAY_SERVICE_KEY`, `ADMIN_SECRET`). Use a **URL pública** do serviço Score BW em `SCORE_BW_SERVICE_URL` se estiver em outro servidor.

3. A URL que o cliente vai usar é a URL do app (ex.: `https://seu-gateway.onrender.com`). Use essa mesma URL nas chamadas e no link `/dev`.

Teste (use a API Key do seed):

```bash
curl -X POST http://localhost:4000/v1/score-bw/score \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bw_live_XXXXXXXX" \
  -d '{"cpf":"12345678901"}'
```
