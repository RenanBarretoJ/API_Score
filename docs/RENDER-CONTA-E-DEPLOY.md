# Conta no Render e deploy do Gateway

Passo a passo para criar uma conta no Render e subir a API (Gateway) lá.

> **Usando Render + Supabase?** Veja o guia unificado: **[INFRA-RENDER-SUPABASE.md](./INFRA-RENDER-SUPABASE.md)**.

---

## Parte 1: Criar conta no Render

1. Acesse **https://render.com** e clique em **Get Started** (ou **Sign Up**).
2. Escolha uma forma de cadastro:
   - **Sign up with GitHub** — recomendado se o seu código já está no GitHub; o Render conecta direto ao repositório.
   - **Sign up with Email** — informe e-mail e crie uma senha.
3. Confirme o e-mail, se pedido.
4. No primeiro acesso você cai no **Dashboard**. Pronto, conta criada.

---

## Parte 2: Banco de dados

O Gateway usa PostgreSQL. Você pode:

- **Usar o PostgreSQL do Render** (abaixo), ou  
- **Usar Supabase (seu banco)** — veja **[BANCO-SUPABASE-MYSQL.md](./BANCO-SUPABASE-MYSQL.md)**. Basta colocar a connection string do Supabase em `DATABASE_URL` no Render.

### Opção: PostgreSQL no Render

Você pode criar o banco no próprio Render:

1. No Dashboard do Render, clique em **New +** → **PostgreSQL**.
2. Preencha:
   - **Name:** ex. `kyc-gateway-db`
   - **Database:** ex. `kyc_gateway`
   - **User:** (deixe o sugerido ou escolha um)
   - **Region:** escolha a mais próxima (ex. **Oregon (US West)** ou **Frankfurt (EU Central)**).
   - No plano **Free** o banco dorme após 90 dias sem uso; para produção considere um plano pago.
3. Clique em **Create Database**.
4. Quando o banco estiver **Available**, entre no banco e vá na aba **Info** (ou **Connect**). Lá aparece a **Internal Database URL** (uso dentro do Render) e a **External Database URL** (para acessar de fora).  
   Para o **Gateway rodando no Render**, use a **Internal Database URL** como `DATABASE_URL`.

Copie e guarde essa URL; você vai colar nas variáveis do Web Service.

---

## Parte 3: Deploy do Gateway (Web Service)

### 3.1 Repositório no GitHub

O código do Gateway precisa estar em um repositório Git que o Render consiga acessar:

- Se o repositório for o **API_Score** (ou similar) com a pasta `gateway` na raiz, use esse repo e no Render defina **Root Directory** como `gateway`.
- Se o projeto estiver dentro de outro repo (ex.: monorepo), configure o **Root Directory** de acordo (ex.: `API_Score/gateway` ou `nome-do-repo/gateway`).

Certifique-se de que o repositório está **público** (ou que a conta Render está conectada à org/contas certas do GitHub).

### 3.2 Criar o Web Service

1. No Dashboard do Render, clique em **New +** → **Web Service**.
2. **Connect a repository:**  
   Se for a primeira vez, clique em **Connect account** (GitHub/GitLab/Bitbucket), autorize e selecione o repositório. Depois escolha o **repositório** e o **branch** (ex. `main`).
3. Clique em **Connect** (ou **Next**).

### 3.3 O que colocar em cada campo do Render

Use exatamente estes valores (as telas podem mostrar “Runtime” no topo e depois Branch, Region, etc.):

| Campo | O que colocar |
|-------|----------------|
| **Runtime / Environment** | **Node** — não use Docker (a menos que você tenha um Dockerfile no projeto). Se o dropdown estiver em “Docker”, mude para **Node**. |
| **Branch** | `main` (ou o branch que você usa para deploy). |
| **Region** | Ex.: **Oregon (US West)** ou **Frankfurt (EU Central)**. Use a mesma região para o banco e para o Gateway. |
| **Root Directory** | Se o repositório tem a pasta `gateway` na raiz (ex.: API_Score), use `gateway`. Se for monorepo, use o caminho até a pasta do gateway (ex.: `API_Score/gateway`). Repo só com o gateway: deixe em branco. |
| **Build Command** | `npm install && npm run build` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** para testar; **Starter** ($7/mês) se quiser mais estabilidade. |

