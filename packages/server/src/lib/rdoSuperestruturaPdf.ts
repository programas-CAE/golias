import PDFDocument from "pdfkit";

/**
 * Gera o "Relatório Diário de Obra" da equipe de Superestrutura (manutenção
 * de via férrea — dormente, trilho, "Linha"+km, sem Ordem de Manutenção),
 * a partir do formulário em papel próprio dessa equipe. Autocontido, sem
 * reaproveitar o layout de rdoPdf.ts (que é pra Preventiva/Corretiva/
 * Terraplenagem) nem de relatorioFotograficoPdf.ts (documento oficial da
 * Vale) — layout novo, seguindo o papel.
 *
 * "ENGECOM"/"VALE S/A" ficam fixos igual ao resto do sistema hoje (mesma
 * convenção de rdoPdf.ts) — quando outro contrato/cliente entrar, isso
 * precisa virar dado (Contrato/Frente), não texto fixo.
 */

export interface RdoSuperestruturaPdfTemperatura {
  hora: string;
  temperaturaC: number | null;
}

export interface RdoSuperestruturaPdfServico {
  codigo: string | null;
  descricao: string;
  unidade: string | null;
  quantidade: number | null;
  linha: string | null;
  kmInicial: number | null;
  kmFinal: number | null;
}

export interface RdoSuperestruturaPdfMaoDeObraItem {
  funcao: string;
  quantidade: number;
}

export interface RdoSuperestruturaPdfEquipamentoItem {
  nome: string;
  quantidade: number;
}

export interface RdoSuperestruturaPdfMaterialItem {
  nome: string;
  unidade: string;
  quantidade: number;
}

export interface RdoSuperestruturaPdfAssinatura {
  imagem: Buffer;
  nome: string;
  data: Date;
}

export interface RdoSuperestruturaPdfDados {
  numeroSap: string | null;
  liderNome: string | null;
  frenteNome: string;
  equipeNome: string;
  data: Date;
  intervaloProgramadoInicio: string | null;
  intervaloProgramadoFim: string | null;
  intervaloRealizadoInicio: string | null;
  intervaloRealizadoFim: string | null;
  tempoTotalPerdas: string | null;
  leiturasTemperatura: RdoSuperestruturaPdfTemperatura[];
  maoDeObra: RdoSuperestruturaPdfMaoDeObraItem[];
  equipamentos: RdoSuperestruturaPdfEquipamentoItem[];
  materiais: RdoSuperestruturaPdfMaterialItem[];
  servicos: RdoSuperestruturaPdfServico[];
  observacoesContratada: string | null;
  observacoesCliente: string | null;
  urlVerificacao: string;
  assinaturaEncarregado?: RdoSuperestruturaPdfAssinatura | null;
  assinaturaFiscal?: RdoSuperestruturaPdfAssinatura | null;
}

const MARGEM = 28;
const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;

