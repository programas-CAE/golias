import { useEffect, useState, type ChangeEvent, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";

interface Ref {
  id: string;
  nome: string;
}

interface ColaboradorRef extends Ref {}
interface FuncaoRef extends Ref {}
interface EquipamentoRef extends Ref {}

interface EquipeMembro {
  id: string;
  colaborador: ColaboradorRef;
  funcao: FuncaoRef;
  quantidade: number;
}

interface AtividadeCatalogo {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  usaDimensoes: boolean;
}

interface OrdemManutencaoRef {
  id: string;
  numero: string;
}

interface RdoAnexo {
  id: string;
  tipo: string;
  nomeOriginal: string;
  tamanhoBytes: number;
}

interface RdoAtividadeSalva {
  atividadeCatalogoId: string;
  altura: string | null;
  largura: string | null;
  comprimento: string | null;
  quantidadeDireta: string | null;
  unidade: string;
}

interface RdoLocalSalvo {
  descricao: string;
  ordemManutencaoId: string | null;
  kmInicial: string | null;
  kmFinal: string | null;
  lado: string | null;
  atividades: RdoAtividadeSalva[];
}

interface RdoBlocoSalvo {
  horarioInicial: string;
  horarioFinal: string;
  descricao: string;
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

interface RdoMaterialSalvo {
  nome: string;
  unidade: string | null;
  quantidade: string;
}

interface Rdo {
  id: string;
  frente: Ref;
  equipe: { id: string; nome: string; membros: EquipeMembro[] };
  data: string;
  status: string;
  clima: string | null;
  horaExtraInicio: string | null;
  horaExtraFim: string | null;
  totalDesvios: number | null;
  temperaturaMedia: string | null;
  observacoesContratada: string | null;
  blocosHorario: RdoBlocoSalvo[];
  locais: RdoLocalSalvo[];
  maoDeObra: RdoMaoDeObraSalva[];
  equipamentos: RdoEquipamentoSalvo[];
  materiais: RdoMaterialSalvo[];
  anexos: RdoAnexo[];
}

interface CampoResponse {
  rdo: Rdo;
  ordensManutencao: OrdemManutencaoRef[];
  atividadesCatalogo: AtividadeCatalogo[];
}

interface AtividadeDraft {
  atividadeCatalogoId: string;
  unidade: string;
  altura: string;
  largura: string;
  comprimento: string;
  quantidadeDireta: string;
}

interface LocalDraft {
  descricao: string;
  ordemManutencaoId: string;
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

interface MaterialDraft {
  nome: string;
  unidade: string;
  quantidade: string;
}

function novaAtividade(atividadesCatalogo: AtividadeCatalogo[]): AtividadeDraft {
  const primeira = atividadesCatalogo[0];
  return {
    atividadeCatalogoId: primeira?.id ?? "",
    unidade: primeira?.unidade ?? "UND",
    altura: "",
    largura: "",
    comprimento: "",
    quantidadeDireta: "",
  };
}

function novoLocal(atividadesCatalogo: AtividadeCatalogo[]): LocalDraft {
  return {
    descricao: "",
    ordemManutencaoId: "",
    kmInicial: "",
    kmFinal: "",
    lado: "",
    atividades: [novaAtividade(atividadesCatalogo)],
  };
}

export default function Campo(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<{ status: number; mensagem: string } | null>(null);
  const [dados, setDados] = useState<CampoResponse | null>(null);
  const [equipamentosCatalogo, setEquipamentosCatalogo] = useState<EquipamentoRef[]>([]);
  const [anexos, setAnexos] = useState<RdoAnexo[]>([]);

  const [clima, setClima] = useState<string>("");
  const [horaExtraInicio, setHoraExtraInicio] = useState("");
  const [horaExtraFim, setHoraExtraFim] = useState("");
  const [totalDesvios, setTotalDesvios] = useState("");
  const [temperaturaMedia, setTemperaturaMedia] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [blocos, setBlocos] = useState<BlocoDraft[]>([]);
  const [materiais, setMateriais] = useState<MaterialDraft[]>([]);
  const [locais, setLocais] = useState<LocalDraft[]>([]);
  const [maoDeObra, setMaoDeObra] = useState<Record<string, string>>({});
  // Registros de mão de obra salvos que não correspondem a nenhum membro
  // atual da equipe (ex.: colaboradorId nulo — contagem só por função) — a
  // grade abaixo só edita membros da equipe, então preservamos esses à parte
  // para reenviá-los intactos, em vez de perdê-los no próximo salvamento.
  const [outrasMaoDeObra, setOutrasMaoDeObra] = useState<RdoMaoDeObraSalva[]>([]);
  const [equipamentos, setEquipamentos] = useState<Record<string, string>>({});

  const [salvando, setSalvando] = useState(false);
  const [salvarStatus, setSalvarStatus] = useState<"idle" | "salvo" | "erro">("idle");
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    async function carregar(): Promise<void> {
      try {
        const [resposta, listaEquipamentos] = await Promise.all([
          api.get<CampoResponse>(`/rdos/campo/${token}`),
          api.get<EquipamentoRef[]>("/equipamentos"),
        ]);
        setDados(resposta);
        setEquipamentosCatalogo(listaEquipamentos);
        setAnexos(resposta.rdo.anexos);

        setClima(resposta.rdo.clima ?? "");
        setHoraExtraInicio(resposta.rdo.horaExtraInicio ?? "");
        setHoraExtraFim(resposta.rdo.horaExtraFim ?? "");
        setTotalDesvios(resposta.rdo.totalDesvios != null ? String(resposta.rdo.totalDesvios) : "");
        setTemperaturaMedia(resposta.rdo.temperaturaMedia ?? "");
        setObservacoes(resposta.rdo.observacoesContratada ?? "");
        setMateriais(
          resposta.rdo.materiais.map((material) => ({
            nome: material.nome,
            unidade: material.unidade ?? "",
            quantidade: material.quantidade,
          })),
        );
        setBlocos(
          resposta.rdo.blocosHorario.length > 0
            ? resposta.rdo.blocosHorario.map((b) => ({ ...b }))
            : [{ horarioInicial: "", horarioFinal: "", descricao: "" }],
        );
        setLocais(
          resposta.rdo.locais.length > 0
            ? resposta.rdo.locais.map((local) => ({
                descricao: local.descricao,
                ordemManutencaoId: local.ordemManutencaoId ?? "",
                kmInicial: local.kmInicial ?? "",
                kmFinal: local.kmFinal ?? "",
                lado: local.lado ?? "",
                atividades: local.atividades.map((atividade) => ({
                  atividadeCatalogoId: atividade.atividadeCatalogoId,
                  unidade: atividade.unidade,
                  altura: atividade.altura ?? "",
                  largura: atividade.largura ?? "",
                  comprimento: atividade.comprimento ?? "",
                  quantidadeDireta: atividade.quantidadeDireta ?? "",
                })),
              }))
            : [novoLocal(resposta.atividadesCatalogo)],
        );
        const membroIds = new Set(resposta.rdo.equipe.membros.map((membro) => membro.colaborador.id));
        setMaoDeObra(
          Object.fromEntries(
            resposta.rdo.maoDeObra
              .filter((mdo) => mdo.colaboradorId != null && membroIds.has(mdo.colaboradorId))
              .map((mdo) => [mdo.colaboradorId as string, String(mdo.quantidade)]),
          ),
        );
        setOutrasMaoDeObra(
          resposta.rdo.maoDeObra.filter((mdo) => mdo.colaboradorId == null || !membroIds.has(mdo.colaboradorId)),
        );
        setEquipamentos(
          Object.fromEntries(resposta.rdo.equipamentos.map((eq) => [eq.equipamentoCatalogoId, String(eq.quantidade)])),
        );
      } catch (error) {
        if (error instanceof ApiError) {
          setErroCarga({ status: error.status, mensagem: error.message });
        } else {
          setErroCarga({ status: 0, mensagem: "Não foi possível carregar o RDO. Verifique sua conexão." });
        }
      } finally {
        setCarregando(false);
      }
    }

    void carregar();
  }, [token]);

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
    const catalogo = dados?.atividadesCatalogo.find((a) => a.id === atividadeCatalogoId);
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

  function adicionarMaterial(): void {
    setMateriais((atual) => [...atual, { nome: "", unidade: "", quantidade: "1" }]);
  }

  function atualizarMaterial(indice: number, campo: keyof MaterialDraft, valor: string): void {
    setMateriais((atual) => atual.map((material, i) => (i === indice ? { ...material, [campo]: valor } : material)));
  }

  async function handleUploadFoto(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const arquivo = event.target.files?.[0];
    event.target.value = "";
    if (!arquivo || !token) return;

    const form = new FormData();
    form.append("arquivo", arquivo);
    try {
      const anexo = await api.postForm<RdoAnexo>(`/rdos/campo/${token}/anexos?tipo=FOTO`, form);
      setAnexos((atual) => [...atual, anexo]);
    } catch (error) {
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível enviar a foto.");
    }
  }

  async function handleSalvar(): Promise<void> {
    if (!token) return;
    setSalvando(true);
    setSalvarStatus("idle");
    setErroSalvar(null);

    const payload = {
      clima: clima === "" ? null : clima,
      horaExtraInicio: horaExtraInicio === "" ? null : horaExtraInicio,
      horaExtraFim: horaExtraFim === "" ? null : horaExtraFim,
      totalDesvios: totalDesvios === "" ? null : Number(totalDesvios),
      temperaturaMedia: temperaturaMedia === "" ? null : Number(temperaturaMedia),
      observacoesContratada: observacoes === "" ? null : observacoes,
      blocosHorario: blocos
        .filter((b) => b.horarioInicial && b.horarioFinal && b.descricao)
        .map((b, ordem) => ({ ...b, ordem })),
      locais: locais
        .filter((local) => local.descricao.trim() !== "" && local.atividades.length > 0)
        .map((local, ordem) => ({
          descricao: local.descricao,
          ordemManutencaoId: local.ordemManutencaoId || null,
          kmInicial: local.kmInicial === "" ? null : Number(local.kmInicial),
          kmFinal: local.kmFinal === "" ? null : Number(local.kmFinal),
          lado: local.lado || null,
          ordem,
          atividades: local.atividades.map((atividade) => ({
            atividadeCatalogoId: atividade.atividadeCatalogoId,
            unidade: atividade.unidade,
            altura: atividade.altura === "" ? null : Number(atividade.altura),
            largura: atividade.largura === "" ? null : Number(atividade.largura),
            comprimento: atividade.comprimento === "" ? null : Number(atividade.comprimento),
            quantidadeDireta: atividade.quantidadeDireta === "" ? null : Number(atividade.quantidadeDireta),
          })),
        })),
      maoDeObra: [
        ...(dados?.rdo.equipe.membros ?? [])
          .filter((membro) => Number(maoDeObra[membro.colaborador.id] ?? "0") > 0)
          .map((membro) => ({
            funcaoId: membro.funcao.id,
            colaboradorId: membro.colaborador.id,
            quantidade: Number(maoDeObra[membro.colaborador.id]),
          })),
        ...outrasMaoDeObra,
      ],
      equipamentos: equipamentosCatalogo
        .filter((equipamento) => Number(equipamentos[equipamento.id] ?? "0") > 0)
        .map((equipamento) => ({ equipamentoCatalogoId: equipamento.id, quantidade: Number(equipamentos[equipamento.id]) })),
      materiais: materiais
        .filter((material) => material.nome.trim() !== "" && Number(material.quantidade) > 0)
        .map((material, ordem) => ({
          nome: material.nome,
          unidade: material.unidade === "" ? null : material.unidade,
          quantidade: Number(material.quantidade),
          ordem,
        })),
    };

    try {
      await api.patch(`/rdos/campo/${token}`, payload);
      setSalvarStatus("salvo");
    } catch (error) {
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível salvar o RDO.");
      setSalvarStatus("erro");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return (
      <div className="campo-page">
        <p className="loading-text">Carregando RDO…</p>
      </div>
    );
  }

  if (erroCarga || !dados) {
    return (
      <div className="campo-page">
        <div className="campo-card">
          <h1>GOLIAS</h1>
          <p className="subtitle">
            {erroCarga?.status === 410 ? "Link expirado" : erroCarga?.status === 404 ? "Link inválido" : "Erro"}
          </p>
          <p className="description">{erroCarga?.mensagem ?? "Não foi possível carregar este RDO."}</p>
        </div>
      </div>
    );
  }

  const { rdo, atividadesCatalogo, ordensManutencao } = dados;

  return (
    <div className="campo-page">
      <div className="campo-header">
        <h1>RDO — {rdo.frente.nome}</h1>
        <p>
          Equipe {rdo.equipe.nome} · {rdo.data.slice(0, 10)}
        </p>
      </div>

      <section className="campo-secao">
        <h2>Clima e horário</h2>
        <div className="campo-radios">
          {["SOL", "CHUVA", "NUBLADO"].map((valor) => (
            <label key={valor} className="campo-radio">
              <input type="radio" name="clima" checked={clima === valor} onChange={() => setClima(valor)} />
              {valor}
            </label>
          ))}
        </div>
        <div className="campo-grid-2">
          <div>
            <label className="field-label">Hora extra — início</label>
            <input
              type="time"
              className="field-input"
              value={horaExtraInicio}
              onChange={(event) => setHoraExtraInicio(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Hora extra — fim</label>
            <input
              type="time"
              className="field-input"
              value={horaExtraFim}
              onChange={(event) => setHoraExtraFim(event.target.value)}
            />
          </div>
        </div>
        <div className="campo-grid-2">
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
            <label className="field-label">Temperatura média (°C)</label>
            <input
              type="number"
              step="0.1"
              className="field-input"
              value={temperaturaMedia}
              onChange={(event) => setTemperaturaMedia(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="campo-secao">
        <h2>Linha do tempo do dia</h2>
        {blocos.map((bloco, indice) => (
          <div className="campo-item" key={indice}>
            <div className="campo-grid-2">
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
            />
            <button
              type="button"
              className="button button--ghost button--small"
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

      <section className="campo-secao">
        <h2>Locais trabalhados</h2>
        {locais.map((local, localIndice) => (
          <div className="campo-item" key={localIndice}>
            <label className="field-label">Descrição / trecho</label>
            <input
              className="field-input"
              placeholder="Ex.: Km 767+520 ao 770+480"
              value={local.descricao}
              onChange={(event) => atualizarLocal(localIndice, "descricao", event.target.value)}
            />

            <label className="field-label">Ordem de manutenção (opcional)</label>
            <select
              className="field-input"
              value={local.ordemManutencaoId}
              onChange={(event) => atualizarLocal(localIndice, "ordemManutencaoId", event.target.value)}
            >
              <option value="">Nenhuma</option>
              {ordensManutencao.map((om) => (
                <option key={om.id} value={om.id}>
                  {om.numero}
                </option>
              ))}
            </select>

            <div className="campo-grid-3">
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
              <div>
                <label className="field-label">Lado</label>
                <input
                  className="field-input"
                  placeholder="LE / LD"
                  value={local.lado}
                  onChange={(event) => atualizarLocal(localIndice, "lado", event.target.value)}
                />
              </div>
            </div>

            <h3 className="campo-subtitulo">Atividades neste local</h3>
            {local.atividades.map((atividade, atividadeIndice) => {
              const usaDimensoes = ["M", "M2", "M3"].includes(atividade.unidade);
              return (
                <div className="campo-atividade" key={atividadeIndice}>
                  <select
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

                  {usaDimensoes ? (
                    <div className="campo-grid-3">
                      {atividade.unidade === "M3" && (
                        <input
                          type="number"
                          step="0.001"
                          className="field-input"
                          placeholder="Altura"
                          value={atividade.altura}
                          onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "altura", event.target.value)}
                        />
                      )}
                      {(atividade.unidade === "M2" || atividade.unidade === "M3") && (
                        <input
                          type="number"
                          step="0.001"
                          className="field-input"
                          placeholder="Largura"
                          value={atividade.largura}
                          onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "largura", event.target.value)}
                        />
                      )}
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Comprimento"
                        value={atividade.comprimento}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "comprimento", event.target.value)}
                      />
                    </div>
                  ) : (
                    <input
                      type="number"
                      step="0.001"
                      className="field-input"
                      placeholder="Quantidade"
                      value={atividade.quantidadeDireta}
                      onChange={(event) =>
                        atualizarAtividade(localIndice, atividadeIndice, "quantidadeDireta", event.target.value)
                      }
                    />
                  )}
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
            </button>
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

      <section className="campo-secao">
        <h2>Mão de obra</h2>
        {rdo.equipe.membros.length === 0 ? (
          <p className="loading-text">Esta equipe ainda não tem membros cadastrados.</p>
        ) : (
          rdo.equipe.membros.map((membro) => (
            <div className="campo-checklist-row" key={membro.id}>
              <span>
                {membro.colaborador.nome} — {membro.funcao.nome}
              </span>
              <input
                type="number"
                min={0}
                className="field-input campo-qtd"
                value={maoDeObra[membro.colaborador.id] ?? "0"}
                onChange={(event) =>
                  setMaoDeObra((atual) => ({ ...atual, [membro.colaborador.id]: event.target.value }))
                }
              />
            </div>
          ))
        )}
      </section>

      <section className="campo-secao">
        <h2>Equipamentos / outros custos indiretos</h2>
        {equipamentosCatalogo.map((equipamento) => (
          <div className="campo-checklist-row" key={equipamento.id}>
            <span>{equipamento.nome}</span>
            <input
              type="number"
              min={0}
              className="field-input campo-qtd"
              value={equipamentos[equipamento.id] ?? "0"}
              onChange={(event) => setEquipamentos((atual) => ({ ...atual, [equipamento.id]: event.target.value }))}
            />
          </div>
        ))}
      </section>

      <section className="campo-secao">
        <h2>Materiais utilizados</h2>
        {materiais.map((material, indice) => (
          <div className="campo-item" key={indice}>
            <input
              className="field-input"
              placeholder="Nome do material"
              value={material.nome}
              onChange={(event) => atualizarMaterial(indice, "nome", event.target.value)}
            />
            <div className="campo-grid-2">
              <input
                className="field-input"
                placeholder="Unidade (saco, m³, litro...)"
                value={material.unidade}
                onChange={(event) => atualizarMaterial(indice, "unidade", event.target.value)}
              />
              <input
                type="number"
                step="0.001"
                min={0}
                className="field-input"
                placeholder="Quantidade"
                value={material.quantidade}
                onChange={(event) => atualizarMaterial(indice, "quantidade", event.target.value)}
              />
            </div>
            <button
              type="button"
              className="button button--ghost button--small"
              onClick={() => setMateriais((atual) => atual.filter((_, i) => i !== indice))}
            >
              Remover material
            </button>
          </div>
        ))}
        <button type="button" className="button button--secondary button--small" onClick={adicionarMaterial}>
          + Adicionar material
        </button>
      </section>

      <section className="campo-secao">
        <h2>Fotos</h2>
        <input type="file" accept="image/*" capture="environment" onChange={(event) => void handleUploadFoto(event)} />
        <ul className="campo-anexos-lista">
          {anexos.map((anexo) => (
            <li key={anexo.id}>
              {anexo.nomeOriginal} ({Math.round(anexo.tamanhoBytes / 1024)} KB)
            </li>
          ))}
        </ul>
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

      {erroSalvar && <p className="feedback feedback--erro">{erroSalvar}</p>}
      {salvarStatus === "salvo" && <p className="feedback feedback--ok">RDO salvo com sucesso.</p>}

      <div className="campo-acoes">
        <button type="button" className="button" disabled={salvando} onClick={() => void handleSalvar()}>
          {salvando ? "Salvando…" : "Salvar RDO"}
        </button>
      </div>
    </div>
  );
}
