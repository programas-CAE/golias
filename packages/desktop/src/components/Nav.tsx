import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";

const LINKS: Array<{ to: string; label: string }> = [
  { to: "/", label: "Início" },
  { to: "/rdos", label: "RDOs" },
  { to: "/frentes", label: "Frentes" },
  { to: "/ordens-manutencao", label: "Ordens de Manutenção" },
  { to: "/farol", label: "Farol" },
  { to: "/atividades", label: "Catálogo de Atividades" },
  { to: "/medicoes", label: "Medição Mensal" },
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
