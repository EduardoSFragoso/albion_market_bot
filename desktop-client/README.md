# Albion Market Archive

Aplicativo pessoal para Windows baseado na captura do cliente da comunidade.
Foi feito para manter um dump local das ordens de mercado além de alimentar o
Albion Online Data Project (AODP), ferramenta comunitária.

## O que ele faz

- Captura passiva dos pacotes de mercado observados pelo cliente de referência.
- Salva cada lote de ordens localmente em
  `%LOCALAPPDATA%\AlbionMarketPersonal\market-orders.jsonl`.
- Envia o mesmo lote ao AODP; falha ao gravar localmente não interrompe o envio.
- Permite pausar separadamente ordens, histórico, ouro e dados do mundo nos destinos de envio; todos seguem ligados por padrão.
- A interface alterna entre PT-BR e inglês e lembra a escolha localmente.
- Mostra até 200 ordens mais recentes por consulta, com nomes de itens no idioma
  selecionado quando o banco gerado do core está disponível, código original,
  tipo da ordem, qualidade, encantamento, cidade/local, servidor, preço em
  prata e filtros por item, cidade/local, servidor e intervalo de datas.
- Exporta todas as ordens que correspondem aos filtros para CSV, mesmo quando a
  tabela mostra apenas as 200 mais recentes.
- Os índices PT-BR e EN são arquivos JSON estáticos separados; o painel carrega
  apenas o idioma ativo, fora do bundle JavaScript principal.
- Mostra duração da sessão, mensagens do jogo decodificadas e um feed limitado
  das mudanças de captura e dados observados.

O aplicativo não percorre o mercado sozinho nem automatiza ações no jogo. O dump
contém apenas os dados que o cliente de referência recebe durante a sessão.
Ordens com mais de 30 dias são removidas ao abrir o app e, enquanto ele estiver
aberto, diariamente. As preferências de envio ficam em
`%APPDATA%\AlbionMarketPersonal\upload-preferences.json`, fora do repositório.
Desligar uma categoria interrompe seu envio futuro; a cópia local de ordens
continua ativa. O app não se inicia com o Windows: abra-o manualmente. No
Windows, o console fica oculto por padrão e pode ser reaberto pelo menu do ícone
na bandeja. O projeto não distribui instalador nem atualiza o executável
automaticamente. O app grava `albiondata-client.log` ao lado do executável e
mantém até 10 cópias antigas. Versões publicadas em Releases do GitHub incluem
um ZIP com uma pasta própria e o `.exe`, além de `SHA256SUMS.txt` para validar o
ZIP antes de extrair.

## Requisitos no Windows

- Go 1.25 ou superior.
- Node.js 22 ou superior e npm.
- WebView2 Runtime.
- Npcap instalado em modo compatível com WinPcap para captura de pacotes.

## Desenvolvimento

Na raiz do repositório, rode `npm run build:data` para gerar nomes localizados
dos itens (sem esse arquivo, o app mostra IDs legíveis como fallback). Depois,
na pasta `desktop-client`, gere os bindings e compile a interface antes de
iniciar o aplicativo:

```powershell
Set-Location .\desktop-client\frontend
npm ci       # uma vez, usando as versões do package-lock.json
npm run build
Set-Location ..
& "$env:USERPROFILE\go\bin\wails3.exe" generate bindings ./...
.\scripts\build-windows.ps1 -OutputPath .\bin\albion-market-archive.exe -Version dev
```

Instale a CLI Wails compatível com `go install github.com/wailsapp/wails/v3/cmd/wails3@v3.0.0-beta.5`.
O script de build usa `go-winres` v0.3.3 via `go run` para embutir e conferir o
ícone; o Go baixa a ferramenta para o cache de módulos, sem instalá-la no PATH.
O executável é compilado, mas não iniciado.

## Baixar uma versão publicada

Cada tag `desktop-vX.Y.Z` publicada a partir de um commit já mesclado em `main`
gera uma GitHub Release com `albion-market-archive-windows-x64.zip` e
`SHA256SUMS.txt`. O ZIP contém a pasta `AlbionMarketArchive`, com o executável e
um README portátil. O checksum verifica o ZIP. No PowerShell, valide o arquivo
baixado antes de extraí-lo:

```powershell
Get-FileHash .\albion-market-archive-windows-x64.zip -Algorithm SHA256
Get-Content .\SHA256SUMS.txt
```

O hash calculado deve corresponder à linha `albion-market-archive-windows-x64.zip`
do arquivo de checksums. Depois de extrair, execute o `.exe` dentro da pasta
incluída. O workflow não inicia o app nem publica atualizações automáticas.
Para compilar localmente, use o guia
[`docs/build-and-release.md`](docs/build-and-release.md).

Para validar Go, use `go test ./...`; para validar formatação e labels do dump,
use `npm test` em `desktop-client/frontend`; para validar o frontend, execute
`npm run build` no mesmo diretório. Para compilar um executável Windows com
ícone, use `scripts/build-windows.ps1`; o runtime precisa do Npcap e do WebView2.

## Origem e licença

O cliente de captura deriva de [`ao-data/albiondata-client`](https://github.com/ao-data/albiondata-client),
versão `v0.1.61` (commit `c6edd9456bec4657755c25f173e8ebc7a31a17f7`), sob a licença
MIT incluída em [`LICENSE`](LICENSE). As mudanças locais adicionam o arquivo
JSONL e a interface de consulta; não são afiliadas ao Albion Online nem ao AODP.
