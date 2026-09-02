import { useEffect, useState, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";
import { getSettings } from "../lib/settingsStore";

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
  const [rdos, setRdos] = useState<Rdo[] | null>(null);
  const [webUrl, setWebUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState<string | null>(null);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaRdos, settings] = await Promise.all([api.get<Rdo[]>("/rdos"), getSettings()]);
      setRdos(listaRdos);
      setWebUrl(settings.webUrl);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os links.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  const linkPortalFiscal = `${webUrl.replace(/\/$/, "")}/fiscal`;
  const linkPortalEncarregado = `${webUrl.replace(/\/$/, "")}/encarregado`;

  function linkDeCampo(token: string): string {
    return `${webUrl.replace(/\/$/, "")}/campo/${token}`;
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
              Link único de entrada do portal do fiscal e do portal do encarregado (cada um entra com seu próprio
              login), e links de campo pendentes de preenchimento
            </p>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <section className="form-section">
          <h2 className="form-section-title">Portal do fiscal</h2>
          <p className="form-section-subtitle">
            Link único, o mesmo para todas as frentes — cada fiscal entra com seu e-mail e senha (cadastre em
            Cadastro) e vê só os RDOs da frente dele.
          </p>
          <div className="panel" style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <code>{linkPortalFiscal}</code>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void copiar("fiscal", linkPortalFiscal)}
            >
              {linkCopiado === "fiscal" ? "Copiado!" : "Copiar link"}
            </button>
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Portal do encarregado</h2>
          <p className="form-section-subtitle">
            Link único, o mesmo para todas as frentes — cada encarregado entra com sua matrícula e senha (cadastre em
            Cadastro), escolhe a equipe e o tipo de RDO, e lança a produção do dia sem precisar que o escritório crie
            o RDO antes.
          </p>
          <div className="panel" style={{ marginTop: 12, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <code>{linkPortalEncarregado}</code>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => void copiar("encarregado", linkPortalEncarregado)}
            >
              {linkCopiado === "encarregado" ? "Copiado!" : "Copiar link"}
            </button>
          </div>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Preenchimento do encarregado</h2>
          <p className="form-section-subtitle">
            RDOs ainda não enviados ou reprovados e reabertos para correção — um link por RDO, válido por 7 dias.
            Alternativa ao login pra mandar direto pra quem vai preencher.
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
