import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User, UserRole, UserPermissions } from '../types';
import { Modal } from '../components/Modal';
import { ConfirmationModal } from '../components/ConfirmationModal';
import { supabase } from '../lib/supabase';
import { 
  Building2, Stethoscope, Plus, Trash2, Search, Shield, Mail, Lock, Edit2, AlertCircle, CheckCircle, XCircle, Link as LinkIcon, UserCheck,
  DollarSign, Tag, FileText, Users, Settings, CheckSquare, Ban, Eraser, AlertTriangle, Loader2
} from 'lucide-react';

export const AdminTenants = () => {
  const { users, user: currentUser, register, updateUser, updateAccount, deleteUser, getDefaultPermissions, refreshUsers } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Estado para a ferramenta de limpeza manual
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [cleanupEmail, setCleanupEmail] = useState('');
  const [cleanupStatus, setCleanupStatus] = useState<{ type: 'success' | 'error' | 'loading', msg: string } | null>(null);

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const [editingUser, setEditingUser] = useState<User | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    type: 'clinic' as 'clinic' | 'vet'
  });

  const [permissions, setPermissions] = useState<UserPermissions>(getDefaultPermissions(4));

  const tenantUsers = users.filter(u => 
    (u.level === 1 || u.level === 3 || u.level === 4) &&
    (u.name.toLowerCase().includes(searchTerm.toLowerCase()) || u.email.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Retorna as conexões de parceria para exibição ao superusuário
  const getPartnershipInfo = (targetUser: User) => {
    const labels: string[] = [];
    let type: 'direct' | 'partner' | null = null;
    let ownerName: string | undefined;

    // 1. owner_id: usuário convidado/vinculado a outro assinante
    if (targetUser.ownerId && targetUser.ownerId !== targetUser.id) {
      if (targetUser.ownerId === currentUser?.id) {
        labels.push('Assinante Direto');
        type = 'direct';
        ownerName = 'Admin';
      } else {
        const owner = users.find(u => u.id === targetUser.ownerId);
        if (owner) {
          labels.push(`Parceiro de: ${owner.name}`);
          type = 'partner';
          ownerName = owner.name;
        } else {
          labels.push('Parceiro Vinculado');
          type = 'partner';
        }
      }
    }

    // 2. partners: parcerias bidirecionais (vet↔clínica)
    const partnerIds = targetUser.partners && Array.isArray(targetUser.partners) ? targetUser.partners : [];
    const uniquePartnerIds = [...new Set(partnerIds)]; // evita duplicatas no array
    const partnerNames = uniquePartnerIds
      .map((pid: string) => users.find(u => u.id === pid)?.name)
      .filter(Boolean) as string[];
    const uniquePartnerNames = [...new Set(partnerNames)]; // evita nomes repetidos
    if (uniquePartnerNames.length > 0) {
      const partnerLabel = uniquePartnerNames.length === 1 
        ? `Parceiro de: ${uniquePartnerNames[0]}` 
        : `Parceiros: ${uniquePartnerNames.join(', ')}`;
      if (!labels.includes(partnerLabel)) labels.push(partnerLabel);
      if (!type) type = 'partner';
    }

    // 3. Para clínicas: vets que têm esta clínica como owner ou partner
    if (targetUser.role === 'clinic' && targetUser.level === 4) {
      const linkedVets = users.filter(u => 
        u.role === 'vet' && u.level === 3 && (
          u.ownerId === targetUser.id ||
          (u.partners && Array.isArray(u.partners) && u.partners.includes(targetUser.id))
        )
      );
      if (linkedVets.length > 0) {
        const vetLabel = linkedVets.length === 1 
          ? `Parceiro vinculado: ${linkedVets[0].name}` 
          : `Parceiros vinculados: ${linkedVets.map(v => v.name).join(', ')}`;
        if (!labels.some(l => l.includes(linkedVets[0].name))) labels.push(vetLabel);
        if (!type) type = 'partner';
      }
    }

    if (labels.length === 0) return null;
    return { type: type || 'partner', labels, ownerName };
  };

  const handleTypeChange = (newType: 'clinic' | 'vet') => {
    setFormData(prev => ({ ...prev, type: newType }));
    if (!editingUser) {
      const level = newType === 'clinic' ? 4 : 3;
      setPermissions(getDefaultPermissions(level));
    }
  };

  const handleOpenModal = (userToEdit?: User) => {
    setFormError(null);
    setFormSuccess(null);
    
    if (userToEdit) {
      setEditingUser(userToEdit);
      setFormData({
        name: userToEdit.name,
        email: userToEdit.email,
        password: '', 
        type: userToEdit.role === 'vet' ? 'vet' : 'clinic'
      });
      setPermissions(userToEdit.permissions || getDefaultPermissions(userToEdit.level));
    } else {
      setEditingUser(null);
      setFormData({ name: '', email: '', password: '', type: 'clinic' });
      setPermissions(getDefaultPermissions(4));
    }
    setIsModalOpen(true);
  };

  const togglePermission = (key: keyof UserPermissions) => {
    setPermissions(prev => {
      const newState = { ...prev, [key]: !prev[key] };
      if (key === 'delete_exams') newState.bypass_delete_password = newState.delete_exams;
      return newState;
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError(null);
    setFormSuccess(null);

    const level = formData.type === 'clinic' ? 4 : 3;
    const role: UserRole = formData.type === 'clinic' ? 'clinic' : 'vet';

    const cleanData = {
      name: formData.name.trim(),
      email: formData.email.trim().toLowerCase(),
      password: formData.password
    };

    try {
      if (editingUser) {
        if (editingUser.id === currentUser?.id) {
          const result = await updateAccount({
            name: cleanData.name,
            email: cleanData.email,
            password: cleanData.password || undefined 
          });
          if (result.error) throw new Error(result.error);
        } else {
          await updateUser(editingUser.id, {
            name: cleanData.name,
            level: level,
            role: role,
            permissions: permissions
          });
        }
      } else {
        await register({
          name: cleanData.name,
          username: cleanData.email,
          email: cleanData.email,
          password: cleanData.password,
          level: level,
          role: role,
          permissions: permissions
        });
      }
      
      setFormSuccess("Dados salvos com sucesso!");
      await refreshUsers();
      
      setTimeout(() => {
        setIsModalOpen(false);
        setFormSuccess(null);
      }, 1500);

    } catch (error: any) {
      console.error(error);
      let errorMsg = error.message;
      if (errorMsg.includes("invalid")) errorMsg = "O formato do e-mail é inválido.";
      if (errorMsg.includes("already registered")) errorMsg = "Este e-mail já está em uso.";
      if (errorMsg.includes("Password should be")) errorMsg = "A senha deve ter no mínimo 6 caracteres.";
      
      setFormError(errorMsg);
    } finally {
      setIsSaving(false);
    }
  };

  // FUNÇÃO DE EXCLUSÃO
  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    
    try {
      const result = await deleteUser(deleteConfirm);
      if (result.success) {
        setDeleteConfirm(null);
      } else {
        alert(`Erro ao excluir: ${result.error}`);
      }
    } catch (err) {
      alert("Erro inesperado ao excluir usuário.");
    } finally {
      setIsDeleting(false);
    }
  };

  // FUNÇÃO DE LIMPEZA MANUAL (POR EMAIL)
  const handleManualCleanup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cleanupEmail) return;
    
    setCleanupStatus({ type: 'loading', msg: 'Buscando e excluindo...' });

    try {
      const { data, error } = await supabase.rpc('delete_user_by_email', { 
        target_email: cleanupEmail.trim().toLowerCase() 
      });

      if (error) throw error;

      if (data.success) {
        setCleanupStatus({ type: 'success', msg: data.message });
        setCleanupEmail('');
        await refreshUsers(); // Atualiza a lista caso o usuário estivesse visível
      } else {
        setCleanupStatus({ type: 'error', msg: data.message });
      }
    } catch (err: any) {
      console.error(err);
      setCleanupStatus({ type: 'error', msg: err.message || 'Erro ao executar limpeza.' });
    }
  };

  const isEditingSelf = editingUser && editingUser.id === currentUser?.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-petcare-dark flex items-center">
            <Shield className="mr-3 text-petcare-DEFAULT" />
            Gestão de Assinantes (SaaS)
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Gerencie as Clínicas e Veterinários que utilizam a plataforma.
          </p>
        </div>
        
        <div className="flex gap-2">
          <button 
            onClick={() => { setIsCleanupModalOpen(true); setCleanupStatus(null); setCleanupEmail(''); }}
            className="bg-red-50 text-red-600 border border-red-100 px-4 py-2 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center shadow-sm"
          >
            <Eraser className="w-4 h-4 mr-2" /> Limpeza Manual
          </button>

          <button onClick={() => handleOpenModal()} className="bg-petcare-dark text-white px-4 py-2 rounded-lg font-medium hover:bg-petcare-DEFAULT transition-colors flex items-center shadow-lg">
            <Plus className="w-4 h-4 mr-2" /> Novo Assinante
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar assinante..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT"
            />
          </div>
        </div>

        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Assinante</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Login</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tenantUsers.map((user) => {
              const partnershipInfo = getPartnershipInfo(user);
              const isPartnerManaged = partnershipInfo?.type === 'partner';
              
              return (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className={`h-10 w-10 rounded-full flex items-center justify-center text-white font-bold ${user.level === 1 ? 'bg-purple-500' : user.level === 3 ? 'bg-teal-500' : 'bg-blue-500'}`}>
                      {user.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="ml-4">
                      <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      <div className="text-xs text-gray-500">ID: {user.id.slice(0, 8)}...</div>
                      
                      {partnershipInfo && partnershipInfo.labels.length > 0 && (
                        <div className="mt-1 flex flex-col gap-0.5">
                          {partnershipInfo.labels.map((label, idx) => (
                            <div key={idx} className={`text-[10px] font-medium flex items-center gap-1 ${partnershipInfo.type === 'direct' ? 'text-purple-600' : 'text-amber-600'}`}>
                              {partnershipInfo.type === 'partner' ? <LinkIcon className="w-3 h-3 shrink-0" /> : <UserCheck className="w-3 h-3 shrink-0" />}
                              {label}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {user.level === 1 && <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800 font-bold">Super Admin</span>}
                  {user.level === 3 && <span className="px-2 py-1 text-xs rounded-full bg-teal-100 text-teal-800 font-bold flex items-center w-fit gap-1"><Stethoscope className="w-3 h-3" /> Veterinário</span>}
                  {user.level === 4 && <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-bold flex items-center w-fit gap-1"><Building2 className="w-3 h-3" /> Clínica</span>}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">{user.email}</td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                  {(user.level !== 1 || user.id === currentUser?.id) && (
                    <div className="flex justify-end gap-2 items-center">
                      
                      {isPartnerManaged ? (
                        <div className="flex items-center gap-1 text-gray-400 bg-gray-100 px-2 py-1 rounded text-xs" title={`Este usuário é gerenciado por ${partnershipInfo?.ownerName || 'outro assinante'}`}>
                          <Lock className="w-3 h-3" />
                          <span>Gerenciado pelo Assinante</span>
                        </div>
                      ) : (
                        <>
                          <button onClick={() => handleOpenModal(user)} className="text-blue-400 hover:text-blue-600 p-2 hover:bg-blue-50 rounded-lg transition-colors" title="Editar Assinante">
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {user.level !== 1 && (
                            <button onClick={() => setDeleteConfirm(user.id)} className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors" title="Excluir Conta Completamente">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      {/* MODAL DE LIMPEZA MANUAL */}
      <Modal isOpen={isCleanupModalOpen} onClose={() => setIsCleanupModalOpen(false)} title="Limpeza Manual de Dados">
        <form onSubmit={handleManualCleanup} className="space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p>
                Use esta ferramenta para excluir usuários "fantasmas" ou antigos que não aparecem na listagem principal.
                <br /><br />
                <strong>Atenção:</strong> A exclusão é definitiva e remove todos os dados vinculados (exames, perfil, login).
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail do usuário a excluir</label>
            <div className="relative">
              <Eraser className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="email" 
                required 
                value={cleanupEmail} 
                onChange={e => setCleanupEmail(e.target.value)} 
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                placeholder="ex: antigo@email.com"
              />
            </div>
          </div>

          {cleanupStatus && (
            <div className={`p-3 rounded-lg flex items-center gap-2 text-sm font-medium animate-fade-in ${
              cleanupStatus.type === 'success' ? 'bg-green-50 text-green-700' : 
              cleanupStatus.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {cleanupStatus.type === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-gray-500" />}
              {cleanupStatus.type === 'success' && <CheckCircle className="w-4 h-4" />}
              {cleanupStatus.type === 'error' && <XCircle className="w-4 h-4" />}
              <span>{cleanupStatus.msg}</span>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <button 
              type="button" 
              onClick={() => setIsCleanupModalOpen(false)}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium"
            >
              Cancelar
            </button>
            <button 
              type="submit" 
              disabled={!cleanupEmail || cleanupStatus?.type === 'loading'}
              className="bg-red-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-red-700 transition-colors shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Definitivamente
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingUser ? (isEditingSelf ? "Editar Meus Dados" : "Editar Assinante") : "Novo Assinante"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          {formError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700 animate-fade-in">
              <XCircle className="w-5 h-5 shrink-0" />
              <span>{formError}</span>
            </div>
          )}
          
          {formSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm text-green-700 animate-fade-in">
              <CheckCircle className="w-5 h-5 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          {!isEditingSelf && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Conta</label>
              <div className="grid grid-cols-2 gap-4">
                <div onClick={() => handleTypeChange('clinic')} className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center text-center transition-all ${formData.type === 'clinic' ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-blue-300'}`}>
                  <Building2 className={`w-8 h-8 mb-2 ${formData.type === 'clinic' ? 'text-blue-600' : 'text-gray-400'}`} />
                  <span className={`font-bold ${formData.type === 'clinic' ? 'text-blue-800' : 'text-gray-500'}`}>Clínica</span>
                </div>
                <div onClick={() => handleTypeChange('vet')} className={`cursor-pointer border-2 rounded-xl p-4 flex flex-col items-center text-center transition-all ${formData.type === 'vet' ? 'border-teal-500 bg-teal-50' : 'border-gray-200 hover:border-teal-300'}`}>
                  <Stethoscope className={`w-8 h-8 mb-2 ${formData.type === 'vet' ? 'text-teal-600' : 'text-gray-400'}`} />
                  <span className={`font-bold ${formData.type === 'vet' ? 'text-teal-800' : 'text-gray-500'}`}>Veterinário</span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome do Responsável / Razão Social</label>
            <input type="text" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail de Acesso</label>
            <div className="relative">
              <Mail className={`absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 ${editingUser && !isEditingSelf ? 'text-gray-300' : 'text-gray-400'}`} />
              <input 
                type="email" 
                required 
                disabled={!!editingUser && !isEditingSelf}
                value={formData.email} 
                onChange={e => setFormData({...formData, email: e.target.value})} 
                className={`w-full pl-10 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT ${editingUser && !isEditingSelf ? 'bg-gray-100 text-gray-500 border-gray-200 cursor-not-allowed' : 'border-gray-300'}`}
                placeholder="usuario@email.com" 
              />
            </div>
          </div>

          {(!editingUser || isEditingSelf) && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {isEditingSelf ? "Nova Senha" : "Senha Inicial"}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input 
                  type="text" 
                  required={!editingUser} 
                  value={formData.password} 
                  onChange={e => setFormData({...formData, password: e.target.value})} 
                  className="w-full px-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-petcare-DEFAULT" 
                  placeholder={isEditingSelf ? "Deixe em branco para manter a atual" : "Mínimo 6 caracteres"} 
                />
              </div>
            </div>
          )}

          {!isEditingSelf && (
            <div className="pt-2">
              <label className="block text-sm font-bold text-gray-800 mb-3 pb-2 border-b border-gray-100 flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-petcare-DEFAULT" />
                Módulos Disponíveis
              </label>
              
              <div className="grid grid-cols-1 gap-2 max-h-[200px] overflow-y-auto pr-1">
                <label className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${permissions.edit_reports ? 'bg-teal-50 border-teal-200' : 'bg-white border-gray-200'}`}>
                  <input type="checkbox" checked={permissions.edit_reports} onChange={() => togglePermission('edit_reports')} className="w-4 h-4 text-teal-600 rounded mr-3" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Stethoscope className="w-3.5 h-3.5 text-gray-500" /> Laudos / Prontuários
                    </div>
                  </div>
                </label>

                <label className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${permissions.view_financials ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
                  <input type="checkbox" checked={permissions.view_financials} onChange={() => togglePermission('view_financials')} className="w-4 h-4 text-indigo-600 rounded mr-3" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <DollarSign className="w-3.5 h-3.5 text-gray-500" /> Gestão Financeira
                    </div>
                  </div>
                </label>

                <label className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${permissions.manage_prices ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
                  <input type="checkbox" checked={permissions.manage_prices} onChange={() => togglePermission('manage_prices')} className="w-4 h-4 text-indigo-600 rounded mr-3" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Tag className="w-3.5 h-3.5 text-gray-500" /> Tabela de Preços
                    </div>
                  </div>
                </label>

                <label className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${permissions.export_reports ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
                  <input type="checkbox" checked={permissions.export_reports} onChange={() => togglePermission('export_reports')} className="w-4 h-4 text-indigo-600 rounded mr-3" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <FileText className="w-3.5 h-3.5 text-gray-500" /> Exportar Relatórios
                    </div>
                  </div>
                </label>

                <label className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${permissions.delete_exams ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
                  <input type="checkbox" checked={permissions.delete_exams} onChange={() => togglePermission('delete_exams')} className="w-4 h-4 text-red-600 rounded mr-3" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Trash2 className="w-3.5 h-3.5 text-gray-500" /> Excluir Exames
                    </div>
                  </div>
                </label>

                <label className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${permissions.manage_users ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
                  <input type="checkbox" checked={permissions.manage_users} onChange={() => togglePermission('manage_users')} className="w-4 h-4 text-indigo-600 rounded mr-3" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Users className="w-3.5 h-3.5 text-gray-500" /> Gestão de Equipe
                    </div>
                  </div>
                </label>

                <label className={`flex items-center p-2 rounded-lg border cursor-pointer transition-all ${permissions.manage_settings ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-gray-200'}`}>
                  <input type="checkbox" checked={permissions.manage_settings} onChange={() => togglePermission('manage_settings')} className="w-4 h-4 text-indigo-600 rounded mr-3" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                      <Settings className="w-3.5 h-3.5 text-gray-500" /> Configurações da Empresa
                    </div>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="pt-4">
            <button type="submit" disabled={isSaving} className="w-full bg-petcare-dark text-white py-3 rounded-xl font-bold hover:bg-petcare-DEFAULT transition-colors flex items-center justify-center shadow-lg disabled:opacity-70">
              {isSaving ? 'Salvando...' : (editingUser ? 'Salvar Alterações' : 'Criar Assinatura')}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmationModal 
        isOpen={!!deleteConfirm} 
        onClose={() => setDeleteConfirm(null)} 
        onConfirm={handleConfirmDelete} 
        title="Excluir Assinante Completamente" 
        message="ATENÇÃO: Esta ação é irreversível. Todos os dados do assinante (exames, equipe, configurações) serão apagados permanentemente." 
        variant="danger" 
        requirePassword={true}
      />
    </div>
  );
};