Importante: escolha **Node** no runtime. Com Node, o Render usa o `package.json` do Gateway (na Root Directory) e roda os comandos de build e start acima.

### 3.4 Variáveis de ambiente

Na mesma tela (ou em **Environment** depois de criar), adicione:

| Key | Valor | Onde pegar |
|-----|--------|------------|
| `DATABASE_URL` | A **Internal Database URL** do PostgreSQL que você criou | Dashboard do banco → Connect / Info |
| `SCORE_BW_SERVICE_URL` | URL do serviço Score BW (onde o Gateway chama). Ex.: `http://localhost:4001` em dev; em produção use a URL pública do serviço Score BW. | Você define |
| `GATEWAY_SERVICE_KEY` | Mesmo valor de `PLATFORM_API_KEY` do serviço Score BW | Você define (ex.: gere com `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`) |
| `ADMIN_SECRET` | Senha para as rotas admin (`X-Admin-Key`) | Gere com: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `PORT` | (opcional) | O Render define sozinho; o Gateway já usa `process.env.PORT`. Só preencha se a documentação do Render pedir. |

Não commite `.env` no Git; use só as variáveis no painel do Render.

### 3.5 Criar e fazer o primeiro deploy

1. Clique em **Create Web Service**.
2. O Render vai rodar o **Build** (`npm install && npm run build`) e depois o **Start** (`npm start`). Acompanhe os logs; se der erro, confira Root Directory, Build Command e variáveis.
3. Quando o deploy terminar, a URL do Gateway será algo como:  
   **https://kyc-gateway-xxxx.onrender.com**

### 3.6 Criar tabelas e seed (primeira vez)

O Render só roda o **Start Command**; não roda `db:push` nem `seed` sozinhos. Você tem duas opções:

**Opção A — Rodar na sua máquina (recomendado na primeira vez)**  
Use a **External Database URL** do PostgreSQL (no Render, no banco → Connect). Na sua máquina, na pasta do gateway:

```bash
cd gateway
# Crie um .env temporário com DATABASE_URL=External_Database_URL
npm install
npm run db:push
npm run seed
```

Assim as tabelas são criadas e o primeiro cliente/API Key são gerados. Depois você pode usar a **Internal Database URL** no Web Service (e a External só para manutenção local).

**Opção B — Script de build que faz push (menos comum)**  
Alguns times colocam `npm run db:push` no build; isso exige que `DATABASE_URL` no Render aponte para o banco e que o build tenha acesso. Funciona, mas deixa o build mais lento e dependente do banco.

---

## Parte 4: Depois do deploy

- **URL da API:** use a URL do Web Service, ex.: `https://kyc-gateway-xxxx.onrender.com`
- **Health:** `GET https://kyc-gateway-xxxx.onrender.com/health`
- **Portal do cliente:** `https://kyc-gateway-xxxx.onrender.com/dev`
- **Admin:** use o mesmo host com as rotas `/admin/*` e header `X-Admin-Key: SEU_ADMIN_SECRET`

No plano **Free**, o Web Service “dorme” após ~15 min sem requisições; a primeira chamada depois disso pode demorar alguns segundos (cold start).

---

## Resumo rápido

| Etapa | O que fazer |
|-------|--------------|
| 1 | Criar conta em https://render.com (GitHub ou e-mail). |
| 2 | New → PostgreSQL; criar banco; copiar Internal Database URL. |
| 3 | New → Web Service; conectar repo; Root Directory = `KYC-API-platform/gateway` (se for o caso). |
| 4 | Build: `npm install && npm run build`; Start: `npm start`. |
| 5 | Colocar no Environment: `DATABASE_URL`, `SCORE_BW_SERVICE_URL`, `GATEWAY_SERVICE_KEY`, `ADMIN_SECRET`. |
| 6 | Create Web Service e acompanhar o deploy. |
| 7 | Rodar `db:push` e `seed` uma vez (na sua máquina com External URL ou como preferir). |

Com isso, a API fica no ar no Render e você pode passar a URL e a documentação para o cliente consumir.
