# Arquitetura — KYC API Platform

Visão única de **stack**, **banco de dados** e **pagamentos** para deixar a primeira API e as próximas alinhadas.

---

## 1. FastAPI e Render — precisa?

### FastAPI (Python)
- **Não é obrigatório.** O monolito e o primeiro microsserviço (Score BW) estão em **Node.js/Express**. Manter tudo em Node reduz duplicação de lógica, time único de stack e deploy igual.
- Use **FastAPI** só se a equipe for majoritariamente Python ou se algum serviço exigir libs só em Python (ex.: ML para score). Nesse caso: um ou mais serviços em Python, resto em Node.

### Render (hosting)
- **Render é uma opção**, não obrigação. Você pode hospedar em:
  - **Replit** (já usa hoje)
  - **Render** (Web Services, DB managed)
  - **Railway**, **Fly.io**, **VPS**
- Para a **primeira API** (Score BW): escolha **um** ambiente (ex.: Render ou Replit), suba o serviço lá e registre a URL no monolito. Depois dá para ter serviços em lugares diferentes (ex.: Gateway no Render, Score BW no Replit).

**Resumo:** Node + um host (Render, Replit ou outro) é suficiente. FastAPI só se quiser misturar Python em algum serviço.

---

## 2. Banco de dados — MySQL e ferramentas

### Qual banco usar onde
- **Monolito (KYC-PDF-generator):** hoje usa **PostgreSQL** (Drizzle) como principal e **MySQL** externo como cache/legado.
- **Plataforma de APIs (este repo):** precisa de um banco para **clientes, API Keys, uso (metering) e billing**. Pode ser:
  - **PostgreSQL** (recomendado: Drizzle já usado no monolito, bom suporte).
  - **MySQL** (se for o padrão da empresa): também funciona.

### Precisa de SQLAlchemy? E Supabase?
- **SQLAlchemy** — só se você usar **FastAPI/Python** para algum serviço. Em Node não se usa SQLAlchemy.
- **Supabase** — não é obrigatório. É Postgres gerenciado + Auth + Realtime. Só faz sentido se quiser usar o Auth/Realtime deles; para “só” banco, um Postgres ou MySQL gerenciado (Render, PlanetScale, AWS RDS, etc.) basta.
- **Recomendação para Node:**
  - **PostgreSQL:** Drizzle ORM (igual ao monolito) ou `pg` puro.
  - **MySQL:** Drizzle (suporta MySQL) ou `mysql2` + queries manuais / um ORM leve.

### Onde fica o banco na arquitetura
- **Gateway / Billing** (quando existirem) acessam o **mesmo banco da plataforma** (clientes, API keys, planos, uso).
- **Microsserviços** (Score BW, SCR, KYC) podem ser **stateless** e só falar com o backend legado; o “estado” de quem pode chamar e quanto usou fica no Gateway + banco da plataforma.

```
[ Cliente ] → [ Gateway ] → [ MySQL ou Postgres: clientes, api_keys, usage, billing ]
                ↓
         [ Score BW ] [ SCR ] [ KYC ]  (stateless, sem DB próprio)
```

---

## 3. Pagamentos — Free e Stripe na arquitetura

### Modelo
- **Free:** cota X de consultas/mês sem cobrança.
- **Pago:** acima da cota ou plano pago → cobrança via **Stripe** (cartão, assinatura, etc.).

### Onde encaixar na arquitetura
- **Billing / Meio de pagamento** não fica dentro do Score BW nem dos outros serviços de domínio; fica em uma camada de **plataforma**:
  - **Gateway:** identifica cliente (API Key), aplica rate limit, **registra uso (metering)** e pode checar se está dentro da cota free ou se precisa cobrar.
  - **Serviço de Billing (ou módulo no Gateway):** mantém planos (free vs pago), limites, e **integra com Stripe** (checkout, webhooks de pagamento, assinaturas). O banco (MySQL ou Postgres) guarda: cliente, plano, uso do mês, `stripe_customer_id`, etc.

### Fluxo resumido
1. Cliente chama a API com `X-API-Key`.
2. **Gateway** valida a key, verifica se o cliente está ativo e dentro do plano (free ou pago).
3. **Free:** se uso < cota free, deixa passar e incrementa contador de uso.
4. **Pago:** se passou da cota free ou tem plano pago, pode bloquear até ter pagamento ou redirecionar para Stripe (checkout/assinatura). Após pagamento (webhook Stripe), libera ou aumenta cota.
5. Stripe: **Checkout Session** (pagamento único) e/ou **Subscription** (recorrente). Webhooks atualizam o status no banco (billing service ou Gateway).

### O que deixar “pronto” na arquitetura inicial
- **Banco:** tabelas (ou schema) para: `clients`, `api_keys`, `usage` (por cliente/mês), `plans` (free / paid), `billing_events` ou equivalente para Stripe.
- **Gateway (futuro):** ler plano e uso do banco; delegar “cobrar” ao **Billing service** (Stripe).
- **Primeira API (Score BW):** continua só proxy + auth; quem aplica “free vs Stripe” é o Gateway/Billing, não o Score BW.

Isso deixa a primeira API organizada e o caminho claro para free + Stripe sem refazer tudo depois.

---

## 4. Resumo prático

| Tema            | Decisão sugerida |
|-----------------|------------------|
| **Linguagem**   | Node.js (manter); FastAPI só se precisar de Python. |
| **Hosting**     | Um só para começar: Render, Replit ou Railway. |
| **Banco**       | MySQL ou Postgres para plataforma (clientes, keys, billing). Drizzle ou mysql2 em Node; sem SQLAlchemy a menos que use Python; Supabase opcional. |
| **Pagamentos**  | Free (cota) + Stripe (pago). Lógica no Gateway + Billing; Stripe via webhooks; DB guarda plano e uso. |
| **Score BW**    | Stateless; sem banco próprio; Gateway/Billing cuidam de free e Stripe. |

Com isso, a primeira API (Score BW) já nasce alinhada com: um banco (MySQL ou Postgres), um lugar para Gateway/Billing e um modelo free + Stripe bem definido.
