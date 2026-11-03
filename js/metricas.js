/**
 * metricas.js: a precisão do modelo a partir das validações.
 *
 * Precisão = tags aceitas / tags exibidas. O score é o z do modelo (desvios
 * acima do acervo naquela palavra), não uma probabilidade: a calibração é lida
 * por faixa de z e pela precisão acumulada a partir de cada limiar.
 */
import { FAIXAS_Z, CATEGORIAS_PROBLEMA, VALIDADORES } from "./config.js";

const razao = (a, n) => (n ? a / n : null);

function conta() { return { aceitas: 0, exibidas: 0 }; }
function soma(c, t) { c.exibidas++; if (t.aceita) c.aceitas++; }

export function calcular(registros) {
  const regs = registros.filter((r) => r.tags?.length);
  const geral = conta();
  const porValidador = Object.fromEntries(VALIDADORES.map((v) => [v, { ...conta(), obras: 0 }]));
  const porTag = new Map();
  const faixas = FAIXAS_Z.slice(0, -1).map((de, i) => ({ de, ate: FAIXAS_Z[i + 1], ...conta() }));
  faixas.push({ de: FAIXAS_Z.at(-1), ate: Infinity, ...conta() });
  const todasTags = [];

  for (const r of regs) {
    porValidador[r.validador] ??= { ...conta(), obras: 0 };
    porValidador[r.validador].obras++;
    for (const t of r.tags) {
      soma(geral, t);
      soma(porValidador[r.validador], t);
      if (!porTag.has(t.tag)) porTag.set(t.tag, { tag: t.tag, ...conta(), problematicas: 0 });
      const pt = porTag.get(t.tag);
      soma(pt, t);
      if (t.problematica) pt.problematicas++;
      const f = faixas.find((f) => t.score >= f.de && t.score < f.ate);
      if (f) soma(f, t);
      todasTags.push(t);
    }
  }

  /* limiar: só as tags com z >= t; quanto sobra e quão certas são */
  const limiares = [];
  for (let z = 1.5; z <= 5.001; z += 0.25) {
    const c = conta();
    for (const t of todasTags) if (t.score >= z - 1e-9) soma(c, t);
    limiares.push({ z: Number(z.toFixed(2)), precisao: razao(c.aceitas, c.exibidas), mantidas: razao(c.exibidas, todasTags.length), n: c.exibidas });
  }

  /* precision@k: as k tags de maior score de cada obra */
  const pk = [1, 3, 5].map((k) => {
    const valores = regs.map((r) => {
      const top = [...r.tags].sort((a, b) => b.score - a.score).slice(0, k);
      return top.filter((t) => t.aceita).length / top.length;
    });
    return { k, valor: razao(valores.reduce((a, b) => a + b, 0), valores.length), obras: valores.length };
  });

  /* problemas */
  const problemas = Object.fromEntries(CATEGORIAS_PROBLEMA.map(([id]) => [id, []]));
  const tagsProblematicas = [];
  for (const r of regs) {
    if (r.problema?.flag) for (const c of r.problema.categorias.length ? r.problema.categorias : ["outro"]) {
      (problemas[c] ??= []).push({ id_obra: r.id_obra, validador: r.validador, comentario: r.problema.comentario });
    }
    for (const t of r.tags) if (t.problematica) tagsProblematicas.push({ id_obra: r.id_obra, validador: r.validador, tag: t.tag });
  }

  const tags = [...porTag.values()].map((t) => ({ ...t, precisao: razao(t.aceitas, t.exibidas) }));

  return {
    obras: new Set(regs.map((r) => r.id_obra)).size,
    registros: regs.length,
    geral: { ...geral, precisao: razao(geral.aceitas, geral.exibidas) },
    porValidador: Object.entries(porValidador).map(([v, c]) => ({ validador: v, ...c, precisao: razao(c.aceitas, c.exibidas) })),
    faixas: faixas.map((f) => ({ ...f, precisao: razao(f.aceitas, f.exibidas) })),
    limiares,
    pk,
    tags,
    problemas,
    tagsProblematicas,
    concordancia: concordancia(regs),
  };
}

