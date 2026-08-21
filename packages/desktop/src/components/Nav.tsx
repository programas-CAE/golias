import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";

const LINKS: Array<{ to: string; label: string }> = [
  { to: "/", label: "Início" },
  { to: "/rdos", label: "RDOs" },
  { to: "/frentes", label: "Frentes" },
  { to: "/colaboradores", label: "Colaboradores" },
  { to: "/equipes", label: "Equipes" },
  { to: "/ordens-manutencao", label: "Ordens de Manutenção" },
  { to: "/atividades", label: "Catálogo de Atividades" },
  { to: "/medicoes", label: "Medição Mensal" },
  { to: "/settings", label: "Configurações" },
];

export default function Nav(): ReactElement {
  return (
    <nav className="nav">
      {LINKS.map((link) => (
        <NavLink
          key={link.to}
          to={link.to}
          end={link.to === "/"}
          className={({ isActive }) => `nav-link${isActive ? " nav-link--active" : ""}`}
        >
          {link.label}
        </NavLink>
      ))}
    </nav>
  );
}
