import { calcularTotalAtividade } from "@golias/shared";
import { createHash } from "node:crypto";
import PDFDocument from "pdfkit";
import QRCode from "qrcode";

const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;

export interface RdoPdfBlocoHorario {
  horarioInicial: string;
  horarioFinal: string;
  descricao: string;
  ordem: number;
}

export interface RdoPdfAtividadeMaoDeObraItem {
  funcao: string;
  quantidade: number;
}

/** Ponto de medição extra da atividade (Ponto 2, 3...) — ver RdoAtividade.pontosExtras em schema.prisma. */
export interface RdoPdfPontoExtra {
  altura: number | null;
  largura: number | null;
  larguraFinal: number | null;
  comprimento: number | null;
  quantidade: number;
}

export interface RdoPdfAtividade {
  item: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  kmInicial: number | null;
  kmFinal: number | null;
  usaDimensoes: boolean;
  altura: number | null;
  largura: number | null;
  larguraFinal: number | null;
  comprimento: number | null;
  horarioInicial: string | null;
  horarioFinal: string | null;
  // Número da OM (SAP) vinculada à atividade — mostrado na coluna própria
  // da tabela, colorido conforme o status (verde concluída, âmbar em
  // andamento), pra identificar de cara qual OM é e como está.
  omNumero: string | null;
  statusOm: "EM_ANDAMENTO" | "CONCLUIDA" | null;
  percentualConcluido: number | null;
  maoDeObra: RdoPdfAtividadeMaoDeObraItem[];
  // Ponto 1 é sempre os campos de dimensão acima (altura/largura/.../
  // quantidade) — pontosExtras só existe quando a mesma atividade/OM foi
  // medida em mais de um trecho/ponto no mesmo dia.
  pontosExtras: RdoPdfPontoExtra[];
}

export interface RdoPdfLocal {
  descricao: string;
  lado: string | null;
  atividades: RdoPdfAtividade[];
}

export interface RdoPdfMaoDeObraItem {
  funcao: string;
  quantidade: number;
}

export interface RdoPdfEquipamentoItem {
  nome: string;
  quantidade: number;
  producaoDescricao: string | null;
  producaoValor: number | null;
  producaoUnidade: string | null;
  horimetroInicial: number | null;
  horimetroFinal: number | null;
}

export interface RdoPdfMaterialItem {
  nome: string;
  unidade: string;
  quantidade: number;
}

/**
 * Dados já resolvidos (nomes prontos, não IDs) que descrevem o conteúdo do
 * RDO — ver montarDadosRdo em rdos.ts. Não inclui a URL de verificação: o
 * hash de autenticidade é calculado sobre este conteúdo (não sobre os bytes
 * do PDF, que mudariam a cada geração mesmo com o mesmo conteúdo), e a URL
 * só existe depois de calculado o hash — ver `RdoPdfDados`.
 */
export interface RdoConteudo {
  numeroSap: string | null;
  encarregadoNome: string | null;
  equipeNome: string;
  frenteNome: string;
  data: Date;
  clima: "SOL" | "CHUVA" | "NUBLADO" | null;
  horaExtraInicio: string | null;
  horaExtraFim: string | null;
  blocosHorario: RdoPdfBlocoHorario[];
  locais: RdoPdfLocal[];
  maoDeObra: RdoPdfMaoDeObraItem[];
  equipamentos: RdoPdfEquipamentoItem[];
  materiais: RdoPdfMaterialItem[];
  observacoesContratada: string | null;
  observacoesCliente: string | null;
}

export interface RdoPdfAssinatura {
  imagem: Buffer;
  nome: string;
  data: Date;
}

/** Uma foto do registro fotográfico, já com os bytes lidos do disco. */
export interface RdoPdfFoto {
  imagem: Buffer;
  legenda: string | null;
}

/** Fotos do dia agrupadas pela OM a que foram vinculadas (omNumero null = "Fotos gerais"). */
export interface RdoPdfGrupoFotos {
  omNumero: string | null;
  fotos: RdoPdfFoto[];
}

/**
 * `RdoConteudo` + a URL de verificação (que já embute o hash desse
 * conteúdo) — o que o desenho do PDF efetivamente usa. Assinaturas e fotos
 * ficam de fora de `RdoConteudo` de propósito: são bytes de imagem, não
 * precisam (nem devem, por custo/estabilidade) entrar no hash de
 * autenticidade calculado sobre o conteúdo.
 */
export interface RdoPdfDados extends RdoConteudo {
  urlVerificacao: string;
  assinaturaEncarregado?: RdoPdfAssinatura | null;
  assinaturaFiscal?: RdoPdfAssinatura | null;
  gruposFotos?: RdoPdfGrupoFotos[];
}

// Paisagem (A4 landscape) — o modelo de referência que o usuário pediu pra
// seguir (RDO489, de outro sistema) usa uma única tabela larga por
// horário em vez de duas colunas empilhadas; paisagem dá o espaço
// horizontal que essa tabela precisa pra caber Início/Fim/Atividade/Qtd/
// Un/OM/MO/Observações numa linha só, sem espremer.
const MARGEM = 28;
const LARGURA_PAGINA = 841.89;
const ALTURA_PAGINA = 595.28;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;
const LIMITE_CONTEUDO = ALTURA_PAGINA - MARGEM;

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** true quando abriu página nova (chamador que controla `y` manualmente precisa se realinhar). */
function garantirEspaco(doc: PDFKit.PDFDocument, alturaNecessaria: number): boolean {
  if (doc.y + alturaNecessaria > LIMITE_CONTEUDO) {
    doc.addPage();
    return true;
  }
  return false;
}

