# Passo a passo: entregar a API para um cliente consumir

## Do seu lado (quem opera o Gateway)

### 1. Deixar o Gateway no ar
- Banco criado (`npm run db:push`) e seed rodado se for o primeiro uso.
- Variáveis definidas: `DATABASE_URL`, `SCORE_BW_SERVICE_URL`, `GATEWAY_SERVICE_KEY` e, para criar clientes, `ADMIN_SECRET`.
- Gateway rodando (`npm run dev` no `gateway/`) e acessível na URL que o cliente vai usar (ex.: `https://seu-gateway.replit.dev`).

### 2. Criar o cliente e obter uma API Key
Envie uma requisição **POST** para criar o cliente. A resposta traz a **API Key** — ela só aparece essa vez.

**Exemplo (substitua a URL e o `X-Admin-Key`):**

```bash
curl -X POST https://SEU-GATEWAY.com/admin/clients \
  -H "Content-Type: application/json" \
  -H "X-Admin-Key: SEU_ADMIN_SECRET" \
  -d "{\"name\":\"Nome do Cliente\",\"email\":\"contato@cliente.com\",\"planId\":\"free\"}"
```

Ou no Postman/Insomnia:
- **Método:** POST  
- **URL:** `https://SEU-GATEWAY.com/admin/clients`  
- **Headers:**  
  - `Content-Type: application/json`  
  - `X-Admin-Key: SEU_ADMIN_SECRET`  
- **Body (JSON):**  
  `{ "name": "Nome do Cliente", "email": "contato@cliente.com", "planId": "free" }`

Na resposta, copie o valor de **`apiKey`** e guarde em local seguro.

### 3. Enviar ao cliente
Envie para o cliente (por e-mail ou canal seguro):

1. **URL base da API**  
   Ex.: `https://seu-gateway.replit.dev`

2. **A API Key**  
   Ex.: `bw_live_xxxxxxxxxxxx`

3. **Instruções mínimas** (pode colar no e-mail):

---

## O que enviar para o cliente (copie e adapte)

**Assunto:** Acesso à API KYC — Score BW

**Mensagem:**

- **URL base:** `[COLOQUE_AQUI_A_URL_DO_GATEWAY]`  
  Ex.: https://seu-gateway.replit.dev

- **Sua API Key:** `[COLOQUE_AQUI_A_KEY_GERADA]`  
  Guarde em local seguro e não compartilhe.

**Como usar:**
- Em toda requisição, envie o header: **`X-API-Key: [sua API Key]`**
- Exemplo de chamada (Score PF):

  ```bash
  curl -X POST [URL_BASE]/v1/score-bw/score \
    -H "Content-Type: application/json" \
    -H "X-API-Key: [sua API Key]" \
    -d '{"cpf":"12345678901"}'
  ```

**Endpoints disponíveis:**
- Score PF: `POST /v1/score-bw/score` — body: `{ "cpf": "11 dígitos" }`
- Score PJ: `POST /v1/score-bw/score-pj` — body: `{ "cnpj": "14 dígitos" }`
- PDF PF: `POST /v1/score-bw/pdf` — body: `{ "cpf": "11 dígitos" }`
- PDF PJ: `POST /v1/score-bw/pdf-pj` — body: `{ "cnpj": "14 dígitos" }`

**Testar no navegador:**  
Acesse `[URL_BASE]/dev`, cole sua API Key e use os botões para ver seu uso e testar chamadas.

**Ver seu uso:**  
- `GET [URL_BASE]/v1/me` — seus dados e uso do mês (com header `X-API-Key`).  
- `GET [URL_BASE]/v1/me/usage` — contador do mês (com header `X-API-Key`).

---

## Resumo em 3 passos (seu lado)

| Passo | O que fazer |
|-------|-------------|
| 1 | Gateway no ar com `ADMIN_SECRET` configurado. |
| 2 | POST em `/admin/clients` com `X-Admin-Key`; copiar o `apiKey` da resposta. |
| 3 | Enviar ao cliente: URL base + API Key + instruções acima (ou link para este doc). |

Depois disso o cliente já pode consumir a API com a key recebida.
