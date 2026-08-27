import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Frente {
  id: string;
  nome: string;
  codigo: string;
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
}

interface OrdemForm {
  numero: string;
  frenteId: string;
  dataEmissao: string;
  kmInicial: string;
  kmFinal: string;
  lado: string;
  detalhes: string;
}

export default function OrdensManutencao(): ReactElement {
  const [ordens, setOrdens] = useState<OrdemManutencao[] | null>(null);
  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<OrdemManutencao | "novo" | null>(null);
  const [importando, setImportando] = useState(false);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaOrdens, listaFrentes] = await Promise.all([
        api.get<OrdemManutencao[]>("/ordens-manutencao"),
        api.get<Frente[]>("/frentes"),
      ]);
      setOrdens(listaOrdens);
      setFrentes(listaFrentes);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar as ordens de manutenção.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function handleSalvo(ordem: OrdemManutencao): void {
    setOrdens((atual) => {
      if (!atual) return atual;
      const existe = atual.some((o) => o.id === ordem.id);
      return existe ? atual.map((o) => (o.id === ordem.id ? ordem : o)) : [ordem, ...atual];
    });
    setEditando(null);
  }

  function handleImportado(importadas: OrdemManutencao[]): void {
    setOrdens((atual) => {
      const base = atual ?? [];
      const porId = new Map(base.map((o) => [o.id, o]));
      for (const ordem of importadas) porId.set(ordem.id, ordem);
      return [...porId.values()].sort((a, b) => b.dataEmissao.localeCompare(a.dataEmissao));
    });
    setImportando(false);
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Ordens de Manutenção</h1>
            <p className="list-subtitle">Ordens emitidas pelo cliente para cada frente</p>
          </div>
          <div style={{ display: "flex", gap: 12 }}>
            <button type="button" className="button button--secondary" onClick={() => setImportando(true)}>
              Importar PDF
            </button>
            <button type="button" className="button" onClick={() => setEditando("novo")}>
              Nova ordem
            </button>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {ordens === null ? (
            <p className="table-empty">Carregando…</p>
          ) : ordens.length === 0 ? (
            <p className="table-empty">Nenhuma ordem de manutenção cadastrada.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Frente</th>
                  <th>Emissão</th>
                  <th>Lado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {ordens.map((ordem) => (
                  <tr key={ordem.id}>
                    <td>{ordem.numero}</td>
                    <td>{ordem.frente.nome}</td>
                    <td>{ordem.dataEmissao.slice(0, 10)}</td>
                    <td>{ordem.lado ?? "—"}</td>
                    <td>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={() => setEditando(ordem)}
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
        <OrdemModal ordem={editando} frentes={frentes} onClose={() => setEditando(null)} onSalvo={handleSalvo} />
      )}

      {importando && (
        <ImportarPdfModal frentes={frentes} onClose={() => setImportando(false)} onImportado={handleImportado} />
      )}
    </div>
  );
}

function ImportarPdfModal({
  frentes,
  onClose,
  onImportado,
}: {
  frentes: Frente[];
  onClose: () => void;
  onImportado: (ordens: OrdemManutencao[]) => void;
}): ReactElement {
  const [frenteId, setFrenteId] = useState(frentes[0]?.id ?? "");
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ criadas: number; atualizadas: number } | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!arquivo) {
      setErro("Selecione o arquivo PDF.");
      return;
    }
    setEnviando(true);
    setErro(null);
    setResultado(null);
    try {
      const form = new FormData();
      form.append("frenteId", frenteId);
      form.append("arquivo", arquivo);
      const resposta = await api.postForm<{ criadas: number; atualizadas: number; ordens: OrdemManutencao[] }>(
        "/ordens-manutencao/importar-pdf",
        form,
      );
      setResultado({ criadas: resposta.criadas, atualizadas: resposta.atualizadas });
      onImportado(resposta.ordens);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível importar o PDF.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Importar ordens de manutenção (PDF)</h2>
        <p className="modal-subtitle">
          Aceita o relatório de OM exportado do SAP/ECC (ex.: "ECC RAMAL"), com uma ou várias ordens — cada uma vira um
          registro, pelo número.
        </p>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="frenteImportacao">
            Frente
          </label>
          <select
            id="frenteImportacao"
            className="field-input"
            value={frenteId}
            onChange={(event) => setFrenteId(event.target.value)}
          >
            {frentes.map((frente) => (
              <option key={frente.id} value={frente.id}>
                {frente.nome}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="arquivoImportacao">
            Arquivo PDF
          </label>
          <input
            id="arquivoImportacao"
            type="file"
            accept="application/pdf"
            className="field-input"
            onChange={(event) => setArquivo(event.target.files?.[0] ?? null)}
          />

          {erro && <p className="feedback feedback--erro">{erro}</p>}
          {resultado && (
            <p className="feedback feedback--ok">
              {resultado.criadas} nova(s), {resultado.atualizadas} atualizada(s).
            </p>
          )}

          <div className="form-actions">
            <button type="submit" className="button" disabled={enviando}>
              {enviando ? "Importando…" : "Importar"}
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Fechar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function OrdemModal({
  ordem,
  frentes,
  onClose,
  onSalvo,
}: {
  ordem: OrdemManutencao | "novo";
  frentes: Frente[];
  onClose: () => void;
  onSalvo: (ordem: OrdemManutencao) => void;
}): ReactElement {
  const existente = ordem === "novo" ? null : ordem;
  const [form, setForm] = useState<OrdemForm>({
    numero: existente?.numero ?? "",
    frenteId: existente?.frenteId ?? (frentes[0]?.id ?? ""),
    dataEmissao: existente?.dataEmissao.slice(0, 10) ?? "",
    kmInicial: existente?.kmInicial ?? "",
    kmFinal: existente?.kmFinal ?? "",
    lado: existente?.lado ?? "",
    detalhes: existente?.detalhes ?? "",
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
      const salvo = existente
        ? await api.patch<OrdemManutencao>(`/ordens-manutencao/${existente.id}`, payload)
        : await api.post<OrdemManutencao>("/ordens-manutencao", payload);
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
        <h2 className="modal-title">{existente ? "Editar ordem de manutenção" : "Nova ordem de manutenção"}</h2>
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
