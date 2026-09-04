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

function IconCheck(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function IconAlerta(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path d="M12 3 1 21h22L12 3Z" />
      <path d="M12 10v4M12 17.5v.01" />
    </svg>
  );
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
              <p style={{ color: "#22c55e", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <IconCheck /> Documento autêntico e atualizado
              </p>
            )}
            {resultado.motivo === "HASH_DESATUALIZADO" && (
              <p style={{ color: "#f97316", fontWeight: 700, display: "flex", alignItems: "flex-start", gap: 8 }}>
                <IconAlerta />
                Este documento está desatualizado — o RDO foi alterado depois que este PDF foi gerado
              </p>
            )}
            {resultado.motivo === "PDF_NAO_GERADO" && (
              <p style={{ color: "#f97316", fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                <IconAlerta /> Não há PDF gerado para este RDO no sistema
              </p>
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
