import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Nav from "../components/Nav";
import { ApiError, api } from "../lib/apiClient";

interface Ref {
  id: string;
  nome: string;
}

interface ColaboradorRef {
  id: string;
  nome: string;
  matricula: string;
}

interface Usuario {
  id: string;
  nome: string;
  email: string | null;
  matriculaLogin: string | null;
  role: "ADMIN" | "ESCRITORIO" | "FISCAL" | "ENCARREGADO";
  ativo: boolean;
  frenteId: string | null;
  frente: Ref | null;
  colaboradorId: string | null;
  colaborador: ColaboradorRef | null;
}

const ROLE_LABEL: Record<Usuario["role"], string> = {
  ADMIN: "Administrador",
  ESCRITORIO: "Escritório",
  FISCAL: "Fiscal",
  ENCARREGADO: "Encarregado",
};

/** Cadastro de quem loga no portal do fiscal/encarregado — substitui os links por frente por um usuário/senha por pessoa. */
export default function Cadastro(): ReactElement {
  const [usuarios, setUsuarios] = useState<Usuario[] | null>(null);
  const [frentes, setFrentes] = useState<Ref[]>([]);
  const [colaboradores, setColaboradores] = useState<ColaboradorRef[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState<Usuario | "novo" | null>(null);

  async function carregar(): Promise<void> {
    setErro(null);
    try {
      const [listaUsuarios, listaFrentes, listaColaboradores] = await Promise.all([
        api.get<Usuario[]>("/usuarios"),
        api.get<Ref[]>("/frentes"),
        api.get<ColaboradorRef[]>("/colaboradores"),
      ]);
      setUsuarios(listaUsuarios);
      setFrentes(listaFrentes);
      setColaboradores(listaColaboradores);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível carregar os usuários.");
    }
  }

  useEffect(() => {
    void carregar();
  }, []);

  function handleSalvo(usuario: Usuario): void {
    setUsuarios((atual) => {
      if (!atual) return atual;
      const existe = atual.some((u) => u.id === usuario.id);
      return existe ? atual.map((u) => (u.id === usuario.id ? usuario : u)) : [usuario, ...atual];
    });
    setEditando(null);
  }

  async function excluir(usuario: Usuario): Promise<void> {
    if (!window.confirm(`Apagar o acesso de "${usuario.nome}"? Essa pessoa não vai mais conseguir entrar.`)) return;
    try {
      await api.delete(`/usuarios/${usuario.id}`);
      setUsuarios((atual) => atual?.filter((u) => u.id !== usuario.id) ?? null);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível apagar.");
    }
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="list-page">
        <div className="list-header">
          <div>
            <h1 className="list-title">Cadastro</h1>
            <p className="list-subtitle">Acesso de fiscais e encarregados ao portal — nome, senha, e-mail/matrícula e localidade.</p>
          </div>
          <button type="button" className="button" onClick={() => setEditando("novo")}>
            Novo usuário
          </button>
        </div>

        {erro && <p className="feedback feedback--erro">{erro}</p>}

        <div className="panel">
          {usuarios === null ? (
            <p className="table-empty">Carregando…</p>
          ) : usuarios.length === 0 ? (
            <p className="table-empty">Nenhum usuário cadastrado ainda.</p>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Login</th>
                  <th>Frente</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {usuarios.map((usuario) => (
                  <tr
                    key={usuario.id}
                    className="table-row--clicavel"
                    onClick={() => setEditando(usuario)}
                    title="Editar este usuário"
                  >
                    <td>{usuario.nome}</td>
                    <td>{ROLE_LABEL[usuario.role]}</td>
                    <td>{usuario.email ?? usuario.matriculaLogin ?? "—"}</td>
                    <td>{usuario.frente?.nome ?? "—"}</td>
                    <td>
                      <span className={`badge ${usuario.ativo ? "badge--ativo" : "badge--inativo"}`}>
                        {usuario.ativo ? "Ativo" : "Inativo"}
                      </span>
                    </td>
                    <td style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        className="button button--ghost button--small"
                        onClick={(event) => {
                          event.stopPropagation();
                          void excluir(usuario);
                        }}
                      >
                        Apagar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editando && (
        <UsuarioModal
          usuario={editando}
          frentes={frentes}
          colaboradores={colaboradores}
          onClose={() => setEditando(null)}
          onSalvo={handleSalvo}
        />
      )}
    </div>
  );
}

interface UsuarioForm {
  nome: string;
  role: Usuario["role"];
  email: string;
  colaboradorId: string;
  frenteId: string;
  senha: string;
  ativo: boolean;
}

function UsuarioModal({
  usuario,
  frentes,
  colaboradores,
  onClose,
  onSalvo,
}: {
  usuario: Usuario | "novo";
  frentes: Ref[];
  colaboradores: ColaboradorRef[];
  onClose: () => void;
  onSalvo: (usuario: Usuario) => void;
}): ReactElement {
  const existente = usuario === "novo" ? null : usuario;
  const [form, setForm] = useState<UsuarioForm>({
    nome: existente?.nome ?? "",
    role: existente?.role ?? "FISCAL",
    email: existente?.email ?? "",
    colaboradorId: existente?.colaboradorId ?? "",
    frenteId: existente?.frenteId ?? "",
    senha: "",
    ativo: existente?.ativo ?? true,
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      let salvo: Usuario;
      if (existente) {
        const payload: Record<string, unknown> = {
          nome: form.nome,
          frenteId: form.frenteId || null,
          ativo: form.ativo,
        };
        if (form.role === "FISCAL") payload.email = form.email || null;
        if (form.role === "ENCARREGADO") payload.colaboradorId = form.colaboradorId || null;
        if (form.senha) payload.senha = form.senha;
        salvo = await api.patch<Usuario>(`/usuarios/${existente.id}`, payload);
      } else {
        salvo = await api.post<Usuario>("/usuarios", {
          nome: form.nome,
          role: form.role,
          email: form.role === "FISCAL" ? form.email || null : null,
          colaboradorId: form.role === "ENCARREGADO" ? form.colaboradorId || null : null,
          frenteId: form.frenteId || null,
          senha: form.senha,
          ativo: form.ativo,
        });
      }
      onSalvo(salvo);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : "Não foi possível salvar.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(event) => event.stopPropagation()}>
        <h2 className="modal-title">{existente ? "Editar usuário" : "Novo usuário"}</h2>
        <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field-label" htmlFor="nome">
            Nome
          </label>
          <input
            id="nome"
            className="field-input"
            value={form.nome}
            onChange={(event) => setForm((f) => ({ ...f, nome: event.target.value }))}
            autoComplete="off"
          />

          <label className="field-label" htmlFor="role">
            Tipo
          </label>
          <select
            id="role"
            className="field-input"
            value={form.role}
            disabled={!!existente}
            onChange={(event) => setForm((f) => ({ ...f, role: event.target.value as Usuario["role"] }))}
          >
            <option value="FISCAL">Fiscal</option>
            <option value="ENCARREGADO">Encarregado</option>
          </select>

          <label className="field-label" htmlFor="frenteId">
            Frente (localidade)
          </label>
          <select
            id="frenteId"
            className="field-input"
            value={form.frenteId}
            onChange={(event) => setForm((f) => ({ ...f, frenteId: event.target.value }))}
          >
            <option value="">Selecione a frente</option>
            {frentes.map((frente) => (
              <option key={frente.id} value={frente.id}>
                {frente.nome}
              </option>
            ))}
          </select>

          {form.role === "FISCAL" && (
            <>
              <label className="field-label" htmlFor="email">
                E-mail (login)
              </label>
              <input
                id="email"
                type="email"
                className="field-input"
                value={form.email}
                onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
                autoComplete="off"
              />
            </>
          )}

          {form.role === "ENCARREGADO" && (
            <>
              <label className="field-label" htmlFor="colaboradorId">
                Colaborador (login pela matrícula dele)
              </label>
              <select
                id="colaboradorId"
                className="field-input"
                value={form.colaboradorId}
                onChange={(event) => setForm((f) => ({ ...f, colaboradorId: event.target.value }))}
              >
                <option value="">Selecione o colaborador</option>
                {colaboradores.map((colaborador) => (
                  <option key={colaborador.id} value={colaborador.id}>
                    {colaborador.nome} — Mat. {colaborador.matricula}
                  </option>
                ))}
              </select>
            </>
          )}

          <label className="field-label" htmlFor="senha">
            {existente ? "Nova senha (deixe em branco pra manter)" : "Senha"}
          </label>
          <input
            id="senha"
            type="password"
            className="field-input"
            value={form.senha}
            onChange={(event) => setForm((f) => ({ ...f, senha: event.target.value }))}
            autoComplete="new-password"
          />

          {existente && (
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
              <input
                type="checkbox"
                checked={form.ativo}
                onChange={(event) => setForm((f) => ({ ...f, ativo: event.target.checked }))}
              />
              Ativo (desmarcar bloqueia o login sem apagar o cadastro)
            </label>
          )}

          {erro && <p className="feedback feedback--erro">{erro}</p>}

          <div className="form-actions">
            <button type="submit" className="button" disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </button>
            <button type="button" className="button button--secondary" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
