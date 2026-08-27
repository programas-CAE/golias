import { useEffect, useState, type FormEvent, type ReactElement } from "react";
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

interface Colaborador {
  id: string;
  matricula: string;
  nome: string;
  ativo: boolean;
  funcaoId: string;
  funcao: { id: string; nome: string };
}

interface Funcao {
  id: string;
  nome: string;
}

interface Membro {
  id: string;
  colaboradorId: string | null;
  colaborador: { id: string; nome: string } | null;
  funcaoId: string;
  funcao: { id: string; nome: string };
  quantidade: number;
}

interface Equipe {
  id: string;
  nome: string;
  distritoId: string;
  encarregadoId: string | null;
  ativo: boolean;
  membros: Membro[];
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
  const [equipes, setEquipes] = useState<Equipe[] | null>(null);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [mes, setMes] = useState(mesAtual());
  const [indicadores, setIndicadores] = useState<IndicadoresDistrito | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const [equipeSelecionada, setEquipeSelecionada] = useState<Equipe | null>(null);
  const [equipeEfetiva, setEquipeEfetiva] = useState<EquipeEfetiva | null>(null);
  const [equipeEfetivaErro, setEquipeEfetivaErro] = useState<string | null>(null);
  const [carregandoEquipeEfetiva, setCarregandoEquipeEfetiva] = useState(false);

  const [editandoEquipe, setEditandoEquipe] = useState<Equipe | "novo" | null>(null);
  const [editandoColaborador, setEditandoColaborador] = useState(false);

