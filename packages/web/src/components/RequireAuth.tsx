import { Navigate } from "react-router-dom";
import type { ReactElement, ReactNode } from "react";
import { lerSessao, type SessaoUsuario } from "../lib/session";

/** Manda pra /login sem sessão, ou quando a role logada não é uma das permitidas nessa tela. */
export default function RequireAuth({
  roles,
  children,
}: {
  roles: SessaoUsuario["usuario"]["role"][];
  children: ReactNode;
}): ReactElement {
  const sessao = lerSessao();
  if (!sessao || !roles.includes(sessao.usuario.role)) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
}
