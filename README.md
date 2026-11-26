# Albion Market Tools (site, bot do Discord e app pessoal)

Ferramentas de mercado para **Albion Online** — servidor **Americas (oeste)**:

- 🌐 **Site** (Cloudflare Pages): busca de itens (PT-BR/EN, light/dark), consulta de preços por cidade/qualidade, **calculadora de custo de craft** (retorno de recursos, impostos, modo de compra), **lucro/arbitragem** (incluindo flip pro Black Market), histórico de preços, a aba **Oportunidades** — scan em massa dos itens craftáveis ranqueados por margem de lucro — e a aba **Encantamento** — comprar pronto vs. craftar em cada nível (.0–.3).
- 🤖 **Bot do Discord** (Cloudflare Workers, free tier): `/preco`, `/craft`, `/lucro`, `/encantamento` e `/oportunidades` respondem usando **a mesma API do site**.
- 🖥️ **App pessoal para Windows** (`desktop-client/`): interface PT-BR/EN, arquivo local das ordens de mercado observadas durante o jogo e envio do mesmo lote ao AODP.
- 📦 **`@albion/core`**: lógica compartilhada — cliente da API do [Albion Online Data Project](https://www.albion-online-data.com), banco de itens/receitas gerado dos dumps do jogo (`ao-data/ao-bin-dumps`), e as calculadoras.

```
albion_market_bot/
├── packages/core/        ← @albion/core: API, itens, receitas, calculadoras
│   └── scripts/build-data.mjs   (gera items.json + recipes.json dos dumps)
├── apps/web/             ← site (Vite/React/Tailwind) + functions/api/* (Pages Functions)
├── apps/api-limiter/      ← Worker interno de rate limit (sem endpoint público)
├── apps/bot/             ← bot do Discord (Cloudflare Worker + interactions webhook)
└── desktop-client/       ← app pessoal Windows: arquivo local + envio ao AODP
```

O app pessoal e seu fluxo de desenvolvimento estão descritos em
[`desktop-client/README.md`](desktop-client/README.md). Ele guarda localmente
as ordens de mercado observadas durante o jogo e continua enviando os mesmos
lotes ao AODP; a interface pode ser alternada entre português e inglês.

## Como funciona

1. Os preços vêm da API pública do **Albion Online Data Project** (`west.albion-online-data.com`), alimentada pelos uploads dos jogadores rodando o [cliente do projeto](https://github.com/ao-data/albiondata-client/releases).
2. Itens e receitas vêm dos dumps oficiais do jogo — o pipeline normaliza nomes **PT-BR**, encantamentos (`.1`–`.4`) e materiais (`T4_CLOTH_LEVEL1@1`, runas/souls/relics). Rotas alternativas mantêm seus próprios ingredientes, rendimento e prata; o cálculo aplica o RRR respeitando os limites de retorno informados pelo dump.
3. O site hospeda no Cloudflare Pages; as `functions/api/*` fazem proxy com cache e consultam o Worker interno de rate limit antes de processar pedidos. O bot (Workers) consulta essas mesmas URLs — nada de lógica duplicada.

## Desenvolvimento local

```bash
npm install
npm run build:data   # gera packages/core/src/data/{items,recipes}.json (já vem gerado no repo)
npm run dev:web      # interface Vite em http://localhost:5173 (sem Pages Functions/API local)
```

Para usar a API junto com o site, siga também a seção abaixo “Para testar a API localmente junto do site”;
ela inicia o Worker limitador e as Pages Functions locais.

Para validar as mudanças localmente (Node 24, como na CI):

```bash
npm run typecheck
npx tsc --noEmit -p packages/core/tsconfig.json
npm run test:bot
npm run test:api-cache
npm run test:api-rate-limit
npm run test:web-validation
npm run test:web-format
npm run build:api-limiter
npx tsx packages/core/test/sanity.ts
npm run build:web
```

Os testes do bot verificam assinatura, PING e janela temporal de cinco minutos. Os
testes do core cobrem deduplicação de chamadas simultâneas e limite de 256 entradas
no cache; os da API web cobrem formato e limites de entrada, e os do rate limiter
cobrem bloqueio antes do AODP, IP confiável e peso do `/rank`.

No PowerShell, se a política local bloquear `npm.ps1`/`npx.ps1`, use `npm.cmd` e
`npx.cmd` nos mesmos comandos.

Para testar a API localmente junto do site:

```bash
# Terminal 1 — Worker interno do limitador
cd apps/api-limiter && npm run dev
# Terminal 2 — Pages Functions + site
cd apps/web && npm run build && npx wrangler pages dev dist --service API_LIMITER=albion-market-api-limiter --port 8788
```

O `workers.dev` do limitador fica desativado; a Pages Function o chama por Service Binding.
O limite inicial é de 60 unidades por minuto por IP; `/api/rank` consome 10. O contador
é aproximado por localidade Cloudflare e IPs compartilhados dividem a mesma cota.

## Deploy do site (Cloudflare Pages)

1. Suba o repositório pro GitHub.
2. No dash do Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
3. Root directory: `apps/web`; build command: `npm install --prefix ../.. && npm run build:web --prefix ../..`; output directory: `dist` (Node 20+).
4. Pronto — as functions em `apps/web/functions` vão junto automaticamente.

Antes de ativar a nova versão das Pages, publique o Worker interno uma vez:
`cd apps/api-limiter && npm run deploy`. Ele não tem URL pública; a Pages Function
usa o Service Binding `API_LIMITER`. A Pages passa a chamá-lo no deploy seguinte.

(String no terminal: `cd apps/web && npm run build && npx wrangler pages deploy dist`.)

## Deploy do bot (Cloudflare Workers, free)

1. Crie o app no [Discord Developer Portal](https://discord.com/developers/applications):
   - Anote **Application ID** e **Public Key**.
   - Bot → **Reset Token** e copie o token.
   - *Instalação / bot*: sem intents necessários (só interações).
2. Configure os segredos e regsitre os comandos:

```bash
cd apps/bot
npx wrangler secret put DISCORD_BOT_TOKEN
# .dev.vars local (não vai pro git): DISCORD_BOT_TOKEN=..., DISCORD_PUBLIC_KEY=..., DISCORD_APPLICATION_ID=..., SITE_URL=https://<seu-site>.pages.dev
npm run register          # registra /preco, /craft, /lucro, /encantamento e /oportunidades
npm run deploy            # npx wrangler deploy
```

3. No Developer Portal → General Information, cole o **Public Key** (conferir com o do wrangler.toml) e:
   - **Interactions Endpoint URL**: `https://albion-market-bot.<seu-subdominio>.workers.dev`

Depois disso o bot responde `/preco T4_BAG`, `/craft item:T5_CLOTH`, `/lucro item:T6_MAIN_SWORD`, `/encantamento item:T4_BAG`, `/oportunidades tier_min:4 tier_max:5` etc.

## Limitações conhecidas

- Dados de mercado dependem de **scans da comunidade**: itens muito parados aparecem sem preço ou desatualizados (os painéis alertam quando os dados são antigos, e a calculadora de craft usa fallback com a cidade mais barata com dado vivo).
- A API do AODP tem throttle — o site e o bot consultam com cache (60s no site, 90s na API client). O cache do core retém até 256 chaves e compartilha chamadas simultâneas idênticas.
- A API rejeita buscas acima de 100 caracteres, mais de 200 IDs por pedido, IDs de mercado inválidos ou acima de 100 caracteres, cidades fora das cidades principais e qualidades fora de 1–5.
- A taxa de custo do uso da estação (usage fee variável por estação) **não** está incluída no modelo do craft; o desconto é manual (compare com o custo no jogo).
- Bot em Workers: sem *gateway*, então sem mensagem proativa/alertas automáticos — só responde a slash commands.

## Roadmap

- [x] Guia para contribuir scans com o cliente da comunidade (leitura passiva; execução manual na máquina do usuário, sem daemon próprio): [docs/scan-daemon.md](docs/scan-daemon.md)
- [x] Rank de melhores flushes/crafts entre vários itens (tipo ScanAlbion) — aba Oportunidades no site + `/oportunidades` no bot
- [x] Lucro de encantamento comparando comprar pronto vs. craftar .0/.1/.2 — aba Encantamento no site + `/encantamento` no bot

## Créditos e licenças

- Dados de jogo e de mercado: [Albion Online Data Project](https://www.albion-online-data.com) ([ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)) e [Sandbox Interactive](https://albiononline.com).
- Inspirado em [AlbionKit](https://www.albionkit.com/bot), [ScanAlbion](https://scanalbion.com) e [albion-discord-bot](https://github.com/matchatealeaf/albion-discord-bot).
- Projeto de fã não afiliado à Sandbox Interactive. Albion Online é marca da Sandbox Interactive GmbH.
