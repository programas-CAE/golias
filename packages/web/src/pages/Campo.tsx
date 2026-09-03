import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { useParams } from "react-router-dom";
import { API_URL, ApiError, api } from "../lib/apiClient";
import Autocomplete from "../components/Autocomplete";
import AssinaturaCanvas, { type AssinaturaCanvasHandle } from "../components/AssinaturaCanvas";
import CroquiAtividade from "../components/CroquiAtividade";

interface Ref {
  id: string;
  nome: string;
}

interface ColaboradorRef extends Ref {}
interface FuncaoRef extends Ref {}
interface EquipamentoRef extends Ref {}

interface EquipeMembro {
  id: string;
  colaborador: ColaboradorRef | null;
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
  detalhes?: string | null;
  kmInicial?: string | null;
  kmFinal?: string | null;
  // Fotos "Antes"/"Depois" já lançadas em OUTROS RDOs pra essa OM (uma OM
  // pode ser trabalhada em vários dias até fechar) — somado com as fotos
  // ao vivo deste RDO (estado `anexos`) dá o total real, pro mínimo de 2+2.
  fotosAntesOutrosRdos?: number;
  fotosDepoisOutrosRdos?: number;
}

interface RdoAnexo {
  id: string;
  tipo: string;
  nomeOriginal: string;
  tamanhoBytes: number;
  // A OM que o encarregado marcou ao mandar a foto — null pra foto geral do
  // dia (não veio de nenhuma OM específica). Usada pra agrupar a galeria
  // aqui e, mais pra frente, no PDF do RDO e no Relatório Fotográfico da OM.
  ordemManutencaoId: string | null;
  ordemManutencao: { id: string; numero: string } | null;
  // "Antes"/"Depois", igual ao Relatório Fotográfico da OM (que reaproveita
  // esse texto como legenda quando puxa essa foto automaticamente).
  descricao: string | null;
}

const LEGENDA_FOTO_OPCOES = ["", "Antes", "Depois"] as const;

interface RdoAtividadeMaoDeObraSalva {
  funcaoId: string;
  funcao: FuncaoRef;
  quantidade: number;
}

interface RdoAtividadePontoSalvo {
  altura: string | null;
  largura: string | null;
  larguraFinal: string | null;
  comprimento: string | null;
  quantidadeDireta: string | null;
}

interface RdoAtividadeSalva {
  atividadeCatalogoId: string;
  ordemManutencaoId: string | null;
  statusOm: string | null;
  percentualConcluido: number | null;
  kmInicial: string | null;
  kmFinal: string | null;
  altura: string | null;
  largura: string | null;
  larguraFinal: string | null;
  comprimento: string | null;
  quantidadeDireta: string | null;
  horarioInicial: string | null;
  horarioFinal: string | null;
  horasTrabalhadas: string | null;
  maoDeObra: RdoAtividadeMaoDeObraSalva[];
  unidade: string;
  pontosExtras: RdoAtividadePontoSalvo[];
}

interface RdoLocalSalvo {
  descricao: string;
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
  producaoDescricao: string | null;
  producaoValor: string | null;
  producaoUnidade: string | null;
  horimetroInicial: string | null;
  horimetroFinal: string | null;
}

interface MaterialCatalogoRef {
  id: string;
  codigo: string;
  descricao: string;
  unidade: string;
  precoUnitario: string | null;
}

interface RdoMaterialSalvo {
  materialCatalogoId: string;
  materialCatalogo: MaterialCatalogoRef;
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
  observacoesContratada: string | null;
  blocosHorario: RdoBlocoSalvo[];
  locais: RdoLocalSalvo[];
  maoDeObra: RdoMaoDeObraSalva[];
  equipamentos: RdoEquipamentoSalvo[];
  materiais: RdoMaterialSalvo[];
  anexos: RdoAnexo[];
}

interface UltimaReprovacao {
  comentarioReprovacao: string | null;
  assinanteNome: string | null;
  assinadoEm: string | null;
}

interface CampoResponse {
  rdo: Rdo;
  ordensManutencao: OrdemManutencaoRef[];
  atividadesCatalogo: AtividadeCatalogo[];
  ultimaReprovacao: UltimaReprovacao | null;
  // Última leitura de horímetro (final) de cada equipamento, do RDO
  // anterior mais recente dessa mesma equipe — chave é equipamentoCatalogoId.
  ultimosHorimetros: Record<string, number>;
}

interface AtividadeMaoDeObraDraft {
  funcaoId: string;
  quantidade: string;
}

/** Ponto de medição extra da atividade (Ponto 2, 3...) — mesma atividade/OM, outro trecho medido no mesmo dia. */
interface PontoExtraDraft {
  altura: string;
  largura: string;
  larguraFinal: string;
  comprimento: string;
  quantidadeDireta: string;
}

function novoPontoExtra(): PontoExtraDraft {
  return { altura: "", largura: "", larguraFinal: "", comprimento: "", quantidadeDireta: "" };
}

interface AtividadeDraft {
  atividadeCatalogoId: string;
  ordemManutencaoId: string;
  statusOm: string;
  percentualConcluido: string;
  unidade: string;
  kmInicial: string;
  kmFinal: string;
  altura: string;
  largura: string;
  larguraFinal: string;
  comprimento: string;
  quantidadeDireta: string;
  horarioInicial: string;
  horarioFinal: string;
  horasTrabalhadas: string;
  maoDeObra: AtividadeMaoDeObraDraft[];
  pontosExtras: PontoExtraDraft[];
}

interface LocalDraft {
  descricao: string;
  lado: string;
  atividades: AtividadeDraft[];
}

interface BlocoDraft {
  horarioInicial: string;
  horarioFinal: string;
  descricao: string;
}

interface MaterialDraft {
  materialCatalogoId: string;
  quantidade: string;
}

// Detalhe de produção/horímetro de um item da checklist de equipamentos —
// escondido por padrão (só a quantidade aparece direto), porque só faz
// sentido pra máquina de verdade (terraplenagem), não pra item de
// checklist comum tipo Tenda/Banheiro Químico.
interface EquipamentoDetalhe {
  producaoDescricao: string;
  producaoValor: string;
  producaoUnidade: string;
  horimetroInicial: string;
  horimetroFinal: string;
}

