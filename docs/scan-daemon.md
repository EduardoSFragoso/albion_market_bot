# Scan daemon — alimentar o AODP com seus próprios scans

> O objetivo aqui é **não escrever código**: existe cliente pronto da comunidade
> (leitura passiva de pacotes, a mesma tecnologia que alimenta o AODP há anos).
> O "daemon" é: instalar, deixar rodando enquanto joga, e seguir uma rotina de
> varredura simples. Tudo o que este guia descreve é execução manual na sua
> máquina — nada disto vai para deploy ou para o repositório em execução.

## Como o dado nasce (o fluxo inteiro)

```
(Jogo aberto + cliente rodando)
Personagem na cidade X  →  abre a tela de mercado em X
  → o jogo envia só a "fatia" que está na tela (categoria/tier/encantamento na página)
      → o cliente lê esses pacotes passivamente (nada é digitado, nada é automatizado)
          → sobe anônimo pro AODP, etiquetado como cidade X
              → o site e o bot deste projeto consultam o AODP
```

Duas verdades que moldam a expectativa:

1. **Automático: o que aparece na tela sobe sozinho.** Cliente rodando = zero
   trabalho manual. Cada tela de mercado mostra uma **categoria inteira** de
   ofertas de uma vez — não é item por item.
2. **Não automático: o jogo NUNCA manda o mercado inteiro de uma vez.** Só chegam
   ao seu cliente os dados da tela aberta. "Abriu o market e cobriu a cidade
   toda" não existe nem para os sites comerciais (ScanAlbion etc.) — é
   limitação do protocolo do jogo. A solução de todo mundo é **folhear os
   filtros** (categoria a categoria, tier a tier).

E a consequência geográfica: **dado de cidade só nasce para quem está na
cidade.** Não há teleporte de dado — seu personagem precisa estar logado
naquela praça e abrir o mercado lá.

## 1. Instalação (uma vez)

1. Baixe o cliente do projeto: <https://www.albion-online-data.com/client>
   (Windows: o instalador adiciona o driver de captura de pacotes se faltar).
2. Rode o cliente **depois de começar a jogar** — a aba principal detecta seu
   personagem e mostra o status de upload em tempo real.
3. Deixe no tray. Pronto: a partir daqui, tudo que o seu mercado mostrar sobe
   sozinho pro pool público que o site e o bot já consultam.

Fonte/mãos no código: <https://github.com/ao-data/albiondata-client>

**Como conferir que está subindo:** a interface do cliente mostra os pacotes
capturados/uploads; do lado do projeto, abra `/preco` aqui no site (ou a aba
Oportunidades) 1–2 minutos depois de varrer uma cidade — preços frescos com
data recente.

## 2. Rotina de varredura por cidade (o "scan")

O que os scanners experientes fazem, por praça:

- Janela de **comprar** do mercado (é ela que mostra as OFERTAS de venda, que
  é o que os cálculos usam — `sell_price_min`).
- Percorrer as categorias relevantes (armas, armaduras, acessórios, itens,
  recursos) usando os filtros de **tier** — cada página cobre uma categoria
  inteira; não precisa abrir item por item.
- ~3–6 minutos por cidade cobre bem o mercado rotativo. Cidades que você já
  visita ao jogar saem de graça.

## 3. Praças do servidor west (8 no total)

| Praça | Nota |
|---|---|
| Thetford, Fort Sterling, Lymhurst, Bridgewatch, Martlock | cidades reais (bônus de refino/RRR variam) |
| Caerleon | inclui acessar o **Black Market** (só existe lá) |
| Brecilien | mercado menor, mas tem dados que só nascem lá |

## 4. Segurança e regras do jogo

- O cliente faz **leitura passiva da rede** (o que o jogo envia para você);
  não lê memória, não injeta nada, não joga por você. É o cliente público do
  projeto que alimenta todos os sites de preço que você já usa.
- **Não use macros/auto-clickers** para varrer o mercado: zona cinza dos ToS.
  Varra manualmente (a rotina acima é rápida); a contribuição é a mesma.
- Contribuir melhora o pool para você e para todo mundo que usa o site/bot —
  é um uso público, sem dados pessoais.

## 5. Frescor esperado e como isso interage com os cálculos

- Preços jovens (< 1 dia) são ótimos; horas, muito bons. O core do projeto
  joga fora dados com **mais de 7 dias** (padrão `livePrice`), então até
  scans esporádicos ajudam.
- `sell_price_min_date` antigo = item parado — o site marca ("dado antigo")
  e o bot avisa. Após a sua varredura, essas marcações somem.
