import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import Nav from "../components/Nav";
import KpiCard from "../components/KpiCard";
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

interface ItemFarolOm {
  id: string;
  numero: string;
  frenteId: string;
  frenteNome: string;
  frenteCodigo: string;
  dataEmissao: string;
  dataRealizada: string | null;
  lado: string | null;
  detalhes: string | null;
  status: string;
  precisaRelatorioFotografico: boolean;
}

interface CelulaFarolOm {
  quantidade: number;
  status: string;
}

interface LinhaFarolOm {
  equipeId: string;
  equipe: string;
  distrito: string;
  encarregado: string | null;
  porDia: Record<string, CelulaFarolOm | null>;
}

interface RespostaFarol {
  periodo: { inicio: string; fim: string };
  dias: string[];
  diasResumo: DiaFarol[];
  linhas: LinhaFarolOm[];
  itens: ItemFarolOm[];
}

const OM_STATUS_DOT_CLASSE: Record<string, string> = {
  realizada: "farol-dot--aprovado",
  aguardandoValidacao: "farol-dot--aguardando",
  reprovada: "farol-dot--reprovado",
  naoExecutada: "farol-dot--atrasada",
  pendente: "farol-dot--rascunho",
};

const OM_STATUS_LABEL: Record<string, string> = {
  realizada: "Realizada",
  aguardandoValidacao: "RDO lançado, aguardando aprovação",
  reprovada: "Reprovada pelo fiscal",
  naoExecutada: "Atrasada — data passou e não tem RDO",
  pendente: "Ainda não venceu",
};

const OM_LEGENDA: Array<{ chave: string; classe: string; texto: string }> = [
  { chave: "realizada", classe: "farol-dot--aprovado", texto: "Realizada" },
  { chave: "aguardandoValidacao", classe: "farol-dot--aguardando", texto: "Aguardando aprovação" },
  { chave: "reprovada", classe: "farol-dot--reprovado", texto: "Reprovada" },
  { chave: "naoExecutada", classe: "farol-dot--atrasada", texto: "Atrasada" },
  { chave: "pendente", classe: "farol-dot--rascunho", texto: "Ainda não venceu" },
];

const OM_STATUS_BADGE_CLASSE: Record<string, string> = {
  realizada: "badge--realizada",
  aguardandoValidacao: "badge--aguardando",
  reprovada: "badge--reprovada",
  naoExecutada: "badge--atrasada",
  pendente: "badge--pendente",
};

// Ordem das KPIs no topo do Farol de OM: total primeiro, depois o que
// precisa de atenção antes do que já está resolvido.
const OM_KPI_ORDEM: Array<{ chave: string; label: string }> = [
  { chave: "naoExecutada", label: "Atrasadas" },
  { chave: "aguardandoValidacao", label: "Aguardando aprovação" },
  { chave: "reprovada", label: "Reprovadas" },
  { chave: "pendente", label: "Ainda não vencidas" },
  { chave: "realizada", label: "Realizadas" },
];

interface LinhaFarolRdo {
  equipeId: string;
  equipe: string;
  distrito: string;
  encarregado: string | null;
  porDia: Record<string, string | null>;
}

interface ItemFarolRdo {
  id: string;
  data: string;
  status: string;
  equipeId: string;
  equipe: string;
  distrito: string;
  encarregado: string | null;
}

interface RespostaFarolRdo {
  periodo: string;
  dias: string[];
  linhas: LinhaFarolRdo[];
  itens: ItemFarolRdo[];
}

// Ordem de "o que precisa de atenção primeiro": aguardando o escritório ou
// o fiscal, e reprovado, pedem uma ação de alguém agora; aprovado é o fim
// da linha.
const RDO_GRUPOS_ORDEM = [
  "AGUARDANDO_VALIDACAO_ESCRITORIO",
  "AGUARDANDO_APROVACAO",
  "REPROVADO",
  "EM_CORRECAO",
  "RASCUNHO",
  "APROVADO",
];

