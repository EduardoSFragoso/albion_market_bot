# handoff.md — contrato vivo do projeto

Leia este arquivo **antes** de mexer no repositório. Ele descreve estrutura, comandos,
contratos que não podem quebrar, armadilhas conhecidas e pendências. Atualizar **na
mesma alteração** que mudar algo estrutural (regra do [AGENTS.md](AGENTS.md)).

## 1. Visão geral

Toolkit de mercado do Albion Online para as Américas (server `west`): site com
calculadoras + bot do Discord, pareados, ambos consultando o mesmo backend.

```
Discord  ─┐
          ├─► apps/web/functions/api/*  (Pages Functions, proxy cacheado do AODP)
Site     ─┘         └─► packages/core (@albion/core) ──► west.albion-online-data.com
```


- **Regra central (DRY):** toda lógica de negócio (impostos, RRR, parsing de IDs,
  convenções de preço) vive em `packages/core`. Site e bot não duplicam cálculo.
- Ver [docs/auditoria-infra.md](docs/auditoria-infra.md) (segurança/infra) e
  [docs/configuracao-repositorio.md](docs/configuracao-repositorio.md) (remoto/proteções).

## 2. Estrutura

```
packages/core/            @albion/core
  scripts/build-data.mjs  baixa dumps (ao-data/ao-bin-dumps) e gera src/data/*.json
  src/api.ts              fetchPrices/fetchHistory/fetchGold, MAIN_CITIES (cache em memória: preços 90s, história 600s, gold 300s)
  src/items.ts            índice de itens + RECIPES, searchItems (aceita sufixo .1/@n), displayName (pt/en), iconUrl
  src/calc/craft.ts       calcCraft, cheapestCityFor, unitPrice/livePrice, RRR_PRESETS, SALES_TAX, SETUP_FEE
  src/calc/flip.ts        calcBestFlip, calcFlipBetween, cheapestCityFor
  src/calc/rank.ts        rankOpportunities/rankUniverse/scoreCraftItem — scan em massa de oportunidades
  src/data/items.json     11.069 itens (nomes PT-BR) — GERADO, não editar à mão
  src/data/recipes.json   8.793 receitas — GERADO
  test/sanity.ts          rede de segurança (npx tsx)
apps/web/                 site (Vite + React + Tailwind v4)
  functions/api/[[route]].ts   backend compartilhado site+bot
  src/components/         SearchBar, PriceTable, PricesPanel, CraftPanel, FlipPanel, HistoryPanel, OpportunitiesPanel
  src/i18n.ts             dicionário PT/EN (site tem toggle de idioma + tema claro/escuro)
apps/bot/                 Worker puro (sem SDK): Ed25519 + comandos /preco /craft /lucro /oportunidades
  src/worker.ts           verificação de assinatura, PING, handlers (embeds PT-BR); /oportunidades usa DEFERRED (type 5) + followup via webhook da interação
  scripts/register-commands.mjs   registra os 4 comandos (PUT /applications/<id>/commands)
docs/                     auditoria-infra.md, configuracao-repositorio.md
```

Namespace de imports no bot: **`@albion/core` não é importado pelo worker** (JSONs de
dados estourariam o bundle free). Os tipos usados são espelhados localmente e os nomes
vêm de `/api/search`.

## 3. Comandos

| Comando | O que faz |
|---|---|
| `npm run build:data` | regenera `src/data/*.json` dos dumps (requer rede) |
| `npm run dev:web` | Vite dev (UI apenas; functions rodar com wrangler pages dev) |
| `npm run dev:bot` | `wrangler dev` do bot local |
| `npm run bot:register` | registra comandos no Discord (lê token de env/`.dev.vars`) |
| `npm run typecheck` | tsc em todos os workspaces |
| `npx vite build` em apps/web | build do site (o que o Pages publica) |
| `npx tsx packages/core/test/sanity.ts` | sanity do core |

Antes de declarar tarefa pronta: typecheck + build web + sanity (regra do AGENTS.md).

## 4. Contratos que NÃO PODEM quebrar

### 4a. `/api/*` (Pages Functions) — consumido pelo site E pelo bot

Respostas JSON com `content-type`, CORS `*`,
`cache-control: public, s-maxage=60, stale-while-revalidate=300`.

| Endpoint | Params principais | Resposta |
|---|---|---|
| `/api/` | — | `{ service, server, endpoints }` |
| `/api/search` | `q, locale=pt\|en, limit (1-30)` | `{ results: ItemIndexEntry[] }` |
| `/api/prices` | `items=id1,id2, locations=, qualities=` | `{ server, prices: MarketPrice[] }` |
| `/api/craft` | `item, buyCity, sellCity, buyMode=instant\|order, salesTax, setupFee, rrr` | `{ server, item, recipe, buyCity, sellCity, result: CraftResult, cheapest }`; `error:'no-recipe'` quando sem receita; 404 item desconhecido |
| `/api/flip` | `item, salesTax, setupFee` | `{ server, item, prices, best: FlipResult\|null }` |
| `/api/history` | `item, days (1-30), timeScale=1\|6\|24, locations=, qualities=` | `{ server, history }` |
| `/api/rank` | `tierMin, tierMax, enchants, maxItems (≤1500), buyMode, sellCity ('best'=maior lance), rrr, salesTax, setupFee, topN (≤250)` | `{ universeSize, scanned, skippedMissing, chunks, entries: RankEntry[], paramsOk }` |

