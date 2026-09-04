import { useEffect, useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";
import { abrirExterno, getSettings } from "../lib/settingsStore";

interface AtividadeMaoDeObraDetalhe {
  id: string;
  funcao: { nome: string };
  quantidade: number;
}

interface AtividadeDetalhe {
  id: string;
  atividadeCatalogo: { codigo: string; descricao: string; unidade: string };
  totalCalculado: string;
  unidade: string;
  ordemManutencaoId: string | null;
  statusOm: string | null;
  percentualConcluido: number | null;
  kmInicial: string | null;
  kmFinal: string | null;
  horarioInicial: string | null;
  horarioFinal: string | null;
  maoDeObra: AtividadeMaoDeObraDetalhe[];
}

interface LocalDetalhe {
  id: string;
  descricao: string;
  lado: string | null;
  atividades: AtividadeDetalhe[];
}

interface BlocoDetalhe {
  id: string;
  horarioInicial: string;
  horarioFinal: string;
  descricao: string;
}

interface MaoDeObraDetalhe {
  id: string;
  funcao: { nome: string };
  colaborador: { nome: string } | null;
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
  combustivelLitros: string | null;
  combustivelPosto: string | null;
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
  tamanhoBytes: number;
  descricao: string | null;
  ordemManutencaoId: string | null;
  ordemManutencao: { id: string; numero: string } | null;
}

interface UltimaDecisaoFiscal {
  status: "APROVADO" | "REPROVADO";
  comentario: string | null;
  assinanteNome: string | null;
  assinadoEm: string | null;
}

interface RdoSuperestruturaDetalhe {
  intervaloProgramadoInicio: string | null;
  intervaloProgramadoFim: string | null;
  intervaloRealizadoInicio: string | null;
  intervaloRealizadoFim: string | null;
  tempoTotalPerdas: string | null;
  leiturasTemperatura: { hora: string; temperaturaC: string | null }[];
  servicos: {
    id: string;
    codigo: string | null;
    descricao: string;
    unidade: string | null;
    quantidade: string | null;
    linha: string | null;
    kmInicial: string | null;
    kmFinal: string | null;
  }[];
}

interface RdoDetalheResponse {
  id: string;
  codigoRastreio: string;
  data: string;
  tipo: string;
  status: string;
  clima: string | null;
  horaExtraInicio: string | null;
  horaExtraFim: string | null;
  totalDesvios: number | null;
  observacoesContratada: string | null;
  observacoesCliente: string | null;
  frente: { nome: string };
  obra: { id: string; nome: string } | null;
  equipe: { nome: string };
  linkCampoToken: string | null;
  blocosHorario: BlocoDetalhe[];
  locais: LocalDetalhe[];
  maoDeObra: MaoDeObraDetalhe[];
  equipamentos: EquipamentoDetalhe[];
  materiais: MaterialDetalhe[];
  anexos: AnexoDetalhe[];
  superestrutura: RdoSuperestruturaDetalhe | null;
  ultimaDecisaoFiscal: UltimaDecisaoFiscal | null;
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "Aguardando validação do escritório",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

const STATUS_OM_LABEL: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

const TIPO_LABEL: Record<string, string> = {
  PREVENTIVA_CORRETIVA: "Preventiva/Corretiva",
  TERRAPLENAGEM: "Terraplenagem",
  SUPERESTRUTURA: "Superestrutura",
  MOTORISTA_OPERADOR: "Motorista/Operador",
};

function formatarDetalheEquipamento(item: EquipamentoDetalhe): string {
  const partes: string[] = [];
  if (item.producaoValor != null) {
    partes.push(
      `${item.producaoDescricao ? `${item.producaoDescricao}: ` : ""}${Number(item.producaoValor).toLocaleString("pt-BR")}${item.producaoUnidade ? ` ${item.producaoUnidade}` : ""}`,
    );
  } else if (item.horimetroFinal != null) {
    partes.push(
      `Horímetro: ${item.horimetroInicial != null ? `${Number(item.horimetroInicial).toLocaleString("pt-BR")} a ` : ""}${Number(item.horimetroFinal).toLocaleString("pt-BR")} h`,
    );
  }
  if (item.kmFinal != null) {
    partes.push(
      `Km: ${item.kmInicial != null ? `${Number(item.kmInicial).toLocaleString("pt-BR")} a ` : ""}${Number(item.kmFinal).toLocaleString("pt-BR")}`,
    );
  }
  if (item.rota) partes.push(`Rota: ${item.rota}`);
  if (item.combustivelLitros != null) {
    partes.push(`Combustível: ${Number(item.combustivelLitros).toLocaleString("pt-BR")} L${item.combustivelPosto ? ` (${item.combustivelPosto})` : ""}`);
  }
  return partes.length > 0 ? partes.join(" — ") : "—";
}

/** Agrupa as fotos do RDO pela OM que o encarregado marcou ao enviar cada uma — mesma lógica do PDF e do Campo.tsx. */
function agruparFotosPorOm(anexos: AnexoDetalhe[]): { omNumero: string | null; fotos: AnexoDetalhe[] }[] {
  const grupos = new Map<string, { omNumero: string | null; fotos: AnexoDetalhe[] }>();
  for (const anexo of anexos) {
    if (anexo.tipo !== "FOTO") continue;
    const chave = anexo.ordemManutencaoId ?? "__geral__";
    if (!grupos.has(chave)) grupos.set(chave, { omNumero: anexo.ordemManutencao?.numero ?? null, fotos: [] });
    grupos.get(chave)!.fotos.push(anexo);
  }
  const comOm = [...grupos.entries()].filter(([chave]) => chave !== "__geral__").map(([, grupo]) => grupo);
  const geral = grupos.get("__geral__");
  return geral ? [...comOm, geral] : comOm;
}

export default function RdoDetalhe(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [rdo, setRdo] = useState<RdoDetalheResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [pdfGerado, setPdfGerado] = useState(false);
  const [webUrl, setWebUrl] = useState("");
  const [apiUrl, setApiUrl] = useState("");
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [enviandoFiscal, setEnviandoFiscal] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get<RdoDetalheResponse>(`/rdos/${id}`)
      .then(setRdo)
      .catch((error) => setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o RDO."));
    void getSettings().then((settings) => {
      setWebUrl(settings.webUrl);
      setApiUrl(settings.apiUrl);
    });
  }, [id]);

  async function copiarLinkCampo(): Promise<void> {
    if (!rdo?.linkCampoToken) return;
    const link = `${webUrl.replace(/\/$/, "")}/campo/${rdo.linkCampoToken}`;
    await navigator.clipboard.writeText(link);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

  async function gerarPdf(): Promise<void> {
    if (!id) return;
    setGerando(true);
    setErro(null);
    try {
      await api.post(`/rdos/${id}/pdf`, {});
      setPdfGerado(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível gerar o PDF.");
    } finally {
      setGerando(false);
    }
  }

  async function baixarPdf(): Promise<void> {
    if (!id) return;
    const settings = await getSettings();
    await abrirExterno(`${settings.apiUrl.replace(/\/$/, "")}/rdos/${id}/pdf`);
  }

  async function enviarParaFiscal(): Promise<void> {
    if (!id) return;
    setEnviandoFiscal(true);
    setErro(null);
    try {
      const atualizado = await api.post<RdoDetalheResponse>(`/rdos/${id}/enviar-fiscal`, {});
      setRdo(atualizado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível enviar o RDO para o fiscal.");
    } finally {
      setEnviandoFiscal(false);
    }
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        {erro && <p className="feedback feedback--erro">{erro}</p>}

        {!rdo ? (
          <p className="table-empty">Carregando…</p>
        ) : (
          <>
            <div className="list-header">
              <div>
                <h1 className="list-title">RDO {rdo.codigoRastreio} — {rdo.data.slice(0, 10)}</h1>
                <p className="list-subtitle">
                  {rdo.frente.nome} · Equipe {rdo.equipe.nome} · {TIPO_LABEL[rdo.tipo] ?? rdo.tipo}
                  {rdo.obra && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        style={{ padding: "1px 8px" }}
                        onClick={() => navigate(`/obras/${rdo.obra!.id}`)}
                      >
                        Obra: {rdo.obra.nome}
                      </button>
                    </>
                  )}
                  {" · "}
                  <span className="badge badge--ativo">{STATUS_LABEL[rdo.status] ?? rdo.status}</span>
                </p>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
                {rdo.linkCampoToken && rdo.status !== "APROVADO" && (
                  <button type="button" className="button button--ghost" onClick={() => void copiarLinkCampo()}>
                    {linkCopiado ? "Copiado!" : "Copiar link de campo"}
                  </button>
                )}
                {rdo.status === "AGUARDANDO_VALIDACAO_ESCRITORIO" && (
                  <>
                    <button
                      type="button"
                      className="button button--secondary"
                      onClick={() => navigate(`/rdos/${id}/editar`)}
                    >
                      Editar RDO
                    </button>
                    <button type="button" className="button" onClick={() => void enviarParaFiscal()} disabled={enviandoFiscal}>
                      {enviandoFiscal ? "Enviando…" : "Enviar para o fiscal"}
                    </button>
                  </>
                )}
                <button type="button" className="button button--secondary" onClick={() => void gerarPdf()} disabled={gerando}>
                  {gerando ? "Gerando…" : "Gerar PDF"}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => void baixarPdf()}
                  disabled={!pdfGerado}
                  title={pdfGerado ? undefined : "Gere o PDF primeiro"}
                >
                  Baixar PDF
                </button>
              </div>
            </div>

            {rdo.status === "AGUARDANDO_VALIDACAO_ESCRITORIO" && (
              <p className="feedback feedback--ok" style={{ marginBottom: 16 }}>
                O encarregado já assinou no celular — revise (edite se precisar) e clique em "Enviar para o fiscal" pra
                liberar no portal dele.
              </p>
            )}

            {(rdo.status === "REPROVADO" || rdo.status === "EM_CORRECAO") && (
              <p className="feedback feedback--erro" style={{ marginBottom: 16 }}>
                Reprovado pelo fiscal
                {rdo.ultimaDecisaoFiscal?.assinanteNome ? ` (${rdo.ultimaDecisaoFiscal.assinanteNome})` : ""}
                {rdo.ultimaDecisaoFiscal?.comentario ? `: ${rdo.ultimaDecisaoFiscal.comentario}` : ""}
                {rdo.status === "EM_CORRECAO"
                  ? " — o encarregado já reabriu o RDO para correção pelo link de campo."
                  : " — envie o link de campo pro encarregado corrigir."}
              </p>
            )}

            {rdo.status === "APROVADO" && rdo.ultimaDecisaoFiscal?.comentario && (
              <p className="feedback feedback--ok" style={{ marginBottom: 16 }}>
                Observação do fiscal
                {rdo.ultimaDecisaoFiscal.assinanteNome ? ` (${rdo.ultimaDecisaoFiscal.assinanteNome})` : ""}:{" "}
                {rdo.ultimaDecisaoFiscal.comentario}
              </p>
            )}

            {rdo.superestrutura && (
              <section className="form-section">
                <h2 className="form-section-title">Superestrutura</h2>
                <p className="list-subtitle">
                  <strong>Temperatura/Hora:</strong>{" "}
                  {rdo.superestrutura.leiturasTemperatura.length > 0
                    ? rdo.superestrutura.leiturasTemperatura
                        .map((l) => `${l.hora}${l.temperaturaC != null ? ` — ${l.temperaturaC}°C` : ""}`)
                        .join("   ")
                    : "—"}
                </p>
                <p className="list-subtitle">
                  <strong>Intervalo programado:</strong> {rdo.superestrutura.intervaloProgramadoInicio ?? "—"} /{" "}
                  {rdo.superestrutura.intervaloProgramadoFim ?? "—"} &nbsp;·&nbsp;
                  <strong>Realizado:</strong> {rdo.superestrutura.intervaloRealizadoInicio ?? "—"} /{" "}
                  {rdo.superestrutura.intervaloRealizadoFim ?? "—"} &nbsp;·&nbsp;
                  <strong>Tempo total por perdas:</strong> {rdo.superestrutura.tempoTotalPerdas ?? "—"}
                </p>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Descrição</th>
                      <th>Unid.</th>
                      <th>Qtd.</th>
                      <th>Linha</th>
                      <th>Km inic/fim</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rdo.superestrutura.servicos.map((servico) => (
                      <tr key={servico.id}>
                        <td>{servico.codigo ?? "—"}</td>
                        <td>{servico.descricao}</td>
                        <td>{servico.unidade ?? "—"}</td>
                        <td>{servico.quantidade ?? "—"}</td>
                        <td>{servico.linha ?? "—"}</td>
                        <td>
                          {servico.kmInicial != null && servico.kmFinal != null
                            ? `${servico.kmInicial}—${servico.kmFinal}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className="form-section">
              <h2 className="form-section-title">Linha do tempo do dia</h2>
              {rdo.blocosHorario.length === 0 ? (
                <p className="table-empty">Nenhum bloco de horário lançado.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Início</th>
                      <th>Fim</th>
                      <th>Descrição</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rdo.blocosHorario.map((bloco) => (
                      <tr key={bloco.id}>
                        <td>{bloco.horarioInicial}</td>
                        <td>{bloco.horarioFinal}</td>
                        <td>{bloco.descricao}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>

            <section className="form-section">
              <h2 className="form-section-title">Atividades realizadas</h2>
              {rdo.locais.map((local) => (
                <div key={local.id} style={{ marginBottom: 16 }}>
                  <p className="list-subtitle">
                    {local.descricao}
                    {local.lado ? ` (${local.lado})` : ""}
                  </p>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th>Descrição</th>
                        <th>Unidade</th>
                        <th>Quantidade</th>
                        <th>Km</th>
                        <th>Horário</th>
                        <th>Ordem de manutenção</th>
                        <th>Mão de obra</th>
                      </tr>
                    </thead>
                    <tbody>
                      {local.atividades.map((atividade) => (
                        <tr key={atividade.id}>
                          <td>{atividade.atividadeCatalogo.codigo}</td>
                          <td>{atividade.atividadeCatalogo.descricao}</td>
                          <td>{atividade.unidade}</td>
                          <td>{Number(atividade.totalCalculado).toLocaleString("pt-BR")}</td>
                          <td>
                            {atividade.kmInicial != null && atividade.kmFinal != null
                              ? `${atividade.kmInicial} ao ${atividade.kmFinal}`
                              : "—"}
                          </td>
                          <td>
                            {atividade.horarioInicial && atividade.horarioFinal
                              ? `${atividade.horarioInicial} – ${atividade.horarioFinal}`
                              : "—"}
                          </td>
                          <td>
                            {atividade.ordemManutencaoId
                              ? `Vinculada${atividade.statusOm ? ` (${STATUS_OM_LABEL[atividade.statusOm] ?? atividade.statusOm}${atividade.percentualConcluido != null ? ` — ${atividade.percentualConcluido}%` : ""})` : ""}`
                              : "—"}
                          </td>
                          <td>
                            {atividade.maoDeObra.length > 0
                              ? atividade.maoDeObra.map((item) => `${item.quantidade} ${item.funcao.nome}`).join(", ")
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </section>

            <section className="form-section">
              <h2 className="form-section-title">Mão de obra</h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Função</th>
                    <th>Colaborador</th>
                    <th>Quantidade</th>
                  </tr>
                </thead>
                <tbody>
                  {rdo.maoDeObra.map((item) => (
                    <tr key={item.id}>
                      <td>{item.funcao.nome}</td>
                      <td>{item.colaborador?.nome ?? "—"}</td>
                      <td>{item.quantidade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="form-section">
              <h2 className="form-section-title">Equipamentos / outros custos indiretos</h2>
              <table className="table">
                <tbody>
                  {rdo.equipamentos.map((item) => (
                    <tr key={item.id}>
                      <td>{item.equipamentoCatalogo.nome}</td>
                      <td>{item.quantidade}</td>
                      <td>{formatarDetalheEquipamento(item)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {rdo.materiais.length > 0 && (
              <section className="form-section">
                <h2 className="form-section-title">Materiais</h2>
                <table className="table">
                  <tbody>
                    {rdo.materiais.map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.materialCatalogo.descricao} ({item.materialCatalogo.unidade})
                        </td>
                        <td>{item.quantidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            {rdo.anexos.some((anexo) => anexo.tipo === "FOTO") && (
              <section className="form-section">
                <h2 className="form-section-title">Fotos</h2>
                {agruparFotosPorOm(rdo.anexos).map((grupo) => (
                  <div key={grupo.omNumero ?? "geral"} style={{ marginBottom: 16 }}>
                    <p className="list-subtitle">{grupo.omNumero ? `OM ${grupo.omNumero}` : "Fotos gerais"}</p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                      {grupo.fotos.map((foto) => (
                        <a
                          key={foto.id}
                          href="#"
                          onClick={(event) => {
                            event.preventDefault();
                            void abrirExterno(`${apiUrl.replace(/\/$/, "")}/rdos/${rdo.id}/anexos/${foto.id}`);
                          }}
                        >
                          <img
                            src={`${apiUrl.replace(/\/$/, "")}/rdos/${rdo.id}/anexos/${foto.id}`}
                            alt={foto.nomeOriginal}
                            style={{ width: 100, height: 100, objectFit: "cover", borderRadius: 8, border: "1px solid var(--border)" }}
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            )}

            <section className="form-section">
              <h2 className="form-section-title">Observações</h2>
              <p>
                <strong>Engecom:</strong> {rdo.observacoesContratada ?? "—"}
              </p>
              <p>
                <strong>Vale:</strong> {rdo.observacoesCliente ?? "—"}
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
