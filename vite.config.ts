
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // Use (process as any).cwd() to fix the error: Property 'cwd' does not exist on type 'Process'.
  // This ensures loadEnv accurately targets the project root for environment file discovery.
  const env = loadEnv(mode, (process as any).cwd(), '');
  
  return {
    plugins: [react()],
    define: {
      // Prioriza a chave do .env, mas aceita do sistema se disponível
      'process.env.API_KEY': JSON.stringify(env.API_KEY || env.GEMINI_API_KEY)
    },
    server: {
      // Garante que o HMR (Hot Module Replacement) não dê erro de WebSocket
      hmr: {
        overlay: true
      }
    }
  };
});
