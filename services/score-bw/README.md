# Score BW — Microsserviço

API de **Score BW** (PF/PJ) e geração de PDF. Faz proxy para o backend Score BW real; clientes chamam este serviço com sua API Key da plataforma.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `SCORE_BW_BASE_URL` | Sim | URL do backend Score BW (ex: `https://score-pf--xxx.replit.app`) |
| `SCORE_BW_API_KEY` | Sim | API Key para autenticar no backend Score BW |
| `PLATFORM_API_KEY` ou `API_KEY` | Sim | API Key que os clientes enviam no header `X-API-Key` |
| `PORT` | Não | Porta do serviço (padrão: 4001) |

## Endpoints

- `GET /health` — Health check (sem auth)
- `POST /score` — Consulta Score PF. Body: `{ "cpf": "12345678901", "refresh"?: boolean }`. Header: `X-API-Key`
- `POST /score-pj` — Consulta Score PJ. Body: `{ "cnpj": "...", "refresh"?: boolean }`
- `POST /pdf` — PDF Score PF. Body: `{ "cpf": "..." }`. Resposta: PDF binário
- `POST /pdf-pj` — PDF Score PJ. Body: `{ "cnpj": "..." }`

## Rodar local

```bash
cd services/score-bw
npm install
npm run dev
```

Teste: `curl -X POST http://localhost:4001/score -H "Content-Type: application/json" -H "X-API-Key: SUA_PLATFORM_KEY" -d '{"cpf":"12345678901"}'`
