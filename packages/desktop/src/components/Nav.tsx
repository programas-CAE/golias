import { useState, type ReactElement } from "react";
import { NavLink } from "react-router-dom";
import { definirTema, temaAtual, type Tema } from "../lib/theme";
import { getAppVersion } from "../lib/settingsStore";

const LINKS: Array<{ to: string; label: string }> = [
  { to: "/", label: "Início" },
  { to: "/rdos", label: "RDOs" },
  { to: "/obras", label: "Obras" },
  { to: "/frentes", label: "Frentes" },
  { to: "/ordens-manutencao", label: "Ordens de Manutenção" },
  { to: "/relatorios-fotograficos", label: "Relatórios Fotográficos" },
  { to: "/farol", label: "Farol" },
  { to: "/links", label: "Links" },
  { to: "/catalogos", label: "Catálogos" },
  { to: "/medicoes", label: "Medição Mensal" },
  { to: "/cadastro", label: "Cadastro" },
];

export default function Nav(): ReactElement {
  // Lê o tema já aplicado (script inline em index.html, antes do React
  // montar) sem escrever nada — só grava em localStorage quando o usuário
  // realmente clica no botão, pra não "travar" a preferência do sistema
  // sozinho no primeiro carregamento.
  const [tema, setTema] = useState<Tema>(() => temaAtual());

  function alternarTema(): void {
    const novo: Tema = tema === "dark" ? "light" : "dark";
    definirTema(novo);
    setTema(novo);
  }

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
      <div className="nav-footer">
        <button type="button" className="nav-theme-toggle" onClick={alternarTema}>
          {tema === "dark" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />
            </svg>
          )}
          <span>{tema === "dark" ? "Modo claro" : "Modo escuro"}</span>
        </button>
        {/* Sem isso não tinha como conferir se uma atualização já chegou —
            "ainda tá dando esse bug" sem saber a versão instalada é difícil
            de diagnosticar. */}
        <p className="nav-versao">v{getAppVersion()}</p>
      </div>
    </nav>
  );
}
