# Auditoria de infraestrutura — checklist deste repositório

Adaptada do checklist geral da pessoa mantenedora para o escopo real deste projeto:
**Cloudflare Pages (site + functions), bot em Cloudflare Workers, sem banco atualmente,
monorepo npm/TypeScript**. Referenciado pelo `AGENTS.md`.

**Regra de ouro:** nunca cole segredos reais (`DISCORD_BOT_TOKEN`, chaves de API).
Mascare valores e hosts em qualquer saída enviada a uma IA.

## Ordem das etapas

1. Auditoria **sem alterações** (este documento).
2. Segredos: rotacionar o que estiver exposto, antes de qualquer refatoração.
3. Rede de segurança: sanity de `core` com dados fictícios + validação contra API real.
4. CI e proteção da branch principal (este repo já tem remoto e ruleset; revisar periodicamente no GitHub).
5. Validação de entrada e contratos da API `/api/*`.
6. Refatorações, uma etapa por vez, com a rede de segurança verde.
7. `handoff.md` atualizado.

## 1. Cloudflare Pages e repositório

- Deploy do Pages deve publicar **apenas `apps/web/dist`** (build `npm run build:web`). As `functions/` são empacotadas junto, então **nada de segredos em código de functions** — só vars públicas + `wrangler secret`.
- Procurar arquivos sensíveis versionados:

```bash
git ls-files | grep -Ei '\.dev\.vars$|\.env|\.pem|\.key|dump|backup'
```

- O mesmo no **histórico** (arquivos apagados continuam lá):

```bash
git log --all --diff-filter=A --name-only --format= | grep -Ei '\.dev\.vars$|\.env|\.pem|\.key|dump' | sort -u
```

- Detector de segredos local (gitleaks) antes da primeira publicação; em repo público, repetir periodicamente e após qualquer suspeita de vazamento.
- No código de frontend só podem existir chaves feitas para serem públicas:
  - OK públicas: `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`, `SITE_URL`, `AODP_SERVER`.
  - **NUNCA:** `DISCORD_BOT_TOKEN` (só em `.dev.vars` local ou `wrangler secret put`).

### Se achar um segredo

1. **Rotacione primeiro** (Discord Developer Portal → Reset Token). Rotacionar é o que protege; apagar do código não basta, o histórico guarda o valor.
2. Reescrever histórico é opcional e vem depois.

## 2. Estado e banco (atualmente: não existe)

- Sem banco. Se entrar persistência (ex.: histórico de preços próprio, preferências):
  - credenciais **só no servidor** (Workers KV/D1 bindings ou variável não-pública);
  - role/pré-fixo de acesso mínimo; migrações versionadas quando for SQL;
  - nada de IPC/dados sensíveis no bundle do frontend (público).

## 3. Cloudflare (Pages + Workers)

Configurações de conta/dashboard **o agente não altera** — propõe, a pessoa aplica:

- **Page rules / Functions:** variáveis públicas em `wrangler.toml` [vars]; segredos via `wrangler secret put` (bot) ou dashboard (Pages → Settings → Environment variables, marcadas como *Secret*).
- **Limites relevantes:** Workers free ~1 MB gzip de bundle (motivo pelo qual o bot não importa `@albion/core` inteiro) e limite de subrequests no free tier (motivo do chunking no `rank.ts`, sem paralelismo agressivo).
- **CORS das functions:** hoje `*` (sem cookies). Confira sempre que uma rota nova for criada:

```bash
curl -s -D - -o /dev/null -H 'Origin: https://evil.example' https://SEU-SITE.pages.dev/api/? | grep -i access-control
```

  Se um dia houver autenticação/cookies, trocar `*` pela origem exata.
- **HTTPS:** Pages/Workers já são HTTPS por padrão; certificar que o bot aponta `SITE_URL` para `https://...` em produção.

### 3a. Orçamento free tier (auditado em 2026-11 contra docs oficiais)

Meta do projeto: **custo total R$ 0**. Mapeamento recurso → limite → uso real:

