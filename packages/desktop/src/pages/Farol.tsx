import { useEffect, useState, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface DiaFarol {
  data: string;
  diaSemana: string;
  realizada: number;
  aguardandoValidacao: number;
  reprovada: number;
  pendente: number;
  naoExecutada: number;
  total: number;
}

interface RespostaFarol {
  periodo: { inicio: string; fim: string };
  dias: DiaFarol[];
}

interface LinhaFarolRdo {
  equipeId: string;
  equipe: string;
  distrito: string;
  encarregado: string | null;
  porDia: Record<string, string | null>;
}

interface RespostaFarolRdo {
  periodo: string;
  dias: string[];
  linhas: LinhaFarolRdo[];
}

const RDO_STATUS_DOT_CLASSE: Record<string, string> = {
  APROVADO: "farol-dot--aprovado",
  AGUARDANDO_APROVACAO: "farol-dot--aguardando",
  REPROVADO: "farol-dot--reprovado",
  EM_CORRECAO: "farol-dot--correcao",
  RASCUNHO: "farol-dot--rascunho",
};

const RDO_STATUS_LABEL: Record<string, string> = {
  APROVADO: "Aprovado",
  AGUARDANDO_APROVACAO: "Aguardando aprovação do fiscal",
  REPROVADO: "Reprovado pelo fiscal",
  EM_CORRECAO: "Em correção",
  RASCUNHO: "Rascunho (não enviado)",
};

const RDO_LEGENDA: Array<{ classe: string; texto: string }> = [
  { classe: "farol-dot--aprovado", texto: "Aprovado" },
  { classe: "farol-dot--aguardando", texto: "Aguardando o fiscal" },
  { classe: "farol-dot--reprovado", texto: "Reprovado" },
  { classe: "farol-dot--correcao", texto: "Em correção" },
  { classe: "farol-dot--rascunho", texto: "Rascunho" },
];

const DIAS_SEMANA_ABREV = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function diaDoMes(iso: string): string {
  return iso.slice(8, 10);
}

function diaDaSemanaDe(iso: string): number {
  const ano = Number(iso.slice(0, 4));
  const mes = Number(iso.slice(5, 7));
  const dia = Number(iso.slice(8, 10));
  return new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay();
}

function fimDeSemana(iso: string): boolean {
  const dow = diaDaSemanaDe(iso);
  return dow === 0 || dow === 6;
}

export default function Farol(): ReactElement {
  const [aba, setAba] = useState<"om" | "rdo">("om");
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<RespostaFarol | null>(null);
  const [dadosRdo, setDadosRdo] = useState<RespostaFarolRdo | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    if (aba !== "om") return;
    let cancelado = false;
    setErro(null);
    api
      .get<RespostaFarol>(`/ordens-manutencao/farol?mes=${mes}`)
      .then((resposta) => {
        if (!cancelado) setDados(resposta);
      })
      .catch((error) => {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o farol.");
      });
    return () => {
      cancelado = true;
    };
  }, [mes, aba]);

  useEffect(() => {
    if (aba !== "rdo") return;
    let cancelado = false;
    setErro(null);
    api
      .get<RespostaFarolRdo>(`/rdos/farol-status?periodo=${mes}`)
      .then((resposta) => {
        if (!cancelado) setDadosRdo(resposta);
      })
      .catch((error) => {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar o farol de RDO.");
      });
    return () => {
      cancelado = true;
    };
  }, [mes, aba]);

  const totais = dados?.dias.reduce(
    (soma, dia) => ({
      realizada: soma.realizada + dia.realizada,
      aguardandoValidacao: soma.aguardandoValidacao + dia.aguardandoValidacao,
      reprovada: soma.reprovada + dia.reprovada,
      pendente: soma.pendente + dia.pendente,
      naoExecutada: soma.naoExecutada + dia.naoExecutada,
      total: soma.total + dia.total,
    }),
    { realizada: 0, aguardandoValidacao: 0, reprovada: 0, pendente: 0, naoExecutada: 0, total: 0 },
  );

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">{aba === "om" ? "Farol de OM" : "Farol de RDO"}</h1>
            <p className="list-subtitle">
              {aba === "om"
                ? "Ciclo de medição — do dia 19 do mês anterior ao dia 20 do mês selecionado, dia a dia"
                : "Recebimento e assinatura dos RDOs por equipe, dia a dia"}
            </p>
          </div>
          <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
        </div>

        <div className="tabs-row">
          <button
            type="button"
            className={`tab-button${aba === "om" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("om")}
          >
            OM
          </button>
          <button
            type="button"
            className={`tab-button${aba === "rdo" ? " tab-button--ativa" : ""}`}
            onClick={() => setAba("rdo")}
          >
            RDO
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        {aba === "rdo" ? (
          !dadosRdo ? (
            <p className="table-empty">Carregando…</p>
          ) : (
            <div className="panel">
              <div className="farol-legenda-bar">
                {RDO_LEGENDA.map((item) => (
                  <span className="farol-legenda-item" key={item.classe}>
                    <span className={`farol-dot ${item.classe}`} />
                    {item.texto}
                  </span>
                ))}
                <span className="farol-legenda-item farol-legenda-item--vazio">
                  <span className="farol-dot farol-dot--vazio" />
                  Sem RDO lançado
                </span>
              </div>
              <div className="farol-scroll">
                <table className="table farol-tabela-rdo">
                  <thead>
                    <tr>
                      <th>Equipe</th>
                      <th>Distrito</th>
                      <th>Encarregado</th>
                      {dadosRdo.dias.map((dia) => (
                        <th key={dia} className={fimDeSemana(dia) ? "farol-coluna-fds" : undefined}>
                          <span className="farol-cabecalho-dia">{diaDoMes(dia)}</span>
                          <span className="farol-cabecalho-semana">{DIAS_SEMANA_ABREV[diaDaSemanaDe(dia)]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dadosRdo.linhas.length === 0 ? (
                      <tr>
                        <td colSpan={3 + dadosRdo.dias.length} className="table-empty">
                          Nenhuma equipe ativa cadastrada.
                        </td>
                      </tr>
                    ) : (
                      dadosRdo.linhas.map((linha) => (
                        <tr key={linha.equipeId}>
                          <td>
                            <strong>{linha.equipe}</strong>
                          </td>
                          <td>{linha.distrito}</td>
                          <td>{linha.encarregado ?? "—"}</td>
                          {dadosRdo.dias.map((dia) => {
                            const status = linha.porDia[dia];
                            return (
                              <td
                                key={dia}
                                className={fimDeSemana(dia) ? "farol-coluna-fds" : undefined}
                                title={status ? RDO_STATUS_LABEL[status] : "Sem RDO lançado"}
                              >
                                <span
                                  className={`farol-dot ${status ? RDO_STATUS_DOT_CLASSE[status] : "farol-dot--vazio"}`}
                                />
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        ) : !dados ? (
          <p className="table-empty">Carregando…</p>
        ) : (
          <div className="panel">
            <p className="list-subtitle" style={{ marginBottom: 12 }}>
              Período: {formatarData(dados.periodo.inicio)} a {formatarData(dados.periodo.fim)}
            </p>
            <table className="table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Dia</th>
                  <th>Realizada</th>
                  <th>Aguardando validação</th>
                  <th>Reprovada</th>
                  <th>Pendente</th>
                  <th>Não executada</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {dados.dias.map((dia) => (
                  <tr key={dia.data} className={dia.total === 0 ? "farol-linha-vazia" : undefined}>
                    <td>{formatarData(dia.data)}</td>
                    <td>{dia.diaSemana}</td>
                    <td className="farol-celula farol-celula--realizada">{dia.realizada || "—"}</td>
                    <td className="farol-celula farol-celula--aguardando">{dia.aguardandoValidacao || "—"}</td>
                    <td className="farol-celula farol-celula--reprovada">{dia.reprovada || "—"}</td>
                    <td className="farol-celula farol-celula--pendente">{dia.pendente || "—"}</td>
                    <td className="farol-celula farol-celula--nao-executada">{dia.naoExecutada || "—"}</td>
                    <td>
                      <strong>{dia.total || "—"}</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
              {totais && (
                <tfoot>
                  <tr>
                    <td colSpan={2}>
                      <strong>Total do período</strong>
                    </td>
                    <td>
                      <strong>{totais.realizada}</strong>
                    </td>
                    <td>
                      <strong>{totais.aguardandoValidacao}</strong>
                    </td>
                    <td>
                      <strong>{totais.reprovada}</strong>
                    </td>
                    <td>
                      <strong>{totais.pendente}</strong>
                    </td>
                    <td>
                      <strong>{totais.naoExecutada}</strong>
                    </td>
                    <td>
                      <strong>{totais.total}</strong>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
