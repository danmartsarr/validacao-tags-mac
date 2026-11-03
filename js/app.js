/** app.js: login, lote, obra e resultados. Rotas pelo hash (#/lote, #/obra/12, #/resultados). */
import { VALIDADORES, SENHA, CATEGORIAS_PROBLEMA, POR_PAGINA } from "./config.js";
import * as st from "./storage.js";
import { calcular, metricasCSV } from "./metricas.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Number(n).toLocaleString("pt-BR");
const pct = (v, casas = 0) => (v == null ? "—" : `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas })}%`);
const dec = (v, casas = 2) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }));
const main = $("#principal");

let DADOS, ATRIB, porId, porTombo, usuario, lote = [], teclas = null;

/* --------------------------------------------------------------- dados */
async function carregar() {
  const [d, a] = await Promise.all([
    fetch("dados/obras.json").then((r) => r.json()),
    fetch("atribuicao.json").then((r) => r.json()),
  ]);
  DADOS = d;
  ATRIB = a;
  porId = new Map(d.obras.map((o) => [o.id, o]));
  porTombo = new Map(d.obras.map((o) => [o.tombo, o]));
}

/** FNV-1a: a ordem do lote é a mesma em qualquer navegador */
function fnv(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

const loteDe = (v) => Object.entries(ATRIB.obras)
  .filter(([id, vs]) => vs.includes(v) && porId.has(id))
  .map(([id]) => id)
  .sort((a, b) => fnv(`${v}:${a}`) - fnv(`${v}:${b}`) || a - b);

function estado(id) {
  const r = st.registro(id, usuario);
  if (!r) return "pendente";
  return r.problema?.flag || r.tags.some((t) => t.problematica) ? "sinalizada" : "validada";
}
const NOME_ESTADO = { pendente: "Pendente", validada: "Validada", sinalizada: "Sinalizada" };
const primeiraPendente = () => lote.findIndex((id) => estado(id) === "pendente") + 1;
const comuns = (id) => (ATRIB.obras[id]?.length ?? 0) > 1;

/* --------------------------------------------------------------- avisos */
let avisoTempo;
function aviso(texto) {
  const el = $(".aviso");
  el.textContent = texto;
  el.classList.add("visivel");
  clearTimeout(avisoTempo);
  avisoTempo = setTimeout(() => el.classList.remove("visivel"), 2600);
}

/* --------------------------------------------------------------- topo */
function atualizarTopo(aba) {
  const topo = $(".topo");
  topo.hidden = !usuario;
  if (!usuario) return;
  $(".usuario", topo).textContent = usuario;
  $$(".abas a", topo).forEach((a) => a.toggleAttribute("aria-current", a.dataset.aba === aba));
  const feitas = lote.filter((id) => st.registro(id, usuario)).length;
  const barra = $(".progresso", topo);
  barra.setAttribute("aria-valuemax", lote.length);
  barra.setAttribute("aria-valuenow", feitas);
  $(".progresso-barra", topo).style.width = `${lote.length ? (feitas / lote.length) * 100 : 0}%`;
  $(".progresso-texto").textContent = `${num(feitas)}/${num(lote.length)} validadas`;
  const s = st.remoto;
  $(".sincronia", topo).textContent = !s.ativo ? "Só neste navegador"
    : s.estado === "erro" ? `Servidor: erro, ${s.pendentes()} a enviar`
    : s.pendentes() ? `Servidor: ${s.pendentes()} a enviar` : "Servidor em dia";
}

/* --------------------------------------------------------------- login */
function telaEntrar() {
  const capa = DADOS.obras[fnv(new Date().toDateString()) % DADOS.obras.length];
  main.innerHTML = `
    <section class="entrar">
      <figure class="entrar-figura"><img src="img/g/${capa.id}.jpg" alt="${esc(capa.titulo)}, ${esc(capa.artista)}"></figure>
      <form class="entrar-form" novalidate>
        <p class="rotulo">Acervo MAC USP · DINOv3</p>
        <h1>Validação das tags</h1>
        <fieldset class="quem-valida">
          <legend>Quem está validando</legend>
          ${VALIDADORES.map((v, i) => `
            <label class="opcao"><input type="radio" name="validador" value="${v}" ${i === 0 ? "required" : ""}>
              <span>${v}</span><i>${num(loteDe(v).length)} obras</i></label>`).join("")}
        </fieldset>
        <label class="campo">Senha <input type="password" name="senha" autocomplete="current-password" required></label>
        <p class="erro" aria-live="assertive"></p>
        <button class="botao" type="submit">Entrar</button>
        <p class="nota">A senha só identifica quem validou. Não protege nada.</p>
        <p class="credito">${esc(capa.artista)}, <i>${esc(capa.titulo)}</i>, ${esc(capa.data)}</p>
      </form>
    </section>`;
  $(".entrar-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const v = f.get("validador");
    const erro = $(".erro");
    if (!v) { erro.textContent = "Escolha quem está validando."; return; }
    if (f.get("senha") !== SENHA) { erro.textContent = "Senha incorreta."; $("[name=senha]").select(); return; }
    st.sessao.entrar(v);
    iniciarSessao();
    location.hash = "#/lote";
  });
}

