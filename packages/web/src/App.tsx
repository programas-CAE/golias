import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Campo from "./pages/Campo";
import PortalEncarregado from "./pages/PortalEncarregado";
import PortalFiscal from "./pages/PortalFiscal";
import Verificar from "./pages/Verificar";

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
        <Route path="/campo/:token" element={<Campo />} />
        <Route path="/verificar/:id" element={<Verificar />} />
        <Route path="/portal-fiscal/:token" element={<PortalFiscal />} />
        <Route path="/encarregado/:token" element={<PortalEncarregado />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
