import React, { useState, useRef, useEffect } from 'react';
import { Exam } from '../types';
import { 
  Save, 
  Upload, 
  Image as ImageIcon, 
  Trash2, 
  Maximize2, 
  FileText, 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered, 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  AlignJustify,
  Quote,
  Table,
  Undo,
  Redo,
  Eraser
} from 'lucide-react';
import { getModalityLabel } from '../utils/calculations';
import { format } from 'date-fns';
import { uploadBase64Image } from '../utils/storage';

interface ExamReportEditorProps {
  isOpen: boolean;
  onClose: () => void;
  exam: Exam;
  studyId?: string; // Optional: for specific RX study
  onSave: (examId: string, content: string, images: string[], studyId?: string) => void;
}

export const ExamReportEditor: React.FC<ExamReportEditorProps> = ({
  isOpen,
  onClose,
  exam,
  studyId,
  onSave
}) => {
  const [images, setImages] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [textColor, setTextColor] = useState('#000000');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  // Identify current study info if studyId is present
  const currentStudy = studyId && exam.rxStudies 
    ? exam.rxStudies.find(s => s.id === studyId) 
    : null;

  const studyLabel = currentStudy 
    ? (currentStudy.type === 'Outros' ? currentStudy.customDescription : currentStudy.type)
    : '';

  useEffect(() => {
    if (isOpen && editorRef.current) {
      let initialContent = '';
      let initialImages: string[] = [];

      if (currentStudy) {
        initialContent = currentStudy.reportContent || '';
        initialImages = currentStudy.reportImages || [];
      } else {
        initialContent = exam.reportContent || '';
        initialImages = exam.reportImages || [];
      }

      editorRef.current.innerHTML = initialContent;
      setImages(initialImages);
    }
  }, [isOpen, exam.id, studyId]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          setImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    setIsSaving(true);
    const htmlContent = editorRef.current?.innerHTML || '';
    
    const uploadedImages: string[] = [];
    for (const img of images) {
      if (img.startsWith('data:')) {
        const url = await uploadBase64Image(img, 'uploads', `exams/${exam.id}`);
        if (url) uploadedImages.push(url);
      } else {
        uploadedImages.push(img);
      }
    }

    onSave(exam.id, htmlContent, uploadedImages, studyId);
    setIsSaving(false);
    onClose();
  };

  const execCommand = (command: string, value: string | undefined = undefined) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextColor(e.target.value);
    execCommand('foreColor', e.target.value);
  };

  const insertTable = () => {
    const html = `
      <table style="border-collapse: collapse; width: 100%; margin-bottom: 1rem;">
        <tbody>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">Célula 1</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Célula 2</td>
          </tr>
          <tr>
            <td style="border: 1px solid #ddd; padding: 8px;">Célula 3</td>
            <td style="border: 1px solid #ddd; padding: 8px;">Célula 4</td>
          </tr>
        </tbody>
      </table>
      <p><br/></p>
    `;
    execCommand('insertHTML', html);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gray-900/95 backdrop-blur-sm flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-md z-10">
        <div className="flex items-center gap-4">
          <div className="bg-petcare-light/20 p-2 rounded-lg">
            <FileText className="w-6 h-6 text-petcare-dark" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              Laudo Médico
              <span className="text-sm font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                {getModalityLabel(exam.modality)}
                {studyLabel && ` - ${studyLabel}`}
              </span>
            </h2>
            <div className="text-sm text-gray-500 flex gap-4 mt-1">
              <span>Paciente: <span className="font-bold text-gray-700">{exam.petName}</span></span>
              {exam.species && <span>Espécie: <span className="font-bold text-gray-700">{exam.species}</span></span>}
              <span>Data: {format(new Date(exam.date), 'dd/MM/yyyy')}</span>
            </div>
            {exam.requesterVet && (
              <p className="text-xs text-gray-400 mt-0.5">
                Solicitante: {exam.requesterVet} {exam.requesterCrmv && `(CRMV: ${exam.requesterCrmv})`}
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium">Cancelar</button>
          <button onClick={handleSave} disabled={isSaving} className="bg-petcare-dark text-white px-6 py-2 rounded-lg font-bold hover:bg-petcare-DEFAULT transition-all flex items-center gap-2 shadow-lg">
            {isSaving ? <>Salvando...</> : <><Save className="w-4 h-4" /> Salvar Laudo</>}
          </button>
        </div>
      </header>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Images (1/3) */}
        <div className="w-1/3 flex flex-col bg-gray-100 border-r border-gray-200 shrink-0">
          <div className="p-4 bg-white border-b border-gray-200 flex justify-between items-center shadow-sm z-10">
            <span className="text-sm font-bold text-gray-600 uppercase tracking-wider flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Imagens</span>
            <div className="flex gap-2">
              <button onClick={() => fileInputRef.current?.click()} className="bg-petcare-light text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-petcare-DEFAULT transition-colors flex items-center gap-2 shadow-sm"><Upload className="w-4 h-4" /> Adicionar</button>
              <input type="file" ref={fileInputRef} onChange={handleImageUpload} accept="image/*" multiple className="hidden" />
            </div>
          </div>
          <div className="flex-1 p-6 overflow-y-auto space-y-6">
            {images.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-gray-400 border-2 border-dashed border-gray-300 rounded-xl m-4 bg-gray-50/50">
                <ImageIcon className="w-16 h-16 mb-4 opacity-50" />
                <p className="text-lg font-medium">Nenhuma imagem</p>
                <p className="text-sm">Adicione imagens ao laudo</p>
              </div>
            ) : (
              images.map((img, index) => (
                <div key={index} className="bg-white p-2 rounded-xl shadow-md group relative">
                  <div className="relative overflow-hidden rounded-lg">
                    <img src={img} alt={`Exame ${index + 1}`} className="w-full h-auto object-contain max-h-[400px] bg-black" />
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                      <button onClick={() => window.open(img, '_blank')} className="bg-black/70 text-white p-2 rounded-lg hover:bg-black transition-colors" title="Ver tamanho original"><Maximize2 className="w-4 h-4" /></button>
                      <button onClick={() => handleRemoveImage(index)} className="bg-red-500/90 text-white p-2 rounded-lg hover:bg-red-600 transition-colors" title="Remover imagem"><Trash2 className="w-4 h-4" /></button>
                    </div>
                    <div className="absolute bottom-2 left-2 bg-black/60 text-white px-2 py-1 rounded text-xs backdrop-blur-sm">Imagem {index + 1}</div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Editor (2/3) */}
        <div className="w-2/3 flex flex-col bg-white">
          
          {/* TOOLBAR - Single Line Layout */}
          <div className="flex items-center gap-1 p-2 border-b border-gray-200 bg-gray-50 sticky top-0 z-20 shadow-sm flex-wrap">
            
            {/* Style Dropdown */}
            <div className="flex items-center bg-white border border-gray-300 rounded overflow-hidden h-8 mr-1 hover:border-gray-400 transition-colors">
              <div className="px-2 text-xs font-medium text-gray-600 bg-gray-100 border-r border-gray-200 h-full flex items-center select-none">Estilo</div>
              <select onChange={(e) => execCommand('formatBlock', e.target.value)} className="h-full px-2 text-sm text-gray-700 outline-none bg-transparent min-w-[80px] cursor-pointer">
                <option value="p">Normal</option>
                <option value="h1">Título 1</option>
                <option value="h2">Título 2</option>
                <option value="h3">Título 3</option>
                <option value="pre">Código</option>
              </select>
            </div>

            {/* Font Dropdown */}
            <div className="flex items-center bg-white border border-gray-300 rounded overflow-hidden h-8 mr-1 hover:border-gray-400 transition-colors">
              <div className="px-2 text-xs font-medium text-gray-600 bg-gray-100 border-r border-gray-200 h-full flex items-center select-none">Fonte</div>
              <select onChange={(e) => execCommand('fontName', e.target.value)} className="h-full px-2 text-sm text-gray-700 outline-none bg-transparent w-24 cursor-pointer">
                <option value="Arial">Arial</option>
                <option value="Times New Roman">Times New Roman</option>
                <option value="Courier New">Courier New</option>
                <option value="Georgia">Georgia</option>
                <option value="Verdana">Verdana</option>
                <option value="Quicksand">Quicksand</option>
              </select>
            </div>

            {/* Size Dropdown */}
            <div className="flex items-center bg-white border border-gray-300 rounded overflow-hidden h-8 mr-1 hover:border-gray-400 transition-colors">
              <div className="px-2 text-xs font-medium text-gray-600 bg-gray-100 border-r border-gray-200 h-full flex items-center select-none">Tam.</div>
              <select onChange={(e) => execCommand('fontSize', e.target.value)} className="h-full px-2 text-sm text-gray-700 outline-none bg-transparent cursor-pointer">
                <option value="3">12pt</option>
                <option value="1">8pt</option>
                <option value="2">10pt</option>
                <option value="4">14pt</option>
                <option value="5">18pt</option>
                <option value="6">24pt</option>
                <option value="7">36pt</option>
              </select>
            </div>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* Color Picker */}
            <div className="relative group mr-1">
              <button className="p-1 text-gray-700 hover:bg-gray-200 rounded flex flex-col items-center justify-center w-8 h-8 transition-colors" title="Cor do Texto">
                <span className="font-bold serif text-lg leading-none">A</span>
                <div className="h-1 w-5 mt-[-2px] rounded-full border border-gray-200" style={{ backgroundColor: textColor }}></div>
              </button>
              <input type="color" value={textColor} onChange={handleColorChange} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
            </div>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* Formatting Buttons */}
            <button onClick={() => execCommand('bold')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Negrito"><Bold className="w-4 h-4" /></button>
            <button onClick={() => execCommand('italic')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Itálico"><Italic className="w-4 h-4" /></button>
            <button onClick={() => execCommand('underline')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Sublinhado"><Underline className="w-4 h-4" /></button>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* Lists & Extras */}
            <button onClick={() => execCommand('insertOrderedList')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Lista Numerada"><ListOrdered className="w-4 h-4" /></button>
            <button onClick={() => execCommand('insertUnorderedList')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Lista com Marcadores"><List className="w-4 h-4" /></button>
            <button onClick={() => execCommand('formatBlock', 'blockquote')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Citação"><Quote className="w-4 h-4" /></button>
            <button onClick={insertTable} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Inserir Tabela"><Table className="w-4 h-4" /></button>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* Alignment */}
            <button onClick={() => execCommand('justifyLeft')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Alinhar à Esquerda"><AlignLeft className="w-4 h-4" /></button>
            <button onClick={() => execCommand('justifyCenter')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Centralizar"><AlignCenter className="w-4 h-4" /></button>
            <button onClick={() => execCommand('justifyRight')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Alinhar à Direita"><AlignRight className="w-4 h-4" /></button>
            <button onClick={() => execCommand('justifyFull')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Justificar"><AlignJustify className="w-4 h-4" /></button>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* History */}
            <button onClick={() => execCommand('undo')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Desfazer"><Undo className="w-4 h-4" /></button>
            <button onClick={() => execCommand('redo')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Refazer"><Redo className="w-4 h-4" /></button>

            <div className="w-px h-6 bg-gray-300 mx-1"></div>

            {/* Utils */}
            <button onClick={() => execCommand('removeFormat')} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Limpar Formatação"><Eraser className="w-4 h-4" /></button>
            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors" title="Inserir Imagem"><ImageIcon className="w-4 h-4" /></button>
          </div>

          {/* Editor Content */}
          <div className="flex-1 p-8 overflow-y-auto cursor-text bg-gray-50" onClick={() => editorRef.current?.focus()}>
            <div 
              ref={editorRef} 
              contentEditable 
              className="w-full min-h-[800px] bg-white shadow-sm p-12 outline-none text-gray-800 leading-relaxed text-base font-serif mx-auto max-w-[210mm]" 
              style={{ whiteSpace: 'pre-wrap' }} 
            />
          </div>
        </div>
      </div>
    </div>
  );
};