function detalheVazio(): EquipamentoDetalhe {
  return { producaoDescricao: "", producaoValor: "", producaoUnidade: "", horimetroInicial: "", horimetroFinal: "" };
}

function novaAtividade(atividadesCatalogo: AtividadeCatalogo[]): AtividadeDraft {
  const primeira = atividadesCatalogo[0];
  return {
    atividadeCatalogoId: primeira?.id ?? "",
    ordemManutencaoId: "",
    statusOm: "",
    percentualConcluido: "",
    unidade: primeira?.unidade ?? "UND",
    kmInicial: "",
    kmFinal: "",
    altura: "",
    largura: "",
    larguraFinal: "",
    comprimento: "",
    quantidadeDireta: "",
    horarioInicial: "",
    horarioFinal: "",
    horasTrabalhadas: "",
    maoDeObra: [],
    pontosExtras: [],
  };
}

function novoLocal(atividadesCatalogo: AtividadeCatalogo[]): LocalDraft {
  return {
    descricao: "",
    lado: "",
    atividades: [novaAtividade(atividadesCatalogo)],
  };
}

function minutosDoHorario(horario: string): number {
  const [horaStr, minutoStr] = horario.split(":");
  return Number(horaStr) * 60 + Number(minutoStr);
}

/** Duração em horas (fim − início), ou null se algum dos dois estiver vazio/inválido. */
function duracaoEmHoras(inicial: string, final: string): number | null {
  if (!inicial || !final) return null;
  const minutos = minutosDoHorario(final) - minutosDoHorario(inicial);
  return minutos > 0 ? minutos / 60 : null;
}

/**
 * Fecha o dia somando a "Linha do tempo" com o horário de cada atividade —
 * pra bater com a jornada real (ex.: 07:00 às 17:00 = 10h), sinalizando se
 * sobrou hora não apontada em nenhum bloco/atividade.
 */
function calcularHorasApontadasDia(blocos: BlocoDraft[], locais: LocalDraft[]): number {
  let minutos = 0;
  for (const bloco of blocos) {
    if (!bloco.horarioInicial || !bloco.horarioFinal) continue;
    const diferenca = minutosDoHorario(bloco.horarioFinal) - minutosDoHorario(bloco.horarioInicial);
    if (diferenca > 0) minutos += diferenca;
  }
  for (const local of locais) {
    for (const atividade of local.atividades) {
      if (!atividade.horarioInicial || !atividade.horarioFinal) continue;
      const diferenca = minutosDoHorario(atividade.horarioFinal) - minutosDoHorario(atividade.horarioInicial);
      if (diferenca > 0) minutos += diferenca;
    }
  }
  return minutos / 60;
}

function formatarHoras(horas: number): string {
  const totalMinutos = Math.round(horas * 60);
  const h = Math.floor(totalMinutos / 60);
  const min = totalMinutos % 60;
  return `${h}h${String(min).padStart(2, "0")}`;
}

/** Jornada de referência pra o fechamento do dia (07:00 às 17:00) — não bloqueia o salvamento, só avisa. */
const JORNADA_REFERENCIA_HORAS = 10;

const RDO_EDITAVEL = new Set(["RASCUNHO", "EM_CORRECAO", "REPROVADO"]);
const STATUS_MENSAGEM: Record<string, string> = {
  AGUARDANDO_VALIDACAO_ESCRITORIO: "RDO assinado — aguardando o escritório revisar e enviar para o fiscal.",
  AGUARDANDO_APROVACAO: "RDO enviado — aguardando o fiscal assinar ou reprovar.",
  APROVADO: "RDO aprovado e assinado pelo fiscal.",
  EM_CORRECAO: "RDO em correção — salve e envie novamente para o fiscal.",
};

