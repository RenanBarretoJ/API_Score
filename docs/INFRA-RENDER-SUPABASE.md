# Infraestrutura: Render + Supabase

Guia para rodar o projeto usando **Render** (hosting) e **Supabase** (PostgreSQL).

- **Supabase** → banco de dados do Gateway (clientes, API keys, uso).
- **Render** → Web Service(s) para o Gateway (e opcionalmente o serviço Score BW).

---

## Visão geral

```
Cliente  →  Gateway (Render)  →  Score BW (Render ou outro)  →  Backend real
                ↓
          Supabase (PostgreSQL)
```

---

## Parte 1: Supabase (banco)

### 1.1 Criar projeto

1. Acesse **https://supabase.com** e faça login ou crie conta.
2. **New Project** → nome do projeto (ex.: API_Score), **senha do banco** (guarde bem) e região.
3. Aguarde o projeto ficar pronto (status **Healthy** no dashboard).

### 1.2 Pegar a connection string (importante: use Session Pooler)

O Supabase mostra um aviso **"Not IPv4 compatible"** na conexão direta (porta 5432). O **Render** e muitas redes usam só IPv4, então use o **Session Pooler** (porta 6543).

1. No projeto, clique em **Connect** (canto superior) ou vá em **Project Settings** (ícone de engrenagem) → **Database**.
2. Aba **Connection string** (ou "Connection String").
3. Deixe **Type:** URI e **Source:** Primary Database.
4. Em **Method**, troque de **Direct connection** para **Session pooler** (ou "Connection pooling").  
   - Se não vir "Session pooler" no mesmo lugar, use o link **"Pooler settings"** ou a conexão que aparecer com porta **6543**.
5. Copie a string. Ela será algo como:
   ```text
   postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-us-west-2.pooler.supabase.com:6543/postgres
   ```
6. Substitua **`[YOUR-PASSWORD]`** pela senha do banco que você definiu ao criar o projeto.  
   Exemplo (nunca commite a senha no Git):
   ```text
   postgresql://postgres.lxcymwwvdnutbkmtaggu:SUA_SENHA_AQUI@aws-0-us-west-2.pooler.supabase.com:6543/postgres
   ```
   (O host pode variar; use o que o Supabase mostrar para o **Session pooler**.)

Essa URL é a sua **DATABASE_URL**. Funciona na sua máquina e no Render.

### 1.3 Configurar localmente

No arquivo **gateway/.env**:

```env
DATABASE_URL=postgresql://postgres.xxxxx:SUA_SENHA@...pooler.supabase.com:6543/postgres
```

Depois, na raiz do projeto:

```powershell
cd gateway
npm run db:push
npm run seed
```

Anote a **API Key** que o seed mostrar (ex.: `bw_live_xxxx...`). As tabelas (plans, clients, api_keys, usage) passam a existir no Supabase.

---

## Parte 2: Render (Gateway)

### 2.1 Conta e repositório

1. Acesse **https://render.com** → **Get Started** (cadastro com GitHub ou e-mail).
2. Conecte o repositório onde está o código (ex.: **API_Score**).
3. O Render precisa enxergar a pasta **gateway** (Root Directory no próximo passo).

### 2.2 Criar Web Service (Gateway)

1. **New +** → **Web Service**.
2. Conecte o repositório e o branch (ex.: `main`).

| Campo | Valor |
|-------|--------|
| **Runtime** | **Node** |
| **Root Directory** | `gateway` (se o repo tem a pasta `gateway` na raiz) |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | Free (teste) ou Starter (produção) |

### 2.3 Variáveis de ambiente no Render

Em **Environment** do Web Service, adicione:

| Key | Valor |
|-----|--------|
| `DATABASE_URL` | A **connection string do Supabase** (com senha), de preferência porta **6543** (pooler). |
| `SCORE_BW_SERVICE_URL` | URL do serviço Score BW. Ex.: `https://seu-score-bw.onrender.com` se subir o Score BW no Render; ou outra URL onde o serviço estiver. |
| `GATEWAY_SERVICE_KEY` | Mesmo valor de `PLATFORM_API_KEY` do serviço Score BW (chave que o Gateway envia ao Score BW). |
| `ADMIN_SECRET` | Chave para rotas admin (`X-Admin-Key`). Gere uma senha forte. |

Não commite `.env` no Git; use só as variáveis no painel do Render.

### 2.4 Deploy

Clique em **Create Web Service**. O Render faz build e start. A URL do Gateway ficará algo como:

**https://seu-gateway.onrender.com**

- Health: `GET https://seu-gateway.onrender.com/health`
- Portal dev: `https://seu-gateway.onrender.com/dev`

No plano **Free**, o serviço “dorme” após ~15 min sem uso (cold start na primeira requisição).

---

## Parte 3: Score BW no Render (opcional)

Se quiser hospedar o **serviço Score BW** também no Render:

1. **New +** → **Web Service**.
2. Mesmo repositório, **Root Directory**: `services/score-bw`.
3. **Build:** `npm install && npm run build`  
   **Start:** `npm start`
4. Variáveis no Render:
   - `SCORE_BW_BASE_URL` — URL do backend Score BW real.
   - `SCORE_BW_API_KEY` — API Key do backend real.
   - `PLATFORM_API_KEY` — **mesmo valor** de `GATEWAY_SERVICE_KEY` do Gateway.

Depois de publicar, use a URL desse Web Service em **SCORE_BW_SERVICE_URL** no Gateway (Parte 2.3).

---

## Resumo rápido

| O quê | Onde |
|-------|------|
| Banco (PostgreSQL) | **Supabase** — criar projeto, pegar connection string, rodar `db:push` e `seed` no gateway (local). |
| Gateway (API) | **Render** — Web Service, Root Directory `gateway`, variáveis: `DATABASE_URL` (Supabase), `SCORE_BW_SERVICE_URL`, `GATEWAY_SERVICE_KEY`, `ADMIN_SECRET`. |
| Score BW (proxy) | **Render** (opcional) — outro Web Service, Root Directory `services/score-bw`. |

Documentação de fluxo da API: **docs/END-TO-END-SCORE-BW.md**.  
Detalhes só do Render: **docs/RENDER-CONTA-E-DEPLOY.md**.  
Detalhes só do Supabase: **docs/BANCO-SUPABASE-MYSQL.md**.
