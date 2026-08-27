// Importa o módulo interno, não "pdf-parse" (o index.js da lib roda um
// bloco de auto-teste ao ser carregado por um projeto ESM — `module.parent`
// nunca é setado nesse caso, então ele tenta ler um PDF de exemplo que só
// existe no repositório da lib, não no pacote publicado, e quebra com
// ENOENT). O `lib/pdf-parse.js` é a implementação de verdade, sem esse bloco.
import pdfParse from "pdf-parse/lib/pdf-parse.js";

export interface OmExtraida {
  numero: string;
  detalhes: string | null;
  kmInicial: number | null;
  kmFinal: number | null;
  lado: string | null;
  dataEmissao: Date;
}

/**
 * O relatório de OM (export do SAP/ECC da Vale) repete o cabeçalho
 * "ORDEM DE MANUTENÇÃO / {número} / TAG:.../ DESCRIÇÃO:..." no topo de
 * TODA página — inclusive nas páginas 2+ da mesma ordem. Por isso não dá
 * pra tratar cada match como uma OM nova: agrupamos pela primeira
 * ocorrência de cada número, e o "fim" do bloco de texto de uma OM é onde
 * começa a próxima OM com número diferente (elas vêm em blocos contíguos
 * de páginas, uma ordem de cada vez).
 */
const CABECALHO_RE = /ORDEM DE MANUTENÇÃO\s*\n(\d+)\s*\nTAG:[^\n]*\nDESCRIÇÃO:([^\n]*)/g;

/** Ex.: "SDR - ATERRO DO KM 22.460 AO KM 22.770 LD" — também é a única fonte confiável de "lado" (nem sempre presente). */
const KM_RE = /ATERRO DO KM\s*([\d.,]+)\s*AO KM\s*([\d.,]+)(?:\s*(LD|LE))?/;

const DATA_RE = /Data programada início:\s*(\d{2})\/(\d{2})\/(\d{4})/;

function paraNumero(valor: string): number {
  return Number(valor.replace(",", "."));
}

/** Extrai as ordens de manutenção descritas num PDF de relatório do SAP/ECC (formato "ECC RAMAL"), uma ou várias por arquivo. */
export async function extrairOrdensDoPdf(buffer: Buffer): Promise<OmExtraida[]> {
  const { text } = await pdfParse(buffer);

  const cabecalhos: { numero: string; descricao: string; index: number }[] = [];
  const vistos = new Set<string>();
  let m: RegExpExecArray | null;
  CABECALHO_RE.lastIndex = 0;
  while ((m = CABECALHO_RE.exec(text))) {
    const numero = m[1]!;
    if (vistos.has(numero)) continue;
    vistos.add(numero);
    cabecalhos.push({ numero, descricao: m[2]!.trim(), index: m.index });
  }

  return cabecalhos.map((cabecalho, i) => {
    const fim = cabecalhos[i + 1]?.index ?? text.length;
    const trecho = text.slice(cabecalho.index, fim);

    const km = KM_RE.exec(trecho);
    const data = DATA_RE.exec(trecho);

    return {
      numero: cabecalho.numero,
      detalhes: cabecalho.descricao || null,
      kmInicial: km ? paraNumero(km[1]!) : null,
      kmFinal: km ? paraNumero(km[2]!) : null,
      lado: km?.[3] ?? null,
      // Fallback pra hoje se o PDF não trouxer a data — melhor que rejeitar
      // a importação inteira por causa de uma OM com layout inesperado.
      dataEmissao: data ? new Date(Date.UTC(Number(data[3]!), Number(data[2]!) - 1, Number(data[1]!))) : new Date(),
    };
  });
}
