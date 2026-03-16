# Usar seu próprio banco: Supabase ou MySQL

O Gateway hoje usa **PostgreSQL**. Você pode usar **Supabase** (PostgreSQL na nuvem) ou, com adaptação, **MySQL**.

> **Render + Supabase:** guia unificado em **[INFRA-RENDER-SUPABASE.md](./INFRA-RENDER-SUPABASE.md)**. Abaixo: como configurar e onde guardar dados da API (registro de uso, clientes e dados extraídos/salvos).

---

## 1. Supabase (recomendado — funciona hoje)

O **Supabase** é PostgreSQL. O Gateway já é compatível: basta apontar `DATABASE_URL` para a connection string do Supabase.

### 1.1 Criar projeto no Supabase

1. Acesse **https://supabase.com** e crie uma conta (ou faça login).
2. **New Project** → escolha nome, senha do banco (guarde essa senha) e região.
3. Quando o projeto estiver pronto, vá em **Project Settings** (ícone de engrenagem) → **Database**.

### 1.2 Pegar a connection string

Em **Database** você verá:

- **Connection string** — escolha **URI**.
- A URL vem assim: `postgresql://postgres.[PROJECT-REF]:[SUA-SENHA]@aws-0-[REGION].pooler.supabase.com:6543/postgres`
- Troque `[YOUR-PASSWORD]` pela senha que você definiu ao criar o projeto.
- Use a porta **5432** (direct) para acessar de fora (ex.: sua máquina para `db:push` e `seed`). Para o Render, pode usar a **Connection pooling** (porta 6543) que o Supabase mostra — ambas funcionam.

Exemplo (não use senha real em código):

```
postgresql://postgres.xxxxx:SUA_SENHA@aws-0-us-east-1.pooler.supabase.com:6543/postgres
```

Essa URL é a sua **DATABASE_URL**.

### 1.3 Usar no Gateway

- **No Render:** em **Environment** do Web Service, crie a variável **DATABASE_URL** e cole a URL do Supabase (com a senha preenchida).
- **Na sua máquina:** no `.env` da pasta `gateway`, coloque:
  ```
  DATABASE_URL=postgresql://postgres.xxxxx:SUA_SENHA@...
  ```

### 1.4 Criar tabelas e primeiro cliente

Na pasta do gateway (com `DATABASE_URL` apontando para o Supabase):

```bash
cd gateway
npm install
npm run db:push
npm run seed
```

Isso cria as tabelas **plans**, **clients**, **api_keys** e **usage** no Supabase e gera o primeiro cliente e a primeira API Key. Tudo que a API registra (clientes, chaves, uso por mês/serviço) fica nesse banco.

### 1.5 Guardar “dados extraídos” e “dados salvos” no mesmo Supabase

Se você quiser guardar no **mesmo projeto Supabase**:

- **Dados da API (ex.: resultado de Score, PDFs gerados):** podemos adicionar novas tabelas no mesmo banco, por exemplo:
  - `score_results` — CPF/CNPJ, resposta do Score, data, clientId.
  - `pdf_requests` — quem pediu, quando, tipo (PF/PJ).
- O Gateway hoje só grava **usage** (contador). Para persistir o corpo das respostas (dados extraídos/salvos), seria um passo seguinte: novo endpoint ou job que grava nessa tabela após cada chamada, ou um serviço separado que consome a API e grava no Supabase.

Resumo: **registro da API** (clientes, keys, uso) já fica no Supabase usando as tabelas atuais. **Dados extraídos/salvos** podem ficar no mesmo Supabase em tabelas novas que a gente desenha no próximo passo.

---

## 2. MySQL

O Gateway foi feito para **PostgreSQL** (Drizzle com `pg` e `pg-core`). Para usar **MySQL** existem dois caminhos:

### Opção A — Só Gateway no Supabase/PostgreSQL; MySQL para o resto

- **Gateway + uso da API:** continuam em **Supabase** (ou outro Postgres), como acima.
- **Dados de negócio / extraídos / salvos:** sua aplicação ou outro serviço grava no **MySQL** (por exemplo resultados de Score que você processa e salva). O Gateway não precisa falar com MySQL nesse caso.

### Opção B — Gateway usando MySQL

Para o **próprio Gateway** usar MySQL (tabelas `plans`, `clients`, `api_keys`, `usage`), é preciso **adaptar o código**:

- Trocar o driver de `pg` para `mysql2`.
- Trocar o schema do Drizzle de `pg-core` para `mysql-core` (tipos e sintaxe podem mudar um pouco).
- Ajustar `db.ts` e o que depender de recursos específicos do Postgres (ex.: `jsonb`, `uuid`).

Se você quiser seguir pela Opção B, podemos fazer essa adaptação em um próximo passo (criar camada MySQL no gateway).

---

## Resumo

| Objetivo | O que fazer |
|----------|-------------|
| **Deixar a API no ar e registrar tudo (clientes, keys, uso)** | Use **Supabase**. Crie o projeto, pegue a `DATABASE_URL`, coloque no Render (e no `.env` local), rode `db:push` e `seed`. |
| **Guardar dados extraídos/salvos (ex.: resultados de Score)** | No **mesmo Supabase**: podemos adicionar tabelas e lógica para gravar essas informações. Em **MySQL**: use MySQL na sua aplicação que consome a API; o Gateway pode continuar em Postgres/Supabase. |
| **Usar só MySQL para tudo** | Hoje o Gateway não fala com MySQL. Ou você usa Supabase (Postgres) para o Gateway e MySQL só para dados de negócio, ou adaptamos o Gateway para MySQL (Opção B acima). |

Recomendação: comece com **Supabase** para o Gateway e para o que a API registra; depois decidimos onde e como persistir os dados extraídos/salvos (mesmo Supabase ou MySQL).
