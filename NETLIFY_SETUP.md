# Configuração do Netlify - Petcare

Este documento descreve como configurar corretamente o deploy do Petcare no Netlify.

## 1. Variáveis de Ambiente Obrigatórias

No painel do Netlify, vá em **Site settings > Environment variables** e adicione:

```
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-key-aqui
```

⚠️ **IMPORTANTE:** Sem essas variáveis, o sistema não funcionará e mostrará uma página em branco ou erro.

## 2. Configurações de Build

O arquivo `netlify.toml` já está configurado com:

- **Build command:** `npm install && npm run build`
- **Publish directory:** `dist`
- **Node version:** 18

## 3. Verificações Pós-Deploy

Após o deploy, verifique:

1. ✅ Console do navegador (F12) para erros JavaScript
2. ✅ Network tab para verificar se as requisições ao Supabase estão funcionando
3. ✅ Se a página está em branco, verifique se as variáveis de ambiente foram configuradas corretamente

## 4. Problemas Comuns

### Página em Branco
- **Causa:** Variáveis de ambiente não configuradas
- **Solução:** Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no Netlify

### Erro 404 em Rotas
- **Causa:** Arquivo `_redirects` não está funcionando
- **Solução:** Verifique se o arquivo `public/_redirects` contém: `/*    /index.html   200`

### Build Falha
- **Causa:** Dependências ou versão do Node
- **Solução:** Verifique os logs de build no Netlify e ajuste a versão do Node se necessário

## 5. Teste Local do Build

Antes de fazer deploy, teste localmente:

```bash
npm run build
npm run preview
```

Isso simula o ambiente de produção e ajuda a identificar problemas antes do deploy.
