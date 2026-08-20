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
}

export const FRENTES: readonly FrenteCatalogoItem[] = [
  { codigo: "MAB", nome: "Marabá" },
  { codigo: "PBA", nome: "Parauapebas" },
  { codigo: "RAMAL", nome: "Ramal" },
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
}

export const ATIVIDADES: readonly AtividadeCatalogoItem[] = [
  { codigo: "2.1.2", descricao: "Limpeza de bueiros", unidade: "M3", usaDimensoes: true, ordem: 1 },
  { codigo: "2.1.3", descricao: "Limpeza de canaleta em corte e aterro até meia seção", unidade: "M", usaDimensoes: true, ordem: 2 },
  { codigo: "2.1.4", descricao: "Limpeza de canaleta em corte e aterro com seção plena", unidade: "M", usaDimensoes: true, ordem: 3 },
  { codigo: "2.1.5", descricao: "Limpeza de valeta, sarjetas e meio fios", unidade: "M", usaDimensoes: true, ordem: 4 },
  { codigo: "2.1.6", descricao: "Rejuntamento de bueiro (estimar 20% da quantidade de bueiros)", unidade: "M3", usaDimensoes: true, ordem: 5 },
  { codigo: "2.1.7", descricao: "Limpeza de valas de bueiros (montante e jusante)", unidade: "M3", usaDimensoes: true, ordem: 6 },
  { codigo: "2.1.7", descricao: "Recuperação de drenagem tipo canaleta/valeta em taludes, limitando-se a 100m de extensão", unidade: "M", usaDimensoes: true, ordem: 7 },
  { codigo: "2.1.8", descricao: "Recuperação de drenagem tipo sarjeta/meio-fio em plataforma, limitando-se a 100m de extensão", unidade: "M", usaDimensoes: true, ordem: 8 },
  { codigo: "2.2.1", descricao: "Roçada", unidade: "M2", usaDimensoes: true, ordem: 9 },
  { codigo: "2.2.2", descricao: "Capina", unidade: "M2", usaDimensoes: true, ordem: 10 },
  { codigo: "2.2.3", descricao: "Capina química com equipamento costal ou aplicação similar", unidade: "M2", usaDimensoes: true, ordem: 11 },
  { codigo: "2.2.4", descricao: "Capina química com uso de drone", unidade: "M2", usaDimensoes: true, ordem: 12 },
  { codigo: "2.2.5", descricao: "Remoção de solo", unidade: "M3", usaDimensoes: true, ordem: 13 },
  { codigo: "2.2.6", descricao: "Poda de árvores com auxílio de equipamentos de grande porte fornecido pela VALE", unidade: "M2", usaDimensoes: true, ordem: 14 },
  { codigo: "2.2.7", descricao: "Poda de árvores com auxílio de equipamentos de grande porte fornecido pela CONTRATADA", unidade: "M2", usaDimensoes: true, ordem: 15 },
  { codigo: "2.2.8", descricao: "Corte de árvores de pequeno porte, equipamento fornecido pela VALE", unidade: "UND", usaDimensoes: false, ordem: 16 },
  { codigo: "2.2.9", descricao: "Corte de árvores de pequeno porte, equipamento fornecido pela CONTRATADA", unidade: "UND", usaDimensoes: false, ordem: 17 },
  { codigo: "2.2.10", descricao: "Corte de árvores de grande porte, equipamento fornecido pela VALE", unidade: "UND", usaDimensoes: false, ordem: 18 },
  { codigo: "2.2.11", descricao: "Corte de árvores de grande porte, equipamento fornecido pela CONTRATADA", unidade: "UND", usaDimensoes: false, ordem: 19 },
  { codigo: "2.2.12", descricao: "Momento extraordinário de transporte", unidade: "M3KM", usaDimensoes: false, ordem: 20 },
  { codigo: "2.3.1", descricao: "Fornecimento e aplicação de sinalização gráfica vertical completa", unidade: "M2", usaDimensoes: true, ordem: 21 },
  { codigo: "2.3.2", descricao: "Aplicação de trilho para Cruz de Santo André (trilho fornecimento VALE)", unidade: "UND", usaDimensoes: false, ordem: 22 },
  { codigo: "5.1", descricao: "Horas improdutivas — Encarregado", unidade: "HH", usaDimensoes: false, ordem: 23 },
  { codigo: "5.2", descricao: "Horas improdutivas — Técnico de Segurança do Trabalho", unidade: "HH", usaDimensoes: false, ordem: 24 },
  { codigo: "5.3", descricao: "Horas improdutivas — Motorista", unidade: "HH", usaDimensoes: false, ordem: 25 },
  { codigo: "5.4", descricao: "Horas improdutivas — Oficial", unidade: "HH", usaDimensoes: false, ordem: 26 },
  { codigo: "5.5", descricao: "Horas improdutivas — Operador de Máquina Leve", unidade: "HH", usaDimensoes: false, ordem: 27 },
  { codigo: "5.6", descricao: "Horas improdutivas — Van", unidade: "HH", usaDimensoes: false, ordem: 28 },
] as const;
