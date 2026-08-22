import { useEffect, useState, type ReactElement } from "react";
import { Link, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import KpiCard from "../components/KpiCard";
import { ApiError, api } from "../lib/apiClient";

interface Distrito {
  id: string;
  nome: string;
  ativo: boolean;
  frenteId: string;
  frente: { id: string; nome: string };
}

interface Encarregado {
  id: string;
  matricula: string;
  nome: string;
}

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

interface IndicadoresDistrito {
  periodo: string;
  rdosEmitidos: number;
  maoDeObraMedia: number;
  totalDesvios: number;
  temperaturaMedia: number | null;
  eficienciaGeral: number | null;
  produtividadePorAtividade: ProdutividadeAtividade[];
}

interface EquipeEfetivaMaoDeObra {
  id: string;
  quantidade: number;
  funcao: { id: string; nome: string };
  colaborador: { id: string; nome: string } | null;
}

interface EquipeEfetivaEquipamento {
  id: string;
  quantidade: number;
  equipamentoCatalogo: { id: string; nome: string };
}

interface EquipeEfetiva {
  id: string;
  data: string;
  equipe: { id: string; nome: string };
  maoDeObra: EquipeEfetivaMaoDeObra[];
  equipamentos: EquipeEfetivaEquipamento[];
}

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

export default function DistritoDetalhe(): ReactElement {
  const { distritoId } = useParams<{ distritoId: string }>();
  const [distrito, setDistrito] = useState<Distrito | null>(null);
  const [encarregados, setEncarregados] = useState<Encarregado[] | null>(null);
  const [mes, setMes] = useState(mesAtual());
  const [indicadores, setIndicadores] = useState<IndicadoresDistrito | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [encarregadoSelecionado, setEncarregadoSelecionado] = useState<Encarregado | null>(null);
  const [equipeEfetiva, setEquipeEfetiva] = useState<EquipeEfetiva | null>(null);
  const [equipeEfetivaErro, setEquipeEfetivaErro] = useState<string | null>(null);
  const [carregandoEquipeEfetiva, setCarregandoEquipeEfetiva] = useState(false);

  useEffect(() => {
    if (!distritoId) return;
    let cancelado = false;

    async function carregar(): Promise<void> {
      setErro(null);
      try {
        const [distritoResp, encarregadosResp] = await Promise.all([
          api.get<Distrito>(`/distritos/${distritoId}`),
          api.get<Encarregado[]>(`/distritos/${distritoId}/encarregados`),
        ]);
        if (cancelado) return;
        setDistrito(distritoResp);
        setEncarregados(encarregadosResp);
      } catch (error) {
        if (!cancelado) {
          setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o distrito.");
        }
      }
    }

    void carregar();
    return () => {
      cancelado = true;
    };
  }, [distritoId]);

  useEffect(() => {
    if (!distritoId) return;
    let cancelado = false;

    async function carregarIndicadores(): Promise<void> {
      try {
        const resposta = await api.get<IndicadoresDistrito>(`/distritos/${distritoId}/indicadores?mes=${mes}`);
        if (!cancelado) setIndicadores(resposta);
      } catch (error) {
        if (!cancelado) {
          setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os indicadores do distrito.");
        }
      }
    }

    void carregarIndicadores();
    return () => {
      cancelado = true;
    };
  }, [distritoId, mes]);

  async function selecionarEncarregado(encarregado: Encarregado): Promise<void> {
    setEncarregadoSelecionado(encarregado);
    setEquipeEfetiva(null);
    setEquipeEfetivaErro(null);
    setCarregandoEquipeEfetiva(true);
    try {
      const resposta = await api.get<EquipeEfetiva>(`/colaboradores/${encarregado.id}/equipe-efetiva`);
      setEquipeEfetiva(resposta);
    } catch (error) {
      setEquipeEfetivaErro(
        error instanceof ApiError && error.status === 404
          ? "Este encarregado ainda não aparece em nenhum RDO."
          : "Não foi possível carregar a equipe efetiva.",
      );
    } finally {
      setCarregandoEquipeEfetiva(false);
    }
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            {distrito && (
              <Link to={`/frentes/${distrito.frenteId}/distritos`} className="list-subtitle">
                ← {distrito.frente.nome}
              </Link>
            )}
            <h1 className="list-title">{distrito?.nome ?? "Distrito"}</h1>
          </div>
          <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="distrito-layout">
          <div className="panel distrito-encarregados">
            <h2 className="form-section-title" style={{ padding: "16px 16px 0" }}>
              Encarregados
            </h2>
            {encarregados === null ? (
              <p className="table-empty">Carregando…</p>
            ) : encarregados.length === 0 ? (
              <p className="table-empty">Nenhum encarregado neste distrito ainda.</p>
            ) : (
              <ul className="encarregado-lista">
                {encarregados.map((encarregado) => (
                  <li key={encarregado.id}>
                    <button
                      type="button"
                      className={`encarregado-item${encarregadoSelecionado?.id === encarregado.id ? " encarregado-item--ativo" : ""}`}
                      onClick={() => void selecionarEncarregado(encarregado)}
                    >
                      {encarregado.nome}
                      <span className="encarregado-matricula">{encarregado.matricula}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="distrito-conteudo">
            {encarregadoSelecionado ? (
              <section className="form-section">
                <div className="list-header">
                  <h2 className="form-section-title">Equipe efetiva — {encarregadoSelecionado.nome}</h2>
                  <button type="button" className="button button--ghost button--small" onClick={() => setEncarregadoSelecionado(null)}>
                    Voltar para o distrito
                  </button>
                </div>
                {carregandoEquipeEfetiva ? (
                  <p className="table-empty">Carregando…</p>
                ) : equipeEfetivaErro ? (
                  <p className="table-empty">{equipeEfetivaErro}</p>
                ) : equipeEfetiva ? (
                  <>
                    <p className="list-subtitle">
                      RDO de {equipeEfetiva.data.slice(0, 10)} — Equipe {equipeEfetiva.equipe.nome}
                    </p>
                    <h3 className="field-label" style={{ marginTop: 16 }}>
                      Mão de obra
                    </h3>
                    {equipeEfetiva.maoDeObra.length === 0 ? (
                      <p className="table-empty">Nenhuma mão de obra apontada.</p>
                    ) : (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Homem</th>
                            <th>Função</th>
                            <th>Quantidade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {equipeEfetiva.maoDeObra.map((item) => (
                            <tr key={item.id}>
                              <td>{item.colaborador?.nome ?? "—"}</td>
                              <td>{item.funcao.nome}</td>
                              <td>{item.quantidade}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <h3 className="field-label" style={{ marginTop: 16 }}>
                      Máquinas / equipamentos
                    </h3>
                    {equipeEfetiva.equipamentos.length === 0 ? (
                      <p className="table-empty">Nenhum equipamento apontado.</p>
                    ) : (
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Máquina</th>
                            <th>Quantidade</th>
                          </tr>
                        </thead>
                        <tbody>
                          {equipeEfetiva.equipamentos.map((item) => (
                            <tr key={item.id}>
                              <td>{item.equipamentoCatalogo.nome}</td>
                              <td>{item.quantidade}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </>
                ) : null}
              </section>
            ) : !indicadores ? (
              <p className="table-empty">Carregando indicadores…</p>
            ) : (
              <>
                <div className="dashboard-kpis">
                  <KpiCard label="RDOs emitidos" valor={String(indicadores.rdosEmitidos)} vazio={indicadores.rdosEmitidos === 0} />
                  <KpiCard label="Mão de obra média" valor={indicadores.maoDeObraMedia.toFixed(1)} vazio={indicadores.rdosEmitidos === 0} />
                  <KpiCard
                    label="Eficiência geral"
                    valor={indicadores.eficienciaGeral != null ? `${indicadores.eficienciaGeral.toFixed(1)}%` : "—"}
                    vazio={indicadores.eficienciaGeral == null}
                  />
                  <KpiCard label="Total de desvios" valor={String(indicadores.totalDesvios)} vazio={indicadores.rdosEmitidos === 0} />
                  <KpiCard
                    label="Temperatura média"
                    valor={indicadores.temperaturaMedia != null ? `${indicadores.temperaturaMedia.toFixed(1)}°C` : "—"}
                    vazio={indicadores.temperaturaMedia == null}
                  />
                </div>

                <section className="form-section">
                  <h2 className="form-section-title">Produtividade por atividade (PUS)</h2>
                  {indicadores.produtividadePorAtividade.length === 0 ? (
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
                        </tr>
                      </thead>
                      <tbody>
                        {indicadores.produtividadePorAtividade.map((atividade) => (
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
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
