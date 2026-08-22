import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";
import { getSettings } from "../lib/settingsStore";

interface Frente {
  id: string;
  nome: string;
}

interface Equipe {
  id: string;
  nome: string;
  distrito: { frenteId: string };
}

interface Rdo {
  id: string;
  data: string;
  status: string;
  frente: Frente;
  equipe: { id: string; nome: string };
  linkCampoToken: string | null;
  linkCampoExpiraEm: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export default function Rdos(): ReactElement {
  const navigate = useNavigate();
  const [rdos, setRdos] = useState<Rdo[] | null>(null);
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [webUrl, setWebUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<{ rdo: Rdo; copiado: boolean } | null>(null);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaRdos, listaFrentes, listaEquipes, settings] = await Promise.all([
        api.get<Rdo[]>("/rdos"),
        api.get<Frente[]>("/frentes"),
        api.get<Equipe[]>("/equipes"),
        getSettings(),
      ]);
      setRdos(listaRdos);
      setFrentes(listaFrentes);
      setEquipes(listaEquipes);
      setWebUrl(settings.webUrl);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os RDOs.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function linkDoRdo(rdo: Rdo): string {
    return `${webUrl.replace(/\/$/, "")}/campo/${rdo.linkCampoToken}`;
  }

  async function copiarLink(rdo: Rdo): Promise<void> {
    await navigator.clipboard.writeText(linkDoRdo(rdo));
    setLinkGerado({ rdo, copiado: true });
    setTimeout(() => setLinkGerado((atual) => (atual?.rdo.id === rdo.id ? { ...atual, copiado: false } : atual)), 2000);
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">RDOs</h1>
            <p className="list-subtitle">
              Gere um link de campo para o encarregado preencher, cadastre o RDO completo direto aqui, ou acompanhe os RDOs
              recebidos do campo abaixo
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" className="button button--secondary" onClick={() => navigate("/rdos/completo/novo")}>
              Cadastrar RDO completo
            </button>
            <button type="button" className="button" onClick={() => setCriando(true)}>
              Gerar RDO
            </button>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {rdos === null ? (
            <p className="table-empty">Carregando…</p>
          ) : rdos.length === 0 ? (
            <p className="table-empty">Nenhum RDO criado ainda.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Frente</th>
                  <th>Equipe</th>
                  <th>Status</th>
                  <th>Link expira em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rdos.map((rdo) => (
                  <tr key={rdo.id}>
                    <td>{rdo.data.slice(0, 10)}</td>
                    <td>{rdo.frente.nome}</td>
                    <td>{rdo.equipe.nome}</td>
                    <td>
                      <span className="badge badge--ativo">{STATUS_LABEL[rdo.status] ?? rdo.status}</span>
                    </td>
                    <td>{rdo.linkCampoExpiraEm ? rdo.linkCampoExpiraEm.slice(0, 10) : "—"}</td>
                    <td>
                      {rdo.linkCampoToken ? (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => void copiarLink(rdo)}
                        >
                          {linkGerado?.rdo.id === rdo.id && linkGerado.copiado ? "Copiado!" : "Copiar link"}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {criando && (
        <NovoRdoModal
          frentes={frentes}
          equipes={equipes}
          onClose={() => setCriando(false)}
          onCriado={(rdo) => {
            setRdos((atual) => [rdo, ...(atual ?? [])]);
            setCriando(false);
            setLinkGerado({ rdo, copiado: false });
          }}
        />
      )}

      {linkGerado && !criando && (
        <div className="modal-backdrop" onClick={() => setLinkGerado(null)}>
          <div className="modal-card" onClick={(event) => event.stopPropagation()}>
            <h2 className="modal-title">Link de campo gerado</h2>
            <p className="modal-subtitle">
              Envie este link para o encarregado preencher o RDO de {linkGerado.rdo.data.slice(0, 10)} pelo celular.
            </p>
            <p className="field-input link-display">{linkDoRdo(linkGerado.rdo)}</p>
            <div className="form-actions">
              <button type="button" className="button" onClick={() => void copiarLink(linkGerado.rdo)}>
                {linkGerado.copiado ? "Copiado!" : "Copiar link"}
              </button>
              <button type="button" className="button button--secondary" onClick={() => setLinkGerado(null)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NovoRdoModal({
  frentes,
  equipes,
  onClose,
  onCriado,
}: {
  frentes: Frente[];
  equipes: Equipe[];
  onClose: () => void;
  onCriado: (rdo: Rdo) => void;
}): ReactElement {
  const [frenteId, setFrenteId] = useState(frentes[0]?.id ?? "");
  const equipesDaFrente = equipes.filter((equipe) => equipe.distrito.frenteId === frenteId);
  const [equipeId, setEquipeId] = useState(equipesDaFrente[0]?.id ?? "");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function handleFrenteChange(novaFrenteId: string): void {
    setFrenteId(novaFrenteId);
    const primeiraEquipe = equipes.find((equipe) => equipe.distrito.frenteId === novaFrenteId);
    setEquipeId(primeiraEquipe?.id ?? "");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!frenteId || !equipeId) {
      setErro("Cadastre ao menos uma equipe para essa frente antes de criar um RDO.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      const rdo = await api.post<Rdo>("/rdos", { frenteId, equipeId, data });
      onCriado(rdo);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar o RDO.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Gerar RDO</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="frenteId">
            Frente
          </label>
          <select
            id="frenteId"
            className="field-input"
            value={frenteId}
            onChange={(event) => handleFrenteChange(event.target.value)}
          >
            {frentes.map((frente) => (
              <option key={frente.id} value={frente.id}>
                {frente.nome}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="equipeId">
            Equipe
          </label>
          <select
            id="equipeId"
            className="field-input"
            value={equipeId}
            onChange={(event) => setEquipeId(event.target.value)}
          >
            {equipesDaFrente.length === 0 && <option value="">Nenhuma equipe cadastrada para esta frente</option>}
            {equipesDaFrente.map((equipe) => (
              <option key={equipe.id} value={equipe.id}>
                {equipe.nome}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="data">
            Data
          </label>
          <input
            id="data"
            type="date"
            className="field-input"
            value={data}
            onChange={(event) => setData(event.target.value)}
          />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Criando…" : "Criar e gerar link"}
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
