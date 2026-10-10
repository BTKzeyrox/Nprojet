import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

// Même numéro de version pour le site (__APP_VERSION__) et pour le fichier version.json (rechargement automatique)
const APP_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || `local-${Date.now().toString(36)}`;

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Publie /version.json avec le numéro de cette version : le site ouvert le relit pour savoir qu'une mise à jour est sortie
        name: 'df-version-json',
        generateBundle() {
          (this as any).emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ v: APP_VERSION }) });
        },
      },
    ],
    // Version affichée dans les rapports d'erreur : commit Vercel (7 caractères), sinon l'heure de construction
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
