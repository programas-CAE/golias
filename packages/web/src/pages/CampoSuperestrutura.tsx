import { useEffect, useRef, useState, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";
import AssinaturaCanvas, { type AssinaturaCanvasHandle } from "../components/AssinaturaCanvas";

/**
 * Lançamento de campo do RDO tipo SUPERESTRUTURA (manutenção de via férrea)
 * — sibling de Campo.tsx (Preventiva/Corretiva/Terraplenagem), aberta pelo
 * mesmo mecanismo de linkCampoToken, só que com o formulário do papel
 * próprio dessa equipe: temperatura por hora, intervalos, serviços por
 * código/linha/km em vez de local+OM.
 */

interface Ref {
  id: string;
  nome: string;
}

interface RdoSuperestruturaSalva {
  intervaloProgramadoInicio: string | null;
  intervaloProgramadoFim: string | null;
  intervaloRealizadoInicio: string | null;
  intervaloRealizadoFim: string | null;
  tempoTotalPerdas: string | null;
  leiturasTemperatura: { hora: string; temperaturaC: string | null; ordem: number }[];
  servicos: {
    id: string;
    codigo: string | null;
    descricao: string;
    unidade: string | null;
    quantidade: string | null;
    linha: string | null;
    kmInicial: string | null;
    kmFinal: string | null;
    ordem: number;
  }[];
}

interface RdoMaoDeObraSalva {
  funcaoId: string;
  colaboradorId: string | null;
  quantidade: number;
}

interface RdoEquipamentoSalvo {
  equipamentoCatalogoId: string;
  quantidade: number;
}

interface MaterialCatalogoRef {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
}

interface RdoMaterialSalvo {
  materialCatalogoId: string;
  quantidade: string;
}

interface Rdo {
  id: string;
  tipo: string;
  frente: Ref;
  equipe: { id: string; nome: string };
  data: string;
  status: string;
  observacoesContratada: string | null;
  maoDeObra: RdoMaoDeObraSalva[];
  equipamentos: RdoEquipamentoSalvo[];
  materiais: RdoMaterialSalvo[];
  superestrutura: RdoSuperestruturaSalva | null;
}

interface CampoResponse {
  rdo: Rdo;
  atividadesCatalogo: unknown[];
}

interface TemperaturaDraft {
  hora: string;
  temperaturaC: string;
}

interface ServicoDraft {
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: string;
  linha: string;
  kmInicial: string;
  kmFinal: string;
}

function novoServico(): ServicoDraft {
  return { codigo: "", descricao: "", unidade: "", quantidade: "", linha: "", kmInicial: "", kmFinal: "" };
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "Aguardando validação do escritório",
  AGUARDANDO_APROVACAO: "Aguardando aprovação do fiscal",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export default function CampoSuperestrutura(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  const [dados, setDados] = useState<CampoResponse | null>(null);
  const [equipamentosCatalogo, setEquipamentosCatalogo] = useState<Ref[]>([]);
  const [materiaisCatalogo, setMateriaisCatalogo] = useState<MaterialCatalogoRef[]>([]);
  const [funcoes, setFuncoes] = useState<Ref[]>([]);

  const [temperaturas, setTemperaturas] = useState<TemperaturaDraft[]>([]);
  const [intervaloProgramadoInicio, setIntervaloProgramadoInicio] = useState("");
  const [intervaloProgramadoFim, setIntervaloProgramadoFim] = useState("");
  const [intervaloRealizadoInicio, setIntervaloRealizadoInicio] = useState("");
  const [intervaloRealizadoFim, setIntervaloRealizadoFim] = useState("");
  const [tempoTotalPerdas, setTempoTotalPerdas] = useState("");
  const [servicos, setServicos] = useState<ServicoDraft[]>([novoServico()]);
  const [maoDeObra, setMaoDeObra] = useState<Record<string, string>>({});
  const [equipamentos, setEquipamentos] = useState<{ equipamentoCatalogoId: string; quantidade: string }[]>([]);
  const [materiais, setMateriais] = useState<{ materialCatalogoId: string; quantidade: string }[]>([]);
  const [observacoes, setObservacoes] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [salvarStatus, setSalvarStatus] = useState<"idle" | "salvo" | "erro">("idle");
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  const [mostrandoAssinatura, setMostrandoAssinatura] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [erroFinalizar, setErroFinalizar] = useState<string | null>(null);
  const assinaturaRef = useRef<AssinaturaCanvasHandle>(null);

  useEffect(() => {
    if (!token) return;
    async function carregar(): Promise<void> {
      try {
        const [resposta, listaEquipamentos, listaMateriais, listaFuncoes] = await Promise.all([
          api.get<CampoResponse>(`/rdos/campo/${token}`),
          api.get<Ref[]>("/equipamentos"),
          api.get<MaterialCatalogoRef[]>("/materiais"),
          api.get<Ref[]>("/funcoes"),
        ]);
        setDados(resposta);
        setEquipamentosCatalogo(listaEquipamentos);
        setMateriaisCatalogo(listaMateriais);
        setFuncoes(listaFuncoes);

        const se = resposta.rdo.superestrutura;
        setIntervaloProgramadoInicio(se?.intervaloProgramadoInicio ?? "");
        setIntervaloProgramadoFim(se?.intervaloProgramadoFim ?? "");
        setIntervaloRealizadoInicio(se?.intervaloRealizadoInicio ?? "");
        setIntervaloRealizadoFim(se?.intervaloRealizadoFim ?? "");
        setTempoTotalPerdas(se?.tempoTotalPerdas ?? "");
        setTemperaturas(
          (se?.leiturasTemperatura ?? []).map((l) => ({ hora: l.hora, temperaturaC: l.temperaturaC ?? "" })),
        );
        setServicos(
          se && se.servicos.length > 0
            ? se.servicos.map((s) => ({
                codigo: s.codigo ?? "",
                descricao: s.descricao,
                unidade: s.unidade ?? "",
                quantidade: s.quantidade ?? "",
                linha: s.linha ?? "",
                kmInicial: s.kmInicial ?? "",
                kmFinal: s.kmFinal ?? "",
              }))
            : [novoServico()],
        );
        setEquipamentos(
          resposta.rdo.equipamentos.map((item) => ({
            equipamentoCatalogoId: item.equipamentoCatalogoId,
            quantidade: String(item.quantidade),
          })),
        );
        setMateriais(resposta.rdo.materiais.map((item) => ({ materialCatalogoId: item.materialCatalogoId, quantidade: item.quantidade })));
        setObservacoes(resposta.rdo.observacoesContratada ?? "");

        const maoDeObraMapa: Record<string, string> = {};
        for (const item of resposta.rdo.maoDeObra) {
          if (!item.colaboradorId) maoDeObraMapa[item.funcaoId] = String(item.quantidade);
        }
        setMaoDeObra(maoDeObraMapa);
      } catch (error) {
        setErroCarga(error instanceof ApiError ? error.message : "Não foi possível carregar o RDO.");
      } finally {
        setCarregando(false);
      }
    }
    void carregar();
  }, [token]);

  function atualizarTemperatura(indice: number, campo: keyof TemperaturaDraft, valor: string): void {
    setTemperaturas((atual) => atual.map((t, i) => (i === indice ? { ...t, [campo]: valor } : t)));
  }

  function atualizarServico(indice: number, campo: keyof ServicoDraft, valor: string): void {
    setServicos((atual) => atual.map((s, i) => (i === indice ? { ...s, [campo]: valor } : s)));
  }

  function atualizarEquipamento(indice: number, campo: "equipamentoCatalogoId" | "quantidade", valor: string): void {
    setEquipamentos((atual) => atual.map((e, i) => (i === indice ? { ...e, [campo]: valor } : e)));
  }

  function atualizarMaterial(indice: number, campo: "materialCatalogoId" | "quantidade", valor: string): void {
    setMateriais((atual) => atual.map((m, i) => (i === indice ? { ...m, [campo]: valor } : m)));
  }

  function montarPayload() {
    return {
      horaExtraInicio: null,
      horaExtraFim: null,
      clima: null,
      totalDesvios: null,
      observacoesContratada: observacoes || null,
      locais: [],
      blocosHorario: [],
      maoDeObra: Object.entries(maoDeObra)
        .filter(([, quantidade]) => Number(quantidade) > 0)
        .map(([funcaoId, quantidade]) => ({ funcaoId, colaboradorId: null, quantidade: Number(quantidade) })),
      equipamentos: equipamentos
        .filter((item) => item.equipamentoCatalogoId)
        .map((item) => ({ equipamentoCatalogoId: item.equipamentoCatalogoId, quantidade: Number(item.quantidade) || 1 })),
      materiais: materiais
        .filter((item) => item.materialCatalogoId && Number(item.quantidade) > 0)
        .map((item) => ({ materialCatalogoId: item.materialCatalogoId, quantidade: Number(item.quantidade) })),
      superestrutura: {
        intervaloProgramadoInicio: intervaloProgramadoInicio || null,
        intervaloProgramadoFim: intervaloProgramadoFim || null,
        intervaloRealizadoInicio: intervaloRealizadoInicio || null,
        intervaloRealizadoFim: intervaloRealizadoFim || null,
        tempoTotalPerdas: tempoTotalPerdas || null,
        leiturasTemperatura: temperaturas
          .filter((t) => t.hora)
          .map((t, indice) => ({ hora: t.hora, temperaturaC: t.temperaturaC === "" ? null : Number(t.temperaturaC), ordem: indice })),
        servicos: servicos
          .filter((s) => s.descricao.trim())
          .map((s, indice) => ({
            codigo: s.codigo || null,
            descricao: s.descricao.trim(),
            unidade: s.unidade || null,
            quantidade: s.quantidade === "" ? null : Number(s.quantidade),
            linha: s.linha || null,
            kmInicial: s.kmInicial === "" ? null : Number(s.kmInicial),
            kmFinal: s.kmFinal === "" ? null : Number(s.kmFinal),
            ordem: indice,
          })),
      },
    };
  }

  async function salvar(): Promise<void> {
    if (!token) return;
    setSalvando(true);
    setErroSalvar(null);
    try {
      await api.patch(`/rdos/campo/${token}`, montarPayload());
      setSalvarStatus("salvo");
      setTimeout(() => setSalvarStatus("idle"), 2000);
    } catch (error) {
      setSalvarStatus("erro");
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  async function finalizar(): Promise<void> {
    if (!token) return;
    setErroFinalizar(null);
    const blob = await assinaturaRef.current?.exportarPng();
    if (!blob) {
      setErroFinalizar("Desenhe a assinatura antes de confirmar.");
      return;
    }
    setFinalizando(true);
    try {
      await api.patch(`/rdos/campo/${token}`, montarPayload());
      const form = new FormData();
      form.append("assinatura", blob, "assinatura.png");
      await api.postForm(`/rdos/campo/${token}/enviar`, form);
      setMostrandoAssinatura(false);
      const resposta = await api.get<CampoResponse>(`/rdos/campo/${token}`);
      setDados(resposta);
    } catch (error) {
      setErroFinalizar(error instanceof ApiError ? error.message : "Não foi possível enviar o RDO.");
    } finally {
      setFinalizando(false);
    }
  }

  if (carregando) {
    return (
      <div className="placeholder-page">
        <p className="loading-text">Carregando…</p>
      </div>
    );
  }

  if (erroCarga || !dados) {
    return (
      <div className="placeholder-page">
        <div className="placeholder-card">
          <h1>GOLIAS</h1>
          <p className="description">{erroCarga ?? "Link inválido."}</p>
        </div>
      </div>
    );
  }

  const { rdo } = dados;
  const podeEditar = rdo.status === "RASCUNHO" || rdo.status === "EM_CORRECAO";

  return (
    <div className="campo-page">
      <div className="campo-brand">
        <p className="campo-brand-title">GOLIAS</p>
        <p className="campo-brand-subtitle">Gestão de contratos</p>
      </div>
      <div className="campo-card" style={{ maxWidth: 860 }}>
        <h1>RDO Superestrutura — {rdo.equipe.nome}</h1>
        <p className="subtitle">
          {rdo.frente.nome} · {rdo.data.slice(0, 10)} ·{" "}
          <span className="badge badge--ativo">{STATUS_LABEL[rdo.status] ?? rdo.status}</span>
        </p>

        {!podeEditar && (
          <p className="feedback feedback--ok">
            Este RDO já foi enviado ({STATUS_LABEL[rdo.status] ?? rdo.status}) — não dá mais pra editar por aqui.
          </p>
        )}

        {podeEditar && (
          <>
            <section className="campo-secao">
              <h2>Temperatura / Hora</h2>
              {temperaturas.map((t, indice) => (
                <div className="campo-item" key={indice}>
                  <input
                    type="time"
                    className="field-input"
                    value={t.hora}
                    onChange={(event) => atualizarTemperatura(indice, "hora", event.target.value)}
                  />
                  <input
                    type="number"
                    step="0.1"
                    className="field-input"
                    placeholder="°C"
                    value={t.temperaturaC}
                    onChange={(event) => atualizarTemperatura(indice, "temperaturaC", event.target.value)}
                  />
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => setTemperaturas((atual) => atual.filter((_, i) => i !== indice))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => setTemperaturas((atual) => [...atual, { hora: "", temperaturaC: "" }])}
              >
                + Adicionar leitura
              </button>
            </section>

            <section className="campo-secao">
              <h2>Intervalos</h2>
              <div className="campo-grid-3">
                <div>
                  <label className="field-label">Programado — início</label>
                  <input
                    type="time"
                    className="field-input"
                    value={intervaloProgramadoInicio}
                    onChange={(event) => setIntervaloProgramadoInicio(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Programado — fim</label>
                  <input
                    type="time"
                    className="field-input"
                    value={intervaloProgramadoFim}
                    onChange={(event) => setIntervaloProgramadoFim(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Tempo total por perdas</label>
                  <input
                    className="field-input"
                    placeholder="ex.: 00:15"
                    value={tempoTotalPerdas}
                    onChange={(event) => setTempoTotalPerdas(event.target.value)}
                  />
                </div>
              </div>
              <div className="campo-grid-3" style={{ marginTop: 8 }}>
                <div>
                  <label className="field-label">Realizado — início</label>
                  <input
                    type="time"
                    className="field-input"
                    value={intervaloRealizadoInicio}
                    onChange={(event) => setIntervaloRealizadoInicio(event.target.value)}
                  />
                </div>
                <div>
                  <label className="field-label">Realizado — fim</label>
                  <input
                    type="time"
                    className="field-input"
                    value={intervaloRealizadoFim}
                    onChange={(event) => setIntervaloRealizadoFim(event.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="campo-secao">
              <h2>Efetivo</h2>
              {funcoes.map((funcao) => (
                <div className="campo-item" key={funcao.id}>
                  <span style={{ flex: 1 }}>{funcao.nome}</span>
                  <input
                    type="number"
                    min={0}
                    className="field-input campo-qtd"
                    value={maoDeObra[funcao.id] ?? ""}
                    onChange={(event) => setMaoDeObra((atual) => ({ ...atual, [funcao.id]: event.target.value }))}
                  />
                </div>
              ))}
            </section>

            <section className="campo-secao">
              <h2>Equipamentos</h2>
              {equipamentos.map((item, indice) => (
                <div className="campo-item" key={indice}>
                  <select
                    className="field-input"
                    value={item.equipamentoCatalogoId}
                    onChange={(event) => atualizarEquipamento(indice, "equipamentoCatalogoId", event.target.value)}
                  >
                    <option value="">Selecione o equipamento…</option>
                    {equipamentosCatalogo.map((eq) => (
                      <option key={eq.id} value={eq.id}>
                        {eq.nome}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={1}
                    className="field-input campo-qtd"
                    value={item.quantidade}
                    onChange={(event) => atualizarEquipamento(indice, "quantidade", event.target.value)}
                  />
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => setEquipamentos((atual) => atual.filter((_, i) => i !== indice))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => setEquipamentos((atual) => [...atual, { equipamentoCatalogoId: "", quantidade: "1" }])}
              >
                + Adicionar equipamento
              </button>
            </section>

            <section className="campo-secao">
              <h2>Materiais utilizados</h2>
              {materiais.map((item, indice) => (
                <div className="campo-item" key={indice}>
                  <select
                    className="field-input"
                    value={item.materialCatalogoId}
                    onChange={(event) => atualizarMaterial(indice, "materialCatalogoId", event.target.value)}
                  >
                    <option value="">Selecione o material…</option>
                    {materiaisCatalogo.map((mat) => (
                      <option key={mat.id} value={mat.id}>
                        {mat.descricao} ({mat.unidade})
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.001"
                    min={0}
                    className="field-input"
                    placeholder="Quantidade"
                    value={item.quantidade}
                    onChange={(event) => atualizarMaterial(indice, "quantidade", event.target.value)}
                  />
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => setMateriais((atual) => atual.filter((_, i) => i !== indice))}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() => setMateriais((atual) => [...atual, { materialCatalogoId: "", quantidade: "" }])}
              >
                + Adicionar material
              </button>
            </section>

            <section className="campo-secao">
              <h2>Serviços executados</h2>
              {servicos.map((servico, indice) => (
                <div key={indice} style={{ border: "1px solid #dbe8de", borderRadius: 10, padding: 12, marginBottom: 10 }}>
                  <input
                    className="field-input"
                    placeholder="Descrição do serviço"
                    value={servico.descricao}
                    onChange={(event) => atualizarServico(indice, "descricao", event.target.value)}
                    style={{ marginBottom: 8 }}
                  />
                  <div className="campo-grid-3">
                    <input
                      className="field-input"
                      placeholder="Código (opcional)"
                      value={servico.codigo}
                      onChange={(event) => atualizarServico(indice, "codigo", event.target.value)}
                    />
                    <input
                      className="field-input"
                      placeholder="Unidade"
                      value={servico.unidade}
                      onChange={(event) => atualizarServico(indice, "unidade", event.target.value)}
                    />
                    <input
                      type="number"
                      step="0.001"
                      className="field-input"
                      placeholder="Quantidade"
                      value={servico.quantidade}
                      onChange={(event) => atualizarServico(indice, "quantidade", event.target.value)}
                    />
                  </div>
                  <div className="campo-grid-3" style={{ marginTop: 8 }}>
                    <input
                      className="field-input"
                      placeholder="Linha"
                      value={servico.linha}
                      onChange={(event) => atualizarServico(indice, "linha", event.target.value)}
                    />
                    <input
                      type="number"
                      step="0.001"
                      className="field-input"
                      placeholder="Km inicial"
                      value={servico.kmInicial}
                      onChange={(event) => atualizarServico(indice, "kmInicial", event.target.value)}
                    />
                    <input
                      type="number"
                      step="0.001"
                      className="field-input"
                      placeholder="Km final"
                      value={servico.kmFinal}
                      onChange={(event) => atualizarServico(indice, "kmFinal", event.target.value)}
                    />
                  </div>
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    style={{ marginTop: 8 }}
                    onClick={() => setServicos((atual) => atual.filter((_, i) => i !== indice))}
                  >
                    Remover serviço
                  </button>
                </div>
              ))}
              <button type="button" className="button button--secondary button--small" onClick={() => setServicos((atual) => [...atual, novoServico()])}>
                + Adicionar serviço
              </button>
            </section>

            <section className="campo-secao">
              <h2>Observações</h2>
              <textarea
                className="field-input campo-textarea"
                value={observacoes}
                onChange={(event) => setObservacoes(event.target.value)}
                placeholder="Observações da contratada (atrasos, ocorrências, etc.)"
              />
            </section>

            <div className="campo-acoes">
              <button type="button" className="button button--secondary" disabled={salvando} onClick={() => void salvar()}>
                {salvando ? "Salvando…" : "Salvar rascunho"}
              </button>
              <button type="button" className="button" onClick={() => setMostrandoAssinatura(true)}>
                Finalizar e enviar
              </button>
            </div>
            {salvarStatus === "salvo" && <p className="feedback feedback--ok">Salvo!</p>}
            {erroSalvar && <p className="feedback feedback--erro">{erroSalvar}</p>}

            {mostrandoAssinatura && (
              <div style={{ marginTop: 16 }}>
                <label className="field-label">Assinatura</label>
                <AssinaturaCanvas ref={assinaturaRef} />
                {erroFinalizar && <p className="feedback feedback--erro">{erroFinalizar}</p>}
                <div className="campo-acoes" style={{ marginTop: 12 }}>
                  <button type="button" className="button" disabled={finalizando} onClick={() => void finalizar()}>
                    {finalizando ? "Enviando…" : "Confirmar e enviar"}
                  </button>
                  <button type="button" className="button button--secondary" onClick={() => setMostrandoAssinatura(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
