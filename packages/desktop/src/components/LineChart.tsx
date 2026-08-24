import type { ReactElement } from "react";

interface LineChartPonto {
  rotulo: string;
  valor: number | null;
}

interface LineChartProps {
  titulo: string;
  pontos: LineChartPonto[];
  formatValue?: (value: number) => string;
  cor?: string;
}

const WIDTH = 560;
const HEIGHT = 200;
const PADDING = 32;

export default function LineChart({ titulo, pontos, formatValue, cor = "#16a34a" }: LineChartProps): ReactElement {
  const valores = pontos.map((ponto) => ponto.valor).filter((valor): valor is number => valor != null);
  const temDados = valores.length > 0;
  const max = temDados ? Math.max(...valores, 0) : 1;
  const min = temDados ? Math.min(...valores, 0) : 0;
  const escalaY = max - min > 0 ? max - min : 1;

  const larguraUtil = WIDTH - PADDING * 2;
  const alturaUtil = HEIGHT - PADDING * 2;
  const passo = pontos.length > 1 ? larguraUtil / (pontos.length - 1) : 0;

  const coordenadas = pontos.map((ponto, indice) => ({
    ...ponto,
    x: PADDING + passo * indice,
    y: ponto.valor != null ? PADDING + alturaUtil - ((ponto.valor - min) / escalaY) * alturaUtil : null,
  }));

  const linhaPath = coordenadas
    .filter((coordenada) => coordenada.y != null)
    .map((coordenada, indice) => `${indice === 0 ? "M" : "L"} ${coordenada.x} ${coordenada.y}`)
    .join(" ");

  return (
    <div className="line-chart">
      <p className="chart-title">{titulo}</p>
      {!temDados ? (
        <p className="chart-empty">Sem dados no período</p>
      ) : (
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
          <line x1={PADDING} y1={HEIGHT - PADDING} x2={WIDTH - PADDING} y2={HEIGHT - PADDING} stroke="#dbe8de" />
          <path d={linhaPath} fill="none" stroke={cor} strokeWidth={2.5} />
          {coordenadas.map((coordenada) =>
            coordenada.y != null ? (
              <g key={coordenada.rotulo}>
                <circle cx={coordenada.x} cy={coordenada.y} r={4} fill={cor} />
                <text x={coordenada.x} y={coordenada.y - 10} textAnchor="middle" className="chart-point-label">
                  {formatValue ? formatValue(coordenada.valor as number) : coordenada.valor}
                </text>
              </g>
            ) : null,
          )}
          {coordenadas.map((coordenada) => (
            <text key={coordenada.rotulo} x={coordenada.x} y={HEIGHT - PADDING + 18} textAnchor="middle" className="chart-axis-label">
              {coordenada.rotulo}
            </text>
          ))}
        </svg>
      )}
    </div>
  );
}
