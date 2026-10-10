import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AppProvider } from './context/AppContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { installGlobalErrorHandlers } from './utils/errorReport';
import { startUpdateWatcher } from './utils/updateWatcher';

// Erreurs hors écran (réseau, échec de chargement après mise à jour) : enregistrées dans le journal
installGlobalErrorHandlers();
// Rechargement automatique quand une nouvelle version du site est publiée (sans casser ce que la personne écrit)
startUpdateWatcher();

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary scope="app">
    <AppProvider>
      <App />
    </AppProvider>
  </ErrorBoundary>
);
