import * as THREE from "three";

// ResizeObserver-driven canvas + camera sync.
// Caps pixelRatio at 2; retina 3x destroys framerate on integrated GPUs
// for negligible visual gain on this content.

const MAX_PIXEL_RATIO = 2;

export function attachResize(
  canvas: HTMLCanvasElement,
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): () => void {
  const apply = (width: number, height: number) => {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false); // false: don't write inline style; CSS handles layout
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };

  // Initial sync against current parent size
  const parent = canvas.parentElement ?? document.body;
  const initial = parent.getBoundingClientRect();
  apply(initial.width, initial.height);

  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const { width, height } = entry.contentRect;
      apply(width, height);
    }
  });
  observer.observe(parent);

  return () => observer.disconnect();
}
