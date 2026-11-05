/** A senha não é segurança: qualquer um a lê no código. */
export const VALIDADORES = ["Daniel", "Pedro", "Francisco", "Marlon"];
export const SENHA = "12345678";

/** Supabase; com `url` vazio a página fica só no navegador. */
export const SUPABASE = {
  url: "https://sjlxfjwkeipgivunokgd.supabase.co",
  chave: "sb_publishable_lgwWEhkxKbugvhLIEAlzTg_rThM5K2c",
  tabela: "validacoes",
};

export const CATEGORIAS_PROBLEMA = [
  ["ofensiva", "Tag ofensiva ou estereotipada"],
  ["sensivel", "Conteúdo sensível"],
  ["imagem", "Imagem errada ou quebrada"],
  ["metadado", "Metadado incorreto"],
  ["outro", "Outro"],
];

/** Faixas de z da calibração. */
export const FAIXAS_Z = [1.5, 2, 2.5, 3, 3.5, 4, 5];

export const POR_PAGINA = 120;
