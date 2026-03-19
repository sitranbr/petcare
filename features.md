# Funcionalidades do Sistema Petcare

O **Petcare** é uma plataforma SaaS completa para gestão de clínicas veterinárias e radiologistas volantes. Abaixo estão detalhadas as principais funcionalidades do sistema.

## Tabelas do Sistema

| Tabela | Descrição |
|--------|-----------|
| **profiles** | Perfis de usuário vinculados ao Auth. Campos: id, email, name, role, level, permissions, owner_id, partners, created_at, updated_at. |
| **veterinarians** | Cadastro de veterinários. Campos: id, name, crmv, document, address, phone, email, logo_url, is_default, linked_clinic_ids, profile_id, created_at. |
| **clinics** | Cadastro de clínicas. Campos: id, name, document, address, phone, email, logo_url, is_default, profile_id, responsible_name, created_at. |
| **price_rules** | Regras de preço por clínica/modalidade/período. Campos: id, clinic_id, modality, period, label, period_label, valor, repasse_professional, repasse_clinic, taxa_extra, taxa_extra_professional, taxa_extra_clinic, observacoes, created_at. |
| **exams** | Exames realizados. Campos: id, date, pet_name, modality, period, studies, study_description, rx_studies, veterinarian_id, clinic_id, machine_owner, total_value, repasse_professional, repasse_clinic, status, report_content, report_images, requester_vet, requester_crmv, species, created_at. |

**Tabelas do Supabase (não customizadas):**
- **auth.users** — Usuários de autenticação (Supabase Auth)
- **storage.buckets** — Buckets de armazenamento (logos, imagens de laudos)

## 1. Gestão Operacional (Dashboard)

### Cadastro de Exames
- **Dados Completos:** Registro de Data, Paciente, **Espécie** (Cachorro, Gato, Outros com descrição customizada), Tutor e Modalidade.
- **Exames Múltiplos:** Formulário permite cadastrar vários itens de exame em uma única operação (USG, RX, USG FAST, RX Controle, Outros).
- **RX com Múltiplos Estudos:** Para modalidade RX, suporte a número de estudos e multiplicador de preço no cálculo.
- **RX Studies Avançado:** Cada estudo RX pode ter sub-itens (tipo, descrição customizada) com laudos individuais por estudo.
- **Vínculo Profissional:** Seleção de Veterinário Responsável (Executor) e Clínica (Local).
- **Requisitante Externo:** Campo específico para informar o Veterinário que solicitou o exame (com CRMV), essencial para o laudo.
- **Dono da Máquina:** Lógica financeira inteligente que calcula repasses baseando-se em quem é o dono do equipamento (Clínica ou Profissional Volante).
- **Prévia Financeira:** Preview em tempo real do total, repasse profissional e repasse clínica antes de salvar.

### Editor de Laudos Avançado
- **Editor Rico (WYSIWYG):** Formatação de texto (negrito, itálico, sublinhado), tabelas, listas, alinhamento e estilos personalizados.
- **Imagens:** Upload de múltiplas imagens para o laudo.
- **Laudos por Estudo RX:** Para exames RX com múltiplos estudos, cada estudo pode ter seu próprio laudo e imagens.
- **Layout Inteligente:** Geração de PDF com layout otimizado (grade de 8 imagens por página).
- **White Label:** O cabeçalho e rodapé do laudo utilizam automaticamente o **Logo e Dados da Empresa** do usuário logado (seja Clínica ou Veterinário).
- **Responsável no Laudo:** O nome do veterinário responsável (executor) aparece no PDF do exame.

### Tabela de Preços Dinâmica
- **Regras por Parceiro:** Veterinários podem definir preços diferentes para cada Clínica parceira.
- **Filtro por Clínica:** Visualização e filtragem da tabela de preços por clínica parceira.
- **Taxas Extras:** Configuração de taxas de uso de equipamento ou deslocamento (taxa extra profissional e clínica).
- **Exames Personalizados:** Opção de cadastrar modalidades "Outros" com nomes customizados (ex: Ecocardiograma).
- **Copiar Tabela entre Clínicas:** Funcionalidade para copiar todas as regras de preços de uma clínica parceira para outra, economizando tempo na configuração.