| Recurso | Limite do free | Uso do projeto | Folga |
|---|---|---|---|
| Site estático (Pages) | requisições e banda **ilimitados**; 20k arquivos/site, 25 MiB/arquivo | bundle Vite pequeno (poucos arquivos, < 1 MB) | ampla |
| Builds Pages | 500/mês **por conta** (1 simultâneo, timeout 20 min); cada push na branch conectada = 1 build | pushes pontuais + deploy manual (`wrangler pages deploy` **não** consome a cota) | ampla se não empurrar commit por commit |
| Functions (site + bot) | **100k requests/dia por conta**, reset 00:00 UTC; excedeu → erro 1027 | uso pessoal: centenas/dia; site e bot dividem a conta | ampla |
| CPU por invocação | 10 ms | só JSON parsing + `crypto.subtle.verify` Ed25519 (nativo, < 1 ms); trabalho de rede não conta como CPU | ampla |
| Subrequests | 50 por invocação | `/api/rank` ≈ 7–9 chunks AODP; `/api/enchant` 1; bot 2–3 (search + dados) | ampla |
| Duração (wall time) | sem limite enquanto o cliente conecta | `/api/rank` (segundos) e o `/oportunidades` deferred do bot dependem disso | ok |
| GitHub Actions | repo **público** = minutos ilimitados; privado = 2000 min/mês | CI ~2–4 min por push | ampla |
| AODP | serviço gratuito da comunidade (não é Cloudflare) | gzip + cache + chunking + throttle handling **já implementados** — ser bom cidadão é requisito, não bônus | — |
| Discord | gratuito (global commands, interactions, Ed25519) | 2–3 subrequests por comando | ampla |

- **Nada pagável está no plano:** sem KV/D1/R2/Queues/Cron. Favoritos e alertas (excluídos do escopo) seriam os primeiros a exigir estado persistido.
- **Plano de fuga:** se um dia passar de 100k req/dia (só se o site viralizar), o Workers Paid é US$ 5/mês — nenhuma mudança de código necessária.
- Cuidado único: **builds são por conta** — se empurrar muita coisa de uma vez, agrupar commits (cada push dispara um build).

## 4. Backend (functions/api/* e worker do bot)

- Toda entrada de query validada/normalizada (ids aceitos, números com clamp) — os endpoints já fazem; manter assim em commits e na memória das rotas novas.
- Respostas de erro **sem stack trace** (o handler de `catch` devolve `{ error: "mensagem" }`).
- Logs sem dados pessoais (não há pessoais; manter assim).
- **API do Discord:** a assinatura Ed25519 é o único gate de escrita — não desativar, nem aceitar `x-signature-*` ausentes em dev sem pensar.
- **API do AODP:** servicela comunitária — gzip + cache obrigatórios, sem polling; throttle acontece (`Throttled, be nice...`): tratar resposta não-JSON como erro, não quebrar.

Auditoria rápida, na raiz:

```bash
grep -rEn 'DISCORD_BOT_TOKEN|token *=' apps/bot/src apps/web/functions --include='*.ts' | grep -v 'process.env\|env\.\|Token\b'
grep -rEn 'access-control-allow-origin' apps/web/functions
grep -rEn 'fetch\(' apps/bot/src apps/web/functions | grep -v 'SITE_URL\|albion-online-data\|discord.com/api'  # destinos inesperados
```

- Dependências: `npm audit`; Dependabot ativo (`.github/dependabot.yml`).

## 5. Rede de segurança por camada

| Camada | Proteção |
|---|---|
| `core` (cálculo) | `test/sanity.ts` com dados fictícios de resultado conhecido; caso novo para todo bug corrigido, provando que falha no código antigo |
| `apps/web` | TSC estrito + validação de entradas + build; contrato das functions documentado no handoff |
| `apps/bot` | TSC estrito + testes de assinatura, PING, replay e comandos |
| `apps/api-limiter` | Testes para limite, peso por rota e falha fechada; build dry-run |
| Cache AODP | Testes para deduplicação em voo e teto de entradas |
| Dados gerados (`src/data/*.json`) | Regenerar via `npm run build:data` e **validar contra a API real** (formato `@n` / `_LEVELn@n` já queimado uma vez) |
| Dependências | Dependabot + `npm audit` |

## 6. CI e deploy

- A matriz completa e atualizada da GitHub Actions fica em [`.github/workflows/ci.yml`](../.github/workflows/ci.yml): typecheck, sanity, testes das camadas, dry-run do limitador, build do site e checagem do script de registro.
- O check do Cloudflare Pages é separado e valida o preview do PR. A CI não faz deploy de produção nem chama a API real do Albion; o Pages publica automaticamente quando `main` recebe um merge.
- O deploy do bot e do Worker limitador é separado (`wrangler deploy`). Segredos e alterações de conta Cloudflare seguem a autorização explícita do `AGENTS.md`.
- A branch `main` usa ruleset; estado e configuração estão descritos em [docs/configuracao-repositorio.md](configuracao-repositorio.md).

## O que o agente não faz sem confirmação explícita

Deploy no Cloudflare, criar/deletar KV/D1, mexer em variables/segredos de produção, reescrever histórico do Git, mudar DNS/domínios, excluir branch/worktree, alterar limits/planos.