function desenharCabecalho(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  doc.font("Helvetica-Bold").fontSize(9).text("ENGECOM", MARGEM, MARGEM, { lineBreak: false });
  doc
    .fontSize(16)
    .text("RELATÓRIO DIÁRIO DE OBRA", MARGEM, MARGEM, { width: LARGURA_UTIL, align: "center", lineBreak: false });
  const alturaTitulo = doc.heightOfString("RELATÓRIO DIÁRIO DE OBRA");
  doc
    .fontSize(9)
    .text(`Nº SAP: ${dados.numeroSap ?? "—"}`, MARGEM, MARGEM, { width: LARGURA_UTIL, align: "right", lineBreak: false });

  const y0 = MARGEM + alturaTitulo + 8;
  doc.moveTo(MARGEM, y0).lineTo(LARGURA_PAGINA - MARGEM, y0).lineWidth(0.75).strokeColor("#000000").stroke();
  doc.y = y0 + 6;
}

/** Desenha um campo "RÓTULO" em cima do valor embaixo, dentro de `largura`, e devolve o y logo abaixo do que foi desenhado. */
function desenharCampo(doc: PDFKit.PDFDocument, x: number, y: number, largura: number, rotulo: string, valor: string): number {
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#000000");
  const alturaRotulo = doc.heightOfString(rotulo, { width: largura });
  doc.text(rotulo, x, y, { width: largura, lineBreak: false });

  doc.font("Helvetica").fontSize(8.5);
  const yValor = y + alturaRotulo + 2;
  const alturaValor = doc.heightOfString(valor || "—", { width: largura });
  doc.text(valor || "—", x, yValor, { width: largura });

  return yValor + alturaValor;
}

/** N campos lado a lado, largura igual pra cada — devolve o y abaixo do mais alto deles. */
function desenharLinhaCampos(doc: PDFKit.PDFDocument, y: number, campos: Array<[string, string]>): number {
  const gap = 10;
  const larguraCol = (LARGURA_UTIL - gap * (campos.length - 1)) / campos.length;
  let x = MARGEM;
  let maxY = y;
  for (const [rotulo, valor] of campos) {
    const yFim = desenharCampo(doc, x, y, larguraCol, rotulo, valor);
    maxY = Math.max(maxY, yFim);
    x += larguraCol + gap;
  }
  return maxY + 5;
}

function desenharIdentificacao(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  const diaSemana = DIAS_SEMANA[dados.data.getUTCDay()];
  const tempoLabel = dados.clima === "SOL" ? "SOL" : dados.clima === "CHUVA" ? "CHUVA" : dados.clima === "NUBLADO" ? "NUBLADO" : "—";
  const horaExtra =
    dados.horaExtraInicio && dados.horaExtraFim ? `${dados.horaExtraInicio} às ${dados.horaExtraFim}` : "—";

  const y = desenharLinhaCampos(doc, doc.y, [
    ["DATA", `${formatarData(dados.data)} (${diaSemana})`],
    ["DISTRITO", dados.frenteNome],
    ["EQUIPE", dados.equipeNome],
    ["ENCARREGADO", dados.encarregadoNome ?? "—"],
    ["TEMPO", tempoLabel],
    ["HORA EXTRA", horaExtra],
  ]);

  doc.moveTo(MARGEM, y).lineTo(LARGURA_PAGINA - MARGEM, y).lineWidth(0.75).stroke();
  doc.y = y + 6;
}

const COR_STATUS_CONCLUIDA = "#15803d";
const COR_STATUS_EM_ANDAMENTO = "#b45309";

function minutosDoHorario(horario: string): number {
  const [horaStr, minutoStr] = horario.split(":");
  return Number(horaStr) * 60 + Number(minutoStr);
}

/** Dados de dimensão de um ponto de medição — a própria atividade (Ponto 1) ou um ponto extra. */
interface DadosMemorial {
  unidade: string;
  altura: number | null;
  largura: number | null;
  larguraFinal: number | null;
  comprimento: number | null;
  quantidade: number;
}

/** Texto do memorial de cálculo (fórmula = resultado), mesma matemática de `calcularTotalAtividade` (packages/shared) e do croqui exibido no formulário (CroquiAtividade.tsx). */
function montarMemorialCalculo(dados: DadosMemorial): string | null {
  const { unidade, altura: a, largura: l, larguraFinal: lFim, comprimento: c, quantidade } = dados;
  if (unidade === "M3" && a != null && l != null && c != null) {
    return `${formatarNumero(c)} × ${formatarNumero(l)} × ${formatarNumero(a)} = ${formatarNumero(quantidade)} m³`;
  }
  if (unidade === "M2" && l != null && c != null) {
    if (lFim != null && lFim !== l) {
      return `média(${formatarNumero(l)}, ${formatarNumero(lFim)}) × ${formatarNumero(c)} = ${formatarNumero(quantidade)} m²`;
    }
    return `${formatarNumero(c)} × ${formatarNumero(l)} = ${formatarNumero(quantidade)} m²`;
  }
  if (unidade === "M" && c != null) {
    return `${formatarNumero(c)} m`;
  }
  return null;
}

interface LinhaUnificada {
  inicial: string;
  final: string;
  atividadeTexto: string;
  qtd: string;
  unidade: string;
  omTexto: string | null;
  omCor: string | null;
  mo: string;
  observacoes: string;
  chaveOrdenacao: number;
}

