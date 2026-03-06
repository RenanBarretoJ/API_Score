# Schema sugerido — Plataforma (Gateway + Billing)

Quando for implementar o Gateway e o Billing (free + Stripe), use um **único banco** (MySQL ou PostgreSQL). Abaixo um esboço para deixar a API organizada desde o início.

## Tabelas

### `clients`
| Coluna        | Tipo     | Descrição |
|---------------|----------|-----------|
| id            | UUID PK  | |
| name          | string   | Nome do cliente/empresa |
| email         | string   | Contato |
| plan_id       | FK       | free / paid |
| stripe_customer_id | string | nullable, preenchido ao criar cliente no Stripe |
| status        | enum     | active, suspended, cancelled |
| created_at    | datetime |
| updated_at    | datetime |

### `api_keys`
| Coluna     | Tipo    | Descrição |
|------------|---------|-----------|
| id         | UUID PK | |
| client_id  | FK      | |
| key_hash   | string  | Hash da API Key (nunca guardar em texto plano) |
| key_prefix | string  | Ex: `bw_live_abc` (primeiros caracteres para identificar) |
| scopes     | JSON    | Ex: `["score:read", "scr:read"]` |
| rate_limit | int     | Requisições/minuto por key |
| created_at | datetime |

### `plans`
| Coluna       | Tipo   | Descrição |
|--------------|--------|-----------|
| id           | PK     | free, paid_basic, paid_pro |
| name         | string | |
| monthly_quota| int    | Consultas incluídas no mês (0 = ilimitado pago) |
| stripe_price_id | string | nullable, ID do preço no Stripe |
| extra_price_per_call | decimal | Preço por consulta extra |

### `usage`
| Coluna     | Tipo    | Descrição |
|------------|---------|-----------|
| id         | PK      | |
| client_id  | FK      | |
| month      | int     | 1–12 |
| year       | int     | |
| count      | int     | Total de chamadas no mês |
| by_service | JSON    | Ex: `{ "score-bw": 100, "scr": 50 }` |
| updated_at | datetime |

### `billing_events` (opcional — log Stripe)
| Coluna   | Tipo   | Descrição |
|----------|--------|-----------|
| id       | PK     | |
| client_id| FK     | |
| stripe_event_id | string | webhook id |
| type     | string | payment_intent.succeeded, customer.subscription.updated, etc. |
| payload  | JSON   | snapshot do evento |
| created_at | datetime |

---

## Uso no fluxo

1. **Gateway** recebe request com `X-API-Key` → busca `api_keys` por key_prefix ou valida hash → obtém `client_id` e `scopes`.
2. Verifica **plans** e **usage** (mês atual): se `count < monthly_quota` (free) ou se cliente tem assinatura ativa no Stripe, deixa passar e incrementa **usage**.
3. **Billing** (cron ou em tempo real) compara uso vs cota; se excedeu, cria cobrança no Stripe ou bloqueia até pagar. Webhooks Stripe atualizam status e podem escrever em **billing_events**.

Com isso, a primeira API (Score BW) continua stateless; quando o Gateway existir, ele usa esse schema para free + Stripe.
