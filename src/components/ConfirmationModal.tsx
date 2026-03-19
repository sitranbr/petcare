import React, { useState, useEffect } from 'react';
import { AlertTriangle, Lock, AlertCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (password?: string) => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning';
  requirePassword?: boolean;
  errorMessage?: string; // Nova prop para mensagem de erro
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  variant = 'danger',
  requirePassword = false,
  errorMessage
}) => {
  const [password, setPassword] = useState('');

  // Limpa o campo de senha sempre que o modal é aberto
  useEffect(() => {
    if (isOpen) {
      setPassword('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirmClick = () => {
    onConfirm(password);
    // Não limpamos a senha aqui imediatamente para permitir correção caso falhe
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm transition-opacity duration-300">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden transform transition-all scale-100 border border-gray-100">
        <div className="p-6 text-center">
          <div className={`mx-auto flex items-center justify-center h-14 w-14 rounded-full mb-5 ${
            variant === 'danger' ? 'bg-red-50' : 'bg-amber-50'
          }`}>
            <AlertTriangle className={`h-7 w-7 ${
              variant === 'danger' ? 'text-red-500' : 'text-amber-500'
            }`} />
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
          <p className="text-sm text-gray-500 mb-6 leading-relaxed">{message}</p>
          
          {requirePassword && (
            <div className={`mb-6 text-left bg-gray-50 p-3 rounded-xl border transition-colors ${
              errorMessage ? 'border-red-200 bg-red-50/30' : 'border-gray-200'
            }`}>
              <label className={`block text-xs font-bold uppercase mb-1 ml-1 ${
                errorMessage ? 'text-red-500' : 'text-gray-500'
              }`}>
                Senha do Administrador
              </label>
              <div className="relative">
                <Lock className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${
                  errorMessage ? 'text-red-400' : 'text-gray-400'
                }`} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 outline-none text-sm transition-all ${
                    errorMessage 
                      ? 'border-red-300 focus:ring-red-500 focus:border-red-500 text-red-900 placeholder-red-300' 
                      : 'border-gray-300 focus:ring-red-500 focus:border-transparent text-gray-900'
                  }`}
                  placeholder="Autorização necessária"
                  autoFocus
                />
              </div>
              
              {errorMessage ? (
                <p className="text-xs text-red-600 mt-2 font-medium flex items-center animate-pulse">
                  <AlertCircle className="w-3 h-3 mr-1" />
                  {errorMessage}
                </p>
              ) : (
                <p className="text-[10px] text-red-500 mt-1 ml-1">
                  * Exclusão restrita. Peça liberação.
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2.5 bg-white text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50 hover:border-gray-300 font-semibold transition-all duration-200"
            >
              {cancelLabel}
            </button>
            <button
              onClick={handleConfirmClick}
              disabled={requirePassword && !password}
              className={`flex-1 px-4 py-2.5 text-white rounded-xl font-semibold transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed ${
                variant === 'danger' 
                  ? 'bg-red-500 hover:bg-red-600 shadow-red-200' 
                  : 'bg-amber-500 hover:bg-amber-600 shadow-amber-200'
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
