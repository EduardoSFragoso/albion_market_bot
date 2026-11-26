# Configuração do repositório (remoto + proteções)

Adaptada das diretrizes gerais para este projeto (monorepo npm/TS, site no **Cloudflare
Pages**, bot em **Cloudflare Workers**). Fato importante: **o bot não precisa de deploy
de site** — publicar o repo no GitHub já basta para o CI; o único botão de publish é o
do Pages, que a pessoa mantenedora aperta.

**Regra central: o agente nunca altera config de conta, dashboard do GitHub ou do
Cloudflare. Este documento é o guia do que a pessoa mantenedora configura manualmente;
o agente apenas cria os arquivos do repo e sugere os passos.**

## 1. Criar o remoto e conectar

1. GitHub → New repository → nome `albion_market_bot` → **público ou privado, sem nenhum arquivo inicial** (nada de README/licença gerada, para o primeiro push não conflitar).
2. Não colar segredo em lugar nenhum — nem em issue, nem em descrição.

```bash
cd "/c/Users/Eduardo F/Documents/Projects/albion_market_bot"
git remote add origin git@github.com:SEU-USUARIO/albion_market_bot.git   # ou https
git push -u origin main
```

3. Se usar SSH e ainda não tiver chave: `ssh-keygen -t ed25519` e cadastrar a pública no GitHub. **Nunca** enviar a chave privada para uma IA ou colar em chat.

## 2. Branch protection / ruleset (recomendado)

GitHub → Settings → Branches → Add ruleset, para `main`:

| Regra | Por quê |
|---|---|
| Require pull request before merging | Toda mudança passa por PR revisável |
| Require status checks: **CI** (typecheck + build + sanity) + **CodeQL** (`Analyze (javascript-typescript)`) | Merge só com a rede de segurança verde — testes + análise de vulnerabilidade de código |
| Require linear history | Histórico limpo, fácil de reverter |
| Block force pushes | Impossibilita histórico reescrito por acidente |

O fluxo natural fica: mudança → branch → PR → **CI + CodeQL verdes** → **Rebase and merge** em `main`
(único método permitido: merge commit e squash estão desativados no repo).

## 3. CI (GitHub Actions)

`.github/workflows/ci.yml` (o agente cria o arquivo; o resto é automático no push):

| Passo | Comando | Protege |
|---|---|---|
| Typecheck | `tsc --noEmit` em core/web/bot | Nada quebra tipos |
| Build web | `npm run build:web` | O que o Pages publica compila |
| Sanity do core | `npx tsx packages/core/test/sanity.ts` | Cálculos (craft/flip/rank) batem com resultado esperado |

O que a CI **não** faz: deploy (isso é manual, para o Cloudflare Pages/Workers, e só quando a pessoa decidir), testes que chamam a API do Albion (env é instável/restrito), publicar secrets.

`permissions: contents: read` no job — menos poder caso o token vaze.

## 4. Dependabot

`.github/dependabot.yml` com dois ecossistemas:

- `npm` — diretório `/` (workspaces pegam os manifests dos pacotes)
- `github-actions` — diretório `/`

## 5. Projeto, issues e colaboradores

- **Issues/labels:** usar para ideias e bugs (ex.: label `api`, `bot`, `site`, `rank`). O agente usa issues para planejar mudanças multi-arquivo quando pedido.
- **Colaboradores:** só quem realmente trabalha no projeto; github convidado como write, nunca owner.
- **Licença:** decidir se o repo fica público — MIT costuma bastar; o agente NÃO adiciona arquivo de licença sem pedido.

## 6. Higiene de arquivos (já resolvido, conferir de vez em quando)

`.gitignore` cobre: `node_modules/`, `dist/`, `.dev.vars`, `.env*`, `.scratch/` (dumps de itens), `wrangler` local, `.vite/`.

Conferir:

```bash
git ls-files | grep -Ei '\.dev\.vars$|\.env$|node_modules|dist/|scratch'   # deve ser vazio
```

Se algo desses aparecer versionado: remover do índice (`git rm --cached`), commit, e tratar como possível segredo seguindo [auditoria-infra.md](auditoria-infra.md#se-achar-um-segredo).

## 7. Conectar com o Cloudflare (quando for a hora do deploy)

1. Cloudflare Dashboard → Workers & Pages → **Create** → Pages → Connect to Git → repo.
2. Root directory: `apps/web`; build command: `npm install --prefix ../.. && npm run build:web --prefix ../..`; output directory: `dist`.
3. Pages usa `AODP_SERVER=west`. As variáveis públicas `SITE_URL`, `DISCORD_PUBLIC_KEY` e `DISCORD_APPLICATION_ID` pertencem ao Worker do bot; `DISCORD_BOT_TOKEN` fica como secret desse Worker.
4. Deploy do bot é separado: `npx wrangler deploy` em `apps/bot/` + `wrangler secret put DISCORD_BOT_TOKEN`.

**O agente não executa esses passos** — apenas prepara arquivos/comandos para a pessoa mantenedora rodar.
