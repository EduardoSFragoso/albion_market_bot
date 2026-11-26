# Build e validação

Este repositório contém o app pessoal para Windows. Ainda não há publicação
automática de releases para o app no CI da raiz.

## Gerar o executável no Windows

Pré-requisitos: Go 1.25+, Node.js 22+, npm, CLI Wails v3 compatível, WebView2
Runtime e Npcap em modo compatível com WinPcap. Na raiz do monorepo, gere os
dados de itens se quiser nomes localizados; essa etapa requer rede:

```powershell
npm run build:data
```

Depois, na pasta `desktop-client`:

```powershell
Set-Location frontend
npm ci
npm run build
Set-Location ..
& "$env:USERPROFILE\go\bin\wails3.exe" generate bindings ./...
go build -o bin/albion-market-archive.exe .
```

Compile a interface antes de `go test` ou `go build`: o ponto de entrada Go
incorpora `frontend/dist` e falha se a pasta ainda não existir.

O `prebuild` gera os índices estáticos de nomes PT-BR e inglês. Sem o banco de
itens do core, o build continua possível e a interface usa IDs legíveis. O
executável é compilado sem ser iniciado.

## Testes

Em `desktop-client`:

```powershell
go test ./...
go vet ./...
```

Em `desktop-client/frontend`:

```powershell
npm test
npm run build
```

`go test` e `go vet` podem sinalizar dependências nativas ou avisos de código
herdado do cliente de captura. Registre a saída e diferencie limitações do
ambiente de falhas introduzidas neste app. O teste manual da captura requer
Windows, Npcap e o jogo; só deve ser feito com a autorização do usuário.

## Licença e origem

O cliente de captura deriva de `ao-data/albiondata-client` v0.1.61. A licença
MIT original está em [`LICENSE`](../LICENSE). As alterações deste projeto
acrescentam arquivo local, interface e preferências de envio; o app não é
afiliado à Albion Online nem ao AODP.
