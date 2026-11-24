# Albion Market Tools (site + bot do Discord)

Ferramentas de mercado para **Albion Online** — servidor **Americas (oeste)**:

- 🌐 **Site** (Cloudflare Pages): busca de itens (PT-BR/EN, light/dark), consulta de preços por cidade/qualidade, **calculadora de custo de craft** (retorno de recursos, impostos, modo de compra), **lucro/arbitragem** (incluindo flip pro Black Market) e histórico de preços.
- 🤖 **Bot do Discord** (Cloudflare Workers, free tier): `/preco`, `/craft` e `/lucro` respondem usando **a mesma API do site**.
- 📦 **`@albion/core`**: lógica compartilhada — cliente da API do [Albion Online Data Project](https://www.albion-online-data.com), banco de itens/receitas gerado dos dumps do jogo (`ao-data/ao-bin-dumps`), e as calculadoras.

```
albion_market_bot/
├── packages/core/        ← @albion/core: API, itens, receitas, calculadoras
│   └── scripts/build-data.mjs   (gera items.json + recipes.json dos dumps)
├── apps/web/             ← site (Vite/React/Tailwind) + functions/api/* (Pages Functions)
└── apps/bot/             ← bot do Discord (Cloudflare Worker + interactions webhook)
```

## Como funciona

1. Os preços vêm da API pública do **Albion Online Data Project** (`west.albion-online-data.com`), alimentada pelos uploads dos jogadores rodando o [cliente do projeto](https://github.com/ao-data/albiondata-client/releases).
2. Itens e receitas vêm dos dumps oficiais do jogo — o pipeline normaliza nomes **PT-BR**, encantamentos (`.1`–`.4`) e materiais (`T4_CLOTH_LEVEL1@1`, runas/souls/relics).
3. O site hospeda no Cloudflare Pages; as `functions/api/*` fazem proxy com cache. O bot (Workers) consulta essas mesmas URLs — nada de lógica duplicada.

## Desenvolvimento local

```bash
npm install
npm run build:data   # gera packages/core/src/data/{items,recipes}.json (já vem gerado no repo)
npm run dev:web      # site em http://localhost:5173
```

Para testar a API localmente junto do site:

```bash
cd apps/web && npm run build && npx wrangler pages dev dist --port 8788
```

## Deploy do site (Cloudflare Pages)

1. Suba o repositório pro GitHub.
2. No dash do Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
3. Build command: `npm run build:web` · Output dir: `apps/web/dist` (com Node 20+).
4. Pronto — as functions em `apps/web/functions` vão junto automaticamente.

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
npm run register          # registra /preco, /craft e /lucro
npm run deploy            # npx wrangler deploy
```

3. No Developer Portal → General Information, cole o **Public Key** (conferir com o do wrangler.toml) e:
   - **Interactions Endpoint URL**: `https://albion-market-bot.<seu-subdominio>.workers.dev`

Depois disso o bot responde `/preco T4_BAG`, `/craft item:T5_CLOTH`, `/lucro item:T6_MAIN_SWORD` etc.

## Limitações conhecidas

- Dados de mercado dependem de **scans da comunidade**: itens muito parados aparecem sem preço ou desatualizados (os painéis alertam quando os dados são antigos, e a calculadora de craft usa fallback com a cidade mais barata com dado vivo).
- A API do AODP tem throttle — o site e o bot consultam com cache (60s no site, 90s na API client).
- A taxa de custo do uso da estação (usage fee variável por estação) **não** está incluída no modelo do craft; o desconto é manual (compare com o custo no jogo).
- Bot em Workers: sem *gateway*, então sem mensagem proativa/alertas automáticos — só responde a slash commands.

## Roadmap

- [ ] Scan daemon (Node + albiondata-client local) pra alimentar preços com seus próprios scans
- [ ] Rank de melhores flushes/crafts entre vários itens (tipo ScanAlbion)
- [ ] Lucro de encantamento comparando comprar pronto vs. craftar .0/.1/.2
- [ ] Favoritos e alerts (via gateway/VPS)
- [ ] Suporte aos outros servidores (Europa/Asia) com seletor

## Créditos e licenças

- Dados de jogo e de mercado: [Albion Online Data Project](https://www.albion-online-data.com) ([ao-data/ao-bin-dumps](https://github.com/ao-data/ao-bin-dumps)) e [Sandbox Interactive](https://albiononline.com).
- Inspirado em [AlbionKit](https://www.albionkit.com/bot), [ScanAlbion](https://scanalbion.com) e [albion-discord-bot](https://github.com/matchatealeaf/albion-discord-bot).
- Projeto de fã não afiliado à Sandbox Interactive. Albion Online é marca da Sandbox Interactive GmbH.
