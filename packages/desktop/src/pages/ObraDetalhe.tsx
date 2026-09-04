import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface RdoDoCalendario {
  id: string;
  data: string;
  status: string;
  equipe: { id: string; nome: string };
  frente: { id: string; nome: string };
  horasTrabalhadas: number;
  maoDeObra: Array<{ funcao: string; quantidade: number }>;
  materiais: Array<{ descricao: string; unidade: string; quantidade: number }>;
}

interface Etapa {
  id: string;
  obraId: string;
  nome: string;
  dataInicioPrevista: string;
  dataFimPrevista: string;
}

interface RespostaCalendario {
  obra: { id: string; nome: string };
  periodo: { mes: string; inicio: string; fim: string };
  etapas: Etapa[];
  rdos: RdoDoCalendario[];
}

interface MaterialTotal {
  materialCatalogoId: string;
  descricao: string;
  unidade: string;
  quantidadeTotal: number;
}

interface MaterialPorData {
  rdoId: string;
  data: string;
  equipe: string;
  materiais: Array<{ descricao: string; unidade: string; quantidade: number }>;
}

interface RespostaMateriais {
  obra: { id: string; nome: string };
  totais: MaterialTotal[];
  porData: MaterialPorData[];
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "Aguardando o escritório",
  AGUARDANDO_APROVACAO: "Aguardando o fiscal",
  REPROVADO: "Reprovado",
  APROVADO: "Aprovado",
};

const STATUS_DOT_CLASSE: Record<string, string> = {
  RASCUNHO: "farol-dot--rascunho",
  EM_CORRECAO: "farol-dot--correcao",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "farol-dot--validacao",
  AGUARDANDO_APROVACAO: "farol-dot--aguardando",
  REPROVADO: "farol-dot--reprovado",
  APROVADO: "farol-dot--aprovado",
};

// Cores das etapas do cronograma no calendário — cicladas por índice
// (ordem de início previsto). Fixas, não vêm de variável de tema porque
// aqui a cor É a identidade da etapa (precisa ser sempre a mesma etapa =
// mesma cor, em vez de seguir claro/escuro).
const CORES_ETAPA = ["#2563eb", "#d97706", "#16a34a", "#db2777", "#7c3aed", "#0891b2"];

const DIAS_SEMANA_ABREV = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/**
 * Ciclo de medição vigente (dia 19 do mês anterior ao dia 20 do mês
 * rotulado) — mesma conta do Farol, porque a Obra fecha no mesmo ciclo das
 * equipes normais, não no mês civil.
 */
