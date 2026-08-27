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
      <div className="nav-brand">
        <p className="nav-brand-title">GOLIAS</p>
        <p className="nav-brand-subtitle">Gestão de contratos</p>
      </div>
      <div className="nav-links">
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
      </div>
    </nav>
  );
}
