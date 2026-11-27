# Atualização do app

O auto-updater do `ao-data/albiondata-client` foi removido deste fork. O app
pessoal não consulta releases nem substitui o próprio executável. Para obter
uma versão nova, baixe `albion-market-archive.exe` e `SHA256SUMS.txt` da
[GitHub Release](https://github.com/EduardoSFragoso/albion_market_bot/releases)
e confira o hash SHA-256 antes de substituir o arquivo local com o app fechado.
O fluxo de build e publicação por tag está em
[`build-and-release.md`](build-and-release.md).

O campo de versão exibido na interface é informativo. Não há instalação
automática, serviço em segundo plano nem início com o Windows.
