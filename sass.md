# Arquitetura SaaS - Petcare

Este documento descreve a arquitetura técnica do modelo **Software as a Service (SaaS)** implementado no Petcare, focando no isolamento de dados (Multi-tenancy) e na lógica de compartilhamento entre parceiros.

**Última atualização:** Fevereiro 2025

---

## 1. Modelo de Dados Hierárquico

O sistema utiliza uma abordagem híbrida de multi-tenancy, onde a identidade (Login) é separada do contexto de trabalho (Tenant).

### Entidades Principais
1.  **Auth Users (`auth.users`):** Identidade única global (E-mail/Senha) gerenciada pelo Supabase Auth.
2.  **Profiles (`public.profiles`):** Dados públicos do usuário, nível de acesso e permissões modulares.
   - Campos principais: `id`, `email`, `name`, `role`, `level`, `owner_id`, `permissions`, `partners[]`
   - A coluna `partners` é um array de texto (`text[]`) que armazena os IDs dos parceiros vinculados.
3.  **Tenants (`veterinarians` / `clinics`):** As entidades de negócio que possuem dados (Exames, Preços, Configurações).
   - Cada tenant possui um `profile_id` que vincula ao usuário de login.
   - Armazena dados de branding (logo, nome, contatos) para White Label.

### Níveis de Acesso (Hierarquia)
- **Nível 1:** Super Admin (acesso global)
- **Nível 2:** Owner (proprietário do tenant - não utilizado atualmente)
- **Nível 3:** Veterinário (tenant independente ou parceiro)
- **Nível 4:** Clínica (tenant independente ou parceiro)
- **Nível 5:** Recepção/Equipe (membro interno com `owner_id`)

### Relacionamento
*   Um **Usuário** pode ser dono de um **Tenant** (ex: Dr. João é dono do seu perfil de Veterinário).
*   Um **Usuário** pode ser membro da equipe de um **Tenant** (ex: Maria é recepcionista da Clínica Univet, com `owner_id` apontando para a clínica).
*   Um **Tenant** pode ter parceria com outro **Tenant** através do array `partners` na tabela `profiles`.
*   Um **Usuário Convidado** (Guest) possui `owner_id` diferente do próprio `id`, herdando configurações do criador.

---

## 2. Estratégia de Vínculo de Parceiros (Smart Linking)

Um dos maiores desafios em sistemas B2B veterinários é gerenciar a relação entre Clínicas e Veterinários Volantes sem duplicar cadastros. O Petcare resolve isso com a seguinte lógica:

### O Problema da Duplicidade
Em sistemas tradicionais, a Clínica A cadastra o "Dr. João" e a Clínica B também cadastra o "Dr. João". Isso cria dois logins diferentes para a mesma pessoa, fragmentando o histórico.

### A Solução Petcare
Utilizamos a coluna `partners` (array de texto) na tabela `profiles` para criar vínculos bidirecionais entre parceiros.

#### Fluxo de Vínculo

1.  **Busca Prévia (`findPartnerByEmail`):**
    *   O sistema primeiro busca o e-mail nas tabelas `profiles`, `veterinarians` e `clinics`.
    *   Retorna informações se o usuário já existe (nome, role, id).

2.  **Vínculo via RPC (`link_partner_by_email`):**
    *   Função `SECURITY DEFINER` que bypassa RLS para executar o vínculo.
    *   **Validações implementadas:**
      - Verifica se o usuário existe (retorna erro se não encontrado).
      - Impede auto-vínculo (não permite vincular a si mesmo).
      - Impede duplicidade (verifica se já está na lista de `partners`).
    *   **Vínculo Mútuo:**
      - Adiciona o ID do alvo no array `partners` do solicitante.
      - Adiciona o ID do solicitante no array `partners` do alvo.
      - Garante que ambos os perfis se vejam mutuamente.

3.  **Desvincular Parceiro (`unlinkPartner`):**
    *   Remove o ID do parceiro do array `partners` do usuário atual.
    *   Remove o ID do usuário atual do array `partners` do parceiro (vínculo reverso).
    *   Mantém a consistência bidirecional.

4.  **Acesso Convidado (Fallback):**
    *   Apenas se o usuário **não** existir, o sistema permite criar uma conta "Convidada" (Guest).
    *   Essa conta nasce com `owner_id` apontando para o criador.
    *   Pode ser "emancipada" futuramente se o usuário decidir assinar a plataforma (removendo o `owner_id`).

