# Fluxo end-to-end — Score BW

Como deixar o fluxo **Cliente Fintech → Gateway → Score BW → backend real** funcionando.

## Visão

```
Cliente (curl/Postman/app)  →  Gateway (porta 4000)  →  Serviço Score BW (porta 4001)  →  Backend Score BW real
       X-API-Key (do seed)       valida key + cota           proxy com GATEWAY_SERVICE_KEY      (SCORE_BW_BASE_URL)
                                 grava uso no DB
```

## Pré-requisitos

1. **PostgreSQL** — para o Gateway (ex: Replit Postgres, Neon, local).
2. **Backend Score BW** — URL e API Key do serviço real (ex: Replit do Score BW).

## Passo a passo

### 1. Banco do Gateway

No projeto **KYC-API-platform**:

```bash
cd gateway
npm install
```

Defina `DATABASE_URL` (ex: no `.env` ou Secrets):

```
DATABASE_URL=postgresql://user:senha@host:5432/kyc_gateway
```

Crie as tabelas e o seed:

```bash
npm run db:push
npm run seed
```

Anote a **API Key** que o seed imprimir (ex: `bw_live_xxxx...`). Essa é a chave que o cliente Fintech usa.

### 2. Serviço Score BW

Em outro terminal (ou outro Repl):

```bash
cd services/score-bw
npm install
```

Variáveis:

- `SCORE_BW_BASE_URL` — URL do backend Score BW real.
- `SCORE_BW_API_KEY` — API Key do backend.
- `PLATFORM_API_KEY` — **mesmo valor** que você vai usar em `GATEWAY_SERVICE_KEY` no Gateway (o Gateway chama o Score BW com essa chave).

Suba o serviço:

```bash
npm run dev
```

Deve escutar na porta **4001**.

### 3. Gateway

No **gateway**:

Variáveis:

- `DATABASE_URL` — já definida.
- `SCORE_BW_SERVICE_URL` — URL do **serviço** Score BW (ex: `http://localhost:4001` em local, ou a URL pública do Repl do Score BW).
- `GATEWAY_SERVICE_KEY` — **mesmo valor** de `PLATFORM_API_KEY` do serviço Score BW.

Suba:

```bash
npm run dev
```

Deve escutar na porta **4000**.

### 4. Teste end-to-end

Use a API Key do seed (passo 1):

```bash
# Health do Gateway
curl http://localhost:4000/health

# Score PF (substitua bw_live_... pela key do seed)
curl -X POST http://localhost:4000/v1/score-bw/score \
  -H "Content-Type: application/json" \
  -H "X-API-Key: bw_live_XXXXXXXX" \
  -d '{"cpf":"12345678901"}'
```

Se tudo estiver certo: Gateway valida a key, verifica cota, chama o Score BW na 4001, o Score BW chama o backend real, devolve a resposta e o Gateway grava o uso no banco.

### 5. Cota (free)

O seed cria um plano **free** com cota 100. Após 100 chamadas no mês, o Gateway responde **429** com mensagem de cota atingida. O uso fica em `usage` (por cliente, mês e serviço).

## Resumo de variáveis

| Onde | Variável | Descrição |
|------|----------|-----------|
| Gateway | `DATABASE_URL` | Postgres do Gateway |
| Gateway | `SCORE_BW_SERVICE_URL` | URL do serviço Score BW (ex: http://localhost:4001) |
| Gateway | `GATEWAY_SERVICE_KEY` | Chave que o Gateway envia ao Score BW |
| Score BW (serviço) | `SCORE_BW_BASE_URL` | Backend Score BW real |
| Score BW (serviço) | `SCORE_BW_API_KEY` | Key do backend real |
| Score BW (serviço) | `PLATFORM_API_KEY` | = `GATEWAY_SERVICE_KEY` (quem pode chamar o serviço) |
