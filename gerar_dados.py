#!/usr/bin/env python3
"""Gera dados/, img/ e atribuicao.json a partir das saídas do modelo."""
import argparse
import csv
import hashlib
import json
import shutil
from pathlib import Path

AQUI = Path(__file__).resolve().parent
VALIDADORES = ["Daniel", "Pedro", "Francisco", "Marlon"]
SEMENTE = "mac-validacao-2026"
COMUNS = 50  # obras repetidas nos quatro lotes, para medir a concordância


def chave(texto):
    """Ordem determinística a partir do texto."""
    return hashlib.sha256(f"{SEMENTE}:{texto}".encode()).hexdigest()


def atribuir(ids, comuns):
    ordem = sorted(ids, key=chave)
    atrib = {i: list(VALIDADORES) for i in ordem[:comuns]}
    for n, i in enumerate(ordem[comuns:]):
        atrib[i] = [VALIDADORES[n % len(VALIDADORES)]]
    return {k: atrib[k] for k in sorted(atrib, key=int)}


def reduzir(origem, destino, lado):
    from PIL import Image

    if destino.exists():
        return
    with Image.open(origem) as im:
        if im.format == "JPEG" and max(im.size) <= lado:
            destino.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(origem, destino)
            return
        im = im.convert("RGB")
        im.thumbnail((lado, lado), Image.LANCZOS)
        destino.parent.mkdir(parents=True, exist_ok=True)
        im.save(destino, "JPEG", quality=82 if lado > 500 else 78, optimize=True, progressive=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mockup", type=Path, default=AQUI.parent / "mockup")
    ap.add_argument("--amostra", type=int, default=0, help="só N obras (preview)")
    ap.add_argument("--sem-imagens", action="store_true")
    ap.add_argument("--refazer-atribuicao", action="store_true")
    a = ap.parse_args()

    termos = json.loads((a.mockup / "dinov3/termos_obras.json").read_text(encoding="utf-8"))
    coleta = a.mockup / "testes/scrapper/saida"
    fichas = {r["id"]: r for r in csv.DictReader(open(coleta / "obras.csv", encoding="utf-8"))}

    obras = [o for o in termos["obras"] if o["termos"]]
    sem_tag = len(termos["obras"]) - len(obras)
    if a.amostra:
        obras = sorted(obras, key=lambda o: chave(o["id"]))[: a.amostra]
        obras.sort(key=lambda o: int(o["id"]))

    saida = []
    for o in obras:
        f = fichas[o["id"]]
        tags = sorted(o["termos"], key=lambda t: -t[1])
        saida.append({
            "id": o["id"], "tombo": o["tombo"],
            "titulo": f["titulo"], "artista": f["artista"], "data": f["data"], "tecnica": f["tecnica"],
            "tags": [[i, z, p] for i, z, p in tags],
        })

    usados = sorted({t[0] for o in saida for t in o["tags"]})
    novo = {v: n for n, v in enumerate(usados)}
    for o in saida:
        o["tags"] = [[novo[i], z, p] for i, z, p in o["tags"]]
    # Correções das traduções automáticas (en -> pt).
    correcoes = json.loads((AQUI / "traducoes_pt.json").read_text(encoding="utf-8"))
    vocab = [{"pt": correcoes.get(termos["termos"][i]["en"], termos["termos"][i]["pt"]),
              "en": termos["termos"][i]["en"], "fonte": termos["termos"][i]["fonte"]} for i in usados]

    dados = {
        "meta": {
            "modelo": termos["meta"]["modelo"],
            "score": "z: desvios-padrão acima do acervo naquela palavra (não é probabilidade); "
                     "percentil: fração do acervo abaixo da obra",
            "obras": len(saida), "sem_tag": sem_tag, "amostra": bool(a.amostra),
        },
        "termos": vocab,
        "obras": saida,
    }
    (AQUI / "dados").mkdir(exist_ok=True)
    (AQUI / "dados/obras.json").write_text(json.dumps(dados, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    destino = AQUI / "atribuicao.json"
    ids = [o["id"] for o in saida]
    if a.refazer_atribuicao or not destino.exists() or a.amostra:
        comuns = 4 if a.amostra else COMUNS
        atrib = atribuir(ids, comuns)
        linhas = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in atrib.items())
        destino.write_text(
            '{\n "_leia": "obra -> validadores. Editável à mão. Obras com os quatro nomes são as de '
            'concordância. A ordem dentro do lote é fixa (hash de validador + obra).",\n'
            f' "validadores": {json.dumps(VALIDADORES, ensure_ascii=False)},\n'
            f' "obras": {{\n{linhas}\n }}\n}}\n', encoding="utf-8")
    else:
        atrib = json.loads(destino.read_text(encoding="utf-8"))["obras"]
        faltam = [i for i in ids if i not in atrib]
        if faltam:
            print(f"aviso: {len(faltam)} obras sem validador em atribuicao.json")

    if not a.sem_imagens:
        for n, o in enumerate(saida, 1):
            origem = coleta / "imagens" / fichas[o["id"]]["arquivo"]
            reduzir(origem, AQUI / "img/g" / f"{o['id']}.jpg", 1200)
            reduzir(origem, AQUI / "img/p" / f"{o['id']}.jpg", 360)
            if n % 200 == 0:
                print(f"  imagens {n}/{len(saida)}", flush=True)

    por = {v: sum(v in l for l in atrib.values()) for v in VALIDADORES}
    print(f"{len(saida)} obras, {len(vocab)} palavras, {sem_tag} sem tag (fora)")
    print("lotes:", ", ".join(f"{v} {n}" for v, n in por.items()),
          f"| comuns: {sum(len(l) == 4 for l in atrib.values())}")


if __name__ == "__main__":
    main()
