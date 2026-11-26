# Configuração do repositório (remoto + proteções)

Adaptada para este monorepo npm/TypeScript, com site no **Cloudflare Pages** e bot em
**Cloudflare Workers**. Este repositório já está conectado ao GitHub e ao Pages; os
passos de criação abaixo servem para um projeto novo ou para reconstruir a configuração.
Merge em `main` inicia o deploy automático do site; o Worker do bot é implantado à parte.

**Regra central: alterações em conta e dashboards do GitHub ou Cloudflare exigem
autorização explícita, conforme `AGENTS.md`. Este documento registra o estado atual e
serve de guia de bootstrap; não repita passos de criação em uma instalação existente.**

## 1. Criar o remoto (somente para um projeto novo)

1. GitHub → New repository → nome `albion_market_bot` → **público ou privado, sem nenhum arquivo inicial** (nada de README/licença gerada, para o primeiro push não conflitar).
2. Não colar segredo em lugar nenhum — nem em issue, nem em descrição.

```bash
cd "/c/Users/Eduardo F/Documents/Projects/albion_market_bot"
git remote add origin git@github.com:SEU-USUARIO/albion_market_bot.git   # ou https
git push -u origin main
```

3. Se usar SSH e ainda não tiver chave: `ssh-keygen -t ed25519` e cadastrar a pública no GitHub. **Nunca** enviar a chave privada para uma IA ou colar em chat.

## 2. Ruleset da branch principal

Neste repositório, `main` já exige PR, CI e CodeQL, e somente **Rebase and merge** está
habilitado. Confira o estado atual em GitHub → Settings → Rules →
Rulesets antes de alterar a configuração. Para outro repositório, use esta lista como
configuração inicial:

GitHub → Settings → Rules → Rulesets → criar regra para `main`:

| Regra | Por quê |
|---|---|
| Require pull request before merging | Toda mudança passa por PR revisável |
| Require status checks: **CI** (matriz da seção 3) + **CodeQL** (`Analyze (javascript-typescript)`) | Merge só com a rede de segurança verde — testes + análise de vulnerabilidade de código |
| Require linear history | Histórico limpo, fácil de reverter |
| Block force pushes | Impossibilita histórico reescrito por acidente |

O fluxo natural fica: mudança → branch → PR → **CI + CodeQL verdes** → **Rebase and merge** em `main`
(único método permitido: merge commit e squash estão desativados no repo).

## 3. CI e verificações de PR

`.github/workflows/ci.yml` é a fonte da verdade para a verificação `check` de GitHub Actions;
`.github/workflows/codeql.yml` define a análise CodeQL avançada e publica
`Analyze (javascript-typescript)`, exigido pelo ruleset:

| Verificação | Comando |
|---|---|
| Typecheck de todos os workspaces | `npm run typecheck` |
| Sanity do core | `npx tsx packages/core/test/sanity.ts` |
| Testes do bot | `npm run test:bot` |
| Testes do cache do core | `npm run test:api-cache` |
| Validação da API web | `npm run test:web-validation` |
| Testes do rate limiter | `npm run test:api-rate-limit` |
| Build dry-run do limitador | `npm run build:api-limiter` |
| Build do site | `npm run build:web` |
| Sintaxe do registro de comandos | `node --check apps/bot/scripts/register-commands.mjs` |

O Cloudflare Pages também publica uma verificação de preview nos PRs. A CI não faz deploy
de produção, não chama a API real do Albion e não publica secrets.

O workflow declara `permissions: contents: read`, reduzindo o poder do token. Atualize esta tabela
junto do workflow se os checks mudarem.

O workflow CodeQL também limita permissões a `actions: read`, `contents: read` e
`security-events: write`, e analisa Actions, Go e JavaScript/TypeScript nos PRs para `main`,
pushes em `main` e semanalmente. Go usa `autobuild`; as linguagens interpretadas usam
`none`. A configuração CodeQL do repositório deve estar em
**Advanced setup**; o **Default setup** desativa workflows avançados e bloqueia uploads.
O job `Analyze (javascript-typescript)` deve continuar com esse nome porque é um check
obrigatório no ruleset.

## 4. Dependabot

`.github/dependabot.yml` com dois ecossistemas:

- `npm` — diretório `/` (workspaces pegam os manifests dos pacotes)
- `github-actions` — diretório `/`

## 5. Projeto, issues e colaboradores

- **Issues/labels:** usar para ideias e bugs (ex.: label `api`, `bot`, `site`, `rank`). O agente usa issues para planejar mudanças multi-arquivo quando pedido.
- **Colaboradores:** só quem realmente trabalha no projeto; github convidado como write, nunca owner.
- **Licença:** este repositório já inclui `LICENSE` (MIT). Para outro projeto, escolha a licença antes de publicar.

## 6. Higiene de arquivos (já resolvido, conferir de vez em quando)

`.gitignore` cobre: `node_modules/`, `dist/`, `.dev.vars`, `.env*`, `.scratch/` (dumps de itens), `wrangler` local, `.vite/`.

Conferir:

```bash
git ls-files | grep -Ei '\.dev\.vars$|\.env$|node_modules|dist/|scratch'   # deve ser vazio
```

Se algo desses aparecer versionado: remover do índice (`git rm --cached`), commit, e tratar como possível segredo seguindo [auditoria-infra.md](auditoria-infra.md#se-achar-um-segredo).

## 7. Cloudflare: configuração atual e bootstrap

Configuração deste projeto: Pages `albion-market-web`, site em
`https://albion-market-web.pages.dev`, root `apps/web`, build
`npm install --prefix ../.. && npm run build:web --prefix ../..`, saída `dist` e
`AODP_SERVER=west`. O Pages também empacota `apps/web/functions`; o binding `API_LIMITER`
chama o Worker privado `albion-market-api-limiter`. Merge em `main` inicia o deploy
automático do Pages.

Para reconstruir a configuração em outra conta: **Workers & Pages → Create → Pages →
Connect to Git**, selecione o repositório e configure os valores acima. Publique primeiro
o Worker privado do limitador com `cd apps/api-limiter && npm run deploy`. Antes disso,
defina em `apps/api-limiter/wrangler.toml` um `namespace_id` numérico ainda não usado
naquela conta Cloudflare.

O bot é independente do Pages: faça deploy de `apps/bot` com `npx wrangler deploy`.
`DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID` e `SITE_URL` são vars públicas do Worker;
somente `DISCORD_BOT_TOKEN` deve ser configurado com `wrangler secret put`.

Alterações de conta, secrets reais e deploy seguem a autorização explícita definida em
`AGENTS.md`; não copie valores secretos para o repositório ou para o chat.
