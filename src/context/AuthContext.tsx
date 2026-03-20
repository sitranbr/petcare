import React, { createContext, useContext, useState, ReactNode, useEffect, useRef } from 'react';
import { User, UserPermissions, TenantContext } from '../types';
import { supabase } from '../lib/supabase';
import { AuthError, createClient } from '@supabase/supabase-js';

// ... (interfaces mantidas)
interface AuthContextType {
  user: User | null;
  users: User[]; 
  login: (username: string, password: string) => Promise<{ error: AuthError | null }>;
  logout: () => void;
  register: (user: Omit<User, 'id'>) => Promise<{ user: User | null; error: AuthError | null }>; 
  updateUser: (id: string, data: Partial<User>) => Promise<{ error?: string }>;
  updateAccount: (data: { name?: string; email?: string; password?: string }) => Promise<{ error?: string }>;
  deleteUser: (id: string) => Promise<{ success: boolean; error?: string }>;
  resetPassword: (email: string) => Promise<void>;
  isAuthenticated: boolean;
  isLoading: boolean;
  profileError: string | null;
  getDefaultPermissions: (level: number) => UserPermissions;
  refreshUsers: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  
  currentTenant: TenantContext | null;
  availableTenants: TenantContext[];
  switchTenant: (tenantId: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ... (getDefaultPermissions mantido)
const getDefaultPermissions = (level: number): UserPermissions => {
  switch (level) {
    case 1: // Admin
      return { view_financials: true, manage_prices: true, edit_reports: true, export_reports: true, bypass_report_password: true, delete_exams: true, bypass_delete_password: true, manage_users: true, manage_settings: true };
    case 3: // Vet (Tenant or Guest)
      return { view_financials: true, manage_prices: false, edit_reports: true, export_reports: true, bypass_report_password: true, delete_exams: true, bypass_delete_password: true, manage_users: true, manage_settings: false };
    case 4: // Clinic (Tenant or Guest)
      return { view_financials: true, manage_prices: true, edit_reports: false, export_reports: true, bypass_report_password: true, delete_exams: true, bypass_delete_password: true, manage_users: true, manage_settings: false };
    default: // Reception (Level 5) - Equipe interna: quem opera o sistema, herda visão operacional do assinante
      return { view_financials: true, manage_prices: false, edit_reports: false, export_reports: true, bypass_report_password: false, delete_exams: true, bypass_delete_password: false, manage_users: false, manage_settings: false, criar_exame: true };
  }
};

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);
  
  const [currentTenant, setCurrentTenant] = useState<TenantContext | null>(null);
  const [availableTenants, setAvailableTenants] = useState<TenantContext[]>([]);

  const userIdRef = useRef<string | null>(null);
  const isHydratingRef = useRef(false);

  const createUserFromSession = (sessionUser: any): User => {
    const metadata = sessionUser.user_metadata || {};
    const level = metadata.level || 5;
    const role = metadata.role || 'reception';
    return {
      id: sessionUser.id,
      email: sessionUser.email || '',
      username: sessionUser.email || '',
      name: metadata.name || sessionUser.email?.split('@')[0] || 'Usuário',
      role: role,
      level: level,
      ownerId: metadata.ownerId || null,
      permissions: metadata.permissions || getDefaultPermissions(level)
    };
  };

  const setProvisionalTenant = (tempUser: User) => {
    const provisionalTenant: TenantContext = {
      id: tempUser.id,
      name: tempUser.name,
      type: tempUser.role === 'vet' ? 'vet' : 'clinic',
      isMe: true
    };
    setCurrentTenant(prev => prev || provisionalTenant);
    setAvailableTenants(prev => prev.length > 0 ? prev : [provisionalTenant]);
  };

