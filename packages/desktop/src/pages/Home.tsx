import { useEffect, useState, type ReactElement } from "react";
import Nav from "../components/Nav";
import { getSettings } from "../lib/settingsStore";

type ConexaoStatus = "verificando" | "conectado" | "desconectado";

export default function Home(): ReactElement {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [status, setStatus] = useState<ConexaoStatus>("verificando");

  useEffect(() => {
    let cancelado = false;

    async function verificarConexao(): Promise<void> {
      setStatus("verificando");
      const settings = await getSettings();
      if (cancelado) return;
      setApiUrl(settings.apiUrl);

      try {
        const resposta = await fetch(`${settings.apiUrl.replace(/\/$/, "")}/health`, {
          signal: AbortSignal.timeout(4000),
        });
        if (!cancelado) {
          setStatus(resposta.ok ? "conectado" : "desconectado");
        }
      } catch {
        if (!cancelado) {
          setStatus("desconectado");
        }
      }
    }

    void verificarConexao();

    return () => {
      cancelado = true;
    };
  }, []);

  return (
    <div className="app-shell">
      <Nav />
      <div className="page">
        <div className="brand-card">
          <h1 className="brand-title">GOLIAS</h1>
          <p className="brand-subtitle">Sistema de apontamento de RDO — ENGECOM</p>

          <div className="status-row">
            <span className={`status-pill status-pill--${status}`}>
              <span className="status-dot" />
              {status === "verificando" && "Verificando conexão…"}
              {status === "conectado" && "Conectado"}
              {status === "desconectado" && "Não conectado"}
            </span>
            {apiUrl && <span className="status-url">{apiUrl}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
