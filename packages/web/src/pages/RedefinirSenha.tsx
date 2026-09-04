import { useState, type FormEvent, type ReactElement } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ApiError, api } from "../lib/apiClient";

export default function RedefinirSenha(): ReactElement {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErro(null);
    if (novaSenha !== confirmacao) {
      setErro("As senhas não coincidem.");
      return;
    }
    setEnviando(true);
    try {
      await api.post("/auth/redefinir-senha", { token, novaSenha });
      setConcluido(true);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível redefinir a senha.");
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
        <h1>Nova senha</h1>
        {concluido ? (
          <>
            <p className="feedback feedback--ok">Senha redefinida com sucesso.</p>
            <button type="button" className="button" style={{ marginTop: 12 }} onClick={() => navigate("/login")}>
              Ir para o login
            </button>
          </>
        ) : (
          <form onSubmit={(event) => void handleSubmit(event)}>
            <label className="field-label" htmlFor="novaSenha">
              Nova senha
            </label>
            <input
              id="novaSenha"
              type="password"
              className="field-input"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
              autoFocus
            />
            <label className="field-label" style={{ marginTop: 8 }} htmlFor="confirmacao">
              Confirme a nova senha
            </label>
            <input
              id="confirmacao"
              type="password"
              className="field-input"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
            />
            {erro && <p className="feedback feedback--erro">{erro}</p>}
            <div className="campo-acoes" style={{ marginTop: 16 }}>
              <button type="submit" className="button" disabled={enviando || novaSenha === "" || confirmacao === ""}>
                {enviando ? "Salvando…" : "Redefinir senha"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
