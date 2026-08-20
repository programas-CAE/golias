import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Funcao {
  id: string;
  nome: string;
}

interface Colaborador {
  id: string;
  matricula: string;
  nome: string;
  ativo: boolean;
  funcaoId: string;
  funcao: Funcao;
}

type ColaboradorForm = { matricula: string; nome: string; funcaoId: string; ativo: boolean };

export default function Colaboradores(): ReactElement {
  const [colaboradores, setColaboradores] = useState<Colaborador[] | null>(null);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Colaborador | "novo" | null>(null);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaColaboradores, listaFuncoes] = await Promise.all([
        api.get<Colaborador[]>("/colaboradores"),
        api.get<Funcao[]>("/funcoes"),
      ]);
      setColaboradores(listaColaboradores);
      setFuncoes(listaFuncoes);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os colaboradores.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function handleSalvo(colaborador: Colaborador): void {
    setColaboradores((atual) => {
      if (!atual) return atual;
      const existe = atual.some((c) => c.id === colaborador.id);
      return existe ? atual.map((c) => (c.id === colaborador.id ? colaborador : c)) : [...atual, colaborador];
    });
    setEditando(null);
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Colaboradores</h1>
            <p className="list-subtitle">Cadastro da mão de obra própria e terceirizada</p>
          </div>
          <button type="button" className="button" onClick={() => setEditando("novo")}>
            Novo colaborador
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {colaboradores === null ? (
            <p className="table-empty">Carregando…</p>
          ) : colaboradores.length === 0 ? (
            <p className="table-empty">Nenhum colaborador cadastrado.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Matrícula</th>
                  <th>Nome</th>
                  <th>Função</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {colaboradores.map((colaborador) => (
                  <tr key={colaborador.id}>
                    <td>{colaborador.matricula}</td>
                    <td>{colaborador.nome}</td>
                    <td>{colaborador.funcao.nome}</td>
                    <td>
                      <span className={`badge badge--${colaborador.ativo ? "ativo" : "inativo"}`}>
                        {colaborador.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => setEditando(colaborador)}
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

      {editando && <ColaboradorModal colaborador={editando} funcoes={funcoes} onClose={() => setEditando(null)} onSalvo={handleSalvo} />}
    </div>
  );
}

function ColaboradorModal({
  colaborador,
  funcoes,
  onClose,
  onSalvo,
}: {
  colaborador: Colaborador | "novo";
  funcoes: Funcao[];
  onClose: () => void;
  onSalvo: (colaborador: Colaborador) => void;
}): ReactElement {
  const existente = colaborador === "novo" ? null : colaborador;
  const [form, setForm] = useState<ColaboradorForm>({
    matricula: existente?.matricula ?? "",
    nome: existente?.nome ?? "",
    funcaoId: existente?.funcaoId ?? (funcoes[0]?.id ?? ""),
    ativo: existente?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const salvo = existente
        ? await api.patch<Colaborador>(`/colaboradores/${existente.id}`, form)
        : await api.post<Colaborador>("/colaboradores", form);
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
        <h2 className="modal-title">{existente ? "Editar colaborador" : "Novo colaborador"}</h2>
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

          <label className="field-label" htmlFor="nome">
            Nome
          </label>
          <input
            id="nome"
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

          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={form.ativo}
              onChange={(event) => setForm((f) => ({ ...f, ativo: event.target.checked }))}
            />
            Colaborador ativo
          </label>

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
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