/**
 * Junta a "linha do tempo" (blocosHorario — deslocamento, área de
 * vivência, almoço...) com as atividades medidas numa lista só, ordenada
 * por horário — uma linha por horário, no modelo de referência (RDO489),
 * em vez de duas seções separadas. Isso é só de DESENHO: o formulário de
 * lançamento continua exatamente igual (blocos e atividades continuam
 * sendo coisas diferentes lá), essa junção acontece só aqui na hora de
 * montar o PDF.
 */
function montarLinhasUnificadas(dados: RdoPdfDados): LinhaUnificada[] {
  const linhas: LinhaUnificada[] = [];

  for (const bloco of dados.blocosHorario) {
    linhas.push({
      inicial: bloco.horarioInicial,
      final: bloco.horarioFinal,
      atividadeTexto: bloco.descricao,
      qtd: "",
      unidade: "",
      omTexto: null,
      omCor: null,
      mo: "",
      observacoes: "",
      chaveOrdenacao: bloco.horarioInicial ? minutosDoHorario(bloco.horarioInicial) : Number.POSITIVE_INFINITY,
    });
  }

  for (const local of dados.locais) {
    for (const atividade of local.atividades) {
      const localTexto = `${local.descricao}${local.lado ? ` ${local.lado}` : ""}`;
      const km =
        atividade.kmInicial != null && atividade.kmFinal != null ? ` (Km ${atividade.kmInicial} ao ${atividade.kmFinal})` : "";
      const moTotal = atividade.maoDeObra.reduce((soma, item) => soma + item.quantidade, 0);
      const omCor =
        atividade.statusOm === "CONCLUIDA" ? COR_STATUS_CONCLUIDA : atividade.statusOm === "EM_ANDAMENTO" ? COR_STATUS_EM_ANDAMENTO : null;
      const percentual = atividade.percentualConcluido != null ? ` (${atividade.percentualConcluido}%)` : "";
      const omTexto = atividade.omNumero ? `${atividade.omNumero}${percentual}` : null;
      const chaveBase = atividade.horarioInicial ? minutosDoHorario(atividade.horarioInicial) : Number.POSITIVE_INFINITY;

      // Ponto 1 (a própria atividade) — atividade.quantidade já vem somada
      // com os pontosExtras (o total que a tabela de indicadores usa), por
      // isso recalcula só a parte do Ponto 1 aqui, senão a linha dele
      // mostraria o total combinado, não só o que ele mediu.
      const quantidadePonto1 = calcularTotalAtividade(atividade.unidade as Parameters<typeof calcularTotalAtividade>[0], atividade);
      const memorial1 = montarMemorialCalculo({
        unidade: atividade.unidade,
        altura: atividade.altura,
        largura: atividade.largura,
        larguraFinal: atividade.larguraFinal,
        comprimento: atividade.comprimento,
        quantidade: quantidadePonto1,
      });

      linhas.push({
        inicial: atividade.horarioInicial ?? "",
        final: atividade.horarioFinal ?? "",
        atividadeTexto: `${atividade.item} — ${atividade.descricao} — ${localTexto}${km}`,
        qtd: formatarNumero(quantidadePonto1),
        unidade: atividade.unidade,
        omTexto,
        omCor,
        mo: moTotal > 0 ? String(moTotal) : "",
        observacoes: memorial1 ?? "",
        chaveOrdenacao: chaveBase,
      });

      atividade.pontosExtras.forEach((ponto, indice) => {
        const memorial = montarMemorialCalculo({ unidade: atividade.unidade, ...ponto });
        linhas.push({
          inicial: "",
          final: "",
          atividadeTexto: `${atividade.item} — ${atividade.descricao} — Ponto ${indice + 2}`,
          qtd: formatarNumero(ponto.quantidade),
          unidade: atividade.unidade,
          omTexto: null,
          omCor: null,
          mo: "",
          observacoes: memorial ?? "",
          // +0.001 por ponto extra pra ficar logo depois do Ponto 1 na
          // ordenação, sem disputar posição com outra atividade do mesmo horário.
          chaveOrdenacao: chaveBase + (indice + 1) * 0.001,
        });
      });
    }
  }

  return linhas.sort((a, b) => a.chaveOrdenacao - b.chaveOrdenacao);
}

const COL_INICIAL = 36;
const COL_FINAL = 36;
const COL_ATIVIDADE = 280;
const COL_QTD = 55;
const COL_UNID = 34;
const COL_OM = 85;
const COL_MO = 32;
const COL_OBS = LARGURA_UTIL - COL_INICIAL - COL_FINAL - COL_ATIVIDADE - COL_QTD - COL_UNID - COL_OM - COL_MO;

const COLUNAS_TABELA_UNIFICADA: Array<[string, number, "left" | "right" | "center"]> = [
  ["INÍCIO", COL_INICIAL, "left"],
  ["FIM", COL_FINAL, "left"],
  ["ATIVIDADE", COL_ATIVIDADE, "left"],
  ["QTD", COL_QTD, "right"],
  ["UN", COL_UNID, "left"],
  ["OM", COL_OM, "left"],
  ["MO", COL_MO, "center"],
  ["OBSERVAÇÕES", COL_OBS, "left"],
];

/** Traça as linhas verticais entre colunas de uma linha da tabela unificada (dentro do retângulo já desenhado). */
function desenharDivisoriasColunas(doc: PDFKit.PDFDocument, y: number, altura: number): void {
  let x = MARGEM;
  for (const [, largura] of COLUNAS_TABELA_UNIFICADA.slice(0, -1)) {
    x += largura;
    doc.moveTo(x, y).lineTo(x, y + altura).stroke();
  }
}