export default function Campo(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<{ status: number; mensagem: string } | null>(null);
  const [dados, setDados] = useState<CampoResponse | null>(null);
  const [equipamentosCatalogo, setEquipamentosCatalogo] = useState<EquipamentoRef[]>([]);
  const [materiaisCatalogo, setMateriaisCatalogo] = useState<MaterialCatalogoRef[]>([]);
  const [funcoes, setFuncoes] = useState<FuncaoRef[]>([]);
  const [anexos, setAnexos] = useState<RdoAnexo[]>([]);
  const [omFotoSelecionada, setOmFotoSelecionada] = useState("");
  const [legendaFotoSelecionada, setLegendaFotoSelecionada] = useState("");
  const [enviandoFoto, setEnviandoFoto] = useState(false);

  const [clima, setClima] = useState<string>("");
  const [horaExtraInicio, setHoraExtraInicio] = useState("");
  const [horaExtraFim, setHoraExtraFim] = useState("");
  const [totalDesvios, setTotalDesvios] = useState("");
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
  // Checklist fixa — todo item do catálogo aparece direto, só com a
  // quantidade (padrão antigo, que o usuário pediu de volta); produção/
  // horímetro fica escondido por item até clicar em "+ Produção/horímetro".
  const [equipamentosQtd, setEquipamentosQtd] = useState<Record<string, string>>({});
  const [equipamentosDetalhe, setEquipamentosDetalhe] = useState<Record<string, EquipamentoDetalhe>>({});
  const [equipamentosDetalheAberto, setEquipamentosDetalheAberto] = useState<Record<string, boolean>>({});

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
          api.get<EquipamentoRef[]>("/equipamentos"),
          api.get<MaterialCatalogoRef[]>("/materiais"),
          api.get<FuncaoRef[]>("/funcoes"),
        ]);
        setDados(resposta);
        setEquipamentosCatalogo(listaEquipamentos);
        setMateriaisCatalogo(listaMateriais);
        setFuncoes(listaFuncoes);
        setAnexos(resposta.rdo.anexos);

        setClima(resposta.rdo.clima ?? "");
        setHoraExtraInicio(resposta.rdo.horaExtraInicio ?? "");
        setHoraExtraFim(resposta.rdo.horaExtraFim ?? "");
        setTotalDesvios(resposta.rdo.totalDesvios != null ? String(resposta.rdo.totalDesvios) : "");
        setObservacoes(resposta.rdo.observacoesContratada ?? "");
        setMateriais(
          resposta.rdo.materiais.map((material) => ({
            materialCatalogoId: material.materialCatalogoId,
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
                lado: local.lado ?? "",
                atividades: local.atividades.map((atividade) => ({
                  atividadeCatalogoId: atividade.atividadeCatalogoId,
                  ordemManutencaoId: atividade.ordemManutencaoId ?? "",
                  statusOm: atividade.statusOm ?? "",
                  percentualConcluido: atividade.percentualConcluido != null ? String(atividade.percentualConcluido) : "",
                  kmInicial: atividade.kmInicial ?? "",
                  kmFinal: atividade.kmFinal ?? "",
                  unidade: atividade.unidade,
                  altura: atividade.altura ?? "",
                  largura: atividade.largura ?? "",
                  larguraFinal: atividade.larguraFinal ?? "",
                  comprimento: atividade.comprimento ?? "",
                  quantidadeDireta: atividade.quantidadeDireta ?? "",
                  horarioInicial: atividade.horarioInicial ?? "",
                  horarioFinal: atividade.horarioFinal ?? "",
                  horasTrabalhadas: atividade.horasTrabalhadas ?? "",
                  maoDeObra: atividade.maoDeObra.map((item) => ({
                    funcaoId: item.funcaoId,
                    quantidade: String(item.quantidade),
                  })),
                  pontosExtras: atividade.pontosExtras.map((ponto) => ({
                    altura: ponto.altura ?? "",
                    largura: ponto.largura ?? "",
                    larguraFinal: ponto.larguraFinal ?? "",
                    comprimento: ponto.comprimento ?? "",
                    quantidadeDireta: ponto.quantidadeDireta ?? "",
                  })),
                })),
              }))
            : [novoLocal(resposta.atividadesCatalogo)],
        );
        // RdoMaoDeObra não guarda o id do EquipeMembro, só funcaoId/
        // colaboradorId — reconstituímos o vínculo pra achar qual membro
        // (nomeado, por colaboradorId, ou só-função, por funcaoId) cada
        // registro salvo representa.
        function encontrarMembro(mdo: { colaboradorId: string | null; funcaoId: string }): EquipeMembro | undefined {
          return resposta.rdo.equipe.membros.find((membro) =>
            mdo.colaboradorId != null
              ? membro.colaborador?.id === mdo.colaboradorId
              : membro.funcao.id === mdo.funcaoId && !membro.colaborador,
          );
        }
        const paresMaoDeObra = resposta.rdo.maoDeObra.map((mdo) => ({ mdo, membro: encontrarMembro(mdo) }));
        setMaoDeObra(
          Object.fromEntries(
            paresMaoDeObra
              .filter((par): par is { mdo: (typeof paresMaoDeObra)[number]["mdo"]; membro: EquipeMembro } => par.membro != null)
              .map((par) => [par.membro.id, String(par.mdo.quantidade)]),
          ),
        );
        setOutrasMaoDeObra(paresMaoDeObra.filter((par) => par.membro == null).map((par) => par.mdo));
        setEquipamentosQtd(
          Object.fromEntries(resposta.rdo.equipamentos.map((eq) => [eq.equipamentoCatalogoId, String(eq.quantidade)])),
        );
        setEquipamentosDetalhe(
          Object.fromEntries(
            resposta.rdo.equipamentos.map((eq) => [
              eq.equipamentoCatalogoId,
              {
                producaoDescricao: eq.producaoDescricao ?? "",
                producaoValor: eq.producaoValor ?? "",
                producaoUnidade: eq.producaoUnidade ?? "",
                horimetroInicial: eq.horimetroInicial ?? "",
                horimetroFinal: eq.horimetroFinal ?? "",
              },
            ]),
          ),
        );
        // Já abre o detalhe de quem carregou com produção/horímetro
        // preenchidos — senão o dado fica escondido atrás do "+".
        setEquipamentosDetalheAberto(
          Object.fromEntries(
            resposta.rdo.equipamentos
              .filter(
                (eq) =>
                  eq.producaoDescricao || eq.producaoValor != null || eq.horimetroInicial != null || eq.horimetroFinal != null,
              )
              .map((eq) => [eq.equipamentoCatalogoId, true]),
          ),
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

  const horasApontadasDia = useMemo(() => calcularHorasApontadasDia(blocos, locais), [blocos, locais]);

  // OMs já usadas em alguma atividade lançada neste RDO — é dessa lista que
  // o seletor de "foto pra qual OM" abaixo é montado, pra bater com o que já
  // está sendo apontado no dia (não precisa digitar/achar a OM de novo).
  const omsUsadasNoRdo = useMemo(() => {
    const idsUsados = new Set(
      locais.flatMap((local) => local.atividades.map((atividade) => atividade.ordemManutencaoId)).filter(Boolean),
    );
    return (dados?.ordensManutencao ?? []).filter((om) => idsUsados.has(om.id));
  }, [locais, dados?.ordensManutencao]);

  // Sinaliza, antes de finalizar, toda OM lançada neste RDO que ainda não
  // "fechou": ou o status não foi marcado como Concluída, ou foi marcado
  // mas ainda não tem o mínimo de 2 fotos "Antes" + 2 "Depois" (contagem ao
  // vivo: fotos de outros RDOs + as já anexadas nesta sessão). Não bloqueia
  // o envio — só avisa, pra não esquecer nada na hora de enviar.
  const pendenciasOm = useMemo(() => {
    if (!dados) return [];
    const mapaOm = new Map(dados.ordensManutencao.map((om) => [om.id, om]));
    const statusPorOm = new Map<string, string[]>();
    for (const local of locais) {
      for (const atividade of local.atividades) {
        if (!atividade.ordemManutencaoId) continue;
        const atual = statusPorOm.get(atividade.ordemManutencaoId) ?? [];
        atual.push(atividade.statusOm);
        statusPorOm.set(atividade.ordemManutencaoId, atual);
      }
    }

    const pendencias: { omId: string; omNumero: string; motivos: string[] }[] = [];
    for (const [omId, statuses] of statusPorOm) {
      const om = mapaOm.get(omId);
      if (!om) continue;
      const motivos: string[] = [];
      if (!statuses.includes("CONCLUIDA")) {
        motivos.push("Status ainda não marcado como Concluída");
      } else {
        const antes = (om.fotosAntesOutrosRdos ?? 0) + anexos.filter((a) => a.ordemManutencaoId === omId && a.descricao === "Antes").length;
        const depois = (om.fotosDepoisOutrosRdos ?? 0) + anexos.filter((a) => a.ordemManutencaoId === omId && a.descricao === "Depois").length;
        if (antes < 2) motivos.push(`Faltam fotos "Antes" (${antes} de 2)`);
        if (depois < 2) motivos.push(`Faltam fotos "Depois" (${depois} de 2)`);
      }
      if (motivos.length > 0) {
        pendencias.push({ omId, omNumero: om.numero, motivos });
      }
    }
    return pendencias;
  }, [locais, dados, anexos]);

  const anexosPorOm = useMemo(() => {
    const grupos = new Map<string, { omNumero: string | null; fotos: RdoAnexo[] }>();
    for (const anexo of anexos) {
      if (anexo.tipo !== "FOTO") continue;
      const chave = anexo.ordemManutencaoId ?? "__geral__";
      if (!grupos.has(chave)) {
        grupos.set(chave, { omNumero: anexo.ordemManutencao?.numero ?? null, fotos: [] });
      }
      grupos.get(chave)!.fotos.push(anexo);
    }
    const comOm = [...grupos.entries()].filter(([chave]) => chave !== "__geral__").map(([, grupo]) => grupo);
    const geral = grupos.get("__geral__");
    return geral ? [...comOm, geral] : comOm;
  }, [anexos]);

  const outrosAnexos = anexos.filter((anexo) => anexo.tipo !== "FOTO");

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

  /**
   * Ao escolher a OM, preenche o km da atividade com o km cadastrado nela
   * (ainda editável — o trecho realmente trabalhado pode diferir um pouco
   * do km oficial da OM).
   */
  function selecionarOrdemManutencao(localIndice: number, atividadeIndice: number, ordemManutencaoId: string): void {
    const om = dados?.ordensManutencao.find((o) => o.id === ordemManutencaoId);
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice
              ? {
                  ...atividade,
                  ordemManutencaoId,
                  kmInicial: om?.kmInicial ?? atividade.kmInicial,
                  kmFinal: om?.kmFinal ?? atividade.kmFinal,
                  // OM trocada/removida invalida a declaração anterior.
                  statusOm: ordemManutencaoId ? atividade.statusOm : "",
                  percentualConcluido: ordemManutencaoId ? atividade.percentualConcluido : "",
                }
              : atividade,
          ),
        };
      }),
    );
  }

  function adicionarMaoDeObraAtividade(localIndice: number, atividadeIndice: number): void {
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice
              ? { ...atividade, maoDeObra: [...atividade.maoDeObra, { funcaoId: funcoes[0]?.id ?? "", quantidade: "1" }] }
              : atividade,
          ),
        };
      }),
    );
  }

  function atualizarMaoDeObraAtividade(
    localIndice: number,
    atividadeIndice: number,
    itemIndice: number,
    campo: keyof AtividadeMaoDeObraDraft,
    valor: string,
  ): void {
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice
              ? {
                  ...atividade,
                  maoDeObra: atividade.maoDeObra.map((item, k) => (k === itemIndice ? { ...item, [campo]: valor } : item)),
                }
              : atividade,
          ),
        };
      }),
    );
  }

  function removerMaoDeObraAtividade(localIndice: number, atividadeIndice: number, itemIndice: number): void {
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice
              ? { ...atividade, maoDeObra: atividade.maoDeObra.filter((_, k) => k !== itemIndice) }
              : atividade,
          ),
        };
      }),
    );
  }

  function adicionarPontoExtra(localIndice: number, atividadeIndice: number): void {
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice ? { ...atividade, pontosExtras: [...atividade.pontosExtras, novoPontoExtra()] } : atividade,
          ),
        };
      }),
    );
  }

  function atualizarPontoExtra(
    localIndice: number,
    atividadeIndice: number,
    pontoIndice: number,
    campo: keyof PontoExtraDraft,
    valor: string,
  ): void {
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice
              ? {
                  ...atividade,
                  pontosExtras: atividade.pontosExtras.map((ponto, k) => (k === pontoIndice ? { ...ponto, [campo]: valor } : ponto)),
                }
              : atividade,
          ),
        };
      }),
    );
  }

  function removerPontoExtra(localIndice: number, atividadeIndice: number, pontoIndice: number): void {
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice
              ? { ...atividade, pontosExtras: atividade.pontosExtras.filter((_, k) => k !== pontoIndice) }
              : atividade,
          ),
        };
      }),
    );
  }

  function adicionarMaterial(): void {
    setMateriais((atual) => [...atual, { materialCatalogoId: "", quantidade: "" }]);
  }

  function atualizarDetalheEquipamento(equipamentoCatalogoId: string, campo: keyof EquipamentoDetalhe, valor: string): void {
    setEquipamentosDetalhe((atual) => ({
      ...atual,
      [equipamentoCatalogoId]: { ...(atual[equipamentoCatalogoId] ?? detalheVazio()), [campo]: valor },
    }));
  }

  function alternarDetalheEquipamento(equipamentoCatalogoId: string): void {
    setEquipamentosDetalheAberto((atual) => {
      const abrindo = !atual[equipamentoCatalogoId];
      // Ao abrir pra preencher produção/horímetro, já sugere o horímetro
      // inicial de hoje com o final do último RDO dessa máquina nessa
      // equipe — o encarregado só confere/ajusta e informa o final de hoje.
      if (abrindo) {
        const detalheAtual = equipamentosDetalhe[equipamentoCatalogoId];
        const sugestao = dados?.ultimosHorimetros[equipamentoCatalogoId];
        if (!detalheAtual?.horimetroInicial && sugestao != null) {
          atualizarDetalheEquipamento(equipamentoCatalogoId, "horimetroInicial", String(sugestao));
        }
      }
      return { ...atual, [equipamentoCatalogoId]: abrindo };
    });
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
    const qs = new URLSearchParams({ tipo: "FOTO" });
    if (omFotoSelecionada) qs.set("ordemManutencaoId", omFotoSelecionada);
    if (legendaFotoSelecionada) qs.set("descricao", legendaFotoSelecionada);

    setEnviandoFoto(true);
    try {
      const anexo = await api.postForm<RdoAnexo>(`/rdos/campo/${token}/anexos?${qs}`, form);
      setAnexos((atual) => [...atual, anexo]);
    } catch (error) {
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível enviar a foto.");
    } finally {
      setEnviandoFoto(false);
    }
  }

  async function removerFoto(anexoId: string): Promise<void> {
    if (!dados) return;
    try {
      await api.delete(`/rdos/${dados.rdo.id}/anexos/${anexoId}`);
      setAnexos((atual) => atual.filter((anexo) => anexo.id !== anexoId));
    } catch (error) {
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível remover a foto.");
    }
  }

  function montarPayload() {
    return {
      clima: clima === "" ? null : clima,
      horaExtraInicio: horaExtraInicio === "" ? null : horaExtraInicio,
      horaExtraFim: horaExtraFim === "" ? null : horaExtraFim,
      totalDesvios: totalDesvios === "" ? null : Number(totalDesvios),
      observacoesContratada: observacoes === "" ? null : observacoes,
      blocosHorario: blocos
        .filter((b) => b.horarioInicial && b.horarioFinal && b.descricao)
        .map((b, ordem) => ({ ...b, ordem })),
      locais: locais
        .filter((local) => local.descricao.trim() !== "" && local.atividades.length > 0)
        .map((local, ordem) => ({
          descricao: local.descricao,
          lado: local.lado || null,
          ordem,
          atividades: local.atividades.map((atividade) => ({
            atividadeCatalogoId: atividade.atividadeCatalogoId,
            ordemManutencaoId: atividade.ordemManutencaoId || null,
            statusOm: atividade.statusOm || null,
            percentualConcluido: atividade.percentualConcluido === "" ? null : Number(atividade.percentualConcluido),
            kmInicial: atividade.kmInicial === "" ? null : Number(atividade.kmInicial),
            kmFinal: atividade.kmFinal === "" ? null : Number(atividade.kmFinal),
            unidade: atividade.unidade,
            altura: atividade.altura === "" ? null : Number(atividade.altura),
            largura: atividade.largura === "" ? null : Number(atividade.largura),
            larguraFinal: atividade.larguraFinal === "" ? null : Number(atividade.larguraFinal),
            comprimento: atividade.comprimento === "" ? null : Number(atividade.comprimento),
            quantidadeDireta: atividade.quantidadeDireta === "" ? null : Number(atividade.quantidadeDireta),
            horarioInicial: atividade.horarioInicial || null,
            horarioFinal: atividade.horarioFinal || null,
            horasTrabalhadas: atividade.horasTrabalhadas === "" ? null : Number(atividade.horasTrabalhadas),
            maoDeObra: atividade.maoDeObra
              .filter((item) => item.funcaoId && Number(item.quantidade) > 0)
              .map((item) => ({ funcaoId: item.funcaoId, quantidade: Number(item.quantidade) })),
            pontosExtras: atividade.pontosExtras.map((ponto, ordem) => ({
              ordem,
              altura: ponto.altura === "" ? null : Number(ponto.altura),
              largura: ponto.largura === "" ? null : Number(ponto.largura),
              larguraFinal: ponto.larguraFinal === "" ? null : Number(ponto.larguraFinal),
              comprimento: ponto.comprimento === "" ? null : Number(ponto.comprimento),
              quantidadeDireta: ponto.quantidadeDireta === "" ? null : Number(ponto.quantidadeDireta),
            })),
          })),
        })),
      maoDeObra: [
        ...(dados?.rdo.equipe.membros ?? [])
          .filter((membro) => Number(maoDeObra[membro.id] ?? membro.quantidade) > 0)
          .map((membro) => ({
            funcaoId: membro.funcao.id,
            colaboradorId: membro.colaborador?.id ?? null,
            quantidade: Number(maoDeObra[membro.id] ?? membro.quantidade),
          })),
        ...outrasMaoDeObra,
      ],
      equipamentos: equipamentosCatalogo
        .filter((item) => Number(equipamentosQtd[item.id] ?? "0") > 0)
        .map((item) => {
          const detalhe = equipamentosDetalhe[item.id] ?? detalheVazio();
          return {
            equipamentoCatalogoId: item.id,
            quantidade: Number(equipamentosQtd[item.id]),
            producaoDescricao: detalhe.producaoDescricao.trim() || null,
            producaoValor: detalhe.producaoValor !== "" ? Number(detalhe.producaoValor) : null,
            producaoUnidade: detalhe.producaoUnidade.trim() || null,
            horimetroInicial: detalhe.horimetroInicial !== "" ? Number(detalhe.horimetroInicial) : null,
            horimetroFinal: detalhe.horimetroFinal !== "" ? Number(detalhe.horimetroFinal) : null,
          };
        }),
      materiais: materiais
        .filter((material) => material.materialCatalogoId !== "" && Number(material.quantidade) > 0)
        .map((material, ordem) => ({
          materialCatalogoId: material.materialCatalogoId,
          quantidade: Number(material.quantidade),
          ordem,
        })),
    };
  }

  async function handleSalvar(): Promise<void> {
    if (!token) return;
    setSalvando(true);
    setSalvarStatus("idle");
    setErroSalvar(null);

    try {
      await api.patch(`/rdos/campo/${token}`, montarPayload());
      setSalvarStatus("salvo");
    } catch (error) {
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível salvar o RDO.");
      setSalvarStatus("erro");
    } finally {
      setSalvando(false);
    }
  }

  async function handleFinalizar(): Promise<void> {
    if (!token) return;
    setErroFinalizar(null);

    const blob = await assinaturaRef.current?.exportarPng();
    if (!blob) {
      setErroFinalizar("Desenhe sua assinatura antes de enviar.");
      return;
    }

    setFinalizando(true);
    try {
      // Garante que o que está na tela foi salvo antes de enviar pra
      // aprovação — "enviar" só transiciona o status, não recebe o
      // formulário inteiro de novo.
      await api.patch(`/rdos/campo/${token}`, montarPayload());

      const form = new FormData();
      form.append("assinatura", blob, "assinatura.png");
      const resposta = await api.postForm<{ status: string }>(`/rdos/campo/${token}/enviar`, form);
      setDados((atual) => (atual ? { ...atual, rdo: { ...atual.rdo, status: resposta.status } } : atual));
      setMostrandoAssinatura(false);
    } catch (error) {
      setErroFinalizar(error instanceof ApiError ? error.message : "Não foi possível enviar o RDO para aprovação.");
    } finally {
      setFinalizando(false);
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
      <div className="campo-brand">
        <p className="campo-brand-title">GOLIAS</p>
        <p className="campo-brand-subtitle">Gestão de contratos</p>
      </div>
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

            <div>
              <label className="field-label">Lado</label>
              <input
                className="field-input"
                placeholder="LE / LD"
                value={local.lado}
                onChange={(event) => atualizarLocal(localIndice, "lado", event.target.value)}
              />
            </div>

            <h3 className="campo-subtitulo">Atividades neste local</h3>
            {local.atividades.map((atividade, atividadeIndice) => {
              const usaDimensoes = ["M", "M2", "M3"].includes(atividade.unidade);
              const catalogoDaAtividade = dados?.atividadesCatalogo.find((item) => item.id === atividade.atividadeCatalogoId);
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

                  <Autocomplete
                    value={atividade.ordemManutencaoId}
                    items={ordensManutencao}
                    getLabel={(om) => om.numero}
                    getSublabel={(om) => om.detalhes}
                    onChange={(ordemManutencaoId) => selecionarOrdemManutencao(localIndice, atividadeIndice, ordemManutencaoId)}
                    placeholder="Ordem de manutenção (opcional)"
                  />

                  <div className="campo-grid-2">
                    <div>
                      <label className="field-label">Km inicial</label>
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Da OM, se houver"
                        value={atividade.kmInicial}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "kmInicial", event.target.value)}
                      />
                    </div>
                    <div>
                      <label className="field-label">Km final</label>
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Da OM, se houver"
                        value={atividade.kmFinal}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "kmFinal", event.target.value)}
                      />
                    </div>
                  </div>

                  {atividade.unidade === "M3" && (
                    <div className="campo-grid-3">
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Altura"
                        value={atividade.altura}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "altura", event.target.value)}
                      />
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Largura"
                        value={atividade.largura}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "largura", event.target.value)}
                      />
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Comprimento"
                        value={atividade.comprimento}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "comprimento", event.target.value)}
                      />
                    </div>
                  )}
                  {atividade.unidade === "M2" && (
                    <div className="campo-grid-3">
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Largura inicial"
                        value={atividade.largura}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "largura", event.target.value)}
                      />
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Largura final (se afunilar)"
                        value={atividade.larguraFinal}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "larguraFinal", event.target.value)}
                      />
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Comprimento"
                        value={atividade.comprimento}
                        onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "comprimento", event.target.value)}
                      />
                    </div>
                  )}
                  {atividade.unidade === "M" && (
                    <input
                      type="number"
                      step="0.001"
                      className="field-input"
                      placeholder="Comprimento"
                      value={atividade.comprimento}
                      onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "comprimento", event.target.value)}
                    />
                  )}

                  {usaDimensoes && (
                    <CroquiAtividade
                      unidade={atividade.unidade}
                      altura={atividade.altura}
                      largura={atividade.largura}
                      larguraFinal={atividade.larguraFinal}
                      comprimento={atividade.comprimento}
                      descricaoAtividade={
                        atividade.pontosExtras.length > 0 ? `${catalogoDaAtividade?.descricao ?? ""} — Ponto 1` : catalogoDaAtividade?.descricao
                      }
                    />
                  )}

                  {usaDimensoes &&
                    atividade.pontosExtras.map((ponto, pontoIndice) => (
                      <div className="campo-item" key={pontoIndice}>
                        <div className="campo-checklist-row">
                          <strong>Ponto {pontoIndice + 2}</strong>
                          <button
                            type="button"
                            className="button button--ghost button--small"
                            onClick={() => removerPontoExtra(localIndice, atividadeIndice, pontoIndice)}
                          >
                            Remover ponto
                          </button>
                        </div>
                        {atividade.unidade === "M3" && (
                          <div className="campo-grid-3">
                            <input
                              type="number"
                              step="0.001"
                              className="field-input"
                              placeholder="Altura"
                              value={ponto.altura}
                              onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "altura", event.target.value)}
                            />
                            <input
                              type="number"
                              step="0.001"
                              className="field-input"
                              placeholder="Largura"
                              value={ponto.largura}
                              onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "largura", event.target.value)}
                            />
                            <input
                              type="number"
                              step="0.001"
                              className="field-input"
                              placeholder="Comprimento"
                              value={ponto.comprimento}
                              onChange={(event) =>
                                atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "comprimento", event.target.value)
                              }
                            />
                          </div>
                        )}
                        {atividade.unidade === "M2" && (
                          <div className="campo-grid-3">
                            <input
                              type="number"
                              step="0.001"
                              className="field-input"
                              placeholder="Largura inicial"
                              value={ponto.largura}
                              onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "largura", event.target.value)}
                            />
                            <input
                              type="number"
                              step="0.001"
                              className="field-input"
                              placeholder="Largura final (se afunilar)"
                              value={ponto.larguraFinal}
                              onChange={(event) =>
                                atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "larguraFinal", event.target.value)
                              }
                            />
                            <input
                              type="number"
                              step="0.001"
                              className="field-input"
                              placeholder="Comprimento"
                              value={ponto.comprimento}
                              onChange={(event) =>
                                atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "comprimento", event.target.value)
                              }
                            />
                          </div>
                        )}
                        {atividade.unidade === "M" && (
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="Comprimento"
                            value={ponto.comprimento}
                            onChange={(event) =>
                              atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "comprimento", event.target.value)
                            }
                          />
                        )}
                        <CroquiAtividade
                          unidade={atividade.unidade}
                          altura={ponto.altura}
                          largura={ponto.largura}
                          larguraFinal={ponto.larguraFinal}
                          comprimento={ponto.comprimento}
                          descricaoAtividade={`${catalogoDaAtividade?.descricao ?? ""} — Ponto ${pontoIndice + 2}`}
                        />
                      </div>
                    ))}
                  {usaDimensoes && (
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => adicionarPontoExtra(localIndice, atividadeIndice)}
                    >
                      + Adicionar ponto de medição
                    </button>
                  )}

                  {!usaDimensoes && (
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
                  <div className="campo-grid-2">
                    <div>
                      <label className="field-label">Horário início (nesta atividade)</label>
                      <input
                        type="time"
                        className="field-input"
                        value={atividade.horarioInicial}
                        onChange={(event) =>
                          atualizarAtividade(localIndice, atividadeIndice, "horarioInicial", event.target.value)
                        }
                      />
                    </div>
                    <div>
                      <label className="field-label">Horário fim (nesta atividade)</label>
                      <input
                        type="time"
                        className="field-input"
                        value={atividade.horarioFinal}
                        onChange={(event) =>
                          atualizarAtividade(localIndice, atividadeIndice, "horarioFinal", event.target.value)
                        }
                      />
                    </div>
                  </div>

                  {duracaoEmHoras(atividade.horarioInicial, atividade.horarioFinal) != null ? (
                    <p className="campo-subtitulo">
                      Horas trabalhadas: {formatarHoras(duracaoEmHoras(atividade.horarioInicial, atividade.horarioFinal)!)}{" "}
                      (calculado do horário)
                    </p>
                  ) : (
                    <input
                      type="number"
                      step="0.5"
                      min={0}
                      className="field-input"
                      placeholder="Horas trabalhadas nesta atividade (opcional)"
                      value={atividade.horasTrabalhadas}
                      onChange={(event) =>
                        atualizarAtividade(localIndice, atividadeIndice, "horasTrabalhadas", event.target.value)
                      }
                    />
                  )}

                  {atividade.ordemManutencaoId && (
                    <div className="campo-grid-2">
                      <div>
                        <label className="field-label">Status da OM</label>
                        <select
                          className="field-input"
                          value={atividade.statusOm}
                          onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "statusOm", event.target.value)}
                        >
                          <option value="">—</option>
                          <option value="EM_ANDAMENTO">Em andamento</option>
                          <option value="CONCLUIDA">Concluída</option>
                        </select>
                      </div>
                      <div>
                        <label className="field-label">% concluído da OM</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          className="field-input"
                          placeholder="0 a 100"
                          value={atividade.percentualConcluido}
                          onChange={(event) =>
                            atualizarAtividade(localIndice, atividadeIndice, "percentualConcluido", event.target.value)
                          }
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="field-label">Mão de obra nesta atividade</label>
                    {atividade.maoDeObra.map((item, itemIndice) => (
                      <div className="campo-mao-de-obra-row" key={itemIndice}>
                        <select
                          className="field-input"
                          value={item.funcaoId}
                          onChange={(event) =>
                            atualizarMaoDeObraAtividade(localIndice, atividadeIndice, itemIndice, "funcaoId", event.target.value)
                          }
                        >
                          {funcoes.map((funcao) => (
                            <option key={funcao.id} value={funcao.id}>
                              {funcao.nome}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          min={1}
                          className="field-input"
                          value={item.quantidade}
                          onChange={(event) =>
                            atualizarMaoDeObraAtividade(localIndice, atividadeIndice, itemIndice, "quantidade", event.target.value)
                          }
                        />
                        <button
                          type="button"
                          className="button button--ghost button--small"
                          onClick={() => removerMaoDeObraAtividade(localIndice, atividadeIndice, itemIndice)}
                        >
                          Remover
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      className="button button--secondary button--small"
                      onClick={() => adicionarMaoDeObraAtividade(localIndice, atividadeIndice)}
                    >
                      + Adicionar função
                    </button>
                  </div>
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
                {membro.colaborador ? `${membro.colaborador.nome} — ` : ""}
                {membro.funcao.nome}
              </span>
              <input
                type="number"
                min={0}
                className="field-input campo-qtd"
                value={maoDeObra[membro.id] ?? String(membro.quantidade)}
                onChange={(event) => setMaoDeObra((atual) => ({ ...atual, [membro.id]: event.target.value }))}
              />
            </div>
          ))
        )}
      </section>

      <section className="campo-secao">
        <h2>Equipamentos / outros custos indiretos</h2>
        <p className="list-subtitle">
          Marque a quantidade de cada item usado hoje. Produção/horímetro é opcional — só abra pra equipamento que
          aponta por produção (ex.: terraplenagem).
        </p>
        {equipamentosCatalogo.length === 0 ? (
          <p className="loading-text">Nenhum equipamento cadastrado no catálogo.</p>
        ) : (
          equipamentosCatalogo.map((item) => {
            const detalhe = equipamentosDetalhe[item.id] ?? detalheVazio();
            const aberto = equipamentosDetalheAberto[item.id] ?? false;
            return (
              <div className="campo-item-checklist" key={item.id}>
                <div className="campo-checklist-row">
                  <span>{item.nome}</span>
                  <input
                    type="number"
                    min={0}
                    className="field-input campo-qtd"
                    value={equipamentosQtd[item.id] ?? ""}
                    onChange={(event) => setEquipamentosQtd((atual) => ({ ...atual, [item.id]: event.target.value }))}
                  />
                  <button
                    type="button"
                    className="button button--ghost button--small"
                    onClick={() => alternarDetalheEquipamento(item.id)}
                  >
                    {aberto ? "Ocultar produção/horímetro" : "+ Produção/horímetro"}
                  </button>
                </div>
                {aberto && (
                  <div className="campo-item-detalhe">
                    <div className="campo-grid-3">
                      <input
                        className="field-input"
                        placeholder="Produção (ex.: Manutenção de acesso)"
                        value={detalhe.producaoDescricao}
                        onChange={(event) => atualizarDetalheEquipamento(item.id, "producaoDescricao", event.target.value)}
                      />
                      <input
                        type="number"
                        step="0.001"
                        className="field-input"
                        placeholder="Valor"
                        value={detalhe.producaoValor}
                        onChange={(event) => atualizarDetalheEquipamento(item.id, "producaoValor", event.target.value)}
                      />
                      <input
                        className="field-input"
                        placeholder="Unidade (ex.: m, cargas, litros)"
                        value={detalhe.producaoUnidade}
                        onChange={(event) => atualizarDetalheEquipamento(item.id, "producaoUnidade", event.target.value)}
                      />
                    </div>
                    <p className="list-subtitle">
                      Ou, se a máquina é apontada por horímetro (ex.: retroescavadeira, pá carregadeira): informe o
                      horímetro inicial e final de hoje.
                    </p>
                    <div className="campo-grid-2">
                      <div>
                        <label className="field-label">Horímetro inicial</label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="field-input"
                          placeholder="Ex.: 1234.50"
                          value={detalhe.horimetroInicial}
                          onChange={(event) => atualizarDetalheEquipamento(item.id, "horimetroInicial", event.target.value)}
                        />
                      </div>
                      <div>
                        <label className="field-label">Horímetro final</label>
                        <input
                          type="number"
                          step="0.01"
                          min={0}
                          className="field-input"
                          placeholder="Ex.: 1240.00"
                          value={detalhe.horimetroFinal}
                          onChange={(event) => atualizarDetalheEquipamento(item.id, "horimetroFinal", event.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="campo-secao">
        <h2>Materiais utilizados</h2>
        {materiais.map((material, indice) => (
          <div className="campo-item" key={indice}>
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
              placeholder="Quantidade"
              value={material.quantidade}
              onChange={(event) => atualizarMaterial(indice, "quantidade", event.target.value)}
            />
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
        <div className="campo-foto-upload">
          <select
            className="field-input"
            value={omFotoSelecionada}
            onChange={(event) => setOmFotoSelecionada(event.target.value)}
          >
            <option value="">Foto geral (sem OM específica)</option>
            {omsUsadasNoRdo.map((om) => (
              <option key={om.id} value={om.id}>
                OM {om.numero}
              </option>
            ))}
          </select>
          <select
            className="field-input"
            value={legendaFotoSelecionada}
            onChange={(event) => setLegendaFotoSelecionada(event.target.value)}
          >
            {LEGENDA_FOTO_OPCOES.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao || "Sem legenda"}
              </option>
            ))}
          </select>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={enviandoFoto}
            onChange={(event) => void handleUploadFoto(event)}
          />
        </div>
        <p className="campo-foto-dica">
          Escolha a OM antes de tirar a foto — cada foto fica registrada na OM certa, pra aparecer organizada no
          relatório fotográfico dela.
        </p>

        {anexosPorOm.map((grupo) => (
          <div key={grupo.omNumero ?? "geral"} className="campo-foto-grupo">
            <p className="campo-foto-grupo-titulo">{grupo.omNumero ? `OM ${grupo.omNumero}` : "Fotos gerais"}</p>
            <ul className="campo-foto-grade">
              {grupo.fotos.map((anexo) => (
                <li key={anexo.id} className="campo-foto-item">
                  <img src={`${API_URL}/rdos/${dados?.rdo.id}/anexos/${anexo.id}`} alt={anexo.nomeOriginal} />
                  {anexo.descricao && <span className="campo-foto-legenda">{anexo.descricao}</span>}
                  <button type="button" className="campo-foto-remover" onClick={() => void removerFoto(anexo.id)}>
                    Remover
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}

        {outrosAnexos.length > 0 && (
          <ul className="campo-anexos-lista">
            {outrosAnexos.map((anexo) => (
              <li key={anexo.id}>
                {anexo.nomeOriginal} ({Math.round(anexo.tamanhoBytes / 1024)} KB)
              </li>
            ))}
          </ul>
        )}
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

      <section className="campo-secao">
        <h2>Fechamento do dia</h2>
        <p className="campo-subtitulo">
          {formatarHoras(horasApontadasDia)} apontadas (linha do tempo + atividades) de {JORNADA_REFERENCIA_HORAS}h de
          referência ({horasApontadasDia >= JORNADA_REFERENCIA_HORAS ? "jornada completa" : "faltam apontar horas"}).
        </p>
      </section>

      {pendenciasOm.length > 0 && (
        <section className="campo-secao">
          <h2>OMs que ainda não fecharam</h2>
          <p className="campo-subtitulo">Confira antes de enviar — não impede o envio, é só um lembrete.</p>
          <ul className="campo-anexos-lista">
            {pendenciasOm.map((pendencia) => (
              <li key={pendencia.omId}>
                <strong>OM {pendencia.omNumero}:</strong> {pendencia.motivos.join("; ")}
              </li>
            ))}
          </ul>
        </section>
      )}

      {erroSalvar && <p className="feedback feedback--erro">{erroSalvar}</p>}
      {salvarStatus === "salvo" && <p className="feedback feedback--ok">RDO salvo com sucesso.</p>}

      {STATUS_MENSAGEM[dados.rdo.status] && (
        <p className="feedback feedback--ok">{STATUS_MENSAGEM[dados.rdo.status]}</p>
      )}
      {dados.rdo.status === "REPROVADO" && (
        <p className="feedback feedback--erro">
          RDO reprovado pelo fiscal{dados.ultimaReprovacao?.assinanteNome ? ` (${dados.ultimaReprovacao.assinanteNome})` : ""}
          {dados.ultimaReprovacao?.comentarioReprovacao ? `: ${dados.ultimaReprovacao.comentarioReprovacao}` : ""}
          {" — corrija e envie de novo."}
        </p>
      )}

      {mostrandoAssinatura && (
        <section className="campo-secao">
          <h2>Assinatura</h2>
          <p className="list-subtitle" style={{ marginTop: -4, marginBottom: 12 }}>
            Ao assinar, o RDO é enviado para aprovação do fiscal e não pode mais ser editado até que ele
            responda.
          </p>
          <AssinaturaCanvas ref={assinaturaRef} />
          {erroFinalizar && <p className="feedback feedback--erro">{erroFinalizar}</p>}
          <div className="campo-acoes" style={{ marginTop: 12 }}>
            <button type="button" className="button" disabled={finalizando} onClick={() => void handleFinalizar()}>
              {finalizando ? "Enviando…" : "Confirmar e enviar"}
            </button>
            <button
              type="button"
              className="button button--secondary"
              disabled={finalizando}
              onClick={() => {
                setMostrandoAssinatura(false);
                setErroFinalizar(null);
              }}
            >
              Cancelar
            </button>
          </div>
        </section>
      )}

      {!mostrandoAssinatura && (RDO_EDITAVEL.has(dados.rdo.status)) && (
        <div className="campo-acoes">
          <button type="button" className="button button--secondary" disabled={salvando} onClick={() => void handleSalvar()}>
            {salvando ? "Salvando…" : "Salvar RDO"}
          </button>
          <button type="button" className="button" onClick={() => setMostrandoAssinatura(true)}>
            Finalizar e enviar para aprovação
          </button>
        </div>
      )}
    </div>
  );
}
