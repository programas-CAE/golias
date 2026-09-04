import { useEffect, useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface ItemDia {
  relatorioId: string;
  rdoId: string;
  data: string;
  equipe: string;
  statusOm: string | null;
  percentualConcluido: number | null;
  totalFotos: number;
  pdfDisponivel: boolean;
}

interface RespostaLista {
  omNumero: string;
  itens: ItemDia[];
}

const STATUS_LABEL: Record<string, string> = {
  EM_ANDAMENTO: "Em andamento",
  CONCLUIDA: "Concluída",
};

/**
 * Um Relatório Fotográfico por DIA trabalhado nessa OM (não um só pra OM
 * inteira) — a mesma OM pode levar vários dias até fechar, e cada dia
 * documenta suas próprias fotos e o % concluído daquele dia, mesmo que a
 * OM ainda esteja em andamento (ver relatoriosFotograficos.ts no servidor).
 */
export default function RelatoriosFotograficosDaOm(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dados, setDados] = useState<RespostaLista | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api
      .get<RespostaLista>(`/ordens-manutencao/${id}/relatorios-fotograficos`)
      .then(setDados)
      .catch((error) => setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os relatórios."));
  }, [id]);

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Relatórios fotográficos — OM {dados?.omNumero ?? "…"}</h1>
            <p className="list-subtitle">Um relatório por dia trabalhado nessa OM, independente dela já ter fechado ou não.</p>
          </div>
          <button type="button" className="button button--secondary" onClick={() => navigate("/relatorios-fotograficos")}>
            Voltar
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {dados === null ? (
            <p className="table-empty">Carregando…</p>
          ) : dados.itens.length === 0 ? (
            <p className="table-empty">Nenhum dia trabalhado nessa OM ainda.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Equipe</th>
                  <th>Status do dia</th>
                  <th>% concluído</th>
                  <th>Fotos</th>
                  <th>PDF</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {dados.itens.map((item) => (
                  <tr key={item.relatorioId}>
                    <td>{item.data.slice(0, 10)}</td>
                    <td>{item.equipe}</td>
                    <td>
                      <span className={`badge badge--${item.statusOm === "CONCLUIDA" ? "ativo" : "inativo"}`}>
                        {item.statusOm ? (STATUS_LABEL[item.statusOm] ?? item.statusOm) : "—"}
                      </span>
                    </td>
                    <td>{item.percentualConcluido != null ? `${item.percentualConcluido}%` : "—"}</td>
                    <td>{item.totalFotos}</td>
                    <td>{item.pdfDisponivel ? "Gerado" : "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => navigate(`/ordens-manutencao/${id}/relatorios-fotograficos/${item.relatorioId}`)}
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
