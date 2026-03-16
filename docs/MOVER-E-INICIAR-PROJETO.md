# Mover KYC-API-platform e iniciar o projeto

Guia para tirar o **KYC-API-platform** da pasta do PDF generator e começar a trabalhar no novo ambiente.

---

## 1. Resolver o erro "Pasta em Uso"

O Windows bloqueia mover/renomear a pasta porque algum programa está usando um arquivo dentro dela (geralmente o **Cursor** ou o Explorador de Arquivos).

**Faça nesta ordem:**

1. **No Cursor**
   - Feche todas as abas de arquivos que estejam em `KYC-API-platform` (ex.: `END-TO-END-SCORE-BW.md`).
   - Opcional: **File → Open Folder** e abra outra pasta qualquer (ex. `C:\Users\renan`) para o workspace parar de “segurar” a pasta.

2. **No PC**
   - Feche o Explorador de Arquivos na pasta `KYC-PDF-generator` (ou em qualquer subpasta de `KYC-API-platform`).
   - Se tiver terminal aberto com `cd` em `KYC-API-platform` ou em alguma subpasta, feche o terminal ou mude o diretório.

3. **Tentar novamente**
   - No Explorador, clique em **"Tentar Novamente"** na mensagem de erro.
   - Se ainda der "Pasta em Uso", reinicie o Cursor e tente mover de novo.

---

## 2. Mover a pasta para fora do PDF generator

**Opção A – Arrastar no Explorador**

1. Abra: `C:\Users\renan\KYC-PDF-generator`
2. Arraste a pasta **KYC-API-platform** para `C:\Users\renan`.
3. O resultado deve ser: `C:\Users\renan\KYC-API-platform`.

**Opção B – Copiar e depois apagar (se mover continuar bloqueado)**

1. Copie a pasta inteira **KYC-API-platform** para `C:\Users\renan`.
2. Confira que tudo está em `C:\Users\renan\KYC-API-platform`.
3. Depois de conferir, apague a pasta antiga dentro de `KYC-PDF-generator`.

---

## 3. Abrir o projeto no Cursor e preparar o ambiente

1. **Abrir a nova pasta**
   - No Cursor: **File → Open Folder**
   - Selecione: `C:\Users\renan\KYC-API-platform`
   - Confirme com **Selecionar Pasta**.

2. **Instalar dependências**

   No terminal do Cursor (raiz do projeto = `KYC-API-platform`):

   ```bash
   cd gateway
   npm install
   cd ..
   cd services/score-bw
   npm install
   cd ../..
   ```

3. **Configurar o Gateway (banco e variáveis)**

   - Crie/edite `gateway/.env` com algo como:

   ```env
   DATABASE_URL=postgresql://user:senha@host:5432/kyc_gateway
   ```

   - Depois:

   ```bash
   cd gateway
   npm run db:push
   npm run seed
   ```

   Anote a **API Key** que o seed mostrar (ex.: `bw_live_xxxx...`).

4. **Configurar o serviço Score BW** (quando for usar)

   - Em `services/score-bw`, configure no `.env` ou nas variáveis de ambiente:
     - `SCORE_BW_BASE_URL` — URL do backend Score BW real
     - `SCORE_BW_API_KEY` — API Key do backend
     - `PLATFORM_API_KEY` — mesmo valor que você usar em `GATEWAY_SERVICE_KEY` no Gateway

   - Subir o serviço:

   ```bash
   cd services/score-bw
   npm run dev
   ```

   (Deve escutar na porta **4001**.)

5. **Subir o Gateway**

   Em outro terminal:

   ```bash
   cd gateway
   npm run dev
   ```

   (Geralmente porta **4000**.)

---

## 4. Resumo rápido

| O que fazer | Onde / comando |
|-------------|-----------------|
| Evitar "Pasta em Uso" | Fechar abas do KYC-API-platform no Cursor e pastas no Explorador |
| Nova localização do projeto | Ex.: `C:\Users\renan\API_Score` ou `C:\Users\renan\KYC-API-platform` |
| Abrir no Cursor | File → Open Folder → pasta do projeto |
| Instalar deps | `gateway`: `npm install`; `services/score-bw`: `npm install` |
| Banco + seed | `gateway`: `npm run db:push` e `npm run seed` |
| Fluxo completo | Ver `docs/END-TO-END-SCORE-BW.md` |

Depois de mover e abrir a pasta no Cursor, use este guia e o `END-TO-END-SCORE-BW.md` para deixar o fluxo Cliente → Gateway → Score BW funcionando. Para infraestrutura com **Render + Supabase**, use **docs/INFRA-RENDER-SUPABASE.md**.
