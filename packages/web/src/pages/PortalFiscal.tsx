import { useEffect, useRef, useState, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import { API_URL, ApiError, api } from "../lib/apiClient";
import AssinaturaCanvas, { type AssinaturaCanvasHandle } from "../components/AssinaturaCanvas";

interface RdoResumo {
  id: string;
  data: string;
  status: string;
  enviadoParaFiscalEm: string | null;
  equipe: { id: string; nome: string };
}

interface ListaResponse {
  frente: { id: string; nome: string; codigo: string };
  pendentes: RdoResumo[];
  historico: RdoResumo[];
}

interface AtividadeDetalhe {
  id: string;
  atividadeCatalogo: { codigo: string; descricao: string; unidade: string };
  totalCalculado: string;
  unidade: string;
  kmInicial: string | null;
  kmFinal: string | null;
}

interface LocalDetalhe {
  id: string;
  descricao: string;
  lado: string | null;
  atividades: AtividadeDetalhe[];
}

interface MaoDeObraDetalhe {
  id: string;
  funcao: { nome: string };
  colaborador: { nome: string } | null;
  quantidade: number;
}

interface RdoDetalhe {
  id: string;
  data: string;
  status: string;
  observacoesContratada: string | null;
  observacoesCliente: string | null;
  equipe: { nome: string };
  locais: LocalDetalhe[];
  maoDeObra: MaoDeObraDetalhe[];
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export default function PortalFiscal(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const [lista, setLista] = useState<ListaResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [rdoAberto, setRdoAberto] = useState<RdoDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [acao, setAcao] = useState<"assinar" | "reprovar" | null>(null);
  const [fiscalNome, setFiscalNome] = useState("");
  const [fiscalEmail, setFiscalEmail] = useState("");
  const [comentario, setComentario] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const assinaturaRef = useRef<AssinaturaCanvasHandle>(null);

  async function carregarLista(): Promise<void> {
    if (!token) return;
    try {
      const resposta = await api.get<ListaResponse>(`/portal-fiscal/${token}`);
      setLista(resposta);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o portal.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarLista();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function abrirRdo(rdoId: string): Promise<void> {
    if (!token) return;
    setCarregandoDetalhe(true);
    setErroAcao(null);
    setAcao(null);
    try {
      const detalhe = await api.get<RdoDetalhe>(`/portal-fiscal/${token}/rdos/${rdoId}`);
      setRdoAberto(detalhe);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o RDO.");
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function handleAssinar(): Promise<void> {
    if (!token || !rdoAberto) return;
    setErroAcao(null);
    const blob = await assinaturaRef.current?.exportarPng();
    if (!blob) {
      setErroAcao("Desenhe a assinatura antes de confirmar.");
      return;
    }
    if (!fiscalNome.trim() || !fiscalEmail.trim()) {
      setErroAcao("Informe seu nome e e-mail.");
      return;
    }

    setEnviando(true);
    try {
      const form = new FormData();
      form.append("fiscalNome", fiscalNome.trim());
      form.append("fiscalEmail", fiscalEmail.trim());
      if (observacao.trim()) form.append("observacao", observacao.trim());
      form.append("assinatura", blob, "assinatura.png");
      await api.postForm(`/portal-fiscal/${token}/rdos/${rdoAberto.id}/assinar`, form);
      setRdoAberto(null);
      setAcao(null);
      setObservacao("");
      await carregarLista();
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : "Não foi possível assinar o RDO.");
    } finally {
      setEnviando(false);
    }
  }

  async function handleReprovar(): Promise<void> {
    if (!token || !rdoAberto) return;
    setErroAcao(null);
    if (!fiscalNome.trim() || !fiscalEmail.trim() || !comentario.trim()) {
      setErroAcao("Informe seu nome, e-mail e o motivo da reprovação.");
      return;
    }

    setEnviando(true);
    try {
      await api.post(`/portal-fiscal/${token}/rdos/${rdoAberto.id}/reprovar`, {
        fiscalNome: fiscalNome.trim(),
        fiscalEmail: fiscalEmail.trim(),
        comentario: comentario.trim(),
      });
      setRdoAberto(null);
      setAcao(null);
      setComentario("");
      await carregarLista();
    } catch (error) {
      setErroAcao(error instanceof ApiError ? error.message : "Não foi possível reprovar o RDO.");
    } finally {
      setEnviando(false);
    }
  }

  if (carregando) {
    return (
      <div className="placeholder-page">
        <p className="loading-text">Carregando…</p>
      </div>
    );
  }

  if (erro || !lista) {
    return (
      <div className="placeholder-page">
        <div className="placeholder-card">
          <h1>GOLIAS</h1>
          <p className="description">{erro ?? "Link inválido."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="campo-page">
      <div className="campo-brand">
        <p className="campo-brand-title">GOLIAS</p>
        <p className="campo-brand-subtitle">Gestão de contratos</p>
      </div>
      <div className="campo-card" style={{ maxWidth: 720 }}>
        <h1>Portal do fiscal</h1>
        <p className="subtitle">{lista.frente.nome}</p>

        <section className="campo-secao">
          <h2>Aguardando aprovação ({lista.pendentes.length})</h2>
          {lista.pendentes.length === 0 ? (
            <p className="list-subtitle">Nenhum RDO pendente no momento.</p>
          ) : (
            <ul className="causa-lista">
              {lista.pendentes.map((rdo) => (
                <li key={rdo.id}>
                  <button
                    type="button"
                    className="button button--secondary"
                    style={{ width: "100%", justifyContent: "space-between", display: "flex" }}
                    onClick={() => void abrirRdo(rdo.id)}
                  >
                    <span>
                      {rdo.data.slice(0, 10)} — {rdo.equipe.nome}
                    </span>
                    <span>{STATUS_LABEL[rdo.status] ?? rdo.status}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        {lista.historico.length > 0 && (
          <section className="campo-secao">
            <h2>Histórico recente</h2>
            <ul className="causa-lista">
              {lista.historico.map((rdo) => (
                <li key={rdo.id}>
                  {rdo.data.slice(0, 10)} — {rdo.equipe.nome} — {STATUS_LABEL[rdo.status] ?? rdo.status}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      {carregandoDetalhe && (
        <div className="campo-card" style={{ maxWidth: 720, marginTop: 16 }}>
          <p className="loading-text">Carregando RDO…</p>
        </div>
      )}

      {rdoAberto && (
        <div className="campo-card" style={{ maxWidth: 720, marginTop: 16 }}>
          <h2>
            RDO {rdoAberto.data.slice(0, 10)} — {rdoAberto.equipe.nome}
          </h2>

          <a
            className="button button--secondary"
            style={{ display: "inline-flex", marginBottom: 12 }}
            href={`${API_URL}/rdos/${rdoAberto.id}/pdf`}
            target="_blank"
            rel="noreferrer"
          >
            Ver PDF completo
          </a>

          {rdoAberto.locais.map((local) => (
            <div key={local.id} style={{ marginBottom: 12 }}>
              <p className="list-subtitle">{local.descricao}</p>
              <ul className="causa-lista">
                {local.atividades.map((atividade) => (
                  <li key={atividade.id}>
                    {atividade.atividadeCatalogo.codigo} — {atividade.atividadeCatalogo.descricao}:{" "}
                    {Number(atividade.totalCalculado).toLocaleString("pt-BR")} {atividade.unidade}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <p className="list-subtitle">
            <strong>Mão de obra:</strong>{" "}
            {rdoAberto.maoDeObra.map((item) => `${item.funcao.nome} (${item.quantidade})`).join(", ") || "—"}
          </p>
          {rdoAberto.observacoesContratada && (
            <p className="list-subtitle">
              <strong>Observações Engecom:</strong> {rdoAberto.observacoesContratada}
            </p>
          )}

          {acao === null && (
            <div className="campo-acoes" style={{ marginTop: 16 }}>
              <button type="button" className="button" onClick={() => setAcao("assinar")}>
                Assinar / Aprovar
              </button>
              <button type="button" className="button button--secondary" onClick={() => setAcao("reprovar")}>
                Reprovar
              </button>
              <button type="button" className="button button--secondary" onClick={() => setRdoAberto(null)}>
                Fechar
              </button>
            </div>
          )}

          {acao === "assinar" && (
            <div style={{ marginTop: 16 }}>
              <label className="field-label">Seu nome</label>
              <input className="field-input" value={fiscalNome} onChange={(event) => setFiscalNome(event.target.value)} />
              <label className="field-label" style={{ marginTop: 8 }}>
                Seu e-mail
              </label>
              <input
                className="field-input"
                type="email"
                value={fiscalEmail}
                onChange={(event) => setFiscalEmail(event.target.value)}
              />
              <label className="field-label" style={{ marginTop: 8 }}>
                Observações (opcional)
              </label>
              <textarea
                className="field-input campo-textarea"
                value={observacao}
                onChange={(event) => setObservacao(event.target.value)}
                placeholder="Alguma ressalva ou orientação para o próximo RDO?"
              />
              <label className="field-label" style={{ marginTop: 8 }}>
                Assinatura
              </label>
              <AssinaturaCanvas ref={assinaturaRef} />
              {erroAcao && <p className="feedback feedback--erro">{erroAcao}</p>}
              <div className="campo-acoes" style={{ marginTop: 12 }}>
                <button type="button" className="button" disabled={enviando} onClick={() => void handleAssinar()}>
                  {enviando ? "Enviando…" : "Confirmar aprovação"}
                </button>
                <button type="button" className="button button--secondary" onClick={() => setAcao(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {acao === "reprovar" && (
            <div style={{ marginTop: 16 }}>
              <label className="field-label">Seu nome</label>
              <input className="field-input" value={fiscalNome} onChange={(event) => setFiscalNome(event.target.value)} />
              <label className="field-label" style={{ marginTop: 8 }}>
                Seu e-mail
              </label>
              <input
                className="field-input"
                type="email"
                value={fiscalEmail}
                onChange={(event) => setFiscalEmail(event.target.value)}
              />
              <label className="field-label" style={{ marginTop: 8 }}>
                Motivo da reprovação
              </label>
              <textarea
                className="field-input campo-textarea"
                value={comentario}
                onChange={(event) => setComentario(event.target.value)}
              />
              {erroAcao && <p className="feedback feedback--erro">{erroAcao}</p>}
              <div className="campo-acoes" style={{ marginTop: 12 }}>
                <button type="button" className="button" disabled={enviando} onClick={() => void handleReprovar()}>
                  {enviando ? "Enviando…" : "Confirmar reprovação"}
                </button>
                <button type="button" className="button button--secondary" onClick={() => setAcao(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
