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
  statusOm: "EM_ANDAMENTO" | "CONCLUIDA" | null;
  maoDeObra: RdoPdfAtividadeMaoDeObraItem[];
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
  observacoesContratada: string | null;
  observacoesCliente: string | null;
}

export interface RdoPdfAssinatura {
  imagem: Buffer;
  nome: string;
  data: Date;
}

/** `RdoConteudo` + a URL de verificação (que já embute o hash desse conteúdo) — o que o desenho do PDF efetivamente usa. */
export interface RdoPdfDados extends RdoConteudo {
  urlVerificacao: string;
  assinaturaEncarregado?: RdoPdfAssinatura | null;
  assinaturaFiscal?: RdoPdfAssinatura | null;
}

const MARGEM = 28;
const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;
const LARGURA_COLUNA_ESQUERDA = 340;
const LARGURA_COLUNA_DIREITA = LARGURA_UTIL - LARGURA_COLUNA_ESQUERDA - 12;
const X_COLUNA_DIREITA = MARGEM + LARGURA_COLUNA_ESQUERDA + 12;

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function garantirEspaco(doc: PDFKit.PDFDocument, alturaNecessaria: number): void {
  const limite = ALTURA_PAGINA - MARGEM - 90;
  if (doc.y + alturaNecessaria > limite) {
    doc.addPage();
  }
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

  const y0 = MARGEM + alturaTitulo + 10;
  doc.moveTo(MARGEM, y0).lineTo(LARGURA_PAGINA - MARGEM, y0).lineWidth(0.75).strokeColor("#000000").stroke();
  doc.y = y0 + 8;
}

/** Desenha um campo "RÓTULO" em cima do valor embaixo, dentro de `largura`, e devolve o y logo abaixo do que foi desenhado (para o chamador avançar corretamente, em vez de supor uma altura fixa). */
function desenharCampo(doc: PDFKit.PDFDocument, x: number, y: number, largura: number, rotulo: string, valor: string): number {
  doc.font("Helvetica-Bold").fontSize(8);
  const alturaRotulo = doc.heightOfString(rotulo, { width: largura });
  doc.text(rotulo, x, y, { width: largura, lineBreak: false });

  doc.font("Helvetica").fontSize(9);
  const yValor = y + alturaRotulo + 2;
  const alturaValor = doc.heightOfString(valor || "—", { width: largura });
  doc.text(valor || "—", x, yValor, { width: largura });

  return yValor + alturaValor;
}

/** Desenha duas colunas (rótulo/valor) lado a lado e devolve o y abaixo da mais alta das duas. */
function desenharLinhaDupla(
  doc: PDFKit.PDFDocument,
  y: number,
  colLargura: number,
  esquerda: [string, string],
  direita: [string, string],
): number {
  const yEsq = desenharCampo(doc, MARGEM, y, colLargura, esquerda[0], esquerda[1]);
  const yDir = desenharCampo(doc, MARGEM + colLargura + 16, y, colLargura, direita[0], direita[1]);
  return Math.max(yEsq, yDir) + 6;
}

function desenharIdentificacao(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  const colLargura = LARGURA_UTIL / 2 - 8;
  const diaSemana = DIAS_SEMANA[dados.data.getUTCDay()];
  const tempoLabel = dados.clima === "SOL" ? "SOL" : dados.clima === "CHUVA" ? "CHUVA" : dados.clima === "NUBLADO" ? "NUBLADO" : "—";
  const horaExtra =
    dados.horaExtraInicio && dados.horaExtraFim ? `${dados.horaExtraInicio} às ${dados.horaExtraFim}` : "—";

  let y = doc.y;
  y = desenharLinhaDupla(doc, y, colLargura, ["ENCARREGADO", dados.encarregadoNome ?? "—"], [
    "DATA",
    `${formatarData(dados.data)}  (${diaSemana})`,
  ]);
  y = desenharLinhaDupla(doc, y, colLargura, ["EQUIPE", dados.equipeNome], ["TEMPO", tempoLabel]);
  y = desenharLinhaDupla(doc, y, colLargura, ["DISTRITO", dados.frenteNome], ["HORA EXTRA", horaExtra]);

  const locaisTexto = dados.locais
    .map((local) => `${local.descricao}${local.lado ? ` ${local.lado}` : ""}`)
    .join("; ");
  y = desenharCampo(doc, MARGEM, y, LARGURA_UTIL, "LOCAL DA ATIVIDADE", locaisTexto || "—") + 8;

  doc.moveTo(MARGEM, y).lineTo(LARGURA_PAGINA - MARGEM, y).lineWidth(0.75).stroke();
  doc.y = y + 8;
}

interface LinhaTabela {
  inicial: string;
  final: string;
  item: string;
  descricao: string;
  unidade: string;
  quantidade: string;
}

