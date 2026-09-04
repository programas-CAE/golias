import { useState, type FormEvent, type ReactElement } from "react";
import { ApiError, api } from "../lib/apiClient";
import { atualizarEmailSessao, lerSessao } from "../lib/session";

/**
 * "Meu perfil" — fiscal/encarregado editando o próprio e-mail (pra receber
 * notificação de RDO) e trocando senha sabendo a atual. A outra forma de
 * trocar senha (esqueci minha senha, por link de e-mail) fica em
 * Login.tsx/EsqueciSenha.tsx, sem precisar estar logado.
 *
 * Controlado pelo pai (aberto/onAbrir/onFechar) em vez de gerenciar o
 * próprio estado — o painel expandido é grande (dois formulários) e não
 * cabe lado a lado com "Sair" na mesma linha do cabeçalho; o pai renderiza
 * o botão de abrir ali, mas o painel em si como bloco de largura cheia
 * abaixo do cabeçalho (mesmo padrão do card de RDO aberto).
 */
export default function PerfilUsuario({
  aberto,
  onAbrir,
  onFechar,
}: {
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
}): ReactElement {
  const sessao = lerSessao();

  const [email, setEmail] = useState(sessao?.usuario.email ?? "");
  const [salvandoEmail, setSalvandoEmail] = useState(false);
  const [erroEmail, setErroEmail] = useState<string | null>(null);
  const [emailSalvo, setEmailSalvo] = useState(false);

  const [senhaAtual, setSenhaAtual] = useState("");
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [salvandoSenha, setSalvandoSenha] = useState(false);
  const [erroSenha, setErroSenha] = useState<string | null>(null);
  const [senhaSalva, setSenhaSalva] = useState(false);

  async function salvarEmail(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErroEmail(null);
    setEmailSalvo(false);
    setSalvandoEmail(true);
    try {
      await api.patch("/auth/perfil", { email });
      atualizarEmailSessao(email);
      setEmailSalvo(true);
    } catch (error) {
      setErroEmail(error instanceof ApiError ? error.message : "Não foi possível salvar o e-mail.");
    } finally {
      setSalvandoEmail(false);
    }
  }

  async function salvarSenha(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setErroSenha(null);
    setSenhaSalva(false);
    if (novaSenha !== confirmacao) {
      setErroSenha("As senhas novas não coincidem.");
      return;
    }
    setSalvandoSenha(true);
    try {
      await api.post("/auth/trocar-senha", { senhaAtual, novaSenha });
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
      setSenhaSalva(true);
    } catch (error) {
      setErroSenha(error instanceof ApiError ? error.message : "Não foi possível trocar a senha.");
    } finally {
      setSalvandoSenha(false);
    }
  }

  if (!aberto) {
    return (
      <button type="button" className="button button--ghost button--small" onClick={onAbrir}>
        Meu perfil
      </button>
    );
  }

  return (
    <section className="campo-secao">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h2>Meu perfil</h2>
        <button type="button" className="button button--ghost button--small" onClick={onFechar}>
          Fechar
        </button>
      </div>

      <form onSubmit={(event) => void salvarEmail(event)}>
        <label className="field-label" htmlFor="perfil-email">
          E-mail (pra receber notificações de RDO)
        </label>
        <input
          id="perfil-email"
          type="email"
          className="field-input"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {erroEmail && <p className="feedback feedback--erro">{erroEmail}</p>}
        {emailSalvo && <p className="feedback feedback--ok">E-mail atualizado.</p>}
        <div className="campo-acoes" style={{ marginTop: 8 }}>
          <button type="submit" className="button button--small" disabled={salvandoEmail || email.trim() === ""}>
            {salvandoEmail ? "Salvando…" : "Salvar e-mail"}
          </button>
        </div>
      </form>

      <form onSubmit={(event) => void salvarSenha(event)} style={{ marginTop: 20 }}>
        <h3 className="campo-subtitulo">Trocar senha</h3>
        <label className="field-label" htmlFor="perfil-senha-atual">
          Senha atual
        </label>
        <input
          id="perfil-senha-atual"
          type="password"
          className="field-input"
          autoComplete="current-password"
          value={senhaAtual}
          onChange={(event) => setSenhaAtual(event.target.value)}
        />
        <div className="campo-grid-2" style={{ marginTop: 8 }}>
          <div>
            <label className="field-label">Nova senha</label>
            <input
              type="password"
              className="field-input"
              autoComplete="new-password"
              value={novaSenha}
              onChange={(event) => setNovaSenha(event.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Confirme a nova senha</label>
            <input
              type="password"
              className="field-input"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(event) => setConfirmacao(event.target.value)}
            />
          </div>
        </div>
        {erroSenha && <p className="feedback feedback--erro">{erroSenha}</p>}
        {senhaSalva && <p className="feedback feedback--ok">Senha alterada.</p>}
        <div className="campo-acoes" style={{ marginTop: 8 }}>
          <button
            type="submit"
            className="button button--small"
            disabled={salvandoSenha || senhaAtual === "" || novaSenha === "" || confirmacao === ""}
          >
            {salvandoSenha ? "Salvando…" : "Trocar senha"}
          </button>
        </div>
      </form>
    </section>
  );
}
