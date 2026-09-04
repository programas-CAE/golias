import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";
import { abrirExterno, getSettings } from "../lib/settingsStore";

interface FotoRelatorio {
  id: string;
  ordem: number;
  legenda: string | null;
  rdoAnexoId: string | null;
}

interface RelatorioFotograficoResponse {
  id: string;
  ordemManutencaoId: string;
  rdoId: string;
  omNumero: string;
  dataConclusao: string | null;
  atividadesExecutadas: boolean;
  comentarios: string | null;
  pdfDisponivel: boolean;
  fotos: FotoRelatorio[];
  statusOm: string | null;
  percentualConcluido: number | null;
  rdo: { data: string; equipe: { nome: string } };
}

const STATUS_OM_LABEL: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

interface ParDeFotos {
  indice: number;
  antes: FotoRelatorio | null;
  depois: FotoRelatorio | null;
}

/**
 * Um par de fotos (Antes/Depois) por item da intervenção — ver
 * montarOrdemPareada() no servidor (routes/relatoriosFotograficos.ts):
 * par N ocupa sempre `ordem` 2N (Antes) e 2N+1 (Depois), mesmo quando um
 * dos lados ainda não tem foto (aí a tela mostra a caixa vazia daquele
 * lado). Fotos sem legenda reconhecida caem sozinhas do lado Antes de um
 * par próprio, no final.
 */
function montarPares(fotos: FotoRelatorio[], paresVaziosLocais: number[]): ParDeFotos[] {
  const mapa = new Map<number, ParDeFotos>();
  for (const foto of fotos) {
    const indice = Math.floor(foto.ordem / 2);
    const atual = mapa.get(indice) ?? { indice, antes: null, depois: null };
    if (foto.ordem % 2 === 0) atual.antes = foto;
    else atual.depois = foto;
    mapa.set(indice, atual);
  }
  for (const indice of paresVaziosLocais) {
    if (!mapa.has(indice)) mapa.set(indice, { indice, antes: null, depois: null });
  }
  return [...mapa.values()].sort((a, b) => a.indice - b.indice);
}

/**
 * "Check List de Conclusão de Manutenção Preventiva/Corretiva -
 * Infraestrutura" (documento oficial da Vale/EFC) de uma OM. Abre já
 * pré-preenchido com as fotos que o encarregado marcou pra essa OM no
 * lançamento de campo — a ideia é só ajustar (completar um par, trocar
 * foto, escrever o comentário) e gerar o PDF, não montar do zero.
 */