---

## 2. Gestão Financeira

### Controle de Caixa
- **Resumo em Tempo Real:** Cards no topo do dashboard mostram Faturamento Total, A Receber e A Pagar.
- **Split de Pagamentos:** Cálculo automático de:
  - **Repasse Profissional:** Quanto o vet ganha pelo serviço.
  - **Repasse Clínica:** Quanto a clínica ganha pelo espaço/indicação.
- **Relatórios:** Exportação de relatórios financeiros em PDF com filtros por data.
- **Resumo por Máquina:** Separação entre máquina do profissional (total arrecadado e a pagar à clínica) e máquina da clínica (total e repasse ao profissional).
- **Gráficos:** Distribuição por modalidade (ECharts) e estatísticas visuais no painel de relatórios.

---

## 3. Arquitetura SaaS e Multi-tenant

### Gestão de Equipe e Acessos
- **Perfis de Acesso:**
  - **Super Admin:** Gestão global do sistema (painel de assinantes).
  - **Assinante (Clínica/Vet):** Gestão total do seu tenant.
  - **Equipe (Recepção/Admin):** Acesso restrito configurável.
- **Permissões Modulares e Granulares:** O assinante define exatamente o que cada membro pode fazer, com subníveis:
  - **Laudos:** `visualizar_exames`, `editar_resultados`, `criar_exame`, `duplicar_exame`, `gerar_pdf_exame`, `aprovar_laudo`
  - **Financeiro:** `visualizar_valores`, `visualizar_totais`, `visualizar_repasses`, `visualizar_relatorios_financeiros`
  - **Preços:** `visualizar_precos`, `criar_regra_preco`, `editar_regra_preco`, `excluir_regra_preco`, `copiar_tabela_precos`, `filtrar_por_clinica`
  - **Relatórios:** `gerar_pdf_relatorio`, `exportar_dados_exames`, `visualizar_estatisticas`
  - **Exclusão:** `excluir_exame_proprio`, `excluir_exame_outros`
  - **Equipe:** `visualizar_equipe`, `criar_membro_interno`, `editar_membro`, `remover_acesso`, `vincular_parceiro`, `desvincular_parceiro`
  - **Configurações:** `editar_informacoes`, `editar_logo`, `editar_contatos`
- **Níveis de Acesso Pré-definidos:** Básico, Operacional, etc., para facilitar a configuração.

### Rede de Parceiros (Partner Network)
- **Vínculo Inteligente:** Conexão entre Clínicas e Veterinários existentes sem duplicidade de login.
- **Busca por E-mail:** Vincular parceiro por e-mail com busca e validação de duplicidade.
- **Desvincular Parceiro:** Remoção de vínculos com confirmação.
- **Acesso Convidado:** Criação de contas restritas para parceiros que ainda não possuem assinatura própria.
- **Clínicas Convidadas:** Veterinários podem criar clínicas convidadas (ownerId) para expandir a rede.
- **Visibilidade Segura:** Um parceiro acessa o painel da clínica mas visualiza **apenas os exames vinculados a ele**.

### Esclarecimento das Vinculações