/** Cabeçalho com borda — mesmo estilo "caixa" das tabelas de recursos da página 2. */
function desenharCabecalhoTabelaUnificada(doc: PDFKit.PDFDocument, y: number): number {
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#000000");
  // Altura calculada (não um número fixo) — um rótulo que quebra em 2
  // linhas numa coluna estreita não pode empurrar a régua de baixo por
  // cima do próprio texto (bug real visto com "ORDEM DE MANUTENÇÃO").
  const alturaTexto = Math.max(
    ...COLUNAS_TABELA_UNIFICADA.map(([texto, largura]) => doc.heightOfString(texto, { width: largura - 4 })),
  );
  const altura = alturaTexto + 4;

  doc.lineWidth(0.5).strokeColor("#000000").rect(MARGEM, y, LARGURA_UTIL, altura).stroke();
  desenharDivisoriasColunas(doc, y, altura);

  let x = MARGEM;
  for (const [texto, largura, align] of COLUNAS_TABELA_UNIFICADA) {
    doc.fillColor("#000000").text(texto, x + 2, y + 3, { width: largura - 4, align });
    x += largura;
  }
  return y + altura;
}

function desenharTabelaUnificada(doc: PDFKit.PDFDocument, dados: RdoPdfDados, yInicial: number): void {
  const linhas = montarLinhasUnificadas(dados);
  let y = desenharCabecalhoTabelaUnificada(doc, yInicial);

  doc.font("Helvetica").fontSize(7.5).fillColor("#000000");
  if (linhas.length === 0) {
    const altura = 14;
    doc.lineWidth(0.5).strokeColor("#000000").rect(MARGEM, y, LARGURA_UTIL, altura).stroke();
    doc.fillColor("#000000").text("Nenhuma atividade lançada.", MARGEM + 2, y + 3, { width: LARGURA_UTIL - 4 });
    doc.y = y + altura;
    return;
  }

  for (const linha of linhas) {
    const alturaAtividade = doc.heightOfString(linha.atividadeTexto, { width: COL_ATIVIDADE - 4 });
    const alturaObs = doc.heightOfString(linha.observacoes, { width: COL_OBS - 4 });
    // Coluna estreita — "2026000012345678 (100%)" pode quebrar em 2 linhas
    // sozinha mesmo com atividade/observações curtas; sem contar essa
    // altura aqui, o texto da OM vazava pra cima da linha seguinte.
    const alturaOm = linha.omTexto ? doc.heightOfString(linha.omTexto, { width: COL_OM - 4 }) : 0;
    const alturaLinha = Math.max(14, alturaAtividade + 4, alturaObs + 4, alturaOm + 4);

    if (y + alturaLinha > LIMITE_CONTEUDO) {
      doc.addPage();
      y = desenharCabecalhoTabelaUnificada(doc, MARGEM);
    }

    doc.lineWidth(0.5).strokeColor("#000000").rect(MARGEM, y, LARGURA_UTIL, alturaLinha).stroke();
    desenharDivisoriasColunas(doc, y, alturaLinha);

    let x = MARGEM;
    doc.font("Helvetica").fontSize(7.5).fillColor("#000000");
    doc.text(linha.inicial, x + 2, y + 3, { width: COL_INICIAL - 4 });
    x += COL_INICIAL;
    doc.text(linha.final, x + 2, y + 3, { width: COL_FINAL - 4 });
    x += COL_FINAL;
    doc.text(linha.atividadeTexto, x + 2, y + 3, { width: COL_ATIVIDADE - 4 });
    x += COL_ATIVIDADE;
    doc.text(linha.qtd, x + 2, y + 3, { width: COL_QTD - 4, align: "right" });
    x += COL_QTD;
    doc.text(linha.unidade, x + 2, y + 3, { width: COL_UNID - 4 });
    x += COL_UNID;
    if (linha.omTexto) {
      doc.fillColor(linha.omCor ?? "#000000").text(linha.omTexto, x + 2, y + 3, { width: COL_OM - 4 });
      doc.fillColor("#000000");
    }
    x += COL_OM;
    doc.text(linha.mo, x + 2, y + 3, { width: COL_MO - 4, align: "center" });
    x += COL_MO;
    doc.text(linha.observacoes, x + 2, y + 3, { width: COL_OBS - 4 });

    y += alturaLinha;
  }

  doc.y = y;
}

const JORNADA_REFERENCIA_HORAS = 10;

/**
 * Soma a "Linha do tempo" com o horário de cada atividade — mesmo cálculo
 * de `calcularHorasApontadasDia` no formulário (RdoCompleto.tsx/Campo.tsx)
 * — pra mostrar no PDF se a jornada de referência (10h) foi toda apontada
 * em algum bloco/atividade, ou se sobrou hora sem descrição.
 */
function calcularHorasTrabalhadas(dados: RdoPdfDados): number {
  let minutos = 0;
  for (const bloco of dados.blocosHorario) {
    if (!bloco.horarioInicial || !bloco.horarioFinal) continue;
    const diferenca = minutosDoHorario(bloco.horarioFinal) - minutosDoHorario(bloco.horarioInicial);
    if (diferenca > 0) minutos += diferenca;
  }
  for (const local of dados.locais) {
    for (const atividade of local.atividades) {
      if (!atividade.horarioInicial || !atividade.horarioFinal) continue;
      const diferenca = minutosDoHorario(atividade.horarioFinal) - minutosDoHorario(atividade.horarioInicial);
      if (diferenca > 0) minutos += diferenca;
    }
  }
  return minutos / 60;
}

function formatarHoras(horas: number): string {
  const totalMinutos = Math.round(horas * 60);
  const h = Math.floor(totalMinutos / 60);
  const min = totalMinutos % 60;
  return `${h}h${String(min).padStart(2, "0")}`;
}