  async function carregar(): Promise<void> {
    if (!distritoId) return;
    setErro(null);
    try {
      const [distritoResp, equipesResp, colaboradoresResp, funcoesResp] = await Promise.all([
        api.get<Distrito>(`/distritos/${distritoId}`),
        api.get<Equipe[]>("/equipes"),
        api.get<Colaborador[]>("/colaboradores"),
        api.get<Funcao[]>("/funcoes"),
      ]);
      setDistrito(distritoResp);
      setEquipes(equipesResp.filter((equipe) => equipe.distritoId === distritoId));
      setColaboradores(colaboradoresResp);
      setFuncoes(funcoesResp);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o distrito.");
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  async function selecionarEquipe(equipe: Equipe): Promise<void> {
    setEquipeSelecionada(equipe);
    setEquipeEfetiva(null);
    setEquipeEfetivaErro(null);

    if (!equipe.encarregadoId) {
      setEquipeEfetivaErro("Esta equipe ainda não tem um encarregado definido — edite a equipe para vincular um.");
      return;
    }

    setCarregandoEquipeEfetiva(true);
    try {
      const resposta = await api.get<EquipeEfetiva>(`/colaboradores/${equipe.encarregadoId}/equipe-efetiva`);
      setEquipeEfetiva(resposta);
    } catch (error) {
      setEquipeEfetivaErro(
        error instanceof ApiError && error.status === 404
          ? "O encarregado desta equipe ainda não aparece em nenhum RDO."
          : "Não foi possível carregar a equipe efetiva.",
      );
    } finally {
      setCarregandoEquipeEfetiva(false);
    }
  }

  function handleEquipeSalva(equipe: Equipe): void {
    setEquipes((atual) => {
      if (!atual) return atual;
      const existe = atual.some((e) => e.id === equipe.id);
      return existe ? atual.map((e) => (e.id === equipe.id ? equipe : e)) : [...atual, equipe];
    });
    setEditandoEquipe(equipe);
    if (equipeSelecionada?.id === equipe.id) void selecionarEquipe(equipe);
  }

  function nomeColaborador(id: string | null): string {
    if (!id) return "Sem encarregado";
    return colaboradores.find((c) => c.id === id)?.nome ?? "—";
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
          <div className="dashboard-header-actions">
            <button type="button" className="button button--secondary" onClick={() => setEditandoColaborador(true)}>
              + Novo colaborador
            </button>
            <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="distrito-layout">
          <div className="panel distrito-encarregados">
            <div className="list-header" style={{ padding: "16px 16px 0" }}>
              <h2 className="form-section-title">Equipes</h2>
              <button type="button" className="button button--small" onClick={() => setEditandoEquipe("novo")}>
                + Nova equipe
              </button>
            </div>
            {equipes === null ? (
              <p className="table-empty">Carregando…</p>
            ) : equipes.length === 0 ? (
              <p className="table-empty">Nenhuma equipe neste distrito ainda.</p>
            ) : (
              <ul className="encarregado-lista">
                {equipes.map((equipe) => (
                  <li key={equipe.id}>
                    <button
                      type="button"
                      className={`encarregado-item${equipeSelecionada?.id === equipe.id ? " encarregado-item--ativo" : ""}`}
                      onClick={() => void selecionarEquipe(equipe)}
                    >
                      <span>
                        {equipe.nome}
                        {!equipe.ativo && (
                          <span className="badge badge--inativo" style={{ marginLeft: 8 }}>
                            Inativa
                          </span>
                        )}
                      </span>
                      <span className="encarregado-matricula">
                        {nomeColaborador(equipe.encarregadoId)} ·{" "}
                        {equipe.membros.reduce((soma, membro) => soma + membro.quantidade, 0)} membro(s)
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="distrito-conteudo">
            {equipeSelecionada ? (
              <section className="form-section">
                <div className="list-header">
                  <h2 className="form-section-title">Equipe efetiva — {equipeSelecionada.nome}</h2>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => setEditandoEquipe(equipeSelecionada)}
                    >
                      Editar equipe
                    </button>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() => setEquipeSelecionada(null)}
                    >
                      Voltar para o distrito
                    </button>
                  </div>
                </div>
                <p className="form-section-subtitle">
                  A equipe efetiva é a mão de obra e os equipamentos do RDO mais recente lançado pelo encarregado desta
                  equipe — pode ser diferente do cadastro fixo abaixo, que é só a escala prevista.
                </p>
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

      {editandoEquipe && distritoId && (
        <EquipeModal
          equipe={editandoEquipe}
          distritoId={distritoId}
          colaboradores={colaboradores}
          funcoes={funcoes}
          onClose={() => setEditandoEquipe(null)}
          onSalvo={handleEquipeSalva}
        />
      )}

      {editandoColaborador && (
        <ColaboradorModal
          funcoes={funcoes}
          onClose={() => setEditandoColaborador(false)}
          onSalvo={(colaborador) => {
            setColaboradores((atual) => [...atual, colaborador]);
            setEditandoColaborador(false);
          }}
        />
      )}
    </div>
  );
}

function EquipeModal({
  equipe,
  distritoId,
  colaboradores,
  funcoes,
  onClose,
  onSalvo,
}: {
  equipe: Equipe | "novo";
  distritoId: string;
  colaboradores: Colaborador[];
  funcoes: Funcao[];
  onClose: () => void;
  onSalvo: (equipe: Equipe) => void;
}): ReactElement {
  const existente = equipe === "novo" ? null : equipe;
  const [nome, setNome] = useState(existente?.nome ?? "");
  const [encarregadoId, setEncarregadoId] = useState(existente?.encarregadoId ?? "");
  const [ativo, setAtivo] = useState(existente?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [equipeAtual, setEquipeAtual] = useState(existente);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const payload = { nome, distritoId, encarregadoId: encarregadoId === "" ? null : encarregadoId, ativo };
      const salvo = existente
        ? await api.patch<Equipe>(`/equipes/${existente.id}`, payload)
        : await api.post<Equipe>("/equipes", payload);
      setEquipeAtual(salvo);
      onSalvo(salvo);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card modal-card--wide" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">{existente ? "Editar equipe" : "Nova equipe"}</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="nome">
            Nome
          </label>
          <input
            id="nome"
            className="field-input"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="encarregadoId">
            Encarregado
          </label>
          <select
            id="encarregadoId"
            className="field-input"
            value={encarregadoId}
            onChange={(event) => setEncarregadoId(event.target.value)}
          >
            <option value="">Nenhum</option>
            {colaboradores.map((colaborador) => (
              <option key={colaborador.id} value={colaborador.id}>
                {colaborador.nome}
              </option>
            ))}
          </select>

          <label className="checkbox-row">
            <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
            Equipe ativa
          </label>

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Salvando…" : existente ? "Salvar" : "Criar equipe"}
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </form>

        {equipeAtual && (
          <MembrosSection
            equipe={equipeAtual}
            funcoes={funcoes}
            onAtualizado={(atualizada) => {
              setEquipeAtual(atualizada);
              onSalvo(atualizada);
            }}
          />
        )}
      </div>
    </div>
  );
}

function MembrosSection({
  equipe,
  funcoes,
  onAtualizado,
}: {
  equipe: Equipe;
  funcoes: Funcao[];
  onAtualizado: (equipe: Equipe) => void;
}): ReactElement {
  const [funcaoId, setFuncaoId] = useState(funcoes[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState("1");
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  async function handleAdicionar(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!funcaoId) return;
    setProcessando(true);
    setErro(null);
    try {
      const membro = await api.post<Membro>(`/equipes/${equipe.id}/membros`, {
        funcaoId,
        quantidade: Number(quantidade) || 1,
      });
      onAtualizado({ ...equipe, membros: [...equipe.membros, membro] });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível adicionar o membro.");
    } finally {
      setProcessando(false);
    }
  }

  async function handleRemover(membroId: string): Promise<void> {
    setProcessando(true);
    setErro(null);
    try {
      await api.delete(`/equipes/${equipe.id}/membros/${membroId}`);
      onAtualizado({ ...equipe, membros: equipe.membros.filter((m) => m.id !== membroId) });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível remover o membro.");
    } finally {
      setProcessando(false);
    }
  }

  const totalPessoas = equipe.membros.reduce((soma, membro) => soma + membro.quantidade, 0);

  return (
    <div className="membros-section">
      <h3 className="membros-title">Membros ({totalPessoas})</h3>

      {equipe.membros.length === 0 ? (
        <p className="table-empty">Nenhum membro adicionado ainda.</p>
      ) : (
        equipe.membros.map((membro) => (
          <div className="membro-row" key={membro.id}>
            <span>
              {membro.colaborador ? `${membro.colaborador.nome} — ` : ""}
              {membro.funcao.nome} ({membro.quantidade}x)
            </span>
            <button
              type="button"
              className="button button--ghost button--small"
              disabled={processando}
              onClick={() => void handleRemover(membro.id)}
            >
              Remover
            </button>
          </div>
        ))
      )}

      {erro && <p className="feedback feedback--erro">{erro}</p>}

      <form className="membro-add-row" onSubmit={(event) => void handleAdicionar(event)}>
        <select className="field-input" value={funcaoId} onChange={(event) => setFuncaoId(event.target.value)}>
          {funcoes.map((funcao) => (
            <option key={funcao.id} value={funcao.id}>
              {funcao.nome}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          className="field-input"
          value={quantidade}
          onChange={(event) => setQuantidade(event.target.value)}
        />
        <button type="submit" className="button button--small" disabled={processando}>
          Adicionar
        </button>
      </form>
    </div>
  );
}

type ColaboradorForm = { matricula: string; nome: string; funcaoId: string; ativo: boolean };

function ColaboradorModal({
  funcoes,
  onClose,
  onSalvo,
}: {
  funcoes: Funcao[];
  onClose: () => void;
  onSalvo: (colaborador: Colaborador) => void;
}): ReactElement {
  const [form, setForm] = useState<ColaboradorForm>({
    matricula: "",
    nome: "",
    funcaoId: funcoes[0]?.id ?? "",
    ativo: true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const salvo = await api.post<Colaborador>("/colaboradores", form);
      onSalvo(salvo);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Novo colaborador</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="matricula">
            Matrícula
          </label>
          <input
            id="matricula"
            className="field-input"
            value={form.matricula}
            onChange={(event) => setForm((f) => ({ ...f, matricula: event.target.value }))}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="colaboradorNome">
            Nome
          </label>
          <input
            id="colaboradorNome"
            className="field-input"
            value={form.nome}
            onChange={(event) => setForm((f) => ({ ...f, nome: event.target.value }))}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="funcaoId">
            Função
          </label>
          <select
            id="funcaoId"
            className="field-input"
            value={form.funcaoId}
            onChange={(event) => setForm((f) => ({ ...f, funcaoId: event.target.value }))}
          >
            {funcoes.map((funcao) => (
              <option key={funcao.id} value={funcao.id}>
                {funcao.nome}
              </option>
            ))}
          </select>

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Salvando…" : "Criar colaborador"}
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
