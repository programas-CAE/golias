import { useEffect, useState, type ReactElement } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";

interface ResultadoVerificacao {
  rdoId: string;
  data: string;
  frente: string;
  equipe: string;
  status: string;
  autentico: boolean;
  motivo: "OK" | "HASH_DESATUALIZADO" | "PDF_NAO_GERADO";
}

const STATUS_LABEL: Record<string, string> = {
  RASCUNHO: "Rascunho",
  EM_CORRECAO: "Em correção",
  AGUARDANDO_APROVACAO: "Aguardando aprovação",
  APROVADO: "Aprovado",
  REPROVADO: "Reprovado",
};

export default function Verificar(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const [resultado, setResultado] = useState<ResultadoVerificacao | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    if (!id) return;
    const hash = searchParams.get("h") ?? "";

    async function carregar(): Promise<void> {
      try {
        const resposta = await api.get<ResultadoVerificacao>(`/rdos/${id}/verificar?h=${encodeURIComponent(hash)}`);
        setResultado(resposta);
      } catch (error) {
        setErro(error instanceof ApiError ? error.message : "Não foi possível verificar este documento.");
      } finally {
        setCarregando(false);
      }
    }

    void carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <h1>GOLIAS</h1>
        <p className="subtitle">Verificação de autenticidade do RDO</p>

        {carregando && <p className="description">Verificando…</p>}
        {erro && <p className="description">{erro}</p>}

        {resultado && (
          <div style={{ textAlign: "left", marginTop: 16 }}>
            {resultado.motivo === "OK" && (
              <p style={{ color: "#22c55e", fontWeight: 700 }}>✓ Documento autêntico e atualizado</p>
            )}
            {resultado.motivo === "HASH_DESATUALIZADO" && (
              <p style={{ color: "#f97316", fontWeight: 700 }}>
                ⚠ Este documento está desatualizado — o RDO foi alterado depois que este PDF foi gerado
              </p>
            )}
            {resultado.motivo === "PDF_NAO_GERADO" && (
              <p style={{ color: "#f97316", fontWeight: 700 }}>⚠ Não há PDF gerado para este RDO no sistema</p>
            )}

            <p className="description">
              RDO de {new Date(resultado.data).toLocaleDateString("pt-BR", { timeZone: "UTC" })} — Frente {resultado.frente}
              , Equipe {resultado.equipe}
              <br />
              Status: {STATUS_LABEL[resultado.status] ?? resultado.status}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
