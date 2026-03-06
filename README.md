# KYC-API-platform

Repositório dedicado ao **API Gateway** e **microsserviços** da plataforma BetterWith.

- Começa vazio; cada serviço entra aos poucos.
- O app principal ([KYC-PDF-generator](https://github.com/RenanBarretoJ/KYC-PDF-Generator)) continua rodando em produção e passará a consumir estas APIs de forma gradual (Strangler Fig).

## Estrutura prevista

```
KYC-API-platform/
├── gateway/          # API Gateway (auth, rate limit, billing)
├── services/
│   ├── score-bw/     # API Score BW (PF/PJ)
│   ├── scr/          # API SCR (HBI/Bacen)
│   └── kyc-serasa/   # API KYC (Serasa)
├── shared/           # Contratos, tipos, libs compartilhadas
└── docs/             # OpenAPI, guias
```

## Próximos passos

1. [ ] Configurar primeiro serviço (Score BW)
2. [ ] Definir contratos OpenAPI
3. [ ] API Keys por cliente + rate limit
4. [ ] Integrar com o monolito via feature flag
