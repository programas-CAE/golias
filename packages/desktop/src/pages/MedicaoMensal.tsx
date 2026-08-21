import { useEffect, useMemo, useState, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface AtividadeRef {
  id: string;
  codigo: string;
  descricao: string;
  ordem: number;
}

interface MedicaoItem {
  id: string;
  quantidadeTotal: string;
  unidade: string;
  atividadeCatalogo: AtividadeRef;
}

interface PeriodoMedicao {
  id: string;
  ano: number;
  mes: number;
  status: string;
  frenteId: string;
  frente: { id: string; nome: string; codigo: string };
  itens: MedicaoItem[];
}

const MESES = [
  "", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

const FRENTE_ORDEM = ["MAB", "PBA", "RAMAL"];

interface LinhaAtividade {
  atividade: AtividadeRef;
  unidade: string;
  porFrente: Record<string, number>;
  total: number;
}

function agruparPorMes(periodos: PeriodoMedicao[]): Array<{ ano: number; mes: number; frentes: string[]; linhas: LinhaAtividade[] }> {
  const grupos = new Map<string, PeriodoMedicao[]>();
  for (const periodo of periodos) {
    const chave = `${periodo.ano}-${periodo.mes}`;
    const atual = grupos.get(chave) ?? [];
    atual.push(periodo);
    grupos.set(chave, atual);
  }

  return [...grupos.entries()]
    .map(([chave, periodosDoMes]) => {
      const [anoStr, mesStr] = chave.split("-");
      const ano = Number(anoStr);
      const mes = Number(mesStr);
      const frentesPresentes = [...new Set(periodosDoMes.map((p) => p.frente.codigo))].sort(
        (a, b) => FRENTE_ORDEM.indexOf(a) - FRENTE_ORDEM.indexOf(b),
      );

      const linhasMap = new Map<string, LinhaAtividade>();
      for (const periodo of periodosDoMes) {
        for (const item of periodo.itens) {
          const existente = linhasMap.get(item.atividadeCatalogo.id) ?? {
            atividade: item.atividadeCatalogo,
            unidade: item.unidade,
            porFrente: {},
            total: 0,
          };
          const quantidade = Number(item.quantidadeTotal);
          existente.porFrente[periodo.frente.codigo] = quantidade;
          existente.total += quantidade;
          linhasMap.set(item.atividadeCatalogo.id, existente);
        }
      }

      const linhas = [...linhasMap.values()].sort((a, b) => a.atividade.ordem - b.atividade.ordem);
      return { ano, mes, frentes: frentesPresentes, linhas };
    })
    .sort((a, b) => (b.ano - a.ano) || (b.mes - a.mes));
}

export default function MedicaoMensal(): ReactElement {
  const [periodos, setPeriodos] = useState<PeriodoMedicao[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    async function carregar(): Promise<void> {
      try {
        const resposta = await api.get<PeriodoMedicao[]>("/medicoes");
        if (!cancelado) setPeriodos(resposta);
      } catch (error) {
        if (!cancelado) setErro(error instanceof ApiError ? error.message : "Não foi possível carregar as medições.");
      }
    }
    void carregar();
    return () => {
      cancelado = true;
    };
  }, []);

  const meses = useMemo(() => (periodos ? agruparPorMes(periodos) : []), [periodos]);

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Medição Mensal</h1>
            <p className="list-subtitle">
              Produção fechada por frente e atividade — hoje só o histórico importado das planilhas (abril–junho/2026),
              antes do GOLIAS existir. A medição gerada a partir de RDOs reais entra aqui no futuro.
            </p>
          </div>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        {periodos === null ? (
          <p className="table-empty">Carregando…</p>
        ) : meses.length === 0 ? (
          <p className="table-empty">Nenhuma medição mensal registrada ainda.</p>
        ) : (
          meses.map((grupo) => (
            <section className="form-section" key={`${grupo.ano}-${grupo.mes}`}>
              <h2 className="form-section-title">
                {MESES[grupo.mes]}/{grupo.ano}
              </h2>
              <table className="table">
                <thead>
                  <tr>
                    <th>Atividade</th>
                    <th>Unidade</th>
                    {grupo.frentes.map((codigo) => (
                      <th key={codigo}>{codigo}</th>
                    ))}
                    <th>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {grupo.linhas.map((linha) => (
                    <tr key={linha.atividade.id}>
                      <td>
                        {linha.atividade.codigo} — {linha.atividade.descricao}
                      </td>
                      <td>{linha.unidade}</td>
                      {grupo.frentes.map((codigo) => (
                        <td key={codigo}>{(linha.porFrente[codigo] ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                      ))}
                      <td>{linha.total.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
