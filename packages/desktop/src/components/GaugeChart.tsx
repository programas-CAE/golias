import type { ReactElement } from "react";

interface GaugeChartProps {
  value: number | null;
  max: number;
  meta?: number | null;
  label: string;
  formatValue?: (value: number) => string;
}

const SIZE = 180;
const STROKE = 14;
const CX = SIZE / 2;
const CY = SIZE / 2 + 6;
const RADIUS = SIZE / 2 - STROKE;

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number): { x: number; y: number } {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Arco de -90° (esquerda) a 90° (direita), passando pelo topo (0°). */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

export default function GaugeChart({ value, max, meta, label, formatValue }: GaugeChartProps): ReactElement {
  const clamped = value != null ? Math.max(0, Math.min(value, max)) : 0;
  const fracao = max > 0 ? clamped / max : 0;
  const anguloValor = -90 + 180 * fracao;
  const corValor = value == null ? "var(--text-muted)" : meta != null && value >= meta ? "var(--accent)" : "var(--warning-amber)";

  return (
    <div className="gauge-chart">
      <svg viewBox={`0 0 ${SIZE} ${SIZE / 2 + 30}`}>
        <path
          d={describeArc(CX, CY, RADIUS, -90, 90)}
          fill="none"
          stroke="var(--border-soft)"
          strokeWidth={STROKE}
          strokeLinecap="round"
        />
        {value != null && (
          <path d={describeArc(CX, CY, RADIUS, -90, anguloValor)} fill="none" stroke={corValor} strokeWidth={STROKE} strokeLinecap="round" />
        )}
        {meta != null && max > 0
          ? (() => {
              const anguloMeta = -90 + 180 * Math.max(0, Math.min(meta / max, 1));
              const p1 = polarToCartesian(CX, CY, RADIUS - STROKE / 2 - 3, anguloMeta);
              const p2 = polarToCartesian(CX, CY, RADIUS + STROKE / 2 + 3, anguloMeta);
              return <line x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} stroke="var(--text-primary)" strokeWidth={2} />;
            })()
          : null}
        <text x={CX} y={CY - 8} textAnchor="middle" className="gauge-value">
          {value != null ? (formatValue ? formatValue(value) : value.toFixed(1)) : "—"}
        </text>
      </svg>
      <p className="gauge-label">{label}</p>
      {value == null && <p className="gauge-empty">Sem dados no período</p>}
    </div>
  );
}
