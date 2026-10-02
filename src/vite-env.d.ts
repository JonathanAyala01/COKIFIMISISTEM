/// <reference types="vite/client" />

interface CokifimiSettings {
  apiBase?: string;
  isAdmin?: boolean;
  mode?: 'public' | 'wp-admin' | 'portal' | 'member' | 'member-register' | 'member-no-token';
  nonce?: string;
}

declare global {
  interface Window {
    cokifimiSettings?: CokifimiSettings;
  }
}

export {};
