# Albion Market Archive

Este é o app portátil para Windows. Extraia a pasta e abra
`albion-market-archive.exe`; não há instalador, atualização automática nem
início com o Windows.

O arquivo local de ordens fica em
`%LOCALAPPDATA%\AlbionMarketPersonal\market-orders.jsonl` e mantém os últimos
30 dias. O app também cria `albiondata-client.log` na pasta do executável e
mantém até 10 logs antigos (`.log.1` a `.log.10`).

O app requer Npcap em modo compatível com WinPcap para capturar o tráfego do
jogo. Consulte o [guia de captura](https://github.com/EduardoSFragoso/albion_market_bot/blob/main/desktop-client/docs/windows-capture-pcap.md)
se a interface informar que a captura está indisponível.
