import { useEffect, useState, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";
import { getSettings } from "../lib/settingsStore";

interface Frente {
  id: string;
  codigo: string;
  nome: string;
  ativo: boolean;
  portalFiscalToken: string | null;
  portalEncarregadoToken: string | null;
}

interface Rdo {
  id: string;
  data: string;
  status: string;
  frente: { id: string; nome: string };
  equipe: { id: string; nome: string };
  linkCampoToken: string | null;
  linkCampoExpiraEm: string | null;
}

// Só esses dois status ainda esperam ação do encarregado pelo link de
// campo — os demais (aguardando validação/aprovação, aprovado, reprovado)
// já saíram das mãos dele ou aguardam um novo link de campo específico.
const STATUS_AGUARDANDO_PREENCHIMENTO = new Set(["RASCUNHO", "EM_CORRECAO"]);

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
};

export default function Links(): ReactElement {
  const [frentes, setFrentes] = useState<Frente[] | null>(null);
  const [rdos, setRdos] = useState<Rdo[] | null>(null);
  const [webUrl, setWebUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoToken, setGerandoToken] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaFrentes, listaRdos, settings] = await Promise.all([
        api.get<Frente[]>("/frentes"),
        api.get<Rdo[]>("/rdos"),
        getSettings(),
      ]);
      setFrentes(listaFrentes);
      setRdos(listaRdos);
      setWebUrl(settings.webUrl);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os links.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function linkPortalFiscal(token: string): string {
    return `${webUrl.replace(/\/$/, "")}/portal-fiscal/${token}`;
  }

  function linkPortalEncarregado(token: string): string {
    return `${webUrl.replace(/\/$/, "")}/encarregado/${token}`;
  }

  function linkDeCampo(token: string): string {
    return `${webUrl.replace(/\/$/, "")}/campo/${token}`;
  }

  async function gerarLinkFiscal(frenteId: string): Promise<void> {
    setGerandoToken(`fiscal-${frenteId}`);
    try {
      const atualizada = await api.post<Frente>(`/frentes/${frenteId}/portal-token`, {});
      setFrentes((atual) => atual?.map((f) => (f.id === atualizada.id ? atualizada : f)) ?? atual);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível gerar o link.");
    } finally {
      setGerandoToken(null);
    }
  }

  async function gerarLinkEncarregado(frenteId: string): Promise<void> {
    setGerandoToken(`encarregado-${frenteId}`);
    try {
      const atualizada = await api.post<Frente>(`/frentes/${frenteId}/portal-encarregado-token`, {});
      setFrentes((atual) => atual?.map((f) => (f.id === atualizada.id ? atualizada : f)) ?? atual);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível gerar o link.");
    } finally {
      setGerandoToken(null);
    }
  }

  async function copiar(chave: string, texto: string): Promise<void> {
    await navigator.clipboard.writeText(texto);
    setLinkCopiado(chave);
    setTimeout(() => setLinkCopiado((atual) => (atual === chave ? null : atual)), 2000);
  }

  const rdosPendentes = (rdos ?? [])
    .filter((rdo) => rdo.linkCampoToken && STATUS_AGUARDANDO_PREENCHIMENTO.has(rdo.status))
    .sort((a, b) => b.data.localeCompare(a.data));
  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Links</h1>
            <p className="list-subtitle">
              Links fixos do portal do fiscal e do portal do encarregado (por frente), e links de campo pendentes de
              preenchimento
            </p>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <section className="form-section">
          <h2 className="form-section-title">Portal do fiscal</h2>
          <p className="form-section-subtitle">
            Link fixo por frente — o fiscal salva e volta nele sempre, não expira.
          </p>
          <div className="panel" style={{ marginTop: 12 }}>
            {frentes === null ? (
              <p className="table-empty">Carregando…</p>
            ) : frentes.length === 0 ? (
              <p className="table-empty">Nenhuma frente cadastrada.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Frente</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {frentes.map((frente) => (
                    <tr key={frente.id}>
                      <td>{frente.nome}</td>
                      <td>
                        <span className={`badge badge--${frente.ativo ? "ativo" : "inativo"}`}>
                          {frente.ativo ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {frente.portalFiscalToken ? (
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() => void copiar(`fiscal-${frente.id}`, linkPortalFiscal(frente.portalFiscalToken!))}
                          >
                            {linkCopiado === `fiscal-${frente.id}` ? "Copiado!" : "Copiar link"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            disabled={gerandoToken === `fiscal-${frente.id}`}
                            onClick={() => void gerarLinkFiscal(frente.id)}
                          >
                            {gerandoToken === `fiscal-${frente.id}` ? "Gerando…" : "Gerar link"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Portal do encarregado</h2>
          <p className="form-section-subtitle">
            Link fixo por frente — o encarregado escolhe a equipe (o navegador lembra a última) e lança a produção do
            dia, sem precisar que o escritório crie o RDO antes.
          </p>
          <div className="panel" style={{ marginTop: 12 }}>
            {frentes === null ? (
              <p className="table-empty">Carregando…</p>
            ) : frentes.length === 0 ? (
              <p className="table-empty">Nenhuma frente cadastrada.</p>
            ) : (
              <table className="table">
                <thead>
                  <tr>
                    <th>Frente</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {frentes.map((frente) => (
                    <tr key={frente.id}>
                      <td>{frente.nome}</td>
                      <td>
                        <span className={`badge badge--${frente.ativo ? "ativo" : "inativo"}`}>
                          {frente.ativo ? "Ativa" : "Inativa"}
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        {frente.portalEncarregadoToken ? (
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() =>
                              void copiar(`encarregado-${frente.id}`, linkPortalEncarregado(frente.portalEncarregadoToken!))
                            }
                          >
                            {linkCopiado === `encarregado-${frente.id}` ? "Copiado!" : "Copiar link"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            disabled={gerandoToken === `encarregado-${frente.id}`}
                            onClick={() => void gerarLinkEncarregado(frente.id)}
                          >
                            {gerandoToken === `encarregado-${frente.id}` ? "Gerando…" : "Gerar link"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Preenchimento do encarregado</h2>
          <p className="form-section-subtitle">
            RDOs ainda não enviados ou reprovados e reabertos para correção — um link por RDO, válido por 7 dias.
          </p>
          <div className="panel" style={{ marginTop: 12 }}>
            {rdos === null ? (
              <p className="table-empty">Carregando…</p>
            ) : rdosPendentes.length === 0 ? (
              <p className="table-empty">Nenhum RDO aguardando preenchimento no momento.</p>
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
                  {rdosPendentes.map((rdo) => {
                    const expirado = rdo.linkCampoExpiraEm != null && rdo.linkCampoExpiraEm.slice(0, 10) < hoje;
                    return (
                      <tr key={rdo.id}>
                        <td>{rdo.data.slice(0, 10)}</td>
                        <td>{rdo.frente.nome}</td>
                        <td>{rdo.equipe.nome}</td>
                        <td>
                          <span className="badge badge--ativo">{STATUS_LABEL[rdo.status] ?? rdo.status}</span>
                        </td>
                        <td>
                          {rdo.linkCampoExpiraEm ? (
                            <span className={expirado ? "feedback feedback--erro" : undefined}>
                              {rdo.linkCampoExpiraEm.slice(0, 10)}
                              {expirado ? " — expirado" : ""}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            disabled={expirado}
                            title={expirado ? "Link expirado — gere um novo RDO para reenviar ao encarregado" : undefined}
                            onClick={() => void copiar(`campo-${rdo.id}`, linkDeCampo(rdo.linkCampoToken!))}
                          >
                            {linkCopiado === `campo-${rdo.id}` ? "Copiado!" : "Copiar link"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
