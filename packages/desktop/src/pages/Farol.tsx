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

function mesAtual(): string {
  return new Date().toISOString().slice(0, 7);
}

function formatarData(iso: string): string {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export default function Farol(): ReactElement {
  const [mes, setMes] = useState(mesAtual());
  const [dados, setDados] = useState<RespostaFarol | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
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
  }, [mes]);

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
            <h1 className="list-title">Farol de OM</h1>
            <p className="list-subtitle">
              Ciclo de medição — do dia 19 do mês anterior ao dia 20 do mês selecionado, dia a dia
            </p>
          </div>
          <input type="month" className="field-input" value={mes} onChange={(event) => setMes(event.target.value)} />
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        {!dados ? (
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
