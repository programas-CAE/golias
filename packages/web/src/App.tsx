import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Campo from "./pages/Campo";
import CampoSuperestrutura from "./pages/CampoSuperestrutura";
import EncarregadoDashboard from "./pages/EncarregadoDashboard";
import EsqueciSenha from "./pages/EsqueciSenha";
import FiscalDashboard from "./pages/FiscalDashboard";
import Login from "./pages/Login";
import RedefinirSenha from "./pages/RedefinirSenha";
import PortalEncarregado from "./pages/PortalEncarregado";
import PortalFiscal from "./pages/PortalFiscal";
import Verificar from "./pages/Verificar";
import RequireAuth from "./components/RequireAuth";

function HomePage(): ReactElement {
  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <h1>GOLIAS</h1>
        <p className="subtitle">Em construção</p>
        <p className="description">
          Use o link de campo ou o link do portal do fiscal que o escritório te enviou para acessar o RDO.
        </p>
      </div>
    </div>
  );
}

export default function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/esqueci-senha" element={<EsqueciSenha />} />
        <Route path="/redefinir-senha/:token" element={<RedefinirSenha />} />
        <Route path="/campo/:token" element={<Campo />} />
        <Route path="/campo-superestrutura/:token" element={<CampoSuperestrutura />} />
        <Route path="/verificar/:id" element={<Verificar />} />
        <Route path="/portal-fiscal/:token" element={<PortalFiscal />} />
        <Route path="/encarregado/:token" element={<PortalEncarregado />} />
        <Route
          path="/fiscal"
          element={
            <RequireAuth roles={["FISCAL"]}>
              <FiscalDashboard />
            </RequireAuth>
          }
        />
        <Route
          path="/encarregado"
          element={
            <RequireAuth roles={["ENCARREGADO"]}>
              <EncarregadoDashboard />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
