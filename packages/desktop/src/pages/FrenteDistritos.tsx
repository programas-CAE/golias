import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Frente {
  id: string;
  nome: string;
  codigo: string;
}

interface Distrito {
  id: string;
  nome: string;
  ativo: boolean;
  frenteId: string;
  _count: { equipes: number };
}

export default function FrenteDistritos(): ReactElement {
  const { frenteId } = useParams<{ frenteId: string }>();
  const navigate = useNavigate();
  const [frente, setFrente] = useState<Frente | null>(null);
  const [distritos, setDistritos] = useState<Distrito[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);

  async function carregar(): Promise<void> {
    if (!frenteId) return;
    setErro(null);
    try {
      const [frentes, listaDistritos] = await Promise.all([
        api.get<Frente[]>("/frentes"),
        api.get<Distrito[]>(`/frentes/${frenteId}/distritos`),
      ]);
      setFrente(frentes.find((f) => f.id === frenteId) ?? null);
      setDistritos(listaDistritos);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os distritos.");
    }
  }

  useEffect(() => {
    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frenteId]);

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Distritos {frente ? `— ${frente.nome}` : ""}</h1>
            <p className="list-subtitle">Subdivisões da frente, cada uma com suas equipes e encarregados</p>
          </div>
          <button type="button" className="button" onClick={() => setCriando(true)}>
            Novo distrito
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {distritos === null ? (
            <p className="table-empty">Carregando…</p>
          ) : distritos.length === 0 ? (
            <p className="table-empty">Nenhum distrito cadastrado nesta frente ainda.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Equipes</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {distritos.map((distrito) => (
                  <tr key={distrito.id} onClick={() => navigate(`/distritos/${distrito.id}`)} style={{ cursor: "pointer" }}>
                    <td>{distrito.nome}</td>
                    <td>{distrito._count.equipes}</td>
                    <td>
                      <span className={`badge badge--${distrito.ativo ? "ativo" : "inativo"}`}>
                        {distrito.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(`/distritos/${distrito.id}`);
                        }}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {criando && frenteId && (
        <NovoDistritoModal
          frenteId={frenteId}
          onClose={() => setCriando(false)}
          onCriado={(distrito) => {
            setDistritos((atual) => [...(atual ?? []), distrito]);
            setCriando(false);
          }}
        />
      )}
    </div>
  );
}

function NovoDistritoModal({
  frenteId,
  onClose,
  onCriado,
}: {
  frenteId: string;
  onClose: () => void;
  onCriado: (distrito: Distrito) => void;
}): ReactElement {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const distrito = await api.post<Omit<Distrito, "_count">>("/distritos", { nome, frenteId });
      onCriado({ ...distrito, _count: { equipes: 0 } });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar o distrito.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Novo distrito</h2>
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

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Criando…" : "Criar distrito"}
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
