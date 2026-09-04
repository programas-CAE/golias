import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";
import { salvarSessao, type SessaoUsuario } from "../lib/session";

/**
 * Porta de entrada única do fiscal/encarregado — substitui os links por
 * frente (um por localidade). Fiscal loga com e-mail, encarregado com a
 * matrícula que já tem no cadastro — o mesmo campo aceita os dois.
 */
export default function Login(): ReactElement {
  const navigate = useNavigate();
  const [identificador, setIdentificador] = useState("");
  const [senha, setSenha] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      const sessao = await api.post<SessaoUsuario>("/auth/login", { identificador, senha });
      salvarSessao(sessao);
      if (sessao.usuario.role === "FISCAL") navigate("/fiscal");
      else if (sessao.usuario.role === "ENCARREGADO") navigate("/encarregado");
      else navigate("/");
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível entrar.");
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
        <h1>Entrar</h1>
        <p className="subtitle">Fiscal: e-mail. Encarregado: matrícula.</p>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="identificador">
            E-mail ou matrícula
          </label>
          <input
            id="identificador"
            className="field-input"
            autoComplete="username"
            value={identificador}
            onChange={(event) => setIdentificador(event.target.value)}
          />
          <label className="field-label" style={{ marginTop: 8 }} htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            type="password"
            className="field-input"
            autoComplete="current-password"
            value={senha}
            onChange={(event) => setSenha(event.target.value)}
          />
          {erro && <p className="feedback feedback--erro">{erro}</p>}
          <div className="campo-acoes" style={{ marginTop: 16 }}>
            <button type="submit" className="button" disabled={enviando}>
              {enviando ? "Entrando…" : "Entrar"}
            </button>
          </div>
        </form>
        <button
          type="button"
          className="button button--ghost button--small"
          style={{ marginTop: 12 }}
          onClick={() => navigate("/esqueci-senha")}
        >
          Esqueci minha senha
        </button>
      </div>
    </div>
  );
}
