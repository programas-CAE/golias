import { useEffect, useMemo, useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import CroquiAtividade from "../components/CroquiAtividade";
import Autocomplete from "../components/Autocomplete";
import { ApiError, api } from "../lib/apiClient";

interface Frente {
  id: string;
  codigo: string;
  nome: string;
  contratoId: string;
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
  colaboradorId: string | null;
  colaborador: Colaborador | null;
  funcaoId: string;
  funcao: Funcao;
  quantidade: number;
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
  kmInicial: string | null;
  kmFinal: string | null;
}

interface Obra {
  id: string;
  nome: string;
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
  horimetroInicial: string;
  horimetroFinal: string;
  altura: string;
  largura: string;
  larguraFinal: string;
  comprimento: string;
  quantidadeDireta: string;
  horarioInicial: string;
  horarioFinal: string;
  horasTrabalhadas: string;
  maoDeObra: AtividadeMaoDeObraDraft[];
  // Ponto 1 é sempre os campos de dimensão acima — pontosExtras só existe
  // quando a mesma atividade/OM foi medida em mais de um trecho no mesmo
  // dia (ex.: "ponto 1 rocei 1x5x20, ponto 2 rocei 2x5x4").
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
  kmInicial: string;
  kmFinal: string;
  rota: string;
  combustivelLitros: string;
  combustivelPosto: string;
}

function detalheVazio(): EquipamentoDetalhe {
  return {
    producaoDescricao: "",
    producaoValor: "",
    producaoUnidade: "",
    horimetroInicial: "",
    horimetroFinal: "",
    kmInicial: "",
    kmFinal: "",
    rota: "",
    combustivelLitros: "",
    combustivelPosto: "",
  };
}

/** Formato retornado por `GET /rdos/:id` — usado só quando a tela abre em modo de edição. */
interface UltimaDecisaoFiscal {
  status: "APROVADO" | "REPROVADO";
  comentario: string | null;
  assinanteNome: string | null;
  assinadoEm: string | null;
}

interface RdoExistente {
  frenteId: string;
  equipeId: string;
  obraId: string | null;
  tipo: string;
  status: string;
  ultimaDecisaoFiscal: UltimaDecisaoFiscal | null;
  data: string;
  encarregadoId: string | null;
  clima: string | null;
  totalDesvios: number | null;
  horaExtraInicio: string | null;
  horaExtraFim: string | null;
  observacoesContratada: string | null;
  blocosHorario: BlocoDraft[];
  locais: Array<{
    descricao: string;
    lado: string | null;
    atividades: Array<{
      atividadeCatalogoId: string;
      ordemManutencaoId: string | null;
      statusOm: string | null;
      percentualConcluido: number | null;
      kmInicial: string | null;
      kmFinal: string | null;
      horimetroInicial: string | null;
      horimetroFinal: string | null;
      altura: string | null;
      largura: string | null;
      larguraFinal: string | null;
      comprimento: string | null;
      quantidadeDireta: string | null;
      horarioInicial: string | null;
      horarioFinal: string | null;
      horasTrabalhadas: string | null;
      maoDeObra: Array<{ funcaoId: string; quantidade: number }>;
      unidade: string;
      pontosExtras: Array<{
        altura: string | null;
        largura: string | null;
        larguraFinal: string | null;
        comprimento: string | null;
        quantidadeDireta: string | null;
      }>;
    }>;
  }>;
  maoDeObra: Array<{ funcaoId: string; colaboradorId: string | null; quantidade: number }>;
  equipamentos: Array<{
    equipamentoCatalogoId: string;
    quantidade: number;
    producaoDescricao: string | null;
    producaoValor: string | null;
    producaoUnidade: string | null;
    horimetroInicial: string | null;
    horimetroFinal: string | null;
    kmInicial: string | null;
    kmFinal: string | null;
    rota: string | null;
    combustivelLitros: string | null;
    combustivelPosto: string | null;
  }>;
  materiais: Array<{ materialCatalogoId: string; quantidade: string }>;
}

const CLIMA_OPCOES = ["SOL", "CHUVA", "NUBLADO"];
/** Jornada de referência pra o fechamento do dia (07:00 às 17:00) — não bloqueia o salvamento, só avisa. */
const JORNADA_REFERENCIA_HORAS = 10;

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
    horimetroInicial: "",
    horimetroFinal: "",
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

// Superestrutura fica de fora — tem formulário próprio (ferrovia, sem
// local/atividade), incompatível com esta tela de cadastro completo.
const UNIDADES_ATIVIDADE = ["M", "M2", "M3", "UND", "HH", "M3KM"] as const;
const UNIDADES_SEM_DIMENSAO = ["UND", "HH", "M3KM"] as const;

const TIPOS_RDO = ["PREVENTIVA_CORRETIVA", "TERRAPLENAGEM", "MOTORISTA_OPERADOR"] as const;
const TIPO_RDO_LABEL: Record<(typeof TIPOS_RDO)[number], string> = {
  PREVENTIVA_CORRETIVA: "Preventiva / Corretiva",
  TERRAPLENAGEM: "Terraplenagem",
  MOTORISTA_OPERADOR: "Motorista / Operador",
};

export default function RdoCompleto(): ReactElement {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const emEdicao = Boolean(id);

  const [frentes, setFrentes] = useState<Frente[]>([]);
  const [equipes, setEquipes] = useState<Equipe[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[]>([]);
  const [atividadesCatalogo, setAtividadesCatalogo] = useState<AtividadeCatalogo[]>([]);
  const [equipamentosCatalogo, setEquipamentosCatalogo] = useState<EquipamentoCatalogo[]>([]);
  const [materiaisCatalogo, setMateriaisCatalogo] = useState<MaterialCatalogo[]>([]);
  const [ordensManutencao, setOrdensManutencao] = useState<OrdemManutencao[]>([]);
  const [obras, setObras] = useState<Obra[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);
  // Linha (local + atividade) que pediu "+ Nova atividade" — null quando o
  // modal de criação de atividade não está aberto.
  const [criandoAtividadePara, setCriandoAtividadePara] = useState<{ localIndice: number; atividadeIndice: number } | null>(
    null,
  );
  const [criandoMaterial, setCriandoMaterial] = useState(false);

  const [frenteId, setFrenteId] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const [obraId, setObraId] = useState("");
  const [tipo, setTipo] = useState<(typeof TIPOS_RDO)[number]>("PREVENTIVA_CORRETIVA");
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
  // Checklist fixa — todo item do catálogo aparece direto, só com a
  // quantidade (padrão antigo, que o usuário pediu de volta); produção/
  // horímetro fica escondido por item até clicar em "+ Produção/horímetro".
  const [equipamentosQtd, setEquipamentosQtd] = useState<Record<string, string>>({});
  const [equipamentosDetalhe, setEquipamentosDetalhe] = useState<Record<string, EquipamentoDetalhe>>({});
  const [equipamentosDetalheAberto, setEquipamentosDetalheAberto] = useState<Record<string, boolean>>({});
  // Motorista/Operador dirige só um equipamento por dia — substitui a
  // seleção em vez de acumular na checklist geral.
  const [motoristaEquipamentoId, setMotoristaEquipamentoId] = useState("");
  const [materiais, setMateriais] = useState<MaterialDraft[]>([]);
  const [observacoes, setObservacoes] = useState("");

  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState<string | null>(null);
  const [ultimaDecisaoFiscal, setUltimaDecisaoFiscal] = useState<UltimaDecisaoFiscal | null>(null);

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
          listaObras,
        ] = await Promise.all([
          api.get<Frente[]>("/frentes"),
          api.get<Equipe[]>("/equipes"),
          api.get<Colaborador[]>("/colaboradores"),
          api.get<Funcao[]>("/funcoes"),
          api.get<AtividadeCatalogo[]>("/atividades"),
          api.get<EquipamentoCatalogo[]>("/equipamentos"),
          api.get<MaterialCatalogo[]>("/materiais"),
          api.get<OrdemManutencao[]>("/ordens-manutencao"),
          api.get<Obra[]>("/obras"),
        ]);
        setFrentes(listaFrentes);
        setEquipes(listaEquipes);
        setColaboradores(listaColaboradores);
        setFuncoes(listaFuncoes);
        setAtividadesCatalogo(listaAtividades);
        setEquipamentosCatalogo(listaEquipamentos);
        setMateriaisCatalogo(listaMateriais);
        setOrdensManutencao(listaOrdens);
        setObras(listaObras);

        if (id) {
          const rdo = await api.get<RdoExistente>(`/rdos/${id}`);
          setFrenteId(rdo.frenteId);
          setEquipeId(rdo.equipeId);
          setObraId(rdo.obraId ?? "");
          if ((TIPOS_RDO as readonly string[]).includes(rdo.tipo)) {
            setTipo(rdo.tipo as (typeof TIPOS_RDO)[number]);
          }
          setData(rdo.data.slice(0, 10));
          setEncarregadoId(rdo.encarregadoId ?? "");
          setClima(rdo.clima ?? "");
          setTotalDesvios(rdo.totalDesvios != null ? String(rdo.totalDesvios) : "");
          setHoraExtraInicio(rdo.horaExtraInicio ?? "");
          setHoraExtraFim(rdo.horaExtraFim ?? "");
          setObservacoes(rdo.observacoesContratada ?? "");
          setBlocos(
            rdo.blocosHorario.length > 0
              ? rdo.blocosHorario.map((b) => ({ ...b }))
              : [{ horarioInicial: "", horarioFinal: "", descricao: "" }],
          );
          setLocais(
            rdo.locais.length > 0
              ? rdo.locais.map((local) => ({
                  descricao: local.descricao,
                  lado: local.lado ?? "",
                  atividades: local.atividades.map((atividade) => ({
                    atividadeCatalogoId: atividade.atividadeCatalogoId,
                    ordemManutencaoId: atividade.ordemManutencaoId ?? "",
                    statusOm: atividade.statusOm ?? "",
                    percentualConcluido: atividade.percentualConcluido != null ? String(atividade.percentualConcluido) : "",
                    unidade: atividade.unidade,
                    kmInicial: atividade.kmInicial ?? "",
                    kmFinal: atividade.kmFinal ?? "",
                    horimetroInicial: atividade.horimetroInicial ?? "",
                    horimetroFinal: atividade.horimetroFinal ?? "",
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
              : [novoLocal(listaAtividades)],
          );
          // RDO salvo antes da regra de "sem dimensão" pra Motorista/
          // Operador pode ter atividade M/M2/M3 antiga — não normaliza mais
          // silenciosamente aqui (isso apagava o croqui/dimensões ao só
          // reabrir o RDO pra olhar). O <select> mostra o rótulo certo
          // mesmo assim (ver opcoesAtividade), e salvar sem corrigir é
          // bloqueado com uma mensagem clara (ver handleSalvar).
          setMaoDeObra(
            Object.fromEntries(
              rdo.maoDeObra
                .map((mdo) => {
                  const membro = listaEquipes
                    .find((equipe) => equipe.id === rdo.equipeId)
                    ?.membros.find((m) =>
                      mdo.colaboradorId != null ? m.colaboradorId === mdo.colaboradorId : m.funcaoId === mdo.funcaoId && !m.colaboradorId,
                    );
                  return membro ? ([membro.id, String(mdo.quantidade)] as const) : null;
                })
                .filter((par): par is readonly [string, string] => par != null),
            ),
          );
          setOutrasMaoDeObra(
            rdo.maoDeObra
              .filter((mdo) => {
                const membro = listaEquipes
                  .find((equipe) => equipe.id === rdo.equipeId)
                  ?.membros.find((m) =>
                    mdo.colaboradorId != null ? m.colaboradorId === mdo.colaboradorId : m.funcaoId === mdo.funcaoId && !m.colaboradorId,
                  );
                return membro == null;
              })
              .map((mdo) => ({ funcaoId: mdo.funcaoId, colaboradorId: mdo.colaboradorId ?? "", quantidade: String(mdo.quantidade) })),
          );
          setEquipamentosQtd(Object.fromEntries(rdo.equipamentos.map((eq) => [eq.equipamentoCatalogoId, String(eq.quantidade)])));
          setEquipamentosDetalhe(
            Object.fromEntries(
              rdo.equipamentos.map((eq) => [
                eq.equipamentoCatalogoId,
                {
                  producaoDescricao: eq.producaoDescricao ?? "",
                  producaoValor: eq.producaoValor ?? "",
                  producaoUnidade: eq.producaoUnidade ?? "",
                  horimetroInicial: eq.horimetroInicial ?? "",
                  horimetroFinal: eq.horimetroFinal ?? "",
                  kmInicial: eq.kmInicial ?? "",
                  kmFinal: eq.kmFinal ?? "",
                  rota: eq.rota ?? "",
                  combustivelLitros: eq.combustivelLitros ?? "",
                  combustivelPosto: eq.combustivelPosto ?? "",
                },
              ]),
            ),
          );
          setEquipamentosDetalheAberto(
            Object.fromEntries(
              rdo.equipamentos
                .filter(
                  (eq) =>
                    eq.producaoDescricao || eq.producaoValor != null || eq.horimetroInicial != null || eq.horimetroFinal != null,
                )
                .map((eq) => [eq.equipamentoCatalogoId, true]),
            ),
          );
          setMateriais(rdo.materiais.map((m) => ({ materialCatalogoId: m.materialCatalogoId, quantidade: String(m.quantidade) })));
          setMotoristaEquipamentoId(rdo.equipamentos[0]?.equipamentoCatalogoId ?? "");
          setUltimaDecisaoFiscal(rdo.ultimaDecisaoFiscal);
        } else {
          const primeiraFrente = listaFrentes[0]?.id ?? "";
          setFrenteId(primeiraFrente);
          setEquipeId(listaEquipes.find((equipe) => equipe.distrito.frenteId === primeiraFrente)?.id ?? "");
          setLocais([novoLocal(listaAtividades)]);
        }
      } catch (error) {
        setErroCarga(error instanceof ApiError ? error.message : "Não foi possível carregar os dados de apoio.");
      } finally {
        setCarregando(false);
      }
    }

    void carregar();
  }, [id]);

  const frenteSelecionada = frentes.find((frente) => frente.id === frenteId) ?? null;
  const equipesDaFrente = equipes.filter((equipe) => equipe.distrito.frenteId === frenteId);
  const equipeSelecionada = equipes.find((equipe) => equipe.id === equipeId) ?? null;
  const ordensDaFrente = ordensManutencao.filter((ordem) => ordem.frenteId === frenteId);
  // Motorista/Operador não usa atividade com dimensão (croqui não faz
  // sentido pra ele) — mesmo filtro do formulário de campo (Campo.tsx).
  const atividadesCatalogoDoTipo =
    tipo === "MOTORISTA_OPERADOR" ? atividadesCatalogo.filter((item) => !item.usaDimensoes) : atividadesCatalogo;
  // Com só 1 atividade no dia, Km/Horímetro por atividade seriam os mesmos
  // números já pedidos na seção Equipamento (o dia inteiro é uma viagem só)
  // — pedir de novo aqui é redundante. Só faz sentido separar por atividade
  // quando o motorista realmente fez mais de uma no dia (viagens/OMs
  // diferentes, cada uma com sua própria leitura).
  const totalAtividadesMotorista = locais.reduce((soma, local) => soma + local.atividades.length, 0);
  const tempoTotal = useMemo(() => calcularTempoTotal(blocos), [blocos]);
  const horasApontadasDia = useMemo(() => calcularHorasApontadasDia(blocos, locais), [blocos, locais]);

  function handleFrenteChange(novaFrenteId: string): void {
    setFrenteId(novaFrenteId);
    const primeiraEquipe = equipes.find((equipe) => equipe.distrito.frenteId === novaFrenteId);
    setEquipeId(primeiraEquipe?.id ?? "");
    setMaoDeObra({});
  }

  /**
   * Só troca a aba — NÃO mexe em `locais`. Antes isso também limpava
   * qualquer atividade dimensional (M/M2/M3) pra "consertar" o rótulo do
   * <select> quando a lista filtrada de Motorista/Operador não continha
   * mais a atividade selecionada, mas isso destruía os dados: clicar em
   * Motorista/Operador só pra espiar e voltar pra Preventiva/Corretiva
   * apagava o croqui/dimensões da atividade que já estava preenchida (bug
   * real visto em produção). O rótulo do <select> agora é resolvido sem
   * mexer nos dados (ver `atividadesCatalogoDoTipo` mais abaixo, que sempre
   * inclui a atividade já selecionada mesmo fora do filtro do tipo atual),
   * e a combinação inválida (atividade dimensional + Motorista/Operador) é
   * bloqueada só na hora de salvar (ver handleSalvar).
   */
  function handleTipoChange(novoTipo: (typeof TIPOS_RDO)[number]): void {
    setTipo(novoTipo);
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

  /** Cria a atividade no catálogo (fora da Price List oficial) e já seleciona ela na linha que pediu. */
  function selecionarAtividadeRecemCriada(localIndice: number, atividadeIndice: number, criada: AtividadeCatalogo): void {
    setAtividadesCatalogo((atual) => [...atual, criada]);
    setLocais((atual) =>
      atual.map((local, i) => {
        if (i !== localIndice) return local;
        return {
          ...local,
          atividades: local.atividades.map((atividade, j) =>
            j === atividadeIndice ? { ...atividade, atividadeCatalogoId: criada.id, unidade: criada.unidade } : atividade,
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

  /**
   * Ao escolher a OM, preenche o km da atividade com o km cadastrado nela
   * (ainda editável — o trecho realmente trabalhado pode diferir um pouco
   * do km oficial da OM).
   */
  function selecionarOrdemManutencao(localIndice: number, atividadeIndice: number, ordemManutencaoId: string): void {
    const om = ordensManutencao.find((o) => o.id === ordemManutencaoId);
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

  function adicionarOutraMaoDeObra(): void {
    setOutrasMaoDeObra((atual) => [
      ...atual,
      { funcaoId: funcoes[0]?.id ?? "", colaboradorId: "", quantidade: "1" },
    ]);
  }

  function atualizarOutraMaoDeObra(indice: number, campo: keyof OutraMaoDeObraDraft, valor: string): void {
    setOutrasMaoDeObra((atual) => atual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)));
  }

  function adicionarMaterial(): void {
    setMateriais((atual) => [...atual, { materialCatalogoId: "", quantidade: "" }]);
  }

  /** Cadastra o material no catálogo do contrato (fora da Price List oficial) e já adiciona uma linha com ele selecionado. */
  function adicionarMaterialRecemCriado(criado: MaterialCatalogo): void {
    setMateriaisCatalogo((atual) => [...atual, criado]);
    setMateriais((atual) => [...atual, { materialCatalogoId: criado.id, quantidade: "" }]);
  }

  function atualizarMaterial(indice: number, campo: keyof MaterialDraft, valor: string): void {
    setMateriais((atual) => atual.map((material, i) => (i === indice ? { ...material, [campo]: valor } : material)));
  }

  function atualizarDetalheEquipamento(equipamentoCatalogoId: string, campo: keyof EquipamentoDetalhe, valor: string): void {
    setEquipamentosDetalhe((atual) => ({
      ...atual,
      [equipamentoCatalogoId]: { ...(atual[equipamentoCatalogoId] ?? detalheVazio()), [campo]: valor },
    }));
  }

  function alternarDetalheEquipamento(equipamentoCatalogoId: string): void {
    setEquipamentosDetalheAberto((atual) => ({ ...atual, [equipamentoCatalogoId]: !atual[equipamentoCatalogoId] }));
  }

  /** Motorista/Operador: troca o equipamento selecionado em vez de acumular (só um por dia). */
  function selecionarEquipamentoMotorista(equipamentoCatalogoId: string): void {
    setMotoristaEquipamentoId(equipamentoCatalogoId);
    setEquipamentosQtd(equipamentoCatalogoId ? { [equipamentoCatalogoId]: "1" } : {});
  }

  /** Cadastra um equipamento novo direto do autocomplete, sem precisar ir na tela Catálogos. */
  async function criarEquipamento(nome: string): Promise<EquipamentoCatalogo> {
    const criado = await api.post<EquipamentoCatalogo>("/equipamentos", { nome });
    setEquipamentosCatalogo((atual) => [...atual, criado]);
    return criado;
  }

  /**
   * Esse catálogo é compartilhado por todas as frentes — desativar aqui
   * some com o item da checklist pra todo mundo, não só desta frente (ver
   * `GET /equipamentos`, que só lista `ativo: true` por padrão). Por isso
   * confirma antes; RDOs já lançados com esse equipamento não são afetados.
   */
  async function removerEquipamentoDoCatalogo(item: EquipamentoCatalogo): Promise<void> {
    const confirmado = window.confirm(
      `Remover "${item.nome}" da lista de equipamentos? Isso afeta TODAS as frentes, não só esta — RDOs já lançados com ele não mudam.`,
    );
    if (!confirmado) return;
    try {
      await api.patch(`/equipamentos/${item.id}`, { ativo: false });
      setEquipamentosCatalogo((atual) => atual.filter((equipamento) => equipamento.id !== item.id));
    } catch (error) {
      setErroSalvar(error instanceof ApiError ? error.message : "Não foi possível remover o equipamento.");
    }
  }

  async function handleSalvar(): Promise<void> {
    if (!frenteId || !equipeId) {
      setErroSalvar("Escolha a frente e a equipe antes de salvar.");
      return;
    }
    // Croqui/dimensões (M/M²/M³) não faz sentido pra Motorista/Operador —
    // não bloqueamos mais isso durante a navegação entre abas (ver
    // handleTipoChange, que agora só troca a aba sem mexer nos dados), só
    // aqui, na hora de salvar de fato.
    if (tipo === "MOTORISTA_OPERADOR") {
      const temAtividadeDimensional = locais.some((local) =>
        local.atividades.some((atividade) => ["M", "M2", "M3"].includes(atividade.unidade)),
      );
      if (temAtividadeDimensional) {
        setErroSalvar(
          "Uma atividade lançada usa dimensões (M/M²/M³), que não é válido pra RDO tipo Motorista/Operador. Troque a atividade antes de salvar.",
        );
        return;
      }
    }
    setSalvando(true);
    setErroSalvar(null);

    const payload = {
      frenteId,
      equipeId,
      obraId: obraId === "" ? null : obraId,
      tipo,
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
          lado: local.lado || null,
          ordem,
          atividades: local.atividades.map((atividade) => ({
            atividadeCatalogoId: atividade.atividadeCatalogoId,
            ordemManutencaoId: atividade.ordemManutencaoId || null,
            statusOm: atividade.statusOm || null,
            percentualConcluido: atividade.percentualConcluido === "" ? null : Number(atividade.percentualConcluido),
            kmInicial: atividade.kmInicial === "" ? null : Number(atividade.kmInicial),
            kmFinal: atividade.kmFinal === "" ? null : Number(atividade.kmFinal),
            horimetroInicial: atividade.horimetroInicial === "" ? null : Number(atividade.horimetroInicial),
            horimetroFinal: atividade.horimetroFinal === "" ? null : Number(atividade.horimetroFinal),
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
        ...(equipeSelecionada?.membros ?? [])
          .filter((membro) => Number(maoDeObra[membro.id] ?? membro.quantidade) > 0)
          .map((membro) => ({
            funcaoId: membro.funcaoId,
            colaboradorId: membro.colaboradorId,
            quantidade: Number(maoDeObra[membro.id] ?? membro.quantidade),
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
            kmInicial: detalhe.kmInicial !== "" ? Number(detalhe.kmInicial) : null,
            kmFinal: detalhe.kmFinal !== "" ? Number(detalhe.kmFinal) : null,
            rota: detalhe.rota.trim() || null,
            combustivelLitros: detalhe.combustivelLitros !== "" ? Number(detalhe.combustivelLitros) : null,
            combustivelPosto: detalhe.combustivelPosto.trim() || null,
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

    try {
      if (emEdicao && id) {
        await api.patch(`/rdos/${id}`, payload);
        navigate(`/rdos/${id}`);
      } else {
        await api.post("/rdos/completo", payload);
        navigate("/rdos");
      }
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
            <h1 className="list-title">{emEdicao ? "Editar RDO" : "Cadastrar RDO completo"}</h1>
            <p className="list-subtitle">
              {emEdicao
                ? "Revise e corrija o RDO que o encarregado assinou no celular antes de enviar para o fiscal."
                : "Preencha o RDO inteiro de uma vez, como no relatório em papel."}
            </p>
          </div>
        </div>

        {erroCarga && <p className="feedback feedback--erro">{erroCarga}</p>}

        {ultimaDecisaoFiscal?.status === "REPROVADO" && (
          <p className="feedback feedback--erro" style={{ marginBottom: 16 }}>
            Reprovado pelo fiscal
            {ultimaDecisaoFiscal.assinanteNome ? ` (${ultimaDecisaoFiscal.assinanteNome})` : ""}
            {ultimaDecisaoFiscal.comentario ? `: ${ultimaDecisaoFiscal.comentario}` : ""} — corrija antes de reenviar.
          </p>
        )}

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
                disabled={emEdicao}
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
                disabled={emEdicao}
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
                disabled={emEdicao}
              />
            </div>
          </div>

          <div className="grid-2">
            <div>
              <label className="field-label" htmlFor="obraId">
                Obra (opcional)
              </label>
              <select
                id="obraId"
                className="field-input"
                value={obraId}
                onChange={(event) => setObraId(event.target.value)}
                disabled={emEdicao}
              >
                <option value="">Sem obra vinculada</option>
                {obras.map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {obra.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label">Tipo de RDO</label>
            <div className="campo-acoes" style={{ flexWrap: "wrap" }}>
              {TIPOS_RDO.map((opcao) => (
                <button
                  key={opcao}
                  type="button"
                  className={opcao === tipo ? "button button--small" : "button button--secondary button--small"}
                  disabled={emEdicao}
                  onClick={() => handleTipoChange(opcao)}
                >
                  {TIPO_RDO_LABEL[opcao]}
                </button>
              ))}
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

              <div style={{ marginTop: 8, maxWidth: 200 }}>
                <label className="field-label">Lado</label>
                <input
                  className="field-input"
                  placeholder="LE / LD"
                  value={local.lado}
                  onChange={(event) => atualizarLocal(localIndice, "lado", event.target.value)}
                />
              </div>

              <h3 className="field-label" style={{ marginTop: 16 }}>
                Atividades neste local
              </h3>
              {local.atividades.map((atividade, atividadeIndice) => {
                const usaDimensoes = ["M", "M2", "M3"].includes(atividade.unidade);
                const catalogoDaAtividade = atividadesCatalogo.find((item) => item.id === atividade.atividadeCatalogoId);
                const idSelect = `atividade-${localIndice}-${atividadeIndice}`;
                // A atividade já selecionada pode não estar mais na lista
                // filtrada do tipo atual (ex.: dimensional, escolhida antes
                // de trocar pra Motorista/Operador) — inclui ela mesmo
                // assim pro <select> mostrar o rótulo certo em vez de cair
                // por engano na primeira opção da lista filtrada (ver
                // handleTipoChange).
                const opcoesAtividade = atividadesCatalogoDoTipo.some((item) => item.id === atividade.atividadeCatalogoId)
                  ? atividadesCatalogoDoTipo
                  : catalogoDaAtividade
                    ? [...atividadesCatalogoDoTipo, catalogoDaAtividade]
                    : atividadesCatalogoDoTipo;
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
                      {opcoesAtividade.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.codigo} — {item.descricao}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      style={{ marginTop: 4 }}
                      onClick={() => setCriandoAtividadePara({ localIndice, atividadeIndice })}
                    >
                      + Nova atividade (fora da Price List)
                    </button>

                    <div style={{ marginTop: 12 }}>
                      <label className="field-label">Ordem de manutenção</label>
                      <Autocomplete
                        value={atividade.ordemManutencaoId}
                        items={ordensDaFrente}
                        getLabel={(om) => om.numero}
                        getSublabel={(om) => om.detalhes}
                        placeholder="Digite o número da OM…"
                        onChange={(ordemManutencaoId) =>
                          selecionarOrdemManutencao(localIndice, atividadeIndice, ordemManutencaoId)
                        }
                      />
                    </div>

                    {(tipo !== "MOTORISTA_OPERADOR" || totalAtividadesMotorista > 1) && (
                      <div className="grid-2" style={{ marginTop: 12 }}>
                        <div>
                          <label className="field-label">Km inicial</label>
                          <input
                            type="number"
                            step="0.001"
                            className="field-input"
                            placeholder="Preenchido pela OM, se houver"
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
                            placeholder="Preenchido pela OM, se houver"
                            value={atividade.kmFinal}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "kmFinal", event.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {tipo === "MOTORISTA_OPERADOR" && totalAtividadesMotorista > 1 && (
                      <div className="grid-2" style={{ marginTop: 12 }}>
                        <div>
                          <label className="field-label">Horímetro inicial</label>
                          <input
                            type="number"
                            step="0.01"
                            className="field-input"
                            placeholder="Ex.: 1234.50"
                            value={atividade.horimetroInicial}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "horimetroInicial", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Horímetro final</label>
                          <input
                            type="number"
                            step="0.01"
                            className="field-input"
                            placeholder="Ex.: 1240.00"
                            value={atividade.horimetroFinal}
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "horimetroFinal", event.target.value)}
                          />
                        </div>
                      </div>
                    )}
                    {tipo === "MOTORISTA_OPERADOR" && totalAtividadesMotorista <= 1 && (
                      <p className="list-subtitle" style={{ marginTop: 8 }}>
                        Km e horímetro desta viagem: preenchidos abaixo, na seção Equipamento.
                      </p>
                    )}

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
                      <p className="list-subtitle" style={{ marginTop: 4 }}>
                        Horas trabalhadas: {formatarHoras(duracaoEmHoras(atividade.horarioInicial, atividade.horarioFinal)!)}{" "}
                        (calculado do horário)
                      </p>
                    ) : (
                      <div style={{ marginTop: 12 }}>
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
                    )}

                    {atividade.ordemManutencaoId && (
                      <div className="grid-2" style={{ marginTop: 12 }}>
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
                            onChange={(event) => atualizarAtividade(localIndice, atividadeIndice, "percentualConcluido", event.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {tipo !== "MOTORISTA_OPERADOR" && (
                    <div style={{ marginTop: 12 }}>
                      <label className="field-label">Mão de obra nesta atividade</label>
                      {atividade.maoDeObra.map((item, itemIndice) => (
                        <div className="membro-add-row" key={itemIndice} style={{ marginBottom: 6 }}>
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
                    )}
                  </div>

                  {usaDimensoes && (
                    <CroquiAtividade
                      unidade={atividade.unidade}
                      altura={atividade.altura}
                      largura={atividade.largura}
                      larguraFinal={atividade.larguraFinal}
                      comprimento={atividade.comprimento}
                      descricaoAtividade={
                        atividade.pontosExtras.length > 0
                          ? `${catalogoDaAtividade?.descricao ?? ""} — Ponto 1`
                          : catalogoDaAtividade?.descricao
                      }
                    />
                  )}
                  </div>

                  {usaDimensoes &&
                    atividade.pontosExtras.map((ponto, pontoIndice) => (
                      <div className="atividade-com-croqui" key={pontoIndice} style={{ marginTop: 12 }}>
                        <div>
                          <div className="repeatable-item-header">
                            <span className="repeatable-item-titulo">Ponto {pontoIndice + 2}</span>
                            <button
                              type="button"
                              className="button button--ghost button--small"
                              onClick={() => removerPontoExtra(localIndice, atividadeIndice, pontoIndice)}
                            >
                              Remover ponto
                            </button>
                          </div>
                          {atividade.unidade === "M3" && (
                            <div className="grid-3">
                              <div>
                                <label className="field-label">Altura (m)</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="field-input"
                                  placeholder="0,00"
                                  value={ponto.altura}
                                  onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "altura", event.target.value)}
                                />
                              </div>
                              <div>
                                <label className="field-label">Largura (m)</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="field-input"
                                  placeholder="0,00"
                                  value={ponto.largura}
                                  onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "largura", event.target.value)}
                                />
                              </div>
                              <div>
                                <label className="field-label">Comprimento (m)</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="field-input"
                                  placeholder="0,00"
                                  value={ponto.comprimento}
                                  onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "comprimento", event.target.value)}
                                />
                              </div>
                            </div>
                          )}
                          {atividade.unidade === "M2" && (
                            <div className="grid-3">
                              <div>
                                <label className="field-label">Largura inicial (m)</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="field-input"
                                  placeholder="0,00"
                                  value={ponto.largura}
                                  onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "largura", event.target.value)}
                                />
                              </div>
                              <div>
                                <label className="field-label">Largura final (m) — opcional</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="field-input"
                                  placeholder="se afunilar/alargar"
                                  value={ponto.larguraFinal}
                                  onChange={(event) =>
                                    atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "larguraFinal", event.target.value)
                                  }
                                />
                              </div>
                              <div>
                                <label className="field-label">Comprimento (m)</label>
                                <input
                                  type="number"
                                  step="0.001"
                                  className="field-input"
                                  placeholder="0,00"
                                  value={ponto.comprimento}
                                  onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "comprimento", event.target.value)}
                                />
                              </div>
                            </div>
                          )}
                          {atividade.unidade === "M" && (
                            <div>
                              <label className="field-label">Comprimento (m)</label>
                              <input
                                type="number"
                                step="0.001"
                                className="field-input"
                                placeholder="0,00"
                                value={ponto.comprimento}
                                onChange={(event) => atualizarPontoExtra(localIndice, atividadeIndice, pontoIndice, "comprimento", event.target.value)}
                              />
                            </div>
                          )}
                        </div>
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
                      style={{ marginTop: 12 }}
                      onClick={() => adicionarPontoExtra(localIndice, atividadeIndice)}
                    >
                      + Adicionar ponto de medição
                    </button>
                  )}
                  </div>
                );
              })}
              <button
                type="button"
                className="button button--secondary button--small"
                onClick={() =>
                  setLocais((atual) =>
                    atual.map((l, i) =>
                      i === localIndice ? { ...l, atividades: [...l.atividades, novaAtividade(atividadesCatalogoDoTipo)] } : l,
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
            onClick={() => setLocais((atual) => [...atual, novoLocal(atividadesCatalogoDoTipo)])}
          >
            + Adicionar local
          </button>
        </section>

        {tipo !== "MOTORISTA_OPERADOR" && (
        <section className="form-section">
          <h2 className="form-section-title">Mão de obra</h2>
          {!equipeSelecionada || equipeSelecionada.membros.length === 0 ? (
            <p className="table-empty">Esta equipe ainda não tem membros cadastrados.</p>
          ) : (
            equipeSelecionada.membros.map((membro) => (
              <div className="checklist-row" key={membro.id}>
                <span>
                  {membro.colaborador ? `${membro.colaborador.nome} — ` : ""}
                  {membro.funcao.nome}
                </span>
                <input
                  type="number"
                  min={0}
                  className="field-input qty-input"
                  value={maoDeObra[membro.id] ?? String(membro.quantidade)}
                  onChange={(event) => setMaoDeObra((atual) => ({ ...atual, [membro.id]: event.target.value }))}
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
        )}

        <section className="form-section">
          <h2 className="form-section-title">
            {tipo === "MOTORISTA_OPERADOR" ? "Equipamento" : "Equipamentos / outros custos indiretos"}
          </h2>
          <p className="form-section-subtitle">
            {tipo === "MOTORISTA_OPERADOR"
              ? "Qual equipamento ele dirige ou opera nesse dia."
              : "Marque a quantidade de cada item usado no dia. Produção/horímetro é opcional — só abra pra equipamento que aponta por produção (ex.: terraplenagem)."}
          </p>
          {tipo === "MOTORISTA_OPERADOR" ? (
            <>
              <Autocomplete
                value={motoristaEquipamentoId}
                items={equipamentosCatalogo}
                getLabel={(item) => item.nome}
                placeholder="Buscar o equipamento…"
                onChange={selecionarEquipamentoMotorista}
                onCriar={criarEquipamento}
              />
              {motoristaEquipamentoId &&
                (() => {
                  const detalhe = equipamentosDetalhe[motoristaEquipamentoId] ?? detalheVazio();
                  return (
                    <div className="repeatable-item" style={{ marginTop: 12 }}>
                      <div className="grid-2">
                        <div>
                          <label className="field-label">Horímetro inicial</label>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="field-input"
                            placeholder="Ex.: 1234.50"
                            value={detalhe.horimetroInicial}
                            onChange={(event) => atualizarDetalheEquipamento(motoristaEquipamentoId, "horimetroInicial", event.target.value)}
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
                            onChange={(event) => atualizarDetalheEquipamento(motoristaEquipamentoId, "horimetroFinal", event.target.value)}
                          />
                        </div>
                      </div>
                      <div className="grid-2" style={{ marginTop: 8 }}>
                        <div>
                          <label className="field-label">Km inicial</label>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            className="field-input"
                            value={detalhe.kmInicial}
                            onChange={(event) => atualizarDetalheEquipamento(motoristaEquipamentoId, "kmInicial", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Km final</label>
                          <input
                            type="number"
                            step="0.1"
                            min={0}
                            className="field-input"
                            value={detalhe.kmFinal}
                            onChange={(event) => atualizarDetalheEquipamento(motoristaEquipamentoId, "kmFinal", event.target.value)}
                          />
                        </div>
                      </div>
                      <input
                        className="field-input"
                        style={{ marginTop: 8 }}
                        placeholder="Rota (ex.: Marabá — Parauapebas)"
                        value={detalhe.rota}
                        onChange={(event) => atualizarDetalheEquipamento(motoristaEquipamentoId, "rota", event.target.value)}
                      />
                      <div className="grid-2" style={{ marginTop: 8 }}>
                        <div>
                          <label className="field-label">Combustível abastecido (litros)</label>
                          <input
                            type="number"
                            step="0.01"
                            min={0}
                            className="field-input"
                            value={detalhe.combustivelLitros}
                            onChange={(event) => atualizarDetalheEquipamento(motoristaEquipamentoId, "combustivelLitros", event.target.value)}
                          />
                        </div>
                        <div>
                          <label className="field-label">Posto</label>
                          <input
                            className="field-input"
                            value={detalhe.combustivelPosto}
                            onChange={(event) => atualizarDetalheEquipamento(motoristaEquipamentoId, "combustivelPosto", event.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()}
            </>
          ) : equipamentosCatalogo.length === 0 ? (
            <p className="table-empty">Nenhum equipamento cadastrado no catálogo.</p>
          ) : (
            equipamentosCatalogo.map((item) => {
              const detalhe = equipamentosDetalhe[item.id] ?? detalheVazio();
              const aberto = equipamentosDetalheAberto[item.id] ?? false;
              return (
                <div key={item.id} style={{ marginBottom: 4 }}>
                  <div className="checklist-row checklist-row--equipamento">
                    <span>{item.nome}</span>
                    <input
                      type="number"
                      min={0}
                      className="field-input qty-input"
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
                    <button
                      type="button"
                      className="button button--ghost button--small"
                      title="Remove este item da lista de equipamentos pra todas as frentes"
                      onClick={() => void removerEquipamentoDoCatalogo(item)}
                    >
                      Remover
                    </button>
                  </div>
                  {aberto && (
                    <div className="repeatable-item" style={{ marginTop: 4 }}>
                      <div className="grid-3">
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
                      <p className="form-section-subtitle" style={{ marginTop: 8 }}>
                        Ou, se a máquina é apontada por horímetro (ex.: retroescavadeira, pá carregadeira): horímetro
                        inicial e final do dia.
                      </p>
                      <div className="grid-2">
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

        <section className="form-section">
          <h2 className="form-section-title">Materiais</h2>
          <p className="form-section-subtitle">Catálogo oficial do contrato (Price List)</p>
          {materiais.map((material, indice) => {
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
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button type="button" className="button button--secondary button--small" onClick={adicionarMaterial}>
              + Adicionar material
            </button>
            <button type="button" className="button button--ghost button--small" onClick={() => setCriandoMaterial(true)}>
              + Cadastrar material novo (fora da Price List)
            </button>
          </div>
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

        <section className="form-section">
          <h2 className="form-section-title">Fechamento do dia</h2>
          <p className="list-subtitle">
            {formatarHoras(horasApontadasDia)} apontadas (linha do tempo + atividades) de {JORNADA_REFERENCIA_HORAS}h de
            referência ({horasApontadasDia >= JORNADA_REFERENCIA_HORAS ? "jornada completa" : "faltam apontar horas"}).
          </p>
        </section>

        {erroSalvar && <p className="feedback feedback--erro">{erroSalvar}</p>}

        <div className="form-actions">
          <button type="button" className="button" disabled={salvando} onClick={() => void handleSalvar()}>
            {salvando ? "Salvando…" : emEdicao ? "Salvar correções" : "Salvar RDO"}
          </button>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => navigate(emEdicao && id ? `/rdos/${id}` : "/rdos")}
          >
            Cancelar
          </button>
        </div>
      </div>

      {criandoAtividadePara && (
        <CriarAtividadeModal
          somenteSemDimensao={tipo === "MOTORISTA_OPERADOR"}
          onClose={() => setCriandoAtividadePara(null)}
          onCriada={(criada) => {
            selecionarAtividadeRecemCriada(criandoAtividadePara.localIndice, criandoAtividadePara.atividadeIndice, criada);
            setCriandoAtividadePara(null);
          }}
        />
      )}

      {criandoMaterial && frenteSelecionada && (
        <CriarMaterialModal
          contratoId={frenteSelecionada.contratoId}
          onClose={() => setCriandoMaterial(false)}
          onCriado={(criado) => {
            adicionarMaterialRecemCriado(criado);
            setCriandoMaterial(false);
          }}
        />
      )}
    </div>
  );
}

/** Atividade fora da Price List oficial do contrato — código/descrição livres, unidade do catálogo padrão (M/M2/M3/UND/HH/M3KM). */
function CriarAtividadeModal({
  somenteSemDimensao,
  onClose,
  onCriada,
}: {
  somenteSemDimensao: boolean;
  onClose: () => void;
  onCriada: (atividade: AtividadeCatalogo) => void;
}): ReactElement {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState<AtividadeCatalogo["unidade"]>("UND");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const criada = await api.post<AtividadeCatalogo>("/atividades", { codigo, descricao, unidade, usaDimensoes: false });
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
        <h2 className="modal-title">Nova atividade</h2>
        <p className="list-subtitle">
          Pra um serviço que não está na Price List do contrato — fica salvo no catálogo, disponível pra escolher de
          novo depois.
        </p>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="novaAtividadeCodigo">
            Código
          </label>
          <input
            id="novaAtividadeCodigo"
            className="field-input"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            autoComplete="off"
            autoFocus
          />

          <label className="field-label" htmlFor="novaAtividadeDescricao">
            Descrição
          </label>
          <input
            id="novaAtividadeDescricao"
            className="field-input"
            placeholder="Ex.: Transporte de material"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="novaAtividadeUnidade">
            Unidade
          </label>
          <select
            id="novaAtividadeUnidade"
            className="field-input"
            value={unidade}
            onChange={(event) => setUnidade(event.target.value as AtividadeCatalogo["unidade"])}
          >
            {(somenteSemDimensao ? UNIDADES_SEM_DIMENSAO : UNIDADES_ATIVIDADE).map((valor) => (
              <option key={valor} value={valor}>
                {valor}
              </option>
            ))}
          </select>
          {somenteSemDimensao && (
            <p className="list-subtitle">
              Sem unidade de "viagem" ainda — pra contar viagens/cargas, use UND (unidade genérica).
            </p>
          )}

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Salvando…" : "Criar e usar"}
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

/** Material fora da Price List oficial do contrato — código/descrição/unidade livres, ligado ao contrato da frente escolhida no RDO. */
function CriarMaterialModal({
  contratoId,
  onClose,
  onCriado,
}: {
  contratoId: string;
  onClose: () => void;
  onCriado: (material: MaterialCatalogo) => void;
}): ReactElement {
  const [codigo, setCodigo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [unidade, setUnidade] = useState("UND");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      const criado = await api.post<MaterialCatalogo>("/materiais", { contratoId, codigo, descricao, unidade });
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
        <h2 className="modal-title">Novo material</h2>
        <p className="list-subtitle">
          Pra um material que não está na Price List do contrato — fica salvo no catálogo desse contrato, disponível
          pra escolher de novo depois.
        </p>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="novoMaterialCodigo">
            Código
          </label>
          <input
            id="novoMaterialCodigo"
            className="field-input"
            value={codigo}
            onChange={(event) => setCodigo(event.target.value)}
            autoComplete="off"
            autoFocus
          />

          <label className="field-label" htmlFor="novoMaterialDescricao">
            Descrição
          </label>
          <input
            id="novoMaterialDescricao"
            className="field-input"
            value={descricao}
            onChange={(event) => setDescricao(event.target.value)}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="novoMaterialUnidade">
            Unidade
          </label>
          <input
            id="novoMaterialUnidade"
            className="field-input"
            placeholder="Ex.: UND, KG, M, L…"
            value={unidade}
            onChange={(event) => setUnidade(event.target.value)}
            autoComplete="off"
          />

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Salvando…" : "Criar e usar"}
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
