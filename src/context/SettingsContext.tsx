import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { ClinicSettings } from '../types';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

interface SettingsContextType {
  settings: ClinicSettings;
  updateSettings: (newSettings: Partial<ClinicSettings>) => void;
  resetSettings: () => void;
}

// REBRANDING: Alterado de PIQUET para Petcare
const DEFAULT_SETTINGS: ClinicSettings = {
  systemName: 'Petcare Sistema Veterinário',
  name: 'Petcare',
  layoutMode: 'top',
  address: '',
  phone: '',
  email: '',
  document: '',
  logoUrl: ''
};

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  const [settings, setSettings] = useState<ClinicSettings>(DEFAULT_SETTINGS);

  // Limpeza de cache antigo
  useEffect(() => {
    localStorage.removeItem('petcare_settings');
    localStorage.removeItem('piquet_settings');
  }, []);

  // Carrega configurações do Banco de Dados baseadas no usuário logado
  // Se o usuário for um convidado (tem ownerId), usa as configurações do criador
  useEffect(() => {
    let isMounted = true;

    const loadSettings = async () => {
      // Se não houver usuário, usa o padrão (Petcare)
      if (!user) {
        if (isMounted) setSettings(DEFAULT_SETTINGS);
        return;
      }

      // Clínicas, Veterinários E Recepção têm personalização (White Label)
      if (user.role === 'vet' || user.role === 'clinic' || user.role === 'reception' || user.level === 5) {
        try {
          // Se o usuário é um convidado ou equipe interna (tem ownerId), busca as configurações do criador
          const isGuest = user.ownerId && user.ownerId !== user.id;
          const isReception = user.role === 'reception' || user.level === 5;
          let targetUserId = user.id;
          let targetTable = user.role === 'vet' ? 'veterinarians' : 'clinics';
          
          if (isGuest || isReception) {
            // Para convidados/recepção, precisa buscar o role do criador para saber qual tabela usar
            const { data: ownerProfile } = await supabase
              .from('profiles')
              .select('role')
              .eq('id', user.ownerId)
              .maybeSingle();
            
            if (ownerProfile) {
              targetUserId = user.ownerId;
              // Usa a tabela correspondente ao role do criador
              targetTable = ownerProfile.role === 'vet' ? 'veterinarians' : 'clinics';
              
              console.log('🎨 Usuário dependente detectado. Buscando configurações do criador:', {
                userId: user.id,
                userRole: user.role,
                ownerId: user.ownerId,
                ownerRole: ownerProfile.role,
                targetTable
              });
            } else {
              console.warn('⚠️ Perfil do criador não encontrado, usando configurações padrão');
              if (isMounted) setSettings(DEFAULT_SETTINGS);
              return;
            }
          }
          
          // Busca dados vinculados ao perfil do criador (ou do próprio usuário se não for dependente)
          const { data } = await supabase
            .from(targetTable)
            .select('name, document, phone, email, address, logo_url, crmv')
            .eq('profile_id', targetUserId)
            .maybeSingle();

          if (isMounted && data) {
            setSettings(prev => ({
              ...prev,
              name: data.name || prev.name,
              // Mapeia corretamente o documento dependendo da tabela usada (Vet usa CRMV, Clínica usa document)
              document: (targetTable === 'veterinarians' ? data.crmv : data.document) || prev.document,
              phone: data.phone || prev.phone,
              email: data.email || prev.email,
              address: data.address || prev.address,
              logoUrl: data.logo_url || ''
            }));
            
            if (isGuest || isReception) {
              console.log('✅ Configurações do criador aplicadas ao dependente:', {
                name: data.name,
                logoUrl: data.logo_url,
                document: targetTable === 'veterinarians' ? data.crmv : data.document
              });
            }
          } else if (isMounted) {
             // Se o usuário existe mas não tem dados na tabela específica ainda, mantém padrão
             console.warn('⚠️ Dados não encontrados na tabela', targetTable, 'para profile_id', targetUserId);
             setSettings(DEFAULT_SETTINGS);
          }
        } catch (err) {
          console.error("Erro ao carregar configurações:", err);
          if (isMounted) setSettings(DEFAULT_SETTINGS);
        }
      } else {
        // Admin ou outros níveis usam o padrão do sistema
        if (isMounted) setSettings(DEFAULT_SETTINGS);
      }
    };

    loadSettings();

    return () => { isMounted = false; };
  }, [user]); // Recarrega sempre que o usuário mudar (Login/Logout)

  const updateSettings = (newSettings: Partial<ClinicSettings>) => {
    setSettings(prev => ({ ...prev, ...newSettings }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, resetSettings }}>
      {children}
    </SettingsContext.Provider>
  );
};

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (!context) throw new Error('useSettings must be used within a SettingsProvider');
  return context;
};
