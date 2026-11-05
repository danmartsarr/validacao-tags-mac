/** Telas de entrada, lote e obra. */
import { VALIDADORES, SENHA, CATEGORIAS_PROBLEMA, POR_PAGINA } from "./config.js";
import * as st from "./storage.js";

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const num = (n) => Number(n).toLocaleString("pt-BR");
/** Porcentagem, com "<1%" no lugar de um 0% enganoso. */
const pct = (f, total) => { const v = total ? (f / total) * 100 : 0; return v > 0 && v < 1 ? "<1%" : `${Math.round(v)}%`; };
const dec = (v, casas = 2) => (v == null ? "—" : v.toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }));
const main = $("#principal");

/** Tempo relativo, como "há 5 min". */
function quando(iso) {
  const min = (Date.now() - Date.parse(iso)) / 60000;
  if (!(min >= 0)) return "";
  if (min < 1.5) return "agora";
  if (min < 60) return `há ${Math.round(min)} min`;
  if (min < 24 * 60) return `há ${Math.round(min / 60)} h`;
  const dias = Math.floor(min / (24 * 60));
  if (dias === 1) return "ontem";
  if (dias < 7) return `há ${dias} dias`;
  return `em ${new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}`;
}
const doValidador = (v) => st.todos().filter((r) => r.validador === v);
const ultimaDe = (v) => doValidador(v).reduce((m, r) => (r.timestamp > m ? r.timestamp : m), "");
const hojeDe = (v) => { const h = new Date().toDateString(); return doValidador(v).filter((r) => new Date(r.timestamp).toDateString() === h).length; };
const K_ULTIMO = "validacao:ultimo";
const digitando = (el) => el.matches?.("input[type=text], input[type=search], input[type=number], input[type=password], textarea");

const SINCRONIA_MS = 3 * 60 * 1000;

let DADOS, ATRIB, porId, porTombo, usuario, lote = [], teclas = null, abaAtual = null;
/** Salva a obra aberta antes de sair dela. */
let aoSair = null;

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

/** Hash FNV-1a, para o lote ter a mesma ordem em todo navegador. */
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
const feitas = () => lote.filter((id) => st.registro(id, usuario)).length;

let avisoTempo;
function aviso(texto) {
  const el = $(".aviso");
  el.textContent = texto;
  el.classList.add("visivel");
  clearTimeout(avisoTempo);
  avisoTempo = setTimeout(() => el.classList.remove("visivel"), 2600);
}

function textoSincronia() {
  const s = st.remoto;
  const fila = s.pendentes();
  if (!s.ativo) return ["local", "Só neste navegador"];
  if (s.estado === "sincronizando") return ["sincronizando", "Sincronizando…"];
  if (s.estado === "enviando") return ["enviando", "Enviando…"];
  if (s.estado === "erro") return ["erro", navigator.onLine ? `Servidor fora · ${fila} na fila` : `Offline · ${fila} na fila`];
  if (fila) return ["pendente", `${fila} na fila`];
  return ["em-dia", "Sincronizado"];
}

async function sincronizar({ silencioso = true } = {}) {
  if (!usuario || !st.remoto.ativo) return;
  const n = await st.sincronizar();
  if (!usuario) return;
  if (abaAtual === "lote" && n) render();
  if (!silencioso) aviso(st.remoto.estado === "erro" ? "O servidor não respondeu." : n ? `${num(n)} validações novas do servidor.` : "Tudo sincronizado.");
}

function atualizarTopo() {
  const topo = $(".topo");
  topo.hidden = !usuario;
  document.body.classList.toggle("com-topo", !!usuario);
  if (!usuario) return;
  $(".usuario", topo).textContent = usuario;
  $$(".abas a", topo).forEach((a) => a.toggleAttribute("aria-current", a.dataset.aba === abaAtual));
  const f = feitas();
  const barra = $(".progresso", topo);
  barra.setAttribute("aria-valuemax", lote.length);
  barra.setAttribute("aria-valuenow", f);
  barra.setAttribute("aria-valuetext", `${num(f)} de ${num(lote.length)}`);
  $(".progresso-barra", topo).style.width = `${lote.length ? (f / lote.length) * 100 : 0}%`;
  $(".placar-feitas", topo).textContent = num(f);
  $(".placar-total", topo).textContent = num(lote.length);
  const [cod, texto] = textoSincronia();
  const sinc = $(".sincronia", topo);
  sinc.dataset.estado = cod;
  $(".sinc-texto", sinc).textContent = texto;
  sinc.title = st.remoto.ultima ? `Última sincronização: ${st.remoto.ultima.toLocaleTimeString("pt-BR")}` : "";
}

