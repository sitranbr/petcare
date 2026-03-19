import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { User, Lock, Mail, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';

type Mode = 'login' | 'forgot';

// Nome da marca derivado do domínio (ex: medvetpiquet.com.br → Medvetpiquet)
const getBrandFromDomain = (): string => {
  if (typeof window === 'undefined') return 'Petcare';
  const host = window.location.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') return 'Petcare';
  const firstPart = host.split('.')[0] || '';
  if (!firstPart) return 'Petcare';
  return firstPart.charAt(0).toUpperCase() + firstPart.slice(1);
};

export const Login = () => {
  const { login, resetPassword, profileError } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const brandName = useMemo(() => getBrandFromDomain(), []);
  const [mode, setMode] = useState<Mode>('login');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Login Form
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // Forgot Password Form
  const [forgotEmail, setForgotEmail] = useState('');

  useEffect(() => {
    if (profileError) {
      setError(`Aviso: ${profileError}`);
    }
  }, [profileError]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);

    try {
      const { error } = await login(username, password);
      
      if (!error) {
        navigate('/');
      } else {
        if (error.message.includes('Email not confirmed') || (error as any).code === 'email_not_confirmed') {
          setError('E-mail não confirmado. Contate o administrador.');
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Usuário ou senha incorretos.');
        } else if (error.message.includes('Failed to fetch')) {
          setError('Erro de conexão. Verifique sua internet.');
        } else {
          setError(error.message);
        }
        setIsLoading(false);
      }
    } catch (err) {
      setError('Erro ao conectar ao servidor.');
      setIsLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setIsLoading(true);
    
    try {
      await resetPassword(forgotEmail);
      setSuccessMsg('Se o e-mail estiver cadastrado, você receberá um link.');
      setTimeout(() => setMode('login'), 5000);
    } catch (err: any) {
      setError(err.message || 'Erro ao solicitar recuperação.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-petcare-bg via-white to-petcare-light/20 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] w-full max-w-sm overflow-hidden border border-white/50 relative">
        
        <div className="bg-gradient-to-r from-petcare-light to-petcare-dark h-1.5 w-full"></div>
        
        <div className="p-8 pt-10">
          <div className="flex flex-col items-center mb-8">
            <div className="h-16 mb-6 flex items-center justify-center">
              {settings.logoUrl ? (
                <img 
                  src={settings.logoUrl} 
                  alt={settings.name}
                  className="h-full w-auto object-contain"
                  onError={(e) => {
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
              ) : null}
              
              <div className={`${settings.logoUrl ? 'hidden' : ''} text-4xl font-bold tracking-tight`}>
                {brandName === 'Petcare' ? (
                  <>
                    <span className="text-petcare-light">Pet</span>
                    <span className="text-petcare-dark">care</span>
                  </>
                ) : (
                  <span className="text-petcare-dark">{brandName}</span>
                )}
              </div>
            </div>
            
            <h2 className="text-2xl font-bold text-gray-800">
              {mode === 'login' && 'Acesso Restrito'}
              {mode === 'forgot' && 'Recuperar Senha'}
            </h2>
            {mode === 'login' && (
              <div className="flex items-center gap-1 mt-2 bg-gray-100 px-3 py-1 rounded-full">
                <ShieldCheck className="w-3 h-3 text-petcare-dark" />
                <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Sistema Fechado</p>
              </div>
            )}
          </div>

          {error && (
            <div className="mb-6 p-3 bg-red-50 text-red-600 text-sm rounded-lg flex flex-col items-center justify-center animate-fade-in text-center border border-red-100 gap-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-3 bg-green-50 text-green-600 text-sm rounded-lg flex items-center justify-center animate-fade-in text-center border border-green-100">
              {successMsg}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-4">
                <div className="relative group">
                  <User className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-petcare-DEFAULT transition-colors" />
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-petcare-DEFAULT/20 focus:border-petcare-DEFAULT outline-none transition-all bg-gray-50 focus:bg-white text-gray-700 placeholder-gray-400"
                    placeholder="E-mail"
                    required
                  />
                </div>

                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5 group-focus-within:text-petcare-DEFAULT transition-colors" />
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-3.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-petcare-DEFAULT/20 focus:border-petcare-DEFAULT outline-none transition-all bg-gray-50 focus:bg-white text-gray-700 placeholder-gray-400"
                    placeholder="Senha"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-petcare-dark text-white py-3.5 rounded-xl font-bold hover:bg-petcare-DEFAULT transition-all transform hover:scale-[1.02] shadow-lg shadow-petcare-light/20 flex items-center justify-center tracking-wide mt-2"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>ENTRANDO...</span>
                  </div>
                ) : 'ENTRAR'}
              </button>

              <div className="flex flex-col items-center gap-4 mt-6 pt-4 border-t border-gray-100">
                <button 
                  type="button"
                  onClick={() => { setMode('forgot'); setError(''); setSuccessMsg(''); }}
                  className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Esqueci minha senha
                </button>
              </div>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-5">
              <div className="text-center mb-2">
                <p className="text-sm text-gray-500">Informe seu e-mail para receber as instruções.</p>
              </div>
              
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-petcare-DEFAULT outline-none bg-gray-50"
                  placeholder="Seu e-mail cadastrado"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-petcare-DEFAULT text-white py-3 rounded-xl font-bold hover:bg-petcare-dark transition-all flex items-center justify-center"
              >
                {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar Link'}
              </button>

              <button 
                type="button"
                onClick={() => { setMode('login'); setError(''); setSuccessMsg(''); }}
                className="text-gray-500 text-sm py-2 hover:text-gray-700 flex items-center justify-center"
              >
                Voltar para Login
              </button>
            </form>
          )}
        </div>
        
        <div className="bg-gray-50 py-3 text-center border-t border-gray-100">
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
            {brandName} &copy; {new Date().getFullYear()}
          </p>
        </div>
      </div>
    </div>
  );
};