| Conceito | O que é | Como funciona |
|----------|---------|---------------|
| **Vínculo Profissional (no exame)** | Relação entre Veterinário Executor e Clínica Local em cada exame | Todo exame registra `veterinarian_id` (quem executou) e `clinic_id` (onde foi feito). O vet e a clínica precisam estar vinculados como parceiros para aparecer nas opções do formulário. |
| **Parceiro (linked_clinic_ids)** | Lista de clínicas onde o veterinário está autorizado a atender | Armazenada no vet: `veterinarians.linked_clinic_ids`. Quando a **clínica** convida o vet por e-mail, o ID da clínica é adicionado a esse array. Quando o **vet** convida a clínica, idem. É uma relação bidirecional: o vet pode criar exames nessas clínicas. |
| **Quem convida** | Clínica ou Veterinário pode iniciar o vínculo | **Clínica convida vet:** usa "Vincular Parceiro" → busca por e-mail → adiciona a clínica ao `linked_clinic_ids` do vet. **Vet convida clínica:** mesmo fluxo, adiciona a clínica ao seu próprio `linked_clinic_ids`. |
| **Acesso Convidado** | Conta criada pelo assinante para alguém sem assinatura | O assinante (clínica ou vet) cria um usuário com `owner_id` apontando para si. Esse usuário acessa o sistema com permissões restritas, operando no contexto do dono. |
| **Clínicas Convidadas** | Clínicas criadas pelo veterinário para expandir a rede | O vet cadastra uma clínica "convidada" (ex.: clínica que ainda não tem conta no sistema). A clínica fica em `linked_clinic_ids` e o vet pode lançar exames nela. |
| **Seletor de Contexto** | Alternar entre "Meu Sistema" e parceiros | Vet com várias clínicas vinculadas vê: "Meu Sistema" + lista de clínicas. Ao escolher uma clínica, opera no contexto dela (dashboard, exames, preços daquela clínica). A clínica atual sempre aparece no formulário de exames para o vet parceiro. |

**Fluxo resumido:** Clínica Univet convida vet Heculano por e-mail → `linked_clinic_ids` do Heculano passa a incluir o ID da Univet → Heculano seleciona "Univet" no seletor → ao criar exame, a Univet aparece e pode ser selecionada como local.

#### O vinculado precisa ser assinante?

**Não.** A lógica de vinculação **não exige** que o vinculado seja assinante da plataforma. O que é exigido:

| Exigência | Descrição |
|-----------|-----------|
| **Ter conta (profile)** | O vinculado precisa existir em `profiles` (ter feito login ou ter recebido "Criar Acesso"). A função `link_partner_by_email` busca primeiro por e-mail em `profiles`. |
| **Ter entidade cadastrada** | O vet precisa ter registro em `veterinarians` com `profile_id`; a clínica precisa ter registro em `clinics` com `profile_id`. |
| **Não exige assinatura** | Não há verificação de pagamento ou plano. O vinculado pode ser um **convidado** (conta criada via "Criar Acesso" com `owner_id`), sem assinatura própria. |

**Alternativa:** Se o e-mail não for encontrado em `profiles`, o fluxo permite **criar o parceiro manualmente** (registro em veterinarians/clinics sem profile). Nesse caso, o vínculo é criado, mas a pessoa ainda não tem login — será necessário usar "Criar Acesso" depois para dar acesso ao sistema.

### Seletor de Contexto (Tenant)
- **Troca de Contexto:** Usuários com múltiplos vínculos (ex.: vet parceiro em várias clínicas) podem alternar entre seus tenants.
- **Nome do Responsável da Clínica:** Campo `responsibleName` nas clínicas para identificação do gestor.

---

## 4. Segurança e Infraestrutura

### Proteção de Dados
- **RLS (Row Level Security):** Isolamento total de dados entre tenants no nível do banco de dados.
- **Funções Blindadas:** Todas as operações críticas rodam em funções SQL seguras (`SECURITY DEFINER`) com caminho de busca protegido (`search_path`).
- **Prevenção de Erros:** Travas contra exclusão acidental e validação de duplicidade de vínculos.

### Ferramentas Administrativas
- **Limpeza Manual:** Ferramenta para o Super Admin remover usuários e dados órfãos definitivamente por e-mail (`delete_user_by_email`).
- **Gestão de Assinantes:** Painel para criar, editar e bloquear assinaturas (Clínica e Veterinário).

### Deploy e Interface
- **Netlify:** Configuração de deploy com variáveis de ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
- **White Label no Header:** Logo e nome da empresa (clínica ou vet) no cabeçalho do sistema.
- **Alerta de Perfil:** Fail-safe em caso de erro ao carregar perfil; opções de recuperação na tela de loading.
- **Loading com Recovery:** Após 8 segundos de carregamento, exibe opções "Tentar Novamente" e "Sair e Relogar".
