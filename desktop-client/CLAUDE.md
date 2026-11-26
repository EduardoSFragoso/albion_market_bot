# Orientações de manutenção

Este é um app pessoal para Windows derivado do `ao-data/albiondata-client`.
O README desta pasta é a referência de instalação e build; `handoff.md` na
raiz registra os contratos e decisões do monorepo.

## Contratos do app

- A captura observa e decodifica pacotes locais; não injeta nem altera tráfego.
- A cópia local das ordens é gravada independentemente das preferências de envio.
- As categorias de envio começam ativadas para preservar o comportamento do
  cliente de origem; uma categoria desativada não deve enviar dados públicos.
- O dump JSONL é privado, fica em `%LOCALAPPDATA%` e expira após 30 dias.
- O app abre manualmente. Não configurar início com o Windows.
- Não restaurar identidade visual, links ou auto-updater do cliente de origem.

## Verificações

Na pasta `desktop-client`:

```powershell
go test ./...
go vet ./...
```

Na pasta `desktop-client/frontend`:

```powershell
npm ci
npm test
npm run build
```

O build do executável e seus requisitos estão em `README.md`. Os índices
localizados são gerados a partir de `packages/core/src/data/items.json` antes
do build da interface; se o dump não estiver presente, a UI mantém o ID legível.
