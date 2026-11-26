# Bot Discord — Albion Market Tools (@albion/bot)

Worker do Cloudflare que expõe os comandos `/preco`, `/craft`, `/lucro`, `/encantamento` e `/oportunidades` no Discord.
Ele **não** embute os dados do jogo: todas as consultas passam pela API do site
(Pages Functions, definida por `SITE_URL`).

## Comandos

| Comando | O que faz |
| --- | --- |
| `/preco item [qualidade]` | Tabela de preços por cidade (vender por / comprar por) + melhor rota de compra/venda. |
| `/craft item [cidade_compra] [cidade_venda] [rrr]` | Custo por material, custo total, receita e lucro líquido (verde/vermelho) com impostos. |
| `/lucro item` | Top 5 rotas de lucro: compra instantânea → venda em ordem, com impostos descontados. |
| `/encantamento item [rrr]` | Comprar pronto vs. craftar em cada nível de encantamento (.0 a .3), com % de economia. |
| `/oportunidades [tier_min] [tier_max] [encantamento]` | Top 10 itens mais lucrativos para craftar e vender no Black Market (scan em massa). |

## 1. Criar o app no Discord

1. Acesse <https://discord.com/developers/applications> → **New Application** e dê um nome.
2. **General Information** → copie o **Application ID** e a **Public Key**.
3. **Bot** → **Reset Token** → copie o **token do bot** (só é exibido uma vez).
4. **Bot** → ative as permissões *Send Messages* e *Use Application Commands*.
5. Convide o bot no servidor: **OAuth2 → URL Generator** → escopos `bot`
   **e** `applications.commands` → abra a URL gerada.

## 2. Configurar o Worker

`DISCORD_PUBLIC_KEY` e `DISCORD_APPLICATION_ID` são identificadores públicos e
ficam em `[vars]` no `wrangler.toml` (ou em `apps/bot/.dev.vars` no desenvolvimento).
O único segredo é `DISCORD_BOT_TOKEN`:

```bash
cp .dev.vars.example .dev.vars   # rode dentro de apps/bot; arquivo local ignorado pelo Git
npx wrangler secret put DISCORD_BOT_TOKEN
```

> **SITE_URL** deve apontar para o deploy do site no Cloudflare Pages
> (produção: `https://albion-market-web.pages.dev`, ou uma URL de preview).
> Só troque via `wrangler.toml` se quiser outro destino; em `.dev.vars` use
> `http://127.0.0.1:8788` para testar contra um `wrangler dev` do `apps/web`.

## 3. Registrar os slash commands

Uma vez por versão dos comandos (login não é persistido):

```bash
# lê DISCORD_BOT_TOKEN e DISCORD_APPLICATION_ID do env ou de apps/bot/.dev.vars
DISCORD_BOT_TOKEN=xxx DISCORD_APPLICATION_ID=xxx node scripts/register-commands.mjs
# pela raiz do monorepo: npm run bot:register
```

## 4. Desenvolvimento local

```bash
# no apps/web (terminal 1): site + API
npm run dev            # http://127.0.0.1:8788

# no apps/bot (terminal 2): worker do bot
npx wrangler dev       # http://127.0.0.1:8787

# no apps/bot (terminal 3): redirecione o Discord para o dev local (opcional)
#   → em development só é possível via "Interactions Endpoint URL" em um túnel
#     (ex.: cloudflared/ngrok apontando para :8787)
```

O Discord exige endpoint público com HTTPS, então para testar interações de
verdade coloque `wrangler dev` atrás de um túnel e cole
`https://seu-tunel/` em **Interactions Endpoint URL** (o bot responde o PING).

Testes automatizados da validação Ed25519: `npm run test:bot` na raiz do monorepo.
Para testar a integração real com o Discord, use um túnel HTTPS para o `wrangler dev`;
o endpoint deve responder ao PING inicial.

## 5. Deploy

```bash
npx wrangler deploy    # ou: npm run deploy --workspace @albion/bot
```

Depois do primeiro deploy, cole a URL do worker (ex.
`https://albion-market-bot.seu-subdominio.workers.dev/`) em
**Interactions Endpoint URL** no portal. O Discord chama essa URL com o PING
inicial — o worker responde `{"type":1}`.

## Arquitetura

`worker.ts` não importa nada do `@albion/core` (o bundle ficaria enorme por
conta dos JSONs de dados): apenas tipos/constantes locais espelham os contratos.

```text
Discord → POST (url verificada Ed25519) → worker → https://SITE_URL/api/{search,prices,craft,flip,rank,enchant}
```
