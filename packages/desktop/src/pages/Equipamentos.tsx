import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Equipamento {
  id: string;
  nome: string;
  ativo: boolean;
}

export default function Equipamentos(): ReactElement {
  const [equipamentos, setEquipamentos] = useState<Equipamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Equipamento | null>(null);
  const [criando, setCriando] = useState(false);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      setEquipamentos(await api.get<Equipamento[]>("/equipamentos?todos=1"));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o catálogo de equipamentos.");
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
            <h1 className="list-title">Catálogo de Equipamentos</h1>
            <p className="list-subtitle">
              Equipamentos e outros custos indiretos que aparecem no RDO — essa lista muda com frequência, edite à
              vontade.
            </p>
          </div>
          <button type="button" className="button" onClick={() => setCriando(true)}>
            + Adicionar equipamento
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {equipamentos === null ? (
            <p className="table-empty">Carregando…</p>
          ) : equipamentos.length === 0 ? (
            <p className="table-empty">Nenhum equipamento cadastrado.</p>
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
                {equipamentos.map((equipamento) => (
                  <tr key={equipamento.id}>
                    <td>{equipamento.nome}</td>
                    <td>
                      <span className={`badge badge--${equipamento.ativo ? "ativo" : "inativo"}`}>
                        {equipamento.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => setEditando(equipamento)}
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
        <NovoEquipamentoModal
          onClose={() => setCriando(false)}
          onCriado={(novo) => {
            setEquipamentos((atual) => [...(atual ?? []), novo]);
            setCriando(false);
          }}
        />
      )}

      {editando && (
        <EditarEquipamentoModal
          equipamento={editando}
          onClose={() => setEditando(null)}
          onSalvo={(atualizado) => {
            setEquipamentos((atual) => atual?.map((e) => (e.id === atualizado.id ? atualizado : e)) ?? atual);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function NovoEquipamentoModal({
  onClose,
  onCriado,
}: {
  onClose: () => void;
  onCriado: (equipamento: Equipamento) => void;
}): ReactElement {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const criado = await api.post<Equipamento>("/equipamentos", { nome });
      onCriado(criado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar o equipamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Adicionar equipamento</h2>
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
            autoFocus
          />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando || nome.trim() === ""}>
              {salvando ? "Salvando…" : "Adicionar"}
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

function EditarEquipamentoModal({
  equipamento,
  onClose,
  onSalvo,
}: {
  equipamento: Equipamento;
  onClose: () => void;
  onSalvo: (equipamento: Equipamento) => void;
}): ReactElement {
  const [nome, setNome] = useState(equipamento.nome);
  const [ativo, setAtivo] = useState(equipamento.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await api.patch<Equipamento>(`/equipamentos/${equipamento.id}`, { nome, ativo });
      onSalvo(atualizado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Editar equipamento</h2>
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
            Equipamento ativo (some da lista do RDO quando desmarcado)
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
