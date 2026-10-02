import { jsPDF } from 'jspdf';
import { DeclarationData } from '../types';
// @ts-ignore
import selloFirma from '@/sellofirma.png?inline';
// @ts-ignore
import logoInstitucional from '@/logo.png?inline';

const dateText = (value = new Date().toISOString()) => new Date(value).toLocaleDateString('es-AR');
const safeName = (data: DeclarationData) => `${data.apellido}_${data.nombres}`.replace(/[^a-z0-9_-]+/gi, '_');

const institutional = {
  college: 'Colegio de',
  name: 'Kinesi\u00f3logos y Fisioterapeutas',
  location: 'de Misiones',
  legal: 'Ley I N\u00b0 55 \u00b7 Personer\u00eda Jur\u00eddica N\u00b0 894',
  address: 'Ram\u00f3n Garc\u00eda N\u00b0 942 (ex.134) \u00b7 Posadas \u2013 Misiones',
  contact: 'Tel: 03764421795 \u00b7 colegiokinesiologosmisiones@gmail.com',
};

function baseDocument(title: string, subtitle: string) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, 210, 52, 'F');
  pdf.addImage(logoInstitucional, 'PNG', 14, 5, 55, 45);
  pdf.setTextColor(23, 56, 46);
  pdf.setFont('times', 'bold');
  pdf.setFontSize(13);
  pdf.text(institutional.college, 135, 9, { align: 'center' });
  pdf.text(institutional.name, 135, 16, { align: 'center' });
  pdf.text(institutional.location, 135, 23, { align: 'center' });
  pdf.setFontSize(10);
  pdf.text(institutional.legal, 135, 30, { align: 'center' });
  pdf.text(institutional.address, 135, 37, { align: 'center' });
  pdf.text(institutional.contact, 135, 44, { align: 'center' });
  pdf.setFontSize(13);
  pdf.text(title, 105, 53, { align: 'center' });
  pdf.setDrawColor(23, 56, 46);
  pdf.line(24, 55, 186, 55);
  try {
    pdf.saveGraphicsState();
    const GStateCtor = (pdf as any).GState;
    if (typeof GStateCtor === 'function') {
      // Some jspdf builds expose a GState constructor
      pdf.setGState(new GStateCtor({ opacity: 0.22 }));
    } else if (typeof (pdf as any).setGState === 'function') {
      // Fallback: call setGState with a plain object if supported
      (pdf as any).setGState({ opacity: 0.22 });
    }
    pdf.addImage(logoInstitucional, 'PNG', 25, 64, 160, 160);
    pdf.restoreGraphicsState();
  } catch {
    pdf.addImage(logoInstitucional, 'PNG', 25, 64, 160, 160);
  }
  if (subtitle) {
    pdf.setFontSize(12);
    pdf.text(subtitle, 105, 61, { align: 'center' });
  }
  return pdf;
}

function addPhoto(pdf: jsPDF, photoUrl: unknown, y = 64) {
  if (typeof photoUrl !== 'string' || !photoUrl) return;
  try { pdf.addImage(photoUrl, photoUrl.includes('image/png') ? 'PNG' : 'JPEG', 82, y, 46, 46); } catch { /* Foto opcional */ }
}

function addCompactClause(pdf: jsPDF, text: string, y: number) {
  const lines = pdf.splitTextToSize(`- ${text}`, 174);
  pdf.text(lines, 18, y, { align: 'left', lineHeightFactor: 1.12 });
  return y + lines.length * 2.75 + 1.1;
}