function mesAtual(): string {
  const hoje = new Date();
  const mesCiclo = hoje.getDate() > 20 ? hoje.getMonth() + 1 : hoje.getMonth();
  const data = new Date(hoje.getFullYear(), mesCiclo, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarDataCurta(iso: string): string {
  const [, mes, dia] = iso.slice(0, 10).split("-");
  return `${dia}/${mes}`;
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

function formatarHoras(horas: number): string {
  const totalMinutos = Math.round(horas * 60);
  const h = Math.floor(totalMinutos / 60);
  const min = totalMinutos % 60;
  return `${h}h${String(min).padStart(2, "0")}`;
}

/** Lista cada dia (YYYY-MM-DD) entre início e fim, inclusive — o período pode cruzar mês. */
function listarDias(inicioIso: string, fimIso: string): string[] {
  const dias: string[] = [];
  let atual = new Date(`${inicioIso}T00:00:00Z`);
  const fim = new Date(`${fimIso}T00:00:00Z`);
  while (atual.getTime() <= fim.getTime()) {
    dias.push(atual.toISOString().slice(0, 10));
    atual = new Date(atual.getTime() + 24 * 60 * 60 * 1000);
  }
  return dias;
}

/** Dias do período em semanas (linhas de 7, começando no domingo), com null fora do período. */
function montarSemanas(dias: string[]): Array<Array<string | null>> {
  if (dias.length === 0) return [];
  const offset = new Date(`${dias[0]}T00:00:00Z`).getUTCDay();
  const preenchidos: Array<string | null> = [...Array(offset).fill(null), ...dias];
  while (preenchidos.length % 7 !== 0) preenchidos.push(null);

  const semanas: Array<Array<string | null>> = [];
  for (let i = 0; i < preenchidos.length; i += 7) semanas.push(preenchidos.slice(i, i + 7));
  return semanas;
}

export default function ObraDetalhe(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [aba, setAba] = useState<"calendario" | "materiais">("calendario");
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<RespostaCalendario | null>(null);
  const [materiais, setMateriais] = useState<RespostaMateriais | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [diaSelecionado, setDiaSelecionado] = useState<string | null>(null);
  const [criandoEtapa, setCriandoEtapa] = useState(false);
  const [editandoEtapa, setEditandoEtapa] = useState<Etapa | null>(null);

  async function carregarCalendario(): Promise<void> {
    if (!id) return;
    try {
      setDados(await api.get<RespostaCalendario>(`/obras/${id}/calendario?mes=${mes}`));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o cronograma.");
    }
  }

  useEffect(() => {
    setErro(null);
    setDiaSelecionado(null);
    void carregarCalendario();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, mes]);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    api
      .get<RespostaMateriais>(`/obras/${id}/materiais`)
      .then((resposta) => {
        if (!cancelado) setMateriais(resposta);
      })
      .catch((error) => {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os materiais.");
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  const rdosPorDia = useMemo(() => {
    const mapa = new Map<string, RdoDoCalendario[]>();
    for (const rdo of dados?.rdos ?? []) {
      const chave = rdo.data.slice(0, 10);
      const atual = mapa.get(chave) ?? [];
      atual.push(rdo);
      mapa.set(chave, atual);
    }
    return mapa;
  }, [dados]);

  const etapasOrdenadas = useMemo(
    () => [...(dados?.etapas ?? [])].sort((a, b) => a.dataInicioPrevista.localeCompare(b.dataInicioPrevista)),
    [dados],
  );
  const corPorEtapaId = useMemo(
    () => new Map(etapasOrdenadas.map((etapa, indice) => [etapa.id, CORES_ETAPA[indice % CORES_ETAPA.length]])),
    [etapasOrdenadas],
  );

  function etapasNoDia(diaIso: string): Etapa[] {
    return etapasOrdenadas.filter(
      (etapa) => etapa.dataInicioPrevista.slice(0, 10) <= diaIso && diaIso <= etapa.dataFimPrevista.slice(0, 10),
    );
  }

  const dias = useMemo(() => (dados ? listarDias(dados.periodo.inicio, dados.periodo.fim) : []), [dados]);
  const semanas = useMemo(() => montarSemanas(dias), [dias]);

  async function removerEtapa(etapaId: string): Promise<void> {
    if (!id) return;
    try {
      await api.delete(`/obras/${id}/etapas/${etapaId}`);
      await carregarCalendario();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível remover a etapa.");
    }
  }

  const rdosDoDiaSelecionado = diaSelecionado ? (rdosPorDia.get(diaSelecionado) ?? []) : [];
  const etapasDoDiaSelecionado = diaSelecionado ? etapasNoDia(diaSelecionado) : [];

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">{dados?.obra.nome ?? "Obra"}</h1>
            <p className="list-subtitle">Cronograma de lançamentos e materiais usados nesta obra</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
            <button type="button" className="button button--secondary" onClick={() => navigate("/obras")}>
              Voltar
            </button>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="tabs-row">
          <button
            type="button"
            className={`tab-button${aba === "calendario" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("calendario")}
          >
            Calendário
          </button>
          <button
            type="button"
            className={`tab-button${aba === "materiais" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("materiais")}
          >
            Materiais
          </button>
        </div>

        {aba === "calendario" ? (
          !dados ? (
            <p className="table-empty">Carregando…</p>
          ) : (
            <>
              <div className="panel">
                <div className="list-header" style={{ padding: "14px 18px 0" }}>
                  <p className="list-subtitle" style={{ margin: 0 }}>
                    Etapas previstas — ciclo {formatarData(dados.periodo.inicio)} a {formatarData(dados.periodo.fim)}
                  </p>
                  <button type="button" className="button button--secondary button--small" onClick={() => setCriandoEtapa(true)}>
                    + Nova etapa
                  </button>
                </div>
                {etapasOrdenadas.length === 0 ? (
                  <p className="table-empty">Nenhuma etapa cadastrada ainda.</p>
                ) : (
                  <ul className="farol-lista" style={{ padding: 18 }}>
                    {etapasOrdenadas.map((etapa) => (
                      <li key={etapa.id} className="farol-lista-item" style={{ cursor: "default", flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span
                            style={{ width: 12, height: 12, borderRadius: "50%", background: corPorEtapaId.get(etapa.id), flexShrink: 0 }}
                          />
                          <strong>{etapa.nome}</strong>
                          <span className="farol-lista-item-detalhe">
                            {formatarData(etapa.dataInicioPrevista.slice(0, 10))} a {formatarData(etapa.dataFimPrevista.slice(0, 10))}
                          </span>
                        </span>
                        <span style={{ display: "flex", gap: 8 }}>
                          <button type="button" className="button button--ghost button--small" onClick={() => setEditandoEtapa(etapa)}>
                            Editar
                          </button>
                          <button type="button" className="button button--ghost button--small" onClick={() => void removerEtapa(etapa.id)}>
                            Remover
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="panel" style={{ marginTop: 16 }}>
                <div className="farol-legenda-bar">
                  {Object.entries(STATUS_LABEL).map(([status, texto]) => (
                    <span className="farol-legenda-item" key={status}>
                      <span className={`farol-dot ${STATUS_DOT_CLASSE[status]}`} />
                      {texto}
                    </span>
                  ))}
                </div>
                <p className="list-subtitle" style={{ padding: "0 18px", marginTop: 14 }}>
                  Clique num dia pra ver os apontamentos (pessoal, material, horas trabalhadas) lançados nele.
                </p>
                <div className="obra-calendario">
                  <div className="obra-calendario-semana obra-calendario-cabecalho">
                    {DIAS_SEMANA_ABREV.map((dia) => (
                      <div key={dia} className="obra-calendario-dia-cabecalho">
                        {dia}
                      </div>
                    ))}
                  </div>
                  {semanas.map((semana, indice) => (
                    <div className="obra-calendario-semana" key={indice}>
                      {semana.map((diaIso, indiceDia) => {
                        const etapasDoDia = diaIso ? etapasNoDia(diaIso) : [];
                        const rdosDoDia = diaIso ? (rdosPorDia.get(diaIso) ?? []) : [];
                        return (
                          <button
                            type="button"
                            key={indiceDia}
                            className={`obra-calendario-dia${diaIso === null ? " obra-calendario-dia--vazio" : ""}${diaIso === diaSelecionado ? " obra-calendario-dia--selecionado" : ""}`}
                            onClick={() => diaIso && setDiaSelecionado(diaIso === diaSelecionado ? null : diaIso)}
                            disabled={diaIso === null}
                          >
                            {diaIso !== null && (
                              <>
                                <span className="obra-calendario-dia-numero">
                                  {diaIso.slice(8, 10)}
                                  {diaIso.slice(8, 10) === "01" && ` ${formatarDataCurta(diaIso).slice(3)}`}
                                </span>
                                {etapasDoDia.length > 0 && (
                                  <div className="obra-calendario-etapas">
                                    {etapasDoDia.map((etapa) => (
                                      <span
                                        key={etapa.id}
                                        className="obra-calendario-etapa-barra"
                                        style={{ background: corPorEtapaId.get(etapa.id) }}
                                        title={etapa.nome}
                                      />
                                    ))}
                                  </div>
                                )}
                                {rdosDoDia.length > 0 && (
                                  <span className="obra-calendario-rdo-contagem">
                                    {rdosDoDia.length} apontamento{rdosDoDia.length > 1 ? "s" : ""}
                                  </span>
                                )}
                              </>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>

              {diaSelecionado && (
                <div className="panel" style={{ marginTop: 16 }}>
                  <div className="list-header" style={{ padding: "14px 18px 0" }}>
                    <h2 className="list-title" style={{ fontSize: "1.1rem" }}>
                      {formatarData(diaSelecionado)}
                    </h2>
                    <button type="button" className="button button--ghost button--small" onClick={() => setDiaSelecionado(null)}>
                      Fechar
                    </button>
                  </div>

                  {etapasDoDiaSelecionado.length > 0 && (
                    <p style={{ padding: "0 18px" }}>
                      <strong>Etapa prevista: </strong>
                      {etapasDoDiaSelecionado.map((etapa) => etapa.nome).join(", ")}
                    </p>
                  )}

                  {rdosDoDiaSelecionado.length === 0 ? (
                    <p className="table-empty">Nenhum apontamento lançado neste dia.</p>
                  ) : (
                    <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
                      {rdosDoDiaSelecionado.map((rdo) => (
                        <div key={rdo.id} className="farol-lista-grupo" style={{ maxHeight: "none" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span className={`farol-dot ${STATUS_DOT_CLASSE[rdo.status] ?? "farol-dot--vazio"}`} />
                              <strong>{rdo.equipe.nome}</strong>
                              <span className="farol-lista-item-detalhe">
                                {rdo.frente.nome} · {STATUS_LABEL[rdo.status] ?? rdo.status} · {formatarHoras(rdo.horasTrabalhadas)} trabalhadas
                              </span>
                            </span>
                            <button type="button" className="button button--ghost button--small" onClick={() => navigate(`/rdos/${rdo.id}`)}>
                              Abrir RDO
                            </button>
                          </div>
                          <div className="grid-2" style={{ marginTop: 8 }}>
                            <div>
                              <p className="list-subtitle" style={{ margin: "0 0 4px" }}>
                                Efetivo
                              </p>
                              {rdo.maoDeObra.length === 0 ? (
                                <p className="list-subtitle">—</p>
                              ) : (
                                rdo.maoDeObra.map((item, indice) => (
                                  <p key={indice} style={{ margin: "2px 0" }}>
                                    {item.funcao} × {item.quantidade}
                                  </p>
                                ))
                              )}
                            </div>
                            <div>
                              <p className="list-subtitle" style={{ margin: "0 0 4px" }}>
                                Materiais
                              </p>
                              {rdo.materiais.length === 0 ? (
                                <p className="list-subtitle">—</p>
                              ) : (
                                rdo.materiais.map((item, indice) => (
                                  <p key={indice} style={{ margin: "2px 0" }}>
                                    {item.descricao} — {formatarNumero(item.quantidade)} {item.unidade}
                                  </p>
                                ))
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        ) : !materiais ? (
          <p className="table-empty">Carregando…</p>
        ) : (
          <>
            <div className="panel">
              <p className="list-subtitle" style={{ padding: "14px 18px 0" }}>
                Total de cada material já lançado nessa obra, somando todos os RDOs.
              </p>
              {materiais.totais.length === 0 ? (
                <p className="table-empty">Nenhum material lançado ainda.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Quantidade total</th>
                      <th>Unidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiais.totais.map((item) => (
                      <tr key={item.materialCatalogoId}>
                        <td>{item.descricao}</td>
                        <td>{formatarNumero(item.quantidadeTotal)}</td>
                        <td>{item.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="panel" style={{ marginTop: 16 }}>
              <p className="list-subtitle" style={{ padding: "14px 18px 0" }}>
                Detalhe por lançamento — o que entrou, em qual data, por qual equipe.
              </p>
              {materiais.porData.length === 0 ? (
                <p className="table-empty">Nenhum lançamento com material ainda.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Equipe</th>
                      <th>Materiais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiais.porData.map((linha) => (
                      <tr key={linha.rdoId}>
                        <td>{formatarData(linha.data)}</td>
                        <td>{linha.equipe}</td>
                        <td>
                          {linha.materiais.map((item, indice) => (
                            <div key={indice}>
                              {item.descricao} — {formatarNumero(item.quantidade)} {item.unidade}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      {criandoEtapa && id && (
        <EtapaModal
          obraId={id}
          onClose={() => setCriandoEtapa(false)}
          onSalvo={() => {
            setCriandoEtapa(false);
            void carregarCalendario();
          }}
        />
      )}

      {editandoEtapa && id && (
        <EtapaModal
          obraId={id}
          etapa={editandoEtapa}
          onClose={() => setEditandoEtapa(null)}
          onSalvo={() => {
            setEditandoEtapa(null);
            void carregarCalendario();
          }}
        />
      )}
    </div>
  );
}

function EtapaModal({
  obraId,
  etapa,
  onClose,
  onSalvo,
}: {
  obraId: string;
  etapa?: Etapa;
  onClose: () => void;
  onSalvo: () => void;
}): ReactElement {
  const [nome, setNome] = useState(etapa?.nome ?? "");
  const [dataInicioPrevista, setDataInicioPrevista] = useState(etapa?.dataInicioPrevista.slice(0, 10) ?? "");
  const [dataFimPrevista, setDataFimPrevista] = useState(etapa?.dataFimPrevista.slice(0, 10) ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const payload = { nome, dataInicioPrevista, dataFimPrevista };
      if (etapa) {
        await api.patch(`/obras/${obraId}/etapas/${etapa.id}`, payload);
      } else {
        await api.post(`/obras/${obraId}/etapas`, payload);
      }
      onSalvo();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar a etapa.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">{etapa ? "Editar etapa" : "Nova etapa"}</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="nome">
            Nome
          </label>
          <input
            id="nome"
            className="field-input"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Ex.: Terraplenagem"
            autoComplete="off"
            autoFocus
          />

          <div className="grid-2">
            <div>
              <label className="field-label" htmlFor="dataInicioPrevista">
                Início previsto
              </label>
              <input
                id="dataInicioPrevista"
                type="date"
                className="field-input"
                value={dataInicioPrevista}
                onChange={(event) => setDataInicioPrevista(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="dataFimPrevista">
                Fim previsto
              </label>
              <input
                id="dataFimPrevista"
                type="date"
                className="field-input"
                value={dataFimPrevista}
                onChange={(event) => setDataFimPrevista(event.target.value)}
              />
            </div>
          </div>

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button
              type="submit"
              className="button"
              disabled={salvando || nome.trim() === "" || dataInicioPrevista === "" || dataFimPrevista === ""}
            >
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