function montarLinhasTabela(dados: RdoPdfDados): LinhaTabela[] {
  const linhas: LinhaTabela[] = dados.blocosHorario
    .slice()
    .sort((a, b) => a.ordem - b.ordem)
    .map((bloco) => ({
      inicial: bloco.horarioInicial,
      final: bloco.horarioFinal,
      item: "",
      descricao: bloco.descricao,
      unidade: "",
      quantidade: "",
    }));

  for (const local of dados.locais) {
    for (const atividade of local.atividades) {
      const km =
        atividade.kmInicial != null && atividade.kmFinal != null
          ? ` Km ${atividade.kmInicial} ao ${atividade.kmFinal}${local.lado ? ` ${local.lado}` : ""}`
          : "";
      const maoDeObra =
        atividade.maoDeObra.length > 0
          ? ` — MO: ${atividade.maoDeObra.map((item) => `${item.quantidade} ${item.funcao}`).join(", ")}`
          : "";
      const statusOm =
        atividade.statusOm === "CONCLUIDA" ? " [OM concluída]" : atividade.statusOm === "EM_ANDAMENTO" ? " [OM em andamento]" : "";
      linhas.push({
        inicial: atividade.horarioInicial ?? "",
        final: atividade.horarioFinal ?? "",
        item: atividade.item,
        descricao: `${atividade.descricao} — ${local.descricao}${km}${maoDeObra}${statusOm}`,
        unidade: atividade.unidade,
        quantidade: formatarNumero(atividade.quantidade),
      });
    }
  }

  return linhas;
}

const COL_INICIAL = 32;
const COL_FINAL = 32;
const COL_ITEM = 34;
const COL_UNID = 30;
const COL_QTD = 50;
const COL_DESCRICAO =
  LARGURA_COLUNA_ESQUERDA - COL_INICIAL - COL_FINAL - COL_ITEM - COL_UNID - COL_QTD;

function desenharCabecalhoTabela(doc: PDFKit.PDFDocument, y: number): number {
  doc.font("Helvetica-Bold").fontSize(7);
  let x = MARGEM;
  const linhas = [
    ["INÍCIO", COL_INICIAL],
    ["FIM", COL_FINAL],
    ["ITEM", COL_ITEM],
    ["DESCRIÇÃO DAS ATIVIDADES", COL_DESCRICAO],
    ["UNID", COL_UNID],
    ["QTD", COL_QTD],
  ] as const;
  for (const [texto, largura] of linhas) {
    doc.text(texto, x + 2, y, { width: largura - 2 });
    x += largura;
  }
  const yLinha = y + 12;
  doc.moveTo(MARGEM, yLinha).lineTo(MARGEM + LARGURA_COLUNA_ESQUERDA, yLinha).lineWidth(0.5).stroke();
  return yLinha + 3;
}

function desenharTabelaAtividades(doc: PDFKit.PDFDocument, dados: RdoPdfDados, yInicial: number): void {
  const linhas = montarLinhasTabela(dados);
  let y = desenharCabecalhoTabela(doc, yInicial);

  doc.font("Helvetica").fontSize(7.5);
  if (linhas.length === 0) {
    doc.text("Nenhuma atividade lançada.", MARGEM + 2, y, { width: LARGURA_COLUNA_ESQUERDA - 4 });
    return;
  }

  for (const linha of linhas) {
    const alturaDescricao = doc.heightOfString(linha.descricao, { width: COL_DESCRICAO - 4 });
    const alturaLinha = Math.max(11, alturaDescricao + 2);

    if (y + alturaLinha > ALTURA_PAGINA - MARGEM - 90) {
      doc.addPage();
      y = desenharCabecalhoTabela(doc, MARGEM);
    }

    let x = MARGEM;
    doc.text(linha.inicial, x + 2, y, { width: COL_INICIAL - 2 });
    x += COL_INICIAL;
    doc.text(linha.final, x + 2, y, { width: COL_FINAL - 2 });
    x += COL_FINAL;
    doc.text(linha.item, x + 2, y, { width: COL_ITEM - 2 });
    x += COL_ITEM;
    doc.text(linha.descricao, x + 2, y, { width: COL_DESCRICAO - 4 });
    x += COL_DESCRICAO;
    doc.text(linha.unidade, x + 2, y, { width: COL_UNID - 2 });
    x += COL_UNID;
    doc.text(linha.quantidade, x + 2, y, { width: COL_QTD - 4, align: "right" });

    y += alturaLinha + 2;
  }

  doc.y = y;
}

function desenharListaChecklist(doc: PDFKit.PDFDocument, titulo: string, x: number, y: number, itens: { nome: string; quantidade: number }[]): number {
  doc.font("Helvetica-Bold").fontSize(8).text(titulo, x, y, { width: LARGURA_COLUNA_DIREITA });
  let atual = doc.y + 2;
  doc.font("Helvetica").fontSize(8);
  if (itens.length === 0) {
    doc.text("—", x, atual);
    return doc.y;
  }
  for (const item of itens) {
    doc.text(`( ${item.quantidade} ) ${item.nome.toUpperCase()}`, x, atual, { width: LARGURA_COLUNA_DIREITA });
    atual = doc.y;
  }
  return atual;
}

