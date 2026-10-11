/** Justificatif de remplacement (image SVG générée localement, sans service externe). */

export function generateProofPlaceholder(params: {
  operatorName: string;
  score: number;
  clientTag: string;
  timestamp?: string;
}): string {
  const esc = (t: string) => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const { operatorName, score, clientTag, timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19) } = params;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" width="1280" height="720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  <rect x="0" y="0" width="1280" height="120" fill="#1e293b"/>
  <text x="60" y="76" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" fill="#ffffff">Gestion Pro · Justificatif</text>
  <text x="60" y="230" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#475569">Opérateur</text>
  <text x="60" y="280" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="700" fill="#0f172a">${esc(operatorName)}</text>
  <text x="60" y="380" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#475569">Mission</text>
  <text x="60" y="430" font-family="Arial,Helvetica,sans-serif" font-size="40" font-weight="700" fill="#0f172a">${esc(clientTag)}</text>
  <text x="60" y="530" font-family="Arial,Helvetica,sans-serif" font-size="28" fill="#475569">Quantité</text>
  <text x="60" y="590" font-family="Arial,Helvetica,sans-serif" font-size="56" font-weight="700" fill="#1d4ed8">${Number(score).toLocaleString('fr-FR')}</text>
  <text x="60" y="680" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#64748b">${esc(timestamp)}</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
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