const RDO_STATUS_DOT_CLASSE: Record<string, string> = {
  APROVADO: "farol-dot--aprovado",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "farol-dot--validacao",
  AGUARDANDO_APROVACAO: "farol-dot--aguardando",
  REPROVADO: "farol-dot--reprovado",
  EM_CORRECAO: "farol-dot--correcao",
  RASCUNHO: "farol-dot--rascunho",
};

const RDO_STATUS_LABEL: Record<string, string> = {
  APROVADO: "Aprovado",
  AGUARDANDO_VALIDACAO_ESCRITORIO: "Aguardando validação do escritório",
  AGUARDANDO_APROVACAO: "Aguardando aprovação do fiscal",
  REPROVADO: "Reprovado pelo fiscal",
  EM_CORRECAO: "Em correção",
  RASCUNHO: "Rascunho (não enviado)",
};

const RDO_LEGENDA: Array<{ classe: string; texto: string }> = [
  { classe: "farol-dot--aprovado", texto: "Aprovado" },
  { classe: "farol-dot--validacao", texto: "Aguardando o escritório" },
  { classe: "farol-dot--aguardando", texto: "Aguardando o fiscal" },
  { classe: "farol-dot--reprovado", texto: "Reprovado" },
  { classe: "farol-dot--correcao", texto: "Em correção" },
  { classe: "farol-dot--rascunho", texto: "Rascunho" },
];

const DIAS_SEMANA_ABREV = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];

/**
 * Período (rótulo do ciclo de medição, dia 21 do mês anterior ao dia 20 do
 * mês rotulado) que contém a data de hoje — não é sempre o mês civil
 * corrente: do dia 21 em diante, o ciclo vigente já "pertence" ao mês
 * seguinte (só fecha no dia 20 dele). Sem essa conta, o Farol abria por
 * padrão num ciclo que já fechou, escondendo qualquer RDO novo criado nos
 * últimos ~10 dias do mês até a pessoa trocar o seletor manualmente.
 */
