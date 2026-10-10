/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string; // adresse du projet Supabase (ex. https://xxxx.supabase.co)
}

declare const __APP_VERSION__: string;
