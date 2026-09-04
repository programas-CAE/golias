import { useEffect, useState, type ReactElement } from "react";
import Nav from "../components/Nav";
import KpiCard from "../components/KpiCard";
import GaugeChart from "../components/GaugeChart";
import LineChart from "../components/LineChart";
import DonutChart from "../components/DonutChart";
import { ApiError, api } from "../lib/apiClient";

interface ProdutividadeAtividade {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  producaoTotal: number;
  meta: number | null;
  metaOrigem: "mes_anterior" | "referencia" | null;
  pus: number;
  percentualMeta: number | null;
}

interface FrenteIndicador {
  id: string;
  nome: string;
  codigo: string;
  rdosEmitidos: number;
  eficiencia: number | null;
  metaEficiencia: number;
  metaPus: number | null;
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

interface LinhaProducaoHistorica {
  atividade: { id: string; codigo: string; descricao: string; ordem: number };
  unidade: string;
  porFrente: Record<string, number>;
  total: number;
}

interface Indicadores {
  periodo: string;
  rdosEmitidos: number;
  ordensManutencao: number;
  maoDeObraMedia: number;
  qlp: number;
  totalDesvios: number;
  eficienciaGeral: number | null;
  horasImprodutivas: number;
  horasProdutivas: number;
  produtividadePorAtividade: ProdutividadeAtividade[];
  porFrente: FrenteIndicador[];
  causasImprodutividade: CausaImprodutividade[];
  evolucaoSemanal: SemanaIndicador[];
  producaoHistorica: LinhaProducaoHistorica[] | null;
}

interface Frente {
  id: string;
  nome: string;
  codigo: string;
}

interface Equipe {
  id: string;
  nome: string;
  distrito: { nome: string; frenteId: string };
}

interface AtividadeCatalogo {
  id: string;
  codigo: string;
  descricao: string;
}

/**
 * Rótulo do ciclo de medição (dia 21 do mês anterior ao dia 20 do mês
 * rotulado) que contém a data de hoje — do dia 21 em diante, o ciclo
 * vigente já "pertence" ao mês seguinte (só fecha no dia 20 dele). Mesma
 * conta do Farol de status (Farol.tsx).
 */
function mesAtual(): string {
  const hoje = new Date();
  const mesCiclo = hoje.getDate() > 20 ? hoje.getMonth() + 1 : hoje.getMonth();
  const data = new Date(hoje.getFullYear(), mesCiclo, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

export default function Home(): ReactElement {
  const [mes, setMes] = useState(mesAtual());
  const [frenteFiltro, setFrenteFiltro] = useState("");
  const [equipeFiltro, setEquipeFiltro] = useState("");
  const [atividadeFiltro, setAtividadeFiltro] = useState("");
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [atividadesCatalogo, setAtividadesCatalogo] = useState<AtividadeCatalogo[]>([]);
  const [dados, setDados] = useState<Indicadores | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([api.get<Frente[]>("/frentes"), api.get<Equipe[]>("/equipes"), api.get<AtividadeCatalogo[]>("/atividades")])
      .then(([listaFrentes, listaEquipes, listaAtividades]) => {
        setFrentes(listaFrentes);
        setEquipes(listaEquipes);
        setAtividadesCatalogo(listaAtividades);
      })
      .catch(() => {
        // Filtros ficam vazios se essa carga falhar — os indicadores em si
        // continuam funcionando sem eles.
      });
  }, []);

  // Uma localidade só tem sentido pras equipes dela — troca a frente e o
  // filtro de equipe some se a equipe escolhida não for mais compatível.
  const equipesDoFiltro = frenteFiltro ? equipes.filter((equipe) => equipe.distrito.frenteId === frenteFiltro) : equipes;

  useEffect(() => {
    if (equipeFiltro && !equipesDoFiltro.some((equipe) => equipe.id === equipeFiltro)) {
      setEquipeFiltro("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frenteFiltro]);

  useEffect(() => {
    let cancelado = false;

    async function carregar(): Promise<void> {
      setErro(null);
      try {
        const params = new URLSearchParams({ mes });
        if (frenteFiltro) params.set("frenteId", frenteFiltro);
        if (equipeFiltro) params.set("equipeId", equipeFiltro);
        if (atividadeFiltro) params.set("atividadeCatalogoId", atividadeFiltro);
        const resposta = await api.get<Indicadores>(`/indicadores?${params.toString()}`);
        if (!cancelado) setDados(resposta);
      } catch (error) {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os indicadores.");
      }
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [mes, frenteFiltro, equipeFiltro, atividadeFiltro]);

  const atividadesComMeta = dados?.produtividadePorAtividade.filter((atividade) => atividade.meta != null) ?? [];

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Indicadores</h1>
            <p className="list-subtitle">
              Produtividade e eficiência das equipes preventivas — ciclo de medição do dia 21 do mês anterior ao dia
              20 do mês selecionado
            </p>
          </div>
          <div className="dashboard-header-actions">
            <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
          </div>
        </div>

        <div className="panel">
          <div className="farol-filtros-bar">
            <div>
              <label className="field-label">Localidade</label>
              <select className="field-input" value={frenteFiltro} onChange={(event) => setFrenteFiltro(event.target.value)}>
                <option value="">Todas as localidades</option>
                {frentes.map((frente) => (
                  <option key={frente.id} value={frente.id}>
                    {frente.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Equipe</label>
              <select className="field-input" value={equipeFiltro} onChange={(event) => setEquipeFiltro(event.target.value)}>
                <option value="">Todas as equipes</option>
                {equipesDoFiltro.map((equipe) => (
                  <option key={equipe.id} value={equipe.id}>
                    {equipe.nome} ({equipe.distrito.nome})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Atividade</label>
              <select
                className="field-input"
                value={atividadeFiltro}
                onChange={(event) => setAtividadeFiltro(event.target.value)}
              >
                <option value="">Todas as atividades</option>
                {atividadesCatalogo.map((atividade) => (
                  <option key={atividade.id} value={atividade.id}>
                    {atividade.codigo} — {atividade.descricao}
                  </option>
                ))}
              </select>
            </div>
            {(frenteFiltro || equipeFiltro || atividadeFiltro) && (
              <button
                type="button"
                className="button button--ghost button--small"
                style={{ alignSelf: "flex-end" }}
                onClick={() => {
                  setFrenteFiltro("");
                  setEquipeFiltro("");
                  setAtividadeFiltro("");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        {!dados ? (
          <p className="table-empty">Carregando indicadores…</p>
        ) : (
          <>
            <div className="dashboard-kpis">
              <KpiCard label="RDOs emitidos" valor={String(dados.rdosEmitidos)} vazio={dados.rdosEmitidos === 0} />
              <KpiCard label="Ordens de manutenção" valor={String(dados.ordensManutencao)} vazio={dados.ordensManutencao === 0} />
              <KpiCard
                label="QLP"
                valor={String(dados.qlp)}
                meta="Efetivo distinto no período"
                vazio={dados.rdosEmitidos === 0}
              />
              <KpiCard
                label="PUS geral"
                valor={dados.eficienciaGeral != null ? `${dados.eficienciaGeral.toFixed(1)}%` : "—"}
                vazio={dados.eficienciaGeral == null}
              />
              <KpiCard label="Total de desvios" valor={String(dados.totalDesvios)} vazio={dados.rdosEmitidos === 0} />
            </div>

            <div className="dashboard-charts">
              <LineChart
                titulo="Evolução da eficiência (%)"
                pontos={dados.evolucaoSemanal.map((semana) => ({ rotulo: semana.semana, valor: semana.eficiencia }))}
                formatValue={(valor) => `${valor.toFixed(0)}%`}
                cor="var(--accent)"
              />
              <LineChart
                titulo="RDOs emitidos por semana"
                pontos={dados.evolucaoSemanal.map((semana) => ({ rotulo: semana.semana, valor: semana.rdosEmitidos }))}
                cor="var(--accent-strong)"
              />
            </div>

            <section className="form-section">
              <h2 className="form-section-title">PUS por frente</h2>
              <div className="dashboard-gauges">
                {dados.porFrente.map((frente) => (
                  <div key={frente.id}>
                    <GaugeChart
                      label={`${frente.nome} (${frente.rdosEmitidos} RDO${frente.rdosEmitidos === 1 ? "" : "s"})`}
                      value={frente.eficiencia}
                      max={150}
                      meta={frente.metaEficiencia}
                      formatValue={(valor) => `${valor.toFixed(0)}%`}
                    />
                    {frente.metaPus != null && (
                      <p className="list-subtitle" style={{ textAlign: "center", marginTop: -8 }}>
                        Meta de PUS da equipe: {frente.metaPus.toFixed(1)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <div className="dashboard-charts">
              <DonutChart
                titulo="Distribuição das horas"
                fatias={[
                  { rotulo: "Produtivas", valor: dados.horasProdutivas, cor: "var(--accent)" },
                  { rotulo: "Improdutivas", valor: dados.horasImprodutivas, cor: "var(--text-muted)" },
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
                        <td>
                          {atividade.meta != null ? (
                            <>
                              {atividade.meta.toFixed(2)}{" "}
                              <span className="list-subtitle" style={{ fontSize: "0.75em" }}>
                                {atividade.metaOrigem === "mes_anterior" ? "(mês anterior)" : "(referência)"}
                              </span>
                            </>
                          ) : (
                            "—"
                          )}
                        </td>
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
                  Nenhuma dessas atividades tem meta de PUS (mês anterior ou referência) ainda.
                </p>
              )}
            </section>

            {dados.producaoHistorica && (
              <section className="form-section">
                <h2 className="form-section-title">Produção histórica (planilha importada)</h2>
                <p className="list-subtitle" style={{ marginTop: -4, marginBottom: 12 }}>
                  Dados brutos da planilha de produtividade para este mês — anteriores ao GOLIAS, sem RDO por trás.
                </p>
                {(() => {
                  const frentesPresentes = [
                    ...new Set(dados.producaoHistorica.flatMap((linha) => Object.keys(linha.porFrente))),
                  ].sort();
                  return (
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Atividade</th>
                          <th>Unidade</th>
                          {frentesPresentes.map((codigo) => (
                            <th key={codigo}>{codigo}</th>
                          ))}
                          <th>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dados.producaoHistorica.map((linha) => (
                          <tr key={linha.atividade.id}>
                            <td>
                              {linha.atividade.codigo} — {linha.atividade.descricao}
                            </td>
                            <td>{linha.unidade}</td>
                            {frentesPresentes.map((codigo) => (
                              <td key={codigo}>
                                {(linha.porFrente[codigo] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}
                              </td>
                            ))}
                            <td>{linha.total.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