function desenharResumoHoras(doc: PDFKit.PDFDocument, dados: RdoPdfDados, y: number): void {
  const horasTrabalhadas = calcularHorasTrabalhadas(dados);
  const status = horasTrabalhadas >= JORNADA_REFERENCIA_HORAS ? "jornada completa" : "faltam apontar horas";
  doc
    .font("Helvetica-Bold")
    .fontSize(7.5)
    .fillColor("#000000")
    .text(
      `${formatarHoras(horasTrabalhadas)} apontadas (linha do tempo + atividades) de ${JORNADA_REFERENCIA_HORAS}h de referência (${status}).`,
      MARGEM,
      y + 4,
      { width: LARGURA_UTIL },
    );
}

interface LinhaRecurso {
  nome: string;
  quantidade: string;
  unidade: string;
}

/**
 * Uma tabela com borda (cabeçalho "Recurso / Quant. / Un." + uma linha por
 * item) — Materiais/Recursos/Mão de obra na página 2, no modelo de
 * referência (RDO489). Devolve o y logo abaixo da última linha desenhada.
 */
function desenharTabelaRecurso(
  doc: PDFKit.PDFDocument,
  titulo: string,
  x: number,
  y: number,
  largura: number,
  itens: LinhaRecurso[],
): number {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text(titulo, x, y);
  let linhaY = doc.y + 4;

  const colNome = largura * 0.6;
  const colQtd = largura * 0.2;
  const colUn = largura - colNome - colQtd;

  function linha(nome: string, quantidade: string, unidade: string, negrito: boolean): number {
    doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(7.5);
    const altura = Math.max(14, doc.heightOfString(nome || "—", { width: colNome - 6 }) + 4);
    doc.rect(x, linhaY, largura, altura).lineWidth(0.5).strokeColor("#000000").stroke();
    doc.moveTo(x + colNome, linhaY).lineTo(x + colNome, linhaY + altura).stroke();
    doc.moveTo(x + colNome + colQtd, linhaY).lineTo(x + colNome + colQtd, linhaY + altura).stroke();
    doc.fillColor("#000000").text(nome || "—", x + 3, linhaY + 3, { width: colNome - 6 });
    doc.text(quantidade, x + colNome + 3, linhaY + 3, { width: colQtd - 6 });
    doc.text(unidade, x + colNome + colQtd + 3, linhaY + 3, { width: colUn - 6 });
    return linhaY + altura;
  }

  linhaY = linha("Recurso", "Quant.", "Un.", true);
  if (itens.length === 0) {
    linhaY = linha("—", "", "", false);
  } else {
    for (const item of itens) linhaY = linha(item.nome, item.quantidade, item.unidade, false);
  }
  return linhaY;
}

/** Materiais / Recursos (equipamentos) / Mão de obra, em três tabelas lado a lado — página 2. */
function desenharRecursos(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  garantirEspaco(doc, 40);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text("RECURSOS DO DIA", MARGEM, doc.y);
  doc.moveTo(MARGEM, doc.y + 4).lineTo(LARGURA_PAGINA - MARGEM, doc.y + 4).lineWidth(0.75).stroke();
  const y0 = doc.y + 14;

  const gap = 16;
  const colLargura = (LARGURA_UTIL - gap * 2) / 3;
  const xMateriais = MARGEM;
  const xRecursos = MARGEM + colLargura + gap;
  const xMaoDeObra = MARGEM + (colLargura + gap) * 2;

  const materiais: LinhaRecurso[] = dados.materiais.map((item) => ({
    nome: item.nome,
    quantidade: formatarNumero(item.quantidade),
    unidade: item.unidade,
  }));

  // Equipamento/catálogo não tem unidade própria (é sempre "1 item"), por
  // isso "UN" fixo — a produção/horímetro, quando existe, entra junto no
  // nome (não cabe uma coluna própria numa tabela de 3 colunas simples).
  const recursos: LinhaRecurso[] = dados.equipamentos.map((item) => {
    let producao = "";
    if (item.producaoValor != null) {
      producao = ` — ${item.producaoDescricao ? `${item.producaoDescricao}: ` : ""}${formatarNumero(item.producaoValor)}${item.producaoUnidade ? ` ${item.producaoUnidade}` : ""}`;
    } else if (item.horimetroFinal != null) {
      producao =
        item.horimetroInicial != null
          ? ` — horímetro: ${formatarNumero(item.horimetroInicial)} a ${formatarNumero(item.horimetroFinal)} h`
          : ` — horímetro final: ${formatarNumero(item.horimetroFinal)} h`;
    }
    return { nome: `${item.nome}${producao}`, quantidade: String(item.quantidade), unidade: "UN" };
  });

  const maoDeObra: LinhaRecurso[] = dados.maoDeObra.map((item) => ({
    nome: item.funcao,
    quantidade: String(item.quantidade),
    unidade: "Un",
  }));

  const yMateriais = desenharTabelaRecurso(doc, "MATERIAIS", xMateriais, y0, colLargura, materiais);
  const yRecursos = desenharTabelaRecurso(doc, "RECURSOS", xRecursos, y0, colLargura, recursos);
  const yMaoDeObra = desenharTabelaRecurso(doc, "MÃO DE OBRA", xMaoDeObra, y0, colLargura, maoDeObra);

  doc.y = Math.max(yMateriais, yRecursos, yMaoDeObra) + 12;
}

