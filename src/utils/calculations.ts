import { Modality, Period, MachineOwner, PriceRule } from '../types';

interface CalculationResult {
  totalValue: number;
  repasseProfessional: number;
  repasseClinic: number;
}

export const calculateExamValues = (
  modality: Modality,
  period: Period,
  machineOwner: MachineOwner,
  priceRules: PriceRule[],
  studies: number = 1,
  clinicId: string
): CalculationResult => {
  // Find the matching rule for the specific clinic
  let rule = priceRules.find(
    r => r.clinicId === clinicId && 
         r.modality === modality && 
         (r.period === period || r.period === 'all')
  );
  // Fallback: se não houver regra para a clínica, usa qualquer regra que bata modalidade+período
  if (!rule) {
    rule = priceRules.find(
      r => r.modality === modality && (r.period === period || r.period === 'all')
    );
  }

  let baseValue = 0;
  let baseRepasseProf = 0;
  
  // Additional Fee Logic (Taxa)
  let additionalFee = 0;
  let additionalRepasseProf = 0;

  if (rule) {
    baseValue = rule.valor;
    baseRepasseProf = rule.repasseProfessional;

    // Load configured tax from the rule
    additionalFee = rule.taxaExtra || 0;
    additionalRepasseProf = rule.taxaExtraProfessional || 0;
  }

  // Logic for RX Studies Multiplier
  if (modality === 'RX') {
    // Apply Studies Multiplier to Base Price ONLY
    baseValue *= studies;
    baseRepasseProf *= studies;
  }

  const totalValue = baseValue + additionalFee;
  const finalRepasseProf = baseRepasseProf + additionalRepasseProf;
  
  // LÓGICA DE FLUXO DE CAIXA (Genérica)
  let finalRepasseClinic = 0;

  if (machineOwner === 'professional') {
    // Dinheiro entrou na máquina do Profissional (ex: André).
    // Ele fica com a parte dele e DEVE repassar a diferença para a Clínica.
    finalRepasseClinic = totalValue - finalRepasseProf;
  } else {
    // Dinheiro entrou na máquina da Clínica (ex: Univet).
    // A Clínica já está com o dinheiro. O Profissional NÃO deve nada.
    // (O acerto da parte do profissional é feito externamente ou em outro relatório de "A Receber")
    finalRepasseClinic = 0;
  }

  return {
    totalValue,
    repasseProfessional: finalRepasseProf,
    repasseClinic: finalRepasseClinic,
  };
};

export const formatMoney = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const getModalityLabel = (m: Modality, customName?: string) => {
  if (m === 'OUTROS' && customName) {
    return customName;
  }
  const map: Record<string, string> = {
    USG: 'Ultrassom',
    RX: 'Raio-X',
    RX_CONTROLE: 'Raio-X Controle',
    USG_FAST: 'Ultrassom FAST',
    OUTROS: customName || 'Outro Exame',
  };
  return map[m] || m;
};

export const getPeriodLabel = (p: Period) => {
  const map: Record<Period, string> = {
    comercial: 'Comercial',
    noturno: 'Noturno',
    fds: 'Fim de Semana',
    feriado: 'Feriado',
  };
  return map[p] || p;
};
