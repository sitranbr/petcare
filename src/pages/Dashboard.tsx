import React from 'react';
import { useAuth } from '../context/AuthContext';
import { AdminTenants } from './AdminTenants';
import { OperationalDashboard } from './OperationalDashboard';
import { Shield } from 'lucide-react';

// Dashboard Wrapper que decide o que mostrar
export const Dashboard = () => {
  const { user } = useAuth();

  // Se for Super Admin, mostra o Painel SaaS (Gestão de Tenants)
  if (user?.level === 1) {
    return <AdminTenants />;
  }

  // Se for Tenant (Vet/Clínica) ou Recepção, mostra o Dashboard Operacional (Exames)
  return <OperationalDashboard />;
};
