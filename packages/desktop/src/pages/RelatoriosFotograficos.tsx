import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Frente {
  id: string;
  nome: string;
}

interface OrdemManutencao {
  id: string;
  numero: string;
  frenteId: string;
  frente: Frente;
  dataEmissao: string;
  kmInicial: string | null;
  kmFinal: string | null;
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
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [somentePendentes, setSomentePendentes] = useState(false);
  const [editando, setEditando] = useState<OrdemManutencao | null>(null);

  useEffect(() => {
    Promise.all([api.get<OrdemManutencao[]>("/ordens-manutencao"), api.get<Frente[]>("/frentes")])
      .then(([listaOrdens, listaFrentes]) => {
        setOrdens(listaOrdens);
        setFrentes(listaFrentes);
      })
      .catch((error) => setErro(error instanceof ApiError ? error.message : "Não foi possível carregar as ordens de manutenção."));
  }, []);

  function handleSalvo(ordem: OrdemManutencao): void {
    setOrdens((atual) => atual?.map((o) => (o.id === ordem.id ? { ...o, ...ordem } : o)) ?? atual);
    setEditando(null);
  }

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
                  <tr
                    key={ordem.id}
                    className="table-row--clicavel"
                    onClick={() => navigate(`/ordens-manutencao/${ordem.id}/relatorios-fotograficos`)}
                    title="Abrir relatório fotográfico desta OM"
                  >
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
                    <td style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditando(ordem);
                        }}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando && (
        <EditarOrdemModal ordem={editando} frentes={frentes} onClose={() => setEditando(null)} onSalvo={handleSalvo} />
      )}
    </div>
  );
}

function EditarOrdemModal({
  ordem,
  frentes,
  onClose,
  onSalvo,
}: {
  ordem: OrdemManutencao;
  frentes: Frente[];
  onClose: () => void;
  onSalvo: (ordem: OrdemManutencao) => void;
}): ReactElement {
  const [form, setForm] = useState({
    numero: ordem.numero,
    frenteId: ordem.frenteId,
    dataEmissao: ordem.dataEmissao.slice(0, 10),
    kmInicial: ordem.kmInicial ?? "",
    kmFinal: ordem.kmFinal ?? "",
    lado: ordem.lado ?? "",
    detalhes: ordem.detalhes ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const payload = {
        numero: form.numero,
        frenteId: form.frenteId,
        dataEmissao: form.dataEmissao,
        kmInicial: form.kmInicial === "" ? null : Number(form.kmInicial),
        kmFinal: form.kmFinal === "" ? null : Number(form.kmFinal),
        lado: form.lado === "" ? null : form.lado,
        detalhes: form.detalhes === "" ? null : form.detalhes,
      };
      const salvo = await api.patch<OrdemManutencao>(`/ordens-manutencao/${ordem.id}`, payload);
      onSalvo(salvo);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Editar ordem de manutenção</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="numero">
            Número
          </label>
          <input
            id="numero"
            className="field-input"
            value={form.numero}
            onChange={(event) => setForm((f) => ({ ...f, numero: event.target.value }))}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="frenteId">
            Frente
          </label>
          <select
            id="frenteId"
            className="field-input"
            value={form.frenteId}
            onChange={(event) => setForm((f) => ({ ...f, frenteId: event.target.value }))}
          >
            {frentes.map((frente) => (
              <option key={frente.id} value={frente.id}>
                {frente.nome}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="dataEmissao">
            Data de emissão
          </label>
          <input
            id="dataEmissao"
            type="date"
            className="field-input"
            value={form.dataEmissao}
            onChange={(event) => setForm((f) => ({ ...f, dataEmissao: event.target.value }))}
          />

          <label className="field-label" htmlFor="kmInicial">
            Km inicial
          </label>
          <input
            id="kmInicial"
            type="number"
            step="0.001"
            className="field-input"
            value={form.kmInicial}
            onChange={(event) => setForm((f) => ({ ...f, kmInicial: event.target.value }))}
          />

          <label className="field-label" htmlFor="kmFinal">
            Km final
          </label>
          <input
            id="kmFinal"
            type="number"
            step="0.001"
            className="field-input"
            value={form.kmFinal}
            onChange={(event) => setForm((f) => ({ ...f, kmFinal: event.target.value }))}
          />

          <label className="field-label" htmlFor="lado">
            Lado
          </label>
          <input
            id="lado"
            className="field-input"
            value={form.lado}
            onChange={(event) => setForm((f) => ({ ...f, lado: event.target.value }))}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="detalhes">
            Detalhes
          </label>
          <input
            id="detalhes"
            className="field-input"
            value={form.detalhes}
            onChange={(event) => setForm((f) => ({ ...f, detalhes: event.target.value }))}
            autoComplete="off"
          />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
