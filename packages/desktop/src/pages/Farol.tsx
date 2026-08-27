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

const RDO_STATUS_CLASSE: Record<string, string> = {
  APROVADO: "farol-celula--realizada",
  AGUARDANDO_APROVACAO: "farol-celula--aguardando",
  REPROVADO: "farol-celula--reprovada",
  RASCUNHO: "farol-celula--pendente",
  EM_CORRECAO: "farol-celula--pendente",
};

const RDO_STATUS_ROTULO: Record<string, string> = {
  APROVADO: "OK",
  AGUARDANDO_APROVACAO: "AGD",
  REPROVADO: "REP",
  RASCUNHO: "RASC",
  EM_CORRECAO: "CORR",
};

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
              <div className="farol-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Equipe</th>
                      <th>Distrito</th>
                      <th>Encarregado</th>
                      {dadosRdo.dias.map((dia) => (
                        <th key={dia} style={{ textAlign: "center" }}>
                          {diaDoMes(dia)}
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
                          <td>{linha.equipe}</td>
                          <td>{linha.distrito}</td>
                          <td>{linha.encarregado ?? "—"}</td>
                          {dadosRdo.dias.map((dia) => {
                            const status = linha.porDia[dia];
                            return (
                              <td
                                key={dia}
                                className={`farol-celula ${status ? RDO_STATUS_CLASSE[status] : "farol-celula--pendente"}`}
                              >
                                {status ? (RDO_STATUS_ROTULO[status] ?? status) : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <p className="farol-legenda">
                <span className="farol-celula farol-celula--realizada">OK</span> aprovado ·{" "}
                <span className="farol-celula farol-celula--aguardando">AGD</span> aguardando assinatura do fiscal ·{" "}
                <span className="farol-celula farol-celula--reprovada">REP</span> reprovado ·{" "}
                <span className="farol-celula farol-celula--pendente">RASC/CORR</span> rascunho ou em correção · —
                sem RDO lançado
              </p>
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
