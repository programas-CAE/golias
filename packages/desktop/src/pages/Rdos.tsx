import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";
import { abrirExterno, getSettings } from "../lib/settingsStore";

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
  codigoRastreio: string;
  data: string;
  status: string;
  frente: Frente;
  equipe: { id: string; nome: string };
  linkCampoToken: string | null;
  linkCampoExpiraEm: string | null;
  pdfDisponivel: boolean;
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

/** Minúsculo e sem acento — mesma tolerância de busca já usada na tela de Ordens de Manutenção. */
function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(MARCAS_DIACRITICAS, "").toLowerCase().trim();
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "Aguardando validação",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

/**
 * Período (dia 21 do mês anterior ao dia 20 do mês selecionado) usado pra
 * arquivar/consultar os RDOs por ciclo, a pedido do usuário — não é o
 * mesmo ciclo do Farol (dia 19 a 20), é um período de arquivo diferente.
 */
function periodoDoArquivo(mes: string): { inicio: string; fim: string } {
  const [anoStr, mesStr] = mes.split("-");
  const ano = Number(anoStr);
  const mesNumero = Number(mesStr);
  const inicio = new Date(ano, mesNumero - 2, 21);
  const fim = new Date(ano, mesNumero - 1, 20);
  const formatar = (data: Date): string =>
    `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
  return { inicio: formatar(inicio), fim: formatar(fim) };
}

export default function Rdos(): ReactElement {
  const navigate = useNavigate();
  const [rdos, setRdos] = useState<Rdo[] | null>(null);
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [webUrl, setWebUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [criando, setCriando] = useState(false);
  const [linkGerado, setLinkGerado] = useState<{ rdo: Rdo; copiado: boolean } | null>(null);
  const [mes, setMes] = useState(mesAtual());
  const [busca, setBusca] = useState("");
  const [excluindo, setExcluindo] = useState<string | null>(null);

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

  async function baixarPdf(rdo: Rdo): Promise<void> {
    const settings = await getSettings();
    await abrirExterno(`${settings.apiUrl.replace(/\/$/, "")}/rdos/${rdo.id}/pdf`);
  }

  const periodo = useMemo(() => periodoDoArquivo(mes), [mes]);
  const rdosDoPeriodo = useMemo(() => {
    const termo = normalizarBusca(busca);
    return (rdos ?? []).filter((rdo) => {
      const data = rdo.data.slice(0, 10);
      if (data < periodo.inicio || data > periodo.fim) return false;
      if (termo === "") return true;
      return [rdo.codigoRastreio, rdo.frente.nome, rdo.equipe.nome].some((campo) => normalizarBusca(campo).includes(termo));
    });
  }, [rdos, periodo, busca]);

  async function copiarLink(rdo: Rdo): Promise<void> {
    await navigator.clipboard.writeText(linkDoRdo(rdo));
    setLinkGerado({ rdo, copiado: true });
    setTimeout(() => setLinkGerado((atual) => (atual?.rdo.id === rdo.id ? { ...atual, copiado: false } : atual)), 2000);
  }

  async function excluirRascunho(rdo: Rdo): Promise<void> {
    if (!window.confirm(`Apagar o RDO ${rdo.codigoRastreio} (${rdo.equipe.nome}, ${rdo.data.slice(0, 10)})? Essa ação não pode ser desfeita.`)) {
      return;
    }
    setExcluindo(rdo.id);
    setErro(null);
    try {
      await api.delete(`/rdos/${rdo.id}`);
      setRdos((atual) => atual?.filter((item) => item.id !== rdo.id) ?? atual);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível apagar o RDO.");
    } finally {
      setExcluindo(null);
    }
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

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div>
            <label className="field-label">Período (dia 21 ao dia 20)</label>
            <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
          </div>
          <div>
            <label className="field-label">Buscar</label>
            <input
              className="field-input"
              style={{ minWidth: 260 }}
              placeholder="Código, frente ou equipe…"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
            />
          </div>
          <p className="list-subtitle" style={{ marginTop: 20 }}>
            {periodo.inicio.split("-").reverse().join("/")} a {periodo.fim.split("-").reverse().join("/")}
          </p>
        </div>

        <div className="panel">
          {rdos === null ? (
            <p className="table-empty">Carregando…</p>
          ) : rdosDoPeriodo.length === 0 ? (
            <p className="table-empty">{busca ? "Nenhum RDO encontrado para essa busca." : "Nenhum RDO nesse período."}</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Data</th>
                  <th>Frente</th>
                  <th>Equipe</th>
                  <th>Status</th>
                  <th>Link expira em</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rdosDoPeriodo.map((rdo) => (
                  <tr key={rdo.id}>
                    <td>{rdo.codigoRastreio}</td>
                    <td>{rdo.data.slice(0, 10)}</td>
                    <td>{rdo.frente.nome}</td>
                    <td>{rdo.equipe.nome}</td>
                    <td>
                      <span className="badge badge--ativo">{STATUS_LABEL[rdo.status] ?? rdo.status}</span>
                    </td>
                    <td>{rdo.linkCampoExpiraEm ? rdo.linkCampoExpiraEm.slice(0, 10) : "—"}</td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button type="button" className="button button--ghost button--small" onClick={() => navigate(`/rdos/${rdo.id}`)}>
                        Ver
                      </button>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        disabled={!rdo.pdfDisponivel}
                        title={rdo.pdfDisponivel ? undefined : "PDF ainda não foi gerado"}
                        onClick={() => void baixarPdf(rdo)}
                      >
                        Baixar PDF
                      </button>
                      {rdo.linkCampoToken && (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => void copiarLink(rdo)}
                        >
                          {linkGerado?.rdo.id === rdo.id && linkGerado.copiado ? "Copiado!" : "Copiar link"}
                        </button>
                      )}
                      {rdo.status === "RASCUNHO" && (
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          disabled={excluindo === rdo.id}
                          onClick={() => void excluirRascunho(rdo)}
                        >
                          {excluindo === rdo.id ? "Apagando…" : "Apagar"}
                        </button>
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
