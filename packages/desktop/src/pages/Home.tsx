import { useEffect, useState, type ReactElement } from "react";
import Nav from "../components/Nav";
import KpiCard from "../components/KpiCard";
import GaugeChart from "../components/GaugeChart";
import LineChart from "../components/LineChart";
import DonutChart from "../components/DonutChart";
import { ApiError, api } from "../lib/apiClient";
import { getSettings } from "../lib/settingsStore";

type ConexaoStatus = "verificando" | "conectado" | "desconectado";

interface ProdutividadeAtividade {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  producaoTotal: number;
  metaPus: number | null;
  pus: number;
  percentualMeta: number | null;
}

interface FrenteIndicador {
  id: string;
  nome: string;
  codigo: string;
  rdosEmitidos: number;
  eficiencia: number | null;
}

interface CausaImprodutividade {
  causa: string;
  horas: number;
}

interface SemanaIndicador {
  semana: string;
  rdosEmitidos: number;
  eficiencia: number | null;
}

interface Indicadores {
  periodo: string;
  rdosEmitidos: number;
  ordensManutencao: number;
  maoDeObraMedia: number;
  totalDesvios: number;
  temperaturaMedia: number | null;
  eficienciaGeral: number | null;
  horasImprodutivas: number;
  horasProdutivas: number;
  produtividadePorAtividade: ProdutividadeAtividade[];
  porFrente: FrenteIndicador[];
  causasImprodutividade: CausaImprodutividade[];
  evolucaoSemanal: SemanaIndicador[];
}

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function Home(): ReactElement {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [status, setStatus] = useState<ConexaoStatus>("verificando");
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;

    async function verificarConexao(): Promise<void> {
      setStatus("verificando");
      const settings = await getSettings();
      if (cancelado) return;
      setApiUrl(settings.apiUrl);

      try {
        const resposta = await fetch(`${settings.apiUrl.replace(/\/$/, "")}/health`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelado) setStatus(resposta.ok ? "conectado" : "desconectado");
      } catch {
        if (!cancelado) setStatus("desconectado");
      }
    }

    void verificarConexao();
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;

    async function carregar(): Promise<void> {
      setErro(null);
      try {
        const resposta = await api.get<Indicadores>(`/indicadores?mes=${mes}`);
        if (!cancelado) setDados(resposta);
      } catch (error) {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os indicadores.");
      }
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [mes]);

  const atividadesComMeta = dados?.produtividadePorAtividade.filter((atividade) => atividade.metaPus != null) ?? [];

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Indicadores</h1>
            <p className="list-subtitle">Produtividade e eficiência das equipes preventivas</p>
          </div>
          <div className="dashboard-header-actions">
            <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
            <span className={`status-pill status-pill--${status} status-pill--compact`}>
              <span className="status-dot" />
              {status === "verificando" && "Verificando…"}
              {status === "conectado" && "Conectado"}
              {status === "desconectado" && "Não conectado"}
            </span>
          </div>
        </div>

        {apiUrl && status === "desconectado" && <p className="status-url">{apiUrl}</p>}
        {erro && <p className="feedback feedback--erro">{erro}</p>}

        {!dados ? (
          <p className="table-empty">Carregando indicadores…</p>
        ) : (
          <>
            <div className="dashboard-kpis">
              <KpiCard label="RDOs emitidos" valor={String(dados.rdosEmitidos)} vazio={dados.rdosEmitidos === 0} />
              <KpiCard label="Ordens de manutenção" valor={String(dados.ordensManutencao)} vazio={dados.ordensManutencao === 0} />
              <KpiCard label="Mão de obra média" valor={dados.maoDeObraMedia.toFixed(1)} vazio={dados.rdosEmitidos === 0} />
              <KpiCard
                label="Eficiência geral"
                valor={dados.eficienciaGeral != null ? `${dados.eficienciaGeral.toFixed(1)}%` : "—"}
                vazio={dados.eficienciaGeral == null}
              />
              <KpiCard label="Total de desvios" valor={String(dados.totalDesvios)} vazio={dados.rdosEmitidos === 0} />
              <KpiCard
                label="Temperatura média"
                valor={dados.temperaturaMedia != null ? `${dados.temperaturaMedia.toFixed(1)}°C` : "—"}
                vazio={dados.temperaturaMedia == null}
              />
            </div>

            <div className="dashboard-charts">
              <LineChart
                titulo="Evolução da eficiência (%)"
                pontos={dados.evolucaoSemanal.map((semana) => ({ rotulo: semana.semana, valor: semana.eficiencia }))}
                formatValue={(valor) => `${valor.toFixed(0)}%`}
                cor="#22c55e"
              />
              <LineChart
                titulo="RDOs emitidos por semana"
                pontos={dados.evolucaoSemanal.map((semana) => ({ rotulo: semana.semana, valor: semana.rdosEmitidos }))}
                cor="#f97316"
              />
            </div>

            <section className="form-section">
              <h2 className="form-section-title">Eficiência por frente</h2>
              <div className="dashboard-gauges">
                {dados.porFrente.map((frente) => (
                  <GaugeChart
                    key={frente.id}
                    label={`${frente.nome} (${frente.rdosEmitidos} RDO${frente.rdosEmitidos === 1 ? "" : "s"})`}
                    value={frente.eficiencia}
                    max={150}
                    meta={100}
                    formatValue={(valor) => `${valor.toFixed(0)}%`}
                  />
                ))}
              </div>
            </section>

            <div className="dashboard-charts">
              <DonutChart
                titulo="Distribuição das horas"
                fatias={[
                  { rotulo: "Produtivas", valor: dados.horasProdutivas, cor: "#f97316" },
                  { rotulo: "Improdutivas", valor: dados.horasImprodutivas, cor: "#64748b" },
                ]}
              />

              <div className="form-section" style={{ marginBottom: 0 }}>
                <h2 className="form-section-title">Principais causas de improdutividade</h2>
                {dados.causasImprodutividade.length === 0 ? (
                  <p className="chart-empty">Sem dados no período</p>
                ) : (
                  <ul className="causa-lista">
                    {dados.causasImprodutividade.map((causa) => {
                      const maiorValor = dados.causasImprodutividade[0]?.horas ?? 1;
                      const largura = maiorValor > 0 ? (causa.horas / maiorValor) * 100 : 0;
                      return (
                        <li key={causa.causa} className="causa-item">
                          <span className="causa-nome">{causa.causa}</span>
                          <div className="causa-barra-fundo">
                            <div className="causa-barra" style={{ width: `${largura}%` }} />
                          </div>
                          <span className="causa-horas">{causa.horas.toFixed(0)}h</span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <section className="form-section">
              <h2 className="form-section-title">Produtividade por atividade (PUS)</h2>
              {dados.produtividadePorAtividade.length === 0 ? (
                <p className="table-empty">Nenhuma atividade registrada no período.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Atividade</th>
                      <th>Unidade</th>
                      <th>Produção total</th>
                      <th>PUS</th>
                      <th>Meta</th>
                      <th>% da meta</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dados.produtividadePorAtividade.map((atividade) => (
                      <tr key={atividade.id}>
                        <td>{atividade.descricao}</td>
                        <td>{atividade.unidade}</td>
                        <td>{atividade.producaoTotal.toFixed(2)}</td>
                        <td>{atividade.pus.toFixed(2)}</td>
                        <td>{atividade.metaPus != null ? atividade.metaPus.toFixed(2) : "—"}</td>
                        <td>{atividade.percentualMeta != null ? `${atividade.percentualMeta.toFixed(0)}%` : "—"}</td>
                        <td>
                          {atividade.percentualMeta == null ? (
                            "—"
                          ) : (
                            <span className={`badge badge--${atividade.percentualMeta >= 100 ? "ativo" : "inativo"}`}>
                              {atividade.percentualMeta >= 100 ? "Dentro da meta" : "Abaixo da meta"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {atividadesComMeta.length === 0 && dados.produtividadePorAtividade.length > 0 && (
                <p className="list-subtitle" style={{ marginTop: 12 }}>
                  Nenhuma dessas atividades tem meta de PUS cadastrada ainda.
                </p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