  const loadLinkedTenants = async (currentUser: User) => {
    try {
      let myEntityId = currentUser.id;
      let myEntityName = currentUser.name;
      let myType: 'vet' | 'clinic' = currentUser.role === 'vet' ? 'vet' : 'clinic';

      if (currentUser.role === 'clinic' || currentUser.role === 'vet') {
         const tableName = currentUser.role === 'clinic' ? 'clinics' : 'veterinarians';
         const { data: byProfile } = await supabase.from(tableName).select('id, name').eq('profile_id', currentUser.id).maybeSingle();

         if (byProfile) {
           myEntityId = byProfile.id;
           myEntityName = byProfile.name;
         } else {
           const email = currentUser.email.trim().toLowerCase();
           const { data: byEmail } = await supabase.from(tableName).select('id, name').eq('email', email).maybeSingle();
           if (byEmail) {
             myEntityId = byEmail.id;
             myEntityName = byEmail.name;
             await supabase.from(tableName).update({ profile_id: currentUser.id }).eq('id', byEmail.id);
           }
         }
      } else if ((currentUser.role === 'reception' || currentUser.level === 5) && currentUser.ownerId) {
        // Membro da equipe interna (recepção): herda o contexto do assinante
        const ownerProfileId = currentUser.ownerId;
        
        // CORREÇÃO: Busca diretamente nas tabelas ignorando o 'role' do owner, 
        // pois o owner pode ser 'admin' (level 1) e não ter role 'vet' ou 'clinic'.
        
        // Tenta buscar na tabela de veterinários primeiro (mais comum para donos)
        const { data: vetByOwner } = await supabase.from('veterinarians').select('id, name').eq('profile_id', ownerProfileId).maybeSingle();
        
        if (vetByOwner) {
          myEntityId = vetByOwner.id;
          myEntityName = vetByOwner.name;
          myType = 'vet';
        } else {
          // Se não achou em vet, tenta em clinics
          const { data: clinicByOwner } = await supabase.from('clinics').select('id, name').eq('profile_id', ownerProfileId).maybeSingle();
          if (clinicByOwner) {
            myEntityId = clinicByOwner.id;
            myEntityName = clinicByOwner.name;
            myType = 'clinic';
          }
        }

        // Fallback: se RLS bloqueou as queries acima, usa RPC que bypassa RLS
        if (myEntityId === currentUser.id) {
          const { data: rpcData } = await supabase.rpc('get_owner_tenant_for_reception');
          if (rpcData?.id) {
            myEntityId = rpcData.id;
            myEntityName = rpcData.name || currentUser.name;
            myType = rpcData.type === 'vet' ? 'vet' : 'clinic';
          }
        }
      }

      const myTenant: TenantContext = { id: myEntityId, name: myEntityName, type: myType, isMe: true };
      setAvailableTenants([myTenant]);
      setCurrentTenant(myTenant);
    } catch (error) {
      if (!currentTenant) {
        setCurrentTenant({ id: currentUser.id, name: currentUser.name, type: currentUser.role === 'vet' ? 'vet' : 'clinic', isMe: true });
      }
    }
  };

