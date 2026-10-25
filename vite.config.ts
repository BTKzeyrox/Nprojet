import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'path';
import { buildPrecache, type BundleItem } from './src/utils/swRules';
import {defineConfig} from 'vite';

// Même numéro de version pour le site (__APP_VERSION__) et pour le fichier version.json (rechargement automatique)
const APP_VERSION = (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 7) || `local-${Date.now().toString(36)}`;

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        // Publie /sw-precache.json : la liste des fichiers que le service worker garde pour ouvrir l'appli sans réseau (module 13, M13.4)
        name: 'df-sw-precache',
        generateBundle(_options: unknown, bundle: Record<string, any>) {
          const walk = (dir: string, base = ''): string[] => fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap(d => d.isDirectory() ? walk(path.join(dir, d.name), `${base}${d.name}/`) : [`${base}${d.name}`]) : [];
          const publicFiles = walk(path.resolve(__dirname, 'public')).filter(f => f !== 'sw.js').map(f => '/' + f);
          const items: BundleItem[] = Object.values(bundle).map((o: any) => o.type === 'chunk'
            ? { fileName: o.fileName, type: 'chunk' as const, isEntry: !!o.isEntry, imports: o.imports || [], dynamicImports: o.dynamicImports || [], importedCss: [...(o.viteMetadata?.importedCss || [])] }
            : { fileName: o.fileName, type: 'asset' as const });
          (this as any).emitFile({ type: 'asset', fileName: 'sw-precache.json', source: JSON.stringify(buildPrecache(items, publicFiles, APP_VERSION)) });
        },
      },
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
