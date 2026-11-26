# AGENTS.md — diretrizes deste repositório

Diretrizes de desenvolvimento ancoradas nas regras gerais da pessoa mantenedora,
adaptadas ao escopo deste projeto (Albion Online: site Cloudflare Pages +
bot Discord em Cloudflare Workers + monorepo npm/TypeScript).
Checklists de apoio: [docs/auditoria-infra.md](docs/auditoria-infra.md) e
[docs/configuracao-repositorio.md](docs/configuracao-repositorio.md).

## Princípios gerais

- Soluções simples, claras e fáceis de manter. YAGNI: nada de abstração ou feature sem necessidade concreta.
- DRY: regras de negócio (impostos, resource return, convenções de preço, parsing de IDs do jogo) vivem **uma** vez, em `packages/core`. Site e bot não duplicam lógica — consomem a API do site ou o core.
- Separe responsabilidades: core (dados/cálculo) ≠ web (UI + proxy cacheado) ≠ bot (interações Discord).
- Preserve comportamento existente, salvo pedido explícito de mudança.

## Estrutura e comandos

```
packages/core/   @albion/core — API AODP, itens/receitas (gerados), calculadoras
apps/web/        site (Vite+React+Tailwind) + functions/api/* (Pages Functions)
apps/bot/        Worker do Discord (interações HTTP puro, sem SDK)
docs/            checklists (auditoria, configuração)
handoff.md       contrato vivo do projeto — leia antes de mexer
```

Comandos: `npm run build:data` (regenera itens/receitas dos dumps — requer rede),
`npm run dev:web`, `npm run dev:bot`, `npm run bot:register`, `npm run typecheck`.
Matriz completa da CI: `.github/workflows/ci.yml`.

## Qualidade, erros e testes

- Antes de dar tarefa por concluída: `npm run typecheck`, sanity do core (`npx tsx packages/core/test/sanity.ts`), testes da camada tocada (`npm run test:bot`, `npm run test:api-cache`, `npm run test:web-validation`, `npm run test:api-rate-limit`) e build aplicável (`npm run build:web`; `npm run build:api-limiter` se o limitador mudar). A matriz completa está em `.github/workflows/ci.yml`.
- Regra de negócio nova ou corrigido de bug em `core` **precisa** de caso em test/sanity.ts com dados fictícios pequenos e resultado conhecido — e o teste novo tem que falhar no código antigo (confirme antes de confiar).
- Erros previsíveis são tratados explicitamente (ex.: resposta da API do AODP vazia/velha emite dado ausente, nunca custo 0 silencioso); nada de catch genérico engolindo erro.
- Dados grandes (bundles, universos de itens): chunking + cache; NÃO otimizar sem medir.

## Segurança (específica deste projeto)

- Segredos que **nunca** entram no código/git: `DISCORD_BOT_TOKEN` e chaves secretas de APIs. Nomes de variáveis em `.dev.vars.example`, valores em `.dev.vars` (gitignored) em dev e `wrangler secret put` em produção.
- `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` e `SITE_URL` são públicos e podem ficar no `wrangler.toml`.
- No frontend só existem chaves feitas para serem públicas. As functions envolvem a API do AODP e **não expõem** nada além dos endpoints documentados no handoff.
- CORS das functions: atualmente `*` (site e bot consultam, sem cookies). Se um dia houver login/cookies, restringir por origem imediatamente.
- Valide/normalize todo parâmetro de query antes de usar (ids de item correspondem a padrão, números com clamp).
- Antes de cada commit: `git status` + `git diff --staged` — nada de `.dev.vars`, `.env`, dumps de dados, `dist/`, `node_modules/`. O `.gitignore` fica em dia.
- Se um segredo entrar no histórico, tratá-lo como vazado: rotacionar primeiro.

## As ferramentas do projeto (e cortesias de API)

- TypeScript estrito (tsconfig.base) + Vite + Tailwind v4. Nenhuma ferramenta nova sem necessidade; se entrar, registre o motivo no handoff.md.
- API do [Albion Online Data Project](https://www.albion-online-data.com): serviço comunitário com throttle — **sempre** gzip, sempre cache (core já cacheia; respeitar TTLs; nada de polling em loop). Novidades de endpoint: confirmar na doc atual (west.albion-online-data.com/api-docs), não presuma.
- IDs de item do mercado têm convenções esquisitas: equipamento encantado `T4_BAG@1`, recursos encantados `T4_CLOTH_LEVEL1@1`, runes/souls/relics sem sufixo, nomes `_LEVELn` do dump convivem com `@n`. Você **mexeu** nisso? Rode o build-data e valide contra a API real antes de commitar (armadilha conhecida, já queimou uma vez).
- Cloudflare: limites de bundle (Workers free ~1MB gzip) — não importar JSONs de dados no worker do bot; páginas/limite de subrequests quando raspar muitos itens (chunking em `rank.ts`).

## Git e colaboração

- Commits com assunto objetivo até 70 caracteres, detalhes no corpo. Neste repositório remoto, nunca commitar direto na `main`: toda mudança entra por branch + PR e merge por **Rebase and merge**, conforme o ruleset registrado no `handoff.md`.
- Artefatos derivados alterados entram no MESMO commit (ex.: `src/data/*.json` gerados junto do build-data).
- Antes de dar por concluída uma tarefa grande: revisão própria do diff (erros, duplicação, complexidade desnecessária) e checagens do item "Qualidade".

## Deploy e infraestrutura

- O agente **não faz deploy** (nada de `wrangler deploy`/`pages deploy`, nem altera dashboards, rulesets, variables de conta, DNS, domínios) sem pedido explícito. Propor e deixar comandos prontos.
- Sem infra de banco nesta stack até que se peça: se um estado persistido entrar (ex.: histórico de preços), ele entra só no servidor (Workers KV/D1 ou externo), nunca no bundle do frontend.
- Checklist de auditoria (riscos, segredos, CI): `docs/auditoria-infra.md`. O que não se pode fazer sem confirmação está listado lá.

## Documentação

- `README.md` (raiz) — propósito, setup, deploy. Atualizar quando mudar o modo de usar.
- `handoff.md` — estrutura, comandos, **contratos que não podem quebrar** (API interna do site, formatos de resposta, caminho de dados gerados), armadilhas, pendências. Atualizar NA MESMA alteração que mudar algo estrutural.
- Comentários explicam decisão/regra não óbvia (ex.: por que instant-buy usa `sell_price_min`), não o óbvio. `TODO:` pendentes descrevem o que falta.

## IA e auditoria

- Toda sugestão de código (inclusive gerada por IA) é hipótese: verificar antes de aceitar; entender o que entra no repo.
- Tarefa grande começa com plano em etapas. Repositório novo/parte nova: auditoria sem alterações primeiro (ver docs/auditoria-infra.md).
- Não presuma comportamento de API/serviço: confirmar na fonte ou testando (no escopo local: wrangler dev, curl). Registre hipóteses não confirmadas.
