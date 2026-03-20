import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://pdiihywgdrclonsvdtrl.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkaWloeXdnZHJjbG9uc3ZkdHJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ3MDAxNjksImV4cCI6MjA4MDI3NjE2OX0.OgP-Hes0_sPjc5IbM-8MukcUfCN_iLRBxQquQoIPUZA';

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Supabase credentials missing!');
  console.error('Configure as variáveis de ambiente no Netlify:');
  console.error('- VITE_SUPABASE_URL');
  console.error('- VITE_SUPABASE_ANON_KEY');
  
  // Mostra erro visível na tela se estiver em produção
  if (import.meta.env.PROD) {
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      background: #ef4444;
      color: white;
      padding: 1rem;
      text-align: center;
      z-index: 9999;
      font-family: system-ui, -apple-system, sans-serif;
    `;
    errorDiv.innerHTML = `
      <strong>Erro de Configuração:</strong> Variáveis de ambiente do Supabase não configuradas. 
      Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no Netlify.
    `;
    document.body.appendChild(errorDiv);
  }
}

export const supabase = createClient(
  supabaseUrl || '', 
  supabaseAnonKey || ''
);