const SETA_DIR = `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;
const BANDEIRA = `<svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true"><path d="M3.5 14.5V2M3.5 2.5h8.5l-2 3 2 3H3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;

/** Etiqueta de museu da obra. */
const etiqueta = (o) => `<b>${esc(o.artista)}</b><span><i>${esc(o.titulo)}</i>${o.data ? `, ${esc(o.data)}` : ""}</span>${o.tecnica ? `<small>${esc(o.tecnica)}</small>` : ""}`;

function telaEntrar() {
  const capaDia = DADOS.obras[fnv(new Date().toDateString()) % DADOS.obras.length];
  const pessoas = VALIDADORES.map((v) => {
    const l = loteDe(v);
    return { v, l, capa: porId.get(l[0]) ?? capaDia };
  });
  const feitasDe = ({ v, l }) => l.filter((id) => st.registro(id, v)).length;
  const resumo = (p) => {
    const f = feitasDe(p);
    const u = ultimaDe(p.v);
    return `${num(f)} de ${num(p.l.length)} obras${u ? `, a última ${quando(u)}` : ""}`;
  };
  const geral = () => {
    const total = pessoas.reduce((t, p) => t + p.l.length, 0);
    const f = pessoas.reduce((t, p) => t + feitasDe(p), 0);
    return `Juntos, vocês já validaram ${num(f)} de ${num(total)}.`;
  };
  main.innerHTML = `
    <section class="entrar">
      <form class="indice" novalidate>
        <header class="indice-topo">
          <span class="marca">Validação</span>
          <span>Tags do acervo do MAC USP</span>
        </header>
        <div class="indice-cabeca">
          <h1>Quem vai validar?</h1>
          <p class="geral">${geral()}</p>
        </div>
        <fieldset class="pessoas">
          <legend class="visualmente-oculto">Escolha seu nome</legend>
          ${pessoas.map((p, i) => `
            <div class="pessoa" data-i="${i}">
              <label class="pessoa-linha">
                <input type="radio" name="validador" value="${p.v}">
                <span class="pessoa-n" aria-hidden="true">${String(i + 1).padStart(2, "0")}</span>
                <span class="pessoa-nome">${p.v}</span>
                <span class="pessoa-resumo" data-resumo="${i}">${resumo(p)}</span>
              </label>
              <div class="pessoa-senha" hidden>
                <label class="visualmente-oculto" for="senha-${i}">Senha de ${p.v}</label>
                <input id="senha-${i}" type="password" name="senha" placeholder="Senha" autocomplete="current-password" disabled>
                <button class="botao" type="submit">Entrar <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M2 8h11M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8"/></svg></button>
              </div>
            </div>`).join("")}
        </fieldset>
        <p class="erro" aria-live="assertive"></p>
      </form>
      <figure class="vitrine">
        <img src="img/g/${capaDia.id}.jpg" alt="">
        <figcaption class="etiqueta">${etiqueta(capaDia)}</figcaption>
      </figure>
    </section>`;

  const form = $(".indice");
  const img = $(".vitrine img");
  const leg = $(".vitrine .etiqueta");
  let mostrando = capaDia.id;
  const mostrar = (o) => {
    if (o.id === mostrando) return;
    mostrando = o.id;
    img.classList.add("trocando");
    const nova = new Image();
    nova.src = `img/g/${o.id}.jpg`;
    nova.decode().catch(() => {}).then(() => {
      if (mostrando !== o.id) return;
      img.src = nova.src;
      leg.innerHTML = etiqueta(o);
      img.classList.remove("trocando");
    });
  };
  pessoas.forEach((p) => { new Image().src = `img/g/${p.capa.id}.jpg`; });
  const escolhida = () => pessoas.find((p) => p.v === new FormData(form).get("validador"));
  const voltar = () => { const p = escolhida(); mostrar(p ? p.capa : capaDia); };

  $$(".pessoa").forEach((el) => {
    const p = pessoas[el.dataset.i];
    el.addEventListener("pointerenter", () => mostrar(p.capa));
    el.addEventListener("focusin", () => mostrar(p.capa));
  });
  $(".pessoas").addEventListener("pointerleave", voltar);
  form.addEventListener("change", (e) => {
    if (e.target.name !== "validador") return;
    $(".erro").textContent = "";
    $$(".pessoa").forEach((el) => {
      const ativa = $("input[type=radio]", el).checked;
      el.classList.toggle("escolhida", ativa);
      $(".pessoa-senha", el).hidden = !ativa;
      $("input[type=password]", el).disabled = !ativa;
    });
    form.classList.add("tem-escolha");
    $(".pessoa.escolhida input[type=password]").focus();
    voltar();
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const p = escolhida();
    const erro = $(".erro");
    if (!p) { erro.textContent = "Escolha seu nome."; return; }
    const senha = $(".pessoa.escolhida input[type=password]");
    if (senha.value !== SENHA) {
      erro.textContent = "Senha incorreta.";
      senha.select();
      const linha = senha.closest(".pessoa");
      linha.classList.remove("tremer"); void linha.offsetWidth; linha.classList.add("tremer");
      return;
    }
    st.sessao.entrar(p.v);
    localStorage.setItem(K_ULTIMO, p.v);
    iniciarSessao();
    location.hash = "#/lote";
    sincronizar();
  });

  const escolher = (v) => {
    const r = $(`.pessoa input[value="${v}"]`);
    if (!r) return;
    r.checked = true;
    r.dispatchEvent(new Event("change", { bubbles: true }));
  };
  teclas = (e) => {
    if (digitando(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const i = Number(e.key) - 1;
    if (pessoas[i]) { e.preventDefault(); escolher(pessoas[i].v); }
  };
  const ultimo = localStorage.getItem(K_ULTIMO);
  if (pessoas.some((p) => p.v === ultimo)) escolher(ultimo);

  st.sincronizar().then(() => {
    if (usuario) return;
    pessoas.forEach((p, i) => { const el = $(`[data-resumo="${i}"]`); if (el) el.textContent = resumo(p); });
    const g = $(".geral"); if (g) g.textContent = geral();
  });
}

function iniciarSessao() {
  usuario = st.sessao.atual()?.validador ?? null;
  lote = usuario ? loteDe(usuario) : [];
}

/** Aceita nº no lote, ID ou tombo. */
function buscar(q) {
  q = q.trim();
  if (!q) return;
  const o = porId.get(q) ?? porTombo.get(q);
  if (o) {
    const i = lote.indexOf(o.id);
    if (i >= 0) location.hash = `#/obra/${i + 1}`;
    else aviso(`A obra ${o.id} não está no seu lote.`);
    return;
  }
  const n = Number(q);
  if (Number.isInteger(n) && n >= 1 && n <= lote.length) location.hash = `#/obra/${n}`;
  else aviso(`Nada encontrado para “${q}”.`);
}

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
  const f = feitas();
  const proxima = primeiraPendente();

  main.innerHTML = `
    <section class="lote">
      <header class="lote-cabeca">
        <div class="lote-ola">
          <h1>Olá, ${esc(usuario)}</h1>
          <p>${f === lote.length ? "Você validou o lote inteiro. Obrigado!" : proxima ? `A próxima pendente é a <b>nº ${num(proxima)}</b>.` : ""}</p>
        </div>
        <dl class="numeros">
          <div><dt>Hoje</dt><dd>${num(hojeDe(usuario))}</dd></div>
          <div><dt>Validadas</dt><dd>${num(contagem.validada)}</dd></div>
          <div><dt>Sinalizadas</dt><dd>${num(contagem.sinalizada)}</dd></div>
          <div><dt>Faltam</dt><dd>${num(contagem.pendente)}</dd></div>
        </dl>
        ${proxima ? `<a class="botao botao-grande" href="#/obra/${proxima}">${f ? "Continuar validando" : "Começar a validar"} ${SETA_DIR}</a>` : ""}
      </header>
      ${pagina.length ? `<ol class="mosaico">
        ${pagina.map((x) => {
          const o = porId.get(x.id);
          return `<li class="peca e-${x.estado}">
            <a href="#/obra/${x.n}" aria-label="Nº ${x.n}: ${esc(o.titulo)}, ${NOME_ESTADO[x.estado]}">
              <img loading="lazy" src="img/p/${x.id}.jpg" alt="">
              <span class="peca-n" aria-hidden="true">${x.n}</span>
              ${x.estado !== "pendente" ? `<span class="peca-estado" title="${NOME_ESTADO[x.estado]}">${x.estado === "validada" ? "✓" : "!"}</span>` : ""}
              <span class="peca-legenda"><b>${esc(o.titulo)}</b><span>${esc(o.artista)}</span><small>Nº ${x.n}</small></span>
            </a></li>`;
        }).join("")}
      </ol>` : `<p class="vazio">Nenhuma obra ${filtro === "pendente" ? "pendente" : "neste filtro"}.</p>`}
      ${paginas > 1 ? `<nav class="paginas" aria-label="Páginas">
        ${p > 1 ? `<a class="botao botao-escuro" href="${link(filtro, p - 1)}">Anterior</a>` : "<span></span>"}
        <span>Página ${p} de ${paginas}</span>
        ${p < paginas ? `<a class="botao botao-escuro" href="${link(filtro, p + 1)}">Próxima</a>` : "<span></span>"}
      </nav>` : ""}
      <div class="flutuante">
        <form class="busca" role="search">
          <label class="visualmente-oculto" for="busca">Ir para nº, ID ou tombo</label>
          <input id="busca" name="q" type="search" placeholder="Ir para nº, ID ou tombo" autocomplete="off">
          <button type="submit" aria-label="Buscar"><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M11 11l3.5 3.5" stroke="currentColor" stroke-width="1.6"/></svg></button>
        </form>
        <nav class="filtros" aria-label="Filtrar o lote">
          ${FILTROS.map(([fi, nome]) => `<a href="${link(fi, 1)}" ${fi === filtro ? 'aria-current="true"' : ""}>${nome} <span>${num(contagem[fi])}</span></a>`).join("")}
        </nav>
      </div>
    </section>`;
  $(".busca").addEventListener("submit", (e) => { e.preventDefault(); buscar(new FormData(e.target).get("q")); });
  teclas = (e) => {
    if (digitando(e.target)) { if (e.key === "Escape") e.target.blur(); return; }
    if (e.key === "/") { e.preventDefault(); $("#busca").focus(); }
    else if (e.key === "Enter" && proxima && !e.target.matches("a, button, summary")) { e.preventDefault(); location.hash = `#/obra/${proxima}`; }
  };
}

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
  if (!lote.length) { main.innerHTML = `<p class="vazio">Seu lote está vazio.</p>`; return; }
  if (!n) n = primeiraPendente() || 1;
  n = Math.min(lote.length, Math.max(1, n));
  const obra = porId.get(lote[n - 1]);
  const r = rascunho(obra);
  const salvo = st.registro(obra.id, usuario);
  const est = estado(obra.id);
  const termoEn = new Map(DADOS.termos.map((t) => [t.pt, t.en]));
  let sujo = false;

  const vizinhas = [];
  for (let k = Math.max(1, n - 4); k <= Math.min(lote.length, n + 4); k++) vizinhas.push(k);
  const SETA = (d) => `<svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>`;

  main.innerHTML = `
    <article class="obra">
      <section class="palco" aria-label="Imagem">
        <div class="palco-area">
          <button type="button" class="obra-imagem" aria-label="Ampliar a imagem (Z)">
            <img src="img/g/${obra.id}.jpg" alt="${esc(obra.titulo)}, de ${esc(obra.artista)}">
          </button>
          <button type="button" class="palco-seta ant" data-ir="${n - 1}" ${n <= 1 ? "disabled" : ""} aria-label="Obra anterior (←)">${SETA("M10 3L5 8l5 5")}</button>
          <button type="button" class="palco-seta prox" data-ir="${n + 1}" ${n >= lote.length ? "disabled" : ""} aria-label="Próxima obra (→)">${SETA("M6 3l5 5-5 5")}</button>
        </div>
        <nav class="filme" aria-label="Obras vizinhas no lote">
          ${vizinhas.map((k) => {
            const id = lote[k - 1];
            const e = estado(id);
            return `<button type="button" class="filme-item e-${e}" data-ir="${k}" ${k === n ? 'aria-current="true"' : ""}
              aria-label="Nº ${k}, ${NOME_ESTADO[e]}" title="Nº ${k} · ${NOME_ESTADO[e]}">
              <img src="img/p/${id}.jpg" alt="" loading="lazy"><span>${k}</span></button>`;
          }).join("")}
        </nav>
      </section>

      <div class="painel">
        <div class="painel-corpo">
          <p class="posicao">
            <span><b>Nº ${num(n)}</b> de ${num(lote.length)}</span>
            <span class="estado e-${est}">${NOME_ESTADO[est]}${salvo ? ` ${quando(salvo.timestamp)}` : ""}</span>
          </p>
          <header class="rotulo">
            <p class="artista">${esc(obra.artista)}</p>
            <h1 class="titulo">${esc(obra.titulo)}${obra.data ? `<span class="titulo-data">, ${esc(obra.data)}</span>` : ""}</h1>
            ${obra.tecnica ? `<p class="tecnica">${esc(obra.tecnica)}</p>` : ""}
            <p class="ficha">
              <span>Tombo ${esc(obra.tombo)}</span><span>ID ${esc(obra.id)}</span>
            </p>
          </header>

          <section class="tags" aria-labelledby="tags-h">
            <div class="tags-cabeca">
              <h2 id="tags-h">O que aparece na obra?</h2>
              <span class="tags-conta" aria-live="polite"></span>
            </div>
            <p class="dica">Todas começam aceitas: clique ou tecle o número das erradas.</p>
            <ul class="tags-lista">
              ${r.tags.map((t, i) => `
                <li class="tag${t.aceita ? " aceita" : ""}${t.problematica ? " problematica" : ""}">
                  <button type="button" class="tag-chip" data-i="${i}" aria-pressed="${t.aceita}" title="z ${dec(t.score)}">
                    ${i < 10 ? `<span class="tecla" aria-hidden="true">${i < 9 ? i + 1 : 0}</span>` : ""}
                    <span class="tag-nome">${esc(t.tag)}</span>
                    ${termoEn.get(t.tag) && termoEn.get(t.tag) !== t.tag ? `<span class="tag-en" lang="en">${esc(termoEn.get(t.tag))}</span>` : ""}
                  </button>
                  <button type="button" class="tag-problema" data-p="${i}" aria-pressed="${t.problematica}"
                    aria-label="Marcar “${esc(t.tag)}” como ofensiva ou problemática" title="Tag ofensiva ou problemática">${BANDEIRA}</button>
                </li>`).join("")}
            </ul>
            <div class="tags-todas">
              <button type="button" class="link" data-todas="1">Aceitar todas</button>
              <button type="button" class="link" data-todas="0">Descartar todas</button>
            </div>
          </section>

          <label class="campo">Faltou alguma tag?
            <input type="text" name="faltantes" value="${esc(r.tags_faltantes.join(", "))}" placeholder="Escreva separando por vírgula e tecle Enter para salvar" autocomplete="off">
          </label>

          <section class="problema">
            <button type="button" class="problema-abre" aria-expanded="${r.problema.flag}" aria-controls="problema-painel">
              ${BANDEIRA} Há um problema com esta obra
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
        </div>

        <div class="acoes">
          <div class="acoes-linha">
            <form class="ir-n"><label class="visualmente-oculto" for="ir-n">Ir para nº, ID ou tombo</label>
              <input id="ir-n" name="n" type="text" inputmode="numeric" placeholder="Ir para nº" autocomplete="off"></form>
            <button type="button" class="botao salvar">${salvo ? "Atualizar e próxima" : "Salvar e próxima"} <span class="salvar-sujo" hidden>•</span></button>
          </div>
        </div>
      </div>
    </article>`;
  $(".filme [aria-current]")?.scrollIntoView({ block: "nearest", inline: "center" });

  const marcar = () => { sujo = true; $(".salvar-sujo").hidden = false; };
  const contar = () => {
    const a = r.tags.filter((t) => t.aceita).length;
    const d = r.tags.length - a;
    $(".tags-conta").innerHTML = `<b>${a}</b> aceitas${d ? ` · <b>${d}</b> descartada${d > 1 ? "s" : ""}` : ""}`;
  };
  contar();

  const alternar = (i, valor) => {
    if (!r.tags[i]) return;
    r.tags[i].aceita = valor ?? !r.tags[i].aceita;
    const b = $(`.tag-chip[data-i="${i}"]`);
    b.setAttribute("aria-pressed", r.tags[i].aceita);
    b.closest("li").classList.toggle("aceita", r.tags[i].aceita);
    marcar();
    contar();
  };
  $(".tags-lista").addEventListener("click", (e) => {
    const chip = e.target.closest(".tag-chip");
    if (chip) { alternar(Number(chip.dataset.i)); return; }
    const b = e.target.closest("[data-p]");
    if (!b) return;
    const t = r.tags[Number(b.dataset.p)];
    t.problematica = !t.problematica;
    b.setAttribute("aria-pressed", t.problematica);
    b.closest("li").classList.toggle("problematica", t.problematica);
    marcar();
  });
  $$("[data-todas]").forEach((b) => b.addEventListener("click", () => r.tags.forEach((_, i) => alternar(i, b.dataset.todas === "1"))));

  const abre = $(".problema-abre");
  const painel = $(".problema-painel");
  const alternarProblema = () => {
    r.problema.flag = !r.problema.flag;
    abre.setAttribute("aria-expanded", r.problema.flag);
    painel.hidden = !r.problema.flag;
    if (r.problema.flag) $("input", painel).focus();
    marcar();
  };
  abre.addEventListener("click", alternarProblema);
  $(".painel").addEventListener("input", (e) => { if (e.target.matches("[name=faltantes], [name=comentario], [name=categoria]")) marcar(); });

  const ler = () => {
    r.tags_faltantes = $("[name=faltantes]").value.split(",").map((s) => s.trim()).filter(Boolean);
    r.problema.categorias = r.problema.flag ? $$("[name=categoria]:checked").map((c) => c.value) : [];
    r.problema.comentario = r.problema.flag ? $("[name=comentario]").value.trim() : "";
  };
  const salvar = async () => {
    ler();
    await st.salvar(r);
    sujo = false;
    $(".salvar-sujo") && ($(".salvar-sujo").hidden = true);
    aviso(`Nº ${num(n)} salva`);
  };
  aoSair = () => (sujo ? salvar() : null);
  const ir = async (m, salvarAntes = sujo) => {
    if (salvarAntes) await salvar();
    if (m > lote.length) { aviso("Fim do lote"); location.hash = "#/lote?f=pendente"; return; }
    if (m >= 1) location.hash = `#/obra/${m}`;
  };
  $(".salvar").addEventListener("click", () => ir(n + 1, true));
  $$("[data-ir]").forEach((b) => b.addEventListener("click", () => ir(Number(b.dataset.ir))));
  $(".obra-imagem").addEventListener("click", () => ampliar(obra));
  $(".ir-n").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sujo) await salvar();
    buscar(String(new FormData(e.target).get("n")));
  });

  teclas = (e) => {
    const alvo = e.target;
    if (digitando(alvo)) {
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
    else if (e.key === "Enter" && !alvo.matches("button, a, summary")) { e.preventDefault(); ir(n + 1, true); }
  };
}

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

