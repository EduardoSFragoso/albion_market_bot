# Interface do Albion Market Archive

O app combina o cliente de captura Go com uma interface Svelte 5 em uma janela
nativa Wails v3. `frontend/dist` é incorporado ao executável pelo `go:embed`;
por isso, compile a interface antes do executável. Os comandos estão no
[README](../README.md).

## Áreas da interface

- **Sessão:** estado da captura, servidor identificado, duração, mensagens
  decodificadas e atividade recente. Os contadores descrevem registros
  liberados para envio, não confirmam entrega.
- **Arquivo local:** consulta o JSONL de ordens em
  `%LOCALAPPDATA%\AlbionMarketPersonal\market-orders.jsonl`, com filtros por
  item, tipo de ordem, local e região. A lista exibe até 200 registros mais
  recentes; linhas inválidas são informadas e preservadas.
- **Envios:** preferências locais permitem pausar ordens, histórico, ouro e
  dados do mundo. Por padrão, todas as categorias ficam ativadas. Pausar envio
  não desativa a gravação local das ordens.
- **Idioma:** PT-BR e inglês são persistidos localmente. Os nomes de itens vêm
  de arquivos JSON estáticos por idioma gerados antes do build; somente o
  idioma ativo é carregado. Sem o dump de nomes, a interface mostra o ID de
  forma legível.
- **Logs:** o painel apresenta mensagens recentes. Identificadores de ingestão
  podem ser copiados; links AODP não abrem o navegador.

## Inicialização e bandeja

O usuário abre o app manualmente; ele não se registra para iniciar com o
Windows. No Windows, a janela do console fica oculta ao abrir o executável sem
argumentos. O menu da bandeja permite abrir ou fechar o console e sair do app.

O frontend acessa somente serviços locais expostos por Wails. Preferências e
arquivo de ordens ficam fora do repositório e não são incluídos no executável.
