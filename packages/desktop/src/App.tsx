import type { ReactElement } from "react";
import { HashRouter, Routes, Route } from "react-router-dom";
import Home from "./pages/Home";
import Frentes from "./pages/Frentes";
import FrenteDistritos from "./pages/FrenteDistritos";
import DistritoDetalhe from "./pages/DistritoDetalhe";
import OrdensManutencao from "./pages/OrdensManutencao";
import RelatorioFotografico from "./pages/RelatorioFotografico";
import RelatoriosFotograficos from "./pages/RelatoriosFotograficos";
import Cadastro from "./pages/Cadastro";
import Catalogos from "./pages/Catalogos";
import MedicaoMensal from "./pages/MedicaoMensal";
import Rdos from "./pages/Rdos";
import RdoCompleto from "./pages/RdoCompleto";
import RdoDetalhe from "./pages/RdoDetalhe";
import Farol from "./pages/Farol";
import Links from "./pages/Links";

// Usamos HashRouter (em vez de BrowserRouter) porque, em produção, o
// Electron carrega a interface a partir de um arquivo local (file://), onde
// rotas baseadas na History API não resolvem corretamente.
export default function App(): ReactElement {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/frentes" element={<Frentes />} />
        <Route path="/frentes/:frenteId/distritos" element={<FrenteDistritos />} />
        <Route path="/distritos/:distritoId" element={<DistritoDetalhe />} />
        <Route path="/ordens-manutencao" element={<OrdensManutencao />} />
        <Route path="/ordens-manutencao/:id/relatorio-fotografico" element={<RelatorioFotografico />} />
        <Route path="/relatorios-fotograficos" element={<RelatoriosFotograficos />} />
        <Route path="/cadastro" element={<Cadastro />} />
        <Route path="/farol" element={<Farol />} />
        <Route path="/links" element={<Links />} />
        <Route path="/catalogos" element={<Catalogos />} />
        <Route path="/medicoes" element={<MedicaoMensal />} />
        <Route path="/rdos" element={<Rdos />} />
        <Route path="/rdos/completo/novo" element={<RdoCompleto />} />
        <Route path="/rdos/:id/editar" element={<RdoCompleto />} />
        <Route path="/rdos/:id" element={<RdoDetalhe />} />
      </Routes>
    </HashRouter>
  );
}