function iniciarSessao() {
  usuario = st.sessao.atual()?.validador ?? null;
  lote = usuario ? loteDe(usuario) : [];
}

/* --------------------------------------------------------------- busca e ir para */
function barraIr(atual) {
  return `
    <div class="ir">
      <form class="ir-numero">
        <label for="ir-n">Ir para nº</label>
        <input id="ir-n" name="n" type="number" min="1" max="${lote.length}" inputmode="numeric" placeholder="1–${lote.length}" value="${atual ?? ""}">
        <button class="link" type="submit">Ir</button>
      </form>
      <form class="ir-id">
        <label for="ir-id">ID ou tombo</label>
        <input id="ir-id" name="id" type="search" placeholder="16554 ou 1963.1.239" autocomplete="off">
        <button class="link" type="submit">Buscar</button>
      </form>
      <a class="continuar" href="#/obra/${primeiraPendente() || lote.length}">Continuar de onde parei →</a>
    </div>`;
}

function ligarIr() {
  $(".ir-numero")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const n = Number(new FormData(e.target).get("n"));
    if (n >= 1 && n <= lote.length) location.hash = `#/obra/${n}`;
    else aviso(`Escolha um número de 1 a ${num(lote.length)}.`);
  });
  $(".ir-id")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const q = String(new FormData(e.target).get("id")).trim();
    const o = porId.get(q) ?? porTombo.get(q);
    if (!o) return aviso(`Nenhuma obra com ID ou tombo “${q}”.`);
    const i = lote.indexOf(o.id);
    if (i >= 0) location.hash = `#/obra/${i + 1}`;
    else aviso(`A obra ${o.id} está no lote de ${(ATRIB.obras[o.id] ?? ["ninguém"]).join(", ")}.`);
  });
}

/* --------------------------------------------------------------- lote */
const FILTROS = [["todas", "Todas"], ["pendente", "Pendentes"], ["validada", "Validadas"], ["sinalizada", "Sinalizadas"]];

