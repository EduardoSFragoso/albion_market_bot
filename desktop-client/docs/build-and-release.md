# Build e validação

Este repositório contém o app pessoal portátil para Windows. A publicação de
releases é manual por tag: o GitHub Actions compila o `.exe` com o ícone do app,
coloca-o numa pasta dentro de um ZIP e anexa o ZIP e seu checksum SHA-256 à
release. O app não publica nem instala atualizações por conta própria.

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
.\scripts\build-windows.ps1 -OutputPath .\bin\albion-market-archive.exe -Version dev
```

Compile a interface antes de `go test` ou `go build`: o ponto de entrada Go
incorpora `frontend/dist` e falha se a pasta ainda não existir.
O script chama `go-winres` v0.3.3 com `go run` para embutir e validar o ícone;
a ferramenta fica no cache de módulos do Go, sem instalação no `PATH`.

O `prebuild` gera os índices estáticos de nomes PT-BR e inglês. Sem o banco de
itens do core, o build continua possível e a interface usa IDs legíveis. O
executável é compilado sem ser iniciado.

## Publicar uma versão

Depois que as mudanças estiverem em `main`, inicie **Actions → Desktop release →
Run workflow**, escolha `main` e informe a versão sem prefixo, como `1.2.3`. O
workflow cria a tag `desktop-v1.2.3`, compila o frontend, gera o executável com
esse número e publica a release.

Também é possível iniciar o mesmo workflow no PowerShell com GitHub CLI (`gh`)
instalado e autenticado:

```powershell
gh workflow run desktop-release.yml --ref main -f version=1.2.3
```

Se preferir, o disparo por tag continua disponível:

```powershell
git tag -a desktop-v1.2.3 -m "Albion Market Archive v1.2.3"
git push origin desktop-v1.2.3
```

Em qualquer caminho, o workflow verifica que o commit já está em `main` e
publica a release com estes dois arquivos:

- `albion-market-archive-windows-x64.zip` — contém a pasta `AlbionMarketArchive`,
  o `.exe` e um README curto para uso portátil
- `SHA256SUMS.txt`

O checksum é calculado a partir do ZIP. O workflow também confere que o ZIP
contém a pasta, o executável e o README, e extrai o recurso para verificar que o
ícone foi embutido. Não executa o app, não publica em Cloudflare e não habilita
atualização automática. Se a compilação falhar antes de criar a release, corrija
a causa e reexecute o workflow com a mesma versão e o mesmo commit. A tag só é
reutilizada quando ainda aponta para esse commit. Uma release já criada não é
sobrescrita; publique uma nova versão se precisar substituir os arquivos.

O app grava `albiondata-client.log` ao lado do executável e mantém até 10 cópias
antigas. O arquivo é texto simples e pode ser aberto por um editor de texto.

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
