/**
 * Tactical Delta Force screenshot generator and mock image provider
 * Generates high-fidelity SVG data URLs for game extraction / score proofs
 * so the application is 100% standalone and offline-capable without external CDNs.
 */

export function generateDeltaForceScreenshot(params: {
  operatorName: string;
  score: number;
  clientTag: string;
  isVictory?: boolean;
  extractionValue?: string;
  timestamp?: string;
  mode?: string;
}): string {
  const {
    operatorName,
    score,
    clientTag,
    isVictory = true,
    extractionValue = `${(score * 0.85).toLocaleString()} TEK-COINS`,
    timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19),
    mode = 'HAZARD OPERATIONS // EXTRACTION',
  } = params;

  const scoreFormatted = Number(score).toLocaleString();
  const accentColor = isVictory ? '#10b981' : '#f59e0b';
  const badgeText = isVictory ? 'EXTRACTION SUCCESSFUL' : 'CONTRACT COMPLETED';

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <defs>
    <linearGradient id="bgGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0f16"/>
      <stop offset="50%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#070a0e"/>
    </linearGradient>
    <linearGradient id="panelGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.85"/>
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.95"/>
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" stroke-width="0.5" stroke-opacity="0.3"/>
    </pattern>
    <linearGradient id="goldGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#fbbf24"/>
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1280" height="720" fill="url(#bgGrad)"/>
  <rect width="1280" height="720" fill="url(#grid)"/>

  <!-- Tactical Vignette & Grid Lines -->
  <circle cx="640" cy="360" r="320" fill="none" stroke="#0ea5e9" stroke-width="1" stroke-dasharray="4 8" opacity="0.2"/>
  <line x1="80" y1="360" x2="1200" y2="360" stroke="#334155" stroke-width="1" stroke-dasharray="2 10" opacity="0.3"/>
  <line x1="640" y1="60" x2="640" y2="660" stroke="#334155" stroke-width="1" stroke-dasharray="2 10" opacity="0.3"/>

  <!-- Top Tactical Header HUD -->
  <rect x="60" y="40" width="1160" height="60" rx="6" fill="#0f172a" stroke="#334155" stroke-width="1"/>
  <circle cx="85" cy="70" r="6" fill="${accentColor}"/>
  <text x="105" y="75" font-family="monospace" font-size="16" font-weight="bold" fill="#38bdf8" letter-spacing="2">DELTA FORCE // TACTICAL BOOST VERIFICATION PROOF</text>
  <text x="880" y="75" font-family="monospace" font-size="14" fill="#94a3b8">${timestamp} UTC</text>
  
  <!-- Status Banner -->
  <rect x="60" y="120" width="450" height="42" rx="4" fill="${accentColor}" fill-opacity="0.15" stroke="${accentColor}" stroke-width="1.5"/>
  <text x="85" y="147" font-family="system-ui, sans-serif" font-size="18" font-weight="900" fill="${accentColor}" letter-spacing="1.5">● ${badgeText}</text>
  <text x="330" y="147" font-family="monospace" font-size="13" fill="#cbd5e1">${mode}</text>

  <!-- Main Score Card Panel -->
  <rect x="60" y="180" width="760" height="480" rx="8" fill="url(#panelGrad)" stroke="#334155" stroke-width="1.5"/>
  
  <!-- Operator Details -->
  <text x="100" y="230" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#64748b" letter-spacing="1">CLIENT ACCOUNT &amp; BOOSTER UID</text>
  <text x="100" y="270" font-family="system-ui, sans-serif" font-size="28" font-weight="800" fill="#f8fafc">${clientTag}</text>
  <text x="100" y="300" font-family="monospace" font-size="15" fill="#38bdf8">OPERATOR ASSIGNED: ${operatorName.toUpperCase()}</text>

  <!-- Large Game Score Readout -->
  <line x1="100" y1="330" x2="780" y2="330" stroke="#334155" stroke-width="1"/>
  <text x="100" y="375" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#94a3b8" letter-spacing="2">VERIFIED MATCH / ACCOUNT SCORE</text>
  <text x="100" y="445" font-family="monospace" font-size="62" font-weight="900" fill="#ffffff" letter-spacing="1">${scoreFormatted}</text>
  <text x="100" y="475" font-family="monospace" font-size="16" fill="#10b981">PTS // ANTI-CHEAT SIGNATURE: SHA256-${Math.random().toString(36).substring(2, 10).toUpperCase()}</text>

  <!-- Secondary Metrics Grid -->
  <rect x="100" y="510" width="300" height="110" rx="6" fill="#0b111e" stroke="#1e293b" stroke-width="1"/>
  <text x="120" y="540" font-family="monospace" font-size="12" fill="#64748b">ESTIMATED MANDELBRICKS</text>
  <text x="120" y="580" font-family="monospace" font-size="26" font-weight="bold" fill="#f59e0b">x 4 QUANTUM</text>
  <text x="120" y="605" font-family="monospace" font-size="12" fill="#10b981">Extraction Secured</text>

  <rect x="440" y="510" width="340" height="110" rx="6" fill="#0b111e" stroke="#1e293b" stroke-width="1"/>
  <text x="460" y="540" font-family="monospace" font-size="12" fill="#64748b">TOTAL EXTRACTION LOOT VALUE</text>
  <text x="460" y="580" font-family="monospace" font-size="24" font-weight="bold" fill="#38bdf8">${extractionValue}</text>
  <text x="460" y="605" font-family="monospace" font-size="12" fill="#94a3b8">Zero-death extraction confirmed</text>

  <!-- Right Side Tactical Badge & Watermark -->
  <rect x="850" y="180" width="370" height="480" rx="8" fill="url(#panelGrad)" stroke="#334155" stroke-width="1.5"/>
  <text x="880" y="230" font-family="system-ui, sans-serif" font-size="14" font-weight="bold" fill="#64748b" letter-spacing="1">DELTA FORCE SYSTEM PROOF</text>
  
  <!-- Operator Emblem Box -->
  <rect x="880" y="260" width="310" height="180" rx="6" fill="#070c14" stroke="#0284c7" stroke-width="1"/>
  <polygon points="1035,280 1100,345 1035,410 970,345" fill="none" stroke="#0ea5e9" stroke-width="2"/>
  <circle cx="1035" cy="345" r="45" fill="none" stroke="${accentColor}" stroke-width="2"/>
  <text x="1035" y="340" font-family="system-ui, sans-serif" font-size="13" font-weight="bold" fill="#ffffff" text-anchor="middle">DELTA FORCE</text>
  <text x="1035" y="360" font-family="monospace" font-size="10" fill="#38bdf8" text-anchor="middle">OPERATIONS HQ</text>

  <text x="880" y="475" font-family="monospace" font-size="13" fill="#94a3b8">CLIENT TARGET: 25,000,000 PTS</text>
  <text x="880" y="505" font-family="monospace" font-size="13" fill="#94a3b8">REGIONAL SERVER: EU-CENTRAL (24ms)</text>
  <text x="880" y="535" font-family="monospace" font-size="13" fill="#94a3b8">HASH: 9F7A-${Math.floor(score / 1000).toString(16).toUpperCase()}</text>
  
  <rect x="880" y="565" width="310" height="65" rx="4" fill="#132e22" stroke="#10b981" stroke-width="1"/>
  <text x="900" y="595" font-family="system-ui, sans-serif" font-size="12" font-weight="bold" fill="#10b981">AUTHENTICITY VERIFIED</text>
  <text x="900" y="615" font-family="monospace" font-size="11" fill="#cbd5e1">Timestamp watermarked for anti-tamper</text>
</svg>
`.trim();

  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export function generateCVDocument(name: string, role: string, rank: string): string {
  // Returns HTML or printable representation if needed
  return `CV-${name.replace(/\s+/g, '_')}.pdf`;
}

export function compressImageToDataUrl(file: File, size = 480, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture impossible'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Image invalide'));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas indisponible'));
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}


// Réduit une capture/photo de preuve : 1280 px max, JPEG, autour de 150 Ko.
// Rapide : l'original n'est jamais converti en base64, et 3 essais de qualité au maximum.
export function compressProofImage(file: File, maxSide = 1280, targetBytes = 150 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image invalide')); };
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxSide / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * ratio));
      const h = Math.max(1, Math.round(img.height * ratio));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas indisponible'));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const bytes = (d: string) => d.length * 0.75; // taille approximative d'un data URL base64
      let q = 0.8;
      let out = canvas.toDataURL('image/jpeg', q);
      // le JPEG diminue vite avec la qualité : on estime la bonne valeur en 2 essais de plus
      for (let i = 0; i < 2 && bytes(out) > targetBytes && q > 0.4; i++) {
        q = Math.max(0.4, q * Math.min(0.9, Math.sqrt(targetBytes / bytes(out)) ));
        out = canvas.toDataURL('image/jpeg', q);
      }
      resolve(out);
    };
    img.src = url;
  });
}
