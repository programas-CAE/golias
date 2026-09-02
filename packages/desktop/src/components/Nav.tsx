import type { ReactElement } from "react";
import { NavLink } from "react-router-dom";

const LINKS: Array<{ to: string; label: string }> = [
  { to: "/", label: "Início" },
  { to: "/rdos", label: "RDOs" },
  { to: "/frentes", label: "Frentes" },
  { to: "/ordens-manutencao", label: "Ordens de Manutenção" },
  { to: "/farol", label: "Farol" },
  { to: "/links", label: "Links" },
  { to: "/catalogos", label: "Catálogos" },
  { to: "/medicoes", label: "Medição Mensal" },
  { to: "/cadastro", label: "Cadastro" },
];

export default function Nav(): ReactElement {
  return (
    <nav className="nav">
      <div className="nav-brand">
        {/* import.meta.env.BASE_URL (= "./", ver vite.config.ts) em vez de "/icon.png" —
            em produção o Electron carrega dist/index.html via file://, onde um caminho
            absoluto começando em "/" resolve pra raiz do sistema de arquivos, não pra
            pasta do app (o <link rel="icon"> do próprio index.html escapa disso porque o
            Vite reescreve href de tag HTML no build; uma string solta em JSX, não). */}
        <img src={`${import.meta.env.BASE_URL}icon.png`} alt="" className="nav-brand-icon" />
        <div>
          <p className="nav-brand-title">GOLIAS</p>
          <p className="nav-brand-subtitle">Gestão de contratos</p>
        </div>
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
