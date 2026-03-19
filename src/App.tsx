import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SettingsProvider } from './context/SettingsContext';
import { RegistryProvider } from './context/RegistryContext';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { AdminUsers } from './pages/AdminUsers';
import { AdminSettings } from './pages/AdminSettings';
import { Layout } from './components/Layout';
import { Loader2, LogOut, RefreshCw } from 'lucide-react';
import { supabase } from './lib/supabase';

const LoadingScreen = () => {
  const [showOptions, setShowOptions] = useState(false);

  useEffect(() => {
    // Reduzido para 8 segundos para dar feedback mais rápido ao usuário
    const timer = setTimeout(() => setShowOptions(true), 8000);
    return () => clearTimeout(timer);
  }, []);

  const handleForceLogout = async () => {
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-petcare-bg p-4">
      <div className="flex flex-col items-center gap-4 max-w-sm text-center">
        <Loader2 className="w-10 h-10 text-petcare-DEFAULT animate-spin" />
        <p className="text-gray-500 font-medium">Carregando sistema...</p>
        
        {showOptions && (
          <div className="mt-4 flex flex-col gap-3 animate-fade-in w-full">
            <p className="text-xs text-red-400">Está demorando mais que o normal?</p>
            <button 
              onClick={handleReload}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 shadow-sm transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Tentar Novamente
            </button>
            <button 
              onClick={handleForceLogout}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600 hover:bg-red-100 transition-colors"
            >
              <LogOut className="w-4 h-4" /> Sair e Relogar
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

function App() {
  // Verifica se as variáveis de ambiente estão configuradas
  useEffect(() => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('❌ Variáveis de ambiente do Supabase não configuradas!');
      console.error('Configure no Netlify: VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY');
    }
  }, []);

  return (
    <AuthProvider>
      <SettingsProvider>
        <RegistryProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              
              <Route path="/" element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }>
                <Route index element={<Dashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="settings" element={<AdminSettings />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </RegistryProvider>
      </SettingsProvider>
    </AuthProvider>
  );
}

export default App;