export default function RelatorioFotografico(): ReactElement {
  const { id, relatorioId } = useParams<{ id: string; relatorioId: string }>();
  const navigate = useNavigate();
  const [relatorio, setRelatorio] = useState<RelatorioFotograficoResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [apiUrl, setApiUrl] = useState("");

  const [dataConclusao, setDataConclusao] = useState("");
  const [atividadesExecutadas, setAtividadesExecutadas] = useState(true);
  const [comentarios, setComentarios] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [sincronizando, setSincronizando] = useState(false);
  const [enviandoSlot, setEnviandoSlot] = useState<string | null>(null);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  // Pares que o usuário clicou "adicionar" mas ainda não têm nenhuma foto —
  // só existem no navegador até a primeira foto ser enviada nele (a partir
  // daí passam a vir naturalmente do servidor, via montarPares).
  const [paresVaziosLocais, setParesVaziosLocais] = useState<number[]>([]);

  async function carregar(): Promise<void> {
    if (!id || !relatorioId) return;
    try {
      const resposta = await api.get<RelatorioFotograficoResponse>(
        `/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}`,
      );
      setRelatorio(resposta);
      setDataConclusao(resposta.dataConclusao?.slice(0, 10) ?? "");
      setAtividadesExecutadas(resposta.atividadesExecutadas);
      setComentarios(resposta.comentarios ?? "");
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o relatório fotográfico.");
    }
  }

  useEffect(() => {
    void carregar();
    void getSettings().then((settings) => setApiUrl(settings.apiUrl));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, relatorioId]);

  async function salvar(): Promise<void> {
    if (!id || !relatorioId) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.patch(`/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}`, {
        dataConclusao: dataConclusao === "" ? null : dataConclusao,
        atividadesExecutadas,
        comentarios: comentarios === "" ? null : comentarios,
      });
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2000);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function sincronizarFotos(): Promise<void> {
    if (!id || !relatorioId) return;
    setSincronizando(true);
    setErro(null);
    try {
      const resposta = await api.post<RelatorioFotograficoResponse & { fotosAdicionadas: number }>(
        `/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}/sincronizar-fotos`,
        {},
      );
      setRelatorio((atual) => (atual ? { ...atual, fotos: resposta.fotos } : atual));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível sincronizar as fotos.");
    } finally {
      setSincronizando(false);
    }
  }

  /** Manda a foto e já move ela pro slot certo do par (Antes/Depois de um par específico). */
  async function enviarFotoNoSlot(parIndice: number, lado: "antes" | "depois", arquivo: File): Promise<void> {
    if (!id || !relatorioId) return;
    const chaveSlot = `${parIndice}-${lado}`;
    setEnviandoSlot(chaveSlot);
    setErro(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const resposta = await api.postForm<RelatorioFotograficoResponse>(
        `/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}/fotos`,
        form,
      );
      // A foto acabou de ser criada com o maior `ordem` da lista (ver
      // rota) — move ela pro slot certo do par que o usuário clicou.
      const novaFoto = [...resposta.fotos].sort((a, b) => b.ordem - a.ordem)[0];
      if (novaFoto) {
        const ordemAlvo = parIndice * 2 + (lado === "antes" ? 0 : 1);
        await api.patch(`/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}/fotos/${novaFoto.id}`, {
          ordem: ordemAlvo,
          legenda: lado === "antes" ? "Antes" : "Depois",
        });
      }
      setParesVaziosLocais((atual) => atual.filter((indice) => indice !== parIndice));
      await carregar();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviandoSlot(null);
    }
  }

  async function removerFoto(fotoId: string): Promise<void> {
    if (!id || !relatorioId) return;
    try {
      await api.delete(`/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}/fotos/${fotoId}`);
      setRelatorio((atual) => (atual ? { ...atual, fotos: atual.fotos.filter((f) => f.id !== fotoId) } : atual));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível remover a foto.");
    }
  }

  async function removerPar(par: ParDeFotos): Promise<void> {
    const idsParaRemover = [par.antes?.id, par.depois?.id].filter((valor): valor is string => valor != null);
    if (idsParaRemover.length === 0) {
      // Par ainda vazio (só existe no navegador) — não tem nada pra apagar no servidor.
      setParesVaziosLocais((atual) => atual.filter((indice) => indice !== par.indice));
      return;
    }
    await Promise.all(idsParaRemover.map((fotoId) => removerFoto(fotoId)));
  }

  function adicionarParVazio(): void {
    const maiorIndice = pares.length > 0 ? Math.max(...pares.map((par) => par.indice)) : -1;
    setParesVaziosLocais((atual) => [...atual, maiorIndice + 1]);
  }

  async function gerarPdf(): Promise<void> {
    if (!id || !relatorioId) return;
    setGerandoPdf(true);
    setErro(null);
    try {
      await api.post(`/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}/pdf`, {});
      setRelatorio((atual) => (atual ? { ...atual, pdfDisponivel: true } : atual));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  }

  async function baixarPdf(): Promise<void> {
    if (!id || !relatorioId) return;
    const settings = await getSettings();
    await abrirExterno(
      `${settings.apiUrl.replace(/\/$/, "")}/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}/pdf`,
    );
  }

  const pares = useMemo(
    () => montarPares(relatorio?.fotos ?? [], paresVaziosLocais),
    [relatorio, paresVaziosLocais],
  );

  function urlDaFoto(fotoId: string): string {
    return `${apiUrl.replace(/\/$/, "")}/ordens-manutencao/${id}/relatorios-fotograficos/${relatorioId}/fotos/${fotoId}/arquivo`;
  }

  function Slot({ par, lado }: { par: ParDeFotos; lado: "antes" | "depois" }): ReactElement {
    const foto = lado === "antes" ? par.antes : par.depois;
    const chaveSlot = `${par.indice}-${lado}`;
    const enviando = enviandoSlot === chaveSlot;

    if (foto) {
      return (
        <div className="foto-slot-preenchido">
          <img src={urlDaFoto(foto.id)} alt={lado === "antes" ? "Antes" : "Depois"} />
          <button type="button" className="foto-slot-remover" onClick={() => void removerFoto(foto.id)} title="Remover esta foto">
            ✕
          </button>
        </div>
      );
    }

    return (
      <label className="foto-slot-vazio">
        {enviando ? (
          <span>Enviando…</span>
        ) : (
          <>
            <span aria-hidden="true" style={{ fontSize: "1.6rem" }}>
              📷
            </span>
            <span>Clique para inserir imagem</span>
          </>
        )}
        <input
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          disabled={enviando}
          onChange={(event) => {
            const arquivo = event.target.files?.[0];
            event.target.value = "";
            if (arquivo) void enviarFotoNoSlot(par.indice, lado, arquivo);
          }}
        />
      </label>
    );
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Relatório Fotográfico — OM {relatorio?.omNumero ?? "…"}</h1>
            <p className="list-subtitle">
              Check List de Conclusão de Manutenção — Infraestrutura
              {relatorio && (
                <>
                  {" "}
                  · Dia trabalhado: {relatorio.rdo.data.slice(0, 10)} ({relatorio.rdo.equipe.nome})
                </>
              )}
            </p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button
              type="button"
              className="button button--secondary"
              onClick={() => navigate(`/ordens-manutencao/${id}/relatorios-fotograficos`)}
            >
              Voltar
            </button>
            <button type="button" className="button button--secondary" onClick={() => void gerarPdf()} disabled={gerandoPdf}>
              {gerandoPdf ? "Gerando…" : "Gerar PDF"}
            </button>
            <button
              type="button"
              className="button"
              onClick={() => void baixarPdf()}
              disabled={!relatorio?.pdfDisponivel}
              title={relatorio?.pdfDisponivel ? undefined : "Gere o PDF primeiro"}
            >
              Baixar PDF
            </button>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        {!relatorio ? (
          <p className="table-empty">Carregando…</p>
        ) : (
          <>
            <section className="form-section">
              <h2 className="form-section-title">Dados de planejamento</h2>
              {!relatorio.dataConclusao && (relatorio.statusOm || relatorio.percentualConcluido != null) && (
                <p className="form-section-subtitle">
                  OM ainda em andamento — status neste dia:{" "}
                  {relatorio.statusOm ? (STATUS_OM_LABEL[relatorio.statusOm] ?? relatorio.statusOm) : "—"}
                  {relatorio.percentualConcluido != null && <> · {relatorio.percentualConcluido}% concluído neste dia</>}
                </p>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                <div>
                  <label className="field-label" htmlFor="dataConclusao">
                    Data de conclusão
                  </label>
                  <input
                    id="dataConclusao"
                    type="date"
                    className="field-input"
                    value={dataConclusao}
                    onChange={(event) => setDataConclusao(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="atividadesExecutadas">
                    Escopos da manutenção
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input
                      id="atividadesExecutadas"
                      type="checkbox"
                      checked={atividadesExecutadas}
                      onChange={(event) => setAtividadesExecutadas(event.target.checked)}
                    />
                    Todas as atividades listadas na OM foram executadas
                  </label>
                </div>
              </div>
            </section>

            <section className="form-section">
              <h2 className="form-section-title">Comentários</h2>
              <textarea
                className="field-input campo-textarea"
                value={comentarios}
                onChange={(event) => setComentarios(event.target.value)}
                placeholder="Situação de riscos, pendências ou melhorias…"
              />
              <div className="form-actions" style={{ marginTop: 12 }}>
                <button type="button" className="button" onClick={() => void salvar()} disabled={salvando}>
                  {salvando ? "Salvando…" : "Salvar"}
                </button>
                {salvo && <span className="feedback feedback--ok">Salvo!</span>}
              </div>
            </section>

            <section className="form-section">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <h2 className="form-section-title" style={{ marginBottom: 0 }}>
                    Registro fotográfico
                  </h2>
                  <p className="form-section-subtitle" style={{ marginBottom: 0 }}>
                    Um par de fotos (antes/depois) por item da intervenção
                  </p>
                </div>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  onClick={() => void sincronizarFotos()}
                  disabled={sincronizando}
                >
                  {sincronizando ? "Sincronizando…" : "Atualizar com fotos do campo"}
                </button>
              </div>

              <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
                {pares.length === 0 ? (
                  <p className="table-empty">
                    Nenhuma foto ainda — o encarregado ainda não marcou fotos pra essa OM, ou clique em "Adicionar par de
                    fotos".
                  </p>
                ) : (
                  pares.map((par) => (
                    <div key={par.indice} className="repeatable-item">
                      <div className="repeatable-item-header">
                        <span className="repeatable-item-titulo">Par {par.indice + 1}</span>
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => void removerPar(par)}
                          title="Remover este par"
                        >
                          🗑
                        </button>
                      </div>
                      <div className="grid-2">
                        <div>
                          <label className="field-label">Antes</label>
                          <Slot par={par} lado="antes" />
                        </div>
                        <div>
                          <label className="field-label">Depois</label>
                          <Slot par={par} lado="depois" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                type="button"
                className="button button--secondary button--small"
                style={{ marginTop: 12 }}
                onClick={adicionarParVazio}
              >
                + Adicionar par de fotos
              </button>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
