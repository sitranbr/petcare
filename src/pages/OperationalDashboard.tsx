import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { useRegistry } from '../context/RegistryContext';
import { Exam, Modality, Period, MachineOwner, PriceRule, ExamItem, BrandingInfo } from '../types';
import { calculateExamValues, formatMoney, getModalityLabel, getPeriodLabel } from '../utils/calculations';
import { generatePDFReport, generateExamReport } from '../utils/reportGenerator';
import { SummaryCard } from '../components/SummaryCard';
import { Modal } from '../components/Modal';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { ExamReportEditor } from '../components/ExamReportEditor';
import { 
  DollarSign, UserCheck, Building2, CreditCard, PlusCircle, List, BarChart3, Tag, Trash2, Search, Filter, Plus, Edit2, FileText, Calendar, X, Printer, Stethoscope, CheckCircle2, Eye, Save, ChevronDown, ChevronUp, AlertCircle, Loader2, Link as LinkIcon, Users, PenTool, Copy
} from 'lucide-react';
import { clsx } from 'clsx';
import { startOfMonth, endOfMonth, format, parseISO } from 'date-fns';
import { supabase } from '../lib/supabase';
import ReactECharts from 'echarts-for-react';

const getTodayString = () => new Date().toISOString().split('T')[0];
const SPECIES_OPTIONS = ['Cachorro', 'Gato', 'Outros'];

const TABS = [
  { id: 'list', label: 'Lista de Exames', icon: List },
  { id: 'form', label: 'Novo Exame', icon: PlusCircle },
  { id: 'reports', label: 'Relatórios', icon: BarChart3 },
  { id: 'prices', label: 'Tabela de Preços', icon: Tag },
];

