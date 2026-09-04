import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";
import { lerSessao, limparSessao } from "../lib/session";
import PerfilUsuario from "../components/PerfilUsuario";

interface Ref {
  id: string;
  nome: string;
}

interface EquipeMembro {
  id: string;
  colaborador: Ref | null;
  funcao: Ref;
  quantidade: number;
}

interface EquipeResumo {
  id: string;
  nome: string;
  encarregadoId: string | null;
  membros: EquipeMembro[];
}

interface DistritoResumo {
  id: string;
  nome: string;
  equipes: EquipeResumo[];
}

interface ColaboradorResumo {
  id: string;
  nome: string;
  funcaoId: string;
}

interface EncarregadoResponse {
  frente: { id: string; nome: string; codigo: string };
  distritos: DistritoResumo[];
  funcoes: Ref[];
  colaboradores: ColaboradorResumo[];
  obras: Ref[];
}

const TIPO_RDO_LABEL: Record<string, string> = {
  PREVENTIVA_CORRETIVA: "Preventiva / Corretiva",
  TERRAPLENAGEM: "Terraplenagem",
  SUPERESTRUTURA: "Superestrutura",
  MOTORISTA_OPERADOR: "Motorista / Operador",
};
const TIPOS_RDO = ["PREVENTIVA_CORRETIVA", "TERRAPLENAGEM", "SUPERESTRUTURA", "MOTORISTA_OPERADOR"] as const;

function chaveMemoriaEquipe(): string {
  return "golias:encarregado:ultimaEquipeId";
}

function chaveMemoriaTipo(equipeId: string): string {
  return `golias:encarregado:${equipeId}:ultimoTipo`;
}

function chaveMemoriaObra(equipeId: string): string {
  return `golias:encarregado:${equipeId}:ultimaObraId`;
}

function lerMemoria(chave: string): string | null {
  try {
    return localStorage.getItem(chave);
  } catch {
    return null;
  }
}

function salvarMemoria(chave: string, valor: string): void {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // localStorage indisponível — segue sem lembrar
  }
}

/**
 * Tela do encarregado logado — mesma função do antigo /encarregado/:token
 * (link fixo por frente), só que a frente vem da sessão, o RDO de hoje já
 * nasce com o encarregadoId do usuário logado, e agora escolhe o tipo de
 * RDO (Preventiva/Corretiva, Terraplenagem ou Superestrutura) antes de
 * lançar — cada tipo abre um formulário diferente.
 */
