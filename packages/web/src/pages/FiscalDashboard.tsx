import { useEffect, useRef, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { API_URL, ApiError, api } from "../lib/apiClient";
import { lerSessao, limparSessao } from "../lib/session";
import AssinaturaCanvas, { type AssinaturaCanvasHandle } from "../components/AssinaturaCanvas";
import PerfilUsuario from "../components/PerfilUsuario";
import {
  IconCalendario,
  IconCamera,
  IconDocumento,
  IconEquipamento,
  IconLocal,
  IconMaterial,
  IconNota,
  IconPessoas,
  IconRelogio,
} from "../components/Icons";

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

interface EquipamentoDetalhe {
  id: string;
  equipamentoCatalogo: { nome: string };
  quantidade: number;
  producaoDescricao: string | null;
  producaoValor: string | null;
  producaoUnidade: string | null;
  horimetroInicial: string | null;
  horimetroFinal: string | null;
  kmInicial: string | null;
  kmFinal: string | null;
  rota: string | null;
}

interface MaterialDetalhe {
  id: string;
  materialCatalogo: { descricao: string; unidade: string };
  quantidade: string;
}

interface AnexoDetalhe {
  id: string;
  tipo: string;
  nomeOriginal: string;
  descricao: string | null;
  ordemManutencao: { numero: string } | null;
}

interface RdoDetalhe {
  id: string;
  data: string;
  tipo: string;
  equipe: { nome: string };
  locais: LocalDetalhe[];
  maoDeObra: MaoDeObraDetalhe[];
  equipamentos: EquipamentoDetalhe[];
  materiais: MaterialDetalhe[];
  anexos: AnexoDetalhe[];
  observacoesContratada: string | null;
}

const TIPO_LABEL: Record<string, string> = {
  PREVENTIVA_CORRETIVA: "Preventiva / Corretiva",
  TERRAPLENAGEM: "Terraplenagem",
  SUPERESTRUTURA: "Superestrutura",
  MOTORISTA_OPERADOR: "Motorista / Operador",
};

function formatarData(data: string): string {
  return new Date(`${data.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Dias desde que o RDO entrou em "Aguardando aprovação" — null quando ainda não foi enviado ao fiscal. */
function diasPendente(enviadoParaFiscalEm: string | null): number | null {
  if (!enviadoParaFiscalEm) return null;
  const diffMs = Date.now() - new Date(enviadoParaFiscalEm).getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

const MOTIVOS_REPROVACAO_RAPIDOS = [
  "Falta foto do serviço",
  "Medida/quantidade divergente",
  "Falta assinatura do encarregado",
  "Descrição incompleta",
];

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

const STATUS_BADGE_CLASSE: Record<string, string> = {
  APROVADO: "badge--aprovado",
  REPROVADO: "badge--reprovado",
};

function StatusBadge({ status }: { status: string }): ReactElement {
  return <span className={`badge ${STATUS_BADGE_CLASSE[status] ?? "badge--pendente"}`}>{STATUS_LABEL[status] ?? status}</span>;
}

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
  const [perfilAberto, setPerfilAberto] = useState(false);

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
            {!perfilAberto && <PerfilUsuario aberto={false} onAbrir={() => setPerfilAberto(true)} onFechar={() => setPerfilAberto(false)} />}
            <button type="button" className="button button--ghost button--small" onClick={sair}>
              Sair
            </button>
          </span>
        </div>
      </div>

      {perfilAberto && (
        <div className="campo-card" style={{ maxWidth: 720, marginTop: 16 }}>
          <PerfilUsuario aberto onAbrir={() => setPerfilAberto(true)} onFechar={() => setPerfilAberto(false)} />
        </div>
      )}

      <div className="campo-card" style={{ maxWidth: 720, marginTop: 16 }}>
        <section className="campo-secao">
          <h2 className="secao-titulo-com-icone">
            <IconRelogio /> Aguardando aprovação ({lista.pendentes.length})
          </h2>
          {lista.pendentes.length === 0 ? (
            <p className="list-subtitle">Nenhum RDO pendente no momento.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {lista.pendentes.map((rdo) => {
                const dias = diasPendente(rdo.enviadoParaFiscalEm);
                return (
                  <button key={rdo.id} type="button" className="pendente-card" onClick={() => void abrirRdo(rdo.id)}>
                    <span>
                      <span className="pendente-card-equipe">{rdo.equipe.nome}</span>
                      <span className="pendente-card-data">
                        <IconCalendario size={12} /> {formatarData(rdo.data)}
                        {dias != null && (
                          <span className={`dias-badge${dias >= 3 ? " dias-badge--atrasado" : ""}`}>
                            {dias === 0 ? "hoje" : dias === 1 ? "há 1 dia" : `há ${dias} dias`}
                          </span>
                        )}
                      </span>
                    </span>
                    <StatusBadge status={rdo.status} />
                  </button>
                );
              })}
            </div>
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
            <h2 className="secao-titulo-com-icone">
              <IconCalendario /> Histórico recente
            </h2>
            <ul className="causa-lista">
              {lista.historico.map((rdo) => (
                <li key={rdo.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span>
                    {formatarData(rdo.data)} — {rdo.equipe.nome}
                  </span>
                  <StatusBadge status={rdo.status} />
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
          <div className="rdo-hero">
            <p className="rdo-hero-titulo">{formatarData(rdoAberto.data)}</p>
            <p style={{ margin: "2px 0 0", fontSize: "0.85rem", color: "#3f5a4a" }}>
              {rdoAberto.equipe.nome} · {TIPO_LABEL[rdoAberto.tipo] ?? rdoAberto.tipo}
            </p>
            <div className="rdo-hero-meta">
              <a
                className="button button--secondary button--small"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                href={`${API_URL}/rdos/${rdoAberto.id}/pdf`}
                target="_blank"
                rel="noreferrer"
              >
                <IconDocumento size={13} /> Ver PDF completo
              </a>
            </div>
          </div>

          {rdoAberto.locais.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <h3 className="secao-titulo-com-icone campo-subtitulo" style={{ margin: "0 0 8px", fontWeight: 700, color: "#15803d" }}>
                <IconLocal /> Locais e atividades
              </h3>
              {rdoAberto.locais.map((local) => (
                <div key={local.id} style={{ marginBottom: 10 }}>
                  <p style={{ margin: "0 0 4px", fontWeight: 700, fontSize: "0.85rem", color: "#16281c" }}>{local.descricao}</p>
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
            </div>
          )}

          <div className="info-linha">
            <IconPessoas />
            <span>
              <strong>Mão de obra:</strong>{" "}
              {rdoAberto.maoDeObra.map((item) => `${item.funcao.nome} (${item.quantidade})`).join(", ") || "—"}
            </span>
          </div>

          {rdoAberto.equipamentos.length > 0 && (
            <div className="info-linha">
              <IconEquipamento />
              <span>
                <strong>Equipamentos:</strong>{" "}
                {rdoAberto.equipamentos
                  .map((item) => {
                    const detalhes = [
                      item.producaoValor != null &&
                        `produção ${item.producaoValor}${item.producaoUnidade ? ` ${item.producaoUnidade}` : ""}`,
                      item.horimetroInicial != null &&
                        item.horimetroFinal != null &&
                        `horímetro ${item.horimetroInicial}→${item.horimetroFinal}`,
                      item.kmInicial != null && item.kmFinal != null && `km ${item.kmInicial}→${item.kmFinal}`,
                      item.rota && `rota ${item.rota}`,
                    ].filter(Boolean);
                    return `${item.equipamentoCatalogo.nome} (${item.quantidade})${detalhes.length > 0 ? ` — ${detalhes.join(", ")}` : ""}`;
                  })
                  .join("; ")}
              </span>
            </div>
          )}

          {rdoAberto.materiais.length > 0 && (
            <div className="info-linha">
              <IconMaterial />
              <span>
                <strong>Materiais:</strong>{" "}
                {rdoAberto.materiais
                  .map((item) => `${item.materialCatalogo.descricao} — ${item.quantidade} ${item.materialCatalogo.unidade}`)
                  .join(", ")}
              </span>
            </div>
          )}

          {rdoAberto.observacoesContratada && (
            <div className="info-linha">
              <IconNota />
              <span>
                <strong>Observações Engecom:</strong> {rdoAberto.observacoesContratada}
              </span>
            </div>
          )}

          {rdoAberto.anexos.filter((anexo) => anexo.tipo === "FOTO").length > 0 && (
            <div style={{ marginTop: 16 }}>
              <h3 className="secao-titulo-com-icone campo-subtitulo" style={{ margin: "0 0 8px", fontWeight: 700, color: "#15803d" }}>
                <IconCamera /> Fotos ({rdoAberto.anexos.filter((anexo) => anexo.tipo === "FOTO").length})
              </h3>
              <ul className="campo-foto-grade">
                {rdoAberto.anexos
                  .filter((anexo) => anexo.tipo === "FOTO")
                  .map((anexo) => (
                    <li key={anexo.id} className="campo-foto-item">
                      <a href={`${API_URL}/rdos/${rdoAberto.id}/anexos/${anexo.id}`} target="_blank" rel="noreferrer">
                        <img src={`${API_URL}/rdos/${rdoAberto.id}/anexos/${anexo.id}`} alt={anexo.nomeOriginal} />
                      </a>
                      {(anexo.ordemManutencao || anexo.descricao) && (
                        <span className="campo-foto-legenda">
                          {anexo.ordemManutencao ? `OM ${anexo.ordemManutencao.numero}` : ""}
                          {anexo.ordemManutencao && anexo.descricao ? " — " : ""}
                          {anexo.descricao ?? ""}
                        </span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {acao === null && (
            <div className="campo-acoes" style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <button type="button" className="button" onClick={() => setAcao("assinar")}>
                Assinar / Aprovar
              </button>
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="button button--secondary" style={{ flex: 1 }} onClick={() => setAcao("reprovar")}>
                  Reprovar
                </button>
                <button type="button" className="button button--secondary" style={{ flex: 1 }} onClick={() => setRdoAberto(null)}>
                  Fechar
                </button>
              </div>
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
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {MOTIVOS_REPROVACAO_RAPIDOS.map((motivo) => (
                  <button
                    key={motivo}
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() =>
                      setComentario((atual) => (atual.trim() === "" ? motivo : `${atual.trim()}; ${motivo}`))
                    }
                  >
                    + {motivo}
                  </button>
                ))}
              </div>
              <textarea
                className="field-input campo-textarea"
                value={comentario}
                onChange={(event) => setComentario(event.target.value)}
                placeholder="Escreva o motivo ou use os atalhos acima…"
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