export function generateAutomaticCertificates(data: DeclarationData, options?: { libreDeudaApprovalDate?: string; libreDeudaExpiryDate?: string }) {
  const form = data.formularioHabilitacionConsultorio || {};
  const fullName = `${data.apellido}, ${data.nombres}`;
  const today = dateText();
  const version = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const consultorio = String(form.localidadConsultorio || data.municipioLocalidad || 'la localidad declarada');
  const address = [form.domicilioConsultorio, form.numeroConsultorio]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ') || 'el domicilio declarado';
  const attachedProfessionals = ['', ...Array.from({ length: 7 }, (_, index) => String(index + 2))]
    .map((suffix) => ({
      titulo: String(form[`adjuntoTitulo${suffix}`] || '').trim(),
      apellido: String(form[`adjuntoApellido${suffix}`] || '').trim(),
      nombres: String(form[`adjuntoNombres${suffix}`] || '').trim(),
      matricula: String(form[`adjuntoMatricula${suffix}`] || '').trim(),
    }))
    .filter((person) => person.apellido || person.nombres || person.matricula);
  const degree = data.tituloUniversitario || 'Lic. en Kinesiolog\u00eda y Fisiatr\u00eda';
  const months = Number(String(form.mesesHabilitacion || form.periodoHabilitacion || '').match(/6|12|24/)?.[0] || 6);
  const parseDate = (value: unknown) => {
    const text = String(value || '').trim();
    if (!text) return null;
    const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    const reversed = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
    if (reversed) return new Date(Number(reversed[3]), Number(reversed[2]) - 1, Number(reversed[1]));
    const date = new Date(text);
    return Number.isNaN(date.getTime()) ? null : date;
  };
  const emissionDate = parseDate(form.certificadoVigenciaDesde) || new Date();
  const expiryDate = parseDate(form.certificadoVigenciaHasta) || new Date(emissionDate);
  if (!form.certificadoVigenciaHasta) expiryDate.setMonth(expiryDate.getMonth() + months);
  const libreDeudaSolicitud = data.libreDeudaSolicitud;
  const libreDeudaEmissionDate = parseDate(options?.libreDeudaApprovalDate) || parseDate(libreDeudaSolicitud?.revisadoAt) || new Date();
  const libreDeudaExpiryDate = parseDate(options?.libreDeudaExpiryDate) || parseDate(libreDeudaSolicitud?.venceAt) || new Date(libreDeudaEmissionDate);
  if (!options?.libreDeudaExpiryDate && !libreDeudaSolicitud?.venceAt) libreDeudaExpiryDate.setDate(libreDeudaExpiryDate.getDate() + 60);
  const storageDate = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  const displayDate = (value: Date) => `${String(value.getDate()).padStart(2, '0')}-${String(value.getMonth() + 1).padStart(2, '0')}-${value.getFullYear()}`;
  const vigenciaDesde = storageDate(emissionDate);
  const vigenciaHasta = storageDate(expiryDate);
  const vigenciaDesdeTexto = displayDate(emissionDate);
  const vigenciaHastaTexto = displayDate(expiryDate);
  const libreDeudaDesdeTexto = displayDate(libreDeudaEmissionDate);
  const libreDeudaHastaTexto = displayDate(libreDeudaExpiryDate);

  const habilitacion = baseDocument('CERTIFICADO DE HABILITACI\u00d3N DE CONSULTORIO / \u00c1REA KIN\u00c9SICA.', '');
  habilitacion.setFont('times', 'normal');
  habilitacion.setFontSize(11.2);
  const contentLeft = 20;
  const habilitationText = `Esta habilitaci\u00f3n No autoriza // No habilita la pr\u00e1ctica de estudiantes // alumnos // pasantes de las carreras de kinesiolog\u00eda en ning\u00fan consultorio particular // si las mismas se realizar\u00e1n es ilegal.-` +
    ` Habilita el Consultorio / \u00c1rea Kin\u00e9sica sito en ${address} de la ciudad de ${consultorio} - Misiones para la pr\u00e1ctica de la kinesiolog\u00eda, en un todo de acuerdo a lo dispuesto en la Ley I N\u00ba 55 Digesto Jur\u00eddico de la Provincia, su Decreto Reglamentario 1291/90 y Estatuto Vigente.-`;
  const habilitationLines = habilitacion.splitTextToSize(habilitationText, 170);
  // Acercamos el texto al título y el bloque del titular al texto principal.
  const habilitationTextY = 60;
  habilitacion.text(habilitationLines, contentLeft, habilitationTextY, { align: 'justify', maxWidth: 170, lineHeightFactor: 1.55 });
  const responsibilityY = habilitationTextY + habilitationLines.length * 6.1 + 1.5;
  habilitacion.setFont('times', 'bold');
  habilitacion.setFontSize(12.5);
  habilitacion.text('Titular profesional responsable del mismo', 105, responsibilityY, { align: 'center' });
  const responsibilityText = 'Titular profesional responsable del mismo';
  const responsibilityWidth = habilitacion.getTextWidth(responsibilityText);
  habilitacion.line(105 - responsibilityWidth / 2, responsibilityY + 1.5, 105 + responsibilityWidth / 2, responsibilityY + 1.5);
  const professionalY = responsibilityY + 10;
  habilitacion.setFontSize(13);
  habilitacion.text(degree, 105, professionalY, { align: 'center' });
  habilitacion.text(fullName, 105, professionalY + 9, { align: 'center' });
  const photoY = professionalY + 17;
  addPhoto(habilitacion, data.fotoUrl, photoY);
  habilitacion.setFontSize(12.5);
  const detailsY = photoY + 54;
  habilitacion.text(`Matrícula Provincial: N° ${data.matricula || '—'}.-`, 105, detailsY, { align: 'center' });
  habilitacion.text(`D.N.I: N° ${data.dni || '—'}.-`, 105, detailsY + 8, { align: 'center' });

  // Reservamos una franja compacta para los adjuntos y dejamos libre el pie/firma.
  // Sin adjuntos, dejamos más aire entre el DNI del titular y la vigencia.
  let dateY = detailsY + (attachedProfessionals.length ? 12 : 17);
  if (attachedProfessionals.length) {
    habilitacion.setFont('times', 'bold');
    habilitacion.setFontSize(9.5);
    habilitacion.text('Profesionales Adjuntos', 105, dateY, { align: 'center' });
    dateY += 3.5;
    habilitacion.setFont('times', 'normal');
    if (attachedProfessionals.length > 2) {
      // Con más de dos adjuntos, una lista vertical invade la firma y el pie.
      habilitacion.setFontSize(7.6);
      const columnX = [55, 105, 155];
      const columnWidth = 48;
      const rowHeight = 8.5;
      attachedProfessionals.forEach((person, index) => {
        const attachedName = [person.nombres, person.apellido].filter(Boolean).join(' ');
        const attachedMatricula = person.matricula ? ` - M.P. ${person.matricula}` : '';
        const lines = habilitacion.splitTextToSize(`${attachedName}${attachedMatricula}`, columnWidth);
        const row = Math.floor(index / 3);
        const column = index % 3;
        habilitacion.text(lines.slice(0, 2), columnX[column], dateY + row * rowHeight, {
          align: 'center',
          maxWidth: columnWidth,
          lineHeightFactor: 0.9,
        });
      });
      dateY += Math.ceil(attachedProfessionals.length / 3) * rowHeight + 1.5;
    } else {
      habilitacion.setFontSize(9);
      attachedProfessionals.forEach((person) => {
        const attachedName = [person.nombres, person.apellido].filter(Boolean).join(' ');
        const attachedMatricula = person.matricula ? ` - M.P. ${person.matricula}` : '';
        habilitacion.text(`${attachedName}${attachedMatricula}`, 105, dateY, { align: 'center' });
        dateY += 3.5;
      });
      dateY += 1.5;
    }
  }
  habilitacion.setFont('times', 'bold');
  habilitacion.setFontSize(13.5);
  // Acercamos la vigencia al bloque de adjuntos y conservamos aire antes del pie.
  habilitacion.text(`Fecha de Vigencia: Desde: ${vigenciaDesdeTexto} -/- Hasta: ${vigenciaHastaTexto}`, 105, dateY, { align: 'center' });
  habilitacion.setFont('times', 'normal');
  // Se elimina la línea divisoria del bloque inferior para dejar una composición más limpia.
  // Condiciones legales: más legibles sin invadir el área reservada para firma.
  habilitacion.setFontSize(9);
  let clauseY = dateY + 4;
  const addCertificateCondition = (text: string, y: number) => {
    const lines = habilitacion.splitTextToSize(`\u2022 ${text}`, 174);
    habilitacion.text(lines, 18, y, { align: 'left', lineHeightFactor: 0.95 });
    return y + lines.length * 3.6 + 0.35;
  };
  const openingCondition = habilitacion.splitTextToSize(
    'Las presentes condiciones son de cumplimiento obligatorio para el profesional titular y para el/los profesional/es adjunto/s, cuando corresponda.',
    174,
  );
  habilitacion.text(openingCondition, 18, clauseY, { align: 'left', lineHeightFactor: 0.95 });
  clauseY += openingCondition.length * 3.6 + 0.35;
  clauseY = addCertificateCondition('La habilitación deberá renovarse desde VEINTICINCO (25) días corridos antes de su vencimiento y hasta CINCO (5) días corridos posteriores. Vencido dicho plazo, quedará suspendida y podrán aplicarse las sanciones correspondientes, conforme a la normativa vigente.', clauseY);
  clauseY = addCertificateCondition('Deberán encontrarse al día la cuota societaria del mes en curso y vigentes el seguro de mala praxis y la inscripción ante ANSSAL.', clauseY);
  clauseY = addCertificateCondition('El consultorio deberá estar debidamente identificado, indicando título profesional, apellido y nombre, y número de matrícula provincial del titular y de los adjuntos, cuando corresponda.', clauseY);
  clauseY = addCertificateCondition('El Colegio podrá revocar la habilitación ante causas fundadas, conforme a la normativa vigente.', clauseY);
  addCertificateCondition('No se podrán atender pacientes menores de edad sin la presencia de sus padres, tutores o representantes legales.', clauseY);
  habilitacion.addImage(selloFirma, 'PNG', 35, 253, 140, 40);

  const etica = baseDocument('CERTIFICADO DE \u00c9TICA /// MATR\u00cdCULA /// LIBRE DE DEUDA.', '');
  etica.setFont('times', 'normal');
  etica.setFontSize(11.2);
  const ethicsText = `El Colegio de Kinesi\u00f3logos y Fisioterapeutas de Misiones CERTIFICA que el profesional ha CUMPLIMENTADO TODO LO DISPUESTO POR LA LEY N\u00b0 I N\u00ba 55 del Digesto Jur\u00eddico, que rige la profesi\u00f3n en la Provincia; no teniendo a la fecha apercibimiento o sanci\u00f3n disciplinaria alguna, y teniendo sus pagos de cuota/s por matr\u00edcula regularizados a la fecha.-`;
  const ethicsLines = etica.splitTextToSize(ethicsText, 170);
  etica.text(ethicsLines, 20, 72, { align: 'justify', maxWidth: 170, lineHeightFactor: 1.55 });
  const requestY = 72 + ethicsLines.length * 6.1 + 9;
  etica.text('A pedido del interesado y al efecto de ser presentado ante quien corresponda.', 20, requestY, { maxWidth: 170 });
  etica.text(`Se extiende el presente certificado con fecha ${libreDeudaDesdeTexto}.-`, 20, requestY + 10);
  etica.setFont('times', 'bold');
  etica.setFontSize(13);
  etica.text(degree, 105, requestY + 23, { align: 'center' });
  etica.text(fullName, 105, requestY + 31, { align: 'center' });
  addPhoto(etica, data.fotoUrl, requestY + 35);
  etica.setFontSize(12.5);
  etica.text(`Matr\u00edcula Provincial: N\u00b0 ${data.matricula || '\u2014'}.-`, 105, requestY + 87, { align: 'center' });
  etica.text(`D.N.I: N\u00b0 ${data.dni || '\u2014'}.-`, 105, requestY + 95, { align: 'center' });
  etica.addImage(selloFirma, 'PNG', 37, 238, 136, 40);
  etica.setFontSize(7);
  etica.text(`Vigencia: Desde ${libreDeudaDesdeTexto} hasta ${libreDeudaHastaTexto}.`, 105, 278, { align: 'center', maxWidth: 170 });
  etica.text('El certificado de \u00e9tica / matr\u00edcula / libre deuda tiene una validez de 60 d\u00edas a partir de la fecha de emisi\u00f3n.-', 105, 286, { align: 'center', maxWidth: 170 });

  return {
    consultorioUrl: habilitacion.output('datauristring'),
    consultorioNombre: `Certificado_Habilitacion_${safeName(data)}_${version}.pdf`,
    eticaUrl: etica.output('datauristring'),
    eticaNombre: `Certificado_Etica_Libre_Deuda_${safeName(data)}_${version}.pdf`,
    vigenciaDesde,
    vigenciaHasta,
  };
}