---

## 3. Segurança e Isolamento (RLS)

O isolamento de dados é garantido por **Row Level Security (RLS)** no PostgreSQL/Supabase.

### Políticas de Acesso (Policies)

#### 1. Visualização de Exames
Um usuário pode ver um exame SE:
*   Ele é o **Veterinário Responsável** (`veterinarian_id = auth.uid()`).
*   OU Ele é a **Clínica Proprietária** (`clinic_id = auth.uid()`).
*   OU Ele é **Membro da Equipe** do dono do exame (verificado via `owner_id`).
*   OU Ele é **Parceiro** do veterinário ou clínica responsável (verificado via array `partners`).

#### 2. Visualização de Parceiros (Política RLS)
Política implementada: `"Users can view partners profiles"`

Um usuário pode ver os dados de outro usuário (Nome, CRMV, Role) SE:
*   É o seu próprio perfil (`id = auth.uid()`).
*   OU O ID do usuário atual está na lista `partners` do perfil alvo (`partners @> ARRAY[auth.uid()::text]`).
*   Isso permite preencher dropdowns e listas sem expor a base inteira de usuários.
*   Garante visibilidade mútua: se A pode ver B, então B pode ver A.

#### 3. Gestão de Equipe
O sistema diferencia três tipos de usuários na lista de equipe:
*   **Membros Internos:** Usuários criados pelo tenant atual (`owner_id = tenant_id`).
*   **Parceiros Vinculados:** Usuários que estão no array `partners` do perfil atual.
*   **Parceiros Convidados:** Usuários com `owner_id` apontando para o tenant atual, mas que são parceiros externos.

### Funções de Segurança (SECURITY DEFINER)

Para evitar loops infinitos em políticas RLS complexas e garantir operações seguras, utilizamos funções `SECURITY DEFINER` com `search_path` protegido:

1.  **`link_partner_by_email`:** 
    *   Executa vínculo de parceiros bypassando RLS.
    *   Valida duplicidade, auto-vínculo e existência do usuário.
    *   Retorna JSON com `success` e `message` ou `name`.

2.  **`get_safe_my_level`:**
    *   Retorna o nível de acesso do usuário atual sem causar recursão em políticas RLS.
    *   Usado em políticas que precisam verificar permissões.

3.  **`delete_user_completely`:**
    *   Remove usuário e todos os dados relacionados (cascata).
    *   Limpa exames, tenants, perfis e vínculos.

### Blindagem de Funções
Todas as funções críticas possuem:
*   `SET search_path = public, auth` para prevenir injeção SQL.
*   Validação de tipos (UUID vs Text) para evitar erros de casting.
*   Tratamento de erros com mensagens claras.

---

## 4. White Label Dinâmico

O sistema adapta a interface e os documentos gerados com base no contexto do usuário logado.

### Carregamento de Configurações (`SettingsContext`)

1.  **Identificação do Tenant:**
    *   Para usuários normais: busca configurações da tabela correspondente (`veterinarians` ou `clinics`) usando `profile_id`.
    *   Para usuários convidados (`owner_id` diferente de `id`): busca as configurações do criador (owner).
    *   Determina a tabela correta baseado no `role` do perfil do criador.

2.  **Dados Carregados:**
    *   Nome da empresa/profissional
    *   Documento (CRMV para veterinários, CNPJ para clínicas)
    *   Endereço, telefone, e-mail
    *   Logo (`logo_url`)
    *   Nome do sistema (`systemName`)

3.  **Aplicação:**
    *   **Frontend:** O `SettingsContext` carrega as configurações e disponibiliza via hook `useSettings()`.
    *   **Relatórios PDF:** O gerador de PDF recebe o objeto de `branding` em tempo real, garantindo que um laudo emitido pelo "Dr. João" saia com o logo dele, mesmo que o exame tenha sido feito na "Clínica A".
    *   **Interface:** Cabeçalho, rodapé e elementos visuais adaptam-se automaticamente.

### Limpeza de Cache
O sistema remove automaticamente configurações antigas do `localStorage` (incluindo referências ao nome antigo "Piquet") para garantir que sempre use dados atualizados do banco.

---

## 5. Sistema de Permissões Modulares