Importante na 4a: parâmetros **ausentes/empty → default do endpoint** (helper `num` trata `null`/`''` explicitamente — `Number(null)=0` já enganou uma vez: `/api/rank` primeira versão capava o universo em 1 item). Erros: `{ error: string }` com status 400/404/502 (nunca stack trace).

### 4b. Semântica de preços e impostos (core)

- Instant buy → `sell_price_min`; buy order → `buy_price_max`; instant sell → `buy_price_max` (maior lance vivo); sell order → `sell_price_min`.
- Impostos de venda: base 8% (premium 4%) + setup 2.5% (premium 1.5%) — **calcCraft aplica AMBOS** desde a feature de rank (antes ignorava o setup fee; alinhamento com flip e bot).
- Resource Return Rate (RRR): presets 0.152 (base), 0.248 (cidade bônus/refineria), 0.435 (Caerleon).
- Craft sem preço vivo do material → usa cidade mais barata com preço e marca `fallbackCity`; **nunca custo 0 silencioso**.

### 4c. IDs de item do mercado (armadilha que já queimou)

- Equipamento encantado: `T4_BAG@1`, `T4_BAG@2`, `T4_BAG@3`.
- **Recurso encantado: `T4_CLOTH_LEVEL1@1`** (formato `<BASE>_LEVEL<n>@<n>` — os formatos `T4_CLOTH@1` e `T4_CLOTH_LEVEL1` sem `@` NÃO retornam dados da API).
- Runes/souls/relics: sem sufixo (`T4_RUNE`).
- Runes entram nas receitas via `upgraderequirements` das entradas de encantamento.
- Receitas de faction/tokens são filtradas por regex `FACTION|_TOKEN|_ROADS` no build-data.
- Mudou algo nisso? Rodar `npm run build:data` e **validar contra a API real** antes de commitar.

### 4d. Bot do Discord

- Assinatura Ed25519 via WebCrypto sobre `timestamp + body` raw; sem/ruim assinatura → 401. Nunca desativar.
- PING (`type:1`) → `{ type: 1 }`. `/preco`, `/craft`, `/lucro` respondem type 4 síncronos. **`/oportunidades` é DEFERRED** (type 5 imediato; o scan pode passar dos 3s do Discord) e edita a resposta via `PATCH /webhooks/<app_id>/<interaction_token>/messages/@original` — usa só o token da interação, sem bot token. Novos comandos demorados devem seguir esse padrão.
- Nomes de item aceitam sufixo de encantamento (`.1`, `@2`) — resolvidos por `/api/search`.
- `SITE_URL` aponta pro site (Pages); o bot usa os endpoints da 4a.
- Registro de comandos: `scripts/register-commands.mjs`, token vem de env ou `apps/bot/.dev.vars` (gitignored; template em `.dev.vars.example`).

## 5. Limites de plataforma que moldaram o design

- **Workers free ~1 MB gzip:** bot não importa os JSONs de dados; `rank` (planejado) precisa universar itens sem importar índice + chunking de fetch.
- **Subrequests do Cloudflare (free):** sem paralelismo agressivo contra o AODP; chunking com paralelismo 4 e cache. `/api/rank` T4–T6 ≈ 7 chunks de 200 ids (limite free ~50 subrequests/invocação).
- **`wrangler pages dev` não recompila quando só `packages/core` muda** (core é symlink em node_modules, fora do watcher). Editar um arquivo de `functions/` força rebuild. Deploy em produção nunca deve pegar esse estado (build CI roda do zero).
- **AODP é serviço comunitário:** sempre gzip, respeitar throttle (`Throttled, be nice...` volta non-JSON → tratar como erro, não quebrar). Cachear no core (TTLs acima: 90s/600s/300s).

## 6. Git

- Commits na `main` (repo local, mantenedor único hoje); artefatos derivados (ex.: `src/data/*.json`) no MESMO commit do código que os gera.
- Nunca commitar: `.dev.vars`, `.env*`, dumps, `dist/`, `node_modules/`.
- Histórico de commits estruturais registrado aqui; quando entrar remoto, migração para PR está em docs/configuracao-repositorio.md.
- Serviços externos/infra (Pages, Workers, secrets reais): só a pessoa mantenedora configura; o agente entrega comandos prontos.

## 7. Pendências / próximos passos

| # | Item | Status |
|---|---|---|
| 1 | `rank.ts` no core + `/api/rank` + aba Oportunidades + `/oportunidades` no bot | ✅ feito |
| 2 | Casos no sanity.ts com resultado conhecido (craft c/ setup fee, rank, universe) | ✅ feito |
| 3 | Comando `/oportunidades` — followup edit validado apenas com token fake (ACK type 5 E2E ok); revisar em produção com app real | pendente (pós-deploy) |
| 4 | CI (GitHub Actions) + dependabot + template de PR (arquivos); configurar remoto e ativar ruleset é manual | ✅ arquivos criados |
| 5 | Deploy (Pages + Workers + secrets): **manual, quando o usuário mandar** | bloqueado por decisão do usuário |

## 8. Histórico estrutural

| Commit | Conteúdo |
|---|---|
| `a323062` | core (API + calculadoras + banco de itens/receitas) e site Cloudflare Pages |
| `94212a1` | bot do Discord (Worker) + busca com sufixo de encantamento |
| (este) | diretrizes (AGENTS.md, docs/), handoff.md, package-lock.json |
| `0378b8a` | ranking de oportunidades (core rank + /api/rank + aba + /oportunidades) |
| (infra)   | CI (ci.yml), dependabot, template de PR |
