import { readFileSync } from "node:fs";
import PDFDocument from "pdfkit";

/**
 * Gera o "Check List de Conclusão de Manutenção Preventiva/Corretiva -
 * Infraestrutura" — documento oficial da Vale/EFC (a planilha "RELATÓRIO
 * FOTOGRÁFICO" que o usuário já preenche na mão hoje). Layout e textos
 * reproduzidos fielmente do modelo original (inclusive o typo
 * "Pioritária" no rodapé de treinamento, que é assim no documento oficial
 * — não é erro deste gerador).
 */
export interface RelatorioFotograficoFotoDados {
  imagem: Buffer;
  legenda: string | null;
  // Par N = ordem 2N (Antes) / 2N+1 (Depois) — ver montarOrdemPareada() em
  // routes/relatoriosFotograficos.ts. Usado aqui pra desenhar cada par como
  // uma linha da grade (Antes à esquerda, Depois à direita), não só
  // empilhar por ordem de chegada.
  ordem: number;
}

export interface RelatorioFotograficoDados {
  omNumero: string;
  dataConclusao: Date | null;
  atividadesExecutadas: boolean;
  comentarios: string | null;
  fotos: RelatorioFotograficoFotoDados[];
}

const LOGO_VALE = readFileSync(new URL("../assets/relatorio-fotografico/logo-vale.jpeg", import.meta.url));
const ICONE_ATENCAO = readFileSync(new URL("../assets/relatorio-fotografico/icone-atencao.png", import.meta.url));

const MARGEM = 40;
const LARGURA_PAGINA = 595.28;
const ALTURA_PAGINA = 841.89;
const LARGURA_UTIL = LARGURA_PAGINA - MARGEM * 2;
const RODAPE_ALTURA = 26;
const LIMITE_CONTEUDO = ALTURA_PAGINA - MARGEM - RODAPE_ALTURA;

