import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export interface AssinaturaCanvasHandle {
  /** `null` se nada foi desenhado ainda. */
  exportarPng: () => Promise<Blob | null>;
  limpar: () => void;
}

interface AssinaturaCanvasProps {
  altura?: number;
}

/**
 * Campo de assinatura desenhada (mouse ou touch) — usado tanto pelo
 * encarregado (ao finalizar o RDO) quanto pelo fiscal (ao aprovar), ambos
 * via `packages/web`. Exporta a imagem só quando o pai pedir
 * (`exportarPng`), não a cada traço — evita trabalho desnecessário
 * enquanto a pessoa ainda está desenhando.
 */
const AssinaturaCanvas = forwardRef<AssinaturaCanvasHandle, AssinaturaCanvasProps>(function AssinaturaCanvas(
  { altura = 150 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const desenhandoRef = useRef(false);
  const [temTraco, setTemTraco] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Resolução real do canvas = tamanho exibido × devicePixelRatio, pra
    // não ficar borrado em telas de alta densidade (celular).
    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2.5;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#0b1120";
    }
  }, []);

  function posicao(event: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function aoPressionar(event: React.PointerEvent<HTMLCanvasElement>): void {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    desenhandoRef.current = true;
    const { x, y } = posicao(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function aoMover(event: React.PointerEvent<HTMLCanvasElement>): void {
    if (!desenhandoRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = posicao(event);
    ctx.lineTo(x, y);
    ctx.stroke();
    setTemTraco(true);
  }

  function aoSoltar(): void {
    desenhandoRef.current = false;
  }

  function limpar(): void {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTemTraco(false);
  }

  useImperativeHandle(ref, () => ({
    limpar,
    exportarPng: () =>
      new Promise((resolve) => {
        const canvas = canvasRef.current;
        if (!canvas || !temTraco) {
          resolve(null);
          return;
        }
        canvas.toBlob((blob) => resolve(blob), "image/png");
      }),
  }));

  return (
    <div className="assinatura-canvas-wrapper">
      <canvas
        ref={canvasRef}
        className="assinatura-canvas"
        style={{ height: altura }}
        onPointerDown={aoPressionar}
        onPointerMove={aoMover}
        onPointerUp={aoSoltar}
        onPointerLeave={aoSoltar}
      />
      <div className="assinatura-canvas-acoes">
        <span className="list-subtitle">{temTraco ? "Assinatura pronta" : "Desenhe sua assinatura acima"}</span>
        <button type="button" className="button button--secondary button--small" onClick={limpar}>
          Limpar
        </button>
      </div>
    </div>
  );
});

export default AssinaturaCanvas;
