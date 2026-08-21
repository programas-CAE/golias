import type { ReactElement } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Settings from "./pages/Settings";
import Frentes from "./pages/Frentes";
import Colaboradores from "./pages/Colaboradores";
import OrdensManutencao from "./pages/OrdensManutencao";
import Atividades from "./pages/Atividades";
import Equipes from "./pages/Equipes";
import Rdos from "./pages/Rdos";
import RdoCompleto from "./pages/RdoCompleto";

// Usamos HashRouter (em vez de BrowserRouter) porque, em produção, o
// Electron carrega a interface a partir de um arquivo local (file://), onde
// rotas baseadas na History API não resolvem corretamente.
export default function App(): ReactElement {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/frentes" element={<Frentes />} />
        <Route path="/colaboradores" element={<Colaboradores />} />
        <Route path="/ordens-manutencao" element={<OrdensManutencao />} />
        <Route path="/atividades" element={<Atividades />} />
        <Route path="/equipes" element={<Equipes />} />
        <Route path="/rdos" element={<Rdos />} />
        <Route path="/rdos/completo/novo" element={<RdoCompleto />} />
      </Routes>
    </HashRouter>
  );
}
