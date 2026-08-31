import type { ReactElement } from "react";

interface CroquiAtividadeProps {
  unidade: string;
  altura: string;
  largura: string;
  larguraFinal: string;
  comprimento: string;
  descricaoAtividade?: string;
}

function numero(valor: string): number | null {
  if (valor === "") return null;
  const n = Number(valor);
  return Number.isNaN(n) ? null : n;
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function rotulo(valor: string): string {
  return valor !== "" ? `${valor} m` : "?";
}

function CroquiLinha({ comprimento }: { comprimento: string }): ReactElement {
  return (
    <svg viewBox="0 0 240 90" className="croqui-svg">
      <line x1="24" y1="45" x2="216" y2="45" className="croqui-linha" />
      <line x1="24" y1="34" x2="24" y2="56" className="croqui-linha" />
      <line x1="216" y1="34" x2="216" y2="56" className="croqui-linha" />
      <text x="120" y="30" textAnchor="middle" className="croqui-rotulo">
        {rotulo(comprimento)}
      </text>
    </svg>
  );
}

/**
 * Desenha um retângulo, ou, quando `larguraFinal` é informada e diferente
 * da largura inicial, um trapézio (faixa que afunila/alarga ao longo do
 * comprimento — ex.: roçada em trecho irregular). As alturas dos lados são
 * proporcionais entre si, não em escala real, só para dar a noção do
 * formato.
 */
function CroquiRetangulo({ largura, larguraFinal, comprimento }: { largura: string; larguraFinal: string; comprimento: string }): ReactElement {
  const lIni = numero(largura) ?? 0;
  const lFim = numero(larguraFinal) ?? lIni;
  const maior = Math.max(lIni, lFim, 0.001);
  const alturaMax = 86;
  const alturaMin = 20;
  const alturaDe = (valor: number): number => (valor <= 0 ? 0 : Math.max((valor / maior) * alturaMax, alturaMin));
  const hIni = alturaDe(lIni);
  const hFim = alturaDe(lFim);
  const centroY = 67;
  const pontos = [
    { x: 50, y: centroY - hIni / 2 },
    { x: 200, y: centroY - hFim / 2 },
    { x: 200, y: centroY + hFim / 2 },
    { x: 50, y: centroY + hIni / 2 },
  ];
  const caminho = `M ${pontos.map((p) => `${p.x} ${p.y}`).join(" L ")} Z`;

  return (
    <svg viewBox="0 0 240 150" className="croqui-svg">
      <path d={caminho} className="croqui-forma" />
      <text x="125" y="16" textAnchor="middle" className="croqui-rotulo">
        {rotulo(comprimento)}
      </text>
      <text x="26" y={centroY + 4} textAnchor="middle" className="croqui-rotulo" transform={`rotate(-90 26 ${centroY})`}>
        {rotulo(largura)}
      </text>
      {larguraFinal !== "" && (
        <text x="224" y={centroY + 4} textAnchor="middle" className="croqui-rotulo" transform={`rotate(-90 224 ${centroY})`}>
          {rotulo(larguraFinal)}
        </text>
      )}
    </svg>
  );
}

function CroquiCaixa({ altura, largura, comprimento }: { altura: string; largura: string; comprimento: string }): ReactElement {
  // Caixa em perspectiva simples: face frontal (largura x altura) + profundidade (comprimento).
  const fbl = { x: 55, y: 118 };
  const fbr = { x: 150, y: 118 };
  const ftr = { x: 150, y: 48 };
  const ftl = { x: 55, y: 48 };
  const offset = { x: 42, y: -28 };
  const bbr = { x: fbr.x + offset.x, y: fbr.y + offset.y };
  const btr = { x: ftr.x + offset.x, y: ftr.y + offset.y };
  const btl = { x: ftl.x + offset.x, y: ftl.y + offset.y };

  const face = `M ${fbl.x} ${fbl.y} L ${fbr.x} ${fbr.y} L ${ftr.x} ${ftr.y} L ${ftl.x} ${ftl.y} Z`;
  const topo = `M ${ftl.x} ${ftl.y} L ${ftr.x} ${ftr.y} L ${btr.x} ${btr.y} L ${btl.x} ${btl.y} Z`;
  const lado = `M ${fbr.x} ${fbr.y} L ${ftr.x} ${ftr.y} L ${btr.x} ${btr.y} L ${bbr.x} ${bbr.y} Z`;

  return (
    <svg viewBox="0 0 240 150" className="croqui-svg">
      <path d={lado} className="croqui-forma croqui-forma--sombra" />
      <path d={topo} className="croqui-forma croqui-forma--topo" />
      <path d={face} className="croqui-forma" />
      <text x={(fbl.x + fbr.x) / 2} y={fbl.y + 18} textAnchor="middle" className="croqui-rotulo">
        {rotulo(largura)}
      </text>
      <text x={fbl.x - 14} y={(fbl.y + ftl.y) / 2} textAnchor="middle" className="croqui-rotulo" transform={`rotate(-90 ${fbl.x - 14} ${(fbl.y + ftl.y) / 2})`}>
        {rotulo(altura)}
      </text>
      <text x={(fbr.x + bbr.x) / 2 + 8} y={(fbr.y + bbr.y) / 2 + 4} textAnchor="start" className="croqui-rotulo">
        {rotulo(comprimento)}
      </text>
    </svg>
  );
}

export default function CroquiAtividade({ unidade, altura, largura, larguraFinal, comprimento, descricaoAtividade }: CroquiAtividadeProps): ReactElement {
  const a = numero(altura);
  const l = numero(largura);
  const lFim = numero(larguraFinal);
  const c = numero(comprimento);

  let resultado: { formula: string; valor: number; unidadeResultado: string } | null = null;
  if (unidade === "M3" && a != null && l != null && c != null) {
    resultado = { formula: `${formatarNumero(c)} × ${formatarNumero(l)} × ${formatarNumero(a)}`, valor: c * l * a, unidadeResultado: "m³" };
  } else if (unidade === "M2" && l != null && c != null) {
    if (lFim != null && lFim !== l) {
      const media = (l + lFim) / 2;
      resultado = {
        formula: `média(${formatarNumero(l)}, ${formatarNumero(lFim)}) × ${formatarNumero(c)}`,
        valor: media * c,
        unidadeResultado: "m²",
      };
    } else {
      resultado = { formula: `${formatarNumero(c)} × ${formatarNumero(l)}`, valor: c * l, unidadeResultado: "m²" };
    }
  } else if (unidade === "M" && c != null) {
    resultado = { formula: `${formatarNumero(c)}`, valor: c, unidadeResultado: "m" };
  }

  return (
    <div className="croqui-card">
      <p className="croqui-titulo">Croqui{descricaoAtividade ? ` — ${descricaoAtividade}` : ""}</p>
      {unidade === "M3" ? (
        <CroquiCaixa altura={altura} largura={largura} comprimento={comprimento} />
      ) : unidade === "M2" ? (
        <CroquiRetangulo largura={largura} larguraFinal={larguraFinal} comprimento={comprimento} />
      ) : unidade === "M" ? (
        <CroquiLinha comprimento={comprimento} />
      ) : (
        <p className="croqui-vazio">Esta unidade não usa dimensões.</p>
      )}
      <p className="croqui-resultado">
        {resultado ? (
          <>
            {resultado.formula} = <strong>{formatarNumero(resultado.valor)} {resultado.unidadeResultado}</strong>
          </>
        ) : (
          "Preencha as dimensões para calcular."
        )}
      </p>
    </div>
  );
}