function formatarData(data: Date): string {
  const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"] as const;
  return `${data.toLocaleDateString("pt-BR", { timeZone: "UTC" })} (${DIAS_SEMANA[data.getUTCDay()]})`;
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function garantirEspaco(doc: PDFKit.PDFDocument, alturaNecessaria: number): void {
  if (doc.y + alturaNecessaria > ALTURA_PAGINA - MARGEM - 90) {
    doc.addPage();
  }
}

function desenharCampo(doc: PDFKit.PDFDocument, x: number, y: number, largura: number, rotulo: string, valor: string): number {
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#666666").text(rotulo, x, y, { width: largura });
  doc.font("Helvetica").fontSize(9).fillColor("#000000").text(valor || "—", x, doc.y, { width: largura });
  return doc.y;
}

function desenharCabecalho(doc: PDFKit.PDFDocument, dados: RdoSuperestruturaPdfDados): void {
  doc.font("Helvetica-Bold").fontSize(9).text("ENGECOM", MARGEM, MARGEM, { lineBreak: false });
  doc
    .fontSize(9)
    .text(`Nº SAP: ${dados.numeroSap ?? "—"}`, MARGEM, MARGEM, { width: LARGURA_UTIL, align: "right", lineBreak: false });

  // Título em duas linhas (em vez de uma linha só com "—" no meio) — o
  // texto completo numa linha só, centralizado, colidia com o "Nº SAP" no
  // canto direito quando o nome do tipo era mais longo (Superestrutura).
  doc.fontSize(14).text("RELATÓRIO DIÁRIO DE OBRA", MARGEM, MARGEM + 14, { width: LARGURA_UTIL, align: "center" });
  doc.fontSize(11).text("SUPERESTRUTURA", MARGEM, doc.y, { width: LARGURA_UTIL, align: "center" });

  const y0 = doc.y + 10;
  doc.moveTo(MARGEM, y0).lineTo(LARGURA_PAGINA - MARGEM, y0).lineWidth(0.75).strokeColor("#000000").stroke();
  doc.y = y0 + 8;

  const colLargura = LARGURA_UTIL / 4 - 6;
  const yLinha1 = doc.y;
  const fimContratada = desenharCampo(doc, MARGEM, yLinha1, colLargura, "CONTRATADA", "ENGECOM ENGENHARIA E COMÉRCIO LTDA");
  const fimContratante = desenharCampo(doc, MARGEM + colLargura + 8, yLinha1, colLargura, "CONTRATANTE", "VALE S/A");
  const fimDistrito = desenharCampo(doc, MARGEM + 2 * (colLargura + 8), yLinha1, colLargura, "DISTRITO", dados.frenteNome);
  const fimData = desenharCampo(doc, MARGEM + 3 * (colLargura + 8), yLinha1, colLargura, "DATA", formatarData(dados.data));
  // Cada campo pode quebrar em altura diferente (ex.: razão social da
  // Contratada é mais longa que "VALE S/A") — a linha de baixo só pode
  // começar depois do mais alto dos quatro, senão o texto que quebrou em
  // 2 linhas fica por baixo da linha seguinte.
  const yLinha2 = Math.max(fimContratada, fimContratante, fimDistrito, fimData) + 8;

  desenharCampo(doc, MARGEM, yLinha2, colLargura, "EQUIPE", dados.equipeNome);
  const fimLider = desenharCampo(doc, MARGEM + colLargura + 8, yLinha2, colLargura, "LÍDER", dados.liderNome ?? "—");

  doc.y = fimLider + 10;
  doc.moveTo(MARGEM, doc.y).lineTo(LARGURA_PAGINA - MARGEM, doc.y).lineWidth(0.5).strokeColor("#cccccc").stroke();
  doc.y += 8;
}

function desenharTemperaturas(doc: PDFKit.PDFDocument, dados: RdoSuperestruturaPdfDados): void {
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000").text("TEMPERATURA / HORA", MARGEM, doc.y);
  doc.y += 6;
  if (dados.leiturasTemperatura.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666666").text("Nenhuma leitura registrada.", MARGEM, doc.y);
    doc.fillColor("#000000");
    doc.y += 10;
    return;
  }
  const texto = dados.leiturasTemperatura
    .map((l) => `${l.hora}${l.temperaturaC != null ? ` — ${formatarNumero(l.temperaturaC)}°C` : ""}`)
    .join("     ");
  doc.font("Helvetica").fontSize(8).text(texto, MARGEM, doc.y, { width: LARGURA_UTIL });
  doc.y += 10;
}

function desenharIntervalos(doc: PDFKit.PDFDocument, dados: RdoSuperestruturaPdfDados): void {
  doc.font("Helvetica-Bold").fontSize(9).text("INTERVALOS", MARGEM, doc.y);
  doc.y += 6;
  const colLargura = LARGURA_UTIL / 3 - 6;
  const y0 = doc.y;
  const fim1 = desenharCampo(
    doc,
    MARGEM,
    y0,
    colLargura,
    "PROGRAMADO (INÍCIO/FIM)",
    `${dados.intervaloProgramadoInicio ?? "—"} / ${dados.intervaloProgramadoFim ?? "—"}`,
  );
  const fim2 = desenharCampo(
    doc,
    MARGEM + colLargura + 8,
    y0,
    colLargura,
    "REALIZADO (INÍCIO/FIM)",
    `${dados.intervaloRealizadoInicio ?? "—"} / ${dados.intervaloRealizadoFim ?? "—"}`,
  );
  const fim3 = desenharCampo(doc, MARGEM + 2 * (colLargura + 8), y0, colLargura, "TEMPO TOTAL POR PERDAS", dados.tempoTotalPerdas ?? "—");
  doc.y = Math.max(fim1, fim2, fim3) + 10;
}

function desenharListaDuasColunas(
  doc: PDFKit.PDFDocument,
  titulo1: string,
  itens1: string[],
  titulo2: string,
  itens2: string[],
): void {
  const colLargura = LARGURA_UTIL / 2 - 8;
  const y0 = doc.y;

  doc.font("Helvetica-Bold").fontSize(9).text(titulo1, MARGEM, y0);
  let y1 = doc.y + 4;
  doc.font("Helvetica").fontSize(8);
  for (const item of itens1) {
    doc.text(`• ${item}`, MARGEM, y1, { width: colLargura });
    y1 = doc.y + 2;
  }
  if (itens1.length === 0) {
    doc.font("Helvetica-Oblique").fillColor("#666666").text("—", MARGEM, y1, { width: colLargura });
    y1 = doc.y + 2;
    doc.fillColor("#000000");
  }

  const x2 = MARGEM + colLargura + 16;
  doc.font("Helvetica-Bold").fontSize(9).text(titulo2, x2, y0);
  let y2 = doc.y + 4;
  doc.font("Helvetica").fontSize(8);
  for (const item of itens2) {
    doc.text(`• ${item}`, x2, y2, { width: colLargura });
    y2 = doc.y + 2;
  }
  if (itens2.length === 0) {
    doc.font("Helvetica-Oblique").fillColor("#666666").text("—", x2, y2, { width: colLargura });
    y2 = doc.y + 2;
    doc.fillColor("#000000");
  }

  doc.y = Math.max(y1, y2) + 8;
}

const COL_CODIGO = 45;
const COL_UNID = 35;
const COL_QTD = 45;
const COL_LINHA = 60;
const COL_KM = 90;
const COL_DESCRICAO = LARGURA_UTIL - COL_CODIGO - COL_UNID - COL_QTD - COL_LINHA - COL_KM;

function desenharTabelaServicos(doc: PDFKit.PDFDocument, dados: RdoSuperestruturaPdfDados): void {
  doc.font("Helvetica-Bold").fontSize(9).text("SERVIÇOS EXECUTADOS", MARGEM, doc.y);
  doc.y += 8;

  const y0 = doc.y;
  let x = MARGEM;
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#000000");
  for (const [largura, texto] of [
    [COL_CODIGO, "CÓDIGO"],
    [COL_DESCRICAO, "DESCRIÇÃO"],
    [COL_UNID, "UNID"],
    [COL_QTD, "QTD"],
    [COL_LINHA, "LINHA"],
    [COL_KM, "KM INIC/FIM"],
  ] as [number, string][]) {
    doc.text(texto, x + 2, y0, { width: largura - 4 });
    x += largura;
  }
  doc.y = y0 + 12;
  doc.moveTo(MARGEM, doc.y).lineTo(LARGURA_PAGINA - MARGEM, doc.y).lineWidth(0.5).strokeColor("#000000").stroke();
  doc.y += 4;

  if (dados.servicos.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666666").text("Nenhum serviço lançado.", MARGEM, doc.y);
    doc.fillColor("#000000");
    doc.y += 12;
    return;
  }

  doc.font("Helvetica").fontSize(7.5);
  for (const servico of dados.servicos) {
    const alturaDescricao = doc.heightOfString(servico.descricao, { width: COL_DESCRICAO - 4 });
    const alturaLinha = Math.max(alturaDescricao, 10) + 4;
    garantirEspaco(doc, alturaLinha);
    const y = doc.y;
    let xCol = MARGEM;
    doc.text(servico.codigo ?? "—", xCol + 2, y, { width: COL_CODIGO - 4 });
    xCol += COL_CODIGO;
    doc.text(servico.descricao, xCol + 2, y, { width: COL_DESCRICAO - 4 });
    xCol += COL_DESCRICAO;
    doc.text(servico.unidade ?? "—", xCol + 2, y, { width: COL_UNID - 4 });
    xCol += COL_UNID;
    doc.text(servico.quantidade != null ? formatarNumero(servico.quantidade) : "—", xCol + 2, y, { width: COL_QTD - 4 });
    xCol += COL_QTD;
    doc.text(servico.linha ?? "—", xCol + 2, y, { width: COL_LINHA - 4 });
    xCol += COL_LINHA;
    const km = servico.kmInicial != null && servico.kmFinal != null ? `${servico.kmInicial}—${servico.kmFinal}` : "—";
    doc.text(km, xCol + 2, y, { width: COL_KM - 4 });
    doc.y = y + alturaLinha;
  }
}

function desenharObservacoes(doc: PDFKit.PDFDocument, dados: RdoSuperestruturaPdfDados): void {
  garantirEspaco(doc, 60);
  const colLargura = LARGURA_UTIL / 2 - 8;
  const y0 = doc.y + 8;
  doc.font("Helvetica-Bold").fontSize(9).text("OBSERVAÇÕES CONTRATADA", MARGEM, y0);
  doc.font("Helvetica").fontSize(8).text(dados.observacoesContratada ?? "—", MARGEM, doc.y + 4, { width: colLargura });

  const x2 = MARGEM + colLargura + 16;
  doc.font("Helvetica-Bold").fontSize(9).text("OBSERVAÇÃO FISCALIZAÇÃO", x2, y0);
  doc.font("Helvetica").fontSize(8).text(dados.observacoesCliente ?? "—", x2, doc.y > y0 + 12 ? doc.y : y0 + 16, { width: colLargura });
}

function desenharBlocoAssinatura(
  doc: PDFKit.PDFDocument,
  x: number,
  y: number,
  largura: number,
  rotulo: string,
  assinatura: RdoSuperestruturaPdfAssinatura | null | undefined,
): void {
  const alturaImagem = 42;
  if (assinatura) {
    try {
      doc.image(assinatura.imagem, x, y - alturaImagem - 2, { fit: [largura, alturaImagem], align: "center" });
    } catch {
      // segue sem a imagem se o arquivo estiver corrompido
    }
  }
  doc.moveTo(x, y).lineTo(x + largura, y).lineWidth(0.75).strokeColor("#000000").stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#000000").text(rotulo, x, y + 4, { width: largura, align: "center" });
  if (assinatura) {
    doc
      .font("Helvetica")
      .fontSize(7)
      .fillColor("#666666")
      .text(`${assinatura.nome} — ${assinatura.data.toLocaleDateString("pt-BR")}`, x, doc.y, { width: largura, align: "center" });
    doc.fillColor("#000000");
  }
}

export async function gerarPdfRdoSuperestrutura(dados: RdoSuperestruturaPdfDados): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGEM, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const fim = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  desenharCabecalho(doc, dados);
  desenharTemperaturas(doc, dados);
  desenharIntervalos(doc, dados);
  desenharListaDuasColunas(
    doc,
    "EFETIVO",
    dados.maoDeObra.map((item) => `${item.quantidade} ${item.funcao}`),
    "EQUIPAMENTOS",
    dados.equipamentos.map((item) => `${item.quantidade} ${item.nome}`),
  );
  if (dados.materiais.length > 0) {
    desenharListaDuasColunas(
      doc,
      "MATERIAIS",
      dados.materiais.map((item) => `${item.quantidade} ${item.nome} (${item.unidade})`),
      "",
      [],
    );
  }
  desenharTabelaServicos(doc, dados);
  desenharObservacoes(doc, dados);

  garantirEspaco(doc, 110);
  const yAssinaturas = doc.y + 40;
  const colLargura = LARGURA_UTIL / 2 - 20;
  desenharBlocoAssinatura(doc, MARGEM, yAssinaturas, colLargura, "Responsável ENGECOM (Contratada)", dados.assinaturaEncarregado);
  desenharBlocoAssinatura(doc, MARGEM + colLargura + 40, yAssinaturas, colLargura, "Responsável VALE (Contratante)", dados.assinaturaFiscal);

  doc
    .font("Helvetica")
    .fontSize(6)
    .fillColor("#666666")
    .text(`Verificação: ${dados.urlVerificacao}`, MARGEM, yAssinaturas + 44, { width: LARGURA_UTIL });

  doc.end();
  return fim;
}
