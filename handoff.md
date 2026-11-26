# handoff.md — contrato vivo do projeto

Leia este arquivo **antes** de mexer no repositório. Ele descreve estrutura, comandos,
contratos que não podem quebrar, armadilhas conhecidas e pendências. Atualizar **na
mesma alteração** que mudar algo estrutural (regra do [AGENTS.md](AGENTS.md)).

## Ponto salvo — 2026-11-26 (workflow CodeQL)

- O ruleset de `main` exige `check` e `Analyze (javascript-typescript)` emitido por
  GitHub Actions. O workflow `.github/workflows/codeql.yml` restaura esse job para
  Actions e JavaScript/TypeScript; as ações estão fixadas por SHA.
- Para aceitar o upload da análise, em **Settings → Security → Advanced Security →
  CodeQL analysis**, trocar de **Default setup** para **Advanced setup** (desabilitar
  Default setup). Não remover nem renomear o check obrigatório do ruleset.
- Validar após habilitar Advanced setup: a análise do PR deve concluir e enviar resultados;
  o PR Dependabot #28 deve reportar `Analyze (javascript-typescript)` junto ao `check`.

## Ponto salvo — 2026-11-26 (após merge e deploy)

- PR #21 (`codex/api-rate-limiter`) foi mesclado em `main` no commit `a327a67`.
  As verificações obrigatórias do PR passaram.
- Worker privado `albion-market-api-limiter` publicado no Cloudflare. As Pages de
  produção publicaram o commit mesclado e receberam o Service Binding `API_LIMITER`.
  Smoke test HTTPS ao endpoint `/api/search` na implantação específica retornou `200`.
- O limite é best-effort: 60 unidades por 60 segundos e por IP; `/rank` consome 10.
  Não foi feito teste de carga para provocar `429` em produção. O comportamento `429`
  está coberto pelos testes do Worker; o limitador é aproximado por localidade Cloudflare.
- Verificações locais: typecheck, sanity do core, testes de bot/API/cache/validação e
  builds passaram; `npm audit` reportou zero vulnerabilidades. O sanity do core precisou
  ser executado fora do isolamento do ambiente; isolado, Node pode falhar com
  `uv_os_get_passwd returned ENOMEM`. O build web mantém um aviso de chunk grande.
- A alteração também invalida cálculo de `/craft` quando preços estão ausentes ou velhos,
  valida cidades em `/craft` e `/rank`, limita o corpo de interações do bot a 64 KiB,
  limita chamadas AODP únicas em voo a 64 por isolate e valida preferências locais do
  navegador. O Worker do bot foi modularizado e seus comandos foram caracterizados.

## 1. Visão geral

Toolkit de mercado do Albion Online para as Américas (server `west`): site com
calculadoras + bot do Discord, pareados, ambos consultando o mesmo backend.

```
Discord  ─┐
          ├─► apps/web/functions/api/*  (Pages Functions, proxy cacheado do AODP)
Site     ─┘         ├─► apps/api-limiter (Worker interno; rate limit por IP)
                    └─► packages/core (@albion/core) ──► west.albion-online-data.com
```


- **Regra central (DRY):** toda lógica de negócio (impostos, RRR, parsing de IDs,
  convenções de preço) vive em `packages/core`. Site e bot não duplicam cálculo.
- Ver [docs/auditoria-infra.md](docs/auditoria-infra.md) (segurança/infra) e
  [docs/configuracao-repositorio.md](docs/configuracao-repositorio.md) (remoto/proteções).

## 2. Estrutura