O Petcare implementa um sistema de permissões hierárquico e granular, permitindo controle fino sobre o que cada usuário pode fazer.

### Estrutura de Permissões

As permissões são organizadas em **níveis principais** e **subníveis**:

#### Níveis Principais:
- `edit_reports`: Laudar/Editar exames
- `view_financials`: Ver valores monetários
- `manage_prices`: Editar tabela de preços
- `export_reports`: Gerar relatórios PDF
- `delete_exams`: Excluir exames
- `manage_users`: Criar/Editar usuários
- `manage_settings`: Acessar configurações

#### Subníveis (Opcionais):
Cada nível principal pode ter subníveis específicos (ex: `visualizar_exames`, `editar_resultados`, `criar_exame` dentro de `edit_reports`).

### Permissões Padrão por Nível

- **Nível 1 (Admin):** Acesso total a todas as funcionalidades.
- **Nível 3 (Veterinário):** Pode laudar, ver financeiro, exportar, excluir, gerenciar usuários. Não pode gerenciar preços ou configurações.
- **Nível 4 (Clínica):** Pode ver financeiro, gerenciar preços, exportar, excluir, gerenciar usuários. Não pode laudar ou alterar configurações.
- **Nível 5 (Recepção):** Apenas visualização e exportação básica. Sem acesso a financeiro, laudos ou configurações.

### Permissões de Bypass
- `bypass_report_password`: Gerar relatório sem senha de admin
- `bypass_delete_password`: Excluir exame sem senha de admin

---

## 6. Contexto de Tenant (Tenant Switching)

O sistema permite que usuários com múltiplos vínculos alternem entre diferentes contextos de trabalho.

### Implementação (`AuthContext`)

1.  **Tenant Atual (`currentTenant`):**
    *   Representa o contexto de trabalho atual (Veterinário ou Clínica).
    *   Contém: `id`, `name`, `type` ('vet' | 'clinic'), `isMe` (se é a própria conta ou de um parceiro).

2.  **Tenants Disponíveis (`availableTenants`):**
    *   Lista de todos os tenants que o usuário pode acessar.
    *   Inclui o próprio tenant e parceiros vinculados.

3.  **Carregamento Automático:**
    *   Ao fazer login, o sistema busca o tenant vinculado ao perfil (`profile_id`).
    *   Se não encontrar por `profile_id`, tenta buscar por e-mail e vincula automaticamente.
    *   Define um tenant provisório baseado no perfil do usuário até carregar dados completos.

4.  **Alternância (`switchTenant`):**
    *   Permite alternar entre diferentes tenants disponíveis.
    *   Atualiza o contexto de trabalho e recarrega configurações relacionadas.

---

## 7. Detalhes Técnicos de Implementação

### Estrutura de Dados

#### Tabela `profiles`
```sql
- id: uuid (PK, FK para auth.users)
- email: text
- name: text
- role: text ('admin' | 'vet' | 'clinic' | 'reception')
- level: integer (1-5)
- owner_id: uuid (nullable, FK para profiles.id)
- permissions: jsonb
- partners: text[] (array de UUIDs como texto)
```

#### Tabelas de Tenant
- `veterinarians`: `id`, `profile_id`, `name`, `crmv`, `email`, `logo_url`, `linked_clinic_ids[]`
- `clinics`: `id`, `profile_id`, `name`, `document`, `email`, `logo_url`, `responsible_name`

### Funções RPC Principais

1.  **`link_partner_by_email(target_email, requester_id, requester_type)`**
    - Retorna: `{success: boolean, message?: string, name?: string}`
    - Validações: existência, auto-vínculo, duplicidade
    - Executa vínculo mútuo nos arrays `partners`

2.  **`delete_user_completely(target_user_id)`**
    - Remove usuário e todos os dados relacionados em cascata
    - Limpa exames, tenants, perfis e vínculos

3.  **`update_my_email_bypass(new_email)`**
    - Atualiza e-mail do usuário atual bypassando validações de RLS

### Migrações Recentes

As migrações mais recentes (Fevereiro 2025) focaram em:
- Garantir existência da coluna `partners` com valor padrão `'{}'`
- Corrigir políticas RLS de visibilidade de parceiros
- Implementar validações de duplicidade no vínculo
- Blindar funções críticas com `search_path` protegido
- Corrigir conflitos de tipagem (UUID vs Text)
- Adicionar campos adicionais aos exames (species, requester_vet, requester_crmv)
- Implementar índice de performance para consultas frequentes