/**
 * Concordância nas obras vistas por mais de um validador: cada (obra, tag) é
 * um item, e a decisão é aceitar ou não. Dá a concordância par a par e o kappa
 * de Fleiss nos itens com o mesmo número de avaliadores (o mais comum).
 */
function concordancia(regs) {
  const porObra = new Map();
  for (const r of regs) {
    if (!porObra.has(r.id_obra)) porObra.set(r.id_obra, []);
    porObra.get(r.id_obra).push(r);
  }
  const itens = [];
  for (const [id, lista] of porObra) {
    if (lista.length < 2) continue;
    const tags = new Map();
    for (const r of lista) for (const t of r.tags) {
      if (!tags.has(t.tag)) tags.set(t.tag, []);
      tags.get(t.tag).push(t.aceita);
    }
    for (const [tag, votos] of tags) if (votos.length >= 2) itens.push({ id, tag, votos });
  }
  if (!itens.length) return { obras: 0, itens: 0, parAPar: null, kappa: null, avaliadores: 0 };

  let pares = 0, iguais = 0;
  for (const { votos } of itens) {
    for (let i = 0; i < votos.length; i++) for (let j = i + 1; j < votos.length; j++) {
      pares++;
      if (votos[i] === votos[j]) iguais++;
    }
  }

  const freq = new Map();
  for (const it of itens) freq.set(it.votos.length, (freq.get(it.votos.length) ?? 0) + 1);
  const n = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const usados = itens.filter((it) => it.votos.length === n);
  let pBarra = 0, sim = 0;
  for (const { votos } of usados) {
    const s = votos.filter(Boolean).length, nao = n - s;
    pBarra += (s * (s - 1) + nao * (nao - 1)) / (n * (n - 1));
    sim += s;
  }
  pBarra /= usados.length;
  const pS = sim / (usados.length * n);
  const pE = pS ** 2 + (1 - pS) ** 2;
  const kappa = pE === 1 ? null : (pBarra - pE) / (1 - pE);

  return { obras: new Set(itens.map((i) => i.id)).size, itens: itens.length, parAPar: iguais / pares, kappa, avaliadores: n };
}

/** as métricas em CSV: métrica, grupo, valor, aceitas, exibidas */
export function metricasCSV(m) {
  const l = [["metrica", "grupo", "valor", "aceitas", "exibidas"]];
  const f = (v) => (v == null ? "" : v.toFixed(4));
  l.push(["precisao", "geral", f(m.geral.precisao), m.geral.aceitas, m.geral.exibidas]);
  for (const v of m.porValidador) l.push(["precisao_validador", v.validador, f(v.precisao), v.aceitas, v.exibidas]);
  for (const x of m.faixas) l.push(["precisao_faixa_z", `${x.de}-${x.ate === Infinity ? "" : x.ate}`, f(x.precisao), x.aceitas, x.exibidas]);
  for (const x of m.limiares) l.push(["precisao_z_minimo", x.z, f(x.precisao), "", x.n]);
  for (const x of m.pk) l.push([`precision_at_${x.k}`, "geral", f(x.valor), "", x.obras]);
  for (const t of [...m.tags].sort((a, b) => b.exibidas - a.exibidas)) l.push(["precisao_tag", t.tag, f(t.precisao), t.aceitas, t.exibidas]);
  l.push(["concordancia_par_a_par", `${m.concordancia.itens} itens`, f(m.concordancia.parAPar), "", ""]);
  l.push(["kappa_fleiss", `${m.concordancia.avaliadores} avaliadores`, f(m.concordancia.kappa), "", ""]);
  for (const [c, lista] of Object.entries(m.problemas)) l.push(["obras_sinalizadas", c, lista.length, "", ""]);
  l.push(["tags_problematicas", "total", m.tagsProblematicas.length, "", ""]);
  return l.map((r) => r.map((v) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : v)).join(",")).join("\n");
}
