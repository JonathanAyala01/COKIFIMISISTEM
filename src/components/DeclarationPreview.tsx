import React from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, CheckCircle, Printer, Edit, Save, Download, Eye, X, FileText } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { DeclarationData } from '../types';
// @ts-ignore
import cokifimiLogo from '@/logo.png';

interface DeclarationPreviewProps {
  data: DeclarationData;
  onEdit?: () => void;
  onConfirmSave?: () => void;
  isPendingSave?: boolean;
  onBack: () => void;
  backLabel?: string;
}

type Field = {
  label: string;
  value?: string;
  wide?: boolean;
};

const formatActividadPublica = (value?: string) =>
  value === 'AMBAS' || value === 'AMBOS' ? 'PÚBLICA Y PRIVADA' : value;

export default function DeclarationPreview({ data, onEdit, onConfirmSave, isPendingSave = false, onBack, backLabel = 'Inicio del panel' }: DeclarationPreviewProps) {
  const [attachmentPreview, setAttachmentPreview] = React.useState<{ title: string; content: string; filename: string } | null>(null);
  const handleDownloadPdf = async () => {
    try {
      const source = document.getElementById('print-sheet-wrapper');
      if (!source) throw new Error('No se encontró la ficha para descargar.');

      const pages = Array.from(source.querySelectorAll<HTMLElement>('.print-only-page'));
      if (!pages.length) throw new Error('No se encontraron páginas para descargar.');

      const images = pages.flatMap(page => Array.from(page.querySelectorAll<HTMLImageElement>('img')));
      await Promise.all(images.map(image => image.complete
        ? Promise.resolve()
        : new Promise<void>(resolve => {
          image.onload = () => resolve();
          image.onerror = () => resolve();
        })));

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      for (const [index, page] of pages.entries()) {
        const canvas = await html2canvas(page, {
          scale: 1.5,
          useCORS: true,
          allowTaint: false,
          logging: false,
          backgroundColor: '#ffffff',
          windowWidth: page.scrollWidth,
          onclone: clonedDocument => {
            const clonedPages = Array.from(clonedDocument.querySelectorAll<HTMLElement>('.print-only-page'));
            const clonedPage = clonedPages[index];
            if (!clonedPage) return;

            const originalElements = [page, ...Array.from(page.querySelectorAll<HTMLElement>('*'))];
            const clonedElements = [clonedPage, ...Array.from(clonedPage.querySelectorAll<HTMLElement>('*'))];
            originalElements.forEach((originalElement, elementIndex) => {
              const clonedElement = clonedElements[elementIndex];
              if (!clonedElement) return;

              const computed = window.getComputedStyle(originalElement);
              for (let propertyIndex = 0; propertyIndex < computed.length; propertyIndex += 1) {
                const property = computed.item(propertyIndex);
                let value = computed.getPropertyValue(property);
                if (/oklch|oklab/i.test(value)) {
                  if (property.includes('background')) value = '#ffffff';
                  else if (property === 'color') value = '#1f2937';
                  else if (property.includes('border')) value = '#d1d5db';
                  else if (property.includes('shadow')) value = 'none';
                  else continue;
                }
                clonedElement.style.setProperty(property, value);
              }
            });

            clonedDocument.querySelectorAll('link[rel="stylesheet"], style').forEach(styleNode => styleNode.remove());
          },
        });

        if (index > 0) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297);
      }

      const filePart = (value: string) => value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toUpperCase();
      const fileName = `DJ_anual_${filePart(data.nombres)}_${filePart(data.apellido)}.pdf`;
      pdf.save(fileName);
    } catch (error) {
      console.error('Error generando PDF', error);
      window.alert('No se pudo generar el PDF. Intente nuevamente.');
    }
  };

  const downloadAttachment = (content: string, filename: string) => {
    const link = document.createElement('a');
    link.href = content;
    link.download = filename;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
  };
  const handlePrint = () => {
    const source = document.getElementById('print-sheet-wrapper');
    if (!source) {
      window.print();
      return;
    }

    const printWindow = window.open('', '_blank', 'width=1200,height=1600');
    if (!printWindow) {
      window.print();
      return;
    }

    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
      .map((node) => node.outerHTML)
      .join('\n');

    const printDocument = `
      <!doctype html>
      <html lang="es">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Declaracion jurada</title>
          ${styles}
          <style>
            @page { size: A4 portrait; margin: 0; }
            html, body {
              margin: 0;
              padding: 0;
              background: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
              width: 210mm;
              height: 297mm;
            }
            body { width: 210mm; }
            .print-sheet { width: 210mm; }
            .print-document .print-sheet,
            .print-document .print-sheet * {
              color: #172b24 !important;
              opacity: 1 !important;
              text-shadow: none !important;
            }
            .print-only-page {
              width: 210mm !important;
              height: 297mm !important;
              /* Match the 800 x 1131 px sheet shown in Colegiado. */
              padding: 7.4mm 9mm !important;
              box-sizing: border-box !important;
              break-after: page !important;
              page-break-after: always !important;
              overflow: hidden !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              background: #fff !important;
              box-shadow: none !important;
              border: none !important;
              border-radius: 0 !important;
              margin: 0 !important;
            }
            .print-only-page:last-child {
              break-after: avoid !important;
              page-break-after: avoid !important;
            }
            .fields-grid {
              display: flex !important;
              flex-direction: column !important;
              gap: 0 !important;
            }
            .print-document .cokifimi-print-title {
              color: #17382e !important;
              font-size: 17px !important;
              line-height: 1.2 !important;
              margin: 0 auto 16px !important;
              max-width: 680px !important;
            }
            .print-document .print-only-page > div:last-child {
              position: static !important;
              margin: 0 !important;
            }
            .print-document .print-only-page > div:first-child,
            .print-document .fields-grid {
              transform: none !important;
            }
            .print-document .fields-grid > div {
              padding: 2px 0 !important;
              margin: 0 !important;
              min-height: 0 !important;
            }
            /* Mismo cuerpo de texto que la vista en pantalla (Admin y Colegiado). */
            .print-document .fields-grid > div > div,
            .print-document .fields-grid > div > div:first-child {
              font-size: 14px !important;
              line-height: 1.3 !important;
            }
            .print-document .fields-grid > div > div:first-child {
              font-weight: 700 !important;
            }
            .print-document .cokifimi-legal-block,
            .print-document .cokifimi-declaration-text {
              font-size: 16px !important;
              line-height: 1.45 !important;
              margin-bottom: 16px !important;
            }
            .print-document #print-page-2 .cokifimi-legal-block,
            .print-document #print-page-2 .cokifimi-legal-block .cokifimi-declaration-text {
              font-size: 16px !important;
              line-height: 1.45 !important;
              margin-bottom: 4mm !important;
            }
            .print-document #print-page-1 p.cokifimi-page1-legal {
              font-size: 16px !important;
              line-height: 1.45 !important;
              margin-bottom: 10px !important;
            }
            .print-document .print-only-page img {
              width: 80px !important;
              height: 80px !important;
            }
            .print-document #print-page-2 .cokifimi-photo-print-placement {
              position: static !important;
              margin: 0 auto 6mm !important;
              padding: 0 !important;
              transform: none !important;
            }
            .print-document #print-page-2 .cokifimi-photo-print-placement > div {
              width: 170px !important;
              height: 220px !important;
            }
            .print-document #print-page-2 .cokifimi-photo-print-placement > div img {
              width: 100% !important;
              height: 100% !important;
              object-fit: contain !important;
            }
          </style>
        </head>
        <body class="print-document">
          <div class="print-sheet">${source.innerHTML}</div>
        </body>
      </html>
    `;
    printWindow.document.open();
    printWindow.document.write(printDocument);
    printWindow.document.close();

    const printWhenReady = () => {
      window.setTimeout(() => {
        printWindow.focus();
        printWindow.print();
        // Chrome necesita mantener abierta la ventana mientras se guarda o cancela el PDF.
      }, 250);
    };
    const images = Array.from(printWindow.document.images);
    if (images.length === 0) {
      printWhenReady();
      return;
    }
    let loaded = 0;
    let finished = false;
    const markLoaded = () => {
      if (finished) return;
      loaded += 1;
      if (loaded >= images.length) {
        finished = true;
        window.clearTimeout(timeout);
        printWhenReady();
      }
    };
    const timeout = window.setTimeout(() => {
      if (!finished) {
        finished = true;
        printWhenReady();
      }
    }, 300);
    images.forEach((image) => {
      if (image.complete) markLoaded();
      else {
        image.onload = markLoaded;
        image.onerror = markLoaded;
      }
    });
  };

  const formatDate = (dateStr: string | undefined): string => {
    if (!dateStr) return '';
    if (dateStr.includes('/')) return dateStr;
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const renderField = (field: Field, index: number) => (
  <div
    key={`${field.label}-${index}`}
    className={field.label.toLowerCase().includes('vencimiento') ? 'declaration-expiry-field' : undefined}
    style={{
      display: "grid",
      gridTemplateColumns: "290px 1fr",
      columnGap: "16px",
      padding: "4px 0",
      /* Etiqueta y valor comparten la misma línea base pese al distinto cuerpo. */
      alignItems: "baseline",
    }}
  >
    <div
      style={{
        fontSize: "14px",
        fontWeight: "bold",
        textTransform: "uppercase",
      }}
    >
      {field.label}
    </div>

    <div
      style={{
        fontSize: "14px",
        border: "none",
        outline: "none",
        boxShadow: "none",
        background: "transparent",
        textTransform: field.wide ? "none" : "uppercase",
      }}
    >
      {field.value || "—"}
    </div>
  </div>
);

  const renderHeader = () => (
    <div className="pb-2 mb-2 flex items-start gap-5">
      <div className="flex items-start justify-start pt-1">
        <img
          src={cokifimiLogo}
          alt="COKIFIMI Logo"
          className="w-[112px] h-[112px] object-contain shrink-0 bg-white"
          referrerPolicy="no-referrer"
        />
      </div>

      <div className="flex-1 text-center leading-tight text-[#111111] pt-1">
        <div className="font-serif font-bold text-[13px] md:text-[14px] uppercase">
          Colegio de Kinesiólogos y Fisioterapeutas de Misiones
        </div>
        <div className="font-serif font-bold text-[13px] md:text-[14px] uppercase mt-1">Ley I N° 55</div>
        <div className="font-serif font-bold text-[13px] md:text-[14px] uppercase mt-1">Personería Jurídica N° 894</div>
        <div className="font-serif font-bold text-[13px] md:text-[14px] uppercase mt-1">
          Ramón García N° 942 (ex.134) - Posadas - Misiones
        </div>
        <div className="font-serif font-bold text-[13px] md:text-[14px] uppercase mt-1">
          Tel: 0376441795 - Email: colegioklgosmisiones@gmail.com
        </div>
        <div className="font-serif font-bold text-[13px] md:text-[14px] uppercase mt-1">
          Pag.www.cokifimi.org
        </div>
      </div>
    </div>
  );

  const domicilioActual = [
    data.domicilioActual,
    data.numeracionDomicilioActual ? `N° ${data.numeracionDomicilioActual}` : '',
    data.pisoDomicilioActual ? `PISO ${data.pisoDomicilioActual}` : '',
  ].filter(Boolean).join(' ');

  const page1Fields: Field[] = [
    { label: 'DNI', value: data.dni },
    { label: 'CUIL / CUIT', value: data.cuilCuit },
    { label: 'Fecha de nacimiento', value: formatDate(data.fechaNacimiento) },
    { label: 'Sexo', value: data.sexo },
    { label: 'Provincia de nacimiento', value: data.provinciaNacimiento },
    { label: 'Ciudad de nacimiento', value: data.ciudadNacimiento },
    { label: 'Nacionalidad', value: data.nacionalidad },
    { label: 'Domicilio actual', value: domicilioActual, wide: true },
    { label: 'Municipio / localidad', value: data.municipioLocalidad },
    { label: 'Código postal', value: data.codigoPostal },
    { label: 'Teléfono', value: data.telefono },
    { label: 'Celular', value: data.celular },
    { label: 'E-mail', value: data.email, wide: true },
    { label: 'Universidad de egreso', value: data.universidad, wide: true },
    { label: 'Título universitario', value: data.tituloUniversitario, wide: true },
    { label: 'Fecha de emisión del título', value: formatDate(data.fechaEmisionTitulo) },
    { label: 'Título por reválida', value: data.tituloRevalida },
    ...(data.tituloRevalida === 'SI' ? [
      { label: 'Universidad que revalida', value: data.universidadRevalida || '' },
    ] : []),
  ];

  const consultorios = data.consultorios?.length
    ? data.consultorios
    : data.trabajaConsultorio === 'SI'
      ? [{ domicilio: data.domicilioConsultorio || '', numeracion: data.numeracionConsultorio || '', ciudad: data.ciudadConsultorio || '' }]
      : [];

  const page2Fields: Field[] = [
    ...(data.tituloRevalida === 'SI' ? [
      { label: 'Título universitario de la reválida', value: data.tituloRevalidaNombre || '' },
      { label: 'Fecha de emisión del título por reválida', value: formatDate(data.fechaEmisionRevalida) },
    ] : []),
    { label: 'Especialidad de posgrado (solo con título universitario)', value: data.especialidadUniversidad || '' },
    { label: 'Actividad profesional pública', value: formatActividadPublica(data.actividadPublica) },
    ...(data.actividadPublica !== 'NO' ? [{ label: 'Lugar de actividad pública', value: data.lugarActividadPublica === 'OTRAS' ? data.otroLugarActividadPublica || '' : data.lugarActividadPublica || '' }] : []),
    ...(data.actividadPublica !== 'SI' ? [{ label: 'Actividad profesional privada', value: data.actividadPrivada }] : []),
    { label: 'Trabaja en consultorio / área kinésica', value: data.trabajaConsultorio },
    { label: 'Nombre de la compañía del seguro de praxis médica', value: data.companiaSeguro || '' },
    { label: 'Número de la póliza de praxis médica', value: data.polizaSeguro || '' },
    { label: 'Vigencia de la póliza desde', value: formatDate(data.seguroDesde) },
    { label: 'Vigencia de la póliza hasta', value: formatDate(data.seguroHasta) },
    ...(data.trabajaConsultorio === 'SI' && !data.consultorios?.length ? [
      { label: 'Domicilio del consultorio', value: data.domicilioConsultorio || '', wide: true },
      { label: 'Numeración', value: data.numeracionConsultorio || '' },
      { label: 'Ciudad', value: data.ciudadConsultorio || '' },
    ] : []),
    ...(data.trabajaConsultorio === 'SI' && data.consultorios?.length ? [
      { label: 'Cantidad de consultorios', value: String(consultorios.length) },
      ...consultorios.flatMap((consultorio, index) => [
        { label: `Domicilio del consultorio ${index + 1}`, value: consultorio.domicilio, wide: true },
        { label: `Numeración de consultorio ${index + 1}`, value: consultorio.numeracion },
        { label: `Ciudad de consultorio ${index + 1}`, value: consultorio.ciudad },
        { label: `Es titular del consultorio ${index + 1}`, value: consultorio.esTitularConsultorio || '' },
        ...(consultorio.esTitularConsultorio !== 'SI' ? [
          { label: `Es profesional adjunto ${index + 1}`, value: consultorio.esProfesionalAdjunto || '' },
          { label: `Apellido y nombre del titular ${index + 1}`, value: consultorio.nombreTitularConsultorio || '', wide: true },
          { label: `Número de matrícula ${index + 1}`, value: consultorio.numeroMatriculaConsultorio || '' },
        ] : []),
        ...(consultorio.esTitularConsultorio === 'SI' ? [
          { label: `Matrícula del titular ${index + 1}`, value: consultorio.numeroMatriculaConsultorio || data.matricula || '' },
        ] : []),
        { label: `Fecha de inicio de actividad ${index + 1}`, value: formatDate(consultorio.fechaInicioConsultorio) },
      ]),
    ] : []),
    ...(data.trabajaConsultorio !== 'NO' ? [
      { label: 'Es auditor de obra social / ART', value: data.esAuditorObraSocialArt || '' },
      ...(data.esAuditorObraSocialArt === 'SI' ? [{ label: 'Describa en dónde lo realiza', value: data.nombreObraSocialArt || '', wide: true }] : []),
    ] : []),
  ];

  return (
    <div className="cokifimi-preview-modal cokifimi-declaration-preview max-w-6xl mx-auto" id="declaration-preview-container">
      <div className="bg-gradient-to-r from-emerald-950 via-[#0F5A3E] to-emerald-900 rounded-3xl shadow-[0_18px_50px_rgba(15,90,62,0.18)] border border-emerald-900/15 p-5 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-5 print:hidden">
        <div className="flex items-center gap-3">
          <div className="text-white">
            <h2 className="text-xl md:text-2xl font-black mt-0 leading-tight">
              DECLARACIÓN JURADA OBLIGATORIA BIANUAL DE DATOS FILIATORIOS Y PROFESIONALES
            </h2>
            <p className="text-emerald-50/80 text-sm mt-1">
              La misma debe estar vigente para realizar todo trámite ante este colegio (excluyente)
            </p>
            {isPendingSave && (
              <p className="mt-3 inline-flex rounded-lg bg-amber-300/20 px-3 py-2 text-xs font-bold text-amber-100">
                Revisá todos los datos antes de guardar. Cuando esté correcto, presioná “Guardar declaración”.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 md:justify-end">
          <button
            type="button"
            onClick={onBack}
            className="border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 focus:outline-none backdrop-blur"
          >
            <ArrowLeft className="w-4 h-4" />
            {backLabel}
          </button>
          {onEdit && (
            <button
              onClick={onEdit}
              className="border border-white/20 bg-white/10 hover:bg-white/20 text-white font-semibold text-sm px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5 focus:outline-none backdrop-blur"
            >
              <Edit className="w-4 h-4" />
              Editar formulario
            </button>
          )}

          {data.certificadoAnssalArchivo && (
            <div className="cokifimi-preview-attachment-actions">
              <button
                type="button"
                onClick={() => setAttachmentPreview({ title: 'Certificado ANSSAL', content: data.certificadoAnssalArchivo!, filename: data.certificadoAnssalArchivoNombre || 'certificado-anssal' })}
                className="cokifimi-preview-attachment-button is-anssal"
              >
                <Eye className="h-4 w-4" /> Ver ANSSAL
              </button>
              <button
                type="button"
                aria-label="Descargar certificado ANSSAL"
                onClick={() => downloadAttachment(data.certificadoAnssalArchivo!, data.certificadoAnssalArchivoNombre || 'certificado-anssal')}
                className="cokifimi-preview-attachment-download"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          )}
          {data.polizaPraxisArchivo && (
            <div className="cokifimi-preview-attachment-actions">
              <button
                type="button"
                onClick={() => setAttachmentPreview({ title: 'Póliza de praxis médica', content: data.polizaPraxisArchivo!, filename: data.polizaPraxisArchivoNombre || 'poliza-praxis' })}
                className="cokifimi-preview-attachment-button is-praxis"
              >
                <Eye className="h-4 w-4" /> Ver póliza de praxis
              </button>
              <button
                type="button"
                aria-label="Descargar póliza de praxis"
                onClick={() => downloadAttachment(data.polizaPraxisArchivo!, data.polizaPraxisArchivoNombre || 'poliza-praxis')}
                className="cokifimi-preview-attachment-download"
              >
                <Download className="h-4 w-4" />
              </button>
            </div>
          )}
          {isPendingSave && onConfirmSave ? (
            <button
              id="btn-confirm-save"
              type="button"
              onClick={(event) => { event.preventDefault(); event.stopPropagation(); onConfirmSave(); }}
              className="bg-white hover:bg-emerald-50 text-[#0F5A3E] font-bold text-sm px-5 py-3 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/15 focus:outline-none ring-2 ring-white/40"
            >
              <Save className="w-4 h-4" />
              Guardar declaración
            </button>
          ) : (
            <button
              onClick={() => { void handleDownloadPdf(); }}
              className="bg-white hover:bg-emerald-50 text-[#0F5A3E] font-bold text-sm px-5 py-2.5 rounded-xl transition-all flex items-center gap-1.5 shadow-lg shadow-emerald-950/15 focus:outline-none"
              id="btn-print-pdf"
            >
              <Printer className="w-4 h-4" />
              Descargar PDF
            </button>
          )}
        </div>
      </div>

      {attachmentPreview && createPortal((
        <div className="cokifimi-attachment-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="attachment-preview-title" onClick={() => setAttachmentPreview(null)}>
          <div className="cokifimi-attachment-modal" onClick={(event) => event.stopPropagation()}>
            <div className="cokifimi-attachment-modal-header">
              <div><FileText className="h-5 w-5" /><h2 id="attachment-preview-title">{attachmentPreview.title}</h2></div>
              <button type="button" aria-label="Cerrar vista previa" onClick={() => setAttachmentPreview(null)}><X className="h-5 w-5" /></button>
            </div>
            <div className="cokifimi-attachment-modal-body">
              {/^data:image\//i.test(attachmentPreview.content) ? <img src={attachmentPreview.content} alt={attachmentPreview.title} /> : <iframe title={attachmentPreview.title} src={attachmentPreview.content} />}
            </div>
            <div className="cokifimi-attachment-modal-footer">
              <span>{attachmentPreview.filename}</span>
              <button type="button" onClick={() => downloadAttachment(attachmentPreview.content, attachmentPreview.filename)}><Download className="h-4 w-4" /> Descargar archivo</button>
            </div>
          </div>
        </div>
      ), document.body)}
      <div className="print:space-y-0" id="print-sheet-wrapper">
        <section
          className="print-only-page bg-white p-4 md:p-6 shadow-xl border border-gray-200 rounded-[28px] mx-auto w-full max-w-[800px] aspect-[1/1.414] print:shadow-none print:border-none print:p-0 print:rounded-none print:m-0 print:max-w-none print:w-full print:aspect-auto flex flex-col justify-between"
          id="print-page-1"
          style={{ position: 'relative' }}
        >
          <img src={cokifimiLogo} alt="" aria-hidden="true" className="cokifimi-declaration-watermark" />
          <div className="pt-0 w-full">
            {renderHeader()}

            <h2 className="cokifimi-print-title text-center font-sans font-extrabold text-[#0F5A3E] text-[13px] tracking-[0.04em] border-b border-gray-200 pb-2 mb-8 uppercase">
              DECLARACIÓN JURADA OBLIGATORIA BIANUAL DE DATOS FILIATORIOS Y PROFESIONALES
            </h2>
            <p className="cokifimi-print-subtitle text-center text-[10px] leading-tight text-gray-700 font-semibold mb-4">
              La misma debe estar vigente para realizar todo trámite ante este colegio (excluyente)
            </p>

            <div className="flex flex-col gap-y-0 mb-1 max-w-[640px] mx-auto w-full fields-grid">
              <div className="flex flex-nowrap items-baseline py-1 w-full">
                <span className="w-[290px] shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wide pr-2">
                  Apellido
                </span>
                <span className="min-w-0 flex-1 text-[18px] font-semibold text-slate-950 uppercase whitespace-normal break-words pl-3 ">
                  {data.apellido}
                </span>
              </div>
              <div className="flex flex-nowrap items-baseline py-1 w-full">
                <span className="w-[290px] shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wide pr-2">
                  Nombre/s
                </span>
                <span className="min-w-0 flex-1 text-[18px] font-semibold text-slate-950 uppercase whitespace-normal break-words pl-3 ">
                  {data.nombres}
                </span>
              </div>
              <div className="flex flex-nowrap items-baseline py-1 w-full">
                <span className="w-[290px] shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wide pr-2">
                  Matrícula profesional
                </span>
                <span className="min-w-0 flex-1 text-[18px] font-semibold text-slate-950 whitespace-normal break-words pl-3 ">
                  {data.matricula}
                </span>
              </div>
              <div className="flex flex-nowrap items-baseline py-1 w-full">
                <span className="w-[290px] shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wide pr-2">
                  Fecha de matriculación
                </span>
                <span className="min-w-0 flex-1 text-[18px] font-semibold text-slate-950 whitespace-normal break-words pl-3 ">
                  {data.fechaMatriculacion ? formatDate(data.fechaMatriculacion) : '____________________'}
                </span>
              </div>



            </div>

            <div className="text-center italic text-[10px] text-gray-800 leading-relaxed mt-1 mb-1 max-w-[640px] mx-auto w-full font-bold">
              "Me notifico que la presente actualización de datos debe cumplimentarse antes de transcurridos 2 años desde la fecha de la declaración jurada."
            </div>

            <div className="flex flex-col gap-y-0 mb-3 max-w-[640px] mx-auto w-full fields-grid">
              <div className="flex flex-nowrap items-baseline py-1 w-full">
                <span className="w-[290px] shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wide pr-2">
                  Fecha presentación
                </span>
                <span className="min-w-0 flex-1 text-[18px] font-semibold text-slate-950 whitespace-normal break-words pl-3 ">
                  {formatDate(data.fechaPresentacion)}
                </span>
              </div>
              <div className="declaration-expiry-field flex flex-nowrap items-baseline py-1 w-full">
                <span className="w-[290px] shrink-0 font-bold text-slate-600 text-[11px] uppercase tracking-wide pr-2">
                  Fecha vencimiento
                </span>
                <span className="min-w-0 flex-1 text-[18px] font-bold text-red-600 whitespace-normal break-words pl-3 ">
                  {formatDate(data.fechaVencimiento)}
                </span>
              </div>
            </div>

            <div className="cokifimi-legacy-expiry-note hidden text-center font-bold text-[10px] text-gray-900 my-2 uppercase tracking-wide leading-relaxed max-w-[640px] mx-auto">
              "Pasada la fecha de vencimiento, y cumplidos 5 días corridos, me notifico de la baja automática de mi matrícula provincial"
            </div>

            <p className="cokifimi-page1-legal cokifimi-declaration-text text-[16px] text-gray-800 text-justify leading-relaxed mb-4">
              Declaro bajo juramento que los datos consignados en la presente son <strong>VERDADEROS</strong>, aceptando como válidas todas las notificaciones que se realicen en el futuro en dichas direcciones (domicilio personal, laboral y/o correo electrónico), comprometiéndome a notificar al Colegio de todas las modificaciones de los mismos dentro de los 5 días hábiles subsiguientes. Declaro conocer las normas de la Ley I N° 55, Digesto Jurídico y Decreto N° 1291/90, Estatuto y Código de Ética, y toda otra disposición o resolución que se comunique a través de la página. <span className="underline font-semibold">www.cokifimi.org</span>
            </p>

            <div className="flex flex-col gap-y-0 mt-1 max-w-[640px] mx-auto w-full fields-grid">
              {page1Fields.map(renderField)}
            </div>
          </div>

          <div
            className="flex items-center justify-between text-[10px] text-gray-400 font-mono mt-6 pt-2 border-t border-gray-100"
            style={{ position: 'absolute', left: '1.5rem', right: '1.5rem', bottom: '1.5rem', margin: 0 }}
          >
            <span>COKIFIMI DECLARACIÓN JURADA </span>
            <span>PÁGINA 1 DE 2</span>
          </div>
        </section>

        <section
          className="print-only-page bg-white p-4 md:p-6 shadow-xl border border-gray-200 rounded-[28px] mx-auto w-full max-w-[800px] aspect-[1/1.414] print:shadow-none print:border-none print:p-0 print:rounded-none print:m-0 print:max-w-none print:w-full print:aspect-auto flex flex-col justify-between"
          id="print-page-2"
          data-many-consultorios={((data.consultorios?.length || 0) >= 3) ? "true" : "false"}
          style={{ position: 'relative' }}
        >
          <img src={cokifimiLogo} alt="" aria-hidden="true" className="cokifimi-declaration-watermark" />
          <div className="pt-0 w-full">
            <div className="flex flex-col gap-y-0 mt-2 max-w-[640px] mx-auto w-full fields-grid">
              {page2Fields.map(renderField)}
            </div>
          </div>

          <div style={{ position: 'absolute', left: '1.5rem', right: '1.5rem', bottom: '1.5rem', margin: 0 }}>
            <div className="cokifimi-photo-print-placement flex flex-col items-center justify-center mb-4">
              <div className="w-[170px] h-[220px] border border-gray-300 bg-gray-50 flex flex-col items-center justify-center shadow-sm relative overflow-hidden rounded-md">
                {data.fotoUrl ? (
                  <img
                    src={data.fotoUrl}
                    alt="Foto carnet"
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="text-xs font-extrabold text-gray-400 text-center uppercase p-4 leading-tight">
                    Sin fotografía de carnet
                    <span className="block text-[9px] font-normal text-gray-400 mt-2">
                      Pegar foto de 4x4 cm
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="cokifimi-legal-block max-w-[640px] mx-auto text-justify text-[16px] text-gray-800 leading-snug mb-5">
              <div className="font-bold text-center uppercase tracking-wide mb-2">
                "Pasada la fecha de vencimiento, y cumplidos 5 días corridos, me notifico de la baja automática de mi matrícula provincial"
              </div>
              <p className="cokifimi-declaration-text cokifimi-token-legal m-0">Acepto que esta declaración jurada, al estar realizada con mi clave única digital (TOKEN), la que identifica mi firma para todo trámite digital en este Colegio, tiene carácter de documento legal con firma certificada. Cualquier falsedad en los datos declarados u omisión de datos, tales como no declarar mi actividad en consultorios, no habilitar un consultorio o permitir la práctica de personas no matriculadas en este Colegio, así como cualquier otro dato falso u omitido, constituirá un acto ilegal penal. Este Colegio denunciará dichas situaciones ante las autoridades competentes y aplicará, por las facultades otorgadas por el Gobierno de la Provincia en la Ley I N° 55, su Decreto Reglamentario, el Estatuto vigente y las resoluciones de Asamblea, órgano soberano de este Colegio, las sanciones y multas que correspondan de pleno derecho.</p>
            </div>
            <div className="grid grid-cols-2 gap-8 border-t border-gray-200 pt-4 mt-3">
              <div className="flex flex-col justify-end text-center">
                <span className="font-sans text-base font-bold text-gray-900 pb-0.5">
                  {formatDate(data.fechaPresentacion)}
                </span>
                <span className="text-[10.5px] font-extrabold text-gray-500 uppercase tracking-wider">
                  Fecha de Presentación
                </span>
              </div>

              <div className="flex flex-col items-center text-center justify-end">
                <div className="w-full max-w-[180px] border-b border-gray-300 h-10 mb-2"></div>
                <span className="font-sans text-base font-bold text-gray-900 uppercase">
                  {data.apellido} {data.nombres}
                </span>
                <span className="text-[10.5px] font-extrabold text-gray-500 uppercase tracking-wider">
                  Matrícula N° {data.matricula}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[8px] text-gray-400 font-mono mt-4 pt-2 border-t border-gray-100">
              <span>COKIFIMI DECLARACIÓN JURADA </span>
              <span>PÁGINA 2 DE 2</span>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
