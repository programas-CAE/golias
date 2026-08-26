import type { ReactElement } from "react";
import { BrowserRouter, Routes, Route, useParams, Navigate } from "react-router-dom";
import Campo from "./pages/Campo";
import Verificar from "./pages/Verificar";

function Placeholder({ titulo, descricao }: { titulo: string; descricao: string }): ReactElement {
  return (
    <div className="placeholder-page">
      <div className="placeholder-card">
        <h1>GOLIAS</h1>
        <p className="subtitle">{titulo}</p>
        <p className="description">{descricao}</p>
      </div>
    </div>
  );
}

function FiscalPage(): ReactElement {
  const { token } = useParams<{ token: string }>();
  return (
    <Placeholder
      titulo="Aprovação de RDO pelo fiscal"
      descricao={`Esta página permitirá que o fiscal da VALE revise e assine o RDO. Token: ${token ?? "—"}. Em construção — chega na Fase 4.`}
    />
  );
}

function HomePage(): ReactElement {
  return (
    <Placeholder
      titulo="Em construção"
      descricao="O portal público de campo e de aprovação do fiscal será disponibilizado aqui nas próximas fases do projeto."
    />
  );
}

export default function App(): ReactElement {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/campo/:token" element={<Campo />} />
        <Route path="/verificar/:id" element={<Verificar />} />
        <Route path="/fiscal/:token" element={<FiscalPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