function desenharObservacoes(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  garantirEspaco(doc, 70);
  const y0 = doc.y + 10;
  doc.moveTo(MARGEM, y0).lineTo(LARGURA_PAGINA - MARGEM, y0).lineWidth(0.75).stroke();
  const colLargura = LARGURA_UTIL / 2 - 8;
  const yTitulo = y0 + 6;

  const yEsq = desenharCampo(doc, MARGEM, yTitulo, colLargura, "OBSERVAÇÕES ENGECOM", dados.observacoesContratada ?? "—");
  const yDir = desenharCampo(doc, MARGEM + colLargura + 16, yTitulo, colLargura, "OBSERVAÇÕES VALE", dados.observacoesCliente ?? "—");

  doc.y = Math.max(yEsq, yDir);
}

function desenharBlocoAssinatura(
  doc: PDFKit.PDFDocument,
  x: number,
  yLinha: number,
  largura: number,
  rotulo: string,
  assinatura: RdoPdfAssinatura | null | undefined,
): void {
  if (assinatura) {
    // Imagem desenhada no canvas, encaixada logo acima da linha — largura
    // máxima do bloco, altura proporcional, sem distorcer.
    const alturaImagem = 32;
    doc.image(assinatura.imagem, x, yLinha - alturaImagem - 2, { fit: [largura, alturaImagem], align: "center" });
  }
  doc.moveTo(x, yLinha).lineTo(x + largura, yLinha).lineWidth(0.75).stroke();
  doc.font("Helvetica").fontSize(8).text(rotulo, x, yLinha + 3, { width: largura });
  if (assinatura) {
    doc
      .font("Helvetica")
      .fontSize(7)
      .text(`Assinado por ${assinatura.nome} em ${formatarData(assinatura.data)}`, x, doc.y + 1, { width: largura });
  }
}

const CROQUI_LARGURA = 235;
const CROQUI_ALTURA_DESENHO = 90;

/** Rótulo "X m" (ou "?" quando a dimensão não foi informada), igual ao croqui exibido no formulário. */
function rotuloDimensao(valor: number | null): string {
  return valor != null ? `${formatarNumero(valor)} m` : "?";
}

/** Desenha uma linha horizontal com marcas nas pontas — croqui de atividades em M (comprimento apenas). */
function desenharCroquiLinha(doc: PDFKit.PDFDocument, x: number, y: number, comprimento: number | null): void {
  const yLinha = y + CROQUI_ALTURA_DESENHO / 2 + 8;
  const xIni = x + 20;
  const xFim = x + CROQUI_LARGURA - 20;
  doc.lineWidth(1).strokeColor("#2c3d33");
  doc.moveTo(xIni, yLinha).lineTo(xFim, yLinha).stroke();
  doc.moveTo(xIni, yLinha - 8).lineTo(xIni, yLinha + 8).stroke();
  doc.moveTo(xFim, yLinha - 8).lineTo(xFim, yLinha + 8).stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#2c3d33")
    .text(rotuloDimensao(comprimento), x, yLinha - 22, { width: CROQUI_LARGURA, align: "center" });
}

/** Retângulo (ou trapézio, quando larguraFinal difere de largura) — croqui de atividades em M2. */
function desenharCroquiRetangulo(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  largura: number | null,
  larguraFinal: number | null,
  comprimento: number | null,
): void {
  const lIni = largura ?? 0;
  const lFim = larguraFinal ?? lIni;
  const maior = Math.max(lIni, lFim, 0.001);
  const alturaMax = CROQUI_ALTURA_DESENHO - 20;
  const alturaMin = 16;
  const alturaDe = (valor: number): number => (valor <= 0 ? 0 : Math.max((valor / maior) * alturaMax, alturaMin));
  const hIni = alturaDe(lIni);
  const hFim = alturaDe(lFim);
  const xIni = x + 40;
  const xFim = x + CROQUI_LARGURA - 40;
  const centroY = y + CROQUI_ALTURA_DESENHO / 2 + 4;

  doc
    .lineWidth(1)
    .strokeColor("#2c3d33")
    .fillColor("#eefaf1")
    .polygon(
      [xIni, centroY - hIni / 2],
      [xFim, centroY - hFim / 2],
      [xFim, centroY + hFim / 2],
      [xIni, centroY + hIni / 2],
    )
    .fillAndStroke("#eefaf1", "#2c3d33");

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#2c3d33")
    .text(rotuloDimensao(comprimento), x, y, { width: CROQUI_LARGURA, align: "center" });

  doc.save();
  doc.rotate(-90, { origin: [x + 14, centroY] });
  doc.text(rotuloDimensao(largura), x + 14 - 40, centroY - 5, { width: 80, align: "center" });
  doc.restore();

  if (larguraFinal != null && larguraFinal !== largura) {
    doc.save();
    doc.rotate(-90, { origin: [x + CROQUI_LARGURA - 14, centroY] });
    doc.text(rotuloDimensao(larguraFinal), x + CROQUI_LARGURA - 14 - 40, centroY - 5, { width: 80, align: "center" });
    doc.restore();
  }
}

