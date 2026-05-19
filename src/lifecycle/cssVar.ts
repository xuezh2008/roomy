import * as THREE from "three";

// Bridge CSS custom properties to three.js values.
// CSS colors are sRGB; three.js (r155+) auto-converts via setStyle() because
// ColorManagement is enabled by default. Do NOT call convertSRGBToLinear()
// here — that would be a second pass and the scene goes near-black after
// tone mapping. The renderer handles linear → sRGB at the output stage
// via outputColorSpace = SRGBColorSpace.

const root = () => getComputedStyle(document.documentElement);

export function cssColor(name: string, fallback = "#ffffff"): THREE.Color {
  const value = root().getPropertyValue(name).trim() || fallback;
  return new THREE.Color().setStyle(value);
}

export function cssNumber(name: string, fallback = 0): number {
  const value = root().getPropertyValue(name).trim();
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Useful when a CSS var holds a rgba() value and you want only the alpha component
// (three.js setStyle drops alpha — read it separately if you need it).
export function cssAlpha(name: string, fallback = 1): number {
  const value = root().getPropertyValue(name).trim();
  const m = value.match(/rgba?\([^,]+,[^,]+,[^,]+(?:,\s*([\d.]+))?\)/);
  if (!m) return fallback;
  return m[1] === undefined ? 1 : parseFloat(m[1]);
}
