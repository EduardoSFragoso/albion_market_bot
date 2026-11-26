<!-- Motivo do PR em 1–2 linhas. Máx. 70 chars no título. -->

## O quê

-

## Por quê

-

## Checklist (regras do [AGENTS.md](AGENTS.md))

- [ ] `npm run typecheck` limpo
- [ ] `npx tsx packages/core/test/sanity.ts` passando — bug novo em `core` tem caso de teste que falha no código antigo
- [ ] Testes da camada alterada: `npm run test:bot`, `npm run test:api-cache`, `npm run test:web-validation` e/ou `npm run test:api-rate-limit`
- [ ] Teste novo de regressão falha no código anterior, quando aplicável (cópia descartável)
- [ ] `npm run build:web` compila
- [ ] `npm run build:api-limiter` compila se o Worker limitador foi alterado
- [ ] `node --check apps/bot/scripts/register-commands.mjs` passa se o script de registro foi alterado
- [ ] Nada de segredos (`.dev.vars`, tokens) nem artefatos derivados esquecidos no diff
- [ ] `handoff.md` atualizado se a mudança for estrutural (rotas, dados gerados, contratos)
