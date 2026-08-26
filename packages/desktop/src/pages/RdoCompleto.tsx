import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import CroquiAtividade from "../components/CroquiAtividade";
import Autocomplete from "../components/Autocomplete";
import { ApiError, api } from "../lib/apiClient";

interface Frente {
  id: string;
  codigo: string;
  nome: string;
  contrato: { numero: string };
}

interface Colaborador {
  id: string;
  nome: string;
}

interface Funcao {
  id: string;
  nome: string;
}

interface EquipeMembro {
  id: string;
  colaboradorId: string;
  colaborador: Colaborador;
  funcaoId: string;
  funcao: Funcao;
}

interface Equipe {
  id: string;
  nome: string;
  distrito: { frenteId: string };
  membros: EquipeMembro[];
}

interface AtividadeCatalogo {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  usaDimensoes: boolean;
}

interface EquipamentoCatalogo {
  id: string;
  nome: string;
}

interface OrdemManutencao {
  id: string;
  numero: string;
  frenteId: string;
  detalhes: string | null;
}

interface AtividadeDraft {
  atividadeCatalogoId: string;
  ordemManutencaoId: string;
  unidade: string;
  altura: string;
  largura: string;
  larguraFinal: string;
  comprimento: string;
  quantidadeDireta: string;
  horasTrabalhadas: string;
  maoObraDireta: string;
}

interface LocalDraft {
  descricao: string;
  kmInicial: string;
  kmFinal: string;
  lado: string;
  atividades: AtividadeDraft[];
}

interface BlocoDraft {
  horarioInicial: string;
  horarioFinal: string;
  descricao: string;
}

interface OutraMaoDeObraDraft {
  funcaoId: string;
  colaboradorId: string;
  quantidade: string;
}

interface MaterialCatalogo {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  precoUnitario: string | null;
}

interface MaterialDraft {
  materialCatalogoId: string;
  quantidade: string;
}

const CLIMA_OPCOES = ["SOL", "CHUVA", "NUBLADO"];

function novaAtividade(atividadesCatalogo: AtividadeCatalogo[]): AtividadeDraft {
  const primeira = atividadesCatalogo[0];
  return {
    atividadeCatalogoId: primeira?.id ?? "",
    ordemManutencaoId: "",
    unidade: primeira?.unidade ?? "UND",
    altura: "",
    largura: "",
    larguraFinal: "",
    comprimento: "",
    quantidadeDireta: "",
    horasTrabalhadas: "",
    maoObraDireta: "",
  };
}

function novoLocal(atividadesCatalogo: AtividadeCatalogo[]): LocalDraft {
  return {
    descricao: "",
    kmInicial: "",
    kmFinal: "",
    lado: "",
    atividades: [novaAtividade(atividadesCatalogo)],
  };
}

function minutosDoHorario(horario: string): number {
  const [horaStr, minutoStr] = horario.split(":");
  return Number(horaStr) * 60 + Number(minutoStr);
}

/** Soma os blocos de horário do dia (HH:mm) para exibir o "Tempo Total". */
function calcularTempoTotal(blocos: BlocoDraft[]): string {
  let minutos = 0;
  for (const bloco of blocos) {
    if (!bloco.horarioInicial || !bloco.horarioFinal) continue;
    const inicio = minutosDoHorario(bloco.horarioInicial);
    const fim = minutosDoHorario(bloco.horarioFinal);
    if (Number.isNaN(inicio) || Number.isNaN(fim)) continue;
    const diferenca = fim - inicio;
    if (diferenca > 0) minutos += diferenca;
  }
  const horas = Math.floor(minutos / 60);
  const min = minutos % 60;
  return `${horas}h${String(min).padStart(2, "0")}`;
}

