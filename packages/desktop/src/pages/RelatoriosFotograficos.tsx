import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface OrdemManutencao {
  id: string;
  numero: string;
  frenteId: string;
  frente: { id: string; nome: string };
  dataEmissao: string;
  lado: string | null;
  detalhes: string | null;
  precisaRelatorioFotografico: boolean;
  // Já teve alguma atividade lançada (em andamento ou concluída) em algum
  // RDO — OM que ainda nem começou não entra nessa lista (isso é
  // planejamento, não documentação do que já foi feito).
  foiLancada: boolean;
}

const MARCAS_DIACRITICAS = /[̀-ͯ]/g;

function normalizarBusca(texto: string): string {
  return texto.normalize("NFD").replace(MARCAS_DIACRITICAS, "").toLowerCase().trim();
}

/** Ponto de acesso único aos relatórios fotográficos (checklist de conclusão) de todas as OMs — reúne o que hoje fica espalhado num botão por linha em Ordens de Manutenção/Farol. */
export default function RelatoriosFotograficos(): ReactElement {
  const navigate = useNavigate();
  const [ordens, setOrdens] = useState<OrdemManutencao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [somentePendentes, setSomentePendentes] = useState(false);

  useEffect(() => {
    api
      .get<OrdemManutencao[]>("/ordens-manutencao")
      .then(setOrdens)
      .catch((error) => setErro(error instanceof ApiError ? error.message : "Não foi possível carregar as ordens de manutenção."));
  }, []);

  const ordensFiltradas = useMemo(() => {
    const termo = normalizarBusca(busca);
    return (ordens ?? [])
      // OM que ainda não teve nenhuma atividade lançada não entra aqui —
      // essa lista é sobre documentar o que já foi feito, não sobre o que
      // falta planejar (isso já é o Farol de OM).
      .filter((ordem) => ordem.foiLancada)
      .filter((ordem) => !somentePendentes || ordem.precisaRelatorioFotografico)
      .filter(
        (ordem) =>
          termo === "" ||
          [ordem.numero, ordem.frente.nome, ordem.detalhes].some((campo) => normalizarBusca(campo ?? "").includes(termo)),
      )
      .sort((a, b) => {
        // Pendente sempre antes de OK — é o que precisa de atenção, então
        // fica fácil de achar sem se perder no meio dos já finalizados. O
        // que já foi feito (conferido com calma) vai pro final da lista,
        // fora do caminho.
        if (a.precisaRelatorioFotografico !== b.precisaRelatorioFotografico) {
          return a.precisaRelatorioFotografico ? -1 : 1;
        }
        // Dentro de cada grupo, os mais novos (que acabaram de chegar)
        // primeiro.
        return b.dataEmissao.localeCompare(a.dataEmissao);
      });
  }, [ordens, busca, somentePendentes]);

  const totalPendentes = (ordens ?? []).filter((o) => o.precisaRelatorioFotografico).length;

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Relatórios Fotográficos</h1>
            <p className="list-subtitle">
              Checklist de Conclusão de Manutenção por OM — {totalPendentes} pendente{totalPendentes === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
          <input
            className="field-input"
            style={{ maxWidth: 360 }}
            placeholder="Buscar por número da OM, frente ou detalhes…"
            value={busca}
            onChange={(event) => setBusca(event.target.value)}
          />
          <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.85rem" }}>
            <input type="checkbox" checked={somentePendentes} onChange={(event) => setSomentePendentes(event.target.checked)} />
            Só pendentes
          </label>
        </div>

        <div className="panel">
          {ordens === null ? (
            <p className="table-empty">Carregando…</p>
          ) : ordensFiltradas.length === 0 ? (
            <p className="table-empty">Nenhuma OM encontrada.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Frente</th>
                  <th>Emissão</th>
                  <th>Detalhes</th>
                  <th>Relatório fotográfico</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ordensFiltradas.map((ordem) => (
                  <tr key={ordem.id}>
                    <td>{ordem.numero}</td>
                    <td>{ordem.frente.nome}</td>
                    <td>{ordem.dataEmissao.slice(0, 10)}</td>
                    <td>{ordem.detalhes ?? "—"}</td>
                    <td>
                      {ordem.precisaRelatorioFotografico ? (
                        <span className="badge badge--atrasada">Pendente</span>
                      ) : (
                        <span className="badge badge--ativo">OK</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => navigate(`/ordens-manutencao/${ordem.id}/relatorios-fotograficos`)}
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