/** Caixa em perspectiva simples (face frontal + topo + lado) — croqui de atividades em M3. */
function desenharCroquiCaixa(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  altura: number | null,
  largura: number | null,
  comprimento: number | null,
): void {
  const fbl = { x: x + 60, y: y + 80 };
  const fbr = { x: x + 150, y: y + 80 };
  const ftr = { x: x + 150, y: y + 18 };
  const ftl = { x: x + 60, y: y + 18 };
  const offset = { x: 38, y: -22 };
  const bbr = { x: fbr.x + offset.x, y: fbr.y + offset.y };
  const btr = { x: ftr.x + offset.x, y: ftr.y + offset.y };
  const btl = { x: ftl.x + offset.x, y: ftl.y + offset.y };

  doc.lineWidth(1).strokeColor("#2c3d33");
  doc.polygon([fbr.x, fbr.y], [ftr.x, ftr.y], [btr.x, btr.y], [bbr.x, bbr.y]).fillAndStroke("#dbe8de", "#2c3d33");
  doc.polygon([ftl.x, ftl.y], [ftr.x, ftr.y], [btr.x, btr.y], [btl.x, btl.y]).fillAndStroke("#eefaf1", "#2c3d33");
  doc.polygon([fbl.x, fbl.y], [fbr.x, fbr.y], [ftr.x, ftr.y], [ftl.x, ftl.y]).fillAndStroke("#f4faf6", "#2c3d33");

  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#2c3d33")
    .text(rotuloDimensao(largura), fbl.x - 20, fbl.y + 6, { width: (fbr.x - fbl.x) + 40, align: "center" });

  doc.save();
  doc.rotate(-90, { origin: [fbl.x - 16, (fbl.y + ftl.y) / 2] });
  doc.text(rotuloDimensao(altura), fbl.x - 16 - 40, (fbl.y + ftl.y) / 2 - 5, { width: 80, align: "center" });
  doc.restore();

  doc.text(rotuloDimensao(comprimento), (fbr.x + bbr.x) / 2 + 4, (fbr.y + bbr.y) / 2 - 4, { width: 70 });
}

/** Uma "carta" de croqui + memorial de cálculo para um ponto de medição, dentro de `largura`. */
function desenharCartaoCroqui(doc: PDFKit.PDFDocument, x: number, y: number, titulo: string, dados: DadosMemorial): void {
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#000000").text(titulo, x, y, { width: CROQUI_LARGURA });
  const yDesenho = doc.y + 4;

  if (dados.unidade === "M3") {
    desenharCroquiCaixa(doc, x, yDesenho, dados.altura, dados.largura, dados.comprimento);
  } else if (dados.unidade === "M2") {
    desenharCroquiRetangulo(doc, x, yDesenho, dados.largura, dados.larguraFinal, dados.comprimento);
  } else {
    desenharCroquiLinha(doc, x, yDesenho, dados.comprimento);
  }

  const yFormula = yDesenho + CROQUI_ALTURA_DESENHO + 4;
  const memorial = montarMemorialCalculo(dados);
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#2c3d33")
    .text(memorial ?? "Dimensões não informadas.", x, yFormula, { width: CROQUI_LARGURA });
}

interface CartaoCroqui {
  titulo: string;
  dados: DadosMemorial;
}

/**
 * Achata atividades × pontos em uma lista de cartões — Ponto 1 é sempre a
 * própria atividade (altura/largura/.../quantidade), pontosExtras vira um
 * cartão a mais cada. Só rotula "Ponto N" quando há mais de um cartão para
 * a mesma atividade — RDO com uma dimensão só por atividade (o caso comum)
 * continua saindo igual a antes.
 */
function montarCartoesCroqui(atividade: RdoPdfAtividade): CartaoCroqui[] {
  const titulo = `${atividade.item} — ${atividade.descricao}`;
  // atividade.quantidade é o total JÁ SOMADO com os pontosExtras (o que a
  // tabela principal mostra) — o memorial do Ponto 1 precisa do total só
  // dele, recalculado das próprias dimensões, senão a fórmula do Ponto 1
  // aparece batendo com um resultado que não é dela.
  const ponto1: DadosMemorial = {
    unidade: atividade.unidade,
    altura: atividade.altura,
    largura: atividade.largura,
    larguraFinal: atividade.larguraFinal,
    comprimento: atividade.comprimento,
    quantidade: calcularTotalAtividade(atividade.unidade as Parameters<typeof calcularTotalAtividade>[0], atividade),
  };

  if (atividade.pontosExtras.length === 0) {
    return [{ titulo, dados: ponto1 }];
  }

  return [
    { titulo: `${titulo} — Ponto 1`, dados: ponto1 },
    ...atividade.pontosExtras.map((ponto, indice) => ({
      titulo: `${titulo} — Ponto ${indice + 2}`,
      dados: { unidade: atividade.unidade, ...ponto },
    })),
  ];
}

/** Croquis e memorial de cálculo de cada atividade/ponto que usa dimensões (M/M2/M3) — continua na página 2, depois dos recursos. */
function desenharCroquis(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  const cartoes = dados.locais
    .flatMap((local) => local.atividades)
    .filter((atividade) => atividade.usaDimensoes)
    .flatMap((atividade) => montarCartoesCroqui(atividade));
  if (cartoes.length === 0) return;

  garantirEspaco(doc, 60);
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#000000").text("CROQUIS E MEMORIAL DE CÁLCULO", MARGEM, doc.y);
  doc.moveTo(MARGEM, doc.y + 4).lineTo(LARGURA_PAGINA - MARGEM, doc.y + 4).lineWidth(0.75).stroke();

  const gap = 20;
  // 3 croquis por linha (paisagem dá mais largura que as 2 de antes).
  const colX = [MARGEM, MARGEM + CROQUI_LARGURA + gap, MARGEM + (CROQUI_LARGURA + gap) * 2];
  let coluna = 0;
  let y = doc.y + 16;
  const alturaCartao = CROQUI_ALTURA_DESENHO + 44;

  for (const cartao of cartoes) {
    if (y + alturaCartao > LIMITE_CONTEUDO) {
      doc.addPage();
      y = MARGEM;
      coluna = 0;
    }
    desenharCartaoCroqui(doc, colX[coluna]!, y, cartao.titulo, cartao.dados);
    coluna += 1;
    if (coluna === 3) {
      coluna = 0;
      y += alturaCartao;
    }
  }
  if (coluna !== 0) y += alturaCartao;
  doc.y = y + 10;
}

