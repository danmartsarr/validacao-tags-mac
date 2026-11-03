/**
 * storage.js: onde as validações moram.
 *
 * 1. localStorage: sempre ativo, é o cache e o modo offline.
 * 2. Exportar/importar JSON e CSV: sempre disponível.
 * 3. Supabase: quando configurado em config.js; cada gravação entra numa fila
 *    local e é enviada assim que der (a fila sobrevive a recarregar a página).
 *
 * Registro: { id_obra, validador, timestamp, criado_em,
 *             tags: [{ tag, score, percentil, posicao, aceita, problematica }],
 *             tags_faltantes: [], problema: { flag, categorias, comentario } }
 * A chave é (id_obra, validador): revalidar sobrescreve, e `timestamp` é a
 * última edição (`criado_em` guarda a primeira).
 */
import { SUPABASE } from "./config.js";

const K_REGISTROS = "validacao:registros";
const K_FILA = "validacao:fila";
const K_SESSAO = "validacao:sessao";

const chave = (r) => `${r.id_obra}|${r.validador}`;
const ler = (k, padrao) => {
  try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; }
};
const gravar = (k, v) => localStorage.setItem(k, JSON.stringify(v));

let registros = ler(K_REGISTROS, {});
const ouvintes = new Set();
const avisar = () => ouvintes.forEach((f) => f());

/* ---------------------------------------------------------------- sessão */
export const sessao = {
  atual: () => ler(K_SESSAO, null),
  entrar: (validador) => gravar(K_SESSAO, { validador, desde: new Date().toISOString() }),
  sair: () => localStorage.removeItem(K_SESSAO),
};

/* ---------------------------------------------------------------- local */
export function aoMudar(f) { ouvintes.add(f); }

export function registro(id_obra, validador) {
  return registros[`${id_obra}|${validador}`] ?? null;
}

export function todos() {
  return Object.values(registros);
}

/** junta registros, ficando com a edição mais recente de cada (obra, validador) */
function mesclar(lista) {
  let novos = 0;
  for (const r of lista) {
    if (!r?.id_obra || !r?.validador) continue;
    const k = chave(r);
    const atual = registros[k];
    if (!atual || Date.parse(r.timestamp ?? 0) > Date.parse(atual.timestamp ?? 0)) {
      registros[k] = r;
      novos++;
    }
  }
  gravar(K_REGISTROS, registros);
  return novos;
}

export async function salvar(r) {
  const anterior = registro(r.id_obra, r.validador);
  const agora = new Date().toISOString();
  const final = { ...r, timestamp: agora, criado_em: anterior?.criado_em ?? agora };
  registros[chave(final)] = final;
  gravar(K_REGISTROS, registros);
  const fila = ler(K_FILA, []);
  if (!fila.includes(chave(final))) fila.push(chave(final));
  gravar(K_FILA, fila);
  avisar();
  enviarFila();
  return final;
}

/* ---------------------------------------------------------------- exportar / importar */
const COLUNAS = ["id_obra", "validador", "timestamp", "criado_em", "posicao", "tag", "score", "percentil",
  "aceita", "problematica", "tags_faltantes", "problema_flag", "problema_categorias", "problema_comentario"];

