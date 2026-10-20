import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { applyFontSize } from './utils/fontSize';
applyFontSize();
import { AppProvider } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './utils/errorReport';
import { startUpdateWatcher } from './utils/updateWatcher';
import { installScrollRescue } from './utils/scrollRescue';

// Erreurs hors écran (réseau, échec de chargement après mise à jour) : enregistrées dans le journal
installGlobalErrorHandlers();
// Rechargement automatique quand une nouvelle version du site est publiée (sans casser ce que la personne écrit)
startUpdateWatcher();
// Filet de sécurité : si un geste de défilement (molette, pavé tactile, clavier, doigt) ne fait pas bouger la page alors qu'elle peut défiler, on la fait défiler
installScrollRescue();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary scope="app">
    <AppProvider>
      <App />
    </AppProvider>
  </ErrorBoundary>
);