```
packages/core/            @albion/core
  scripts/build-data.mjs  baixa dumps (ao-data/ao-bin-dumps) e gera src/data/*.json
  src/api.ts              fetchPrices/fetchHistory/fetchGold, MAIN_CITIES (cache LRU em memória: até 256 chaves; preços 90s, história 600s, gold 300s; chamadas idênticas concorrentes são deduplicadas)
  src/items.ts            índice de itens + RECIPES, searchItems (aceita sufixo .1/@n), displayName (pt/en), iconUrl
  src/calc/craft.ts       calcCraft, cheapestCityFor, unitPrice/livePrice, RRR_PRESETS, SALES_TAX, SETUP_FEE
  src/calc/flip.ts        calcBestFlip, calcFlipBetween, craftMaterialCost (custo de materiais por cidade mais barata, RRR)
  src/calc/rank.ts        rankOpportunities/rankUniverse/scoreCraftItem — scan em massa de oportunidades
  src/calc/enchant.ts     compareEnchants/enchantFamilyIds — comprar pronto vs. craftar por nível (.0–.3)
  src/data/items.json     11.158 itens (nomes PT-BR) — GERADO, não editar à mão
  src/data/recipes.json   9.039 receitas — GERADO; inclui alternativas e limites individuais de RRR
  test/sanity.ts          rede de segurança (npx tsx)
apps/web/                 site (Vite + React + Tailwind v4)
  functions/api/[[route]].ts   backend compartilhado site+bot
  src/components/         SearchBar, PriceTable, PricesPanel, CraftPanel, FlipPanel, HistoryPanel, OpportunitiesPanel, EnchantPanel
  src/i18n.ts             dicionário PT/EN (site tem toggle de idioma + tema claro/escuro)
apps/api-limiter/         Worker interno sem URL workers.dev, chamado por Service Binding das Pages Functions
  src/worker.ts           rate limit aproximado por IP: 60 unidades/60s; /rank custa 10
apps/bot/                 Worker puro (sem SDK): Ed25519 + comandos /preco /craft /lucro /encantamento /oportunidades
  src/worker.ts           verificação de assinatura com janela temporal de ±5 min, PING, handlers (embeds PT-BR); /oportunidades usa DEFERRED (type 5) + followup via webhook da interação
  scripts/register-commands.mjs   registra os 5 comandos (PUT /applications/<id>/commands)
desktop-client/           app pessoal Windows (Go + Wails + Svelte): captura passiva, dump local de ordens e preferências de envio ao AODP
docs/                     auditoria-infra.md, configuracao-repositorio.md, scan-daemon.md (guia; execução manual)
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
| `npm run test:bot` | testes de assinatura Discord, PING e janela temporal |
| `npm run test:api-cache` | deduplicação de fetch e limite do cache do core |
| `npm run test:web-validation` | limites e validação de entradas da API web |
| `npm run test:api-rate-limit` | gate Pages + rate limit Worker (inclui IP, 429 e peso do `/rank`) |
| `npm run build:api-limiter` | empacota o Worker em dry-run, sem publicar |
| `go test ./...` em `desktop-client` | testes do app Go (captura, arquivo, preferências e interface de rede) |
| `npm test` em `desktop-client/frontend` | testes de formatação e rótulos do arquivo local |
| `npm run build` em `desktop-client/frontend` | gera interface e índices de nomes localizados |
| `go build -o bin/albion-market-archive.exe .` em `desktop-client` | compila o app; não o inicia |

Antes de declarar tarefa pronta: typecheck + build web + sanity (regra do AGENTS.md).

## 4. Contratos que NÃO PODEM quebrar

### 4a. `/api/*` (Pages Functions) — consumido pelo site E pelo bot

Respostas JSON com `content-type`, CORS `*`,
`cache-control: public, s-maxage=60, stale-while-revalidate=300`.

| Endpoint | Params principais | Resposta |
|---|---|---|
| `/api/` | — | `{ service, server, endpoints }` |
| `/api/search` | `q (≤100 chars), locale=pt\|en, limit (1-30)` | `{ results: ItemIndexEntry[] }` |
| `/api/prices` | `items` (1–200 IDs), `locations` (MAIN_CITIES, até 8), `qualities` (1–5) | `{ server, prices: MarketPrice[] }` |
| `/api/craft` | `item, buyCity, sellCity, buyMode=instant\|order, salesTax, setupFee, rrr` | `{ server, item, recipe, buyCity, sellCity, result: CraftResult, cheapest }`; `recipe.resources` apresenta a alternativa selecionada por custo e expande os componentes (máx. 5 níveis/200 nós, quantidades acumuladas sem desconto de RRR); alternativas sem preço completo não vencem uma rota completa; `error:'no-recipe'` quando sem receita; 404 item desconhecido |
| `/api/flip` | `item, salesTax, setupFee` | `{ server, item, prices, best: FlipResult\|null }` |
| `/api/history` | `item, days (1-30), timeScale=1\|6\|24, locations=, qualities=` | `{ server, history }` |
| `/api/rank` | `tierMin, tierMax, enchants, maxItems (≤1500), buyMode, sellCity ('best'=maior lance), rrr, salesTax, setupFee, topN (≤250)` | `{ universeSize, scanned, skippedMissing, chunks, entries: RankEntry[], paramsOk }` |
| `/api/enchant` | `item (id ou id@n), buyMode=instant\|order, rrr` | `{ server, baseId, rows: EnchantRow[] }` — uma linha por nível .0–.3 existente; cada linha inclui `ingredients` da receita; `.0` é o item base sem encantamento; `craftCost/buyPrice: null` = sem dado vivo; sufixo `@n` no input é removido antes (usa `enchantBaseId`) |

Importante na 4a: parâmetros **ausentes/empty → default do endpoint** (helper `num` trata `null`/`''` explicitamente — `Number(null)=0` já enganou uma vez: `/api/rank` primeira versão capava o universo em 1 item). Erros: `{ error: string }` com status 400/404/429/502/503 (nunca stack trace). Respostas 429/503 usam `Cache-Control: no-store`; o restante mantém cache público de 60s.

Antes do dispatch, a Function exige `CF-Connecting-IP` e consulta o Service Binding
`API_LIMITER`; `X-Forwarded-For` não é usado. Sem IP/limitador ou se o serviço falhar,
responde 503 (fail-closed). O Worker interno usa Rate Limiting binding (60 unidades por
IP em 60s; `/rank` vale 10; demais rotas valem 1). O limite é aproximado por localidade,
e usuários atrás do mesmo NAT compartilham cota. Não é um limite global rígido.

Limites atuais da entrada: `search.q` até 100 caracteres; `/prices` aceita até 200 IDs
por chamada; IDs podem ter até 100 caracteres e devem usar letras/números/`_` e
sufixo opcional `@n`; cidades devem estar em `MAIN_CITIES`; qualidades vão de 1 a 5.
Listas repetidas são deduplicadas. `/history` aplica os mesmos formatos de ID, cidade
e qualidade; `/rank` aceita até quatro encantamentos entre 0 e 3.

### 4b. Semântica de preços e impostos (core)

- Instant buy → `sell_price_min`; buy order → `buy_price_max`; instant sell → `buy_price_max` (maior lance vivo); sell order → `sell_price_min`.
- Impostos de venda: base 8% (premium 4%) + setup 2.5% (premium 1.5%) — **calcCraft aplica AMBOS** desde a feature de rank (antes ignorava o setup fee; alinhamento com flip e bot).
- Resource Return Rate (RRR): presets 0.152 (base), 0.248 (cidade bônus/refineria), 0.435 (Caerleon).
- Receitas geradas preservam rotas alternativas com recursos, quantidade produzida e prata próprios por rota, `@enchantmentlevel` dos insumos e `@maxreturnamount`. Craft e ranking selecionam a rota com menos preços ausentes e menor custo por unidade; o custo inclui a prata fixa da receita. O RRR esperado por insumo é limitado ao máximo retornável quando o dump informa esse campo; itens com máximo zero não recebem desconto de RRR.
- Quando há várias rotas de craft, cálculos escolhem a de menor custo com preço completo; se nenhuma estiver completa, preferem a rota com menos preços ausentes e depois menor custo parcial.
- Craft sem preço vivo do material → usa cidade mais barata com preço e marca `fallbackCity`; **nunca custo 0 silencioso**.
- Comprar PRONTO (comparação de encantamento) = menor **oferta viva** (`sell_price_min`) em qualquer cidade, **incluindo Black Market** — comprar de ofertas no BM é legítimo; excluir BM só vale para vender ao NPC (Black Market nunca é fonte de material).

### 4c. IDs de item do mercado (armadilha que já queimou)

- Equipamento encantado: `T4_BAG@1`, `T4_BAG@2`, `T4_BAG@3`.
- Campo `@enchantmentlevel` do dump também converte insumos de equipamento, como `T4_CAPE` + nível 1 → `T4_CAPE@1`.
- **Recurso encantado: `T4_CLOTH_LEVEL1@1`** (formato `<BASE>_LEVEL<n>@<n>` — os formatos `T4_CLOTH@1` e `T4_CLOTH_LEVEL1` sem `@` NÃO retornam dados da API).
- Runes/souls/relics: sem sufixo (`T4_RUNE`).
- Runes entram nas receitas via `upgraderequirements` das entradas de encantamento.
- Receitas de faction/tokens são filtradas por regex `FACTION|_TOKEN|_ROADS` no build-data.
- Mudou algo nisso? Rodar `npm run build:data` e **validar contra a API real** antes de commitar.
- **Ícones (item render):** o CDN `render.albiononline.com/v1/item/{id}.png` só aceita `size=16/64/128` — os antigos 1/3/8 retornam **HTTP 500** (queimou no deploy: ícones quebrados no site e thumbnail vazia no bot; corrigido 2026-11).

### 4d. Bot do Discord

- Assinatura Ed25519 via WebCrypto sobre `timestamp + body` raw; sem/ruim assinatura → 401. Nunca desativar.
- O timestamp assinado precisa estar dentro de ±5 minutos do relógio do Worker; sincronização do relógio faz parte da validação do endpoint.
- PING (`type:1`) → `{ type: 1 }`. `/preco`, `/craft`, `/lucro`, `/encantamento` respondem type 4 síncronos. **`/oportunidades` é DEFERRED** (type 5 imediato; o scan pode passar dos 3s do Discord) e edita a resposta via `PATCH /webhooks/<app_id>/<interaction_token>/messages/@original` — usa só o token da interação, sem bot token. Novos comandos demorados devem seguir esse padrão.
- Nomes de item aceitam sufixo de encantamento (`.1`, `@2`) — resolvidos por `/api/search`.
- `SITE_URL` aponta pro site (Pages); o bot usa os endpoints da 4a.
- Registro de comandos: `scripts/register-commands.mjs`, token vem de env ou `apps/bot/.dev.vars` (gitignored; template em `.dev.vars.example`).

## 5. Limites de plataforma que moldaram o design

- **Workers free ~1 MB gzip:** bot não importa os JSONs de dados; `rank` (planejado) precisa universar itens sem importar índice + chunking de fetch.
- **Subrequests do Cloudflare (free):** sem paralelismo agressivo contra o AODP; chunking com paralelismo 4 e cache. `/api/rank` T4–T6 ≈ 7 chunks de 200 ids (limite free ~50 subrequests/invocação).
- Cache do core limitado a 256 chaves LRU, com deduplicação de chamadas simultâneas iguais; os TTLs seguem acima.
- Chamadas únicas simultâneas ao AODP limitadas a 64 por isolate; acima do teto, novas chaves falham rápido.
- Rate limit fica num Worker separado porque Pages Functions não expõe diretamente o binding. `apps/web/wrangler.toml` chama `albion-market-api-limiter` por Service Binding `API_LIMITER`; o Worker tem `workers_dev = false` e não importa dados do core.
- Ordem de deploy: primeiro `npm run deploy --workspace @albion/api-limiter` (cria o Worker sem URL pública); depois o deploy automático de Pages na `main` ativa a chamada ao binding. `namespace_id` da configuração deve ser único na conta.
- **`wrangler pages dev` não recompila quando só `packages/core` muda** (core é symlink em node_modules, fora do watcher). Editar um arquivo de `functions/` força rebuild. Deploy em produção nunca deve pegar esse estado (build CI roda do zero).
- **Dashboard Cloudflare (2026):** o fluxo "Create application" mostra um formulário de **Worker** (com "Deploy command: npx wrangler deploy") — o create de **Pages** clássico fica escondido atrás do link **"Continue to Pages"** (última linha das opções). No formulário certo de Pages não existe Deploy command, e sim Build output directory + Root directory.
- **AODP é serviço comunitário:** sempre gzip, respeitar throttle (`Throttled, be nice...` volta non-JSON → tratar como erro, não quebrar). Cachear no core (TTLs acima: 90s/600s/300s).

## 6. Git

- Remoto `origin` (GitHub). Toda mudança entra via PR: ruleset da `main` exige **CI + CodeQL** (`Analyze (javascript-typescript)`) e o único método de merge é **Rebase and merge** (merge/squash commit desativados). Branch do PR é apagado após o merge.
- **Rebase and merge gera SHAs novos**: para validar "esse branch já está na main" use `git cherry` (patch-id), **não** ancestralidade de SHA. Artefatos derivados (ex.: `src/data/*.json`) no MESMO commit do código que os gera.
- Nunca commitar: `.dev.vars`, `.env*`, dumps, `dist/`, `node_modules/`.
- Dependabot: minor/patch agrupados (dependabot.yml, automático); **majors 1 PR por vez, na ordem que o lockfile manda, com CI + Pages verdes** antes do próximo. PR recriado/fechado por supersessão é normal — não force reopen.
- `actions/checkout` e `actions/setup-node` ficam fixados por SHA; Dependabot monitora atualizações de GitHub Actions.
- Serviços externos/infra (Pages, Workers, secrets reais): só a pessoa mantenedora configura; o agente entrega comandos prontos.

## 7. Pendências / próximos passos

| # | Item | Status |
|---|---|---|
| 1 | `rank.ts` no core + `/api/rank` + aba Oportunidades + `/oportunidades` no bot | ✅ feito |
| 2 | Casos no sanity.ts com resultado conhecido (craft c/ setup fee, rank, universe) | ✅ feito |
| 3 | Comando `/oportunidades` — followup edit (deferido type 5 + PATCH no webhook) | ✅ validado em produção (2026-11) |
| 4 | CI (GitHub Actions) + Dependabot + template de PR | ✅ configurados; `main` protegida por ruleset com CI + CodeQL e Rebase and merge |
| 5 | Deploy — site: Cloudflare Pages GIT-CONNECTED (root `apps/web`, build c/ `--prefix ../..`, output via `pages_build_output_dir`); bot: `npx wrangler deploy` + `wrangler secret put DISCORD_BOT_TOKEN`; Interactions Endpoint validado (PING verde) | ✅ no ar (2026-11) |
| 6 | Comparação de encantamento (`enchant.ts` no core + `/api/enchant` + aba Encantamento + `/encantamento` no bot) | ✅ feito |
| 7 | App pessoal de mercado: `desktop-client/` deriva de `ao-data/albiondata-client` v0.1.61; grava ordens em `%LOCALAPPDATA%\AlbionMarketPersonal\market-orders.jsonl` antes de encaminhar o mesmo lote ao AODP. O dump mantém 30 dias: limpa ao abrir e diariamente durante a execução; linhas inválidas são preservadas. Preferências locais permitem pausar ordens, histórico, preços do ouro ou dados do mundo; padrão mantém todas ligadas para preservar o envio atual, e dump local continua ativo com upload de ordens desligado. Preferências em `%APPDATA%\AlbionMarketPersonal\upload-preferences.json`. O painel local mostra até 200 ordens por consulta com nomes PT-BR/EN gerados do banco de itens do core conforme idioma (fallback: ID com `_` convertido em espaço), ID original, tipo de ordem traduzido, qualidade, encantamento, região e preço em prata; filtros aceitam ID/tipo/local/região. O frontend gera arquivos JSON estáticos separados por idioma antes de `dev`/`build`; ficam ignorados pelo Git e o painel carrega apenas o idioma ativo, evitando um chunk JS grande. O seletor PT/EN persiste a escolha localmente. Painel de sessão mostra duração, contagem de mensagens decodificadas e feed limitado a 100 eventos de captura/servidor/dados observados; contadores são chamados de registros liberados para envio, sem afirmar entrega bem-sucedida, e continuam visíveis até a sessão seguinte. README explica dump local + contribuição à ferramenta comunitária. Marca/ícone e links AODP foram removidos da interface; identificador de lote é copiável como texto e links AODP nos logs não abrem navegador. Auto-updater do fork foi removido. Preferência explícita do usuário: **não iniciar com o Windows**; abrir manualmente. O console fica oculto por padrão e pode ser aberto pela bandeja. Startup não chama `Show/Focus` durante `ApplicationStarted`: Wails v3 beta pode executar o fallback de visibilidade antes de o controlador WebView2 existir e causar panic. Teste manual confirmou que categorias desligadas não enviam; ordem habilitada resultou em respostas `Successfully sent ingest request` no endpoint AODP West. `go test ./...`, `go build`, `npm ci`, `npm run build` passaram; `npm audit` está zerado. O wrapper `wails3 build` exige Taskfile ausente no upstream; build direto com Go funcionou. Arquivo gerado de nomes usa `packages/core/src/data/items.json` quando presente; sem ele, a UI mantém IDs legíveis. | ✅ implementação local validada |
| 8 | Migrar o runtime do bot (Worker) pra **máquina local com Linux** (decisão 2026-11) — desenho ainda a definir; abre com a escolha de acesso: webhook + Cloudflare Tunnel (mantém HTTP puro, mínimo de código novo) vs. gateway websocket (nada exposto, mas BOT_TOKEN passa a viver na VM e o código é novo). Só executar quando o usuário disser que tem servidor preparado; nada foi preparado ainda | pendência futura (só a pedido) |
| 9 | Majors do dependabot, 1 PR por vez: vite 8, @vitejs/plugin-react 6, react-dom 19, @cloudflare/workers-types 5, wrangler 4.166 (undici/esbuild/@fastify/busboy cobertos de brinde) — alertas de vuln zerados, CodeQL como check obrigatório do ruleset | ✅ feito (2026-11) |
| 10 | Re-deploy do bot com wrangler 4 (`npx wrangler deploy` em apps/bot) + smoke `/preco` no Discord | ✅ feito (2026-11; worker 200 no healthcheck) |
| 11 | Limite best-effort para `/api/*`: Worker interno + binding de serviço Pages; 60 unidades/60s/IP, `/rank` vale 10 | ✅ publicado e ativo (2026-11; PR #21, commit `a327a67`; smoke HTTPS `/api/search` = 200; sem teste de carga em produção) |
| 12 | Privacidade do IP de saída do app AODP: considerar túnel dividido por aplicativo ou proxy explícito com falha fechada; adiado junto com a infraestrutura do servidor. Hoje as conexões HTTP do app saem diretamente e o AODP observa o IP de saída | pendência de longo prazo (não implementar sem retomar o tópico) |

## 8. Histórico estrutural

| Commit | Conteúdo |
|---|---|
| `a323062` | core (API + calculadoras + banco de itens/receitas) e site Cloudflare Pages |
| `94212a1` | bot do Discord (Worker) + busca com sufixo de encantamento |
| `418883a` | diretrizes (AGENTS.md, docs/), handoff.md, package-lock.json |
| `0378b8a` | ranking de oportunidades (core rank + /api/rank + aba + /oportunidades) |
| `2a965bf` | CI (ci.yml), dependabot, template de PR |
| (este)    | comparação de encantamento (core enchant.ts + /api/enchant + aba Encantamento + /encantamento no bot) |
| (2026-11) | deploy GitHub→Pages→Workers no ar; ícones 64px (CDN quebrou 16/8); embeds do bot redesenhados; majors: vite 8, plugin-react 6, react-dom 19, workers-types 5, wrangler 4.166; CodeQL no portão de merge (fix stack-trace em /api/*); licença MIT |
