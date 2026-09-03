import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface RdoDoCalendario {
  id: string;
  data: string;
  status: string;
  equipe: { id: string; nome: string };
  frente: { id: string; nome: string };
}

interface RespostaCalendario {
  obra: { id: string; nome: string };
  periodo: { mes: string; inicio: string; fim: string };
  rdos: RdoDoCalendario[];
}

interface MaterialTotal {
  materialCatalogoId: string;
  descricao: string;
  unidade: string;
  quantidadeTotal: number;
}

interface MaterialPorData {
  rdoId: string;
  data: string;
  equipe: string;
  materiais: Array<{ descricao: string; unidade: string; quantidade: number }>;
}

interface RespostaMateriais {
  obra: { id: string; nome: string };
  totais: MaterialTotal[];
  porData: MaterialPorData[];
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "Aguardando o escritório",
  AGUARDANDO_APROVACAO: "Aguardando o fiscal",
  REPROVADO: "Reprovado",
  APROVADO: "Aprovado",
};

const STATUS_DOT_CLASSE: Record<string, string> = {
  RASCUNHO: "farol-dot--rascunho",
  EM_CORRECAO: "farol-dot--correcao",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "farol-dot--validacao",
  AGUARDANDO_APROVACAO: "farol-dot--aguardando",
  REPROVADO: "farol-dot--reprovado",
  APROVADO: "farol-dot--aprovado",
};

const DIAS_SEMANA_ABREV = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function mesAtual(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function formatarNumero(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** Dias do mês em semanas (linhas de 7), com null nas posições fora do mês — pra desenhar a grade do calendário. */
function montarSemanas(mes: string): Array<Array<number | null>> {
  const [anoStr, mesStr] = mes.split("-");
  const ano = Number(anoStr);
  const mesNum = Number(mesStr);
  const primeiroDia = new Date(Date.UTC(ano, mesNum - 1, 1));
  const totalDias = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate();
  const offset = primeiroDia.getUTCDay();

  const dias: Array<number | null> = [...Array(offset).fill(null), ...Array.from({ length: totalDias }, (_, i) => i + 1)];
  while (dias.length % 7 !== 0) dias.push(null);

  const semanas: Array<Array<number | null>> = [];
  for (let i = 0; i < dias.length; i += 7) semanas.push(dias.slice(i, i + 7));
  return semanas;
}

export default function ObraDetalhe(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [aba, setAba] = useState<"calendario" | "materiais">("calendario");
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<RespostaCalendario | null>(null);
  const [materiais, setMateriais] = useState<RespostaMateriais | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    setErro(null);
    api
      .get<RespostaCalendario>(`/obras/${id}/calendario?mes=${mes}`)
      .then((resposta) => {
        if (!cancelado) setDados(resposta);
      })
      .catch((error) => {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o cronograma.");
      });
    return () => {
      cancelado = true;
    };
  }, [id, mes]);

  useEffect(() => {
    if (!id) return;
    let cancelado = false;
    api
      .get<RespostaMateriais>(`/obras/${id}/materiais`)
      .then((resposta) => {
        if (!cancelado) setMateriais(resposta);
      })
      .catch((error) => {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os materiais.");
      });
    return () => {
      cancelado = true;
    };
  }, [id]);

  const rdosPorDia = useMemo(() => {
    const mapa = new Map<number, RdoDoCalendario[]>();
    for (const rdo of dados?.rdos ?? []) {
      const dia = Number(rdo.data.slice(8, 10));
      const atual = mapa.get(dia) ?? [];
      atual.push(rdo);
      mapa.set(dia, atual);
    }
    return mapa;
  }, [dados]);

  const semanas = useMemo(() => montarSemanas(mes), [mes]);

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">{dados?.obra.nome ?? "Obra"}</h1>
            <p className="list-subtitle">Cronograma de lançamentos e materiais usados nesta obra</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
            <button type="button" className="button button--secondary" onClick={() => navigate("/obras")}>
              Voltar
            </button>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="tabs-row">
          <button
            type="button"
            className={`tab-button${aba === "calendario" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("calendario")}
          >
            Calendário
          </button>
          <button
            type="button"
            className={`tab-button${aba === "materiais" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("materiais")}
          >
            Materiais
          </button>
        </div>

        {aba === "calendario" ? (
          !dados ? (
            <p className="table-empty">Carregando…</p>
          ) : (
            <div className="panel">
              <div className="farol-legenda-bar">
                {Object.entries(STATUS_LABEL).map(([status, texto]) => (
                  <span className="farol-legenda-item" key={status}>
                    <span className={`farol-dot ${STATUS_DOT_CLASSE[status]}`} />
                    {texto}
                  </span>
                ))}
              </div>
              <div className="obra-calendario">
                <div className="obra-calendario-semana obra-calendario-cabecalho">
                  {DIAS_SEMANA_ABREV.map((dia) => (
                    <div key={dia} className="obra-calendario-dia-cabecalho">
                      {dia}
                    </div>
                  ))}
                </div>
                {semanas.map((semana, indice) => (
                  <div className="obra-calendario-semana" key={indice}>
                    {semana.map((dia, indiceDia) => (
                      <div key={indiceDia} className={`obra-calendario-dia${dia === null ? " obra-calendario-dia--vazio" : ""}`}>
                        {dia !== null && (
                          <>
                            <span className="obra-calendario-dia-numero">{dia}</span>
                            <div className="obra-calendario-rdos">
                              {(rdosPorDia.get(dia) ?? []).map((rdo) => (
                                <button
                                  type="button"
                                  key={rdo.id}
                                  className="obra-calendario-rdo-item"
                                  title={`${rdo.equipe.nome} — ${STATUS_LABEL[rdo.status] ?? rdo.status}`}
                                  onClick={() => navigate(`/rdos/${rdo.id}`)}
                                >
                                  <span className={`farol-dot ${STATUS_DOT_CLASSE[rdo.status] ?? "farol-dot--vazio"}`} />
                                  {rdo.equipe.nome}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          )
        ) : !materiais ? (
          <p className="table-empty">Carregando…</p>
        ) : (
          <>
            <div className="panel">
              <p className="list-subtitle" style={{ padding: "14px 18px 0" }}>
                Total de cada material já lançado nessa obra, somando todos os RDOs.
              </p>
              {materiais.totais.length === 0 ? (
                <p className="table-empty">Nenhum material lançado ainda.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Material</th>
                      <th>Quantidade total</th>
                      <th>Unidade</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiais.totais.map((item) => (
                      <tr key={item.materialCatalogoId}>
                        <td>{item.descricao}</td>
                        <td>{formatarNumero(item.quantidadeTotal)}</td>
                        <td>{item.unidade}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="panel" style={{ marginTop: 16 }}>
              <p className="list-subtitle" style={{ padding: "14px 18px 0" }}>
                Detalhe por lançamento — o que entrou, em qual data, por qual equipe.
              </p>
              {materiais.porData.length === 0 ? (
                <p className="table-empty">Nenhum lançamento com material ainda.</p>
              ) : (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Equipe</th>
                      <th>Materiais</th>
                    </tr>
                  </thead>
                  <tbody>
                    {materiais.porData.map((linha) => (
                      <tr key={linha.rdoId}>
                        <td>{formatarData(linha.data)}</td>
                        <td>{linha.equipe}</td>
                        <td>
                          {linha.materiais.map((item, indice) => (
                            <div key={indice}>
                              {item.descricao} — {formatarNumero(item.quantidade)} {item.unidade}
                            </div>
                          ))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
