// Adapte une couleur de marque (entité) pour qu'elle reste LISIBLE selon le thème.
//  - en sombre : éclaircit les couleurs trop foncées (ex. ARTISAN PRO anthracite/noir,
//    sinon texte noir invisible sur fond sombre) ;
//  - en clair : assombrit légèrement les couleurs trop claires (ex. verts pâles).
// La teinte (hue) est conservée — on ne change que la luminosité au besoin.

function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
const toHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
const luminance = (r: number, g: number, b: number) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

export function couleurLisible(hex: string | null | undefined, dark: boolean): string {
  const rgb = hex ? parseHex(hex) : null;
  if (!rgb) return dark ? '#94a3b8' : '#64748b'; // repli slate
  const [r, g, b] = rgb;
  const L = luminance(r, g, b);
  if (dark && L < 0.5) {
    const t = 0.55; // mélange vers le blanc
    return toHex(r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t);
  }
  if (!dark && L > 0.82) {
    const t = 0.35; // mélange vers le noir
    return toHex(r * (1 - t), g * (1 - t), b * (1 - t));
  }
  return toHex(r, g, b);
}