  const hydrateUserProfile = async (sessionUser: any) => {
    if (isHydratingRef.current) return;
    isHydratingRef.current = true;
    try {
      const { data: profile } = await supabase.from('profiles').select('*').eq('id', sessionUser.id).maybeSingle();
      if (profile) {
        const dbUser: User = {
          id: profile.id, email: profile.email, name: profile.name, username: profile.email, role: profile.role, level: profile.level, ownerId: profile.owner_id, partners: profile.partners || null,
          permissions: profile.permissions || getDefaultPermissions(profile.level)
        };
        setUser(dbUser);
        await loadLinkedTenants(dbUser);
      }
    } catch (err) {
      setProfileError("Modo offline/limitado ativado.");
    } finally {
      isHydratingRef.current = false;
    }
  };

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) {
          if (error.message.includes('Refresh Token') || error.code === 'refresh_token_not_found') {
            await supabase.auth.signOut();
            setUser(null);
          }
          setIsLoading(false);
          return;
        }
        if (data.session?.user) {
          userIdRef.current = data.session.user.id;
          const tempUser = createUserFromSession(data.session.user);
          setUser(tempUser);
          setProvisionalTenant(tempUser);
          setIsLoading(false);
          hydrateUserProfile(data.session.user);
        } else {
          setIsLoading(false);
        }
      } catch (error) {
        setIsLoading(false);
      }
    };
    initializeAuth();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT' || event === 'USER_DELETED') {
        setUser(null);
        setCurrentTenant(null);
        userIdRef.current = null;
        setIsLoading(false);
      } else if (event === 'SIGNED_IN' && session?.user) {
        if (userIdRef.current !== session.user.id) {
           userIdRef.current = session.user.id;
           const tempUser = createUserFromSession(session.user);
           setUser(tempUser);
           setProvisionalTenant(tempUser);
           setIsLoading(false);
           hydrateUserProfile(session.user);
        }
      }
    });
    return () => { subscription.unsubscribe(); };
  }, []);

  const refreshProfile = async () => {
    if (!user) return;
    try {
      const { data: profile } = await supabase.from('profiles').select('id, name, email, role, level, owner_id, partners, permissions').eq('id', user.id).maybeSingle();
      if (profile) {
        const dbUser: User = {
          id: profile.id, email: profile.email, name: profile.name, username: profile.email, role: profile.role, level: profile.level, ownerId: profile.owner_id, partners: profile.partners || null,
          permissions: profile.permissions || getDefaultPermissions(profile.level)
        };
        setUser(dbUser);
        await loadLinkedTenants(dbUser);
      }
    } catch (err) {
      console.error('Erro ao atualizar perfil:', err);
    }
  };

  const refreshUsers = async () => {
    if (user?.permissions.manage_users) {
      let allProfiles: any[] = [];
      
      if (user.level === 1) {
        // Super Admin vê tudo
        const { data } = await supabase.from('profiles').select('*').in('level', [1, 3, 4]).order('created_at', { ascending: false });
        allProfiles = data || [];
      } else {
        // Usuários Normais (Clínica/Vet)
        const targetOwnerId = user.ownerId || user.id;
        
        // 1. Busca Equipe Interna (Criados por mim)
        const { data: ownedProfiles } = await supabase.from('profiles').select('*').eq('owner_id', targetOwnerId);
        allProfiles = ownedProfiles || [];

        // 2. Busca Parceiros Vinculados (Nova Lógica pela coluna 'partners')
        try {
          // Pega meu próprio perfil para ler o array 'partners'
          const { data: myProfile } = await supabase.from('profiles').select('partners').eq('id', user.id).maybeSingle();
          
          if (myProfile && myProfile.partners && Array.isArray(myProfile.partners) && myProfile.partners.length > 0) {
            // Busca os perfis que estão na minha lista de parceiros
            const { data: partnerProfiles } = await supabase.from('profiles').select('*').in('id', myProfile.partners);
            
            if (partnerProfiles) {
              // Adiciona à lista evitando duplicatas
              const existingIds = new Set(allProfiles.map(p => p.id));
              const newPartners = partnerProfiles.filter(p => !existingIds.has(p.id));
              allProfiles = [...allProfiles, ...newPartners];
            }
          }
        } catch (err) {
          console.error("Erro ao buscar parceiros vinculados:", err);
        }
      }

      if (allProfiles) {
        setUsers(allProfiles.map(p => ({
          id: p.id, name: p.name, email: p.email, username: p.email, role: p.role, level: p.level, ownerId: p.owner_id, partners: p.partners || null, permissions: p.permissions
        })));
      }
    }
  };

  useEffect(() => { if (user) refreshUsers(); }, [user]);

  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error };
    if (data.user) {
        userIdRef.current = data.user.id;
        const tempUser = createUserFromSession(data.user);
        setUser(tempUser);
        setProvisionalTenant(tempUser);
        setIsLoading(false);
        hydrateUserProfile(data.user);
    }
    return { error: null };
  };

  const logout = async () => {
    setUser(null);
    setCurrentTenant(null);
    userIdRef.current = null;
    await supabase.auth.signOut();
  };

  const register = async (newUser: Omit<User, 'id'>) => {
    const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    let ownerIdToSet = newUser.ownerId;
    if (user && user.level !== 1) { ownerIdToSet = user.ownerId || user.id; }
    const { data, error: authError } = await tempSupabase.auth.signUp({
      email: newUser.email, password: newUser.password || '123456',
      options: { data: { name: newUser.name, username: newUser.username, role: newUser.role, level: newUser.level, ownerId: ownerIdToSet, permissions: newUser.permissions } }
    });
    if (authError) return { user: null, error: authError };
    if (data.user) {
      const profileData = { id: data.user.id, email: newUser.email, name: newUser.name, role: newUser.role, level: newUser.level, owner_id: ownerIdToSet, permissions: newUser.permissions };
      await supabase.from('profiles').insert(profileData);
      if (newUser.role === 'clinic' || newUser.role === 'vet') {
        const tableName = newUser.role === 'clinic' ? 'clinics' : 'veterinarians';
        const { data: existing } = await supabase.from(tableName).select('id').eq('email', newUser.email).maybeSingle();
        if (existing) { await supabase.from(tableName).update({ profile_id: data.user.id }).eq('id', existing.id); } 
        else { await supabase.from(tableName).insert({ name: newUser.name, email: newUser.email, profile_id: data.user.id }); }
      }
    }
    await refreshUsers();
    if (data.user) { return { user: { id: data.user.id, name: newUser.name, username: newUser.username, email: newUser.email, role: newUser.role, level: newUser.level, permissions: newUser.permissions }, error: null }; }
    return { user: null, error: null };
  };

  const updateUser = async (id: string, data: Partial<User>) => {
    const { error } = await supabase.from('profiles').update({ name: data.name, email: data.email, level: data.level, role: data.role, permissions: data.permissions }).eq('id', id);
    if (error) return { error: error.message };
    await refreshUsers();
    if (user?.id === id) setUser(prev => prev ? { ...prev, ...data } : null);
    return {};
  };

  const updateAccount = async (data: { name?: string; email?: string; password?: string }) => {
    if (!user) return { error: "Usuário não autenticado" };
    if (data.email && data.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      const { error: emailError } = await supabase.rpc('update_my_email_bypass', { new_email: data.email.trim().toLowerCase() });
      if (emailError) return { error: emailError.message };
    }
    if (data.password) {
      const { error: authError } = await supabase.auth.updateUser({ password: data.password });
      if (authError) return { error: authError.message };
    }
    if (data.name !== undefined && data.name !== null && String(data.name).trim()) {
      const { error: nameError } = await supabase.rpc('update_my_profile_name', { p_name: String(data.name).trim() });
      if (nameError) return { error: nameError.message };
    }
    await refreshUsers();
    await refreshProfile();
    setUser(prev => prev ? { ...prev, name: data.name ? data.name.trim() : prev.name, email: data.email ? data.email.trim().toLowerCase() : prev.email } : null);
    return {};
  };

  const deleteUser = async (id: string) => {
    try {
      const { error: rpcError } = await supabase.rpc('delete_user_completely', { target_user_id: id });
      
      if (rpcError) {
        console.error("Erro ao excluir usuário (RPC):", rpcError);
        return { success: false, error: rpcError.message || "Erro ao excluir usuário." };
      }

      await refreshUsers();
      return { success: true };
    } catch (error: any) {
      console.error("Erro ao excluir usuário:", error);
      return { success: false, error: error.message || "Erro ao excluir usuário." };
    }
  };

  const resetPassword = async (email: string) => {
    await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' });
  };

  const switchTenant = (tenantId: string) => {
    const tenant = availableTenants.find(t => t.id === tenantId);
    if (tenant) setCurrentTenant(tenant);
  };

  return (
    <AuthContext.Provider value={{ 
      user, users, login, logout, register, updateUser, updateAccount, deleteUser, resetPassword, 
      isAuthenticated: !!user, isLoading, profileError, getDefaultPermissions, refreshUsers, refreshProfile,
      currentTenant, availableTenants, switchTenant
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
