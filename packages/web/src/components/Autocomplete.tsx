import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";

interface AutocompleteItem {
  id: string;
}

interface AutocompleteProps<T extends AutocompleteItem> {
  value: string;
  items: T[];
  getLabel: (item: T) => string;
  getSublabel?: (item: T) => string | null | undefined;
  onChange: (id: string) => void;
  placeholder?: string;
  /**
   * Quando informado, digitar um nome que não existe na lista mostra uma
   * sugestão "+ Criar…" — usada em catálogos que mudam com frequência (ex.:
   * equipamentos), pra não obrigar a pessoa a ir numa outra tela cadastrar
   * antes de conseguir usar.
   */
  onCriar?: (texto: string) => Promise<T>;
}

/**
 * Campo de texto com sugestões filtradas enquanto o usuário digita — usado
 * no lugar de um <select> quando a lista de opções é grande demais para
 * rolar confortavelmente (ex.: catálogo de materiais com centenas de itens,
 * banco de OMs importado em lote pela tela Farol, no app do escritório).
 */
export default function Autocomplete<T extends AutocompleteItem>({
  value,
  items,
  getLabel,
  getSublabel,
  onChange,
  placeholder,
  onCriar,
}: AutocompleteProps<T>): ReactElement {
  const selecionado = useMemo(() => items.find((item) => item.id === value) ?? null, [items, value]);
  const [texto, setTexto] = useState(selecionado ? getLabel(selecionado) : "");
  const [aberto, setAberto] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  // Enquanto o usuário digita, o texto não deve ser resincronizado a partir
  // de `selecionado` — só depois que ele confirma uma sugestão ou sai do
  // campo (senão a digitação é apagada a cada tecla, porque nada muda
  // `value` até uma sugestão ser escolhida).
  const editandoRef = useRef(false);

  useEffect(() => {
    if (!editandoRef.current) setTexto(selecionado ? getLabel(selecionado) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado]);

  function finalizarEdicao(): void {
    editandoRef.current = false;
    setAberto(false);
    if (texto.trim() === "") {
      if (value !== "") onChange("");
    } else {
      setTexto(selecionado ? getLabel(selecionado) : "");
    }
  }

  useEffect(() => {
    function aoClicarFora(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        finalizarEdicao();
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selecionado, texto, value]);

  const sugestoes = useMemo(() => {
    const busca = texto.trim().toLowerCase();
    if (busca === "") return items.slice(0, 20);
    return items.filter((item) => getLabel(item).toLowerCase().includes(busca)).slice(0, 20);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, texto]);

  function selecionar(item: T): void {
    editandoRef.current = false;
    onChange(item.id);
    setTexto(getLabel(item));
    setAberto(false);
  }

  const textoAparado = texto.trim();
  const podeCriar =
    onCriar != null &&
    textoAparado !== "" &&
    !items.some((item) => getLabel(item).toLowerCase() === textoAparado.toLowerCase());

  async function criar(): Promise<void> {
    if (!onCriar || !podeCriar) return;
    setCriando(true);
    setErroCriar(null);
    try {
      const novo = await onCriar(textoAparado);
      selecionar(novo);
    } catch (error) {
      setErroCriar(error instanceof Error ? error.message : "Não foi possível criar.");
    } finally {
      setCriando(false);
    }
  }

  return (
    <div className="om-autocomplete" ref={containerRef}>
      <input
        className="field-input"
        placeholder={placeholder ?? "Digite para buscar…"}
        value={texto}
        autoComplete="off"
        onChange={(event) => {
          editandoRef.current = true;
          setTexto(event.target.value);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
      />
      {aberto && (sugestoes.length > 0 || podeCriar) && (
        <ul className="om-autocomplete-lista">
          {sugestoes.map((item) => {
            const sublabel = getSublabel?.(item);
            return (
              <li key={item.id}>
                <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => selecionar(item)}>
                  <span className="om-autocomplete-numero">{getLabel(item)}</span>
                  {sublabel && <span className="om-autocomplete-detalhes">{sublabel}</span>}
                </button>
              </li>
            );
          })}
          {podeCriar && (
            <li>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void criar()}
                disabled={criando}
              >
                <span className="om-autocomplete-numero">{criando ? "Criando…" : `+ Criar "${textoAparado}"`}</span>
              </button>
            </li>
          )}
        </ul>
      )}
      {aberto && texto.trim() !== "" && sugestoes.length === 0 && !podeCriar && (
        <ul className="om-autocomplete-lista">
          <li className="om-autocomplete-vazio">Nenhum resultado encontrado</li>
        </ul>
      )}
      {erroCriar && <p className="feedback feedback--erro">{erroCriar}</p>}
    </div>
  );
}
