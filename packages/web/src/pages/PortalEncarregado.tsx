import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";

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

interface PortalEncarregadoResponse {
  frente: { id: string; nome: string; codigo: string };
  distritos: DistritoResumo[];
  funcoes: Ref[];
  colaboradores: ColaboradorResumo[];
}

function chaveMemoria(token: string): string {
  return `golias:encarregado:${token}:equipeId`;
}

function lerUltimaEquipe(token: string): string | null {
  try {
    return localStorage.getItem(chaveMemoria(token));
  } catch {
    return null;
  }
}

function salvarUltimaEquipe(token: string, equipeId: string): void {
  try {
    localStorage.setItem(chaveMemoria(token), equipeId);
  } catch {
    // localStorage indisponível (ex.: navegação privada) — segue sem lembrar.
  }
}

export default function PortalEncarregado(): ReactElement {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();

  const [dados, setDados] = useState<PortalEncarregadoResponse | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  const [distritoId, setDistritoId] = useState("");
  const [equipeId, setEquipeId] = useState("");

  const [mostrarNovaEquipe, setMostrarNovaEquipe] = useState(false);
  const [novaEquipeNome, setNovaEquipeNome] = useState("");
  const [criandoEquipe, setCriandoEquipe] = useState(false);

  const [novoMembroFuncaoId, setNovoMembroFuncaoId] = useState("");
  const [novoMembroColaboradorId, setNovoMembroColaboradorId] = useState("");
  const [novoMembroQuantidade, setNovoMembroQuantidade] = useState("1");
  const [salvandoMembro, setSalvandoMembro] = useState(false);

  const [lancando, setLancando] = useState(false);

  async function carregar(manterSelecao: boolean): Promise<void> {
    if (!token) return;
    try {
      const resposta = await api.get<PortalEncarregadoResponse>(`/portal-encarregado/${token}`);
      setDados(resposta);

      if (!manterSelecao) {
        const ultimaEquipeId = lerUltimaEquipe(token);
        if (ultimaEquipeId) {
          for (const distrito of resposta.distritos) {
            if (distrito.equipes.some((equipe) => equipe.id === ultimaEquipeId)) {
              setDistritoId(distrito.id);
              setEquipeId(ultimaEquipeId);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    if (token && id) salvarUltimaEquipe(token, id);
  }

  async function criarEquipe(): Promise<void> {
    if (!token || !distritoId || !novaEquipeNome.trim()) return;
    setCriandoEquipe(true);
    setErro(null);
    try {
      const equipe = await api.post<EquipeResumo>(`/portal-encarregado/${token}/equipes`, {
        nome: novaEquipeNome.trim(),
        distritoId,
      });
      await carregar(true);
      setEquipeId(equipe.id);
      salvarUltimaEquipe(token, equipe.id);
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
      // Já existe uma linha igual (mesma função e mesmo colaborador, ou
      // ambos genéricos)? Soma na existente em vez de criar outra — cada
      // clique em "+ Adicionar" não pode virar uma linha nova de "1", senão
      // a mesma função aparece repetida várias vezes na mão de obra do RDO.
      const existente = equipeSelecionada?.membros.find(
        (membro) => membro.funcao.id === novoMembroFuncaoId && (membro.colaborador?.id ?? null) === colaboradorId,
      );
      if (existente) {
        await api.patch(`/equipes/${equipeId}/membros/${existente.id}`, { quantidade: existente.quantidade + quantidade });
      } else {
        await api.post(`/equipes/${equipeId}/membros`, { funcaoId: novoMembroFuncaoId, colaboradorId, quantidade });
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

  async function removerMembro(membroId: string): Promise<void> {
    if (!equipeId) return;
    setErro(null);
    try {
      await api.delete(`/equipes/${equipeId}/membros/${membroId}`);
      await carregar(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível remover o membro.");
    }
  }

  async function lancarProducao(): Promise<void> {
    if (!token || !equipeId) return;
    setLancando(true);
    setErro(null);
    try {
      const resposta = await api.post<{ linkCampoToken: string }>(
        `/portal-encarregado/${token}/equipes/${equipeId}/rdo-hoje`,
        {},
      );
      navigate(`/campo/${resposta.linkCampoToken}`);
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
        <h1>Portal do encarregado</h1>
        <p className="subtitle">{dados.frente.nome}</p>

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
                <li key={membro.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>
                    {membro.funcao.nome}
                    {membro.colaborador ? ` — ${membro.colaborador.nome}` : ""} ({membro.quantidade})
                  </span>
                  <button type="button" className="button button--ghost button--small" onClick={() => void removerMembro(membro.id)}>
                    Remover
                  </button>
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
