# Gateway — API Key, metering, proxy

Ponto único de entrada para clientes (white-labels). Valida API Key, verifica cota, encaminha para os serviços e registra uso.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `DATABASE_URL` | Sim | PostgreSQL (ex: `postgresql://user:pass@host:5432/kyc_gateway`) |
| `SCORE_BW_SERVICE_URL` | Sim* | URL do serviço Score BW (ex: `http://localhost:4001`) |
| `GATEWAY_SERVICE_KEY` | Sim* | Chave que o Gateway envia ao Score BW (mesmo valor do `PLATFORM_API_KEY` do Score BW) |
| `PORT` | Não | Porta do Gateway (padrão: 4000) |

\* Necessário para as rotas `/v1/score-bw/*`

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
- `POST /v1/score-bw/score` — Score PF. Body: `{ "cpf": "...", "refresh"?: boolean }`
- `POST /v1/score-bw/score-pj` — Score PJ. Body: `{ "cnpj": "...", "refresh"?: boolean }`
- `POST /v1/score-bw/pdf` — PDF Score PF. Body: `{ "cpf": "..." }`
- `POST /v1/score-bw/pdf-pj` — PDF Score PJ. Body: `{ "cnpj": "..." }`

Todas (exceto `/health`) exigem header `X-API-Key` e respeitam a cota mensal do plano.

## Rodar

```bash
npm run dev
```

Teste (use a API Key do seed):

```bash
curl -X POST http://localhost:4000/v1/score-bw/score \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bw_live_XXXXXXXX" \
  -d '{"cpf":"12345678901"}'
```
