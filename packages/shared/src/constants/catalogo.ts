/**
 * Catálogo oficial de frentes, funções, equipamentos e atividades.
 *
 * Fonte: planilhas oficiais VALE/ENGECOM fornecidas pelo cliente. Os códigos,
 * descrições e unidades abaixo são extraídos literalmente dessas planilhas —
 * incluindo a duplicidade do código "2.1.7" (item 7 e item 8 da lista de
 * atividades), que é um erro do próprio documento oficial do cliente e deve
 * ser preservado como está. NÃO altere códigos, descrições ou unidades sem
 * confirmação explícita do cliente.
 *
 * Este módulo é a fonte única de verdade consumida pelo script de seed do
 * banco de dados (packages/server/prisma/seed.ts).
 */

export type FrenteCodigo = "MAB" | "PBA" | "RAMAL";

export type UnidadeMedida = "M" | "M2" | "M3" | "UND" | "HH" | "M3KM";

export interface FrenteCatalogoItem {
  readonly codigo: FrenteCodigo;
  readonly nome: string;
  readonly numeroSap: string;
}

// Número do contrato (planilha "PRODUTIVIDADE ABRIL MAIO JUNHO", célula A3:
// "NÚMERO DO CONTRATO: 5900124486") — um único contrato cobre as 3 frentes.
export const FRENTES: readonly FrenteCatalogoItem[] = [
  { codigo: "MAB", nome: "Marabá", numeroSap: "5900124486" },
  { codigo: "PBA", nome: "Parauapebas", numeroSap: "5900124486" },
  { codigo: "RAMAL", nome: "Ramal", numeroSap: "5900124486" },
] as const;

export interface ColaboradorCatalogoItem {
  readonly matricula: string;
  readonly nome: string;
  readonly funcao: string;
}

/**
 * Amostra real de encarregados (tela de referência do sistema legado).
 * `matricula` é o ID exibido naquela tela.
 */
export const COLABORADORES: readonly ColaboradorCatalogoItem[] = [
  { matricula: "3764", nome: "Alberto Roberto", funcao: "Encarregado" },
  { matricula: "3765", nome: "Ronicleiton Lima", funcao: "Encarregado" },
  { matricula: "3766", nome: "Paulo Sérgio", funcao: "Encarregado" },
  { matricula: "3767", nome: "João Paulo", funcao: "Encarregado" },
  { matricula: "3768", nome: "Antônio Lima", funcao: "Encarregado" },
  { matricula: "3769", nome: "Carlos Sena", funcao: "Encarregado" },
  { matricula: "3770", nome: "Gilvandro Borges dos Santos", funcao: "Encarregado" },
  { matricula: "3771", nome: "Leandro Soares Dias", funcao: "Encarregado" },
  { matricula: "3772", nome: "José Domingos Lopes", funcao: "Encarregado" },
] as const;

export interface FuncaoCatalogoItem {
  readonly nome: string;
}

export const FUNCOES: readonly FuncaoCatalogoItem[] = [
  { nome: "Encarregado" },
  { nome: "Técnico de Segurança do Trabalho" },
  { nome: "Motorista Cat. B" },
  { nome: "Motorista Cat. B/D" },
  { nome: "Sinaleiro" },
  { nome: "Pedreiro" },
  { nome: "Servente de Obras" },
  { nome: "Armador" },
  { nome: "Carpinteiro" },
  { nome: "Encanador (Bombeiro)" },
  { nome: "Pintor" },
  { nome: "Montador de Andaime" },
  { nome: "Mecânico Montador" },
  { nome: "Soldador" },
  { nome: "Soldador Especializado" },
  { nome: "Ajudante de Mecânica" },
  { nome: "Supervisor de Obras" },
  { nome: "Almoxarife" },
  { nome: "Vigilante" },
  { nome: "Topógrafo" },
  { nome: "Auxiliar de Topografia" },
  { nome: "Inspetor de Solda" },
  { nome: "Engenheiro" },
  { nome: "Oficial" },
  { nome: "Operador de Máquina Leve" },
] as const;

export interface EquipamentoCatalogoItem {
  readonly nome: string;
}

export const EQUIPAMENTOS: readonly EquipamentoCatalogoItem[] = [
  { nome: "Banheiro Químico" },
  { nome: "Veículo Leve" },
  { nome: "Pick-up Cabine Dupla" },
  { nome: "Caminhão 3/4" },
  { nome: "Pick-up F-4000" },
  { nome: "Van" },
  { nome: "Micro-ônibus" },
  { nome: "Roçadeira" },
  { nome: "Motopoda" },
  { nome: "Área de Vivência" },
  { nome: "Container Escritório" },
  { nome: "Container Almoxarifado" },
] as const;

export interface AtividadeCatalogoItem {
  readonly codigo: string;
  readonly descricao: string;
  readonly unidade: UnidadeMedida;
  readonly usaDimensoes: boolean;
  readonly ordem: number;
  readonly metaPus: number | null;
}

/**
 * `metaPus` é uma ESTIMATIVA provisória (média da produtividade real de
 * abril e maio/2026 — planilha "PRODUTIVIDADE ABRIL MAIO JUNHO.xlsx",
 * coluna TOTAL — ignorando meses sem produção nessa atividade), não uma
 * meta contratual. Não há tabela de meta oficial em nenhuma das planilhas
 * fonte. `null` = nenhum dos dois meses teve produção nessa atividade, sem
 * base para estimar. Ajuste pela tela "Catálogo de Atividades" assim que
 * houver o valor contratual real.
 */