---

## 8. Sistema de Exames e Laudos

### Estrutura de Exames

Cada exame contém:
- **Dados do Paciente:** Nome, espécie (Cachorro, Gato, Outros)
- **Dados do Requisitante:** Veterinário que solicitou o exame (nome e CRMV) - essencial para o laudo
- **Vínculos:** Veterinário responsável (executor), Clínica (local), Dono da máquina (para cálculo de repasses)
- **Modalidade:** USG, RX, RX_CONTROLE, USG_FAST, ou exames personalizados
- **Período:** Comercial, Noturno, FDS (Fim de Semana), Feriado
- **Valores Financeiros:** Total, Repasse Profissional, Repasse Clínica
- **Conteúdo:** Laudo (HTML rico), Imagens anexadas, Status (pending, completed, partial)

### Editor de Laudos

- **Editor WYSIWYG:** Formatação rica de texto, tabelas, listas
- **Upload de Imagens:** Múltiplas imagens por exame
- **Layout de PDF:** Grade otimizada (8 imagens por página)
- **White Label:** Cabeçalho e rodapé do PDF usam automaticamente o branding do veterinário responsável

### Cálculo de Repasses

O sistema calcula automaticamente os repasses baseado em:
- **Dono da Máquina:** Se é do profissional ou da clínica
- **Tabela de Preços:** Valores configurados por modalidade e período
- **Taxas Extras:** Configuráveis por regra de preço
- **Split:** Divisão automática entre profissional e clínica

---

## 9. Tabela de Preços Dinâmica

### Características

- **Regras por Clínica:** Cada clínica pode ter sua própria tabela de preços
- **Regras por Parceiro:** Veterinários podem definir preços diferentes para cada clínica parceira
- **Modalidades Personalizadas:** Suporte para exames customizados (ex: Ecocardiograma)
- **Taxas Extras:** Configuração de taxas de uso de equipamento ou deslocamento
- **Períodos:** Diferentes valores para comercial, noturno, fim de semana e feriado

### Estrutura de PriceRule

```typescript
{
  id: string
  clinicId: string  // Vincula a regra a uma clínica específica
  modality: Modality
  period: Period | 'all'
  valor: number
  repasseProfessional: number
  repasseClinic: number
  taxaExtra?: number
  observacoes: string
}
```

---

## 10. Considerações de Segurança e Performance

### Segurança

- **RLS em todas as tabelas:** Garantia de isolamento de dados no nível do banco
- **Funções blindadas:** Todas as operações críticas usam `SECURITY DEFINER` com `search_path` protegido
- **Validação de tipos:** Prevenção de erros de casting (UUID vs Text)
- **Prevenção de duplicidade:** Validações no vínculo de parceiros e criação de usuários

### Performance

- **Índices:** Criados em colunas frequentemente consultadas (email, profile_id, owner_id)
- **Queries otimizadas:** Uso de `maybeSingle()` para evitar carregamento desnecessário
- **Cache inteligente:** Limpeza automática de cache antigo no localStorage
- **Lazy loading:** Carregamento sob demanda de dados de tenant e configurações

---

## 11. Fluxo de Autenticação e Sessão

### Inicialização

1. **Verificação de Sessão:** Sistema verifica se há sessão ativa no Supabase Auth
2. **Criação de Usuário Temporário:** Cria objeto User baseado em `user_metadata` da sessão
3. **Tenant Provisório:** Define tenant provisório baseado no perfil do usuário
4. **Hidratação Completa:** Busca dados completos do perfil na tabela `profiles`
5. **Carregamento de Tenants:** Busca tenant vinculado e parceiros disponíveis

### Gerenciamento de Estado

- **AuthContext:** Gerencia estado de autenticação, usuários e tenants
- **SettingsContext:** Gerencia configurações de branding (White Label)
- **RegistryContext:** Gerencia cadastros de veterinários e clínicas
- **Sincronização:** Estados sincronizados via hooks React e atualizações em tempo real

### Tratamento de Erros

- **Modo Offline:** Sistema detecta erros de conexão e ativa modo limitado
- **Refresh Token:** Tratamento automático de expiração de tokens
- **Mensagens Claras:** Erros retornam mensagens descritivas para o usuário
