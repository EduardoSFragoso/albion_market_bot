<!-- Motivo do PR em 1–2 linhas. Máx. 70 chars no título. -->

## O quê

-

## Por quê

-

## Checklist (regras do [AGENTS.md](AGENTS.md))

- [ ] `npm run typecheck` limpo
- [ ] `npx tsx packages/core/test/sanity.ts` passando — bug novo em `core` tem caso de teste que falha no código antigo
- [ ] `npm run build:web` compila
- [ ] Nada de segredos (`.dev.vars`, tokens) nem artefatos derivados esquecidos no diff
- [ ] `handoff.md` atualizado se a mudança for estrutural (rotas, dados gerados, contratos)
