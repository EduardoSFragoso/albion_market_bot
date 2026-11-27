# Auditoria do catálogo — 2026-11-27

## Resultado

Os JSONs versionados não estão na revisão mais recente do dump. A comparação foi feita
sem alterar `packages/core/src/data/*.json`: o gerador existente foi executado numa
cópia temporária com as fontes de `ao-data/ao-bin-dumps` no commit
[`d277a5c`](https://github.com/ao-data/ao-bin-dumps/commit/d277a5cf8a76535f1dccadbf35b36350ae2665aa).

| Conteúdo | Versionado | Regenerado na cópia | Diferença |
|---|---:|---:|---:|
| Itens | 11.158 | 11.164 | +6, nenhum removido |
| Receitas | 9.039 | 9.041 | +2, nenhuma removida ou alterada |

Itens novos no dump:

- `UNIQUE_AVATAR_GVGSEASON_33_CRYSTAL_SINGLE`
- `UNIQUE_AVATAR_GVGSEASON_33_SILVER_SINGLE`
- `UNIQUE_AVATAR_GVGSEASON_36_CRYSTAL`
- `UNIQUE_AVATAR_GVGSEASON_36_SILVER`
- `UNIQUE_LOOTBAG_ADC_DEC2026`
- `UNIQUE_LOOTBAG_ADC_DEC2026_PREMIUM`

As duas receitas novas são dos avatares de temporada 33 (`CRYSTAL_SINGLE` e
`SILVER_SINGLE`). A comparação encontrou zero diferenças nas receitas já existentes.

## Comparação independente de IDs e nomes

Foram feitas quatro consultas GET, uma para cada catálogo completo documentado pelo
[OpenAlbion](https://api.openalbion.com/docs): armas, armaduras, acessórios e consumíveis.
Isso representa 1.655 registros e fica abaixo do limite publicado de 60 requisições por
minuto. Para os IDs comuns aos dois conjuntos, os nomes ingleses coincidem; não houve
diferença nos tiers quando ambas as fontes os informam. Um registro (`UNIQUE_MOUNT_MORGANA_RAVEN`)
não traz tier no OpenAlbion; o dump local informa tier 6.

Sete IDs do OpenAlbion não aparecem no índice gerado. Todos existem no dump bruto atual,
mas o dump de nomes não tem tradução preenchida para eles; por isso `build-data.mjs` os
descarta atualmente:

| ID | Nome no OpenAlbion | Dado de receita no dump bruto |
|---|---|---|
| `T8_MOUNT_MAMMOTH_BATTLE` | Elder's Command Mammoth | Tem requisitos brutos; o gerador não produz receita |
| `T5_MOUNT_COUGAR_KEEPER` | Swiftclaw | Tem requisitos brutos; o gerador não produz receita |
| `T8_MOUNT_ARMORED_HORSE_MORGANA` | Morgana Nightmare | Tem requisitos brutos; o gerador não produz receita |
| `T8_MOUNT_COUGAR_KEEPER` | Rageclaw | Tem requisitos brutos; o gerador não produz receita |
| `T8_MOUNT_HORSE_UNDEAD` | Spectral Bonehorse | Tem requisitos brutos; o gerador não produz receita |
| `T8_MOUNT_RABBIT_EASTER_DARK` | Caerleon Cottontail | Tem requisitos brutos; o gerador não produz receita |
| `UNIQUE_FOCUSPOTION_ADC_GENERAL_01` | Focus Restoration Potion | Sem receita no dump bruto |

Os requisitos brutos das montarias precisam de revisão antes de tratá-las como receitas
válidas. Nenhuma correção ou inclusão desses sete itens foi aplicada nesta auditoria.

## Limites das fontes

- A página [AODP /items](https://www.albion-online-data.com/items) declara que a lista vem
  de `ao-bin-dumps` e é armazenada em cache por uma hora. Ela confirma a procedência, mas
  não é uma fonte independente nem uma API para baixar o catálogo inteiro; não foram
  feitas consultas por item.
- O [MyAlbionDB](https://www.myalbiondb.com/wiki) apresenta um catálogo paginado (48
  itens por página) e contagem própria de itens/receitas. Não foi encontrada uma API
  pública documentada para exportar o conjunto completo; o site não foi raspado em massa.
  A contagem não é diretamente comparável ao índice daqui, que expande tiers e
  encantamentos.
- A comparação independente de receitas completas ficou limitada: OpenAlbion oferece
  receitas por item, não um endpoint único para o catálogo inteiro. A validação de todas
  as receitas existentes foi feita contra a versão mais recente do mesmo dump que gera o
  projeto. Os testes do core cobrem casos representativos das regras de cálculo, não os
  9.041 registros individualmente.

## Próxima decisão

O código gerado continua inalterado. Antes de regenerar e publicar os dados, revisar os
seis itens novos, as duas receitas de avatar e a ausência de tradução/receita das sete
entradas cruzadas pelo OpenAlbion.