export const OperationalDashboard = () => {
  const { user, currentTenant } = useAuth(); 
  const { settings } = useSettings();
  const { veterinarians, clinics } = useRegistry();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'form' | 'list' | 'reports' | 'prices'>('list');
  const [exams, setExams] = useState<Exam[]>([]);
  const [priceRules, setPriceRules] = useState<PriceRule[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);
  
  const [showFinancialStats, setShowFinancialStats] = useState(true);

  const [reportStartDate, setReportStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [reportEndDate, setReportEndDate] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const [reportEditorState, setReportEditorState] = useState<{ isOpen: boolean; exam: Exam | null; studyId?: string; }>({ isOpen: false, exam: null });
  const [confirmationState, setConfirmationState] = useState<{ isOpen: boolean; type: 'exam' | 'price' | 'report' | null; id: string | null; title: string; message: string; requirePassword?: boolean; errorMessage?: string; }>({ isOpen: false, type: null, id: null, title: '', message: '', requirePassword: false, errorMessage: '' });
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [editingPrice, setEditingPrice] = useState<PriceRule | null>(null);
  
  const [loggedUserEntity, setLoggedUserEntity] = useState<{ type: 'vet' | 'clinic', id: string } | null>(null);
  
  const [editingExamId, setEditingExamId] = useState<string | null>(null);
  const [isSavingExam, setIsSavingExam] = useState(false);
  const [formData, setFormData] = useState({ 
    date: getTodayString(), 
    petName: '', 
    species: 'Cachorro', 
    customSpecies: '',
    requesterVet: '',
    requesterCrmv: '',
    period: 'comercial' as Period, 
    machineOwner: 'professional' as MachineOwner, 
    veterinarianId: '', 
    clinicId: '', 
    items: [{ id: '1', modality: '' as Modality | '', studies: 1, studyDescription: '', rxStudies: [] }] as ExamItem[] 
  });

  const [priceForm, setPriceForm] = useState<Partial<PriceRule>>({ clinicId: '', modality: 'USG', period: 'comercial', valor: 0, repasseProfessional: 0, repasseClinic: 0, taxaExtra: 0, taxaExtraProfessional: 0, taxaExtraClinic: 0, observacoes: '' });
  const [customModalityName, setCustomModalityName] = useState('');
  const [selectedClinicFilter, setSelectedClinicFilter] = useState<string>(''); // Filtro de clínica na listagem
  const [copyFromClinicId, setCopyFromClinicId] = useState<string>(''); // Clínica doadora (de onde copiar)
  const [copyToClinicId, setCopyToClinicId] = useState<string>(''); // Clínica receptora (para onde copiar)

  // ESTADO LOCAL PARA PARCEIROS (Independente de permissões de admin)
  const [linkedPartners, setLinkedPartners] = useState<any[]>([]);
  const [extraClinics, setExtraClinics] = useState<any[]>([]); // Clínicas buscadas manualmente para garantir disponibilidade
  const [guestClinics, setGuestClinics] = useState<any[]>([]); // Clínicas convidadas (criadas pelo veterinário)
  const [guestVetProfileIds, setGuestVetProfileIds] = useState<string[]>([]); // Vets convidados (owner_id = user.id)
  const [ownerClinic, setOwnerClinic] = useState<any>(null); // Clínica que convidou o Vet Convidado (profile_id = ownerId)

  // Busca parceiros diretamente do banco de dados para garantir que o dropdown funcione
  useEffect(() => {
    let isMounted = true;
    const fetchPartners = async () => {
        if (!user) {
        if (isMounted) {
          setLinkedPartners([]);
          setExtraClinics([]);
          setGuestClinics([]);
          setGuestVetProfileIds([]);
          setOwnerClinic(null);
        }
        return;
      }
      
      try {
        // Equipe interna (recepção): usa perfil do assinante (ownerId) para parceiros - membro NÃO é parceiro
        const isTeamMember = (user.role === 'reception' || user.level === 5) && user.ownerId;
        const profileIdForPartners = isTeamMember ? user.ownerId : user.id;
        console.log('🔄 Iniciando busca de parceiros para o usuário:', user.id, isTeamMember ? '(equipe interna, usando assinante)' : '');
        
        // 1. Pega a lista de IDs de parceiros do perfil (do assinante quando for recepção)
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('partners')
          .eq('id', profileIdForPartners)
          .maybeSingle();
        
        if (profileError) {
          console.error("❌ Erro ao buscar perfil:", profileError);
          if (isMounted) {
            setLinkedPartners([]);
            setExtraClinics([]);
            setGuestClinics([]);
            setGuestVetProfileIds([]);
            setOwnerClinic(null);
          }
          return;
        }
        
        if (!profile) {
          console.log('ℹ️ Perfil não encontrado para o usuário');
          if (isMounted) {
            setLinkedPartners([]);
            setExtraClinics([]);
            setGuestClinics([]);
            setGuestVetProfileIds([]);
            setOwnerClinic(null);
          }
          return;
        }
        
        // Busca clínicas convidadas (criadas pelo assinante)
        // Equipe interna: usa ownerId (assinante); Vet/Clínica: usa user.id
        const targetOwnerId = isTeamMember ? user.ownerId : user.id;
        const isGuest = user.ownerId && user.ownerId !== user.id;
        
        console.log('🔍 Buscando clínicas convidadas:', {
          userId: user.id,
          ownerId: user.ownerId,
          targetOwnerId,
          isGuest,
          role: user.role
        });
        
        // Busca clínicas criadas pelo usuário atual
        // IMPORTANTE: Busca na tabela 'users' onde ownerId = user.id (clínicas criadas por este usuário)
        console.log('🔍 Buscando clínicas convidadas na tabela users:', {
          targetOwnerId,
          userId: user.id,
          role: user.role
        });
        
        const { data: guestProfiles, error: guestProfilesError } = await supabase
          .from('profiles')
          .select('id, name, email, role, owner_id')
          .eq('owner_id', targetOwnerId)
          .eq('role', 'clinic');
        
        if (guestProfilesError) {
          console.error('❌ Erro ao buscar clínicas convidadas na tabela profiles:', guestProfilesError);
        }
        
        if (guestProfiles && guestProfiles.length > 0) {
          console.log('🏥 Clínicas convidadas encontradas na tabela profiles:', guestProfiles.map(p => ({ id: p.id, name: p.name, owner_id: p.owner_id, email: p.email })));
          const guestClinicProfileIds = guestProfiles.map(p => p.id);
          
          // Busca as clínicas correspondentes na tabela 'clinics' usando profile_id
          const { data: guestClinicsData, error: guestClinicsError } = await supabase
            .from('clinics')
            .select('*')
            .in('profile_id', guestClinicProfileIds);
          
          if (guestClinicsError) {
            console.error('❌ Erro ao buscar dados das clínicas convidadas na tabela clinics:', guestClinicsError);
          }
          
          if (isMounted && guestClinicsData) {
            console.log('✅ Clínicas convidadas carregadas da tabela clinics:', guestClinicsData.map(c => ({ id: c.id, name: c.name, profileId: c.profile_id, email: c.email })));
            setGuestClinics(guestClinicsData.map(c => ({
              id: c.id,
              name: c.name,
              document: c.document,
              address: c.address,
              phone: c.phone,
              email: c.email,
              logoUrl: c.logo_url,
              profileId: c.profile_id
            })));
          } else if (isMounted) {
            console.warn('⚠️ Clínicas convidadas encontradas em profiles mas não em clinics:', {
              guestProfiles: guestProfiles.map(p => ({ id: p.id, name: p.name, email: p.email })),
              guestClinicProfileIds,
              guestClinicsDataCount: guestClinicsData?.length || 0
            });
            setGuestClinics([]);
          }
        } else {
          if (isMounted) {
            console.log('ℹ️ Nenhuma clínica convidada encontrada na tabela profiles para owner_id:', targetOwnerId);
            setGuestClinics([]);
          }
        }

        // Busca veterinários convidados (owner_id = user.id, role = vet) - para dropdown de exames
        const { data: guestVetProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('owner_id', targetOwnerId)
          .eq('role', 'vet');
        if (isMounted && guestVetProfiles && guestVetProfiles.length > 0) {
          setGuestVetProfileIds(guestVetProfiles.map(p => p.id));
        } else if (isMounted) {
          setGuestVetProfileIds([]);
        }

        // Vet Convidado: busca a clínica que o convidou (ownerId = profile_id da clínica)
        // Corrige "Nenhuma clínica vinculada" quando vet foi adicionado via "Adicionar Membro" (sem link_partner)
        if (isMounted && isGuest && user.role === 'vet' && user.ownerId) {
          const { data: ownerClinicData, error: ownerClinicError } = await supabase
            .from('clinics')
            .select('*')
            .eq('profile_id', user.ownerId)
            .maybeSingle();
          if (!ownerClinicError && ownerClinicData) {
            setOwnerClinic({
              id: ownerClinicData.id,
              name: ownerClinicData.name,
              document: ownerClinicData.document,
              address: ownerClinicData.address,
              phone: ownerClinicData.phone,
              email: ownerClinicData.email,
              logoUrl: ownerClinicData.logo_url,
              profileId: ownerClinicData.profile_id
            });
            console.log('🏥 Clínica do convite (ownerId) carregada para Vet Convidado:', ownerClinicData.name);
          } else {
            setOwnerClinic(null);
          }
        } else if (isMounted) {
          setOwnerClinic(null);
        }
        
        if (profile?.partners && Array.isArray(profile.partners) && profile.partners.length > 0) {
          console.log('🔗 Parceiros encontrados no perfil:', profile.partners);
          
          // 2. Busca os dados completos desses parceiros
          const { data: partners, error: partnersError } = await supabase
            .from('profiles')
            .select('*')
            .in('id', profile.partners);
            
          if (partnersError) {
            console.error("Erro ao buscar dados dos parceiros:", partnersError);
            return;
          }
          
          if (isMounted && partners) {
            console.log('👥 Dados dos parceiros carregados:', partners.map(p => ({ id: p.id, name: p.name, role: p.role })));
            setLinkedPartners(partners);

            // 3. Busca as clínicas correspondentes na tabela 'clinics' (caso não estejam no contexto)
            // Isso corrige o problema de clínicas parceiras não aparecerem no dropdown devido a delay ou RLS
            const clinicPartners = partners.filter(p => p.role === 'clinic');
            const clinicProfileIds = clinicPartners.map(p => p.id);
            console.log('🏥 Profile IDs de clínicas parceiras:', clinicProfileIds);
            console.log('🏥 Dados dos parceiros clínicas:', clinicPartners.map(p => ({ id: p.id, name: p.name, email: p.email })));
            
            if (clinicProfileIds.length > 0) {
               console.log('🔍 Buscando clínicas com profile_ids:', clinicProfileIds);
               
               // Tenta buscar por profile_id primeiro
               const { data: foundClinics, error: clinicsError } = await supabase
                 .from('clinics')
                 .select('*')
                 .in('profile_id', clinicProfileIds);
               
               if (clinicsError) {
                 console.error("❌ Erro ao buscar clínicas parceiras por profile_id:", clinicsError);
                 
                 // Fallback: tenta buscar por email se a busca por profile_id falhar
                 const clinicEmails = clinicPartners.map(p => p.email).filter(Boolean);
                 if (clinicEmails.length > 0) {
                   console.log('🔄 Tentando buscar clínicas por email como fallback:', clinicEmails);
                   const { data: foundByEmail, error: emailError } = await supabase
                     .from('clinics')
                     .select('*')
                     .in('email', clinicEmails);
                   
                   if (emailError) {
                     console.error("❌ Erro ao buscar clínicas por email:", emailError);
                   } else if (isMounted && foundByEmail) {
                     console.log('✅ Clínicas encontradas por email (fallback):', foundByEmail.map(c => ({ id: c.id, name: c.name, profileId: c.profile_id, email: c.email })));
                     setExtraClinics(prev => {
                       // Merge com clínicas existentes, evitando duplicatas
                       const merged = [...prev];
                       foundByEmail.forEach(c => {
                         if (!merged.some(existing => existing.id === c.id)) {
                           merged.push({
                             id: c.id,
                             name: c.name,
                             document: c.document,
                             address: c.address,
                             phone: c.phone,
                             email: c.email,
                             logoUrl: c.logo_url,
                             profileId: c.profile_id
                           });
                         }
                       });
                       return merged;
                     });
                   }
                 }
               } else if (isMounted && foundClinics) {
                 console.log('✅ Clínicas parceiras encontradas por profile_id:', foundClinics.map(c => ({ id: c.id, name: c.name, profileId: c.profile_id })));
                 
                 // Verifica se todas as clínicas parceiras foram encontradas
                 if (foundClinics.length < clinicProfileIds.length) {
                   console.warn('⚠️ Nem todas as clínicas parceiras foram encontradas:', {
                     esperadas: clinicProfileIds.length,
                     encontradas: foundClinics.length,
                     encontradasIds: foundClinics.map(c => c.profile_id),
                     esperadasIds: clinicProfileIds
                   });
                   
                   // Tenta buscar as que faltaram por email
                   const foundIds = foundClinics.map(c => c.profile_id);
                   const missingPartners = clinicPartners.filter(p => !foundIds.includes(p.id));
                   if (missingPartners.length > 0) {
                     const missingEmails = missingPartners.map(p => p.email).filter(Boolean);
                     if (missingEmails.length > 0) {
                       console.log('🔄 Buscando clínicas faltantes por email:', missingEmails);
                       const { data: foundMissing, error: missingError } = await supabase
                         .from('clinics')
                         .select('*')
                         .in('email', missingEmails);
                       
                       if (!missingError && foundMissing) {
                         console.log('✅ Clínicas faltantes encontradas por email:', foundMissing.map(c => ({ id: c.id, name: c.name })));
                         foundClinics.push(...foundMissing);
                       }
                     }
                   }
                 }
                 
                 // Atualiza extraClinics, fazendo merge com existentes
                 setExtraClinics(prev => {
                   const merged = [...prev];
                   foundClinics.forEach(c => {
                     if (!merged.some(existing => existing.id === c.id)) {
                       merged.push({
                         id: c.id,
                         name: c.name,
                         document: c.document,
                         address: c.address,
                         phone: c.phone,
                         email: c.email,
                         logoUrl: c.logo_url,
                         profileId: c.profile_id
                       });
                     }
                   });
                   return merged;
                 });
               } else if (isMounted) {
                 console.warn('⚠️ Nenhuma clínica encontrada por profile_id, mas há parceiros clínicas. Tentando por email...', clinicProfileIds);
                 
                 // Última tentativa: busca por email
                 const clinicEmails = clinicPartners.map(p => p.email).filter(Boolean);
                 if (clinicEmails.length > 0) {
                   const { data: foundByEmail, error: emailError } = await supabase
                     .from('clinics')
                     .select('*')
                     .in('email', clinicEmails);
                   
                   if (!emailError && foundByEmail && foundByEmail.length > 0) {
                     console.log('✅ Clínicas encontradas por email (última tentativa):', foundByEmail.map(c => ({ id: c.id, name: c.name })));
                     setExtraClinics(foundByEmail.map(c => ({
                        id: c.id,
                        name: c.name,
                        document: c.document,
                        address: c.address,
                        phone: c.phone,
                        email: c.email,
                        logoUrl: c.logo_url,
                        profileId: c.profile_id
                     })));
                   }
                 }
               }
            } else {
              console.log('ℹ️ Nenhuma clínica encontrada nos parceiros (todos são vets ou outros tipos)');
            }
          }
        } else {
          console.log('ℹ️ Nenhum parceiro encontrado no perfil do usuário');
          if (isMounted) {
             setLinkedPartners([]);
             setExtraClinics([]);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar parceiros para o dashboard:", err);
      }
    };
    fetchPartners();
    return () => { isMounted = false; };
  }, [user]);
  
  // Força atualização do RegistryContext quando parceiros são carregados
  useEffect(() => {
    if (linkedPartners.length > 0 || extraClinics.length > 0) {
      // Pequeno delay para garantir que o contexto seja atualizado
      const timer = setTimeout(() => {
        console.log('🔄 Parceiros carregados, contexto deve ser atualizado');
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [linkedPartners, extraClinics]);

  useEffect(() => {
    if (activeTab === 'list') {
      setShowFinancialStats(true);
      if (activeTab !== 'form') {
        setEditingExamId(null);
        resetForm();
      }
    } else {
      setShowFinancialStats(false);
    }
  }, [activeTab]);

  useEffect(() => {
    if (user) {
      const vetByProfile = veterinarians.find(v => v.profileId === user.id);
      if (vetByProfile) {
        setLoggedUserEntity({ type: 'vet', id: vetByProfile.id });
        setFormData(prev => ({ ...prev, veterinarianId: vetByProfile.id }));
        return;
      }

      const clinicByProfile = clinics.find(c => c.profileId === user.id);
      if (clinicByProfile) {
        setLoggedUserEntity({ type: 'clinic', id: clinicByProfile.id });
        setFormData(prev => ({ ...prev, clinicId: clinicByProfile.id }));
        return;
      }

      const userEmail = user.email.toLowerCase().trim();
      
      const vetByEmail = veterinarians.find(v => v.email?.toLowerCase().trim() === userEmail);
      if (vetByEmail) { 
        setLoggedUserEntity({ type: 'vet', id: vetByEmail.id }); 
        setFormData(prev => ({ ...prev, veterinarianId: vetByEmail.id })); 
        return; 
      }
      
      const clinicByEmail = clinics.find(c => c.email?.toLowerCase().trim() === userEmail);
      if (clinicByEmail) { 
        setLoggedUserEntity({ type: 'clinic', id: clinicByEmail.id }); 
        setFormData(prev => ({ ...prev, clinicId: clinicByEmail.id })); 
      }
    }
  }, [user, veterinarians, clinics]);

  const isPartnerView = useMemo(() => {
    return currentTenant && !currentTenant.isMe;
  }, [currentTenant]);

  // CORRIGIDO: Usa linkedPartners + compatibilidade profile_id + dono como vet
  const availableVeterinarians = useMemo(() => {
    if (currentTenant?.type === 'vet') {
      return veterinarians.filter(v => v.id === currentTenant.id);
    }
    if (currentTenant?.type === 'clinic') {
      const clinicId = currentTenant.id;
      const profileId = user?.id;

      // 1. Legacy: vets com linked_clinic_ids contendo clinic_id OU profile_id
      // (link_partner_by_email grava requester_id=profile_id quando clínica vincula)
      const legacyMatches = veterinarians.filter(v => {
        const ids = v.linkedClinicIds || [];
        return ids.includes(clinicId) || (!!profileId && ids.includes(profileId));
      });

      // 2. Parceiros em profile.partners
      const linkedVetProfileIds = linkedPartners
        .filter(u => u.role === 'vet')
        .map(u => u.id);
      const newMatches = veterinarians.filter(v => v.profileId && linkedVetProfileIds.includes(v.profileId));

      // 3. Dono da clínica como veterinário (profile_id da clínica = user.id)
      const currentClinic = clinics.find(c => c.id === clinicId);
      const ownerAsVet = profileId && currentClinic?.profileId === profileId
        ? veterinarians.filter(v => v.profileId === profileId)
        : [];

      // 4. Veterinários convidados (owner_id = user.id, criados pela clínica)
      const guestVetMatches = veterinarians.filter(v =>
        v.profileId && guestVetProfileIds.includes(v.profileId)
      );

      // Merge sem duplicatas
      const combined = [...legacyMatches, ...newMatches, ...ownerAsVet, ...guestVetMatches];
      return Array.from(new Map(combined.map(item => [item.id, item])).values());
    }
    return [];
  }, [veterinarians, currentTenant, linkedPartners, user?.id, clinics, guestVetProfileIds]);

  // CORRIGIDO: Usa linkedPartners E extraClinics para encontrar Clínicas parceiras do Vet
  const availableClinicsForVet = useMemo(() => {
    // Verifica se o usuário é um convidado
    const isGuest = user?.ownerId && user.ownerId !== user.id;
    
    if (isGuest) {
      console.log('🎨 CONVIDADO DETECTADO em availableClinicsForVet:', {
        userId: user.id,
        ownerId: user.ownerId,
        loggedUserEntityType: loggedUserEntity?.type,
        loggedUserEntityId: loggedUserEntity?.id,
        guestClinicsCount: guestClinics.length,
        guestClinics: guestClinics.map(gc => ({ id: gc.id, name: gc.name }))
      });
    }
    
    // Se for clínica convidada, mostra apenas a própria clínica
    if (isGuest && loggedUserEntity?.type === 'clinic') {
      const ownClinic = clinics.find(c => c.id === loggedUserEntity.id);
      if (ownClinic) {
        console.log('🏥 Clínica convidada - retornando apenas própria clínica:', ownClinic.name);
        return [ownClinic];
      }
      console.warn('⚠️ Clínica convidada não encontrada no contexto');
      return [];
    }
    
    // Verifica se é veterinário pelo loggedUserEntity, currentTenant OU role do usuário
    // Importante: user.role === 'vet' garante que Vet Convidado (ex: Maricota) veja clínicas mesmo com currentTenant = clínica
    const isVet = loggedUserEntity?.type === 'vet' || currentTenant?.type === 'vet' || user?.role === 'vet';
    
    if (!isVet) {
      return clinics;
    }
    
    const vetId = loggedUserEntity?.type === 'vet' ? loggedUserEntity.id : currentTenant?.id;
    if (!vetId) {
      console.warn('⚠️ Vet ID não encontrado para buscar clínicas parceiras');
      return [];
    }
    
    // Se for veterinário convidado, inclui guestClinics (que criou) + extraClinics (link_partner) + ownerClinic (clínica que o convidou)
    // ownerClinic corrige: Vet adicionado via "Adicionar Membro" tem ownerId mas pode não ter profile.partners
    if (isGuest && (loggedUserEntity?.type === 'vet' || user?.role === 'vet')) {
      const merged = [...guestClinics];
      if (ownerClinic && !merged.some(m => m.id === ownerClinic.id)) {
        merged.push(ownerClinic);
      }
      extraClinics.forEach(ec => {
        if (!merged.some(m => m.id === ec.id)) merged.push(ec);
      });
      const linkedClinicProfileIds = linkedPartners.filter(u => u.role === 'clinic').map(u => u.id);
      const allForMerge = [...clinics, ...extraClinics, ...guestClinics];
      const uniqueForMerge = Array.from(new Map(allForMerge.map(c => [c.id, c])).values());
      uniqueForMerge.filter(c => c.profileId && linkedClinicProfileIds.includes(c.profileId)).forEach(c => {
        if (!merged.some(m => m.id === c.id)) merged.push(c);
      });
      console.log('👨‍⚕️ Veterinário convidado - clínicas (owner + próprias + parceiras):', merged.map(c => ({ id: c.id, name: c.name })));
      return merged;
    }
    
    const currentVet = veterinarians.find(v => v.id === vetId);
    const legacyIds = currentVet?.linkedClinicIds || [];

    // IDs dos perfis de clínicas parceiras
    const linkedClinicProfileIds = linkedPartners
      .filter(u => u.role === 'clinic')
      .map(u => u.id);

    // Merge TODAS as clínicas (context + extra + convidadas), removendo duplicatas por ID
    const allClinics = [...clinics, ...extraClinics, ...guestClinics];
    const uniqueClinics = Array.from(new Map(allClinics.map(c => [c.id, c])).values());

      // Filtra clínicas que são parceiras:
      // PRIORIDADE 1: Clínicas convidadas (guestClinics - criadas pelo veterinário) - DEVE SEMPRE APARECER
      // 2. Clínicas no array legacy (linkedClinicIds do vet)
      // 3. Clínicas cujo profile_id está na lista de parceiros
      // 4. Clínicas que estão em extraClinics (já foram validadas como parceiras)
      // 5. Clínicas do contexto que têm profile_id correspondente a um parceiro
      const filtered = uniqueClinics.filter(c => {
        // PRIORIDADE 1: Se está em guestClinics, significa que foi criada pelo veterinário (clínica convidada)
        // Isso deve ter prioridade máxima para garantir que clínicas criadas pelo vet apareçam
        if (guestClinics.some(gc => gc.id === c.id)) {
          console.log('✅ Clínica convidada incluída no filtro:', c.name, 'ID:', c.id);
          return true;
        }
        
        // Verifica se está no array legacy
        if (legacyIds.includes(c.id)) {
          return true;
        }
        
        // Verifica se o profile_id está na lista de parceiros
        if (c.profileId && linkedClinicProfileIds.includes(c.profileId)) {
          return true;
        }
        
        // Se está em extraClinics, significa que foi encontrada como parceira
        if (extraClinics.some(ec => ec.id === c.id)) {
          return true;
        }
        
        // Verifica se o profile_id da clínica do contexto corresponde a um parceiro
        // Isso cobre casos onde a clínica já está no RegistryContext mas não foi encontrada na busca extra
        if (c.profileId) {
          const matchingPartner = linkedPartners.find(p => p.id === c.profileId && p.role === 'clinic');
          if (matchingPartner) {
            return true;
          }
        }
        
        return false;
      });
      
      console.log('📋 Clínicas filtradas para veterinário:', {
        vetId,
        vetName: currentVet?.name,
        totalUnique: uniqueClinics.length,
        guestClinicsCount: guestClinics.length,
        guestClinics: guestClinics.map(gc => ({ id: gc.id, name: gc.name, profileId: gc.profileId })),
        linkedPartnersCount: linkedPartners.length,
        linkedPartners: linkedPartners.map(p => ({ id: p.id, name: p.name, role: p.role })),
        filteredCount: filtered.length,
        filtered: filtered.map(c => ({ id: c.id, name: c.name, profileId: c.profileId }))
      });

    // Log detalhado apenas se não encontrou clínicas mas deveria
    if (filtered.length === 0 && (linkedClinicProfileIds.length > 0 || legacyIds.length > 0 || extraClinics.length > 0)) {
      console.warn('⚠️ Nenhuma clínica parceira encontrada, mas há indicadores de parceiros:', {
        vetId,
        legacyIds,
        linkedClinicProfileIds,
        linkedPartners: linkedPartners.map(p => ({ id: p.id, name: p.name, role: p.role })),
        extraClinics: extraClinics.map(c => ({ id: c.id, name: c.name, profileId: c.profileId })),
        allClinics: uniqueClinics.map(c => ({ id: c.id, name: c.name, profileId: c.profileId }))
      });
    }

    return filtered;
  }, [clinics, extraClinics, guestClinics, ownerClinic, loggedUserEntity, currentTenant, veterinarians, linkedPartners, user]);

  // Log quando o modal de preços abrir (movido para depois das declarações)
  useEffect(() => {
    if (isPriceModalOpen && (loggedUserEntity?.type === 'vet' || currentTenant?.type === 'vet')) {
      console.log('📋 Modal de Preços ABERTO - Estado atual:', {
        loggedUserEntityType: loggedUserEntity?.type,
        currentTenantType: currentTenant?.type,
        availableClinicsForVetCount: availableClinicsForVet.length,
        availableClinicsForVet: availableClinicsForVet.map(c => ({ id: c.id, name: c.name, profileId: c.profileId })),
        linkedPartners: linkedPartners.map(p => ({ id: p.id, name: p.name, role: p.role })),
        extraClinics: extraClinics.map(c => ({ id: c.id, name: c.name, profileId: c.profileId })),
        clinics: clinics.map(c => ({ id: c.id, name: c.name, profileId: c.profileId }))
      });
    }
  }, [isPriceModalOpen, loggedUserEntity, currentTenant, availableClinicsForVet, linkedPartners, extraClinics, clinics]);

  const fetchData = async () => {
    if (!currentTenant) return;
    if (isPartnerView && !loggedUserEntity) return;

    setIsLoadingData(true);

    let query = supabase.from('exams').select('*').order('date', { ascending: false });

    if (currentTenant.type === 'vet') {
      const possibleIds = new Set<string>();
      if (currentTenant.id) possibleIds.add(currentTenant.id);
      if (user?.id) possibleIds.add(user.id);
      if (user?.id) {
        veterinarians
          .filter(v => v.profileId === user.id)
          .forEach(v => possibleIds.add(v.id));
      }
      const idsArray = Array.from(possibleIds);
      if (idsArray.length > 0) {
        query = query.in('veterinarian_id', idsArray);
      } else {
        query = query.eq('veterinarian_id', currentTenant.id);
      }
    } else {
      query = query.eq('clinic_id', currentTenant.id);
      if ((isPartnerView || user?.level === 5) && loggedUserEntity?.type === 'vet') {
         const possibleIds = new Set<string>();
         possibleIds.add(loggedUserEntity.id);
         if (user?.id) possibleIds.add(user.id);
         query = query.in('veterinarian_id', Array.from(possibleIds));
      }
    }

    const { data: examsData } = await query;

    if (examsData) {
      setExams(examsData.map(e => ({
        id: e.id, 
        date: e.date, 
        petName: e.pet_name,
        species: e.species, 
        requesterVet: e.requester_vet, 
        requesterCrmv: e.requester_crmv, 
        modality: e.modality, 
        period: e.period, 
        studies: e.studies, 
        studyDescription: e.study_description, 
        rxStudies: e.rx_studies, 
        veterinarianId: e.veterinarian_id, 
        clinicId: e.clinic_id, 
        machineOwner: e.machine_owner, 
        totalValue: e.total_value, 
        repasseProfessional: e.repasse_professional, 
        repasseClinic: e.repasse_clinic, 
        createdAt: e.created_at, 
        reportContent: e.report_content, 
        reportImages: e.report_images, 
        status: e.status
      })));
    }

    // Carrega regras de preço sempre (incluindo em modo parceiro) para que a Prévia Total funcione
    const isGuest = user?.ownerId && user.ownerId !== user.id;
    let priceQuery = supabase.from('price_rules').select('*');
    
    if (isGuest) {
      // Se o usuário é um convidado (tem ownerId), filtra apenas as regras vinculadas a ele
      if (loggedUserEntity?.type === 'clinic') {
        priceQuery = priceQuery.eq('clinic_id', loggedUserEntity.id);
      } else if (loggedUserEntity?.type === 'vet') {
        const guestClinicIds = guestClinics.map(gc => gc.id);
        if (guestClinicIds.length > 0) {
          priceQuery = priceQuery.in('clinic_id', guestClinicIds);
        } else {
          priceQuery = priceQuery.eq('clinic_id', 'nonexistent');
        }
      }
    } else if (isPartnerView && currentTenant?.type === 'clinic') {
      // Em modo parceiro visualizando como clínica: carrega regras da clínica atual para a Prévia Total
      priceQuery = priceQuery.eq('clinic_id', currentTenant.id);
    }
    // Caso contrário: busca todas as regras (comportamento original)
    
    const { data: pricesData } = await priceQuery;
    if (pricesData) {
      setPriceRules(pricesData.map(p => ({
        id: p.id, clinicId: p.clinic_id, modality: p.modality, period: p.period, label: p.label, periodLabel: p.period_label, valor: p.valor, repasseProfessional: p.repasse_professional, repasseClinic: p.repasse_clinic, taxaExtra: p.taxa_extra, taxaExtraProfessional: p.taxa_extra_professional, taxaExtraClinic: p.taxa_extra_clinic, observacoes: p.observacoes
      })));
    } else {
      setPriceRules([]);
    }

    setIsLoadingData(false);
  };

  useEffect(() => {
    fetchData();
  }, [currentTenant, isPartnerView, loggedUserEntity, veterinarians]);

  useEffect(() => {
    if (currentTenant && !editingExamId) {
      if (currentTenant.type === 'vet') {
        setFormData(prev => ({ ...prev, veterinarianId: currentTenant.id }));
      } else {
        setFormData(prev => ({ ...prev, clinicId: currentTenant.id }));
      }
    }
  }, [currentTenant, editingExamId]);

  const [filterPet, setFilterPet] = useState('');
  
  const canViewFinancials = user?.permissions?.view_financials && !isPartnerView;
  const canManagePrices = user?.permissions?.manage_prices && !isPartnerView;
  const canCreateExam = (user?.permissions?.criar_exame || user?.permissions?.edit_reports) && !isPartnerView;
  
  // Regra de Negócio: Laudos são restritos a Veterinários e Admins. Clínicas (PJ) não laudam.
  const canEditReports = user?.role === 'vet' || user?.level === 1;

  const getBrandingForExam = (exam: Exam): BrandingInfo => {
    return { 
      name: settings.name || settings.systemName, 
      logoUrl: settings.logoUrl, 
      address: settings.address, 
      phone: settings.phone, 
      email: settings.email, 
      document: settings.document 
    };
  };

  const getVeterinarianName = (vetId: string) => {
    if (!vetId) return 'N/A';
    const vet = veterinarians.find(v => v.id === vetId || v.profileId === vetId);
    return vet ? vet.name : 'N/A';
  };

  const getClinicName = (clinicId: string) => {
    const clinic = clinics.find(c => c.id === clinicId);
    return clinic ? clinic.name : 'N/A';
  };

  const resetForm = () => {
    setFormData({
      date: getTodayString(),
      petName: '',
      species: 'Cachorro',
      customSpecies: '',
      requesterVet: '',
      requesterCrmv: '',
      period: 'comercial',
      machineOwner: 'professional',
      veterinarianId: loggedUserEntity?.type === 'vet' ? loggedUserEntity.id : '',
      clinicId: loggedUserEntity?.type === 'clinic' ? loggedUserEntity.id : (currentTenant?.type === 'clinic' ? currentTenant.id : ''),
      items: [{ id: '1', modality: '', studies: 1, studyDescription: '', rxStudies: [] }]
    });
  };

  const handleSaveExam = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingExam(true);

    try {
      const clinicForSave = formData.clinicId || effectiveClinicId;
      const examsToSave = formData.items.map(item => {
        const values = calculateExamValues(item.modality, formData.period, formData.machineOwner, priceRules, item.studies, effectiveClinicId);
        
        return {
          date: formData.date,
          pet_name: formData.petName,
          species: formData.species === 'Outros' ? formData.customSpecies : formData.species,
          requester_vet: formData.requesterVet,
          requester_crmv: formData.requesterCrmv,
          
          modality: item.modality,
          studies: item.studies,
          study_description: item.studyDescription,
          rx_studies: item.rxStudies,
          
          period: formData.period,
          machine_owner: formData.machineOwner,
          veterinarian_id: formData.veterinarianId,
          clinic_id: clinicForSave,
          
          total_value: values.totalValue,
          repasse_professional: values.repasseProfessional,
          repasse_clinic: values.repasseClinic,
        };
      });

      if (editingExamId) {
        const { error } = await supabase.from('exams').update(examsToSave[0]).eq('id', editingExamId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('exams').insert(examsToSave);
        if (error) throw error;
      }

      await fetchData();
      resetForm();
      setActiveTab('list');
      setEditingExamId(null);
    } catch (error) {
      console.error("Erro ao salvar exame:", error);
      alert("Erro ao salvar exame. Verifique os dados.");
    } finally {
      setIsSavingExam(false);
    }
  };

  const handleEditReport = (exam: Exam) => {
    setReportEditorState({ isOpen: true, exam });
  };

  const handleSaveReport = async (examId: string, content: string, images: string[], studyId?: string) => {
    try {
      if (!studyId) {
        const { error } = await supabase.from('exams').update({
          report_content: content,
          report_images: images,
          status: 'completed'
        }).eq('id', examId);
        if (error) throw error;
      }
      await fetchData();
      setReportEditorState({ isOpen: false, exam: null });
    } catch (error) {
      console.error("Erro ao salvar laudo:", error);
      alert("Erro ao salvar laudo. Tente novamente.");
    }
  };

  const handlePrintReport = async (exam: Exam) => {
    setIsGeneratingPdf(true);
    try {
      const branding = getBrandingForExam(exam);
      const responsibleVet = veterinarians.find(v => v.id === exam.veterinarianId || v.profileId === exam.veterinarianId);
      await generateExamReport(exam, branding, responsibleVet);
    } catch (error) {
      console.error("Erro ao gerar PDF:", error);
      alert("Erro ao gerar PDF.");
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleEditExam = (exam: Exam) => {
    setEditingExamId(exam.id);
    setFormData({
      date: exam.date,
      petName: exam.petName,
      species: exam.species || 'Cachorro',
      customSpecies: '',
      requesterVet: exam.requesterVet || '',
      requesterCrmv: exam.requesterCrmv || '',
      period: exam.period,
      machineOwner: exam.machineOwner,
      veterinarianId: exam.veterinarianId,
      clinicId: exam.clinicId,
      items: [{ id: '1', modality: exam.modality, studies: exam.studies || 1, studyDescription: exam.studyDescription, rxStudies: exam.rxStudies || [] }]
    });
    setActiveTab('form');
  };

  const handleDeleteExam = async (id: string) => {
    try {
      const { error } = await supabase.from('exams').delete().eq('id', id);
      if (error) throw error;
      setExams(prev => prev.filter(e => e.id !== id));
      setConfirmationState({ ...confirmationState, isOpen: false });
    } catch (error) {
      console.error("Erro ao excluir:", error);
      alert("Erro ao excluir exame.");
    }
  };

  const confirmDelete = (id: string) => {
    const isOwnerOrAdmin = user?.level === 1 || user?.level === 3 || user?.level === 4;
    const hasBypassPermission = user?.permissions.bypass_delete_password;
    
    setConfirmationState({
      isOpen: true,
      type: 'exam',
      id,
      title: 'Excluir Exame',
      message: 'Tem certeza? Esta ação não pode ser desfeita.',
      requirePassword: !isOwnerOrAdmin && !hasBypassPermission
    });
  };

  const handleOpenPriceModal = (price?: PriceRule) => {
    if (price) {
      setEditingPrice(price);
      setPriceForm(price);
      if (price.modality === 'OUTROS') {
        setCustomModalityName(price.label);
      } else {
        setCustomModalityName('');
      }
    } else {
      setEditingPrice(null);
      
      let defaultClinicId = '';
      
      // Verifica tanto loggedUserEntity quanto currentTenant
      const isClinic = loggedUserEntity?.type === 'clinic' || currentTenant?.type === 'clinic';
      const isVet = loggedUserEntity?.type === 'vet' || currentTenant?.type === 'vet';
      
      if (isClinic) {
        defaultClinicId = loggedUserEntity?.type === 'clinic' ? loggedUserEntity.id : (currentTenant?.type === 'clinic' ? currentTenant.id : '');
      } 
      else if (isVet && availableClinicsForVet.length > 0) {
        defaultClinicId = availableClinicsForVet[0].id;
        console.log('🏥 Clínica padrão selecionada:', availableClinicsForVet[0].name);
      }
      else if (currentTenant?.type === 'clinic') {
        defaultClinicId = currentTenant.id;
      }

      // Debug: mostra informações sobre clínicas disponíveis
      if (isVet) {
        console.log('🔍 Debug ao abrir modal de preços:', {
          isVet,
          availableClinicsForVet: availableClinicsForVet.map(c => ({ id: c.id, name: c.name })),
          linkedPartners: linkedPartners.filter(p => p.role === 'clinic').map(p => ({ id: p.id, name: p.name })),
          extraClinics: extraClinics.map(c => ({ id: c.id, name: c.name })),
          defaultClinicId
        });
      }

      setPriceForm({ 
        clinicId: defaultClinicId, 
        modality: 'USG', period: 'comercial', valor: 0, repasseProfessional: 0, repasseClinic: 0, taxaExtra: 0, taxaExtraProfessional: 0, taxaExtraClinic: 0, observacoes: '' 
      });
      setCustomModalityName('');
    }
    setIsPriceModalOpen(true);
  };

  const handleSavePrice = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const isCustom = priceForm.modality === 'OUTROS';
      const finalLabel = isCustom ? customModalityName : getModalityLabel(priceForm.modality || '');

      const payload = {
        clinic_id: priceForm.clinicId,
        modality: priceForm.modality,
        period: priceForm.period,
        label: finalLabel,
        period_label: getPeriodLabel(priceForm.period || 'comercial'),
        valor: Number(priceForm.valor),
        repasse_professional: Number(priceForm.repasseProfessional),
        repasse_clinic: Number(priceForm.repasseClinic),
        taxa_extra: Number(priceForm.taxaExtra),
        taxa_extra_professional: Number(priceForm.taxaExtraProfessional),
        taxa_extra_clinic: Number(priceForm.taxaExtraClinic),
        observacoes: priceForm.observacoes
      };

      if (editingPrice) {
        const { error } = await supabase.from('price_rules').update(payload).eq('id', editingPrice.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('price_rules').insert(payload);
        if (error) throw error;
      }
      
      await fetchData();
      setIsPriceModalOpen(false);
    } catch (error) {
      console.error("Erro ao salvar preço:", error);
      alert("Erro ao salvar preço.");
    }
  };

  const handleDeletePrice = async (id: string) => {
    try {
      const { error } = await supabase.from('price_rules').delete().eq('id', id);
      if (error) throw error;
      await fetchData();
      setConfirmationState({ ...confirmationState, isOpen: false });
    } catch (error) {
      console.error("Erro ao excluir preço:", error);
      alert("Erro ao excluir preço.");
    }
  };

  const filteredExamsForReport = useMemo(() => {
    return exams.filter(e => {
      const d = e.date;
      return d >= reportStartDate && d <= reportEndDate;
    });
  }, [exams, reportStartDate, reportEndDate]);

  const reportStats = useMemo(() => {
    return filteredExamsForReport.reduce((acc, exam) => ({
      totalArrecadado: acc.totalArrecadado + exam.totalValue,
      totalRepasseProf: acc.totalRepasseProf + exam.repasseProfessional,
      totalRepasseClinic: acc.totalRepasseClinic + exam.repasseClinic,
      count: acc.count + 1
    }), { totalArrecadado: 0, totalRepasseProf: 0, totalRepasseClinic: 0, count: 0 });
  }, [filteredExamsForReport]);

  const listStats = useMemo(() => {
    const filteredBySearch = exams.filter(e => e.petName.toLowerCase().includes(filterPet.toLowerCase()));
    
    return filteredBySearch.reduce((acc, exam) => ({
      totalArrecadado: acc.totalArrecadado + exam.totalValue,
      totalRepasseProf: acc.totalRepasseProf + exam.repasseProfessional,
      totalRepasseClinic: acc.totalRepasseClinic + exam.repasseClinic,
      count: acc.count + 1
    }), { totalArrecadado: 0, totalRepasseProf: 0, totalRepasseClinic: 0, count: 0 });
  }, [exams, filterPet]);

  const machineStats = useMemo(() => {
    const stats = {
      professional: { total: 0, repasseClinic: 0, count: 0 },
      clinic: { total: 0, repasseProf: 0, count: 0 }
    };

    filteredExamsForReport.forEach(exam => {
      if (exam.machineOwner === 'professional') {
        stats.professional.total += exam.totalValue;
        stats.professional.repasseClinic += exam.repasseClinic;
        stats.professional.count += 1;
      } else {
        stats.clinic.total += exam.totalValue;
        stats.clinic.repasseProf += exam.repasseProfessional;
        stats.clinic.count += 1;
      }
    });
    return stats;
  }, [filteredExamsForReport]);

  const chartOption = useMemo(() => {
    const data = filteredExamsForReport.reduce((acc, curr) => {
      const label = getModalityLabel(curr.modality);
      acc[label] = (acc[label] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const chartData = Object.entries(data).map(([name, value]) => ({
      name,
      value
    }));

    return {
      tooltip: { trigger: 'item' },
      legend: { bottom: '0%', left: 'center' },
      series: [
        {
          name: 'Exames',
          type: 'pie',
          radius: ['40%', '70%'],
          avoidLabelOverlap: false,
          itemStyle: {
            borderRadius: 10,
            borderColor: '#fff',
            borderWidth: 2
          },
          label: { show: false, position: 'center' },
          emphasis: {
            label: { show: true, fontSize: '14', fontWeight: 'bold' }
          },
          labelLine: { show: false },
          data: chartData,
          color: ['#5A8F91', '#9CBDBF', '#15504E', '#F4A261', '#E76F51'] 
        }
      ]
    };
  }, [filteredExamsForReport]);

  // --- HELPERS PARA MÚLTIPLOS EXAMES ---
  const addItem = () => {
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, { id: Date.now().toString(), modality: '' as Modality | '', studies: 1, studyDescription: '', rxStudies: [] }]
    }));
  };

  const removeItem = (id: string) => {
    if (formData.items.length === 1) return;
    setFormData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== id)
    }));
  };

  const updateItem = (id: string, field: keyof ExamItem, value: any) => {
    setFormData(prev => ({
      ...prev,
      items: prev.items.map(item => item.id === id ? { ...item, [field]: value } : item)
    }));
  };

  // clinicId efetivo para o cálculo: prioriza formData, depois filtro da tabela de preços, depois entidade/tenant
  const effectiveClinicId = formData.clinicId 
    || selectedClinicFilter 
    || (loggedUserEntity?.type === 'clinic' ? loggedUserEntity.id : null) 
    || (currentTenant?.type === 'clinic' ? currentTenant.id : null) 
    || '';

  // Cálculo de Prévia Total
  const previewTotals = useMemo(() => {
    return formData.items.reduce((acc, item) => {
      if (!item.modality) return acc;
      const values = calculateExamValues(
        item.modality, 
        formData.period, 
        formData.machineOwner, 
        priceRules, 
        item.studies, 
        effectiveClinicId
      );
      return {
        total: acc.total + values.totalValue,
        prof: acc.prof + values.repasseProfessional,
        clinic: acc.clinic + values.repasseClinic
      };
    }, { total: 0, prof: 0, clinic: 0 });
  }, [formData.items, formData.period, formData.machineOwner, effectiveClinicId, priceRules, selectedClinicFilter]);

  return (
    <div className="space-y-6">
      {isLoadingData && (
        <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-petcare-DEFAULT animate-spin" />
            <p className="text-gray-500 font-medium">Carregando ambiente de trabalho...</p>
          </div>
        </div>
      )}

      {isPartnerView && (
        <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r-lg shadow-sm animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-full">
                <Eye className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-amber-800">Modo de Visualização de Parceiro</h3>
                <p className="text-xs text-amber-700 mt-0.5">
                  Você está vendo apenas os exames vinculados a: <span className="font-bold">{currentTenant?.name}</span>
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {canViewFinancials && (
        <div className="animate-fade-in">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Resumo Operacional</h3>
            <button 
              onClick={() => setShowFinancialStats(!showFinancialStats)}
              className="text-gray-400 hover:text-petcare-dark transition-colors p-1 rounded-md hover:bg-gray-100 flex items-center gap-1 text-xs font-medium"
              title={showFinancialStats ? "Ocultar Resumo" : "Mostrar Resumo"}
            >
              {showFinancialStats ? (
                <>Ocultar <ChevronUp className="w-4 h-4" /></>
              ) : (
                <>Mostrar <ChevronDown className="w-4 h-4" /></>
              )}
            </button>
          </div>
          
          {showFinancialStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <SummaryCard title="Faturamento Total" value={formatMoney(listStats.totalArrecadado)} subtitle={`${listStats.count} exames listados`} icon={DollarSign} colorClass="text-green-600" iconColorClass="text-green-600" />
              <SummaryCard title="Repasse Profissional" value={formatMoney(listStats.totalRepasseProf)} subtitle="A Pagar" icon={UserCheck} colorClass="text-blue-600" iconColorClass="text-blue-600" />
              <SummaryCard title="Repasse Clínica" value={formatMoney(listStats.totalRepasseClinic)} subtitle="Receita Líquida" icon={Building2} colorClass="text-purple-600" iconColorClass="text-purple-600" />
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-2 overflow-x-auto">
        {TABS.map(tab => {
          if (tab.id === 'prices' && !canManagePrices) return null;
          if (tab.id === 'reports' && !canViewFinancials) return null;
          if (tab.id === 'form' && !canCreateExam) return null;
          
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={clsx(
                "flex-1 min-w-[120px] px-4 py-3 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2",
                activeTab === tab.id
                  ? "bg-petcare-bg text-petcare-dark shadow-sm ring-1 ring-black/5"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
              )}
            >
              <tab.icon className={clsx("w-4 h-4", activeTab === tab.id ? "text-petcare-DEFAULT" : "text-gray-400")} />
              {tab.label}
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[500px]">
        
        {activeTab === 'list' && (
          <div className="p-6">
            
            <div className="flex flex-col md:flex-row gap-4 mb-6 justify-between items-center">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <List className="w-5 h-5 text-petcare-DEFAULT" />
                Exames Registrados
              </h2>
              <div className="flex gap-2 w-full md:w-auto">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar paciente..."
                    value={filterPet}
                    onChange={e => setFilterPet(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-petcare-light/50 outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold tracking-wider">
                    <th className="p-4 rounded-tl-lg">Data</th>
                    <th className="p-4">Paciente</th>
                    <th className="p-4">Exame</th>
                    <th className="p-4">Veterinário</th>
                    <th className="p-4">Clínica</th>
                    {canViewFinancials && <th className="p-4 text-right">Valor</th>}
                    <th className="p-4 rounded-tr-lg text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-sm text-gray-700">
                  {exams.length === 0 ? (
                    <tr>
                      <td colSpan={canViewFinancials ? 7 : 6} className="p-8 text-center text-gray-400">
                        Nenhum exame encontrado.
                      </td>
                    </tr>
                  ) : (
                    exams
                      .filter(e => e.petName.toLowerCase().includes(filterPet.toLowerCase()))
                      .map(exam => {
                        const canEditExamDetails = user?.level === 1 || user?.role !== 'vet' || !exam.clinicId;

                        return (
                        <tr key={exam.id} className="hover:bg-gray-50/50 transition-colors group">
                          <td className="p-4 whitespace-nowrap text-gray-500">
                            {format(parseISO(exam.date), 'dd/MM/yyyy')}
                          </td>
                          <td className="p-4 font-medium text-gray-900">
                            {exam.petName}
                            <span className="block text-[10px] text-gray-400 font-normal">{exam.species}</span>
                          </td>
                          <td className="p-4">
                            <span className="inline-flex items-center px-2 py-1 rounded bg-gray-100 text-gray-600 text-xs font-medium">
                              {getModalityLabel(exam.modality, exam.modality === 'OUTROS' ? exam.studyDescription : undefined)}
                            </span>
                            {exam.status === 'completed' && (
                              <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700" title="Laudo Pronto">
                                <CheckCircle2 className="w-3 h-3 mr-0.5" /> OK
                              </span>
                            )}
                          </td>
                          
                          <td className="p-4 text-gray-600">
                            <div className="flex items-center gap-2">
                              <Stethoscope className="w-3 h-3 text-gray-400" />
                              <span className="truncate max-w-[150px]" title={getVeterinarianName(exam.veterinarianId)}>
                                {getVeterinarianName(exam.veterinarianId)}
                              </span>
                            </div>
                          </td>

                          <td className="p-4 text-gray-600">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-3 h-3 text-gray-400" />
                              <span className="truncate max-w-[150px]" title={getClinicName(exam.clinicId)}>
                                {getClinicName(exam.clinicId)}
                              </span>
                            </div>
                          </td>

                          {canViewFinancials && (
                            <td className="p-4 text-right font-medium text-gray-900">
                              {formatMoney(exam.totalValue)}
                            </td>
                          )}
                          
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2 opacity-100 transition-opacity">
                              
                              {canEditExamDetails && (
                                <button 
                                  onClick={() => handleEditExam(exam)}
                                  className="p-1.5 text-gray-400 hover:text-petcare-dark hover:bg-petcare-bg rounded-lg transition-colors" 
                                  title="Editar Dados do Exame"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                              )}

                              {canEditReports && (
                                <button 
                                  onClick={() => handleEditReport(exam)}
                                  className={clsx(
                                    "p-1.5 rounded-lg transition-colors",
                                    exam.status === 'completed' 
                                      ? "text-green-500 hover:text-green-700 hover:bg-green-50" 
                                      : "text-gray-400 hover:text-teal-600 hover:bg-teal-50"
                                  )}
                                  title={exam.status === 'completed' ? "Editar Laudo" : "Criar Laudo"}
                                >
                                  <Stethoscope className="w-4 h-4" />
                                </button>
                              )}

                              <button 
                                onClick={() => handlePrintReport(exam)}
                                className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" 
                                title="Imprimir / Visualizar PDF"
                              >
                                <Printer className="w-4 h-4" />
                              </button>

                              {user?.permissions.delete_exams && (
                                <button 
                                  onClick={() => confirmDelete(exam.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" 
                                  title="Excluir"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}

                            </div>
                          </td>
                        </tr>
                      )})
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'form' && (
          <div className="p-6 max-w-4xl mx-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-6 flex items-center gap-2">
              <PlusCircle className="w-6 h-6 text-petcare-DEFAULT" />
              {editingExamId ? 'Editar Exame' : 'Novo Exame'}
            </h2>

            {loggedUserEntity?.type === 'clinic' && availableVeterinarians.length === 0 && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-800 text-sm">Nenhum veterinário encontrado</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    {(user?.level === 1 || user?.permissions?.manage_users || user?.permissions?.visualizar_equipe)
                      ? 'Você precisa cadastrar sua equipe ou vincular veterinários parceiros antes de lançar exames.'
                      : 'Solicite ao administrador da clínica que cadastre veterinários ou vincule parceiros antes de lançar exames.'}
                  </p>
                  {(user?.level === 1 || user?.permissions?.manage_users || user?.permissions?.visualizar_equipe) && (
                    <button 
                      onClick={() => navigate('/users')}
                      className="mt-2 text-xs font-bold bg-amber-100 text-amber-800 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors flex items-center gap-1"
                    >
                      <Users className="w-3 h-3" /> Ir para Minha Equipe
                    </button>
                  )}
                </div>
              </div>
            )}

            {loggedUserEntity?.type === 'vet' && availableClinicsForVet.length === 0 && (
              <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 animate-fade-in">
                <LinkIcon className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <h3 className="font-bold text-amber-800 text-sm">Nenhuma clínica vinculada</h3>
                  <p className="text-sm text-amber-700 mt-1">
                    Para lançar exames, você precisa estar vinculado a uma clínica parceira. Solicite o vínculo à clínica.
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSaveExam} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Data do Exame</label>
                  <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Paciente (PET)</label>
                  <input type="text" required value={formData.petName} onChange={e => setFormData({...formData, petName: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT" placeholder="Nome do animal" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Espécie</label>
                  <select value={formData.species} onChange={e => setFormData({...formData, species: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT">
                    {SPECIES_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                  {formData.species === 'Outros' && (
                    <input type="text" placeholder="Qual espécie?" value={formData.customSpecies} onChange={e => setFormData({...formData, customSpecies: e.target.value})} className="mt-2 w-full px-3 py-2 border rounded-lg text-sm" />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Veterinário Requisitante (Externo)</label>
                  <input type="text" value={formData.requesterVet} onChange={e => setFormData({...formData, requesterVet: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT" placeholder="Quem pediu o exame?" />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CRMV do Requisitante</label>
                  <input type="text" value={formData.requesterCrmv} onChange={e => setFormData({...formData, requesterCrmv: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT" placeholder="Opcional" />
                </div>

                {loggedUserEntity?.type === 'vet' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Clínica (Local do Exame)</label>
                    {availableClinicsForVet.length > 0 ? (
                      <select required value={formData.clinicId} onChange={e => setFormData({...formData, clinicId: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT">
                        <option value="">Selecione a Clínica</option>
                        {availableClinicsForVet.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    ) : (
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                          <div>
                            <p className="font-medium">Nenhuma clínica vinculada.</p>
                            <p className="text-xs text-amber-700 mt-1">
                              Para lançar exames, você precisa estar vinculado a uma clínica parceira. Solicite o vínculo à clínica.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Veterinário Responsável (Executor)</label>
                    <select required value={formData.veterinarianId} onChange={e => setFormData({...formData, veterinarianId: e.target.value})} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT">
                      <option value="">Selecione o Veterinário</option>
                      {availableVeterinarians.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              {/* CONFIGURAÇÕES GERAIS DE PREÇO */}
              <div className="bg-gray-50 p-4 rounded-xl border border-gray-200">
                <h3 className="font-bold text-gray-700 mb-3 text-sm uppercase tracking-wide">Configuração de Cobrança</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Período</label>
                    <select value={formData.period} onChange={e => setFormData({...formData, period: e.target.value as Period})} className="w-full px-3 py-2 border rounded-lg">
                      <option value="comercial">Comercial</option>
                      <option value="noturno">Noturno</option>
                      <option value="fds">Fim de Semana</option>
                      <option value="feriado">Feriado</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-500 mb-1">Proprietário da Máquina</label>
                    <select value={formData.machineOwner} onChange={e => setFormData({...formData, machineOwner: e.target.value as MachineOwner})} className="w-full px-3 py-2 border rounded-lg">
                      <option value="professional">Profissional (Volante)</option>
                      <option value="clinic">Clínica (Fixa)</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* LISTA DE EXAMES (Múltiplos) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-bold text-gray-700">Exames Realizados</h3>
                  {!editingExamId && (
                    <button 
                      type="button" 
                      onClick={addItem}
                      className="text-sm font-bold text-petcare-dark hover:text-petcare-DEFAULT flex items-center gap-1 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Adicionar outro exame
                    </button>
                  )}
                </div>

                <div className="space-y-4">
                  {formData.items.map((item, index) => (
                    <div key={item.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm relative group">
                      {formData.items.length > 1 && !editingExamId && (
                        <button 
                          type="button" 
                          onClick={() => removeItem(item.id)}
                          className="absolute top-2 right-2 text-gray-300 hover:text-red-500 p-1 transition-colors"
                          title="Remover este exame"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                      
                      <p className="text-xs font-bold text-gray-400 mb-2">Modalidade {index + 1}</p>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Exame</label>
                          <select 
                            required 
                            value={item.modality} 
                            onChange={e => {
                              updateItem(item.id, 'modality', e.target.value);
                              // Limpa a descrição quando troca de modalidade (exceto se for OUTROS)
                              if (e.target.value !== 'OUTROS') {
                                updateItem(item.id, 'studyDescription', '');
                              }
                            }} 
                            className="w-full px-3 py-2 border rounded-lg bg-gray-50 focus:bg-white transition-colors"
                          >
                            <option value="">Selecione...</option>
                            <option value="USG">Ultrassom</option>
                            <option value="RX">Raio-X</option>
                            <option value="RX_CONTROLE">RX Controle</option>
                            <option value="USG_FAST">USG Fast</option>
                            <option value="OUTROS">Outro (Novo Exame)</option>
                          </select>
                        </div>
                        
                        {item.modality === 'OUTROS' && (
                          <div className="md:col-span-2 animate-fade-in">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Nome do Novo Exame</label>
                            <input 
                              type="text" 
                              required
                              value={item.studyDescription || ''} 
                              onChange={e => updateItem(item.id, 'studyDescription', e.target.value)} 
                              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT"
                              placeholder="Digite o nome do exame..."
                            />
                          </div>
                        )}
                        
                        {item.modality === 'RX' && (
                          <div className="animate-fade-in">
                            <label className="block text-xs font-bold text-gray-500 mb-1">Nº de Estudos/Projeções</label>
                            <input 
                              type="number" 
                              min="1" 
                              value={item.studies} 
                              onChange={e => updateItem(item.id, 'studies', parseInt(e.target.value) || 1)} 
                              className="w-full px-3 py-2 border rounded-lg"
                            />
                          </div>
                        )}

                        {item.modality !== 'OUTROS' && (
                          <div className={item.modality === 'RX' ? '' : 'md:col-span-2'}>
                            <label className="block text-xs font-bold text-gray-500 mb-1">Descrição / Região (Opcional)</label>
                            <input 
                              type="text" 
                              value={item.studyDescription || ''} 
                              onChange={e => updateItem(item.id, 'studyDescription', e.target.value)} 
                              className="w-full px-3 py-2 border rounded-lg"
                              placeholder="Ex: Abdominal, Tórax, Membro..."
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* RESUMO FINANCEIRO (PREVIEW) */}
              <div className="bg-petcare-light/10 border border-petcare-light/20 rounded-xl p-6 animate-fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <DollarSign className="w-5 h-5 text-petcare-dark" />
                  <h3 className="font-bold text-petcare-dark">Prévia Total (Todos os exames)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Valor Total</p>
                    <p className="text-xl font-bold text-gray-800">{formatMoney(previewTotals.total)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Repasse Profissional</p>
                    <p className="text-xl font-bold text-gray-800">{formatMoney(previewTotals.prof)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-100">
                    <p className="text-xs text-gray-500 mb-1">Repasse Clínica</p>
                    <p className="text-xl font-bold text-gray-800">{formatMoney(previewTotals.clinic)}</p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button type="submit" disabled={isSavingExam} className="bg-petcare-dark text-white px-8 py-3 rounded-lg font-bold hover:bg-petcare-DEFAULT transition-all shadow-lg flex items-center gap-2">
                  {isSavingExam ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {editingExamId ? 'Atualizar Exame' : 'Salvar Exames'}
                </button>
              </div>
            </form>
          </div>
        )}

        {activeTab === 'reports' && canViewFinancials && (
          <div className="p-6">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                <div className="bg-gray-50 p-2 rounded-lg border border-gray-200 flex gap-2 items-center">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  <input type="date" value={reportStartDate} onChange={e => setReportStartDate(e.target.value)} className="bg-transparent text-sm outline-none text-gray-700" />
                  <span className="text-gray-400 text-xs">até</span>
                  <input type="date" value={reportEndDate} onChange={e => setReportEndDate(e.target.value)} className="bg-transparent text-sm outline-none text-gray-700" />
                </div>
                <button onClick={() => generatePDFReport(filteredExamsForReport, user!, reportStartDate, reportEndDate, getBrandingForExam(exams[0] || {}))} className="bg-petcare-dark text-white px-4 py-2 rounded-lg font-bold hover:bg-petcare-DEFAULT transition-colors flex items-center gap-2 shadow-md">
                  <FileText className="w-4 h-4" /> Exportar PDF
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
               <SummaryCard title="Total Arrecadado" value={formatMoney(reportStats.totalArrecadado)} subtitle={`${reportStats.count} exames`} icon={DollarSign} colorClass="text-green-600" iconColorClass="text-green-600" />
               <SummaryCard title="Repasse Profissional" value={formatMoney(reportStats.totalRepasseProf)} subtitle="A Pagar" icon={UserCheck} colorClass="text-blue-600" iconColorClass="text-blue-600" />
               <SummaryCard title="Repasse Clínica" value={formatMoney(reportStats.totalRepasseClinic)} subtitle="Receita Líquida" icon={Building2} colorClass="text-purple-600" iconColorClass="text-purple-600" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 mb-4">Distribuição por Modalidade</h3>
                <ReactECharts option={chartOption} style={{ height: '300px' }} />
              </div>

              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-700 mb-4">Resumo por Máquina</h3>
                <div className="space-y-4">
                  
                  <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                    <h4 className="font-bold text-petcare-dark mb-2">Máquina do Parceiro/Profissional</h4>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Total Arrecadado</span>
                      <span className="font-bold text-gray-800">{formatMoney(machineStats.professional.total)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">A Pagar Clínica</span>
                      <span className="font-bold text-red-500">{formatMoney(machineStats.professional.repasseClinic)}</span>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg bg-gray-50 border border-gray-100">
                    <h4 className="font-bold text-petcare-dark mb-2">Máquina da Clínica</h4>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Total Arrecadado</span>
                      <span className="font-bold text-gray-800">{formatMoney(machineStats.clinic.total)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-500">Repasse Profissional</span>
                      <span className="font-bold text-teal-600">{formatMoney(machineStats.clinic.repasseProf)}</span>
                    </div>
                  </div>

                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'prices' && canManagePrices && (
          <div className="p-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
              <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Tag className="w-6 h-6 text-petcare-DEFAULT" />
                Tabela de Preços
              </h2>
              <div className="flex flex-col md:flex-row gap-3 w-full md:w-auto">
                {/* Dropdown para filtrar por clínica - só mostra se não for convidado ou tiver mais de uma clínica */}
                {(loggedUserEntity?.type === 'vet' || currentTenant?.type === 'vet') && availableClinicsForVet.length > 0 && (
                  <>
                    {(() => {
                      const isGuest = user?.ownerId && user.ownerId !== user.id;
                      // Se for convidado e tiver apenas 1 clínica, não mostra o dropdown
                      if (isGuest && availableClinicsForVet.length === 1) {
                        return (
                          <div className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-600">
                            {availableClinicsForVet[0]?.name || 'Clínica'}
                          </div>
                        );
                      }
                      return (
                        <select
                          value={selectedClinicFilter}
                          onChange={(e) => setSelectedClinicFilter(e.target.value)}
                          className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-petcare-DEFAULT focus:border-petcare-DEFAULT bg-white"
                        >
                          <option value="">Todas as Clínicas</option>
                          {availableClinicsForVet.map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      );
                    })()}
                  </>
                )}
                {loggedUserEntity?.type === 'clinic' && (
                  <div className="px-4 py-2 border border-gray-300 rounded-lg text-sm bg-gray-50 text-gray-600">
                    {currentTenant?.name || 'Clínica Atual'}
                  </div>
                )}
                <button onClick={() => handleOpenPriceModal()} className="bg-petcare-dark text-white px-4 py-2 rounded-lg font-bold hover:bg-petcare-DEFAULT transition-colors flex items-center gap-2 whitespace-nowrap">
                  <Plus className="w-4 h-4" /> Nova Regra
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-gray-50 text-xs uppercase text-gray-500 font-semibold">
                  <tr>
                    <th className="p-3">Modalidade</th>
                    <th className="p-3">Período</th>
                    <th className="p-3 text-right">Valor Total</th>
                    <th className="p-3 text-right">Repasse Prof.</th>
                    <th className="p-3 text-right">Repasse Clínica</th>
                    <th className="p-3 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {priceRules
                    .filter(rule => !selectedClinicFilter || rule.clinicId === selectedClinicFilter)
                    .map(rule => {
                      const clinicName = clinics.find(c => c.id === rule.clinicId)?.name || availableClinicsForVet.find(c => c.id === rule.clinicId)?.name || 'N/A';
                      return (
                        <tr key={rule.id} className="hover:bg-gray-50">
                          <td className="p-3 font-medium">
                            <div>{rule.label}</div>
                            {(loggedUserEntity?.type === 'vet' || currentTenant?.type === 'vet') && !selectedClinicFilter && (
                              <div className="text-xs text-gray-400 mt-0.5">{clinicName}</div>
                            )}
                          </td>
                          <td className="p-3">{rule.periodLabel}</td>
                          <td className="p-3 text-right font-bold">{formatMoney(rule.valor + (rule.taxaExtra || 0))}</td>
                          <td className="p-3 text-right text-blue-600">{formatMoney(rule.repasseProfessional + (rule.taxaExtraProfessional || 0))}</td>
                          <td className="p-3 text-right text-purple-600">{formatMoney(rule.repasseClinic + (rule.taxaExtraClinic || 0))}</td>
                          <td className="p-3 flex justify-center gap-2">
                            <button onClick={() => handleOpenPriceModal(rule)} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Edit2 className="w-4 h-4" /></button>
                            <button onClick={() => { setConfirmationState({ isOpen: true, type: 'price', id: rule.id, title: 'Excluir Preço', message: 'Tem certeza?' }); }} className="text-red-500 hover:bg-red-50 p-1.5 rounded"><Trash2 className="w-4 h-4" /></button>
                          </td>
                        </tr>
                      );
                    })}
                  {priceRules.filter(rule => !selectedClinicFilter || rule.clinicId === selectedClinicFilter).length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400">
                        {selectedClinicFilter ? 'Nenhuma regra de preço encontrada para esta clínica.' : 'Nenhuma regra de preço cadastrada.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {reportEditorState.isOpen && reportEditorState.exam && (
        <ExamReportEditor
          isOpen={reportEditorState.isOpen}
          onClose={() => setReportEditorState({ isOpen: false, exam: null })}
          exam={reportEditorState.exam}
          studyId={reportEditorState.studyId}
          onSave={handleSaveReport}
        />
      )}

      <Modal isOpen={isPriceModalOpen} onClose={() => { setIsPriceModalOpen(false); setCopyFromClinicId(''); setCopyToClinicId(''); }} title={editingPrice ? "Editar Preço" : "Novo Preço"}>
        <form onSubmit={handleSavePrice} className="space-y-4">
          
          {(loggedUserEntity?.type === 'vet' || currentTenant?.type === 'vet') && (
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Clínica Parceira (Tabela Específica)</label>
              {availableClinicsForVet.length > 0 ? (
                <select 
                  value={priceForm.clinicId || ''} 
                  onChange={e => {
                    setPriceForm({...priceForm, clinicId: e.target.value});
                    setCopyFromClinicId(''); // Reset ao trocar clínica
                  }} 
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT focus:border-petcare-DEFAULT"
                  required
                >
                  <option value="">Selecione a clínica parceira...</option>
                  {availableClinicsForVet.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
                   <div className="flex items-start gap-2">
                     <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                     <div>
                       <p className="font-medium">Nenhuma clínica vinculada.</p>
                       <p className="text-xs text-amber-700 mt-1">
                         Você precisa estar vinculado a uma clínica parceira para criar tabelas de preços específicas.
                       </p>
                     </div>
                   </div>
                </div>
              )}
            </div>
          )}

          {/* Funcionalidade de Copiar Preços de Outra Clínica */}
          {!editingPrice && (loggedUserEntity?.type === 'vet' || currentTenant?.type === 'vet') && availableClinicsForVet.length > 0 && (
            <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
              <div className="flex items-start gap-3 mb-4">
                <Copy className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <label className="block text-sm font-bold text-teal-800 mb-1">Copiar Tabela de Preços</label>
                  <p className="text-xs text-teal-700">
                    Copie todas as regras de preços de uma clínica parceira para outra para economizar tempo.
                  </p>
                </div>
              </div>
              
              <div className="space-y-3">
                {/* Primeiro Select: Clínica Doadora (de onde copiar) */}
                <div>
                  <label className="block text-xs font-semibold text-teal-700 mb-1">Clínica Doadora (de onde copiar)</label>
                  <select
                    value={copyFromClinicId}
                    onChange={(e) => {
                      setCopyFromClinicId(e.target.value);
                      setCopyToClinicId(''); // Limpa o destino ao trocar a origem
                    }}
                    className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                  >
                    <option value="">Selecione a clínica doadora...</option>
                    {availableClinicsForVet.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {/* Segundo Select: Clínica Receptora (para onde copiar) */}
                {copyFromClinicId && (
                  <div className="animate-fade-in">
                    <label className="block text-xs font-semibold text-teal-700 mb-1">Clínica Receptora (para onde copiar)</label>
                    <select
                      value={copyToClinicId}
                      onChange={(e) => setCopyToClinicId(e.target.value)}
                      className="w-full px-3 py-2 border border-teal-300 rounded-lg text-sm focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white"
                    >
                      <option value="">Selecione a clínica receptora...</option>
                      {availableClinicsForVet
                        .filter(c => c.id !== copyFromClinicId)
                        .map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Botão de Copiar */}
                {copyFromClinicId && copyToClinicId && (
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        const sourceClinic = availableClinicsForVet.find(c => c.id === copyFromClinicId);
                        const targetClinic = availableClinicsForVet.find(c => c.id === copyToClinicId);
                        
                        console.log('📋 Iniciando cópia de regras de preço:', {
                          fromClinicId: copyFromClinicId,
                          fromClinicName: sourceClinic?.name,
                          toClinicId: copyToClinicId,
                          toClinicName: targetClinic?.name
                        });
                            
                        // Busca todas as regras de preço da clínica doadora
                        const { data: sourceRules, error: sourceRulesError } = await supabase
                          .from('price_rules')
                          .select('*')
                          .eq('clinic_id', copyFromClinicId);

                        if (sourceRulesError) {
                          console.error('❌ Erro ao buscar regras de preço:', sourceRulesError);
                          alert(`Erro ao buscar regras de preço: ${sourceRulesError.message}`);
                          return;
                        }

                        console.log('📊 Regras encontradas:', {
                          clinicId: copyFromClinicId,
                          clinicName: sourceClinic?.name,
                          rulesCount: sourceRules?.length || 0,
                          rules: sourceRules?.map(r => ({ id: r.id, modality: r.modality, period: r.period, label: r.label }))
                        });

                        if (!sourceRules || sourceRules.length === 0) {
                          alert(`A clínica "${sourceClinic?.name || 'selecionada'}" não possui regras de preço para copiar.`);
                          return;
                        }

                        // Verifica se já existem regras para a clínica receptora
                        const { data: existingRules } = await supabase
                          .from('price_rules')
                          .select('*')
                          .eq('clinic_id', copyToClinicId);

                        if (existingRules && existingRules.length > 0) {
                          const confirm = window.confirm(
                            `A clínica "${targetClinic?.name}" já possui ${existingRules.length} regra(s) de preço. ` +
                            `Copiar as regras da clínica "${sourceClinic?.name}" ` +
                            `vai adicionar ${sourceRules.length} nova(s) regra(s). Deseja continuar?`
                          );
                          if (!confirm) return;
                        }

                        // Copia as regras, alterando apenas o clinic_id
                        const rulesToInsert = sourceRules.map(rule => ({
                          clinic_id: copyToClinicId,
                          modality: rule.modality,
                          period: rule.period,
                          label: rule.label,
                          period_label: rule.period_label,
                          valor: rule.valor,
                          repasse_professional: rule.repasse_professional,
                          repasse_clinic: rule.repasse_clinic,
                          taxa_extra: rule.taxa_extra || 0,
                          taxa_extra_professional: rule.taxa_extra_professional || 0,
                          taxa_extra_clinic: rule.taxa_extra_clinic || 0,
                          observacoes: rule.observacoes || ''
                        }));

                        const { error } = await supabase
                          .from('price_rules')
                          .insert(rulesToInsert);

                        if (error) throw error;

                        alert(`✅ ${rulesToInsert.length} regra(s) de preço copiada(s) de "${sourceClinic?.name}" para "${targetClinic?.name}" com sucesso!`);
                        setCopyFromClinicId('');
                        setCopyToClinicId('');
                        await fetchData();
                        setIsPriceModalOpen(false);
                      } catch (error: any) {
                        console.error("Erro ao copiar preços:", error);
                        alert(`Erro ao copiar preços: ${error.message || 'Erro desconhecido'}`);
                      }
                    }}
                    className="w-full bg-teal-600 text-white px-4 py-3 rounded-lg text-sm font-bold hover:bg-teal-700 transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2"
                  >
                    <Copy className="w-4 h-4" />
                    Copiar Tabela de Preços
                  </button>
                )}
              </div>
            </div>
          )}
          
          {loggedUserEntity?.type === 'clinic' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              <div className="flex items-start gap-2">
                <Building2 className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium">Tabela de Preços da Clínica</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Esta regra de preço será aplicada para exames realizados nesta clínica.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Modalidade</label>
              <select 
                value={priceForm.modality} 
                onChange={e => {
                  const val = e.target.value;
                  setPriceForm({...priceForm, modality: val});
                  if (val !== 'OUTROS') setCustomModalityName('');
                }} 
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="USG">Ultrassom</option>
                <option value="RX">Raio-X</option>
                <option value="RX_CONTROLE">Raio-X Controle</option>
                <option value="USG_FAST">Ultrassom FAST</option>
                <option value="OUTROS">Outro (Novo Exame)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Período</label>
              <select value={priceForm.period} onChange={e => setPriceForm({...priceForm, period: e.target.value as any})} className="w-full px-3 py-2 border rounded-lg">
                <option value="comercial">Comercial</option>
                <option value="noturno">Noturno</option>
                <option value="fds">Fim de Semana</option>
                <option value="feriado">Feriado</option>
              </select>
            </div>
          </div>

          {priceForm.modality === 'OUTROS' && (
            <div className="animate-fade-in bg-petcare-light/5 p-3 rounded-lg border border-petcare-light/20">
              <label className="block text-xs font-bold text-petcare-dark mb-1 flex items-center gap-1">
                <PenTool className="w-3 h-3" />
                Nome do Exame Personalizado
              </label>
              <input 
                type="text" 
                value={customModalityName} 
                onChange={(e) => setCustomModalityName(e.target.value)} 
                className="w-full px-3 py-2 border border-petcare-light/30 rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT text-sm font-medium"
                placeholder="Ex: Ecocardiograma"
                required
                autoFocus
              />
            </div>
          )}
          
          <div className="border-t border-gray-100 pt-4 mt-2">
            <h4 className="text-sm font-bold text-gray-800 mb-3">Valores do Serviço</h4>
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Valor Base (Cobrado do Cliente)</label>
              <input type="number" step="0.01" value={priceForm.valor} onChange={e => setPriceForm({...priceForm, valor: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg font-bold" />
            </div>

            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg mt-2">
              <div>
                <label className="block text-xs font-bold text-blue-600 mb-1">Repasse Profissional</label>
                <input type="number" step="0.01" value={priceForm.repasseProfessional} onChange={e => setPriceForm({...priceForm, repasseProfessional: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg" />
              </div>
              <div>
                <label className="block text-xs font-bold text-purple-600 mb-1">Repasse Clínica</label>
                <input type="number" step="0.01" value={priceForm.repasseClinic} onChange={e => setPriceForm({...priceForm, repasseClinic: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg" />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 mt-2">
            <h4 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-petcare-DEFAULT" />
              Taxa de Uso de Equipamento (Opcional)
            </h4>
            
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Valor da Taxa Extra</label>
              <input 
                type="number" 
                step="0.01" 
                value={priceForm.taxaExtra} 
                onChange={e => {
                  const val = Number(e.target.value);
                  setPriceForm({
                    ...priceForm, 
                    taxaExtra: val,
                    taxaExtraProfessional: val, 
                    taxaExtraClinic: 0
                  });
                }} 
                className="w-full px-3 py-2 border rounded-lg" 
                placeholder="0.00"
              />
              <p className="text-[10px] text-gray-400 mt-1">Adicionado ao valor final do exame.</p>
            </div>

            {Number(priceForm.taxaExtra) > 0 && (
              <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-lg mt-2 animate-fade-in">
                <div>
                  <label className="block text-xs font-bold text-blue-600 mb-1">Taxa p/ Profissional</label>
                  <input type="number" step="0.01" value={priceForm.taxaExtraProfessional} onChange={e => setPriceForm({...priceForm, taxaExtraProfessional: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-purple-600 mb-1">Taxa p/ Clínica</label>
                  <input type="number" step="0.01" value={priceForm.taxaExtraClinic} onChange={e => setPriceForm({...priceForm, taxaExtraClinic: Number(e.target.value)})} className="w-full px-3 py-2 border rounded-lg" />
                </div>
              </div>
            )}
          </div>
          
          <div className="bg-petcare-light/10 p-3 rounded-lg mt-4 flex justify-between items-center">
             <span className="text-sm font-bold text-gray-700">Preço Final ao Cliente:</span>
             <span className="text-xl font-bold text-petcare-dark">
               {formatMoney((Number(priceForm.valor) || 0) + (Number(priceForm.taxaExtra) || 0))}
             </span>
          </div>

          <button type="submit" className="w-full bg-petcare-dark text-white py-3 rounded-lg font-bold hover:bg-petcare-DEFAULT transition-colors">Salvar Regra de Preço</button>
        </form>
      </Modal>

      <ConfirmationModal
        isOpen={confirmationState.isOpen}
        onClose={() => setConfirmationState({ ...confirmationState, isOpen: false })}
        onConfirm={() => {
          if (confirmationState.type === 'exam' && confirmationState.id) handleDeleteExam(confirmationState.id);
          if (confirmationState.type === 'price' && confirmationState.id) handleDeletePrice(confirmationState.id);
        }}
        title={confirmationState.title}
        message={confirmationState.message}
        variant="danger"
        requirePassword={confirmationState.requirePassword}
      />
    </div>
  );
};