function ligarMenu() {
  const menu = $(".menu");
  document.addEventListener("click", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  $(".menu-painel").addEventListener("click", (e) => {
    const a = e.target.closest("[data-acao]")?.dataset.acao;
    if (!a) return;
    menu.open = false;
    const dia = new Date().toISOString().slice(0, 10);
    if (a === "json") st.baixar(`validacoes-${dia}.json`, st.paraJSON(), "application/json");
    if (a === "csv") st.baixar(`validacoes-${dia}.csv`, st.paraCSV(), "text/csv");
    if (a === "sincronizar") sincronizar({ silencioso: false });
    if (a === "sair") {
      st.sessao.sair();
      iniciarSessao();
      location.hash = "#/entrar";
      render();
    }
  });
}

function render() {
  const [rota, q] = location.hash.slice(1).split("?");
  const partes = rota.split("/").filter(Boolean);
  const params = new URLSearchParams(q);
  aoSair = null;
  if (!usuario) { abaAtual = null; atualizarTopo(); telaEntrar(); return; }
  abaAtual = partes[0] === "obra" ? "obra" : "lote";
  if (abaAtual === "obra") telaObra(Number(partes[1]) || 0);
  else telaLote(params);
  atualizarTopo();
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
  ligarMenu();
  addEventListener("keydown", (e) => {
    teclas?.(e);
  });
  addEventListener("hashchange", async () => {
    $(".menu").open = false;
    const sair = aoSair;
    aoSair = null;
    await sair?.();
    render();
    scrollTo(0, 0);
  });
  addEventListener("pagehide", () => aoSair?.());
  st.aoMudar(() => usuario && atualizarTopo());
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sincronizar(); });
  setInterval(() => { if (document.visibilityState === "visible") sincronizar(); }, SINCRONIA_MS);
  render();
  sincronizar();
}

iniciar();
