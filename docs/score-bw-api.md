# Contrato — Score BW API

Base URL (exemplo): `https://score-bw.seudominio.com`

## Autenticação

Todas as rotas (exceto `GET /health`) exigem o header:

```
X-API-Key: <sua_api_key_plataforma>
```

## Endpoints

### GET /health

Health check. Não requer autenticação.

**Resposta 200:**
```json
{ "status": "ok", "service": "score-bw", "timestamp": "2026-03-05T..." }
```

---

### POST /score (Pessoa Física)

**Body:**
```json
{
  "cpf": "12345678901",
  "refresh": false
}
```

- `cpf`: obrigatório, 11 dígitos (pode enviar com máscara; será limpo).
- `refresh`: opcional; se `true`, força nova consulta no backend.

**Resposta 200:** objeto retornado pelo backend Score BW (ex.: `score`, `score_replit`, `score_modelo`, etc.).

**Erros:** 400 (CPF inválido), 401 (API Key), 502 (backend indisponível).

---

### POST /score-pj (Pessoa Jurídica)

**Body:**
```json
{
  "cnpj": "12345678000199",
  "refresh": false
}
```

**Resposta:** mesmo padrão do backend Score BW PJ.

---

### POST /pdf (PDF Score PF)

**Body:** `{ "cpf": "12345678901" }`

**Resposta 200:** arquivo PDF (Content-Type: application/pdf).

---

### POST /pdf-pj (PDF Score PJ)

**Body:** `{ "cnpj": "12345678000199" }`

**Resposta 200:** arquivo PDF.

---

## Rate limit

30 requisições por minuto por IP (configurável).
