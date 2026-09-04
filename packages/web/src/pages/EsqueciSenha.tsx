import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";

export default function EsqueciSenha(): ReactElement {
  const navigate = useNavigate();
  const [identificador, setIdentificador] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await api.post("/auth/esqueci-senha", { identificador });
      setEnviado(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível enviar o link.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="campo-page">
      <div className="campo-brand">
        <p className="campo-brand-title">GOLIAS</p>
        <p className="campo-brand-subtitle">Gestão de contratos</p>
      </div>
      <div className="campo-card" style={{ maxWidth: 420 }}>
        <h1>Esqueci minha senha</h1>
        {enviado ? (
          <>
            <p className="feedback feedback--ok">
              Se o e-mail ou matrícula existir no sistema, enviamos um link de redefinição — confira sua caixa de
              entrada (e o spam).
            </p>
            <button type="button" className="button" style={{ marginTop: 12 }} onClick={() => navigate("/login")}>
              Voltar ao login
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <p className="subtitle">Informe o e-mail (fiscal) ou matrícula (encarregado) da sua conta.</p>
            <label className="field-label" htmlFor="identificador">
              E-mail ou matrícula
            </label>
            <input
              id="identificador"
              className="field-input"
              autoComplete="username"
              value={identificador}
              onChange={(event) => setIdentificador(event.target.value)}
              autoFocus
            />
            {erro && <p className="feedback feedback--erro">{erro}</p>}
            <div className="campo-acoes" style={{ marginTop: 16 }}>
              <button type="submit" className="button" disabled={enviando || identificador.trim() === ""}>
                {enviando ? "Enviando…" : "Enviar link"}
              </button>
              <button type="button" className="button button--secondary" onClick={() => navigate("/login")}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