function telaLote(params) {
  const filtro = FILTROS.some(([f]) => f === params.get("f")) ? params.get("f") : "todas";
  const itens = lote.map((id, i) => ({ id, n: i + 1, estado: estado(id) }));
  const contagem = Object.fromEntries(FILTROS.map(([f]) => [f, f === "todas" ? itens.length : itens.filter((x) => x.estado === f).length]));
  const lista = filtro === "todas" ? itens : itens.filter((x) => x.estado === filtro);
  const paginas = Math.max(1, Math.ceil(lista.length / POR_PAGINA));
  const p = Math.min(paginas, Math.max(1, Number(params.get("p")) || 1));
  const pagina = lista.slice((p - 1) * POR_PAGINA, p * POR_PAGINA);
  const link = (f, pg) => `#/lote?f=${f}&p=${pg}`;

  main.innerHTML = `
    <section class="pagina">
      <header class="cabeca">
        <p class="rotulo">${esc(usuario)} · ${num(lote.length)} obras</p>
        <h1>Seu lote</h1>
      </header>
      ${barraIr()}
      <nav class="filtros" aria-label="Filtrar o lote">
        ${FILTROS.map(([f, nome]) => `<a href="${link(f, 1)}" ${f === filtro ? 'aria-current="true"' : ""}>${nome} <span>${num(contagem[f])}</span></a>`).join("")}
      </nav>
      ${pagina.length ? `<ol class="grade" start="${(p - 1) * POR_PAGINA + 1}">
        ${pagina.map((x) => {
          const o = porId.get(x.id);
          return `<li class="cartao e-${x.estado}">
            <a href="#/obra/${x.n}" aria-label="Obra ${x.n}: ${esc(o.titulo)}, ${NOME_ESTADO[x.estado]}">
              <span class="cartao-img"><img loading="lazy" src="img/p/${x.id}.jpg" alt=""></span>
              <span class="cartao-linha"><b>${x.n}</b><span class="cartao-estado">${NOME_ESTADO[x.estado]}</span></span>
              <span class="cartao-titulo">${esc(o.titulo)}</span>
              ${comuns(x.id) ? '<span class="cartao-comum">concordância</span>' : ""}
            </a></li>`;
        }).join("")}
      </ol>` : `<p class="vazio">Nenhuma obra ${filtro === "pendente" ? "pendente" : "neste filtro"}.</p>`}
      ${paginas > 1 ? `<nav class="paginas" aria-label="Páginas">
        ${p > 1 ? `<a href="${link(filtro, p - 1)}">← Anterior</a>` : "<span></span>"}
        <span>Página ${p} de ${paginas}</span>
        ${p < paginas ? `<a href="${link(filtro, p + 1)}">Próxima →</a>` : "<span></span>"}
      </nav>` : ""}
    </section>`;
  ligarIr();
  teclas = null;
}

/* --------------------------------------------------------------- obra */
function rascunho(obra) {
  const salvo = st.registro(obra.id, usuario);
  if (salvo) return structuredClone(salvo);
  return {
    id_obra: obra.id,
    validador: usuario,
    tags: obra.tags.map(([i, z, p], pos) => ({
      tag: DADOS.termos[i].pt, score: z, percentil: p, posicao: pos + 1, aceita: true, problematica: false,
    })),
    tags_faltantes: [],
    problema: { flag: false, categorias: [], comentario: "" },
  };
}

