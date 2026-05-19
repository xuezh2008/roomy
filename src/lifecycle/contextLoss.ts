// Handle WebGL context loss / restore.
// Context loss happens on GPU switching (e.g., MacBook integrated <-> discrete),
// long-backgrounded tabs, or driver crashes. Without preventDefault on the
// 'webglcontextlost' event, the browser refuses to restore the context.
// three.js re-uploads GPU resources automatically on the next render after
// restoration; our job is just to stop the RAF loop while it's lost.

export interface ContextLossHandlers {
  onLost?: () => void;
  onRestored?: () => void;
}

export function attachContextLoss(
  canvas: HTMLCanvasElement,
  { onLost, onRestored }: ContextLossHandlers = {},
): () => void {
  const handleLost = (event: Event) => {
    event.preventDefault(); // required for the browser to attempt restore
    console.warn("[roomy] WebGL context lost");
    onLost?.();
  };

  const handleRestored = () => {
    console.info("[roomy] WebGL context restored");
    onRestored?.();
  };

  canvas.addEventListener("webglcontextlost", handleLost, false);
  canvas.addEventListener("webglcontextrestored", handleRestored, false);

  return () => {
    canvas.removeEventListener("webglcontextlost", handleLost);
    canvas.removeEventListener("webglcontextrestored", handleRestored);
  };
}