const FOTO_LARGURA = 235;
const FOTO_ALTURA = 170;

/** Registro fotográfico do dia, agrupado por OM (uma seção por OM, 3 fotos por linha) — página própria, depois dos recursos/croquis/assinaturas. */
function desenharFotos(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  const grupos = (dados.gruposFotos ?? []).filter((grupo) => grupo.fotos.length > 0);
  if (grupos.length === 0) return;

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000").text("REGISTRO FOTOGRÁFICO", MARGEM, MARGEM);
  doc.moveTo(MARGEM, doc.y + 4).lineTo(LARGURA_PAGINA - MARGEM, doc.y + 4).lineWidth(0.75).stroke();
  let y = doc.y + 16;

  const gap = 20;
  const colX = [MARGEM, MARGEM + FOTO_LARGURA + gap, MARGEM + (FOTO_LARGURA + gap) * 2];
  const alturaCartao = FOTO_ALTURA + 28;

  for (const grupo of grupos) {
    if (y + 18 > LIMITE_CONTEUDO) {
      doc.addPage();
      y = MARGEM;
    }
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor("#000000")
      .text(grupo.omNumero ? `OM ${grupo.omNumero}` : "Fotos gerais", MARGEM, y);
    y = doc.y + 8;

    let coluna = 0;
    for (const foto of grupo.fotos) {
      if (y + alturaCartao > LIMITE_CONTEUDO) {
        doc.addPage();
        y = MARGEM;
        coluna = 0;
      }
      const x = colX[coluna]!;
      try {
        doc.image(foto.imagem, x, y, { fit: [FOTO_LARGURA, FOTO_ALTURA], align: "center", valign: "center" });
      } catch {
        // Arquivo corrompido/formato inesperado — pula a imagem em vez de derrubar a geração do PDF inteiro.
      }
      if (foto.legenda) {
        doc
          .font("Helvetica")
          .fontSize(7)
          .fillColor("#000000")
          .text(foto.legenda, x, y + FOTO_ALTURA + 2, { width: FOTO_LARGURA });
      }
      coluna += 1;
      if (coluna === 3) {
        coluna = 0;
        y += alturaCartao;
      }
    }
    if (coluna !== 0) y += alturaCartao;
    y += 12;
  }
}

async function desenharRodape(doc: PDFKit.PDFDocument, dados: RdoPdfDados): Promise<void> {
  garantirEspaco(doc, 130);
  const y0 = doc.y + 16;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#000000")
    .text("SE NÃO FOR SEGURO, NÃO FAÇA", MARGEM, y0, { width: LARGURA_UTIL, align: "center" });

  const yAssinaturas = y0 + 40;
  const colLargura = LARGURA_UTIL / 2 - 20;
  desenharBlocoAssinatura(doc, MARGEM, yAssinaturas, colLargura, "Responsável ENGECOM (Encarregado)", dados.assinaturaEncarregado);

  const xVale = MARGEM + colLargura + 40;
  desenharBlocoAssinatura(doc, xVale, yAssinaturas, colLargura, "Responsável VALE (Fiscal)", dados.assinaturaFiscal);

  const qrDataUrl = await QRCode.toBuffer(dados.urlVerificacao, { margin: 0, width: 90 });
  const algumaAssinatura = dados.assinaturaEncarregado != null || dados.assinaturaFiscal != null;
  const qrY = yAssinaturas + (algumaAssinatura ? 36 : 24);
  doc.image(qrDataUrl, MARGEM, qrY, { width: 60, height: 60 });
  doc
    .font("Helvetica")
    .fontSize(6)
    .fillColor("#000000")
    .text("Escaneie para validar a autenticidade deste documento", MARGEM + 64, qrY + 4, { width: LARGURA_UTIL - 64 })
    .text(dados.urlVerificacao, MARGEM + 64, doc.y + 2, { width: LARGURA_UTIL - 64 });
}

/**
 * Gera o PDF do RDO em paisagem, no modelo do RDO489 (referência de outro
 * sistema, adaptada — ver comentários de cada seção): página 1 é o
 * cabeçalho + a tabela única de horário/atividades; página 2 são os
 * recursos do dia (materiais/equipamentos/mão de obra em tabelas simples
 * lado a lado), croquis, observações e assinaturas; página 3 (só quando
 * há foto) é o registro fotográfico, agrupado por OM.
 */
export async function gerarPdfRdo(dados: RdoPdfDados): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: MARGEM, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const fim = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  desenharCabecalho(doc, dados);
  desenharIdentificacao(doc, dados);
  desenharTabelaUnificada(doc, dados, doc.y);
  desenharResumoHoras(doc, dados, doc.y);

  doc.addPage();
  desenharRecursos(doc, dados);
  desenharCroquis(doc, dados);
  desenharObservacoes(doc, dados);
  await desenharRodape(doc, dados);

  desenharFotos(doc, dados);

  doc.end();
  return fim;
}

/**
 * Hash de autenticidade do RDO — do CONTEÚDO (frente, equipe, atividades,
 * mão de obra etc.), não dos bytes do PDF gerado. Assim, gerar o PDF de novo
 * sem nada ter mudado dá o mesmo hash (o QR de uma via antiga continua
 * validando), e qualquer alteração real no RDO muda o hash (a via antiga
 * passa a apontar para dados desatualizados).
 */
export function calcularHashConteudo(conteudo: RdoConteudo): string {
  return createHash("sha256").update(JSON.stringify(conteudo)).digest("hex");
}