export const ATIVIDADES: readonly AtividadeCatalogoItem[] = [
  { codigo: "2.1.2", descricao: "Limpeza de bueiros", unidade: "M3", usaDimensoes: true, ordem: 1, metaPus: 0.016 },
  { codigo: "2.1.3", descricao: "Limpeza de canaleta em corte e aterro até meia seção", unidade: "M", usaDimensoes: true, ordem: 2, metaPus: 40.5595 },
  { codigo: "2.1.4", descricao: "Limpeza de canaleta em corte e aterro com seção plena", unidade: "M", usaDimensoes: true, ordem: 3, metaPus: 16.2651 },
  { codigo: "2.1.5", descricao: "Limpeza de valeta, sarjetas e meio fios", unidade: "M", usaDimensoes: true, ordem: 4, metaPus: 25.1988 },
  { codigo: "2.1.6", descricao: "Rejuntamento de bueiro (estimar 20% da quantidade de bueiros)", unidade: "M3", usaDimensoes: true, ordem: 5, metaPus: null },
  { codigo: "2.1.7", descricao: "Limpeza de valas de bueiros (montante e jusante)", unidade: "M3", usaDimensoes: true, ordem: 6, metaPus: null },
  { codigo: "2.1.7", descricao: "Recuperação de drenagem tipo canaleta/valeta em taludes, limitando-se a 100m de extensão", unidade: "M", usaDimensoes: true, ordem: 7, metaPus: 1.6979 },
  { codigo: "2.1.8", descricao: "Recuperação de drenagem tipo sarjeta/meio-fio em plataforma, limitando-se a 100m de extensão", unidade: "M", usaDimensoes: true, ordem: 8, metaPus: 0.3768 },
  { codigo: "2.2.1", descricao: "Roçada", unidade: "M2", usaDimensoes: true, ordem: 9, metaPus: 953.9489 },
  { codigo: "2.2.2", descricao: "Capina", unidade: "M2", usaDimensoes: true, ordem: 10, metaPus: 31.681 },
  { codigo: "2.2.3", descricao: "Capina química com equipamento costal ou aplicação similar", unidade: "M2", usaDimensoes: true, ordem: 11, metaPus: null },
  { codigo: "2.2.4", descricao: "Capina química com uso de drone", unidade: "M2", usaDimensoes: true, ordem: 12, metaPus: null },
  { codigo: "2.2.5", descricao: "Remoção de solo", unidade: "M3", usaDimensoes: true, ordem: 13, metaPus: 1.0844 },
  { codigo: "2.2.6", descricao: "Poda de árvores com auxílio de equipamentos de grande porte fornecido pela VALE", unidade: "M2", usaDimensoes: true, ordem: 14, metaPus: null },
  { codigo: "2.2.7", descricao: "Poda de árvores com auxílio de equipamentos de grande porte fornecido pela CONTRATADA", unidade: "M2", usaDimensoes: true, ordem: 15, metaPus: null },
  { codigo: "2.2.8", descricao: "Corte de árvores de pequeno porte, equipamento fornecido pela VALE", unidade: "UND", usaDimensoes: false, ordem: 16, metaPus: null },
  { codigo: "2.2.9", descricao: "Corte de árvores de pequeno porte, equipamento fornecido pela CONTRATADA", unidade: "UND", usaDimensoes: false, ordem: 17, metaPus: null },
  { codigo: "2.2.10", descricao: "Corte de árvores de grande porte, equipamento fornecido pela VALE", unidade: "UND", usaDimensoes: false, ordem: 18, metaPus: null },
  { codigo: "2.2.11", descricao: "Corte de árvores de grande porte, equipamento fornecido pela CONTRATADA", unidade: "UND", usaDimensoes: false, ordem: 19, metaPus: null },
  { codigo: "2.2.12", descricao: "Momento extraordinário de transporte", unidade: "M3KM", usaDimensoes: false, ordem: 20, metaPus: null },
  { codigo: "2.3.1", descricao: "Fornecimento e aplicação de sinalização gráfica vertical completa", unidade: "M2", usaDimensoes: true, ordem: 21, metaPus: 0.0031 },
  { codigo: "2.3.2", descricao: "Aplicação de trilho para Cruz de Santo André (trilho fornecimento VALE)", unidade: "UND", usaDimensoes: false, ordem: 22, metaPus: null },
  { codigo: "5.1", descricao: "Horas improdutivas — Encarregado", unidade: "HH", usaDimensoes: false, ordem: 23, metaPus: null },
  { codigo: "5.2", descricao: "Horas improdutivas — Técnico de Segurança do Trabalho", unidade: "HH", usaDimensoes: false, ordem: 24, metaPus: null },
  { codigo: "5.3", descricao: "Horas improdutivas — Motorista", unidade: "HH", usaDimensoes: false, ordem: 25, metaPus: null },
  { codigo: "5.4", descricao: "Horas improdutivas — Oficial", unidade: "HH", usaDimensoes: false, ordem: 26, metaPus: null },
  { codigo: "5.5", descricao: "Horas improdutivas — Operador de Máquina Leve", unidade: "HH", usaDimensoes: false, ordem: 27, metaPus: null },
  { codigo: "5.6", descricao: "Horas improdutivas — Van", unidade: "HH", usaDimensoes: false, ordem: 28, metaPus: null },
] as const;
