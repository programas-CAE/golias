import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Atividade {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  metaPus: string | null;
  usaDimensoes: boolean;
  ativo: boolean;
  ordem: number;
}

interface Equipamento {
  id: string;
  nome: string;
  ativo: boolean;
}

interface Contrato {
  id: string;
  numero: string;
  nome: string | null;
}

interface Material {
  id: string;
  contratoId: string;
  codigo: string;
  descricao: string;
  unidade: string;
  precoUnitario: string | null;
  ativo: boolean;
}

export default function Catalogos(): ReactElement {
  const [aba, setAba] = useState<"atividades" | "equipamentos" | "materiais">("atividades");

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Catálogos</h1>
            <p className="list-subtitle">Atividades, equipamentos e materiais usados no lançamento do RDO</p>
          </div>
        </div>

        <div className="tabs-row">
          <button
            type="button"
            className={`tab-button${aba === "atividades" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("atividades")}
          >
            Atividades
          </button>
          <button
            type="button"
            className={`tab-button${aba === "equipamentos" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("equipamentos")}
          >
            Equipamentos
          </button>
          <button
            type="button"
            className={`tab-button${aba === "materiais" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("materiais")}
          >
            Materiais
          </button>
        </div>

        {aba === "atividades" ? <PainelAtividades /> : aba === "equipamentos" ? <PainelEquipamentos /> : <PainelMateriais />}
      </div>
    </div>
  );
}

function PainelAtividades(): ReactElement {
  const [atividades, setAtividades] = useState<Atividade[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Atividade | null>(null);
  const [criando, setCriando] = useState(false);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      setAtividades(await api.get<Atividade[]>("/atividades"));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o catálogo de atividades.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  return (
    <>
      <div className="list-header" style={{ marginTop: 4 }}>
        <p className="list-subtitle">
          Catálogo oficial da Price List do contrato (código, descrição e unidade de uma atividade já cadastrada não
          são editáveis aqui). Use "Adicionar atividade" só pra um serviço novo que não está na lista original.
        </p>
        <button type="button" className="button" onClick={() => setCriando(true)}>
          + Adicionar atividade
        </button>
      </div>

      {erro && <p className="feedback feedback--erro">{erro}</p>}

      <div className="panel">
        {atividades === null ? (
          <p className="table-empty">Carregando…</p>
        ) : atividades.length === 0 ? (
          <p className="table-empty">Nenhuma atividade cadastrada.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Unidade</th>
                <th>Ordem</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {atividades.map((atividade) => (
                <tr key={atividade.id}>
                  <td>{atividade.codigo}</td>
                  <td>{atividade.descricao}</td>
                  <td>{atividade.unidade}</td>
                  <td>{atividade.ordem}</td>
                  <td>
                    <span className={`badge badge--${atividade.ativo ? "ativo" : "inativo"}`}>
                      {atividade.ativo ? "Ativa" : "Inativa"}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="button button--ghost button--small" onClick={() => setEditando(atividade)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {criando && (
        <NovaAtividadeModal
          onClose={() => setCriando(false)}
          onCriada={(nova) => {
            setAtividades((atual) => [...(atual ?? []), nova].sort((a, b) => a.ordem - b.ordem));
            setCriando(false);
          }}
        />
      )}

      {editando && (
        <EditarAtividadeModal
          atividade={editando}
          onClose={() => setEditando(null)}
          onSalvo={(atualizada) => {
            setAtividades((atual) => atual?.map((a) => (a.id === atualizada.id ? atualizada : a)) ?? atual);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

const UNIDADES: Atividade["unidade"][] = ["M", "M2", "M3", "UND", "HH", "M3KM"];

function NovaAtividadeModal({
  onClose,
  onCriada,
}: {
  onClose: () => void;
  onCriada: (atividade: Atividade) => void;
}): ReactElement {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState<Atividade["unidade"]>("UND");
  const [usaDimensoes, setUsaDimensoes] = useState(false);
  const [metaPus, setMetaPus] = useState("");
  const [ordem, setOrdem] = useState("0");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const criada = await api.post<Atividade>("/atividades", {
        codigo,
        descricao,
        unidade,
        usaDimensoes,
        metaPus: metaPus === "" ? null : Number(metaPus),
        ordem: ordem === "" ? 0 : Number(ordem),
      });
      onCriada(criada);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar a atividade.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Adicionar atividade</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="codigo">
            Código
          </label>
          <input
            id="codigo"
            className="field-input"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            autoComplete="off"
            autoFocus
          />

          <label className="field-label" htmlFor="descricao">
            Descrição
          </label>
          <input
            id="descricao"
            className="field-input"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="unidade">
            Unidade
          </label>
          <select
            id="unidade"
            className="field-input"
            value={unidade}
            onChange={(event) => setUnidade(event.target.value as Atividade["unidade"])}
          >
            {UNIDADES.map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>

          <label className="checkbox-row">
            <input type="checkbox" checked={usaDimensoes} onChange={(event) => setUsaDimensoes(event.target.checked)} />
            Medida por dimensões (altura/largura/comprimento) em vez de quantidade direta
          </label>

          <label className="field-label" htmlFor="metaPus">
            Meta de produtividade (PUS) — opcional
          </label>
          <input
            id="metaPus"
            type="number"
            step="0.0001"
            className="field-input"
            value={metaPus}
            onChange={(event) => setMetaPus(event.target.value)}
          />

          <label className="field-label" htmlFor="ordem">
            Ordem de exibição
          </label>
          <input id="ordem" type="number" className="field-input" value={ordem} onChange={(event) => setOrdem(event.target.value)} />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando || codigo.trim() === "" || descricao.trim() === ""}>
              {salvando ? "Salvando…" : "Adicionar"}
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

function EditarAtividadeModal({
  atividade,
  onClose,
  onSalvo,
}: {
  atividade: Atividade;
  onClose: () => void;
  onSalvo: (atividade: Atividade) => void;
}): ReactElement {
  const [ordem, setOrdem] = useState(String(atividade.ordem));
  const [metaPus, setMetaPus] = useState(atividade.metaPus ?? "");
  const [ativo, setAtivo] = useState(atividade.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const atualizada = await api.patch<Atividade>(`/atividades/${atividade.id}`, {
        ordem: Number(ordem),
        metaPus: metaPus === "" ? null : Number(metaPus),
        ativo,
      });
      onSalvo(atualizada);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Editar atividade</h2>
        <p className="modal-subtitle">
          {atividade.codigo} — {atividade.descricao}
        </p>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="ordem">
            Ordem de exibição
          </label>
          <input id="ordem" type="number" className="field-input" value={ordem} onChange={(event) => setOrdem(event.target.value)} />

          <label className="field-label" htmlFor="metaPus">
            Meta de produtividade (PUS)
          </label>
          <input
            id="metaPus"
            type="number"
            step="0.0001"
            className="field-input"
            value={metaPus}
            onChange={(event) => setMetaPus(event.target.value)}
          />

          <label className="checkbox-row">
            <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
            Atividade ativa
          </label>

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

function PainelEquipamentos(): ReactElement {
  const [equipamentos, setEquipamentos] = useState<Equipamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Equipamento | null>(null);
  const [criando, setCriando] = useState(false);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      setEquipamentos(await api.get<Equipamento[]>("/equipamentos?todos=1"));
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o catálogo de equipamentos.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  return (
    <>
      <div className="list-header" style={{ marginTop: 4 }}>
        <p className="list-subtitle">
          Equipamentos e outros custos indiretos que aparecem no RDO — essa lista muda com frequência, edite à
          vontade.
        </p>
        <button type="button" className="button" onClick={() => setCriando(true)}>
          + Adicionar equipamento
        </button>
      </div>

      {erro && <p className="feedback feedback--erro">{erro}</p>}

      <div className="panel">
        {equipamentos === null ? (
          <p className="table-empty">Carregando…</p>
        ) : equipamentos.length === 0 ? (
          <p className="table-empty">Nenhum equipamento cadastrado.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {equipamentos.map((equipamento) => (
                <tr key={equipamento.id}>
                  <td>{equipamento.nome}</td>
                  <td>
                    <span className={`badge badge--${equipamento.ativo ? "ativo" : "inativo"}`}>
                      {equipamento.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="button button--ghost button--small" onClick={() => setEditando(equipamento)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {criando && (
        <NovoEquipamentoModal
          onClose={() => setCriando(false)}
          onCriado={(novo) => {
            setEquipamentos((atual) => [...(atual ?? []), novo]);
            setCriando(false);
          }}
        />
      )}

      {editando && (
        <EditarEquipamentoModal
          equipamento={editando}
          onClose={() => setEditando(null)}
          onSalvo={(atualizado) => {
            setEquipamentos((atual) => atual?.map((e) => (e.id === atualizado.id ? atualizado : e)) ?? atual);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

function NovoEquipamentoModal({ onClose, onCriado }: { onClose: () => void; onCriado: (equipamento: Equipamento) => void }): ReactElement {
  const [nome, setNome] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const criado = await api.post<Equipamento>("/equipamentos", { nome });
      onCriado(criado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar o equipamento.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Adicionar equipamento</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="nome">
            Nome
          </label>
          <input id="nome" className="field-input" value={nome} onChange={(event) => setNome(event.target.value)} autoComplete="off" autoFocus />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando || nome.trim() === ""}>
              {salvando ? "Salvando…" : "Adicionar"}
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

function EditarEquipamentoModal({
  equipamento,
  onClose,
  onSalvo,
}: {
  equipamento: Equipamento;
  onClose: () => void;
  onSalvo: (equipamento: Equipamento) => void;
}): ReactElement {
  const [nome, setNome] = useState(equipamento.nome);
  const [ativo, setAtivo] = useState(equipamento.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await api.patch<Equipamento>(`/equipamentos/${equipamento.id}`, { nome, ativo });
      onSalvo(atualizado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Editar equipamento</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="nome-editar">
            Nome
          </label>
          <input
            id="nome-editar"
            className="field-input"
            value={nome}
            onChange={(event) => setNome(event.target.value)}
            autoComplete="off"
          />

          <label className="checkbox-row">
            <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
            Equipamento ativo (some da lista do RDO quando desmarcado)
          </label>

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando || nome.trim() === ""}>
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

function PainelMateriais(): ReactElement {
  const [materiais, setMateriais] = useState<Material[] | null>(null);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Material | null>(null);
  const [criando, setCriando] = useState(false);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaMateriais, listaContratos] = await Promise.all([
        api.get<Material[]>("/materiais?todos=1"),
        api.get<Contrato[]>("/contratos"),
      ]);
      setMateriais(listaMateriais);
      setContratos(listaContratos);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o catálogo de materiais.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function nomeContrato(contratoId: string): string {
    const contrato = contratos.find((c) => c.id === contratoId);
    if (!contrato) return "—";
    return contrato.nome ? `${contrato.numero} — ${contrato.nome}` : contrato.numero;
  }

  return (
    <>
      <div className="list-header" style={{ marginTop: 4 }}>
        <p className="list-subtitle">
          Materiais usados no lançamento do RDO — essa lista muda com frequência, edite à vontade.
        </p>
        <button type="button" className="button" onClick={() => setCriando(true)} disabled={contratos.length === 0}>
          + Adicionar material
        </button>
      </div>

      {erro && <p className="feedback feedback--erro">{erro}</p>}

      <div className="panel">
        {materiais === null ? (
          <p className="table-empty">Carregando…</p>
        ) : materiais.length === 0 ? (
          <p className="table-empty">Nenhum material cadastrado.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descrição</th>
                <th>Unidade</th>
                <th>Contrato</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {materiais.map((material) => (
                <tr key={material.id}>
                  <td>{material.codigo}</td>
                  <td>{material.descricao}</td>
                  <td>{material.unidade}</td>
                  <td>{nomeContrato(material.contratoId)}</td>
                  <td>
                    <span className={`badge badge--${material.ativo ? "ativo" : "inativo"}`}>
                      {material.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="button button--ghost button--small" onClick={() => setEditando(material)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {criando && (
        <NovoMaterialModal
          contratos={contratos}
          onClose={() => setCriando(false)}
          onCriado={(novo) => {
            setMateriais((atual) => [...(atual ?? []), novo]);
            setCriando(false);
          }}
        />
      )}

      {editando && (
        <EditarMaterialModal
          material={editando}
          onClose={() => setEditando(null)}
          onSalvo={(atualizado) => {
            setMateriais((atual) => atual?.map((m) => (m.id === atualizado.id ? atualizado : m)) ?? atual);
            setEditando(null);
          }}
        />
      )}
    </>
  );
}

function NovoMaterialModal({
  contratos,
  onClose,
  onCriado,
}: {
  contratos: Contrato[];
  onClose: () => void;
  onCriado: (material: Material) => void;
}): ReactElement {
  const [contratoId, setContratoId] = useState(contratos[0]?.id ?? "");
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState("");
  const [precoUnitario, setPrecoUnitario] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const criado = await api.post<Material>("/materiais", {
        contratoId,
        codigo,
        descricao,
        unidade,
        precoUnitario: precoUnitario === "" ? null : Number(precoUnitario),
      });
      onCriado(criado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar o material.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Adicionar material</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="contratoId">
            Contrato
          </label>
          <select id="contratoId" className="field-input" value={contratoId} onChange={(event) => setContratoId(event.target.value)}>
            {contratos.map((contrato) => (
              <option key={contrato.id} value={contrato.id}>
                {contrato.nome ? `${contrato.numero} — ${contrato.nome}` : contrato.numero}
              </option>
            ))}
          </select>

          <label className="field-label" htmlFor="codigo">
            Código
          </label>
          <input
            id="codigo"
            className="field-input"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            autoComplete="off"
            autoFocus
          />

          <label className="field-label" htmlFor="descricao">
            Descrição
          </label>
          <input
            id="descricao"
            className="field-input"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="unidade">
            Unidade
          </label>
          <input
            id="unidade"
            className="field-input"
            value={unidade}
            onChange={(event) => setUnidade(event.target.value)}
            placeholder="Ex.: UND, KG, M, L"
            autoComplete="off"
          />

          <label className="field-label" htmlFor="precoUnitario">
            Preço unitário — opcional
          </label>
          <input
            id="precoUnitario"
            type="number"
            step="0.01"
            min={0}
            className="field-input"
            value={precoUnitario}
            onChange={(event) => setPrecoUnitario(event.target.value)}
          />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button
              type="submit"
              className="button"
              disabled={salvando || contratoId === "" || codigo.trim() === "" || descricao.trim() === "" || unidade.trim() === ""}
            >
              {salvando ? "Salvando…" : "Adicionar"}
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

function EditarMaterialModal({
  material,
  onClose,
  onSalvo,
}: {
  material: Material;
  onClose: () => void;
  onSalvo: (material: Material) => void;
}): ReactElement {
  const [descricao, setDescricao] = useState(material.descricao);
  const [unidade, setUnidade] = useState(material.unidade);
  const [precoUnitario, setPrecoUnitario] = useState(material.precoUnitario ?? "");
  const [ativo, setAtivo] = useState(material.ativo);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const atualizado = await api.patch<Material>(`/materiais/${material.id}`, {
        descricao,
        unidade,
        precoUnitario: precoUnitario === "" ? null : Number(precoUnitario),
        ativo,
      });
      onSalvo(atualizado);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">Editar material</h2>
        <p className="modal-subtitle">{material.codigo}</p>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="descricao-editar">
            Descrição
          </label>
          <input
            id="descricao-editar"
            className="field-input"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="unidade-editar">
            Unidade
          </label>
          <input
            id="unidade-editar"
            className="field-input"
            value={unidade}
            onChange={(event) => setUnidade(event.target.value)}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="precoUnitario-editar">
            Preço unitário
          </label>
          <input
            id="precoUnitario-editar"
            type="number"
            step="0.01"
            min={0}
            className="field-input"
            value={precoUnitario}
            onChange={(event) => setPrecoUnitario(event.target.value)}
          />

          <label className="checkbox-row">
            <input type="checkbox" checked={ativo} onChange={(event) => setAtivo(event.target.checked)} />
            Material ativo (some da lista do RDO quando desmarcado)
          </label>

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando || descricao.trim() === "" || unidade.trim() === ""}>
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
