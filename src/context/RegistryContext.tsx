import React, { createContext, useContext, useState, ReactNode, useEffect } from 'react';
import { Veterinarian, Clinic } from '../types';
import { supabase } from '../lib/supabase';

interface RegistryContextType {
  veterinarians: Veterinarian[];
  clinics: Clinic[];
  addVeterinarian: (vet: Omit<Veterinarian, 'id'>, profileId?: string | null) => Promise<{ success: boolean; error?: string }>;
  updateVeterinarian: (id: string, data: Partial<Veterinarian>) => Promise<void>;
  deleteVeterinarian: (id: string) => Promise<void>;
  addClinic: (clinic: Omit<Clinic, 'id'>, profileId?: string | null) => Promise<{ success: boolean; error?: string }>;
  updateClinic: (id: string, data: Partial<Clinic>) => Promise<void>;
  deleteClinic: (id: string) => Promise<void>;
  linkPartnerByEmail: (email: string, myId: string, myType: 'vet' | 'clinic') => Promise<{ success: boolean; message?: string; name?: string }>;
  findPartnerByEmail: (email: string) => Promise<{ found: boolean; name?: string; role?: string; id?: string }>; // Nova função
  unlinkPartner: (partnerId: string, myId: string) => Promise<{ success: boolean; message?: string }>; // Nova função para desvincular
  resetRegistry: () => void;
  refreshRegistry: () => Promise<void>;
}

const RegistryContext = createContext<RegistryContextType | undefined>(undefined);