export default function RdoCompleto(): ReactElement {
  const navigate = useNavigate();

  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [atividadesCatalogo, setAtividadesCatalogo] = useState<AtividadeCatalogo[]>([]);
  const [equipamentosCatalogo, setEquipamentosCatalogo] = useState<EquipamentoCatalogo[]>([]);
  const [materiaisCatalogo, setMateriaisCatalogo] = useState<MaterialCatalogo[]>([]);
  const [ordensManutencao, setOrdensManutencao] = useState<OrdemManutencao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  const [frenteId, setFrenteId] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [encarregadoId, setEncarregadoId] = useState("");
  const [clima, setClima] = useState("");
  const [totalDesvios, setTotalDesvios] = useState("");
  const [horaExtraInicio, setHoraExtraInicio] = useState("");
  const [horaExtraFim, setHoraExtraFim] = useState("");

  const [blocos, setBlocos] = useState<BlocoDraft[]>([{ horarioInicial: "", horarioFinal: "", descricao: "" }]);
  const [locais, setLocais] = useState<LocalDraft[]>([]);
  const [maoDeObra, setMaoDeObra] = useState<Record<string, string>>({});
  const [outrasMaoDeObra, setOutrasMaoDeObra] = useState<OutraMaoDeObraDraft[]>([]);
  const [equipamentos, setEquipamentos] = useState<Record<string, string>>({});
  const [materiais, setMateriais] = useState<MaterialDraft[]>([]);
  const [observacoes, setObservacoes] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  useEffect(() => {
    async function carregar(): Promise<void> {
      try {
        const [
          listaFrentes,
          listaEquipes,
          listaColaboradores,
          listaFuncoes,
          listaAtividades,
          listaEquipamentos,
          listaMateriais,
          listaOrdens,
        ] = await Promise.all([
          api.get<Frente[]>("/frentes"),
          api.get<Equipe[]>("/equipes"),
          api.get<Colaborador[]>("/colaboradores"),
          api.get<Funcao[]>("/funcoes"),
          api.get<AtividadeCatalogo[]>("/atividades"),
          api.get<EquipamentoCatalogo[]>("/equipamentos"),
          api.get<MaterialCatalogo[]>("/materiais"),
          api.get<OrdemManutencao[]>("/ordens-manutencao"),
        ]);
        setFrentes(listaFrentes);
        setEquipes(listaEquipes);
        setColaboradores(listaColaboradores);
        setFuncoes(listaFuncoes);
        setAtividadesCatalogo(listaAtividades);
        setEquipamentosCatalogo(listaEquipamentos);
        setMateriaisCatalogo(listaMateriais);
        setOrdensManutencao(listaOrdens);

        const primeiraFrente = listaFrentes[0]?.id ?? "";
        setFrenteId(primeiraFrente);
        setEquipeId(listaEquipes.find((equipe) => equipe.distrito.frenteId === primeiraFrente)?.id ?? "");
        setLocais([novoLocal(listaAtividades)]);
      } catch (error) {
        setErroCarga(error instanceof ApiError ? error.message : "Não foi possível carregar os dados de apoio.");
      } finally {
        setCarregando(false);
      }
    }

    void carregar();
  }, []);

  const frenteSelecionada = frentes.find((frente) => frente.id === frenteId) ?? null;
  const equipesDaFrente = equipes.filter((equipe) => equipe.distrito.frenteId === frenteId);
  const equipeSelecionada = equipes.find((equipe) => equipe.id === equipeId) ?? null;
  const ordensDaFrente = ordensManutencao.filter((ordem) => ordem.frenteId === frenteId);
  const tempoTotal = useMemo(() => calcularTempoTotal(blocos), [blocos]);

  function handleFrenteChange(novaFrenteId: string): void {
    setFrenteId(novaFrenteId);
    const primeiraEquipe = equipes.find((equipe) => equipe.distrito.frenteId === novaFrenteId);
    setEquipeId(primeiraEquipe?.id ?? "");
    setMaoDeObra({});
  }

  function atualizarBloco(indice: number, campo: keyof BlocoDraft, valor: string): void {
    setBlocos((atual) => atual.map((bloco, i) => (i === indice ? { ...bloco, [campo]: valor } : bloco)));
  }

  function atualizarLocal(indice: number, campo: keyof LocalDraft, valor: string): void {
    setLocais((atual) => atual.map((local, i) => (i === indice ? { ...local, [campo]: valor } : local)));
  }

  function atualizarAtividade(
    localIndice: number,
    atividadeIndice: number,
    campo: keyof AtividadeDraft,
    valor: string,
  ): void {
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice ? { ...atividade, [campo]: valor } : atividade,
          ),
        };
      }),
    );
  }

  function selecionarAtividadeCatalogo(localIndice: number, atividadeIndice: number, atividadeCatalogoId: string): void {
    const catalogo = atividadesCatalogo.find((a) => a.id === atividadeCatalogoId);
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice
              ? { ...atividade, atividadeCatalogoId, unidade: catalogo?.unidade ?? atividade.unidade }
              : atividade,
          ),
        };
      }),
    );
  }

  function adicionarOutraMaoDeObra(): void {
    setOutrasMaoDeObra((atual) => [
      ...atual,
      { funcaoId: funcoes[0]?.id ?? "", colaboradorId: colaboradores[0]?.id ?? "", quantidade: "1" },
    ]);
  }

  function atualizarOutraMaoDeObra(indice: number, campo: keyof OutraMaoDeObraDraft, valor: string): void {
    setOutrasMaoDeObra((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  }

  function adicionarMaterial(): void {
    setMateriais((atual) => [...atual, { materialCatalogoId: materiaisCatalogo[0]?.id ?? "", quantidade: "1" }]);
  }

  function atualizarMaterial(indice: number, campo: keyof MaterialDraft, valor: string): void {
    setMateriais((atual) => atual.map((material, i) => (i === indice ? { ...material, [campo]: valor } : material)));
  }

  async function handleSalvar(): Promise<void> {
    if (!frenteId || !equipeId) {
      setErroSalvar("Escolha a frente e a equipe antes de salvar.");
      return;
    }
    setSalvando(true);
    setErroSalvar(null);

    const payload = {
      frenteId,
      equipeId,
      data,
      clima: clima === "" ? null : clima,
      encarregadoId: encarregadoId === "" ? null : encarregadoId,
      totalDesvios: totalDesvios === "" ? null : Number(totalDesvios),
      horaExtraInicio: horaExtraInicio === "" ? null : horaExtraInicio,
      horaExtraFim: horaExtraFim === "" ? null : horaExtraFim,
      observacoesContratada: observacoes === "" ? null : observacoes,
      blocosHorario: blocos
        .filter((b) => b.horarioInicial && b.horarioFinal && b.descricao)
        .map((b, ordem) => ({ ...b, ordem })),
      locais: locais
        .filter((local) => local.descricao.trim() !== "" && local.atividades.length > 0)
        .map((local, ordem) => ({
          descricao: local.descricao,
          kmInicial: local.kmInicial === "" ? null : Number(local.kmInicial),
          kmFinal: local.kmFinal === "" ? null : Number(local.kmFinal),
          lado: local.lado || null,
          ordem,
          atividades: local.atividades.map((atividade) => ({
            atividadeCatalogoId: atividade.atividadeCatalogoId,
            ordemManutencaoId: atividade.ordemManutencaoId || null,
            unidade: atividade.unidade,
            altura: atividade.altura === "" ? null : Number(atividade.altura),
            largura: atividade.largura === "" ? null : Number(atividade.largura),
            larguraFinal: atividade.larguraFinal === "" ? null : Number(atividade.larguraFinal),
            comprimento: atividade.comprimento === "" ? null : Number(atividade.comprimento),
            quantidadeDireta: atividade.quantidadeDireta === "" ? null : Number(atividade.quantidadeDireta),
            horasTrabalhadas: atividade.horasTrabalhadas === "" ? null : Number(atividade.horasTrabalhadas),
            maoObraDireta: atividade.maoObraDireta === "" ? null : Number(atividade.maoObraDireta),
          })),
        })),
      maoDeObra: [
        ...(equipeSelecionada?.membros ?? [])
          .filter((membro) => Number(maoDeObra[membro.colaboradorId] ?? "0") > 0)
          .map((membro) => ({
            funcaoId: membro.funcaoId,
            colaboradorId: membro.colaboradorId,
            quantidade: Number(maoDeObra[membro.colaboradorId]),
          })),
        ...outrasMaoDeObra
          .filter((item) => item.funcaoId && Number(item.quantidade) > 0)
          .map((item) => ({
            funcaoId: item.funcaoId,
            colaboradorId: item.colaboradorId || null,
            quantidade: Number(item.quantidade),
          })),
      ],
      equipamentos: equipamentosCatalogo
        .filter((equipamento) => Number(equipamentos[equipamento.id] ?? "0") > 0)
        .map((equipamento) => ({ equipamentoCatalogoId: equipamento.id, quantidade: Number(equipamentos[equipamento.id]) })),
      materiais: materiais
        .filter((material) => material.materialCatalogoId !== "" && Number(material.quantidade) > 0)
        .map((material, ordem) => ({
          materialCatalogoId: material.materialCatalogoId,
          quantidade: Number(material.quantidade),
          ordem,
        })),
    };

    try {
      await api.post("/rdos/completo", payload);
      navigate("/rdos");
    } catch (error) {
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível salvar o RDO.");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="app-shell">
        <Nav />
        <div className="list-page">
          <p className="table-empty">Carregando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page form-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Cadastrar RDO completo</h1>
            <p className="list-subtitle">Preencha o RDO inteiro de uma vez, como no relatório em papel.</p>
          </div>
        </div>

        {erroCarga && <p className="feedback feedback--erro">{erroCarga}</p>}

        <section className="form-section">
          <h2 className="form-section-title">Identificação</h2>
          <p className="form-section-subtitle">Contratante: VALE S/A</p>
          <div className="grid-2">
            <div>
              <label className="field-label" htmlFor="frenteId">
                Frente / Distrito
              </label>
              <select
                id="frenteId"
                className="field-input"
                value={frenteId}
                onChange={(event) => handleFrenteChange(event.target.value)}
              >
                {frentes.map((frente) => (
                  <option key={frente.id} value={frente.id}>
                    {frente.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Contrato (nº SAP)</label>
              <p className="read-only-value">{frenteSelecionada?.contrato.numero ?? "—"}</p>
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label className="field-label" htmlFor="equipeId">
                Equipe
              </label>
              <select
                id="equipeId"
                className="field-input"
                value={equipeId}
                onChange={(event) => setEquipeId(event.target.value)}
              >
                {equipesDaFrente.length === 0 && <option value="">Nenhuma equipe cadastrada para esta frente</option>}
                {equipesDaFrente.map((equipe) => (
                  <option key={equipe.id} value={equipe.id}>
                    {equipe.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="data">
                Data
              </label>
              <input
                id="data"
                type="date"
                className="field-input"
                value={data}
                onChange={(event) => setData(event.target.value)}
              />
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label className="field-label" htmlFor="encarregadoId">
                Encarregado
              </label>
              <select
                id="encarregadoId"
                className="field-input"
                value={encarregadoId}
                onChange={(event) => setEncarregadoId(event.target.value)}
              >
                <option value="">Nenhum</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Clima</label>
              <select className="field-input" value={clima} onChange={(event) => setClima(event.target.value)}>
                <option value="">Não informado</option>
                {CLIMA_OPCOES.map((opcao) => (
                  <option key={opcao} value={opcao}>
                    {opcao}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid-3">
            <div>
              <label className="field-label">Total de desvios</label>
              <input
                type="number"
                min={0}
                className="field-input"
                value={totalDesvios}
                onChange={(event) => setTotalDesvios(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label">Hora extra</label>
              <div className="grid-2">
                <input
                  type="time"
                  className="field-input"
                  value={horaExtraInicio}
                  onChange={(event) => setHoraExtraInicio(event.target.value)}
                />
                <input
                  type="time"
                  className="field-input"
                  value={horaExtraFim}
                  onChange={(event) => setHoraExtraFim(event.target.value)}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="list-header">
            <h2 className="form-section-title">Linha do tempo do dia</h2>
            <span className="section-total">Tempo total: {tempoTotal}</span>
          </div>
          {blocos.map((bloco, indice) => (
            <div className="repeatable-item" key={indice}>
              <div className="grid-2">
                <input
                  type="time"
                  className="field-input"
                  value={bloco.horarioInicial}
                  onChange={(event) => atualizarBloco(indice, "horarioInicial", event.target.value)}
                />
                <input
                  type="time"
                  className="field-input"
                  value={bloco.horarioFinal}
                  onChange={(event) => atualizarBloco(indice, "horarioFinal", event.target.value)}
                />
              </div>
              <input
                className="field-input"
                placeholder="Ex.: Deslocamento para o Km 767+520"
                value={bloco.descricao}
                onChange={(event) => atualizarBloco(indice, "descricao", event.target.value)}
                style={{ marginTop: 8 }}
              />
              <button
                type="button"
                className="button button--ghost button--small"
                style={{ marginTop: 8 }}
                onClick={() => setBlocos((atual) => atual.filter((_, i) => i !== indice))}
              >
                Remover bloco
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setBlocos((atual) => [...atual, { horarioInicial: "", horarioFinal: "", descricao: "" }])}
          >
            + Adicionar bloco de horário
          </button>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Atividades realizadas</h2>
          {locais.map((local, localIndice) => (
            <div className="repeatable-item" key={localIndice}>
              <label className="field-label">Descrição / trecho</label>
              <input
                className="field-input"
                placeholder="Ex.: Km 767+520 ao 770+480"
                value={local.descricao}
                onChange={(event) => atualizarLocal(localIndice, "descricao", event.target.value)}
              />

              <div className="grid-3" style={{ marginTop: 8 }}>
                <div>
                  <label className="field-label">Lado</label>
                  <input
                    className="field-input"
                    placeholder="LE / LD"
                    value={local.lado}
                    onChange={(event) => atualizarLocal(localIndice, "lado", event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Km inicial</label>
                  <input
                    type="number"
                    step="0.001"
                    className="field-input"
                    value={local.kmInicial}
                    onChange={(event) => atualizarLocal(localIndice, "kmInicial", event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Km final</label>
                  <input
                    type="number"
                    step="0.001"
                    className="field-input"
                    value={local.kmFinal}
                    onChange={(event) => atualizarLocal(localIndice, "kmFinal", event.target.value)}
                  />
                </div>
              </div>

              <h3 className="field-label" style={{ marginTop: 16 }}>
                Atividades neste local
              </h3>
              {local.atividades.map((atividade, atividadeIndice) => {
                const usaDimensoes = ["M", "M2", "M3"].includes(atividade.unidade);
                const catalogoDaAtividade = atividadesCatalogo.find((item) => item.id === atividade.atividadeCatalogoId);
                const idSelect = `atividade-${localIndice}-${atividadeIndice}`;
                return (
                  <div className="repeatable-item" key={atividadeIndice}>
                  <div className="repeatable-item-header">
                    <span className="repeatable-item-titulo">
                      Atividade {atividadeIndice + 1}
                      {atividade.unidade && <span className="badge badge--inativo">{atividade.unidade}</span>}
                    </span>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      onClick={() =>
                        setLocais((atual) =>
                          atual.map((l, i) =>
                            i === localIndice
                              ? { ...l, atividades: l.atividades.filter((_, j) => j !== atividadeIndice) }
                              : l,
                          ),
                        )
                      }
                    >
                      Remover atividade
                    </button>
                  </div>

                  <div className={usaDimensoes ? "atividade-com-croqui" : undefined}>
                  <div>
                    <label className="field-label" htmlFor={idSelect}>
                      Atividade
                    </label>
                    <select
                      id={idSelect}
                      className="field-input"
                      value={atividade.atividadeCatalogoId}
                      onChange={(event) => selecionarAtividadeCatalogo(localIndice, atividadeIndice, event.target.value)}
                    >
                      {atividadesCatalogo.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.codigo} — {item.descricao}
                        </option>
                      ))}
                    </select>

                    <div style={{ marginTop: 12 }}>
                      <label className="field-label">Ordem de manutenção</label>
                      <Autocomplete
                        value={atividade.ordemManutencaoId}
                        items={ordensDaFrente}
                        getLabel={(om) => om.numero}
                        getSublabel={(om) => om.detalhes}
                        placeholder="Digite o número da OM…"
                        onChange={(ordemManutencaoId) =>
                          atualizarAtividade(localIndice, atividadeIndice, "ordemManutencaoId", ordemManutencaoId)
                        }
                      />
                    </div>

                    {atividade.unidade === "M3" && (
                      <div className="grid-3" style={{ marginTop: 12 }}>
                        <div>
                          <label className="field-label">Altura (m)</label>
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="0,00"
                            value={atividade.altura}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "altura", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Largura (m)</label>
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="0,00"
                            value={atividade.largura}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "largura", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Comprimento (m)</label>
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="0,00"
                            value={atividade.comprimento}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "comprimento", event.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {atividade.unidade === "M2" && (
                      <div className="grid-3" style={{ marginTop: 12 }}>
                        <div>
                          <label className="field-label">Largura inicial (m)</label>
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="0,00"
                            value={atividade.largura}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "largura", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Largura final (m) — opcional</label>
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="se afunilar/alargar"
                            value={atividade.larguraFinal}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "larguraFinal", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Comprimento (m)</label>
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="0,00"
                            value={atividade.comprimento}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "comprimento", event.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {atividade.unidade === "M" && (
                      <div style={{ marginTop: 12 }}>
                        <label className="field-label">Comprimento (m)</label>
                        <input
                          type="number"
                          step="0.001"
                          className="field-input"
                          placeholder="0,00"
                          value={atividade.comprimento}
                          onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "comprimento", event.target.value)}
                        />
                      </div>
                    )}

                    {!usaDimensoes && (
                      <div style={{ marginTop: 12 }}>
                        <label className="field-label">Quantidade</label>
                        <input
                          type="number"
                          step="0.001"
                          className="field-input"
                          placeholder="0,00"
                          value={atividade.quantidadeDireta}
                          onChange={(event) =>
                            atualizarAtividade(localIndice, atividadeIndice, "quantidadeDireta", event.target.value)
                          }
                        />
                      </div>
                    )}

                    <div className="grid-2" style={{ marginTop: 12 }}>
                      <div>
                        <label className="field-label">Mão de obra nesta atividade</label>
                        <input
                          type="number"
                          step="1"
                          min={0}
                          className="field-input"
                          placeholder="efetivo do RDO, se vazio"
                          value={atividade.maoObraDireta}
                          onChange={(event) =>
                            atualizarAtividade(localIndice, atividadeIndice, "maoObraDireta", event.target.value)
                          }
                        />
                      </div>
                      <div>
                        <label className="field-label">Horas trabalhadas nesta atividade</label>
                        <input
                          type="number"
                          step="0.5"
                          min={0}
                          className="field-input"
                          placeholder="jornada dividida, se vazio"
                          value={atividade.horasTrabalhadas}
                          onChange={(event) =>
                            atualizarAtividade(localIndice, atividadeIndice, "horasTrabalhadas", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {usaDimensoes && (
                    <CroquiAtividade
                      unidade={atividade.unidade}
                      altura={atividade.altura}
                      largura={atividade.largura}
                      larguraFinal={atividade.larguraFinal}
                      comprimento={atividade.comprimento}
                      descricaoAtividade={catalogoDaAtividade?.descricao}
                    />
                  )}
                  </div>
                  </div>
                );
              })}
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() =>
                  setLocais((atual) =>
                    atual.map((l, i) =>
                      i === localIndice ? { ...l, atividades: [...l.atividades, novaAtividade(atividadesCatalogo)] } : l,
                    ),
                  )
                }
              >
                + Adicionar atividade
              </button>{" "}
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setLocais((atual) => atual.filter((_, i) => i !== localIndice))}
              >
                Remover local
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button--secondary button--small"
            onClick={() => setLocais((atual) => [...atual, novoLocal(atividadesCatalogo)])}
          >
            + Adicionar local
          </button>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Mão de obra</h2>
          {!equipeSelecionada || equipeSelecionada.membros.length === 0 ? (
            <p className="table-empty">Esta equipe ainda não tem membros cadastrados.</p>
          ) : (
            equipeSelecionada.membros.map((membro) => (
              <div className="checklist-row" key={membro.id}>
                <span>
                  {membro.colaborador.nome} — {membro.funcao.nome}
                </span>
                <input
                  type="number"
                  min={0}
                  className="field-input qty-input"
                  value={maoDeObra[membro.colaboradorId] ?? "0"}
                  onChange={(event) => setMaoDeObra((atual) => ({ ...atual, [membro.colaboradorId]: event.target.value }))}
                />
              </div>
            ))
          )}

          {outrasMaoDeObra.map((item, indice) => (
            <div className="membro-add-row" key={indice}>
              <select
                className="field-input"
                value={item.funcaoId}
                onChange={(event) => atualizarOutraMaoDeObra(indice, "funcaoId", event.target.value)}
              >
                {funcoes.map((funcao) => (
                  <option key={funcao.id} value={funcao.id}>
                    {funcao.nome}
                  </option>
                ))}
              </select>
              <select
                className="field-input"
                value={item.colaboradorId}
                onChange={(event) => atualizarOutraMaoDeObra(indice, "colaboradorId", event.target.value)}
              >
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                className="field-input"
                value={item.quantidade}
                onChange={(event) => atualizarOutraMaoDeObra(indice, "quantidade", event.target.value)}
              />
              <button
                type="button"
                className="button button--ghost button--small"
                onClick={() => setOutrasMaoDeObra((atual) => atual.filter((_, i) => i !== indice))}
              >
                Remover
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button button--secondary button--small"
            style={{ marginTop: 12 }}
            onClick={adicionarOutraMaoDeObra}
          >
            + Adicionar função avulsa (mão de obra indireta)
          </button>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Equipamentos / outros custos indiretos</h2>
          {equipamentosCatalogo.map((equipamento) => (
            <div className="checklist-row" key={equipamento.id}>
              <span>{equipamento.nome}</span>
              <input
                type="number"
                min={0}
                className="field-input qty-input"
                value={equipamentos[equipamento.id] ?? "0"}
                onChange={(event) => setEquipamentos((atual) => ({ ...atual, [equipamento.id]: event.target.value }))}
              />
            </div>
          ))}
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Materiais</h2>
          <p className="form-section-subtitle">Catálogo oficial do contrato (Price List), com preço unitário</p>
          {materiais.map((material, indice) => {
            const catalogoDoMaterial = materiaisCatalogo.find((item) => item.id === material.materialCatalogoId);
            return (
              <div className="material-row" key={indice}>
                <Autocomplete
                  value={material.materialCatalogoId}
                  items={materiaisCatalogo}
                  getLabel={(item) => `${item.descricao} (${item.unidade})`}
                  placeholder="Digite o nome do material…"
                  onChange={(materialCatalogoId) => atualizarMaterial(indice, "materialCatalogoId", materialCatalogoId)}
                />
                <input
                  type="number"
                  step="0.001"
                  min={0}
                  className="field-input"
                  placeholder="Qtd."
                  value={material.quantidade}
                  onChange={(event) => atualizarMaterial(indice, "quantidade", event.target.value)}
                />
                <span className="section-total">
                  {catalogoDoMaterial?.precoUnitario != null
                    ? `R$ ${(Number(catalogoDoMaterial.precoUnitario) * Number(material.quantidade || 0)).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`
                    : ""}
                </span>
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => setMateriais((atual) => atual.filter((_, i) => i !== indice))}
                >
                  Remover
                </button>
              </div>
            );
          })}
          <button type="button" className="button button--secondary button--small" style={{ marginTop: 12 }} onClick={adicionarMaterial}>
            + Adicionar material
          </button>
        </section>

        <section className="form-section">
          <h2 className="form-section-title">Observações da contratada</h2>
          <textarea
            className="field-input"
            rows={4}
            value={observacoes}
            onChange={(event) => setObservacoes(event.target.value)}
            placeholder="Atrasos, ocorrências, justificativas..."
          />
        </section>

        {erroSalvar && <p className="feedback feedback--erro">{erroSalvar}</p>}

        <div className="form-actions">
          <button type="button" className="button" disabled={salvando} onClick={() => void handleSalvar()}>
            {salvando ? "Salvando…" : "Salvar RDO"}
          </button>
          <button type="button" className="button button--secondary" onClick={() => navigate("/rdos")}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