function telaObra(n) {
  if (!lote.length) { main.innerHTML = `<p class="vazio pagina">Seu lote está vazio.</p>`; return; }
  if (!n) n = primeiraPendente() || 1;
  n = Math.min(lote.length, Math.max(1, n));
  const obra = porId.get(lote[n - 1]);
  const r = rascunho(obra);
  const salvo = st.registro(obra.id, usuario);
  const zMax = Math.max(4, ...r.tags.map((t) => t.score));
  const termoEn = new Map(DADOS.termos.map((t) => [t.pt, t.en]));
  let sujo = false;

  main.innerHTML = `
    <div class="pagina pagina-obra">
      ${barraIr(n)}
      <article class="obra">
        <figure class="obra-figura">
          <button type="button" class="obra-imagem" aria-label="Ampliar a imagem (Z)">
            <img src="img/g/${obra.id}.jpg" alt="${esc(obra.titulo)}, de ${esc(obra.artista)}">
          </button>
          <figcaption>Clique para ampliar <kbd>Z</kbd></figcaption>
        </figure>
        <div class="obra-texto">
          <p class="contador">Obra <b>${num(n)}</b> de ${num(lote.length)}
            <span class="obra-estado e-${estado(obra.id)}">${NOME_ESTADO[estado(obra.id)]}${salvo ? ` em ${new Date(salvo.timestamp).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}` : ""}</span>
            ${comuns(obra.id) ? '<span class="obra-comum">concordância: os quatro validam</span>' : ""}</p>
          <p class="artista">${esc(obra.artista)}</p>
          <h1 class="titulo">${esc(obra.titulo)}</h1>
          <dl class="ficha">
            <div><dt>Data</dt><dd>${esc(obra.data) || "—"}</dd></div>
            <div><dt>Técnica</dt><dd>${esc(obra.tecnica) || "—"}</dd></div>
            <div><dt>Tombo</dt><dd>${esc(obra.tombo)}</dd></div>
            <div><dt>ID</dt><dd>${esc(obra.id)}</dd></div>
          </dl>

          <section class="tags" aria-labelledby="tags-h">
            <div class="tags-cabeca">
              <h2 id="tags-h">Tags sugeridas</h2>
              <span class="tags-conta"></span>
              <span class="tags-atalhos"><button type="button" class="link" data-todas="1">Marcar todas</button>
                <button type="button" class="link" data-todas="0">Desmarcar todas</button></span>
            </div>
            <p class="legenda">Todas começam marcadas: desmarque as incorretas. O número é o z do modelo: quanto a obra se destaca do acervo naquela palavra.</p>
            <ol class="lista-tags">
              ${r.tags.map((t, i) => `
                <li class="tag${t.aceita ? " aceita" : ""}${t.problematica ? " problematica" : ""}">
                  <label>
                    <input type="checkbox" data-i="${i}" ${t.aceita ? "checked" : ""}>
                    <span class="tecla" aria-hidden="true">${i < 9 ? i + 1 : i === 9 ? 0 : ""}</span>
                    <span class="tag-nome">${esc(t.tag)}${termoEn.get(t.tag) ? `<i lang="en">${esc(termoEn.get(t.tag))}</i>` : ""}</span>
                    <span class="tag-score" title="z ${dec(t.score)} · percentil ${dec(t.percentil, 1)} no acervo">
                      <span class="trilho"><span style="width:${Math.max(4, ((t.score - 1.5) / (zMax - 1.5)) * 100)}%"></span></span>
                      <span class="z">${dec(t.score, 1)}</span>
                    </span>
                  </label>
                  <button type="button" class="tag-problema" data-p="${i}" aria-pressed="${t.problematica}"
                    aria-label="Marcar “${esc(t.tag)}” como problemática" title="Tag problemática">⚑</button>
                </li>`).join("")}
            </ol>
          </section>

          <label class="campo">Tags que faltaram
            <input type="text" name="faltantes" value="${esc(r.tags_faltantes.join(", "))}" placeholder="separadas por vírgula" autocomplete="off">
          </label>

          <section class="problema">
            <button type="button" class="problema-abre" aria-expanded="${r.problema.flag}" aria-controls="problema-painel">
              <span class="problema-marca" aria-hidden="true">⚑</span> Sinalizar problema <kbd>P</kbd>
            </button>
            <fieldset id="problema-painel" class="problema-painel" ${r.problema.flag ? "" : "hidden"}>
              <legend class="visualmente-oculto">Tipo de problema</legend>
              ${CATEGORIAS_PROBLEMA.map(([id, nome]) => `
                <label class="opcao-caixa"><input type="checkbox" name="categoria" value="${id}" ${r.problema.categorias.includes(id) ? "checked" : ""}> ${nome}</label>`).join("")}
              <label class="campo">Comentário
                <textarea name="comentario" rows="3">${esc(r.problema.comentario)}</textarea>
              </label>
            </fieldset>
          </section>

          <div class="acoes">
            <button type="button" class="link" data-ir="${n - 1}" ${n <= 1 ? "disabled" : ""}>← Anterior</button>
            <button type="button" class="botao salvar">Salvar e avançar <kbd>Enter</kbd></button>
            <button type="button" class="link" data-ir="${n + 1}" ${n >= lote.length ? "disabled" : ""}>Próxima →</button>
          </div>
          <p class="atalhos"><kbd>←</kbd> <kbd>→</kbd> navegar · <kbd>1</kbd>–<kbd>9</kbd>, <kbd>0</kbd> tags · <kbd>P</kbd> problema · <kbd>Z</kbd> ampliar</p>
        </div>
      </article>
    </div>`;
  ligarIr();

  const contar = () => {
    const a = r.tags.filter((t) => t.aceita).length;
    $(".tags-conta").textContent = `${a} de ${r.tags.length} marcadas`;
  };
  contar();

  const alternar = (i, valor) => {
    if (!r.tags[i]) return;
    r.tags[i].aceita = valor ?? !r.tags[i].aceita;
    const cx = $(`input[data-i="${i}"]`);
    cx.checked = r.tags[i].aceita;
    cx.closest("li").classList.toggle("aceita", r.tags[i].aceita);
    sujo = true;
    contar();
  };
  $(".lista-tags").addEventListener("change", (e) => {
    if (e.target.dataset.i != null) alternar(Number(e.target.dataset.i), e.target.checked);
  });
  $(".lista-tags").addEventListener("click", (e) => {
    const b = e.target.closest("[data-p]");
    if (!b) return;
    const t = r.tags[Number(b.dataset.p)];
    t.problematica = !t.problematica;
    b.setAttribute("aria-pressed", t.problematica);
    b.closest("li").classList.toggle("problematica", t.problematica);
    sujo = true;
  });
  $$("[data-todas]").forEach((b) => b.addEventListener("click", () => r.tags.forEach((_, i) => alternar(i, b.dataset.todas === "1"))));

  const abre = $(".problema-abre");
  const painel = $(".problema-painel");
  const alternarProblema = () => {
    r.problema.flag = !r.problema.flag;
    abre.setAttribute("aria-expanded", r.problema.flag);
    painel.hidden = !r.problema.flag;
    if (r.problema.flag) $("input", painel).focus();
    sujo = true;
  };
  abre.addEventListener("click", alternarProblema);
  $(".obra").addEventListener("input", (e) => { if (e.target.matches("[name=faltantes], [name=comentario], [name=categoria]")) sujo = true; });

  const ler = () => {
    r.tags_faltantes = $("[name=faltantes]").value.split(",").map((s) => s.trim()).filter(Boolean);
    r.problema.categorias = r.problema.flag ? $$("[name=categoria]:checked").map((c) => c.value) : [];
    r.problema.comentario = r.problema.flag ? $("[name=comentario]").value.trim() : "";
  };
  const salvar = async () => {
    ler();
    await st.salvar(r);
    sujo = false;
    aviso(`Obra ${num(n)} salva.`);
  };
  const ir = async (m, salvarAntes = sujo) => {
    if (salvarAntes) await salvar();
    if (m > lote.length) { aviso("Fim do lote."); location.hash = "#/lote?f=pendente"; return; }
    if (m >= 1) location.hash = `#/obra/${m}`;
  };
  $(".salvar").addEventListener("click", () => ir(n + 1, true));
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => ir(Number(b.dataset.ir))));
  $(".obra-imagem").addEventListener("click", () => ampliar(obra));

  teclas = (e) => {
    const alvo = e.target;
    const digitando = alvo.matches("input[type=text], input[type=search], input[type=number], input[type=password], textarea");
    if (digitando) {
      if (e.key === "Enter" && alvo.name === "faltantes") { e.preventDefault(); ir(n + 1, true); }
      if (e.key === "Escape") alvo.blur();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey || $(".zoom").open) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); alternar(e.key === "0" ? 9 : Number(e.key) - 1); }
    else if (e.key === "p" || e.key === "P") { e.preventDefault(); alternarProblema(); }
    else if (e.key === "z" || e.key === "Z") { e.preventDefault(); ampliar(obra); }
    else if (e.key === "ArrowRight") { e.preventDefault(); ir(n + 1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); ir(n - 1); }
    else if (e.key === "Enter" && !alvo.matches("button, a")) { e.preventDefault(); ir(n + 1, true); }
  };
}