function formatarData(data: Date): string {
  return data.toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function garantirEspaco(doc: PDFKit.PDFDocument, alturaNecessaria: number): void {
  if (doc.y + alturaNecessaria > LIMITE_CONTEUDO) {
    doc.addPage();
  }
}

function desenharCabecalho(doc: PDFKit.PDFDocument): void {
  doc.image(LOGO_VALE, MARGEM, MARGEM, { width: 110 });
  doc
    .font("Helvetica-Bold")
    .fontSize(13)
    .fillColor("#000000")
    .text("Check List de Conclusão de Manutenção Preventiva - Infraestrutura", MARGEM, MARGEM + 40, {
      width: LARGURA_UTIL,
      align: "center",
    });
  doc.y = MARGEM + 70;

  doc
    .font("Helvetica")
    .fontSize(7)
    .fillColor("#444444")
    .text(
      "Diretoria Emitente: Corredor Norte\n" +
        "Responsável Técnico: Ubiratan Melo, Mat: 01483962, Gerência de Infraestrutura, Força e Energia\n" +
        "Público Alvo: Contratada, Técnicos, Fiscais de Contrato e Inspetores da Infraestrutura",
      MARGEM,
      doc.y,
      { width: LARGURA_UTIL },
    );
  doc
    .fontSize(7)
    .text("Necessidade de Treinamento: (  ) SIM   ( X ) NÃO          Tarefa Pioritária: ( X ) SIM   (  ) NÃO", MARGEM, doc.y + 2);
  doc.y += 10;

  doc.moveTo(MARGEM, doc.y).lineTo(LARGURA_PAGINA - MARGEM, doc.y).lineWidth(0.75).strokeColor("#000000").stroke();
  doc.y += 8;
}

function desenharAtencao(doc: PDFKit.PDFDocument): void {
  const y0 = doc.y;
  doc.image(ICONE_ATENCAO, MARGEM, y0, { width: 16 });
  doc.font("Helvetica-Bold").fontSize(9).fillColor("#b45309").text("ATENÇÃO !", MARGEM + 22, y0 + 2);
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor("#000000")
    .text(
      "Este documento deve ser preferencialmente elaborado pela Contratada ou pela Fiscalização e no encerramento " +
        "técnico das ordens de manutenção corretivas de infraestrutura é recomendado conter este anexo que será " +
        "considerado validado pelo Inspetor.",
      MARGEM,
      Math.max(doc.y, y0 + 16),
      { width: LARGURA_UTIL },
    );
  doc.y += 6;

  doc
    .font("Helvetica-Oblique")
    .fontSize(8)
    .text(
      "Este documento tem como objetivo certificar a capacidade do item manutenido para desempenhar sua função requerida.",
      MARGEM,
      doc.y,
      { width: LARGURA_UTIL },
    );
  doc.y += 10;
}

function desenharDadosPlanejamento(doc: PDFKit.PDFDocument, dados: RelatorioFotograficoDados): void {
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text("Dados de Planejamento", MARGEM, doc.y);
  doc.moveTo(MARGEM, doc.y + 2).lineTo(LARGURA_PAGINA - MARGEM, doc.y + 2).lineWidth(0.5).stroke();
  doc.y += 10;

  const colLargura = LARGURA_UTIL / 2 - 10;
  const y0 = doc.y;
  doc.font("Helvetica-Bold").fontSize(8).text("ORDEM DE MANUTENÇÃO (OM)", MARGEM, y0);
  doc.font("Helvetica").fontSize(11).text(dados.omNumero, MARGEM, y0 + 12);

  const xData = MARGEM + colLargura + 20;
  doc.font("Helvetica-Bold").fontSize(8).text("DATA DE CONCLUSÃO", xData, y0);
  doc.font("Helvetica").fontSize(11).text(dados.dataConclusao ? formatarData(dados.dataConclusao) : "—", xData, y0 + 12);

  doc.y = y0 + 30;
  doc
    .font("Helvetica-Oblique")
    .fontSize(7)
    .fillColor("#666666")
    .text("Os dados de localização do ativo, geometria, datas e escopos devem ser consultados no SAP a partir do Nº da OM.", MARGEM, doc.y, {
      width: LARGURA_UTIL,
    });
  doc.fillColor("#000000");
  doc.y += 12;
}

function desenharChecklist(doc: PDFKit.PDFDocument, dados: RelatorioFotograficoDados): void {
  doc.font("Helvetica-Bold").fontSize(10).text("Escopos da Manutenção Corretiva", MARGEM, doc.y);
  doc.moveTo(MARGEM, doc.y + 2).lineTo(LARGURA_PAGINA - MARGEM, doc.y + 2).lineWidth(0.5).stroke();
  doc.y += 10;

  doc.font("Helvetica").fontSize(8).text("Certifique os dados abaixo para encerramento técnico da OM:", MARGEM, doc.y);
  doc.y += 12;

  doc.font("Helvetica-Bold").fontSize(8).text("Validação sob aspecto de confiabilidade do ativo", MARGEM, doc.y);
  const yItem = doc.y + 14;
  const xCaixa = LARGURA_PAGINA - MARGEM - 14;
  doc.rect(xCaixa, yItem - 2, 10, 10).lineWidth(0.75).stroke();
  if (dados.atividadesExecutadas) {
    doc.font("Helvetica-Bold").fontSize(9).text("X", xCaixa + 1.5, yItem - 2);
  }
  doc
    .font("Helvetica")
    .fontSize(8)
    .text("1. * Todas as atividades listadas na OM foram executadas;", MARGEM, yItem, { width: LARGURA_UTIL - 30 });
  doc.y = yItem + 16;
}

function desenharComentarios(doc: PDFKit.PDFDocument, dados: RelatorioFotograficoDados): void {
  doc.font("Helvetica-Bold").fontSize(10).text("Comentários:", MARGEM, doc.y);
  doc.y += 12;
  // 85pt — mede com a caixa de comentário do Excel original (merge D30:AB33,
  // 4 linhas de ~20pt cada), em vez de um valor arbitrário.
  const alturaCaixa = 85;
  doc.rect(MARGEM, doc.y, LARGURA_UTIL, alturaCaixa).lineWidth(0.5).stroke();
  doc
    .font("Helvetica")
    .fontSize(8)
    .text(dados.comentarios ?? "", MARGEM + 6, doc.y + 6, { width: LARGURA_UTIL - 12, height: alturaCaixa - 12 });
  doc.y += alturaCaixa + 6;
  doc
    .font("Helvetica-Oblique")
    .fontSize(7)
    .fillColor("#666666")
    .text(
      "Informe sobre situação de riscos, pendências ou melhorias. Em caso de pendências ou riscos deve ser aberto NM para tratamento.",
      MARGEM,
      doc.y,
      { width: LARGURA_UTIL },
    );
  doc.fillColor("#000000");
  doc.y += 14;
}

const FOTO_LARGURA = (LARGURA_UTIL - 20) / 2;
const FOTO_ALTURA = 150;

function desenharFotos(doc: PDFKit.PDFDocument, dados: RelatorioFotograficoDados): void {
  doc.font("Helvetica-Bold").fontSize(10).text("Registro fotográfico:", MARGEM, doc.y);
  doc.y += 12;

  if (dados.fotos.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#666666").text("Nenhuma foto anexada.", MARGEM, doc.y);
    doc.fillColor("#000000");
    doc.y += 14;
    return;
  }

  // Agrupa por par (ver RelatorioFotograficoFotoDados.ordem) — cada par
  // vira uma linha da grade, Antes sempre à esquerda e Depois à direita,
  // com uma caixa vazia do lado que ainda não tem foto (em vez de deixar o
  // Antes e o Depois do mesmo item longe um do outro quando um dos dois
  // falta ou chega fora de ordem — bug real visto em produção).
  const porPar = new Map<number, { antes?: RelatorioFotograficoFotoDados; depois?: RelatorioFotograficoFotoDados }>();
  for (const foto of dados.fotos) {
    const parIndice = Math.floor(foto.ordem / 2);
    const atual = porPar.get(parIndice) ?? {};
    if (foto.ordem % 2 === 0) atual.antes = foto;
    else atual.depois = foto;
    porPar.set(parIndice, atual);
  }
  const pares = [...porPar.entries()].sort(([a], [b]) => a - b).map(([, par]) => par);

  const colX = [MARGEM, MARGEM + FOTO_LARGURA + 20];
  const alturaCartao = FOTO_ALTURA + 22;

  for (const par of pares) {
    garantirEspaco(doc, alturaCartao);
    const y = doc.y;
    for (const [coluna, foto] of [par.antes, par.depois].entries()) {
      const x = colX[coluna]!;
      doc.rect(x, y, FOTO_LARGURA, FOTO_ALTURA).lineWidth(0.5).strokeColor("#cccccc").stroke();
      if (!foto) continue;
      try {
        doc.image(foto.imagem, x, y, { fit: [FOTO_LARGURA, FOTO_ALTURA], align: "center", valign: "center" });
      } catch {
        // Arquivo corrompido/formato inesperado — mantém o quadro vazio em vez de derrubar a geração do PDF.
      }
      const rotulo = foto.legenda ?? (coluna === 0 ? "Antes" : "Depois");
      doc.font("Helvetica").fontSize(7).fillColor("#000000").text(rotulo, x, y + FOTO_ALTURA + 2, { width: FOTO_LARGURA });
    }
    doc.y = y + alturaCartao;
  }
}

function desenharRodapes(doc: PDFKit.PDFDocument): void {
  const paginas = doc.bufferedPageRange();
  for (let i = 0; i < paginas.count; i++) {
    doc.switchToPage(paginas.start + i);
    // Zera a margem inferior da página antes de escrever bem no fim dela —
    // sem isso o pdfkit insere uma página nova só pra essa linha (entende
    // que ela "não cabe" antes da margem, mesmo com lineBreak: false, que só
    // evita quebra horizontal, não a paginação automática vertical).
    const margemInferiorOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const y = ALTURA_PAGINA - MARGEM - 16;
    doc.moveTo(MARGEM, y).lineTo(LARGURA_PAGINA - MARGEM, y).lineWidth(0.5).strokeColor("#000000").stroke();
    doc
      .font("Helvetica")
      .fontSize(6)
      .fillColor("#000000")
      .text("Checklist de Conclusão de Manutenção Corretiva - Infraestrutura da EFC", MARGEM, y + 3, {
        width: LARGURA_UTIL,
        lineBreak: false,
      });
    doc.text(`Rev.: 00 - 15/12/2023 - Classificação: Uso Interno - Pág. ${i + 1} de ${paginas.count}`, MARGEM, y + 10, {
      width: LARGURA_UTIL,
      lineBreak: false,
    });

    doc.page.margins.bottom = margemInferiorOriginal;
  }
}

export async function gerarRelatorioFotograficoPdf(dados: RelatorioFotograficoDados): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: MARGEM, bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const fim = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  desenharCabecalho(doc);
  desenharAtencao(doc);
  desenharDadosPlanejamento(doc, dados);
  desenharChecklist(doc, dados);
  desenharComentarios(doc, dados);
  desenharFotos(doc, dados);
  desenharRodapes(doc);

  doc.end();
  return fim;
}
