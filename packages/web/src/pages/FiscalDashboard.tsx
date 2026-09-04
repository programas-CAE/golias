import { useEffect, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, ApiError, api } from "../lib/apiClient";
import { lerSessao, limparSessao } from "../lib/session";
import AssinaturaCanvas, { type AssinaturaCanvasHandle } from "../components/AssinaturaCanvas";
import PerfilUsuario from "../components/PerfilUsuario";

/**
 * Tela do fiscal logado — mesma função do antigo /portal-fiscal/:token
 * (link fixo por frente), só que a frente vem da sessão (não do link) e
 * nome/e-mail não precisam mais ser digitados a cada aprovação/reprovação
 * (vêm do cadastro do usuário).
 */
interface RdoResumo {
  id: string;
  data: string;
  status: string;
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
}

interface LocalDetalhe {
  id: string;
  descricao: string;
  atividades: AtividadeDetalhe[];
}

interface MaoDeObraDetalhe {
  id: string;
  funcao: { nome: string };
  quantidade: number;
}

interface RdoDetalhe {
  id: string;
  data: string;
  equipe: { nome: string };
  locais: LocalDetalhe[];
  maoDeObra: MaoDeObraDetalhe[];
  observacoesContratada: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export default function FiscalDashboard(): ReactElement {
  const navigate = useNavigate();
  const sessao = lerSessao();
  const [lista, setLista] = useState<ListaResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [rdoAberto, setRdoAberto] = useState<RdoDetalhe | null>(null);
  const [carregandoDetalhe, setCarregandoDetalhe] = useState(false);
  const [acao, setAcao] = useState<"assinar" | "reprovar" | null>(null);
  const [comentario, setComentario] = useState("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [rdoAssinadoId, setRdoAssinadoId] = useState<string | null>(null);
  const assinaturaRef = useRef<AssinaturaCanvasHandle>(null);

  async function carregarLista(): Promise<void> {
    try {
      const resposta = await api.get<ListaResponse>("/fiscal/rdos");
      setLista(resposta);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar seus RDOs.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregarLista();
  }, []);

  function sair(): void {
    limparSessao();
    navigate("/login");
  }

  async function abrirRdo(rdoId: string): Promise<void> {
    setCarregandoDetalhe(true);
    setErroAcao(null);
    setAcao(null);
    setRdoAssinadoId(null);
    try {
      const detalhe = await api.get<RdoDetalhe>(`/fiscal/rdos/${rdoId}`);
      setRdoAberto(detalhe);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o RDO.");
    } finally {
      setCarregandoDetalhe(false);
    }
  }

  async function handleAssinar(): Promise<void> {
    if (!rdoAberto) return;
    setErroAcao(null);
    const blob = await assinaturaRef.current?.exportarPng();
    if (!blob) {
      setErroAcao("Desenhe a assinatura antes de confirmar.");
      return;
    }

    setEnviando(true);
    try {
      const form = new FormData();
      if (observacao.trim()) form.append("observacao", observacao.trim());
      form.append("assinatura", blob, "assinatura.png");
      await api.postForm(`/fiscal/rdos/${rdoAberto.id}/assinar`, form);
      setRdoAssinadoId(rdoAberto.id);
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
    if (!rdoAberto) return;
    setErroAcao(null);
    if (!comentario.trim()) {
      setErroAcao("Descreva o motivo da reprovação.");
      return;
    }

    setEnviando(true);
    try {
      await api.post(`/fiscal/rdos/${rdoAberto.id}/reprovar`, { comentario: comentario.trim() });
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
          <p className="description">{erro ?? "Não foi possível carregar."}</p>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h1>Portal do fiscal</h1>
            <p className="subtitle">
              {lista.frente.nome} — {sessao?.usuario.nome}
            </p>
          </div>
          <span style={{ display: "flex", gap: 8 }}>
            <PerfilUsuario />
            <button type="button" className="button button--ghost button--small" onClick={sair}>
              Sair
            </button>
          </span>
        </div>

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

        {rdoAssinadoId && (
          <section className="campo-secao">
            <p className="feedback feedback--ok">RDO aprovado e assinado com sucesso.</p>
            <a
              className="button"
              style={{ display: "inline-flex", marginTop: 8 }}
              href={`${API_URL}/rdos/${rdoAssinadoId}/pdf`}
              target="_blank"
              rel="noreferrer"
            >
              Baixar PDF assinado
            </a>
          </section>
        )}

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
              <label className="field-label">Observações (opcional)</label>
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
              <label className="field-label">Motivo da reprovação</label>
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
