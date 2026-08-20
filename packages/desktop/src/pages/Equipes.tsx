import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Frente {
  id: string;
  nome: string;
}

interface Colaborador {
  id: string;
  nome: string;
}

interface Funcao {
  id: string;
  nome: string;
}

interface Membro {
  id: string;
  colaboradorId: string;
  colaborador: Colaborador;
  funcaoId: string;
  funcao: Funcao;
  quantidade: number;
}

interface Equipe {
  id: string;
  nome: string;
  frenteId: string;
  frente: Frente;
  encarregadoId: string | null;
  ativo: boolean;
  membros: Membro[];
}

export default function Equipes(): ReactElement {
  const [equipes, setEquipes] = useState<Equipe[] | null>(null);
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Equipe | "novo" | null>(null);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaEquipes, listaFrentes, listaColaboradores, listaFuncoes] = await Promise.all([
        api.get<Equipe[]>("/equipes"),
        api.get<Frente[]>("/frentes"),
        api.get<Colaborador[]>("/colaboradores"),
        api.get<Funcao[]>("/funcoes"),
      ]);
      setEquipes(listaEquipes);
      setFrentes(listaFrentes);
      setColaboradores(listaColaboradores);
      setFuncoes(listaFuncoes);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar as equipes.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function handleSalvo(equipe: Equipe): void {
    setEquipes((atual) => {
      if (!atual) return atual;
      const existe = atual.some((e) => e.id === equipe.id);
      return existe ? atual.map((e) => (e.id === equipe.id ? equipe : e)) : [...atual, equipe];
    });
    setEditando(equipe);
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Equipes</h1>
            <p className="list-subtitle">Equipes de trabalho e seus membros por frente</p>
          </div>
          <button type="button" className="button" onClick={() => setEditando("novo")}>
            Nova equipe
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {equipes === null ? (
            <p className="table-empty">Carregando…</p>
          ) : equipes.length === 0 ? (
            <p className="table-empty">Nenhuma equipe cadastrada.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Frente</th>
                  <th>Membros</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {equipes.map((equipe) => (
                  <tr key={equipe.id}>
                    <td>{equipe.nome}</td>
                    <td>{equipe.frente.nome}</td>
                    <td>{equipe.membros.length}</td>
                    <td>
                      <span className={`badge badge--${equipe.ativo ? "ativo" : "inativo"}`}>
                        {equipe.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => setEditando(equipe)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando && (
        <EquipeModal
          equipe={editando}
          frentes={frentes}
          colaboradores={colaboradores}
          funcoes={funcoes}
          onClose={() => setEditando(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}

function EquipeModal({
  equipe,
  frentes,
  colaboradores,
  funcoes,
  onClose,
  onSalvo,
}: {
  equipe: Equipe | "novo";
  frentes: Frente[];
  colaboradores: Colaborador[];
  funcoes: Funcao[];
  onClose: () => void;
  onSalvo: (equipe: Equipe) => void;
}): ReactElement {
  const existente = equipe === "novo" ? null : equipe;
  const [nome, setNome] = useState(existente?.nome ?? "");
  const [frenteId, setFrenteId] = useState(existente?.frenteId ?? (frentes[0]?.id ?? ""));
  const [encarregadoId, setEncarregadoId] = useState(existente?.encarregadoId ?? "");
  const [ativo, setAtivo] = useState(existente?.ativo ?? true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const payload = { nome, frenteId, encarregadoId: encarregadoId === "" ? null : encarregadoId, ativo };
      const salvo = existente
        ? await api.patch<Equipe>(`/equipes/${existente.id}`, payload)
        : await api.post<Equipe>("/equipes", payload);
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

          <label className="field-label" htmlFor="frenteId">
            Frente
          </label>
          <select id="frenteId" className="field-input" value={frenteId} onChange={(event) => setFrenteId(event.target.value)}>
            {frentes.map((frente) => (
              <option key={frente.id} value={frente.id}>
                {frente.nome}
              </option>
            ))}
          </select>

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

        {existente && (
          <MembrosSection equipe={existente} colaboradores={colaboradores} funcoes={funcoes} onAtualizado={onSalvo} />
        )}
      </div>
    </div>
  );
}

function MembrosSection({
  equipe,
  colaboradores,
  funcoes,
  onAtualizado,
}: {
  equipe: Equipe;
  colaboradores: Colaborador[];
  funcoes: Funcao[];
  onAtualizado: (equipe: Equipe) => void;
}): ReactElement {
  const [colaboradorId, setColaboradorId] = useState(colaboradores[0]?.id ?? "");
  const [funcaoId, setFuncaoId] = useState(funcoes[0]?.id ?? "");
  const [quantidade, setQuantidade] = useState("1");
  const [erro, setErro] = useState<string | null>(null);
  const [processando, setProcessando] = useState(false);

  async function handleAdicionar(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!colaboradorId || !funcaoId) return;
    setProcessando(true);
    setErro(null);
    try {
      const membro = await api.post<Membro>(`/equipes/${equipe.id}/membros`, {
        colaboradorId,
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

  return (
    <div className="membros-section">
      <h3 className="membros-title">Membros ({equipe.membros.length})</h3>

      {equipe.membros.length === 0 ? (
        <p className="table-empty">Nenhum membro adicionado ainda.</p>
      ) : (
        equipe.membros.map((membro) => (
          <div className="membro-row" key={membro.id}>
            <span>
              {membro.colaborador.nome} — {membro.funcao.nome} ({membro.quantidade}x)
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
        <select className="field-input" value={colaboradorId} onChange={(event) => setColaboradorId(event.target.value)}>
          {colaboradores.map((colaborador) => (
            <option key={colaborador.id} value={colaborador.id}>
              {colaborador.nome}
            </option>
          ))}
        </select>
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
