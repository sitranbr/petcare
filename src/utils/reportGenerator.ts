import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Exam, User, BrandingInfo, Veterinarian } from '../types';
import { formatMoney, getModalityLabel, getPeriodLabel } from './calculations';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const COLORS = {
  primary: [90, 143, 145], // #5A8F91 (Petcare Default)
  secondary: [156, 189, 191], // #9CBDBF (Petcare Light)
  dark: [21, 80, 78], // #15504E (Petcare Dark)
  text: [60, 60, 60],
  lightBg: [244, 249, 249]
};

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = url;
    img.onload = () => resolve(img);
    img.onerror = reject;
  });
};

// Agora aceita BrandingInfo (Vet ou Clínica) em vez de ClinicSettings global
const addHeader = async (doc: jsPDF, title: string, branding: BrandingInfo) => {
  try {
    if (branding.logoUrl) {
      const logoImg = await loadImage(branding.logoUrl);
      doc.addImage(logoImg, 'PNG', 14, 10, 35, 14, undefined, 'FAST');
    } else {
      // Fallback text logo if image fails or doesn't exist
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]);
      // REBRANDING: Alterado fallback de PIQUET para Petcare
      doc.text(branding.name || 'Petcare', 14, 20);
    }
  } catch (e) {
    console.warn('Logo loading failed', e);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]);
    // REBRANDING: Alterado fallback de PIQUET para Petcare
    doc.text(branding.name || 'Petcare', 14, 20);
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]);
  doc.text(title, 195, 20, { align: 'right' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
  doc.text(branding.name || 'Sistema Veterinário', 195, 25, { align: 'right' });
  
  doc.setDrawColor(COLORS.secondary[0], COLORS.secondary[1], COLORS.secondary[2]);
  doc.setLineWidth(0.5);
  doc.line(14, 32, 196, 32);
};

const addFooter = (doc: jsPDF, branding: BrandingInfo, pageNumber: number, totalPages: number | null = null) => {
    const pageHeight = doc.internal.pageSize.height;
    const pageWidth = doc.internal.pageSize.width;
    doc.setFontSize(8);
    doc.setTextColor(150);
    doc.setFont('helvetica', 'normal');
    doc.setDrawColor(200);
    doc.line(14, pageHeight - 15, pageWidth - 14, pageHeight - 15);
    
    const contactInfo = [branding.name, branding.address, branding.phone, branding.email].filter(Boolean).join(' | ');
    
    doc.text(contactInfo, pageWidth / 2, pageHeight - 10, { align: 'center' });
    if (totalPages) {
        doc.text(`Página ${pageNumber} de ${totalPages}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    } else {
        doc.text(`Página ${pageNumber}`, pageWidth - 14, pageHeight - 10, { align: 'right' });
    }
};

const renderHtmlToPdf = (doc: jsPDF, html: string, startX: number, startY: number, maxWidth: number) => {
  let text = html
    .replace(/<div>/g, '\n')
    .replace(/<\/div>/g, '')
    .replace(/<p>/g, '\n')
    .replace(/<\/p>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/&nbsp;/g, ' ');

  const tokens = text.split(/(<\/?(?:b|strong|i|em|u)>)/g);
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  
  let cursorX = startX;
  let cursorY = startY;
  const lineHeight = 6;
  const spaceWidth = doc.getTextWidth(' ');

  let isBold = false;
  let isItalic = false;

  const setFont = () => {
    if (isBold && isItalic) doc.setFont('helvetica', 'boldoblique');
    else if (isBold) doc.setFont('helvetica', 'bold');
    else if (isItalic) doc.setFont('helvetica', 'oblique');
    else doc.setFont('helvetica', 'normal');
  };
  setFont();

  tokens.forEach(token => {
    if (!token) return;
    if (token === '<b>' || token === '<strong>') { isBold = true; setFont(); return; }
    if (token === '</b>' || token === '</strong>') { isBold = false; setFont(); return; }
    if (token === '<i>' || token === '<em>') { isItalic = true; setFont(); return; }
    if (token === '</i>' || token === '</em>') { isItalic = false; setFont(); return; }
    if (token === '<u>') return; 
    if (token === '</u>') return;

    const lines = token.split('\n');
    lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        cursorY += lineHeight;
        cursorX = startX;
      }
      const words = line.split(/\s+/);
      words.forEach((word, wordIndex) => {
        if (!word) return;
        const wordWidth = doc.getTextWidth(word);
        if (cursorX + wordWidth > startX + maxWidth) {
          cursorY += lineHeight;
          cursorX = startX;
        }
        doc.text(word, cursorX, cursorY);
        cursorX += wordWidth;
        if (wordIndex < words.length - 1) {
           cursorX += spaceWidth;
        }
      });
      if (lineIndex === lines.length - 1 && line.endsWith(' ')) {
         cursorX += spaceWidth;
      }
    });
  });
};

// Relatório Financeiro
export const generatePDFReport = async (exams: Exam[], user: User, startDate: string, endDate: string, branding: BrandingInfo) => {
  const doc = new jsPDF();
  const canViewFinancials = user.level === 1 || user.level === 2;
  await addHeader(doc, 'Relatório de Exames', branding);
  const today = format(new Date(), "dd 'de' MMMM 'de' yyyy", { locale: ptBR });
  
  const periodStart = format(parseISO(startDate), "dd/MM/yyyy");
  const periodEnd = format(parseISO(endDate), "dd/MM/yyyy");
  
  doc.setFontSize(10);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.text(`Gerado por: ${user.name}`, 14, 42);
  doc.text(`Data de Emissão: ${today}`, 14, 47);
  doc.text(`Período: ${periodStart} até ${periodEnd}`, 14, 52);
  
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`${branding.name} | ${branding.document || ''}`, 195, 42, { align: 'right' });
  doc.text(branding.address || '', 195, 47, { align: 'right' });

  const totalExams = exams.length;
  const totalValue = exams.reduce((acc, curr) => acc + curr.totalValue, 0);
  const totalRepasseAndre = exams.reduce((acc, curr) => acc + curr.repasseProfessional, 0);
  const totalRepasseUnivet = exams.reduce((acc, curr) => acc + curr.repasseClinic, 0);
  const totalISS = totalValue * 0.05;

  const startY = 60;
  const boxHeight = canViewFinancials ? 35 : 25;
  
  doc.setFillColor(COLORS.lightBg[0], COLORS.lightBg[1], COLORS.lightBg[2]);
  doc.roundedRect(14, startY, 182, boxHeight, 3, 3, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]);
  doc.text('Resumo Financeiro', 18, startY + 8);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.text('Qtd. Exames:', 18, startY + 18);
  doc.setFont('helvetica', 'bold');
  doc.text(totalExams.toString(), 45, startY + 18);
  doc.setFont('helvetica', 'normal');
  doc.text('Valor Total:', 70, startY + 18);
  doc.setFont('helvetica', 'bold');
  doc.text(formatMoney(totalValue), 95, startY + 18);

  if (canViewFinancials) {
    doc.setFont('helvetica', 'normal');
    doc.text('ISS (5%):', 130, startY + 18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
    doc.text(formatMoney(totalISS), 155, startY + 18);
    const row2Y = startY + 28;
    doc.setFont('helvetica', 'normal');
    doc.text('R. Profissional:', 18, row2Y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.primary[0], COLORS.primary[1], COLORS.primary[2]);
    doc.text(formatMoney(totalRepasseAndre), 45, row2Y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
    doc.text('R. Clínica:', 70, row2Y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]);
    doc.text(formatMoney(totalRepasseUnivet), 95, row2Y);
  }

  const tableHeaders = ['Data', 'PET', 'Modalidade', 'Período', 'Máquina', 'Valor'];
  if (canViewFinancials) tableHeaders.push('R. Prof', 'R. Clínica');

  const tableBody = exams.map(exam => {
    let modalityText = getModalityLabel(exam.modality);
    if (exam.studies && exam.studies > 1) modalityText += ` (${exam.studies}x)`;
    if (exam.studyDescription) modalityText += `\n${exam.studyDescription}`;

    const row = [
      format(parseISO(exam.date), 'dd/MM/yyyy'),
      exam.petName,
      modalityText,
      getPeriodLabel(exam.period),
      exam.machineOwner === 'professional' ? 'Profissional' : 'Clínica',
      formatMoney(exam.totalValue)
    ];

    if (canViewFinancials) {
      row.push(formatMoney(exam.repasseProfessional));
      row.push(formatMoney(exam.repasseClinic));
    }
    return row;
  });

  autoTable(doc, {
    startY: startY + boxHeight + 10,
    head: [tableHeaders],
    body: tableBody,
    theme: 'grid',
    headStyles: { fillColor: [COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]], textColor: 255, fontSize: 9, fontStyle: 'bold', halign: 'center' },
    bodyStyles: { fontSize: 8, textColor: COLORS.text },
    columnStyles: { 
      0: { halign: 'center' }, 
      3: { halign: 'center' },
      5: { halign: 'right', fontStyle: 'bold' }, 
      6: { halign: 'right', textColor: COLORS.primary }, 
      7: { halign: 'right', textColor: COLORS.dark } 
    },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    foot: canViewFinancials 
      ? [[ 'TOTAIS', '', '', '', '', formatMoney(totalValue), formatMoney(totalRepasseAndre), formatMoney(totalRepasseUnivet) ]] 
      : [[ 'TOTAL', '', '', '', '', formatMoney(totalValue) ]],
    footStyles: { fillColor: [COLORS.secondary[0], COLORS.secondary[1], COLORS.secondary[2]], textColor: 255, fontStyle: 'bold', halign: 'right' }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, branding, i, pageCount);
  }
  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
};

// Recibo
export const generateReceipt = async (exam: Exam, user: User, branding: BrandingInfo) => {
  const doc = new jsPDF();
  await addHeader(doc, 'RECIBO DE SERVIÇO', branding);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.setFont('helvetica', 'normal');
  const addressLine = `${branding.address || ''} | Tel: ${branding.phone || ''}`;
  doc.text(addressLine, 105, 38, { align: 'center' });
  doc.setFontSize(8);
  doc.text(`${branding.name} - ${branding.document || ''}`, 105, 42, { align: 'center' });

  const startY = 50;
  const leftCol = 24;
  const rightCol = 110;
  const lineHeight = 8; 
  let contentHeight = 15; 
  contentHeight += lineHeight;
  contentHeight += lineHeight;
  if (exam.species) contentHeight += lineHeight; 
  
  let descLines: string[] = [];
  if (exam.studyDescription) {
    descLines = doc.splitTextToSize(exam.studyDescription, 140);
    contentHeight += (descLines.length * 6) + 4; 
  } else {
    contentHeight += 5; 
  }
  contentHeight += 10; 

  doc.setFillColor(COLORS.lightBg[0], COLORS.lightBg[1], COLORS.lightBg[2]);
  doc.roundedRect(14, startY, 182, contentHeight, 3, 3, 'F');
  doc.setFontSize(11);
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);

  let currentY = startY + 15;
  doc.setFont('helvetica', 'normal');
  doc.text('Data do Exame:', leftCol, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(format(parseISO(exam.date), "dd/MM/yyyy"), leftCol + 35, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text('Paciente (PET):', rightCol, currentY);
  doc.setFont('helvetica', 'bold');
  doc.text(exam.petName, rightCol + 35, currentY);
  
  if (exam.species) {
    currentY += lineHeight;
    doc.setFont('helvetica', 'normal');
    doc.text('Espécie:', rightCol, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(exam.species, rightCol + 35, currentY);
  }

  currentY += lineHeight;
  doc.setFont('helvetica', 'normal');
  doc.text('Modalidade:', leftCol, currentY);
  doc.setFont('helvetica', 'bold');
  let modalityLabel = getModalityLabel(exam.modality);
  if (exam.studies && exam.studies > 1) modalityLabel += ` (${exam.studies} estudos)`;
  doc.text(modalityLabel, leftCol + 35, currentY);

  if (exam.studyDescription) {
    currentY += lineHeight;
    doc.setFont('helvetica', 'normal');
    doc.text('Descrição:', leftCol, currentY);
    doc.setFont('helvetica', 'bold');
    doc.text(descLines, leftCol + 35, currentY);
  }

  const valueBoxY = startY + contentHeight + 5; 
  doc.setDrawColor(COLORS.secondary[0], COLORS.secondary[1], COLORS.secondary[2]);
  doc.setLineWidth(0.5);
  doc.roundedRect(40, valueBoxY, 130, 35, 2, 2, 'S');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.text('VALOR TOTAL', 105, valueBoxY + 10, { align: 'center' });
  doc.setFontSize(22);
  doc.setTextColor(COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]);
  doc.text(formatMoney(exam.totalValue), 105, valueBoxY + 22, { align: 'center' });
  const issValue = exam.totalValue * 0.05;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(120);
  doc.text(`Imposto a recolher (ISS 5%): ${formatMoney(issValue)}`, 105, valueBoxY + 45, { align: 'center' });
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Recibo gerado eletronicamente em ${format(new Date(), "dd/MM/yyyy HH:mm")} por ${user.name}`, 105, 280, { align: 'center' });
  
  if (branding.email) {
    doc.text(branding.email, 105, 285, { align: 'center' });
  }

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
};

// Laudo Médico
export const generateExamReport = async (
  exam: Exam, 
  branding: BrandingInfo, 
  responsibleVet?: Veterinarian, // Objeto completo do veterinário responsável
  studyId?: string
) => {
  const doc = new jsPDF();
  
  let content = exam.reportContent;
  let images = exam.reportImages;
  let titleSuffix = '';

  if (studyId && exam.rxStudies) {
    const study = exam.rxStudies.find(s => s.id === studyId);
    if (study) {
      content = study.reportContent;
      images = study.reportImages;
      titleSuffix = ` - ${study.type === 'Outros' ? study.customDescription : study.type}`;
    }
  }

  await addHeader(doc, 'LAUDO MÉDICO', branding);

  // CAIXA DE INFORMAÇÕES DO PACIENTE E EXAME
  // Aumentada a altura para caber mais informações
  const boxTop = 38;
  const boxHeight = 35; 
  
  doc.setFillColor(COLORS.lightBg[0], COLORS.lightBg[1], COLORS.lightBg[2]);
  doc.roundedRect(14, boxTop, 182, boxHeight, 2, 2, 'F');
  
  // Reseta cor do texto para preto/cinza escuro para garantir visibilidade
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  doc.setFontSize(10);

  // --- COLUNA 1 (Esquerda): Dados do Paciente e Exame ---
  const col1X = 18;
  const labelX1 = col1X;
  const valueX1 = col1X + 22; // Margem para o valor
  
  let currentY = boxTop + 7;

  // Paciente
  doc.setFont('helvetica', 'bold');
  doc.text('Paciente:', labelX1, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(exam.petName || 'Não informado', valueX1, currentY);

  // Espécie
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Espécie:', labelX1, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(exam.species || '-', valueX1, currentY);

  // ID do Exame
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('ID Exame:', labelX1, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(exam.id.slice(0, 8).toUpperCase(), valueX1, currentY);

  // Exame (Modalidade)
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Exame:', labelX1, currentY);
  doc.setFont('helvetica', 'normal');
  let modalityLabel = getModalityLabel(exam.modality);
  if (titleSuffix) modalityLabel += titleSuffix;
  else if (exam.studyDescription) modalityLabel += ` - ${exam.studyDescription}`;
  doc.text(modalityLabel, valueX1, currentY);


  // --- COLUNA 2 (Direita): Datas e Profissionais ---
  const col2X = 110;
  const labelX2 = col2X;
  const valueX2 = col2X + 25;
  
  currentY = boxTop + 7; // Reseta Y para o topo da coluna 2

  // Data
  doc.setFont('helvetica', 'bold');
  doc.text('Data:', labelX2, currentY);
  doc.setFont('helvetica', 'normal');
  doc.text(format(parseISO(exam.date), "dd/MM/yyyy"), valueX2, currentY);

  // Solicitante
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Solicitante:', labelX2, currentY);
  doc.setFont('helvetica', 'normal');
  let reqText = exam.requesterVet || 'Não informado';
  if (exam.requesterCrmv) reqText += ` (${exam.requesterCrmv})`;
  doc.text(reqText, valueX2, currentY);

  // Responsável Técnico (Quem assina)
  currentY += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Responsável:', labelX2, currentY);
  doc.setFont('helvetica', 'normal');
  
  // LÓGICA DE SELEÇÃO DO RESPONSÁVEL
  // 1. Se tiver um veterinário específico (responsibleVet), usa ele.
  // 2. Se não, verifica se o branding (Clínica) tem um "responsibleName" configurado.
  // 3. Último caso, usa o nome da própria Clínica.
  
  let respName = responsibleVet?.name;
  let respDoc = responsibleVet?.crmv;

  if (!respName) {
    // Tenta pegar o Responsável Técnico da Clínica
    if ((branding as any).responsibleName) {
       respName = (branding as any).responsibleName;
    } else {
       respName = branding.name; // Fallback para Razão Social
    }
    respDoc = branding.document;
  }
  
  let respText = respName || '';
  if (respDoc) respText += ` (${respDoc})`;
  
  doc.text(respText, valueX2, currentY);

  // Local (Se branding for Clínica)
  // Se o branding tem nome diferente do responsável, mostra onde foi feito
  if (branding.name !== respName) {
    currentY += 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Local:', labelX2, currentY);
    doc.setFont('helvetica', 'normal');
    doc.text(branding.name, valueX2, currentY);
  }

  // --- CONTEÚDO DO LAUDO ---
  const contentStartY = boxTop + boxHeight + 15;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.dark[0], COLORS.dark[1], COLORS.dark[2]);
  doc.text('RESULTADO DO EXAME', 14, contentStartY);

  renderHtmlToPdf(doc, content || '<p>Laudo sem conteúdo textual.</p>', 14, contentStartY + 10, 180);

  // --- ASSINATURA ---
  const pageHeight = doc.internal.pageSize.height;
  const signatureY = pageHeight - 40;
  
  doc.setDrawColor(150);
  doc.line(70, signatureY, 140, signatureY); 
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(COLORS.text[0], COLORS.text[1], COLORS.text[2]);
  
  // Nome na assinatura
  doc.text(respName || '', 105, signatureY + 5, { align: 'center' });
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (respDoc) {
    doc.text(`CRMV: ${respDoc}`, 105, signatureY + 10, { align: 'center' });
  }

  // --- IMAGENS EM GRADE (8 por página) ---
  if (images && images.length > 0) {
    const imagesPerPage = 8; 
    
    for (let i = 0; i < images.length; i++) {
      if (i % imagesPerPage === 0) {
        doc.addPage();
        doc.setFontSize(10);
        doc.setTextColor(150);
        doc.text(`Anexos - ${exam.petName} - ${format(parseISO(exam.date), "dd/MM/yyyy")}`, 105, 10, { align: 'center' });
      }

      const imgData = images[i];
      const positionIndex = i % imagesPerPage;
      
      const marginX = 14;
      const marginY = 20; 
      const gap = 6;      
      const pageWidth = doc.internal.pageSize.width;
      const pageHeight = doc.internal.pageSize.height;
      const footerHeight = 20;
      
      const availableWidth = pageWidth - (2 * marginX);
      const availableHeight = pageHeight - marginY - footerHeight;
      
      const colsPerPage = 2;
      const rowsPerPage = 4;

      const cellWidth = (availableWidth - (gap * (colsPerPage - 1))) / colsPerPage;
      const cellHeight = (availableHeight - (gap * (rowsPerPage - 1))) / rowsPerPage;

      const col = positionIndex % colsPerPage; 
      const row = Math.floor(positionIndex / colsPerPage);

      const xPos = marginX + (col * (cellWidth + gap));
      const yPos = marginY + (row * (cellHeight + gap));

      try {
        const imgProps = doc.getImageProperties(imgData);
        const imgRatio = imgProps.width / imgProps.height;
        
        let finalWidth = cellWidth;
        let finalHeight = cellWidth / imgRatio;

        if (finalHeight > cellHeight) {
          finalHeight = cellHeight;
          finalWidth = cellHeight * imgRatio;
        }

        const xCentered = xPos + (cellWidth - finalWidth) / 2;
        const yCentered = yPos + (cellHeight - finalHeight) / 2;

        doc.addImage(imgData, 'PNG', xCentered, yCentered, finalWidth, finalHeight);

      } catch (err) {
        console.error("Error adding image to PDF", err);
        doc.text("Erro ao carregar imagem.", xPos + 10, yPos + 10);
      }
    }
  }

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, branding, i, pageCount);
  }

  window.open(URL.createObjectURL(doc.output('blob')), '_blank');
};
