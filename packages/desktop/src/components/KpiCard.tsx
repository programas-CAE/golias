import type { ReactElement } from "react";

interface KpiCardProps {
  label: string;
  valor: string;
  meta?: string;
  vazio?: boolean;
}

export default function KpiCard({ label, valor, meta, vazio }: KpiCardProps): ReactElement {
  return (
    <div className="kpi-card">
      <p className="kpi-label">{label}</p>
      <p className="kpi-value">{vazio ? "—" : valor}</p>
      {meta && <p className="kpi-meta">{meta}</p>}
    </div>
  );
}