export const RegistryProvider = ({ children }: { children: ReactNode }) => {
  const [veterinarians, setVeterinarians] = useState<Veterinarian[]>([]);
  const [clinics, setClinics] = useState<Clinic[]>([]);

  const fetchData = async () => {
    const { data: vets } = await supabase.from('veterinarians').select('*');
    if (vets) {
      setVeterinarians(vets.map(v => ({
        id: v.id,
        name: v.name,
        crmv: v.crmv,
        document: v.crmv,
        address: v.address,
        phone: v.phone,
        email: v.email,
        logoUrl: v.logo_url,
        isDefault: v.is_default,
        linkedClinicIds: v.linked_clinic_ids || [],
        profileId: v.profile_id
      })));
    }

    const { data: clis } = await supabase.from('clinics').select('*');
    if (clis) {
      setClinics(clis.map(c => ({
        id: c.id,
        name: c.name,
        document: c.document,
        address: c.address,
        phone: c.phone,
        email: c.email,
        logoUrl: c.logo_url,
        isDefault: c.is_default,
        profileId: c.profile_id,
        responsibleName: c.responsible_name
      })));
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const addVeterinarian = async (vet: Omit<Veterinarian, 'id'>, profileId?: string | null) => {
    try {
      const { data, error } = await supabase.from('veterinarians').insert({
        name: vet.name,
        crmv: vet.crmv,
        document: vet.crmv,
        address: vet.address,
        phone: vet.phone,
        email: vet.email,
        logo_url: vet.logoUrl,
        linked_clinic_ids: vet.linkedClinicIds,
        profile_id: profileId
      }).select().single();

      if (error) {
        console.error("Erro ao adicionar veterinário:", error);
        return { success: false, error: error.message };
      }

      if (data) {
        setVeterinarians(prev => [...prev, { ...vet, id: data.id, profileId: profileId }]);
        return { success: true };
      }
      return { success: false, error: "Erro desconhecido" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const updateVeterinarian = async (id: string, data: Partial<Veterinarian>) => {
    const updatePayload: any = {
      name: data.name,
      crmv: data.crmv,
      address: data.address,
      phone: data.phone,
      email: data.email,
      logo_url: data.logoUrl,
      linked_clinic_ids: data.linkedClinicIds
    };
    if (data.profileId !== undefined) {
      updatePayload.profile_id = data.profileId;
    }

    const { error } = await supabase.from('veterinarians').update(updatePayload).eq('id', id);

    if (!error) {
      setVeterinarians(prev => prev.map(v => v.id === id ? { ...v, ...data } : v));
    }
  };

  const deleteVeterinarian = async (id: string) => {
    await supabase.from('veterinarians').delete().eq('id', id);
    setVeterinarians(prev => prev.filter(v => v.id !== id));
  };

  const addClinic = async (clinic: Omit<Clinic, 'id'>, profileId?: string | null) => {
    try {
      const { data, error } = await supabase.from('clinics').insert({
        name: clinic.name,
        document: clinic.document,
        address: clinic.address,
        phone: clinic.phone,
        email: clinic.email,
        logo_url: clinic.logoUrl,
        profile_id: profileId,
        responsible_name: clinic.responsibleName
      }).select().single();

      if (error) {
        console.error("Erro ao adicionar clínica:", error);
        return { success: false, error: error.message };
      }

      if (data) {
        setClinics(prev => [...prev, { ...clinic, id: data.id, profileId: profileId }]);
        return { success: true };
      }
      return { success: false, error: "Erro desconhecido" };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const updateClinic = async (id: string, data: Partial<Clinic>) => {
    const updatePayload: any = {
      name: data.name,
      address: data.address,
      phone: data.phone,
      email: data.email,
      logo_url: data.logoUrl,
      responsible_name: data.responsibleName
    };
    if (data.profileId !== undefined) {
      updatePayload.profile_id = data.profileId;
    }

    const { error } = await supabase.from('clinics').update(updatePayload).eq('id', id);

    if (!error) {
      setClinics(prev => prev.map(c => c.id === id ? { ...c, ...data } : c));
    }
  };

  const deleteClinic = async (id: string) => {
    await supabase.from('clinics').delete().eq('id', id);
    setClinics(prev => prev.filter(c => c.id !== id));
  };

  const linkPartnerByEmail = async (email: string, myId: string, myType: 'vet' | 'clinic') => {
    try {
      const { data, error } = await supabase.rpc('link_partner_by_email', {
        target_email: email,
        requester_id: myId,
        requester_type: myType
      });

      if (error) throw error;

      if (data.success) {
        await fetchData(); 
        return { success: true, name: data.name };
      } else {
        return { success: false, message: data.message };
      }
    } catch (err: any) {
      console.error("Erro ao vincular parceiro:", err);
      return { success: false, message: err.message || 'Erro ao conectar com o servidor.' };
    }
  };

  // Nova função para pesquisar parceiro antes de adicionar
  const findPartnerByEmail = async (email: string) => {
    try {
      const cleanEmail = email.trim().toLowerCase();
      
      // Tenta buscar na tabela de perfis (se RLS permitir ou se for público)
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, name, role')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (profile) {
        return { found: true, name: profile.name, role: profile.role, id: profile.id };
      }

      // Se não achar em profiles (talvez ainda não tenha login, mas tenha cadastro em vets/clinics)
      const { data: vet } = await supabase
        .from('veterinarians')
        .select('id, name')
        .eq('email', cleanEmail)
        .maybeSingle();
      
      if (vet) {
        return { found: true, name: vet.name, role: 'vet' };
      }

      const { data: clinic } = await supabase
        .from('clinics')
        .select('id, name')
        .eq('email', cleanEmail)
        .maybeSingle();

      if (clinic) {
        return { found: true, name: clinic.name, role: 'clinic' };
      }

      return { found: false };
    } catch (err) {
      console.error("Erro ao buscar parceiro:", err);
      return { found: false };
    }
  };

  const resetRegistry = () => {
    window.location.reload();
  };

  const refreshRegistry = async () => {
    await fetchData();
  };

  const unlinkPartner = async (partnerId: string, myId: string) => {
    try {
      // Busca o perfil atual para pegar o array de parceiros
      const { data: myProfile, error: profileError } = await supabase
        .from('profiles')
        .select('partners')
        .eq('id', myId)
        .maybeSingle();

      if (profileError) {
        console.error("Erro ao buscar perfil:", profileError);
        return { success: false, message: "Erro ao buscar perfil do usuário." };
      }

      if (!myProfile) {
        return { success: false, message: "Perfil não encontrado." };
      }

      const currentPartners = myProfile.partners || [];
      
      // Remove o parceiro do array
      const updatedPartners = currentPartners.filter((id: string) => id !== partnerId);

      // Atualiza o perfil
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ partners: updatedPartners })
        .eq('id', myId);

      if (updateError) {
        console.error("Erro ao desvincular parceiro:", updateError);
        return { success: false, message: "Erro ao desvincular parceiro." };
      }

      // Também remove o vínculo reverso (remove o meu ID do array de parceiros do outro)
      const { data: partnerProfile } = await supabase
        .from('profiles')
        .select('partners')
        .eq('id', partnerId)
        .maybeSingle();

      if (partnerProfile && partnerProfile.partners) {
        const partnerPartners = partnerProfile.partners || [];
        const updatedPartnerPartners = partnerPartners.filter((id: string) => id !== myId);
        
        await supabase
          .from('profiles')
          .update({ partners: updatedPartnerPartners })
          .eq('id', partnerId);
      }

      await fetchData();
      return { success: true, message: "Parceiro desvinculado com sucesso." };
    } catch (err: any) {
      console.error("Erro ao desvincular parceiro:", err);
      return { success: false, message: err.message || 'Erro ao conectar com o servidor.' };
    }
  };

  return (
    <RegistryContext.Provider value={{
      veterinarians,
      clinics,
      addVeterinarian,
      updateVeterinarian,
      deleteVeterinarian,
      addClinic,
      updateClinic,
      deleteClinic,
      linkPartnerByEmail,
      findPartnerByEmail,
      unlinkPartner,
      resetRegistry,
      refreshRegistry
    }}>
      {children}
    </RegistryContext.Provider>
  );
};

export const useRegistry = () => {
  const context = useContext(RegistryContext);
  if (!context) throw new Error('useRegistry must be used within a RegistryProvider');
  return context;
};
