/**
 * Configuração da validação.
 *
 * ATENÇÃO: o login não é segurança. A senha fica aqui, no código que o
 * navegador baixa, e qualquer pessoa pode lê-la. Ela só serve para cada
 * validador se identificar e não gravar no nome de outro.
 */
export const VALIDADORES = ["Daniel", "Pedro", "Francisco", "Marlon"];
export const SENHA = "12345678";

/**
 * Backend remoto (Supabase). Com `url` vazio, a página funciona só com o
 * navegador e com exportar/importar. Veja o README para criar a tabela.
 * A chave é a "anon public" do projeto; ela também fica visível no cliente.
 */
export const SUPABASE = {
  url: "",
  chave: "",
  tabela: "validacoes",
};

export const CATEGORIAS_PROBLEMA = [
  ["ofensiva", "Tag ofensiva ou estereotipada"],
  ["sensivel", "Conteúdo sensível"],
  ["imagem", "Imagem errada ou quebrada"],
  ["metadado", "Metadado incorreto"],
  ["outro", "Outro"],
];

/** faixas do z para a calibração: [início, fim) */
export const FAIXAS_Z = [1.5, 2, 2.5, 3, 3.5, 4, 5];

/** tamanho de página da grade do lote */
export const POR_PAGINA = 120;
