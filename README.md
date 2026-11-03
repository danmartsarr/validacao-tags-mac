# Validação das tags (DINOv3 → acervo MAC USP)

Página estática para quatro validadores conferirem, obra a obra, as tags que o
dino.txt (DINOv3 ViT-L com texto) deu a cada obra do acervo, e medir a precisão
do modelo. Funciona no GitHub Pages: HTML, CSS e JS, sem build e sem servidor.

## O que é o número de cada tag

É o **z** do modelo: quantos desvios-padrão a obra fica acima do acervo inteiro
naquela palavra. **Não é probabilidade.** O percentil no acervo vai junto em cada
registro, mas fica entre 91 e 100 em todas as tags exibidas, porque só entra
tag com z ≥ 1,5. Por isso a calibração e o limiar são lidos por faixa de z.

## Login

Daniel, Pedro, Francisco e Marlon, com a senha `12345678`. **Não é segurança:** a
senha está em `js/config.js`, que o navegador baixa. Ela só identifica quem
validou. A sessão fica no `localStorage`.

## Estrutura

```
index.html            a página (rotas pelo hash: #/lote, #/obra/12, #/resultados)
css/estilo.css
js/config.js          validadores, senha, Supabase, categorias de problema
js/storage.js         localStorage + exportar/importar + Supabase
js/metricas.js        precisão, faixas de z, limiar, precision@k, concordância
js/app.js             as telas
dados/obras.json      gerado: vocabulário + obras com as tags
atribuicao.json       gerado uma vez, editável: obra -> validadores
img/g, img/p          gerado: imagens grandes (1200 px) e miniaturas (360 px)
fontes/               Inter (cópia local, sem requisição externa)
gerar_dados.py        gera dados/, img/ e atribuicao.json
```

## Gerar os dados

Os dados saem das saídas do modelo no repositório do mockup (`../mockup`). O
mockup só é lido na geração. A página não depende dele.

```bash
python gerar_dados.py                  # todas as obras (precisa de Pillow)
python gerar_dados.py --amostra 20     # preview com 20 obras
python gerar_dados.py --sem-imagens    # só os JSON
python gerar_dados.py --mockup /outro/caminho/mockup
```

| campo | de onde vem |
|---|---|
| tags, z, percentil | `mockup/dinov3/termos_obras.json` (`obras[].termos` = `[índice, z, percentil]`, `termos[índice].pt/en`) |
| título, artista, data, técnica, tombo | `mockup/testes/scrapper/saida/obras.csv`, pelo `id` |
| imagem | `mockup/testes/scrapper/saida/imagens/<arquivo>`, reduzida |

As 2 obras sem nenhuma tag ficam de fora.

## Lotes e concordância

Todas as obras com tag são distribuídas. 50 delas vão para os quatro
validadores, para medir a concordância. As outras são repartidas em rodízio, o
que dá cerca de 1.172 obras por lote. A ordem dentro do lote é fixa (hash de
validador + obra), então o nº 347 é sempre a mesma obra.

O `atribuicao.json` só é recriado com `--refazer-atribuicao`. Para mover uma
obra, troque o nome na linha dela. Para pô-la na concordância, liste os quatro
nomes.

## Onde as validações ficam

1. **No navegador** (`localStorage`), sempre. Funciona offline.
2. **Exportar/importar** JSON ou CSV, na aba Resultados. Importar junta os
   arquivos dos outros validadores e fica com a edição mais recente de cada
   (obra, validador).
3. **Supabase**, quando configurado. Cada gravação entra numa fila no navegador
   e é enviada assim que houver rede.

Registro:

```json
{ "id_obra": "16554", "validador": "Daniel", "timestamp": "…última edição…", "criado_em": "…",
  "tags": [{ "tag": "torre", "score": 3.21, "percentil": 99.8, "posicao": 3, "aceita": true, "problematica": false }],
  "tags_faltantes": ["xilogravura"],
  "problema": { "flag": false, "categorias": [], "comentario": "" } }
```

### Configurar o Supabase

1. Crie um projeto gratuito em supabase.com.
2. No SQL Editor, rode:

```sql
create table validacoes (
  id_obra text not null,
  validador text not null,
  timestamp timestamptz not null,
  criado_em timestamptz,
  tags jsonb not null,
  tags_faltantes jsonb not null default '[]',
  problema jsonb not null,
  primary key (id_obra, validador)
);
alter table validacoes enable row level security;
create policy "ler"      on validacoes for select to anon using (true);
create policy "inserir"  on validacoes for insert to anon with check (validador in ('Daniel','Pedro','Francisco','Marlon'));
create policy "editar"   on validacoes for update to anon using (true) with check (validador in ('Daniel','Pedro','Francisco','Marlon'));
```

3. Em Project Settings → API, copie a URL e a chave `anon public` para
   `SUPABASE` em `js/config.js`.

A chave anon fica visível no cliente, como a senha. Quem tiver o endereço
consegue gravar. Para um estudo interno isso basta. Se precisar de mais, troque
o login por Supabase Auth.

O plano gratuito pausa o projeto depois de 7 dias sem uso. Ele volta com um
clique no painel, e enquanto isso as validações esperam na fila do navegador.

## Tags marcadas por padrão

Numa obra ainda não validada, todas as tags começam marcadas (corretas): o
modelo acerta mais do que erra, e desmarcar as erradas é mais rápido. A obra só
conta como validada quando é salva (`Enter` ou "Salvar e avançar"). Navegar com
`←` `→` sem mexer em nada não salva, e ela continua pendente.

## Atalhos

`←` `→` navegar (salva se houve mudança) · `Enter` salvar e avançar ·
`1`–`9`, `0` alternar as 10 primeiras tags · `P` sinalizar problema · `Z` ampliar a imagem.

## Rodar localmente

Abra por um servidor (o `fetch` não funciona com `file://`):

```bash
python3 -m http.server 8090      # na pasta acima de validacao/, para imitar o subcaminho
# → http://localhost:8090/validacao/
```

## Publicar no GitHub Pages

1. Crie o repositório no GitHub e envie esta pasta (`git remote add origin …`, `git push`).
2. Em Settings → Pages, escolha "Deploy from a branch", a branch `main` e a pasta `/ (root)`.
3. Se a pasta `validacao/` for a raiz do repositório, a página abre em
   `https://<usuario>.github.io/<repo>/`. Para abrir em `…/<repo>/validacao/`,
   ponha esta pasta dentro de `validacao/` no repositório. Todos os caminhos são
   relativos, então qualquer subcaminho funciona.

Tamanho: as 4.540 imagens grandes (314 MB; quando a original já cabe em 1200 px,
ela vai sem recompressão) e as miniaturas (85 MB) dão cerca de 400 MB, abaixo do
limite de 1 GB do Pages. Nenhum arquivo passa de 100 MB. São reproduções do
acervo num site público. O `.nojekyll` faz o Pages servir os arquivos como estão.
