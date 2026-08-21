import type { ReactElement } from "react";

interface CroquiAtividadeProps {
  unidade: string;
  altura: string;
  largura: string;
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

function CroquiRetangulo({ largura, comprimento }: { largura: string; comprimento: string }): ReactElement {
  return (
    <svg viewBox="0 0 240 150" className="croqui-svg">
      <rect x="50" y="24" width="150" height="86" className="croqui-forma" />
      <text x="125" y="16" textAnchor="middle" className="croqui-rotulo">
        {rotulo(comprimento)}
      </text>
      <text x="26" y="70" textAnchor="middle" className="croqui-rotulo" transform="rotate(-90 26 70)">
        {rotulo(largura)}
      </text>
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

export default function CroquiAtividade({ unidade, altura, largura, comprimento, descricaoAtividade }: CroquiAtividadeProps): ReactElement {
  const a = numero(altura);
  const l = numero(largura);
  const c = numero(comprimento);

  let resultado: { formula: string; valor: number; unidadeResultado: string } | null = null;
  if (unidade === "M3" && a != null && l != null && c != null) {
    resultado = { formula: `${formatarNumero(c)} × ${formatarNumero(l)} × ${formatarNumero(a)}`, valor: c * l * a, unidadeResultado: "m³" };
  } else if (unidade === "M2" && l != null && c != null) {
    resultado = { formula: `${formatarNumero(c)} × ${formatarNumero(l)}`, valor: c * l, unidadeResultado: "m²" };
  } else if (unidade === "M" && c != null) {
    resultado = { formula: `${formatarNumero(c)}`, valor: c, unidadeResultado: "m" };
  }

  return (
    <div className="croqui-card">
      <p className="croqui-titulo">Croqui{descricaoAtividade ? ` — ${descricaoAtividade}` : ""}</p>
      {unidade === "M3" ? (
        <CroquiCaixa altura={altura} largura={largura} comprimento={comprimento} />
      ) : unidade === "M2" ? (
        <CroquiRetangulo largura={largura} comprimento={comprimento} />
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
