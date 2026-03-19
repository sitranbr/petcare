import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { Save, Building2, Mail, Phone, MapPin, FileText, Upload, Lock, User, AlertCircle, CheckCircle2, Shield, Loader2 } from 'lucide-react';
import { uploadBase64Image } from '../utils/storage';
import { supabase } from '../lib/supabase';

export const AdminSettings = () => {
  const { user, updateAccount, refreshProfile } = useAuth();
  const { settings, updateSettings } = useSettings();
  
  const [activeTab, setActiveTab] = useState<'profile' | 'company'>('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileForm, setProfileForm] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: ''
  });

  const [companyForm, setCompanyForm] = useState({
    systemName: '',
    clinicName: '',
    document: '',
    phone: '',
    email: '',
    address: '',
    logoUrl: ''
  });

  // Carrega perfil direto do Supabase (profiles) para garantir dados corretos, evitando cache/desatualização
  useEffect(() => {
    if (!user?.id || activeTab !== 'profile') return;
    let isMounted = true;
    const loadProfile = async () => {
      const { data } = await supabase.from('profiles').select('name, email').eq('id', user.id).maybeSingle();
      if (isMounted) {
        setProfileForm(prev => ({
          ...prev,
          name: data?.name ?? user.name ?? '',
          email: data?.email ?? user.email ?? ''
        }));
      }
    };
    loadProfile();
    return () => { isMounted = false; };
  }, [user?.id, activeTab]);

  useEffect(() => {
    setCompanyForm({
      systemName: settings.systemName || 'Petcare',
      clinicName: settings.name || '',
      document: settings.document || '',
      phone: settings.phone || '',
      email: settings.email || '',
      address: settings.address || '',
      logoUrl: settings.logoUrl || ''
    });
  }, [settings]);

  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    if (profileForm.password && profileForm.password !== profileForm.confirmPassword) {
      setMessage({ type: 'error', text: 'As senhas não conferem.' });
      setIsLoading(false);
      return;
    }

    const { error } = await updateAccount({
      name: profileForm.name,
      email: profileForm.email,
      password: profileForm.password || undefined
    });

    if (error) {
      setMessage({ type: 'error', text: error });
    } else {
      setMessage({ type: 'success', text: 'Perfil atualizado com sucesso!' });
      setProfileForm(prev => ({ ...prev, password: '', confirmPassword: '' }));
      await refreshProfile(); // Sincroniza AuthContext com o Supabase
    }
    setIsLoading(false);
  };

  const handleCompanyUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setMessage(null);

    try {
      // 1. Atualiza Contexto Local (Visual Imediato para o usuário)
      const newSettings = {
        name: companyForm.clinicName,
        document: companyForm.document,
        phone: companyForm.phone,
        email: companyForm.email,
        address: companyForm.address,
        logoUrl: companyForm.logoUrl
      };
      updateSettings(newSettings);

      // 2. Persiste no Banco de Dados usando a nova RPC segura
      // A função 'save_company_settings' foi criada na migração para ignorar RLS estrito
      const { error } = await supabase.rpc('save_company_settings', {
        p_name: companyForm.clinicName,
        p_document: companyForm.document,
        p_phone: companyForm.phone,
        p_email: companyForm.email,
        p_address: companyForm.address,
        p_logo_url: companyForm.logoUrl
      });

      if (error) throw error;

      setMessage({ type: 'success', text: 'Dados da empresa salvos com sucesso!' });
    } catch (err: any) {
      console.error(err);
      setMessage({ type: 'error', text: 'Erro ao salvar: ' + (err.message || 'Erro desconhecido') });
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        setIsLoading(true);
        try {
          // Upload para o bucket 'public' que agora está configurado corretamente
          const url = await uploadBase64Image(base64, 'public', `logos/${user?.id}_${Date.now()}`);
          
          if (url) {
            setCompanyForm(prev => ({ ...prev, logoUrl: url }));
            setMessage({ type: 'success', text: 'Logo carregado! Clique em "Salvar Dados" para confirmar.' });
          } else {
            setMessage({ type: 'error', text: 'Erro ao fazer upload da imagem. Tente novamente.' });
          }
        } catch (err: any) {
          console.error("Erro no upload:", err);
          setMessage({ type: 'error', text: 'Erro de conexão ao enviar imagem.' });
        } finally {
          setIsLoading(false);
          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Shield className="w-8 h-8 text-petcare-DEFAULT" />
          Configurações
        </h1>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-1 flex gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('profile')}
          className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
            activeTab === 'profile'
              ? 'bg-petcare-bg text-petcare-dark shadow-sm'
              : 'text-gray-500 hover:bg-gray-50'
          }`}
        >
          <User className="w-4 h-4" />
          Meus Dados
        </button>
        
        {user?.permissions.manage_settings && (
          <button
            onClick={() => setActiveTab('company')}
            className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2 ${
              activeTab === 'company'
                ? 'bg-petcare-bg text-petcare-dark shadow-sm'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            Dados da Empresa
          </button>
        )}
      </div>

      {message && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-100' : 'bg-red-50 text-red-700 border border-red-100'
        } animate-fade-in shadow-sm`}>
          {message.type === 'success' ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <AlertCircle className="w-5 h-5 shrink-0" />}
          <p className="font-medium text-sm">{message.text}</p>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-petcare-DEFAULT" />
            Informações de Acesso
          </h2>
          
          <form onSubmit={handleProfileUpdate} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Acesso</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={profileForm.email}
                    onChange={e => setProfileForm({ ...profileForm, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all bg-white"
                    required
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">Alterar o e-mail não requer mais confirmação.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={profileForm.password}
                    onChange={e => setProfileForm({ ...profileForm, password: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    placeholder="Deixe em branco para manter"
                    minLength={6}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Nova Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="password"
                    value={profileForm.confirmPassword}
                    onChange={e => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    placeholder="Confirme a nova senha"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={isLoading}
                className="bg-petcare-dark text-white px-6 py-2.5 rounded-lg font-bold hover:bg-petcare-DEFAULT transition-all flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeTab === 'company' && user?.permissions.manage_settings && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 animate-fade-in">
          <h2 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-petcare-DEFAULT" />
            Dados da Empresa (Para Laudos)
          </h2>

          <form onSubmit={handleCompanyUpdate} className="space-y-6">
            <div className="flex items-center gap-6 p-4 bg-gray-50 rounded-xl border border-gray-100">
              <div className="w-24 h-24 bg-white rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden relative group shadow-sm">
                {companyForm.logoUrl ? (
                  <img src={companyForm.logoUrl} alt="Logo" className="w-full h-full object-contain p-2" />
                ) : (
                  <Building2 className="w-8 h-8 text-gray-300" />
                )}
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Upload className="w-6 h-6 text-white" />
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  title="Alterar Logo"
                />
              </div>
              <div className="flex-1">
                <h3 className="font-medium text-gray-900">Logotipo da Clínica / Veterinário</h3>
                <p className="text-sm text-gray-500 mb-3">Recomendado: PNG transparente, 300x300px</p>
                <label className="inline-flex items-center px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer transition-colors shadow-sm hover:shadow">
                  <Upload className="w-4 h-4 mr-2" />
                  Escolher Arquivo
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome Fantasia (Cabeçalho)</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={companyForm.clinicName}
                    onChange={e => setCompanyForm({ ...companyForm, clinicName: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    placeholder={user?.role === 'vet' ? "Ex: Dr. Nome Sobrenome" : "Ex: Clínica Veterinária São Francisco"}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{user?.role === 'vet' ? 'CRMV' : 'CNPJ / CRMV'}</label>
                <div className="relative">
                  <FileText className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={companyForm.document}
                    onChange={e => setCompanyForm({ ...companyForm, document: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    placeholder="Documento para o rodapé"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={companyForm.phone}
                    onChange={e => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Endereço Completo</label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="text"
                    value={companyForm.address}
                    onChange={e => setCompanyForm({ ...companyForm, address: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    placeholder="Rua, Número, Bairro, Cidade - UF"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Contato (Público)</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={e => setCompanyForm({ ...companyForm, email: e.target.value })}
                    className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-light/50 outline-none transition-all"
                    placeholder="contato@clinica.com.br"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t border-gray-100">
              <button
                type="submit"
                disabled={isLoading}
                className="bg-petcare-dark text-white px-6 py-2.5 rounded-lg font-bold hover:bg-petcare-DEFAULT transition-all flex items-center gap-2 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Salvar Dados da Empresa
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
