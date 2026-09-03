import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Obra {
  id: string;
  nome: string;
  ativo: boolean;
  criadoEm: string;
}

export default function Obras(): ReactElement {
  const navigate = useNavigate();
  const [obras, setObras] = useState<Obra[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Obra | null>(null);
  const [criando, setCriando] = useState(false);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      setObras(await api.get<Obra[]>("/obras?todos=1"));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar as obras.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Obras</h1>
            <p className="list-subtitle">
              Projetos com nome próprio — acompanhe o cronograma de lançamentos e os materiais usados em cada um.
            </p>
          </div>
          <button type="button" className="button" onClick={() => setCriando(true)}>
            + Nova obra
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {obras === null ? (
            <p className="table-empty">Carregando…</p>
          ) : obras.length === 0 ? (
            <p className="table-empty">Nenhuma obra cadastrada.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {obras.map((obra) => (
                  <tr key={obra.id}>
                    <td>{obra.nome}</td>
                    <td>
                      <span className={`badge badge--${obra.ativo ? "ativo" : "inativo"}`}>
                        {obra.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button type="button" className="button button--ghost button--small" onClick={() => navigate(`/obras/${obra.id}`)}>
                        Acompanhar
                      </button>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => setEditando(obra)}
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

      {criando && (
        <NovaObraModal
          onClose={() => setCriando(false)}
          onCriada={(nova) => {
            setObras((atual) => [...(atual ?? []), nova]);
            setCriando(false);
          }}
        />
      )}

      {editando && (
        <EditarObraModal
          obra={editando}
          onClose={() => setEditando(null)}
          onSalvo={(atualizada) => {
            setObras((atual) => atual?.map((o) => (o.id === atualizada.id ? atualizada : o)) ?? atual);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function NovaObraModal({ onClose, onCriada }: { onClose: () => void; onCriada: (obra: Obra) => void }): ReactElement {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const criada = await api.post<Obra>("/obras", { nome });
      onCriada(criada);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar a obra.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Nova obra</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="nome">
            Nome
          </label>
          <input
            id="nome"
            className="field-input"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            placeholder="Ex.: Duplicação Km 40-60"
            autoComplete="off"
            autoFocus
          />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando || nome.trim() === ""}>
              {salvando ? "Salvando…" : "Criar"}
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

function EditarObraModal({
  obra,
  onClose,
  onSalvo,
}: {
  obra: Obra;
  onClose: () => void;
  onSalvo: (obra: Obra) => void;
}): ReactElement {
  const [nome, setNome] = useState(obra.nome);
  const [ativo, setAtivo] = useState(obra.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const atualizada = await api.patch<Obra>(`/obras/${obra.id}`, { nome, ativo });
      onSalvo(atualizada);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Editar obra</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="nome-editar">
            Nome
          </label>
          <input
            id="nome-editar"
            className="field-input"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoComplete="off"
          />

          <label className="checkbox-row">
            <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
            Obra ativa (some da lista que o encarregado escolhe ao lançar o RDO quando desmarcada)
          </label>

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando || nome.trim() === ""}>
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
