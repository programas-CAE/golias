import { useEffect, useState, type ReactElement } from "react";
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
  omNumero: string;
  dataConclusao: string | null;
  atividadesExecutadas: boolean;
  comentarios: string | null;
  pdfDisponivel: boolean;
  fotos: FotoRelatorio[];
}

/**
 * "Check List de Conclusão de Manutenção Preventiva/Corretiva -
 * Infraestrutura" (documento oficial da Vale/EFC) de uma OM. Abre já
 * pré-preenchido com as fotos que o encarregado marcou pra essa OM no
 * lançamento de campo — a ideia é só ajustar (trocar/legendar/reordenar
 * foto, escrever o comentário) e gerar o PDF, não montar do zero.
 */
export default function RelatorioFotografico(): ReactElement {
  const { id } = useParams<{ id: string }>();
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
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);

  async function carregar(): Promise<void> {
    if (!id) return;
    try {
      const resposta = await api.get<RelatorioFotograficoResponse>(`/ordens-manutencao/${id}/relatorio-fotografico`);
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
  }, [id]);

  async function salvar(): Promise<void> {
    if (!id) return;
    setSalvando(true);
    setErro(null);
    try {
      await api.patch(`/ordens-manutencao/${id}/relatorio-fotografico`, {
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
    if (!id) return;
    setSincronizando(true);
    setErro(null);
    try {
      const resposta = await api.post<RelatorioFotograficoResponse & { fotosAdicionadas: number }>(
        `/ordens-manutencao/${id}/relatorio-fotografico/sincronizar-fotos`,
        {},
      );
      setRelatorio((atual) => (atual ? { ...atual, fotos: resposta.fotos } : atual));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível sincronizar as fotos.");
    } finally {
      setSincronizando(false);
    }
  }

  async function enviarFotoExtra(arquivo: File): Promise<void> {
    if (!id) return;
    setEnviandoFoto(true);
    setErro(null);
    try {
      const form = new FormData();
      form.append("arquivo", arquivo);
      const resposta = await api.postForm<RelatorioFotograficoResponse>(
        `/ordens-manutencao/${id}/relatorio-fotografico/fotos`,
        form,
      );
      setRelatorio(resposta);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function salvarLegenda(fotoId: string, legenda: string): Promise<void> {
    if (!id) return;
    setRelatorio((atual) =>
      atual ? { ...atual, fotos: atual.fotos.map((f) => (f.id === fotoId ? { ...f, legenda } : f)) } : atual,
    );
    try {
      await api.patch(`/ordens-manutencao/${id}/relatorio-fotografico/fotos/${fotoId}`, { legenda: legenda || null });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar a legenda.");
    }
  }

  async function moverFoto(indice: number, direcao: -1 | 1): Promise<void> {
    if (!id || !relatorio) return;
    const fotos = [...relatorio.fotos].sort((a, b) => a.ordem - b.ordem);
    const alvo = indice + direcao;
    if (alvo < 0 || alvo >= fotos.length) return;
    const a = fotos[indice]!;
    const b = fotos[alvo]!;
    try {
      await Promise.all([
        api.patch(`/ordens-manutencao/${id}/relatorio-fotografico/fotos/${a.id}`, { ordem: b.ordem }),
        api.patch(`/ordens-manutencao/${id}/relatorio-fotografico/fotos/${b.id}`, { ordem: a.ordem }),
      ]);
      await carregar();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível reordenar as fotos.");
    }
  }

  async function removerFoto(fotoId: string): Promise<void> {
    if (!id) return;
    try {
      await api.delete(`/ordens-manutencao/${id}/relatorio-fotografico/fotos/${fotoId}`);
      setRelatorio((atual) => (atual ? { ...atual, fotos: atual.fotos.filter((f) => f.id !== fotoId) } : atual));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível remover a foto.");
    }
  }

  async function gerarPdf(): Promise<void> {
    if (!id) return;
    setGerandoPdf(true);
    setErro(null);
    try {
      await api.post(`/ordens-manutencao/${id}/relatorio-fotografico/pdf`, {});
      setRelatorio((atual) => (atual ? { ...atual, pdfDisponivel: true } : atual));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setGerandoPdf(false);
    }
  }

  async function baixarPdf(): Promise<void> {
    if (!id) return;
    const settings = await getSettings();
    await abrirExterno(`${settings.apiUrl.replace(/\/$/, "")}/ordens-manutencao/${id}/relatorio-fotografico/pdf`);
  }

  const fotosOrdenadas = relatorio ? [...relatorio.fotos].sort((a, b) => a.ordem - b.ordem) : [];

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Relatório Fotográfico — OM {relatorio?.omNumero ?? "…"}</h1>
            <p className="list-subtitle">Check List de Conclusão de Manutenção — Infraestrutura</p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" className="button button--secondary" onClick={() => navigate("/ordens-manutencao")}>
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
                <h2 className="form-section-title">Registro fotográfico</h2>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    className="button button--secondary button--small"
                    onClick={() => void sincronizarFotos()}
                    disabled={sincronizando}
                  >
                    {sincronizando ? "Sincronizando…" : "Atualizar com fotos do campo"}
                  </button>
                  <label className="button button--secondary button--small" style={{ cursor: "pointer" }}>
                    {enviandoFoto ? "Enviando…" : "+ Adicionar foto"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={enviandoFoto}
                      onChange={(event) => {
                        const arquivo = event.target.files?.[0];
                        event.target.value = "";
                        if (arquivo) void enviarFotoExtra(arquivo);
                      }}
                    />
                  </label>
                </div>
              </div>

              {fotosOrdenadas.length === 0 ? (
                <p className="table-empty">
                  Nenhuma foto ainda — o encarregado ainda não marcou fotos pra essa OM, ou clique em "Adicionar foto".
                </p>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 }}>
                  {fotosOrdenadas.map((foto, indice) => (
                    <div key={foto.id} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <img
                        src={`${apiUrl.replace(/\/$/, "")}/ordens-manutencao/${id}/relatorio-fotografico/fotos/${foto.id}/arquivo`}
                        alt={foto.legenda ?? ""}
                        style={{ width: "100%", aspectRatio: "1 / 1", objectFit: "cover", borderRadius: 8, border: "1px solid #d8e4de" }}
                      />
                      <select
                        className="field-input"
                        style={{ fontSize: "0.8rem" }}
                        value={foto.legenda ?? ""}
                        onChange={(event) => void salvarLegenda(foto.id, event.target.value)}
                      >
                        <option value="">Sem legenda</option>
                        <option value="Antes">Antes</option>
                        <option value="Depois">Depois</option>
                      </select>
                      <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() => void moverFoto(indice, -1)}
                            disabled={indice === 0}
                          >
                            ▲
                          </button>
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() => void moverFoto(indice, 1)}
                            disabled={indice === fotosOrdenadas.length - 1}
                          >
                            ▼
                          </button>
                        </div>
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => void removerFoto(foto.id)}
                        >
                          Remover
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
