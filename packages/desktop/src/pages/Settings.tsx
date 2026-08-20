import { useEffect, useState, type FormEvent, type ReactElement } from "react";
import Nav from "../components/Nav";
import { getSettings, setSettings } from "../lib/settingsStore";

type SalvarStatus = "idle" | "salvando" | "salvo" | "erro";

export default function Settings(): ReactElement {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [carregando, setCarregando] = useState<boolean>(true);
  const [salvarStatus, setSalvarStatus] = useState<SalvarStatus>("idle");

  useEffect(() => {
    let cancelado = false;

    void getSettings().then((settings) => {
      if (!cancelado) {
        setApiUrl(settings.apiUrl);
        setCarregando(false);
      }
    });

    return () => {
      cancelado = true;
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSalvarStatus("salvando");
    try {
      const atualizado = await setSettings({ apiUrl });
      setApiUrl(atualizado.apiUrl);
      setSalvarStatus("salvo");
    } catch {
      setSalvarStatus("erro");
    }
  }

  return (
    <div className="app-shell">
      <Nav />
      <div className="page">
        <div className="brand-card">
          <h1 className="brand-title">Configurações</h1>
          <p className="brand-subtitle">Endereço do servidor GOLIAS utilizado por este computador</p>

          {carregando ? (
            <p className="loading-text">Carregando…</p>
          ) : (
            <form className="settings-form" onSubmit={(event) => void handleSubmit(event)}>
              <label className="field-label" htmlFor="apiUrl">
                Endereço do servidor
              </label>
              <input
                id="apiUrl"
                name="apiUrl"
                type="text"
                className="field-input"
                value={apiUrl}
                onChange={(event) => setApiUrl(event.target.value)}
                placeholder="http://localhost:3333"
                autoComplete="off"
                spellCheck={false}
              />

              <div className="form-actions">
                <button type="submit" className="button" disabled={salvarStatus === "salvando"}>
                  {salvarStatus === "salvando" ? "Salvando…" : "Salvar"}
                </button>
              </div>

              {salvarStatus === "salvo" && <p className="feedback feedback--ok">Configuração salva com sucesso.</p>}
              {salvarStatus === "erro" && (
                <p className="feedback feedback--erro">Não foi possível salvar a configuração.</p>
              )}
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