/* --------------------------------------------------------------- zoom */
function ampliar(obra) {
  const d = $(".zoom");
  const img = $("img", d);
  img.src = `img/g/${obra.id}.jpg`;
  img.alt = `${obra.titulo}, de ${obra.artista}`;
  img.classList.remove("perto");
  d.showModal();
}
function ligarZoom() {
  const d = $(".zoom");
  const img = $("img", d);
  $(".zoom-fechar").addEventListener("click", () => d.close());
  d.addEventListener("click", (e) => { if (e.target === d || e.target.classList.contains("zoom-palco")) d.close(); });
  img.addEventListener("click", (e) => {
    const b = img.getBoundingClientRect();
    img.style.transformOrigin = `${((e.clientX - b.left) / b.width) * 100}% ${((e.clientY - b.top) / b.height) * 100}%`;
    img.classList.toggle("perto");
  });
}

/* --------------------------------------------------------------- resultados */
const MIN_TAG = 3;

function barra(valor, rotulo, dica) {
  return `<span class="barra" data-dica="${esc(dica)}" tabindex="0" aria-label="${esc(rotulo)}: ${esc(dica)}">
    <span style="width:${valor == null ? 0 : Math.max(0.5, valor * 100)}%"></span></span>`;
}

function telaResultados() {
  const regs = st.todos();
  const m = calcular(regs);
  const validadores = new Set(regs.map((r) => r.validador));
  const comN = m.tags.filter((t) => t.exibidas >= MIN_TAG);
  const melhores = [...comN].sort((a, b) => b.precisao - a.precisao || b.exibidas - a.exibidas).slice(0, 12);
  const piores = [...comN].sort((a, b) => a.precisao - b.precisao || b.exibidas - a.exibidas).slice(0, 12);
  const nomeCat = Object.fromEntries(CATEGORIAS_PROBLEMA);
  const linkObra = (id) => {
    const i = lote.indexOf(id);
    return i >= 0 ? `<a href="#/obra/${i + 1}">${esc(id)}</a>` : esc(id);
  };
  const linhaTag = (t) => `<tr><th scope="row">${esc(t.tag)}</th><td>${barra(t.precisao, t.tag, `${pct(t.precisao)} · ${t.aceitas}/${t.exibidas}`)}</td><td class="num">${pct(t.precisao)}</td><td class="num n">${t.exibidas}</td></tr>`;

  main.innerHTML = `
    <section class="pagina resultados">
      <header class="cabeca">
        <p class="rotulo">${num(m.registros)} validações · ${num(m.obras)} obras · ${validadores.size} de ${VALIDADORES.length} validadores</p>
        <h1>Resultados</h1>
      </header>

      <div class="fontes">
        <label class="link arquivo">Importar JSON ou CSV<input type="file" accept=".json,.csv" multiple></label>
        ${st.remoto.ativo ? '<button type="button" class="link" data-acao="baixar">Carregar do servidor</button>' : '<span class="tenue">Servidor não configurado</span>'}
        <span class="separa" aria-hidden="true"></span>
        <button type="button" class="link" data-acao="json">Exportar validações JSON</button>
        <button type="button" class="link" data-acao="csv">Exportar validações CSV</button>
        <button type="button" class="link" data-acao="metricas">Exportar métricas CSV</button>
      </div>

      ${!m.registros ? '<p class="vazio">Nenhuma validação ainda. Valide obras ou importe os arquivos dos outros validadores.</p>' : `
      <div class="destaques">
        <div class="destaque principal"><span class="valor">${pct(m.geral.precisao, 1)}</span><span class="o-que">precisão geral</span><span class="det">${num(m.geral.aceitas)} aceitas de ${num(m.geral.exibidas)} exibidas</span></div>
        ${m.pk.map((x) => `<div class="destaque"><span class="valor">${pct(x.valor, 1)}</span><span class="o-que">precision@${x.k}</span><span class="det">${num(x.obras)} obras</span></div>`).join("")}
      </div>

      <div class="duas">
        <section>
          <h2>Por faixa de z</h2>
          <p class="legenda">Se o score é calibrado, a precisão sobe com o z.</p>
          <table class="tabela"><thead><tr><th scope="col">z</th><th scope="col"><span class="visualmente-oculto">barra</span></th><th scope="col" class="num">precisão</th><th scope="col" class="num">tags</th></tr></thead><tbody>
          ${m.faixas.map((f) => { const r = `${dec(f.de, 1)}–${f.ate === Infinity ? "" : dec(f.ate, 1)}`; return `<tr><th scope="row">${r}</th><td>${barra(f.precisao, `z ${r}`, `${pct(f.precisao)} · ${f.aceitas}/${f.exibidas}`)}</td><td class="num">${pct(f.precisao)}</td><td class="num n">${num(f.exibidas)}</td></tr>`; }).join("")}
          </tbody></table>
        </section>
        <section>
          <h2>Limiar</h2>
          <p class="legenda">Exibindo só as tags com z a partir do limiar.</p>
          <table class="tabela"><thead><tr><th scope="col">z ≥</th><th scope="col" class="num">precisão</th><th scope="col" class="num">tags mantidas</th></tr></thead><tbody>
          ${m.limiares.filter((x) => x.n).map((x) => `<tr><th scope="row">${dec(x.z)}</th><td class="num">${pct(x.precisao, 1)}</td><td class="num">${pct(x.mantidas)} <span class="n">(${num(x.n)})</span></td></tr>`).join("")}
          </tbody></table>
        </section>
      </div>

      <div class="duas">
        <section>
          <h2>Por validador</h2>
          <table class="tabela"><thead><tr><th scope="col">validador</th><th scope="col"><span class="visualmente-oculto">barra</span></th><th scope="col" class="num">precisão</th><th scope="col" class="num">obras</th></tr></thead><tbody>
          ${m.porValidador.map((v) => `<tr><th scope="row">${esc(v.validador)}</th><td>${barra(v.precisao, v.validador, `${pct(v.precisao)} · ${v.aceitas}/${v.exibidas}`)}</td><td class="num">${pct(v.precisao)}</td><td class="num n">${num(v.obras)}</td></tr>`).join("")}
          </tbody></table>
        </section>
        <section>
          <h2>Concordância</h2>
          <p class="legenda">Nas obras vistas por mais de um validador; cada tag de cada obra é um item.</p>
          ${m.concordancia.itens ? `<dl class="numeros">
            <div><dt>par a par</dt><dd>${pct(m.concordancia.parAPar, 1)}</dd></div>
            <div><dt>κ de Fleiss</dt><dd>${dec(m.concordancia.kappa)}</dd></div>
            <div><dt>obras</dt><dd>${num(m.concordancia.obras)}</dd></div>
            <div><dt>itens</dt><dd>${num(m.concordancia.itens)}</dd></div>
          </dl>` : '<p class="tenue">Ainda não há obra validada por dois validadores.</p>'}
        </section>
      </div>

      <div class="duas">
        <section>
          <h2>Tags mais certas</h2>
          <p class="legenda">Com ${MIN_TAG} ou mais exibições.</p>
          ${melhores.length ? `<table class="tabela"><tbody>${melhores.map(linhaTag).join("")}</tbody></table>` : '<p class="tenue">Poucas validações ainda.</p>'}
        </section>
        <section>
          <h2>Tags mais erradas</h2>
          <p class="legenda">Com ${MIN_TAG} ou mais exibições.</p>
          ${piores.length ? `<table class="tabela"><tbody>${piores.map(linhaTag).join("")}</tbody></table>` : '<p class="tenue">Poucas validações ainda.</p>'}
        </section>
      </div>

      <section>
        <h2>Problemas</h2>
        <dl class="numeros">
          ${Object.entries(m.problemas).map(([c, l]) => `<div><dt>${esc(nomeCat[c] ?? c)}</dt><dd>${l.length}</dd></div>`).join("")}
          <div><dt>Tags problemáticas</dt><dd>${m.tagsProblematicas.length}</dd></div>
        </dl>
        ${Object.values(m.problemas).some((l) => l.length) || m.tagsProblematicas.length ? `
        <table class="tabela lista-problemas"><thead><tr><th scope="col">obra</th><th scope="col">validador</th><th scope="col">problema</th><th scope="col">comentário</th></tr></thead><tbody>
          ${Object.entries(m.problemas).flatMap(([c, l]) => l.map((x) => `<tr><td>${linkObra(x.id_obra)}</td><td>${esc(x.validador)}</td><td>${esc(nomeCat[c] ?? c)}</td><td>${esc(x.comentario)}</td></tr>`)).join("")}
          ${m.tagsProblematicas.map((x) => `<tr><td>${linkObra(x.id_obra)}</td><td>${esc(x.validador)}</td><td>Tag problemática</td><td>${esc(x.tag)}</td></tr>`).join("")}
        </tbody></table>` : ""}
      </section>`}
    </section>`;

  $(".fontes input[type=file]").addEventListener("change", async (e) => {
    let total = 0;
    for (const f of e.target.files) {
      try { total += await st.importar(f); } catch (err) { aviso(`Não consegui ler ${f.name}.`); console.error(err); return; }
    }
    aviso(`${total} validações importadas.`);
    render();
  });
  $(".fontes").addEventListener("click", async (e) => {
    const a = e.target.closest("[data-acao]")?.dataset.acao;
    const dia = new Date().toISOString().slice(0, 10);
    if (a === "json") st.baixar(`validacoes-${dia}.json`, st.paraJSON(), "application/json");
    if (a === "csv") st.baixar(`validacoes-${dia}.csv`, st.paraCSV(), "text/csv");
    if (a === "metricas") st.baixar(`metricas-${dia}.csv`, metricasCSV(m), "text/csv");
    if (a === "baixar") {
      try { aviso(`${await st.baixarDoServidor()} validações novas do servidor.`); render(); }
      catch (err) { aviso("O servidor não respondeu."); console.error(err); }
    }
  });
  teclas = null;
}