function mesAtual(): string {
  const hoje = new Date();
  const mesCiclo = hoje.getDate() > 20 ? hoje.getMonth() + 1 : hoje.getMonth();
  const data = new Date(hoje.getFullYear(), mesCiclo, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
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

function celulaCsv(valor: string): string {
  return `"${valor.replace(/"/g, '""')}"`;
}

function exportarFarolOmCsv(itens: ItemFarolOm[]): void {
  const cabecalho = ["Nº OM", "Descrição do serviço", "Frente", "Data programada", "Data realizada", "Status do farol"];
  const linhas = itens.map((item) =>
    [
      item.numero,
      item.detalhes ?? "",
      item.frenteNome,
      formatarData(item.dataEmissao),
      item.dataRealizada ? formatarData(item.dataRealizada) : "",
      OM_STATUS_LABEL[item.status] ?? item.status,
    ]
      .map(celulaCsv)
      .join(";"),
  );
  const csv = [cabecalho.map(celulaCsv).join(";"), ...linhas].join("\r\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `farol-om-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Farol(): ReactElement {
  const navigate = useNavigate();
  const [aba, setAba] = useState<"om" | "rdo">("om");
  const [mes, setMes] = useState(mesAtual());
  const [frenteFiltro, setFrenteFiltro] = useState("");
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

  const frentesDisponiveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const item of dados?.itens ?? []) mapa.set(item.frenteId, item.frenteNome);
    return [...mapa.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [dados]);

  const itensOmFiltrados = useMemo(
    () => (dados?.itens ?? []).filter((item) => !frenteFiltro || item.frenteId === frenteFiltro),
    [dados, frenteFiltro],
  );

  const contagemPorStatus = itensOmFiltrados.reduce<Record<string, number>>((soma, item) => {
    soma[item.status] = (soma[item.status] ?? 0) + 1;
    return soma;
  }, {});

  const rdosPorStatus = useMemo(() => {
    const grupos = new Map<string, ItemFarolRdo[]>();
    for (const item of dadosRdo?.itens ?? []) {
      const atual = grupos.get(item.status) ?? [];
      atual.push(item);
      grupos.set(item.status, atual);
    }
    for (const lista of grupos.values()) lista.sort((a, b) => b.data.localeCompare(a.data));
    return grupos;
  }, [dadosRdo]);

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">{aba === "om" ? "Farol de OM" : "Farol de RDO"}</h1>
            <p className="list-subtitle">
              {aba === "om"
                ? "Ciclo de medição — do dia 21 do mês anterior ao dia 20 do mês selecionado, dia a dia"
                : "Recebimento e assinatura dos RDOs por equipe — mesmo ciclo de medição, do dia 21 do mês anterior ao dia 20 do mês selecionado"}
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
                          <td title={linha.equipe}>
                            <strong>{linha.equipe}</strong>
                          </td>
                          <td title={linha.distrito}>{linha.distrito}</td>
                          <td title={linha.encarregado ?? ""}>{linha.encarregado ?? "—"}</td>
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

              <div className="farol-listas">
                {RDO_GRUPOS_ORDEM.filter((status) => (rdosPorStatus.get(status)?.length ?? 0) > 0).map((status) => (
                  <section className="farol-lista-grupo" key={status}>
                    <h3 className="farol-lista-titulo">
                      <span className={`farol-dot ${RDO_STATUS_DOT_CLASSE[status]}`} />
                      {RDO_STATUS_LABEL[status]}
                      <span className="farol-lista-contagem">{rdosPorStatus.get(status)?.length}</span>
                    </h3>
                    <ul className="farol-lista">
                      {rdosPorStatus.get(status)?.map((item) => (
                        <li key={item.id}>
                          <button type="button" className="farol-lista-item" onClick={() => navigate(`/rdos/${item.id}`)}>
                            <span className="farol-lista-item-data">{formatarData(item.data)}</span>
                            <span className="farol-lista-item-equipe">{item.equipe}</span>
                            <span className="farol-lista-item-detalhe">
                              {item.distrito} · {item.encarregado ?? "sem encarregado"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            </div>
          )
        ) : !dados ? (
          <p className="table-empty">Carregando…</p>
        ) : (
          <>
            <div className="dashboard-kpis">
              <KpiCard label="Total de OMs" valor={String(itensOmFiltrados.length)} vazio={itensOmFiltrados.length === 0} />
              {OM_KPI_ORDEM.map((kpi) => (
                <KpiCard
                  key={kpi.chave}
                  label={kpi.label}
                  valor={String(contagemPorStatus[kpi.chave] ?? 0)}
                  vazio={(contagemPorStatus[kpi.chave] ?? 0) === 0}
                />
              ))}
            </div>

            <div className="panel">
              <div className="farol-legenda-bar">
                {OM_LEGENDA.map((item) => (
                  <span className="farol-legenda-item" key={item.classe}>
                    <span className={`farol-dot ${item.classe}`} />
                    {item.texto}
                  </span>
                ))}
                <span className="farol-legenda-item farol-legenda-item--vazio">
                  <span className="farol-dot farol-dot--vazio" />
                  Sem OM no dia
                </span>
              </div>
              <p className="list-subtitle" style={{ padding: "0 18px", marginTop: 14 }}>
                Quantas OMs cada equipe tem por dia — uma equipe pode ter mais de uma no mesmo dia. A cor da célula é a
                que mais precisa de atenção entre elas (atrasada &gt; reprovada &gt; aguardando aprovação &gt; ainda não
                venceu &gt; realizada). Clique numa célula para ver quais são.
              </p>
              <div className="farol-scroll">
                <table className="table farol-tabela-rdo">
                  <thead>
                    <tr>
                      <th>Equipe</th>
                      <th>Distrito</th>
                      <th>Encarregado</th>
                      {dados.dias.map((dia) => (
                        <th key={dia} className={fimDeSemana(dia) ? "farol-coluna-fds" : undefined}>
                          <span className="farol-cabecalho-dia">{diaDoMes(dia)}</span>
                          <span className="farol-cabecalho-semana">{DIAS_SEMANA_ABREV[diaDaSemanaDe(dia)]}</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dados.linhas.length === 0 ? (
                      <tr>
                        <td colSpan={3 + dados.dias.length} className="table-empty">
                          Nenhuma equipe ativa cadastrada.
                        </td>
                      </tr>
                    ) : (
                      dados.linhas.map((linha) => (
                        <tr key={linha.equipeId}>
                          <td title={linha.equipe}>
                            <strong>{linha.equipe}</strong>
                          </td>
                          <td title={linha.distrito}>{linha.distrito}</td>
                          <td title={linha.encarregado ?? ""}>{linha.encarregado ?? "—"}</td>
                          {dados.dias.map((dia) => {
                            const celula = linha.porDia[dia];
                            return (
                              <td
                                key={dia}
                                className={fimDeSemana(dia) ? "farol-coluna-fds" : undefined}
                                title={
                                  celula
                                    ? `${celula.quantidade} OM(s) — ${OM_STATUS_LABEL[celula.status] ?? celula.status}`
                                    : "Sem OM no dia"
                                }
                              >
                                <span className="farol-status-linha">
                                  <span
                                    className={`farol-dot ${celula ? OM_STATUS_DOT_CLASSE[celula.status] : "farol-dot--vazio"}${
                                      celula && celula.quantidade > 1 ? " farol-dot--com-contagem" : ""
                                    }`}
                                  >
                                    {celula && celula.quantidade > 1 ? celula.quantidade : null}
                                  </span>
                                </span>
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

            <div className="panel">
              <div className="farol-filtros-bar">
                <div>
                  <label className="field-label">Frente</label>
                  <select
                    className="field-input"
                    value={frenteFiltro}
                    onChange={(event) => setFrenteFiltro(event.target.value)}
                  >
                    <option value="">Todas as frentes</option>
                    {frentesDisponiveis.map(([id, nome]) => (
                      <option key={id} value={id}>
                        {nome}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  className="button button--secondary button--small"
                  style={{ alignSelf: "flex-end" }}
                  onClick={() => exportarFarolOmCsv(itensOmFiltrados)}
                  disabled={itensOmFiltrados.length === 0}
                >
                  Exportar Farol
                </button>
              </div>

              <div className="farol-legenda-bar">
                {OM_LEGENDA.map((item) => (
                  <span className="farol-legenda-item" key={item.chave}>
                    <span className={`farol-dot ${item.classe}`} />
                    {item.texto} ({contagemPorStatus[item.chave] ?? 0})
                  </span>
                ))}
              </div>
              <p className="list-subtitle" style={{ padding: "0 18px", marginTop: 14 }}>
                OMs programadas de {formatarData(dados.periodo.inicio)} a {formatarData(dados.periodo.fim)} — compare
                com o que já foi realizado e cobre as que ainda faltam.
              </p>
              <div className="farol-scroll">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Nº OM</th>
                      <th>Descrição do serviço</th>
                      <th>Frente</th>
                      <th>Data programada</th>
                      <th>Data realizada</th>
                      <th>Status do farol</th>
                      <th>Relatório fotográfico</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itensOmFiltrados.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="table-empty">
                          Nenhuma OM programada nesse período.
                        </td>
                      </tr>
                    ) : (
                      itensOmFiltrados.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.numero}</strong>
                          </td>
                          <td>{item.detalhes ?? "—"}</td>
                          <td>{item.frenteNome}</td>
                          <td>{formatarData(item.dataEmissao)}</td>
                          <td>{item.dataRealizada ? formatarData(item.dataRealizada) : "—/—/—"}</td>
                          <td>
                            <span className={`badge ${OM_STATUS_BADGE_CLASSE[item.status] ?? "badge--inativo"}`}>
                              {OM_STATUS_LABEL[item.status] ?? item.status}
                            </span>
                          </td>
                          <td>
                            {item.precisaRelatorioFotografico ? (
                              <button
                                type="button"
                                className="badge badge--atrasada"
                                style={{ border: "none", cursor: "pointer" }}
                                onClick={() => navigate(`/ordens-manutencao/${item.id}/relatorios-fotograficos`)}
                              >
                                Pendente
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