function desenharColunaDireita(doc: PDFKit.PDFDocument, dados: RdoPdfDados, yInicial: number): void {
  let y = yInicial;
  y = desenharListaChecklist(
    doc,
    "MÃO DE OBRA DIRETA / INDIRETA",
    X_COLUNA_DIREITA,
    y,
    dados.maoDeObra.map((item) => ({ nome: item.funcao, quantidade: item.quantidade })),
  );
  y += 8;
  desenharListaChecklist(
    doc,
    "OUTROS CUSTOS INDIRETOS",
    X_COLUNA_DIREITA,
    y,
    dados.equipamentos.map((item) => ({ nome: item.nome, quantidade: item.quantidade })),
  );
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

/** Texto do memorial de cálculo (fórmula = resultado), mesma matemática de `calcularTotalAtividade` (packages/shared) e do croqui exibido no formulário (CroquiAtividade.tsx). */
function montarMemorialCalculo(atividade: RdoPdfAtividade): string | null {
  const { unidade, altura: a, largura: l, larguraFinal: lFim, comprimento: c, quantidade } = atividade;
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

const CROQUI_LARGURA = 250;
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

/** Uma "carta" de croqui + memorial de cálculo para uma atividade, dentro de `largura`. Devolve a altura ocupada. */
function desenharCartaoCroqui(doc: PDFKit.PDFDocument, x: number, y: number, atividade: RdoPdfAtividade): number {
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
    .fillColor("#000000")
    .text(`${atividade.item} — ${atividade.descricao}`, x, y, { width: CROQUI_LARGURA });
  const yDesenho = doc.y + 4;

  if (atividade.unidade === "M3") {
    desenharCroquiCaixa(doc, x, yDesenho, atividade.altura, atividade.largura, atividade.comprimento);
  } else if (atividade.unidade === "M2") {
    desenharCroquiRetangulo(doc, x, yDesenho, atividade.largura, atividade.larguraFinal, atividade.comprimento);
  } else {
    desenharCroquiLinha(doc, x, yDesenho, atividade.comprimento);
  }

  const yFormula = yDesenho + CROQUI_ALTURA_DESENHO + 4;
  const memorial = montarMemorialCalculo(atividade);
  doc
    .font("Helvetica")
    .fontSize(7.5)
    .fillColor("#2c3d33")
    .text(memorial ?? "Dimensões não informadas.", x, yFormula, { width: CROQUI_LARGURA });

  return doc.y - y;
}

/** Croquis e memorial de cálculo de cada atividade que usa dimensões (M/M2/M3) — página própria, 2 por linha. */
function desenharCroquis(doc: PDFKit.PDFDocument, dados: RdoPdfDados): void {
  const atividades = dados.locais.flatMap((local) => local.atividades).filter((atividade) => atividade.usaDimensoes);
  if (atividades.length === 0) return;

  doc.addPage();
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#000000").text("CROQUIS E MEMORIAL DE CÁLCULO", MARGEM, MARGEM);
  doc.moveTo(MARGEM, doc.y + 4).lineTo(LARGURA_PAGINA - MARGEM, doc.y + 4).lineWidth(0.75).stroke();

  const gap = 20;
  const colX = [MARGEM, MARGEM + CROQUI_LARGURA + gap];
  let coluna = 0;
  let y = doc.y + 16;
  const alturaCartao = CROQUI_ALTURA_DESENHO + 44;

  for (const atividade of atividades) {
    if (y + alturaCartao > ALTURA_PAGINA - MARGEM) {
      doc.addPage();
      y = MARGEM;
      coluna = 0;
    }
    desenharCartaoCroqui(doc, colX[coluna]!, y, atividade);
    if (coluna === 0) {
      coluna = 1;
    } else {
      coluna = 0;
      y += alturaCartao;
    }
  }
}

async function desenharRodape(doc: PDFKit.PDFDocument, dados: RdoPdfDados): Promise<void> {
  garantirEspaco(doc, 130);
  const y0 = doc.y + 16;
  doc
    .font("Helvetica-Bold")
    .fontSize(8)
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
    .text("Escaneie para validar a autenticidade deste documento", MARGEM + 64, qrY + 4, { width: LARGURA_UTIL - 64 })
    .text(dados.urlVerificacao, MARGEM + 64, doc.y + 2, { width: LARGURA_UTIL - 64 });
}

/** Gera o PDF do RDO no layout do relatório em papel da ENGECOM, com QR de verificação de autenticidade. */
export async function gerarPdfRdo(dados: RdoPdfDados): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGEM, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const fim = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  desenharCabecalho(doc, dados);
  desenharIdentificacao(doc, dados);

  const yTabelas = doc.y;
  desenharTabelaAtividades(doc, dados, yTabelas);
  desenharColunaDireita(doc, dados, yTabelas);
  doc.y = Math.max(doc.y, yTabelas + 40);

  desenharObservacoes(doc, dados);
  await desenharRodape(doc, dados);
  desenharCroquis(doc, dados);

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
