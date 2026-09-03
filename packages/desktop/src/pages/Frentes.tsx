import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Contrato {
  id: string;
  numero: string;
  nome: string | null;
}

interface Frente {
  id: string;
  codigo: string;
  nome: string;
  contratoId: string;
  contrato: Contrato;
  ativo: boolean;
}

export default function Frentes(): ReactElement {
  const navigate = useNavigate();
  const [frentes, setFrentes] = useState<Frente[] | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Frente | null>(null);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaFrentes, listaContratos] = await Promise.all([
        api.get<Frente[]>("/frentes"),
        api.get<Contrato[]>("/contratos"),
      ]);
      setFrentes(listaFrentes);
      setContratos(listaContratos);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar as frentes.");
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
            <h1 className="list-title">Frentes</h1>
            <p className="list-subtitle">Frentes de trabalho contratadas (código fixo por contrato)</p>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {frentes === null ? (
            <p className="table-empty">Carregando…</p>
          ) : frentes.length === 0 ? (
            <p className="table-empty">Nenhuma frente cadastrada.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nome</th>
                  <th>Contrato (Nº SAP)</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {frentes.map((frente) => (
                  <tr key={frente.id}>
                    <td>{frente.codigo}</td>
                    <td>{frente.nome}</td>
                    <td>{frente.contrato.numero}</td>
                    <td>
                      <span className={`badge badge--${frente.ativo ? "ativo" : "inativo"}`}>
                        {frente.ativo ? "Ativa" : "Inativa"}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => navigate(`/frentes/${frente.id}/distritos`)}
                      >
                        Ver distritos
                      </button>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => setEditando(frente)}
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
        <EditarFrenteModal
          frente={editando}
          contratos={contratos}
          onClose={() => setEditando(null)}
          onSalvo={(atualizada) => {
            setFrentes((atual) => atual?.map((f) => (f.id === atualizada.id ? atualizada : f)) ?? atual);
            setEditando(null);
          }}
        />
      )}
    </div>
  );
}

function EditarFrenteModal({
  frente,
  contratos,
  onClose,
  onSalvo,
}: {
  frente: Frente;
  contratos: Contrato[];
  onClose: () => void;
  onSalvo: (frente: Frente) => void;
}): ReactElement {
  const [nome, setNome] = useState(frente.nome);
  const [contratoId, setContratoId] = useState(frente.contratoId);
  const [ativo, setAtivo] = useState(frente.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const atualizada = await api.patch<Frente>(`/frentes/${frente.id}`, { nome, contratoId, ativo });
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
        <h2 className="modal-title">Editar frente</h2>
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

          <label className="field-label" htmlFor="contratoId">
            Contrato
          </label>
          <select id="contratoId" className="field-input" value={contratoId} onChange={(event) => setContratoId(event.target.value)}>
            {contratos.map((contrato) => (
              <option key={contrato.id} value={contrato.id}>
                {contrato.numero}
                {contrato.nome ? ` — ${contrato.nome}` : ""}
              </option>
            ))}
          </select>

          <label className="checkbox-row">
            <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
            Frente ativa
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
