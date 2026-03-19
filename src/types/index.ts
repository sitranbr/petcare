export type UserRole = 'admin' | 'owner' | 'vet' | 'clinic' | 'reception';

// Permissões hierárquicas - Níveis principais
export interface UserPermissions {
  // Veterinário / Laudos
  edit_reports: boolean;         // Nível principal: Laudar/Editar exames
  // Subníveis de edit_reports
  visualizar_exames?: boolean;    // Visualizar exames e laudos existentes
  editar_resultados?: boolean;    // Editar resultados e anexar imagens
  criar_exame?: boolean;          // Cadastrar novos exames personalizados
  duplicar_exame?: boolean;       // Duplicar/excluir exames anteriores como modelo
  gerar_pdf_exame?: boolean;      // Gerar e baixar o PDF do exame/laudo
  aprovar_laudo?: boolean;         // Marcar exames como "Laudado" ou "Aprovado"
  
  // Financeiro
  view_financials: boolean;      // Nível principal: Ver valores monetários
  // Subníveis de view_financials
  visualizar_valores?: boolean;   // Ver valores de exames
  visualizar_totais?: boolean;    // Ver totais arrecadados
  visualizar_repasses?: boolean;  // Ver repasses profissionais e clínicas
  visualizar_relatorios_financeiros?: boolean; // Ver relatórios financeiros
  
  // Tabela de Preços
  manage_prices: boolean;        // Nível principal: Editar tabela de preços
  // Subníveis de manage_prices
  visualizar_precos?: boolean;    // Visualizar tabela de preços
  criar_regra_preco?: boolean;    // Criar novas regras de preço
  editar_regra_preco?: boolean;  // Editar regras existentes
  excluir_regra_preco?: boolean; // Excluir regras de preço
  copiar_tabela_precos?: boolean; // Copiar tabelas entre clínicas parceiras
  filtrar_por_clinica?: boolean; // Filtrar preços por clínica
  
  // Relatórios e Exportação
  export_reports: boolean;       // Nível principal: Gerar relatórios PDF
  // Subníveis de export_reports
  gerar_pdf_relatorio?: boolean;  // Gerar relatórios em PDF
  exportar_dados_exames?: boolean; // Exportar dados de exames
  visualizar_estatisticas?: boolean; // Visualizar estatísticas financeiras
  
  // Excluir Exames
  delete_exams: boolean;         // Nível principal: Excluir exames
  // Subníveis de delete_exams
  excluir_exame_proprio?: boolean; // Excluir exames próprios
  excluir_exame_outros?: boolean;   // Excluir exames de outros usuários
  
  // Gestão de Equipe e Parceiros
  manage_users: boolean;         // Nível principal: Criar/Editar usuários
  // Subníveis de manage_users
  visualizar_equipe?: boolean;    // Visualizar lista de membros
  criar_membro_interno?: boolean; // Criar membros internos
  editar_membro?: boolean;        // Editar informações de membros
  remover_acesso?: boolean;       // Remover acesso de membros
  vincular_parceiro?: boolean;    // Vincular parceiros
  desvincular_parceiro?: boolean; // Desvincular parceiros
  
  // Dados da Empresa
  manage_settings: boolean;      // Nível principal: Acessar configurações
  // Subníveis de manage_settings
  editar_informacoes?: boolean;  // Editar informações da clínica/veterinário
  editar_logo?: boolean;         // Editar logo
  editar_contatos?: boolean;     // Editar contatos
  configuracao_geral?: boolean;  // Configurações gerais do sistema
  
  // Permissões de bypass (mantidas para compatibilidade)
  bypass_report_password: boolean; // Gerar relatório sem senha de admin
  bypass_delete_password: boolean; // Excluir exame sem senha de admin
}

export interface User {
  id: string;
  name: string;
  username: string;
  password?: string;
  email: string;
  role: UserRole;
  level: number; // 1: Admin, 2: Owner, 3: Vet, 4: Clinic, 5: Reception
  ownerId?: string | null; // ID do "Chefe" (Se for recepção, aponta para o Vet ou Clínica)
  partners?: string[] | null; // IDs dos perfis parceiros (clínicas para vet, vets para clínica)
  permissions: UserPermissions;
}

// Interface para o Seletor de Contexto (Tenant)
export interface TenantContext {
  id: string;
  name: string;
  type: 'vet' | 'clinic';
  isMe: boolean; // Se é a minha própria conta ou de um parceiro
}

// Interface auxiliar para dados de marca/contato
export interface BrandingInfo {
  name: string;
  document?: string; // CRMV ou CNPJ
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  logoUrl?: string;
}

export interface ClinicSettings extends BrandingInfo {
  // Configurações APENAS do Sistema (Layout, comportamento)
  layoutMode?: 'top' | 'sidebar';
  // Fallback para o cabeçalho do site (não dos relatórios)
  systemName: string; 
}

export interface Veterinarian extends BrandingInfo {
  id: string;
  crmv: string; // Mapeia para document
  isDefault?: boolean;
  linkedClinicIds?: string[]; // IDs das clínicas onde o vet atende
  profileId?: string | null; // ID do usuário de login vinculado
}

export interface Clinic extends BrandingInfo {
  id: string;
  isDefault?: boolean;
  profileId?: string | null; // ID do usuário de login vinculado
  responsibleName?: string; // Nome do responsável/gestor
}

// -----------------------

export type Modality = 'USG' | 'RX' | 'RX_CONTROLE' | 'USG_FAST' | string;
export type Period = 'comercial' | 'noturno' | 'fds' | 'feriado';
export type MachineOwner = 'professional' | 'clinic'; 

export interface RxStudy {
  id: string;
  type: string;
  customDescription: string;
  reportContent?: string;
  reportImages?: string[];
  status?: 'pending' | 'completed';
}

export interface ExamItem {
  id: string;
  modality: Modality | '';
  studies: number;
  studyDescription?: string;
  rxStudies?: RxStudy[];
}

export interface Exam {
  id: string;
  date: string;
  petName: string;
  species?: string; // Nova coluna
  requesterVet?: string; // Nova coluna
  requesterCrmv?: string; // Nova coluna
  
  modality: Modality;
  period: Period;
  studies?: number;
  studyDescription?: string;
  rxStudies?: RxStudy[];
  
  veterinarianId: string;
  clinicId: string;
  machineOwner: MachineOwner;

  totalValue: number;
  repasseProfessional: number;
  repasseClinic: number;

  createdAt: string;
  reportContent?: string;
  reportImages?: string[]; 
  status?: 'pending' | 'completed' | 'partial';
}

export interface PriceRule {
  id: string;
  clinicId: string; // Vincula a regra a uma clínica específica
  modality: Modality;
  period: Period | 'all';
  label: string;
  periodLabel: string;
  valor: number;
  repasseProfessional: number;
  repasseClinic: number;
  taxaExtra?: number;
  taxaExtraProfessional?: number;
  taxaExtraClinic?: number;
  observacoes: string;
}
