import type { ReactElement } from "react";

interface DonutSlice {
  rotulo: string;
  valor: number;
  cor: string;
}

interface DonutChartProps {
  titulo: string;
  fatias: DonutSlice[];
}

const SIZE = 170;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUNFERENCIA = 2 * Math.PI * RADIUS;

export default function DonutChart({ titulo, fatias }: DonutChartProps): ReactElement {
  const total = fatias.reduce((soma, fatia) => soma + fatia.valor, 0);
  let acumulado = 0;

  return (
    <div className="donut-chart">
      <p className="chart-title">{titulo}</p>
      {total <= 0 ? (
        <p className="chart-empty">Sem dados no período</p>
      ) : (
        <div className="donut-chart-body">
          <svg viewBox={`0 0 ${SIZE} ${SIZE}`} width={SIZE} height={SIZE}>
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {fatias.map((fatia) => {
                const comprimento = (fatia.valor / total) * CIRCUNFERENCIA;
                const dashoffset = -acumulado;
                acumulado += comprimento;
                return (
                  <circle
                    key={fatia.rotulo}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={fatia.cor}
                    strokeWidth={STROKE}
                    strokeDasharray={`${comprimento} ${CIRCUNFERENCIA - comprimento}`}
                    strokeDashoffset={dashoffset}
                  />
                );
              })}
            </g>
            <text x={SIZE / 2} y={SIZE / 2 - 4} textAnchor="middle" className="donut-total-value">
              {total.toFixed(0)}h
            </text>
            <text x={SIZE / 2} y={SIZE / 2 + 16} textAnchor="middle" className="donut-total-label">
              Total
            </text>
          </svg>
          <ul className="donut-legend">
            {fatias.map((fatia) => (
              <li key={fatia.rotulo}>
                <span className="donut-legend-dot" style={{ background: fatia.cor }} />
                {fatia.rotulo}: {fatia.valor.toFixed(1)}h ({((fatia.valor / total) * 100).toFixed(0)}%)
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