export default function EncarregadoDashboard(): ReactElement {
  const navigate = useNavigate();
  const sessao = lerSessao();

  const [dados, setDados] = useState<EncarregadoResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [distritoId, setDistritoId] = useState("");
  const [equipeId, setEquipeId] = useState("");
  const [tipoRdo, setTipoRdo] = useState<(typeof TIPOS_RDO)[number]>("PREVENTIVA_CORRETIVA");
  const [obraId, setObraId] = useState("");

  const [mostrarNovaEquipe, setMostrarNovaEquipe] = useState(false);
  const [novaEquipeNome, setNovaEquipeNome] = useState("");
  const [criandoEquipe, setCriandoEquipe] = useState(false);

  const [novoMembroFuncaoId, setNovoMembroFuncaoId] = useState("");
  const [novoMembroColaboradorId, setNovoMembroColaboradorId] = useState("");
  const [novoMembroQuantidade, setNovoMembroQuantidade] = useState("1");
  const [salvandoMembro, setSalvandoMembro] = useState(false);

  const [lancando, setLancando] = useState(false);

  async function carregar(manterSelecao: boolean): Promise<void> {
    try {
      const resposta = await api.get<EncarregadoResponse>("/encarregado/equipes");
      setDados(resposta);

      if (!manterSelecao) {
        const ultimaEquipeId = lerMemoria(chaveMemoriaEquipe());
        if (ultimaEquipeId) {
          for (const distrito of resposta.distritos) {
            if (distrito.equipes.some((equipe) => equipe.id === ultimaEquipeId)) {
              setDistritoId(distrito.id);
              setEquipeId(ultimaEquipeId);
              const ultimoTipo = lerMemoria(chaveMemoriaTipo(ultimaEquipeId));
              if (ultimoTipo && (TIPOS_RDO as readonly string[]).includes(ultimoTipo)) {
                setTipoRdo(ultimoTipo as (typeof TIPOS_RDO)[number]);
              }
              const ultimaObraId = lerMemoria(chaveMemoriaObra(ultimaEquipeId));
              if (ultimaObraId && resposta.obras.some((obra) => obra.id === ultimaObraId)) {
                setObraId(ultimaObraId);
              }
              break;
            }
          }
        }
      }
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o portal.");
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    void carregar(false);
  }, []);

  function sair(): void {
    limparSessao();
    navigate("/login");
  }

  const distritoSelecionado = dados?.distritos.find((distrito) => distrito.id === distritoId) ?? null;
  const equipeSelecionada = distritoSelecionado?.equipes.find((equipe) => equipe.id === equipeId) ?? null;

  const colaboradoresDaFuncao = useMemo(
    () => (dados?.colaboradores ?? []).filter((colaborador) => colaborador.funcaoId === novoMembroFuncaoId),
    [dados, novoMembroFuncaoId],
  );

  function selecionarDistrito(id: string): void {
    setDistritoId(id);
    setEquipeId("");
  }

  function selecionarEquipe(id: string): void {
    setEquipeId(id);
    if (id) {
      salvarMemoria(chaveMemoriaEquipe(), id);
      const ultimoTipo = lerMemoria(chaveMemoriaTipo(id));
      if (ultimoTipo && (TIPOS_RDO as readonly string[]).includes(ultimoTipo)) {
        setTipoRdo(ultimoTipo as (typeof TIPOS_RDO)[number]);
      }
      const ultimaObraId = lerMemoria(chaveMemoriaObra(id));
      setObraId(ultimaObraId && (dados?.obras ?? []).some((obra) => obra.id === ultimaObraId) ? ultimaObraId : "");
    }
  }

  async function criarEquipe(): Promise<void> {
    if (!distritoId || !novaEquipeNome.trim()) return;
    setCriandoEquipe(true);
    setErro(null);
    try {
      const equipe = await api.post<EquipeResumo>("/encarregado/equipes", { nome: novaEquipeNome.trim(), distritoId });
      await carregar(true);
      setEquipeId(equipe.id);
      salvarMemoria(chaveMemoriaEquipe(), equipe.id);
      setNovaEquipeNome("");
      setMostrarNovaEquipe(false);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível criar a equipe.");
    } finally {
      setCriandoEquipe(false);
    }
  }

  async function adicionarMembro(): Promise<void> {
    if (!equipeId || !novoMembroFuncaoId) return;
    setSalvandoMembro(true);
    setErro(null);
    try {
      const colaboradorId = novoMembroColaboradorId || null;
      const quantidade = Number(novoMembroQuantidade) || 1;
      const existente = equipeSelecionada?.membros.find(
        (membro) => membro.funcao.id === novoMembroFuncaoId && (membro.colaborador?.id ?? null) === colaboradorId,
      );
      if (existente) {
        await api.patch(`/encarregado/equipes/${equipeId}/membros/${existente.id}`, {
          quantidade: existente.quantidade + quantidade,
        });
      } else {
        await api.post(`/encarregado/equipes/${equipeId}/membros`, { funcaoId: novoMembroFuncaoId, colaboradorId, quantidade });
      }
      await carregar(true);
      setNovoMembroFuncaoId("");
      setNovoMembroColaboradorId("");
      setNovoMembroQuantidade("1");
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível adicionar o membro.");
    } finally {
      setSalvandoMembro(false);
    }
  }

  async function alterarQuantidadeMembro(membroId: string, quantidade: number): Promise<void> {
    if (!equipeId || quantidade < 1) return;
    setErro(null);
    try {
      await api.patch(`/encarregado/equipes/${equipeId}/membros/${membroId}`, { quantidade });
      await carregar(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível alterar a quantidade.");
    }
  }

  async function removerMembro(membroId: string): Promise<void> {
    if (!equipeId) return;
    setErro(null);
    try {
      await api.delete(`/encarregado/equipes/${equipeId}/membros/${membroId}`);
      await carregar(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível remover o membro.");
    }
  }

  async function lancarProducao(): Promise<void> {
    if (!equipeId) return;
    setLancando(true);
    setErro(null);
    try {
      salvarMemoria(chaveMemoriaTipo(equipeId), tipoRdo);
      if (obraId) salvarMemoria(chaveMemoriaObra(equipeId), obraId);
      const resposta = await api.post<{ linkCampoToken: string; tipo: string }>("/encarregado/rdo-hoje", {
        equipeId,
        tipo: tipoRdo,
        obraId: obraId || null,
      });
      if (resposta.tipo === "SUPERESTRUTURA") {
        navigate(`/campo-superestrutura/${resposta.linkCampoToken}`);
      } else {
        navigate(`/campo/${resposta.linkCampoToken}`);
      }
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível abrir o RDO de hoje.");
      setLancando(false);
    }
  }

  if (carregando) {
    return (
      <div className="placeholder-page">
        <p className="loading-text">Carregando…</p>
      </div>
    );
  }

  if (erro && !dados) {
    return (
      <div className="placeholder-page">
        <div className="placeholder-card">
          <h1>GOLIAS</h1>
          <p className="description">{erro}</p>
        </div>
      </div>
    );
  }

  if (!dados) return <></>;

  return (
    <div className="campo-page">
      <div className="campo-brand">
        <p className="campo-brand-title">GOLIAS</p>
        <p className="campo-brand-subtitle">Gestão de contratos</p>
      </div>
      <div className="campo-card" style={{ maxWidth: 720 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h1>Portal do encarregado</h1>
            <p className="subtitle">
              {dados.frente.nome} — {sessao?.usuario.nome}
            </p>
          </div>
          <span style={{ display: "flex", gap: 8 }}>
            <PerfilUsuario />
            <button type="button" className="button button--ghost button--small" onClick={sair}>
              Sair
            </button>
          </span>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <label className="field-label">Distrito</label>
        <select className="field-input" value={distritoId} onChange={(event) => selecionarDistrito(event.target.value)}>
          <option value="">Selecione o distrito</option>
          {dados.distritos.map((distrito) => (
            <option key={distrito.id} value={distrito.id}>
              {distrito.nome}
            </option>
          ))}
        </select>

        {distritoSelecionado && (
          <>
            <label className="field-label" style={{ marginTop: 12 }}>
              Equipe
            </label>
            <select className="field-input" value={equipeId} onChange={(event) => selecionarEquipe(event.target.value)}>
              <option value="">Selecione a equipe</option>
              {distritoSelecionado.equipes.map((equipe) => (
                <option key={equipe.id} value={equipe.id}>
                  {equipe.nome}
                </option>
              ))}
            </select>

            {!mostrarNovaEquipe ? (
              <button
                type="button"
                className="button button--ghost button--small"
                style={{ marginTop: 8 }}
                onClick={() => setMostrarNovaEquipe(true)}
              >
                + Montar equipe nova neste distrito
              </button>
            ) : (
              <div className="campo-acoes" style={{ marginTop: 8 }}>
                <input
                  className="field-input"
                  placeholder="Nome da equipe"
                  value={novaEquipeNome}
                  onChange={(event) => setNovaEquipeNome(event.target.value)}
                />
                <button type="button" className="button button--small" disabled={criandoEquipe} onClick={() => void criarEquipe()}>
                  {criandoEquipe ? "Criando…" : "Criar"}
                </button>
                <button
                  type="button"
                  className="button button--ghost button--small"
                  onClick={() => {
                    setMostrarNovaEquipe(false);
                    setNovaEquipeNome("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {equipeSelecionada && (
        <div className="campo-card" style={{ maxWidth: 720, marginTop: 16 }}>
          <h2>Equipe de hoje — {equipeSelecionada.nome}</h2>

          {equipeSelecionada.membros.length === 0 ? (
            <p className="list-subtitle">Nenhum membro lançado ainda.</p>
          ) : (
            <ul className="causa-lista">
              {equipeSelecionada.membros.map((membro) => (
                <li key={membro.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <span>
                    {membro.funcao.nome}
                    {membro.colaborador ? ` — ${membro.colaborador.nome}` : ""}
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                    <input
                      type="number"
                      min={1}
                      className="field-input"
                      style={{ width: 64, textAlign: "center" }}
                      value={membro.quantidade}
                      onChange={(event) => void alterarQuantidadeMembro(membro.id, Number(event.target.value))}
                    />
                    <button type="button" className="button button--ghost button--small" onClick={() => void removerMembro(membro.id)}>
                      Remover
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="campo-subtitulo">Adicionar à equipe</h3>
          <div className="campo-grid-3">
            <select
              className="field-input"
              value={novoMembroFuncaoId}
              onChange={(event) => {
                setNovoMembroFuncaoId(event.target.value);
                setNovoMembroColaboradorId("");
              }}
            >
              <option value="">Função</option>
              {dados.funcoes.map((funcao) => (
                <option key={funcao.id} value={funcao.id}>
                  {funcao.nome}
                </option>
              ))}
            </select>
            <select
              className="field-input"
              value={novoMembroColaboradorId}
              onChange={(event) => setNovoMembroColaboradorId(event.target.value)}
              disabled={!novoMembroFuncaoId}
            >
              <option value="">Posto genérico (sem nome)</option>
              {colaboradoresDaFuncao.map((colaborador) => (
                <option key={colaborador.id} value={colaborador.id}>
                  {colaborador.nome}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              className="field-input"
              value={novoMembroQuantidade}
              onChange={(event) => setNovoMembroQuantidade(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="button button--secondary button--small"
            disabled={!novoMembroFuncaoId || salvandoMembro}
            onClick={() => void adicionarMembro()}
          >
            {salvandoMembro ? "Adicionando…" : "+ Adicionar"}
          </button>

          {dados.obras.length > 0 && (
            <>
              <h3 className="campo-subtitulo">Obra</h3>
              <select className="field-input" value={obraId} onChange={(event) => setObraId(event.target.value)}>
                <option value="">Sem obra vinculada</option>
                {dados.obras.map((obra) => (
                  <option key={obra.id} value={obra.id}>
                    {obra.nome}
                  </option>
                ))}
              </select>
            </>
          )}

          <h3 className="campo-subtitulo">Tipo de RDO</h3>
          <div className="campo-acoes" style={{ flexWrap: "wrap" }}>
            {TIPOS_RDO.map((tipo) => (
              <button
                key={tipo}
                type="button"
                className={tipo === tipoRdo ? "button button--small" : "button button--secondary button--small"}
                onClick={() => setTipoRdo(tipo)}
              >
                {TIPO_RDO_LABEL[tipo]}
              </button>
            ))}
          </div>

          <div className="campo-acoes" style={{ marginTop: 20 }}>
            <button type="button" className="button" disabled={lancando} onClick={() => void lancarProducao()}>
              {lancando ? "Abrindo…" : "Lançar Produção"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
