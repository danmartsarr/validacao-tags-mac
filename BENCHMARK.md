# Benchmark de interface

Referências consultadas em 05/11/2026 (código CSS e capturas de tela) para o visual da página de validação.

| site | o que tem de útil | o que entrou aqui |
|---|---|---|
| **Rijksmuseum** (rijksmuseum.nl) | Fundo grafite azulado (`#202327`, `#343b42`, `#40474f`), texto branco e cinza frio (`#c2ccce`). Uma família de letra só (RijksText, regular e negrito). Títulos enormes e estreitos. Obras de ponta a ponta, em grade sem respiro. Botões retos com cantos de 2 px. Barra de busca flutuando sobre a coleção. Painel cinza sobreposto à imagem. | A base inteira: paleta, letra única, mosaico sem margem, busca flutuante, painel de login sobre a obra, botões retos. O laranja da marca deles ficou de fora. |
| **Prodigy** (prodi.gy) | Ferramenta de anotação: uma decisão por tela, tudo pelo teclado, rótulos como etiquetas grandes e clicáveis. | Tags como etiquetas que se descartam com um clique ou com as teclas 1–0. Uma obra por tela. "Salvar e próxima" como ação principal. |
| **Centre Pompidou** (centrepompidou.fr) | Grotesca estreita na navegação. Etiquetas pequenas por cima das imagens. | Títulos estreitos. Selo de estado sobre a miniatura. |

MoMA bloqueou o acesso automático (verificação anti-robô), e o Stedelijk não
carregou. A página de obra do Rijksmuseum e a demo do Prodigy não renderizaram
no navegador sem tela: para elas valeu o padrão conhecido dos sites, não uma
captura.

## Fontes dos sites de arte

Levantamento de 05/11/2026: HTML e CSS de 35 sites de museus, galerias e casas
de leilão (os que montam a página por JavaScript foram abertos num Chrome sem
tela). As fontes abaixo são as que cada site declara de fato.

| site | fonte |
|---|---|
| Rijksmuseum | RijksText (própria) |
| MoMA | MoMA Sans e MoMA Sans Condensed (próprias) |
| Whitney | Neue Haas Grotesk Text e Display |
| Artsy | LL Unica77 |
| Centre Pompidou | Univers Next |
| Gagosian | GT America, Minion |
| New Museum | Akkurat, Neographik |
| Pace | Untitled Sans |
| Christie's | ABC Arizona, Atlas Grotesk |
| Sotheby's | Benton Sans, Mercury Display |
| Stedelijk | Union (própria) |
| KW Berlin | KW Grotesk (própria) |
| Tate | Tate (própria), Interstate |
| Guggenheim | Guggenheim Sans (própria) |
| SFMOMA | SFMOMA Sans (própria) |
| Serpentine | T-Star Pro, Noe Text |
| National Gallery of Art | Mallory, Empirica |
| Cooper Hewitt | Cooper Hewitt (própria) |
| Barbican | Supreme |
| LACMA | Bau |
| MASP | FT Aktual |
| Pinacoteca SP | Cera |
| Mauritshuis | Tiempos, Relative |
| Van Gogh Museum | Gotham Rounded |
| Zwirner | Avenir Next |
| Fondation Louis Vuitton | Futura, Garamond |
| Louvre | Louvre Sans (própria) |
| SMK | Hill |

Sem fonte própria identificável: Met, National Gallery (Roboto/Open Sans),
Phillips, IMS e MAM (Helvetica/Open Sans). Art Institute of Chicago e Hauser &
Wirth não entregaram o CSS. Isso dá 32 dos 35 sites.

**Padrão:** quase todos usam uma grotesca de desenho suíço ou americano (Haas,
Unica, Univers, Akkurat, GT America, Untitled, Atlas), muitas vezes encomendada
e quase sempre com uma versão estreita para títulos (MoMA Sans Condensed,
Univers Condensed). Serifa aparece pouco e só em texto corrido. Humanistas como
a Sofia Sans não aparecem.

**Como a obra é apresentada:** a etiqueta de parede. Artista em negrito, título
em itálico seguido da data, técnica, e por fim o número de inventário. Listas de
artistas e de exposições (Whitney, Serpentine, KW) são índices de nomes grandes,
um por linha, com um dado pequeno à direita.

## O que evitar (a "cara de IA")

- Serifa itálica misturada com sem serifa nos títulos.
- Fonte monoespaçada para números e códigos.
- Rótulos pequenos em caixa-alta com espaçamento largo em toda parte.
- Fundo creme ou bege, acento laranja ou ferrugem.
- Fios finos separando tudo, layout de revista.

## Decisões

- **Letra:** Archivo, uma grotesca com licença OFL e cópia local. Um eixo de largura dá a versão estreita (70%) para títulos e nomes, como a MoMA Sans Condensed. É o substituto livre mais próximo das grotescas dos museus.
- **Entrada:** índice de nomes, como as listas de artistas do Whitney e da Serpentine. A obra ao lado troca para uma do lote de quem está sob o cursor, e a senha abre na própria linha.
- **Obra:** etiqueta de parede compacta (artista, título com data, técnica, e numa linha só tombo e ID), para as tags caberem sem rolar. Embaixo da imagem, uma faixa com as obras vizinhas e o estado de cada uma, como a navegação entre obras do Rijksmuseum e do Artsy.
- **Tags:** as aceitas são blocos cinza-claro; as descartadas ficam só com o contorno tracejado e riscadas. Vinte blocos brancos cansavam a vista.
- **Prática:** teclado em tudo, sem legenda na tela (1–0 nas tags, ← → para navegar, Enter salva, P problema, Z amplia, / busca no lote, 1–4 na entrada). A entrada já vem com a última pessoa deste navegador escolhida. Sair de uma obra por qualquer caminho salva o que mudou, e um ponto no botão avisa quando há algo por salvar.
- **Cor:** só cinzas frios e branco. A única cor é o vermelho de problema; o verde e o amarelo aparecem só no ponto de sincronização.
- **Hierarquia:** a obra ocupa o palco escuro e o painel traz só o que é preciso para decidir.

- **Sem pistas da concordância:** a página não diz quais obras estão no lote dos quatro, nem em que lote está uma obra de fora. Cada validador decide sem saber.