const celula = (v) => {
  const s = v == null ? "" : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function paraJSON(lista = todos()) {
  return JSON.stringify(lista, null, 1);
}

/** uma linha por tag exibida; os campos da obra se repetem */
export function paraCSV(lista = todos()) {
  const linhas = [COLUNAS.join(",")];
  for (const r of lista) {
    for (const t of r.tags) {
      linhas.push([
        r.id_obra, r.validador, r.timestamp, r.criado_em, t.posicao, t.tag, t.score, t.percentil,
        t.aceita, t.problematica, r.tags_faltantes.join("; "), r.problema.flag,
        r.problema.categorias.join("; "), r.problema.comentario,
      ].map(celula).join(","));
    }
  }
  return linhas.join("\n");
}

function lerCSV(texto) {
  const linhas = [];
  let campo = "", linha = [], aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      linha.push(campo); linhas.push(linha); linha = []; campo = "";
    } else campo += c;
  }
  if (campo || linha.length) { linha.push(campo); linhas.push(linha); }
  const [cab, ...resto] = linhas.filter((l) => l.length > 1);
  const lista = (s) => (s ? s.split(";").map((x) => x.trim()).filter(Boolean) : []);
  const porChave = new Map();
  for (const l of resto) {
    const o = Object.fromEntries(cab.map((c, i) => [c, l[i]]));
    const k = `${o.id_obra}|${o.validador}`;
    if (!porChave.has(k)) {
      porChave.set(k, {
        id_obra: o.id_obra, validador: o.validador, timestamp: o.timestamp, criado_em: o.criado_em,
        tags: [], tags_faltantes: lista(o.tags_faltantes),
        problema: { flag: o.problema_flag === "true", categorias: lista(o.problema_categorias), comentario: o.problema_comentario ?? "" },
      });
    }
    porChave.get(k).tags.push({
      tag: o.tag, score: Number(o.score), percentil: Number(o.percentil), posicao: Number(o.posicao),
      aceita: o.aceita === "true", problematica: o.problematica === "true",
    });
  }
  return [...porChave.values()];
}

/** lê um .json ou .csv exportado (de qualquer validador) e junta ao local */
export async function importar(arquivo) {
  const texto = await arquivo.text();
  const lista = arquivo.name.toLowerCase().endsWith(".csv") ? lerCSV(texto) : JSON.parse(texto);
  const n = mesclar(Array.isArray(lista) ? lista : Object.values(lista));
  avisar();
  return n;
}

export function baixar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------------------------------------------------------- remoto (Supabase) */
export const remoto = {
  ativo: Boolean(SUPABASE.url && SUPABASE.chave),
  estado: "desligado", // desligado | enviando | em dia | pendente | erro
  pendentes: () => ler(K_FILA, []).length,
};

const cabecalhos = () => ({
  apikey: SUPABASE.chave,
  Authorization: `Bearer ${SUPABASE.chave}`,
  "Content-Type": "application/json",
});

let enviando = false;
export async function enviarFila() {
  if (!remoto.ativo || enviando) return;
  const fila = ler(K_FILA, []);
  if (!fila.length) { remoto.estado = "em dia"; avisar(); return; }
  enviando = true;
  remoto.estado = "enviando";
  avisar();
  try {
    const lote = fila.map((k) => registros[k]).filter(Boolean);
    const r = await fetch(`${SUPABASE.url}/rest/v1/${SUPABASE.tabela}?on_conflict=id_obra,validador`, {
      method: "POST",
      headers: { ...cabecalhos(), Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(lote),
    });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    // só tira da fila o que foi enviado; o que entrou durante o envio fica
    const enviadoEm = new Map(lote.map((x) => [chave(x), x.timestamp]));
    gravar(K_FILA, ler(K_FILA, []).filter((k) => registros[k] && registros[k].timestamp !== enviadoEm.get(k)));
    remoto.estado = remoto.pendentes() ? "pendente" : "em dia";
  } catch (e) {
    console.warn("[validacao] envio falhou", e);
    remoto.estado = "erro";
  } finally {
    enviando = false;
    avisar();
  }
}

/** traz as validações de todos os validadores do servidor e junta ao local */
export async function baixarDoServidor() {
  if (!remoto.ativo) return 0;
  const lista = [];
  for (let de = 0; ; de += 1000) {
    const r = await fetch(`${SUPABASE.url}/rest/v1/${SUPABASE.tabela}?select=*&order=id_obra&limit=1000&offset=${de}`,
      { headers: cabecalhos() });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const parte = await r.json();
    lista.push(...parte);
    if (parte.length < 1000) break;
  }
  const n = mesclar(lista);
  avisar();
  return n;
}

if (remoto.ativo) {
  remoto.estado = remoto.pendentes() ? "pendente" : "em dia";
  addEventListener("online", enviarFila);
  setTimeout(enviarFila, 500);
}
