import { useEffect, useState, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";
import { abrirExterno, getSettings } from "../lib/settingsStore";

interface AtividadeDetalhe {
  id: string;
  atividadeCatalogo: { codigo: string; descricao: string; unidade: string };
  totalCalculado: string;
  unidade: string;
  ordemManutencaoId: string | null;
  kmInicial: string | null;
  kmFinal: string | null;
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
}

interface MaterialDetalhe {
  id: string;
  materialCatalogo: { descricao: string; unidade: string };
  quantidade: string;
}

interface RdoDetalheResponse {
  id: string;
  data: string;
  status: string;
  clima: string | null;
  horaExtraInicio: string | null;
  horaExtraFim: string | null;
  totalDesvios: number | null;
  observacoesContratada: string | null;
  observacoesCliente: string | null;
  frente: { nome: string };
  equipe: { nome: string };
  blocosHorario: BlocoDetalhe[];
  locais: LocalDetalhe[];
  maoDeObra: MaoDeObraDetalhe[];
  equipamentos: EquipamentoDetalhe[];
  materiais: MaterialDetalhe[];
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export default function RdoDetalhe(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const [rdo, setRdo] = useState<RdoDetalheResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [gerando, setGerando] = useState(false);
  const [pdfGerado, setPdfGerado] = useState(false);

  useEffect(() => {
    if (!id) return;
    api
      .get<RdoDetalheResponse>(`/rdos/${id}`)
      .then(setRdo)
      .catch((error) => setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o RDO."));
  }, [id]);

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
                <h1 className="list-title">RDO — {rdo.data.slice(0, 10)}</h1>
                <p className="list-subtitle">
                  {rdo.frente.nome} · Equipe {rdo.equipe.nome} ·{" "}
                  <span className="badge badge--ativo">{STATUS_LABEL[rdo.status] ?? rdo.status}</span>
                </p>
              </div>
              <div style={{ display: "flex", gap: 12 }}>
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
                        <th>Ordem de manutenção</th>
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
                          <td>{atividade.ordemManutencaoId ? "Vinculada" : "—"}</td>
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