/* --------------------------------------------------------------- rotas */
function render() {
  const [rota, q] = location.hash.slice(1).split("?");
  const partes = rota.split("/").filter(Boolean);
  const params = new URLSearchParams(q);
  if (!usuario) { atualizarTopo(); telaEntrar(); return; }
  const aba = partes[0] ?? "lote";
  if (aba === "obra") telaObra(Number(partes[1]) || 0);
  else if (aba === "resultados") telaResultados();
  else telaLote(params);
  atualizarTopo(aba === "obra" || aba === "resultados" ? aba : "lote");
}

async function iniciar() {
  try {
    await carregar();
  } catch (e) {
    main.innerHTML = `<p class="vazio pagina">Não consegui carregar os dados (dados/obras.json, atribuicao.json). Abra a página por um servidor, não pelo arquivo.</p>`;
    return;
  }
  iniciarSessao();
  ligarZoom();
  $("[data-acao=sair]").addEventListener("click", () => {
    st.sessao.sair();
    iniciarSessao();
    location.hash = "#/entrar";
    render();
  });
  addEventListener("keydown", (e) => teclas?.(e));
  addEventListener("hashchange", () => { render(); scrollTo(0, 0); });
  st.aoMudar(() => usuario && atualizarTopo(document.querySelector(".abas [aria-current]")?.dataset.aba));
  render();
}

iniciar();
