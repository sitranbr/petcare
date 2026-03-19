import React from 'react';
import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { LogOut, LayoutDashboard, Users, Settings as SettingsIcon, Shield, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { clsx } from 'clsx';

export const Layout = () => {
  const { user, logout, profileError } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const currentMonth = format(new Date(), 'MMMM/yyyy', { locale: ptBR });
  const isAdmin = user?.level === 1;

  // Verifica se o usuário pode visualizar a página de equipe
  const canViewTeam = () => {
    if (isAdmin) return true;
    // Verifica se tem a permissão principal ou a subpermissão de visualização
    return user?.permissions?.manage_users || user?.permissions?.visualizar_equipe;
  };

  // Lógica White Label: Usa o nome/logo da clínica se configurado, senão usa Petcare
  const systemDisplayName = settings.name && settings.name !== 'Petcare' ? settings.name : null;

  return (
    <div className="min-h-screen bg-petcare-bg font-sans text-gray-800">
      
      {/* Alerta de Perfil (Fail Safe) */}
      {profileError && (
        <div className="bg-amber-100 text-amber-800 text-xs font-medium px-4 py-2 text-center flex items-center justify-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{profileError} - Verifique sua conexão ou contate o suporte se persistir.</span>
        </div>
      )}

      {/* Header */}
      <header className="bg-white shadow-sm border-b border-petcare-light/20 sticky top-0 z-50">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            {/* Logo Section */}
            <div className="flex items-center gap-4">
              <Link to="/" className="h-10 flex items-center group">
                {/* 1. Tenta mostrar Logo Personalizado */}
                {settings.logoUrl ? (
                  <img 
                    src={settings.logoUrl} 
                    alt={settings.name} 
                    className="h-full w-auto object-contain group-hover:opacity-80 transition-opacity"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      e.currentTarget.nextElementSibling?.classList.remove('hidden');
                    }}
                  />
                ) : null}
                
                {/* 2. Se não tiver logo, mostra o texto */}
                <div className={`${settings.logoUrl ? 'hidden' : ''} text-3xl font-bold tracking-tight leading-none`}>
                  {systemDisplayName ? (
                    // Nome da Clínica (White Label Texto)
                    <span className="text-petcare-dark">{systemDisplayName}</span>
                  ) : (
                    // Nome Padrão do Sistema (Petcare)
                    <>
                      <span className="text-petcare-light">Pet</span>
                      <span className="text-petcare-dark">care</span>
                    </>
                  )}
                </div>
              </Link>
              
              <div className="hidden md:block h-8 w-px bg-gray-100 mx-2"></div>
              
              {/* Navigation Links */}
              <nav className="hidden md:flex items-center space-x-1">
                <Link 
                  to="/" 
                  className={clsx(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center",
                    location.pathname === '/' 
                      ? "bg-petcare-bg text-petcare-dark" 
                      : "text-gray-500 hover:text-petcare-DEFAULT hover:bg-gray-50"
                  )}
                >
                  {isAdmin ? <Shield className="w-4 h-4 mr-2" /> : <LayoutDashboard className="w-4 h-4 mr-2" />}
                  {isAdmin ? 'Gestão SaaS' : 'Dashboard'}
                </Link>
                
                {canViewTeam() && (
                  <Link 
                    to="/users" 
                    className={clsx(
                      "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center",
                      location.pathname === '/users' 
                        ? "bg-petcare-bg text-petcare-dark" 
                        : "text-gray-500 hover:text-petcare-DEFAULT hover:bg-gray-50"
                    )}
                  >
                    <Users className="w-4 h-4 mr-2" />
                    Minha Equipe
                  </Link>
                )}

                <Link 
                  to="/settings" 
                  className={clsx(
                    "px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center",
                    location.pathname === '/settings' 
                      ? "bg-petcare-bg text-petcare-dark" 
                      : "text-gray-500 hover:text-petcare-DEFAULT hover:bg-gray-50"
                  )}
                >
                  <SettingsIcon className="w-4 h-4 mr-2" />
                  {isAdmin ? 'Configurações' : 'Meus Dados'}
                </Link>
              </nav>
            </div>
            
            {/* User & Info Section */}
            <div className="flex items-center gap-6">
              
              <div className="hidden lg:block text-right">
                <p className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">Mês Referência</p>
                <p className="text-sm font-bold text-petcare-dark capitalize">{currentMonth}</p>
              </div>
              
              <div className="flex items-center gap-3 pl-6 md:border-l border-gray-100">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-bold text-gray-700">{user?.name}</p>
                  <div className="flex items-center justify-end gap-1">
                    <span className="text-[10px] bg-gray-100 px-1.5 py-0.5 rounded text-gray-500 font-bold uppercase">
                      {user?.role === 'admin' ? 'Super Admin' : user?.role === 'vet' ? 'Veterinário' : user?.role === 'clinic' ? 'Clínica' : 'Recepção'}
                    </span>
                  </div>
                </div>
                <button 
                  onClick={handleLogout}
                  className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all duration-200"
                  title="Sair"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Mobile Navigation */}
        <div className="md:hidden border-t border-gray-100 flex justify-around p-2 bg-white">
          <Link 
            to="/" 
            className={clsx(
              "p-2 rounded-lg flex flex-col items-center",
              location.pathname === '/' ? "text-petcare-dark bg-petcare-bg" : "text-gray-400"
            )}
          >
            {isAdmin ? <Shield className="w-5 h-5" /> : <LayoutDashboard className="w-5 h-5" />}
            <span className="text-[10px] font-bold mt-1">{isAdmin ? 'SaaS' : 'Dash'}</span>
          </Link>
          
          {canViewTeam() && (
            <Link 
              to="/users" 
              className={clsx(
                "p-2 rounded-lg flex flex-col items-center",
                location.pathname === '/users' ? "text-petcare-dark bg-petcare-bg" : "text-gray-400"
              )}
            >
              <Users className="w-5 h-5" />
              <span className="text-[10px] font-bold mt-1">Equipe</span>
            </Link>
          )}

          <Link 
            to="/settings" 
            className={clsx(
              "p-2 rounded-lg flex flex-col items-center",
              location.pathname === '/settings' ? "text-petcare-dark bg-petcare-bg" : "text-gray-400"
            )}
          >
            <SettingsIcon className="w-5 h-5" />
            <span className="text-[10px] font-bold mt-1">{isAdmin ? 'Config' : 'Dados'}</span>
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
    </div>
  );
};
