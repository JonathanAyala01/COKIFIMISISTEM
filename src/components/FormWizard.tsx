import React, { useState, useRef, useEffect } from 'react';
import { MISIONES_LOCALITIES_WITH_POSTAL_CODE, MISIONES_LOCALITY_OPTIONS, MISIONES_LOCALITY_POSTAL_BY_NAME, MISIONES_LOCALITY_SET, normalizeMisionesLocality } from '../data/misionesLocalities';
import {
  ChevronRight,
  ChevronLeft,
  Save,
  FileText,
  User,
  Phone,
  GraduationCap,
  Briefcase,
  Camera,
  AlertCircle,
  Info,
  Upload,
  CheckCircle
} from 'lucide-react';
import { KINESIOLOGY_TITLES } from '../constants/titles';
import { DeclarationData, ConsultorioData, MOCK_RONNY_MISHEL, INITIAL_DECLARATION } from '../types';
import { getServerDate, lookupServerRecord } from '../api';
const currentDateString = () => new Date().toISOString().slice(0, 10);

const DEFAULT_MISIONES_CITIES = [
  "APÓSTOLES",
  "ARISTÓBULO DEL VALLE",
  "CAMPO GRANDE",
  "CERRO AZUL",
  "CONCEPCIÓN DE LA SIERRA",
  "DOS DE MAYO",
  "ELDORADO",
  "EL SOBERBIO",
  "JARDÍN AMÉRICA",
  "LEANDRO N. ALEM",
  "LIBERTAD",
  "MONTECARLO",
  "OBERÁ",
  "POSADAS",
  "PUERTO ESPERANZA",
  "PUERTO IGUAZÚ",
  "PUERTO RICO",
  "SAN IGNACIO",
  "SAN PEDRO",
  "SAN VICENTE",
  "SANTA ANA",
  "WANDA"
];

// Códigos postales de referencia para las localidades seleccionables de Misiones.
// Se mantiene el mismo orden que MISIONES_CITIES para evitar que el código pueda
// quedar desasociado de la localidad elegida.
const MISIONES_POSTAL_CODES = [
  "3350", "3352", "3362", "3313", "3355", "3364", "3380", "3364",
  "3328", "3315", "3374", "3384", "3360", "3300", "3378", "3370",
  "3334", "3322", "3352", "3364", "3306", "3376"
];

const MISIONES_POSTAL_BY_CITY = { ...Object.fromEntries([...MISIONES_LOCALITIES_WITH_POSTAL_CODE, ...DEFAULT_MISIONES_CITIES.map((city, index) => [city, MISIONES_POSTAL_CODES[index]] as const)]), ...MISIONES_LOCALITY_POSTAL_BY_NAME } as Record<string, string>;

// Incluye las localidades provistas por el Colegio y conserva las opciones
// históricas del formulario, para no afectar declaraciones ya cargadas.
const MISIONES_CITIES = Array.from(
  new Set([
    ...MISIONES_LOCALITIES_WITH_POSTAL_CODE.map(([locality]) => locality),
    ...DEFAULT_MISIONES_CITIES,
  ])
);

const PARAGUAYAN_DEPARTMENTS = [
  "ALTO PARANÁ",
  "AMAMBAY",
  "ASUNCIÓN (DISTRITO CAPITAL)",
  "BOQUERÓN",
  "CAAGUAZÚ",
  "CAAZAPÁ",
  "CANINDEYÚ",
  "CENTRAL",
  "CONCEPCIÓN",
  "CORDILLERA",
  "GUAIRÁ",
  "ITAPÚA",
  "MISIONES",
  "ÑEEMBUCÚ",
  "PARAGUARÍ",
  "PRESIDENTE HAYES",
  "SAN PEDRO"
];

const BRAZILIAN_STATES = [
  "ACRE",
  "ALAGOAS",
  "AMAPÁ",
  "AMAZONAS",
  "BAHIA",
  "CEARÁ",
  "DISTRITO FEDERAL",
  "ESPÍRITO SANTO",
  "GOIÁS",
  "MARANHÃO",
  "MATO GROSSO",
  "MATO GROSSO DO SUL",
  "MINAS GERAIS",
  "PARÁ",
  "PARAIBA",
  "PARANÁ",
  "PERNAMBUCO",
  "PIAUÍ",
  "RIO DE JANEIRO",
  "RIO GRANDE DO NORTE",
  "RIO GRANDE DO SUL",
  "RONDÔNIA",
  "RORAIMA",
  "SANTA CATARINA",
  "SÃO PAULO",
  "SERGIPE",
  "TOCANTINS"
];

const PARAGUAYAN_CITIES_BY_DEPT: Record<string, string[]> = {
  "ITAPÚA": [
    "ENCARNACIÓN",
    "CAMBYRETÁ",
    "CORONEL BOGADO",
    "BELLA VISTA",
    "HOHENAU",
    "OBLIGADO",
    "CARMEN DEL PARANÁ",
    "SAN COSME Y DAMIÁN",
    "SAN PEDRO DEL PARANÁ",
    "PIRAPÓ"
  ],
  "ASUNCIÓN (DISTRITO CAPITAL)": [
    "ASUNCIÓN"
  ],
  "CENTRAL": [
    "LUQUE",
    "SAN LORENZO",
    "CAPIATÁ",
    "LAMBARÉ",
    "FERNANDO DE LA MORA",
    "LIMPIO",
    "NEMBY",
    "VILLA ELISA",
    "MARIANO ROQUE ALONSO",
    "ITAUGRÁ"
  ],
  "ALTO PARANÁ": [
    "CIUDAD DEL ESTE",
    "HERNANDARIAS",
    "PRESIDENTE FRANCO",
    "MINGA GUAZÚ",
    "SANTA RITA"
  ],
  "MISIONES": [
    "SAN JUAN BAUTISTA",
    "SAN IGNACIO",
    "SANTA ROSA",
    "AYOLAS",
    "SANTIAGO"
  ]
};

const ARGENTINE_PROVINCES = [
  "BUENOS AIRES",
  "CATAMARCA",
  "CHACO",
  "CHUBUT",
  "CIUDAD AUTÓNOMA DE BUENOS AIRES",
  "CÓRDOBA",
  "CORRIENTES",
  "ENTRE RÍOS",
  "FORMOSA",
  "JUJUY",
  "LA PAMPA",
  "LA RIOJA",
  "MENDOZA",
  "MISIONES",
  "NEUQUÉN",
  "RÍO NEGRO",
  "SALTA",
  "SAN JUAN",
  "SAN LUIS",
  "SANTA CRUZ",
  "SANTA FE",
  "SANTIAGO DEL ESTERO",
  "TUCUMÁN"
];

const BRAZILIAN_CITIES_BY_STATE: Record<string, string[]> = {
  "PARANÁ": [
    "FOZ DO IGUAÇU",
    "CURITIBA",
    "LONDRINA",
    "MARINGÁ",
    "PONTA GROSSA",
    "CASCAVEL",
    "SÃO JOSÉ DOS PINHAIS"
  ],
  "RIO GRANDE DO SUL": [
    "PORTO ALEGRE",
    "CAXIAS DO SUL",
    "CANOAS",
    "PELOTAS",
    "SANTA MARIA",
    "URUGUAIANA",
    "PASSO FUNDO"
  ],
  "SANTA CATARINA": [
    "FLORIANÓPOLIS",
    "JOINVILLE",
    "BLUMENAU",
    "CHAPECÓ",
    "CRICIÚMA",
    "ITAJAÍ",
    "BALNEÁRIO CAMBORIÚ"
  ]
};
const ARGENTINE_KINESIOLOGY_UNIVERSITIES = [
  "UNIVERSIDAD ABIERTA INTERAMERICANA (UAI)",
  "UNIVERSIDAD ADVENTISTA DEL PLATA (UAP)",
  "UNIVERSIDAD CATÓLICA ARGENTINA (UCA)",
  "UNIVERSIDAD DEL SALVADOR (USAL)",
  "UNIVERSIDAD DE MORÓN",
  "UNIVERSIDAD FASTA",
  "UNIVERSIDAD FAVALORO",
  "UNIVERSIDAD FUNDACIÓN BARCELOT H.A (CTES)",
  "UNIVERSIDAD GASTÓN DACHARY (UGD)",
  "UNIVERSIDAD ISALUD",
  "UNIVERSIDAD NACIONAL DE MISIONES (UNaM)",
  "UNIVERSIDAD NACIONAL DE BUENOS AIRES (UBA)",
  "UNIVERSIDAD NACIONAL DE CÓRDOBA (UNC)",
  "UNIVERSIDAD NACIONAL DE ROSARIO (UNR)",
  "UNIVERSIDAD NACIONAL DE LA PLATA (UNLP)",
  "UNIVERSIDAD NACIONAL DEL NORDESTE (UNNE)",
  "UNIVERSIDAD NACIONAL DEL LITORAL (UNL)",
  "UNIVERSIDAD NACIONAL DE TUCUMÁN (UNT)",
  "UNIVERSIDAD NACIONAL DE ENTRE RÍOS (UNER)",
  "UNIVERSIDAD NACIONAL DE MAR DEL PLATA (UNMdP)",
  "UNIVERSIDAD NACIONAL DE SAN MARTÍN (UNSAM)",
  "UNIVERSIDAD NACIONAL DE HURLINGHAM (UNAHUR)",
  "UNIVERSIDAD NACIONAL DE LA MATANZA (UNLaM)",
  "UNIVERSIDAD NACIONAL DE QUILMES (UNQ)",
  "OTRA"
];
// KINESIOLOGY_TITLES imported from src/constants/titles

const EMPTY_CONSULTORIO: ConsultorioData = {
  domicilio: '', numeracion: '', ciudad: '', esTitularConsultorio: 'NO', esProfesionalAdjunto: 'NO',
  nombreTitularConsultorio: '', fechaInicioConsultorio: '', numeroMatriculaConsultorio: ''
};

interface FormWizardProps {
  initialData: DeclarationData;
  onSave: (data: DeclarationData) => void;
  onReview?: (data: DeclarationData) => void;
  onCancel: () => void;
  readOnlyDates?: boolean;
  lockedEmail?: boolean;
  showMatriculationAdminNotice?: boolean;
  hideMatriculationDate?: boolean;
  memberInfoOnly?: boolean;
}

export default function FormWizard({ initialData, onSave, onReview, onCancel, readOnlyDates = false, lockedEmail = false, showMatriculationAdminNotice = false, hideMatriculationDate = false, memberInfoOnly = false }: FormWizardProps) {
  // Normalize initial data: if tituloUniversitario is exactly 'OTRO' (no extra text),
  // treat it as empty so the placeholder 'SELECCIONE TÍTULO' is shown by default.
  const normalizedInitialData: DeclarationData = { ...initialData };
  let initialOtro = false;
  const rawTitulo = String(initialData.tituloUniversitario || "").trim();
  if (rawTitulo === "OTRO") {
    normalizedInitialData.tituloUniversitario = "";
  }

  const [formData, setFormData] = useState<DeclarationData>(normalizedInitialData);
  const serverDateLocked = !initialData.id || !initialData.createdAt || !initialData.fechaPresentacion;
  const dateInputLocked = readOnlyDates || serverDateLocked;
  useEffect(() => {
    if (!serverDateLocked) return;
    let active = true;
    const applyServerDate = (presentationDate: string) => {
      const [year, month, day] = presentationDate.split('-').map(Number);
      if (!year || !month || !day) return;
      const expiry = new Date(year + 2, month - 1, day);
      const expiryDate = `${expiry.getFullYear()}-${String(expiry.getMonth() + 1).padStart(2, '0')}-${String(expiry.getDate()).padStart(2, '0')}`;
      setFormData((current) => ({ ...current, fechaPresentacion: presentationDate, fechaVencimiento: expiryDate }));
    };
    void getServerDate()
      .then((date) => {
        if (active && /^\d{4}-\d{2}-\d{2}$/.test(date)) applyServerDate(date);
      })
      .catch(() => {
        if (active) applyServerDate(currentDateString());
      });
    return () => { active = false; };
  }, [serverDateLocked]);
  const isAnyConsultorioAdjunto = (d: DeclarationData) => {
    // El informe sólo corresponde a un consultorio donde ambas condiciones
    // se cumplan: no es titular y sí es profesional adjunto.
    return (d.consultorios || []).some(
      (c) => c?.esTitularConsultorio === 'NO' && c?.esProfesionalAdjunto === 'SI',
    );
  };
  const [currentStep, setCurrentStep] = useState(5);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [otroTitulo, setOtroTitulo] = useState<boolean>(initialOtro);
  const [missingRequiredFields, setMissingRequiredFields] = useState<Array<{ label: string; step: number }>>([]);
  const [attachmentPreview, setAttachmentPreview] = useState<{ url: string; name: string } | null>(null);
  const [titularLookupLoading, setTitularLookupLoading] = useState<Record<number, boolean>>({});
  const [titularLookupMessage, setTitularLookupMessage] = useState<Record<number, string>>({});
  const attachmentPreviewDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = attachmentPreviewDialogRef.current;
    if (!dialog) return;
    if (attachmentPreview && !dialog.open) dialog.showModal();
    if (!attachmentPreview && dialog.open) dialog.close();
  }, [attachmentPreview]);

  const isValidCuilCuit = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.length !== 11) return false;

    const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    const total = weights.reduce((sum, weight, index) => sum + Number(digits[index]) * weight, 0);
    const remainder = total % 11;
    const checkDigit = remainder === 0 ? 0 : remainder === 1 ? 9 : 11 - remainder;
    return checkDigit === Number(digits[10]);
  };

  // Auto-calculate expiration date when presentation date changes (2 years later)
  useEffect(() => {
    if (formData.fechaPresentacion) {
      try {
        let date: Date | null = null;
        if (formData.fechaPresentacion.includes('-')) {
          const parts = formData.fechaPresentacion.split('-');
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const day = parseInt(parts[2], 10);
              date = new Date(year, month, day);
            } else {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              date = new Date(year, month, day);
            }
          }
        } else if (formData.fechaPresentacion.includes('/')) {
          const parts = formData.fechaPresentacion.split('/');
          if (parts.length === 3) {
            if (parts[2].length === 4) {
              const day = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const year = parseInt(parts[2], 10);
              date = new Date(year, month, day);
            } else {
              const year = parseInt(parts[0], 10);
              const month = parseInt(parts[1], 10) - 1;
              const day = parseInt(parts[2], 10);
              date = new Date(year, month, day);
            }
          }
        }

        if (date && !isNaN(date.getTime())) {
          date.setFullYear(date.getFullYear() + 2);
          
          const expYear = date.getFullYear();
          const expMonth = String(date.getMonth() + 1).padStart(2, '0');
          const expDay = String(date.getDate()).padStart(2, '0');
          
          const targetVencimiento = `${expYear}-${expMonth}-${expDay}`;
          if (formData.fechaVencimiento !== targetVencimiento) {
            setFormData(prev => ({
              ...prev,
              fechaVencimiento: targetVencimiento
            }));
          }
        }
      } catch (e) {
        console.error('Error calculating expiry date', e);
      }
    }
  }, [formData.fechaPresentacion, formData.fechaVencimiento]);

  useEffect(() => {
    const codigoPostal = MISIONES_POSTAL_BY_CITY[normalizeMisionesLocality(formData.municipioLocalidad)] || '';
    if (formData.codigoPostal !== codigoPostal) {
      setFormData(prev => ({ ...prev, codigoPostal }));
    }
  }, [formData.municipioLocalidad, formData.codigoPostal]);

  const steps = [
    { id: 'matricula', title: 'Matrícula', icon: FileText, desc: 'Datos del Colegio' },
    { id: 'personales', title: 'Personales', icon: User, desc: 'Identidad y Nacimiento' },
    { id: 'contacto', title: 'Contacto', icon: Phone, desc: 'Domicilio y Teléfonos' },
    { id: 'educacion', title: 'Educación', icon: GraduationCap, desc: 'Títulos y Universidad' },
    { id: 'actividad', title: 'Actividad', icon: Briefcase, desc: 'Ejercicio Profesional' },
    { id: 'foto', title: 'Fotografía', icon: Camera, desc: 'Foto de Carnet' }
  ];
  // Orden visual del stepper; las secciones y su lógica interna permanecen iguales.
  const stepperSteps = [steps[5], steps[0], steps[1], steps[2], steps[3], steps[4]];

  const updateField = (field: keyof DeclarationData, value: any) => {
    setFormData(prev => {
      if (field === "trabajaConsultorio" && value !== "SI") {
        return { ...prev, [field]: value, consultorios: [], cantidadConsultorios: 1, esProfesionalAdjunto: "NO" };
      }
      if (field === "atiendeObrasSociales" && value !== "SI") {
        return { ...prev, [field]: value, poseeAnssal: "NO" };
      }
      if (field === "atiendeObrasSociales" && value === "SI") {
        return { ...prev, [field]: value, poseeAnssal: "SI" };
      }
      return { ...prev, [field]: value };
    });
  };

  useEffect(() => {
    const consultorios = formData.consultorios || [];
    const normalized = consultorios.map(consultorio =>
      consultorio?.esTitularConsultorio === "NO" && consultorio.esProfesionalAdjunto !== "SI"
        ? { ...consultorio, esProfesionalAdjunto: "SI" as const }
        : consultorio,
    );
    if (normalized.some((consultorio, index) => consultorio !== consultorios[index])) {
      setFormData(prev => ({ ...prev, consultorios: normalized }));
    }
  }, [formData.consultorios]);

  const lookupTitularConsultorio = async (index: number) => {
    const consultorio = formData.consultorios?.[index] || EMPTY_CONSULTORIO;
    const matricula = String(consultorio.numeroMatriculaConsultorio || '').trim();
    if (!matricula) { setTitularLookupMessage(current => ({ ...current, [index]: 'Ingrese primero la matrícula del titular.' })); return; }
    setTitularLookupLoading(current => ({ ...current, [index]: true }));
    setTitularLookupMessage(current => ({ ...current, [index]: '' }));
    try {
      const found = await lookupServerRecord(matricula);
      if (!found) throw new Error('No se encontró un colegiado con esa matrícula.');
      const titularConsultorio = (found.consultorios || []).find(item => item.esTitularConsultorio === 'SI');
      const nombre = (String(found.apellido || '') + ', ' + String(found.nombres || '')).trim().replace(/^,\\s*/, '');
      const fecha = String(titularConsultorio?.fechaInicioConsultorio || found.fechaInicioConsultorio || '');
      if (!nombre && !fecha) throw new Error('No se encontraron datos del titular para esa matrícula.');
      setFormData(current => { const consultorios = [...(current.consultorios || [])]; consultorios[index] = { ...EMPTY_CONSULTORIO, ...(consultorios[index] || {}), numeroMatriculaConsultorio: matricula, nombreTitularConsultorio: nombre, fechaInicioConsultorio: fecha }; return { ...current, consultorios }; });
      setTitularLookupMessage(current => ({ ...current, [index]: 'Titular encontrado y datos cargados correctamente.' }));
} catch (error) {
      const message = error instanceof Error ? error.message : '';
      const cleanMessage = /error cr[ií]tico|<[^>]+>|internal_server_error/i.test(message)
        ? 'No se pudo buscar la matrícula en este momento. Intente nuevamente.'
        : message || 'No se pudo buscar la matrícula.';
      setTitularLookupMessage(current => ({ ...current, [index]: cleanMessage }));
    }
    finally { setTitularLookupLoading(current => ({ ...current, [index]: false })); }
  };
  const adjuntoFlag = isAnyConsultorioAdjunto(formData);

  const updateConsultorio = (index: number, field: keyof ConsultorioData, value: string) => {
    setFormData(prev => {
      const consultorios = [...(prev.consultorios || [])];
      while (consultorios.length <= index) consultorios.push({ ...EMPTY_CONSULTORIO });
      const nextConsultorio = {
        ...consultorios[index],
        [field]: value.toUpperCase(),
        ...(field === "esTitularConsultorio" && value.toUpperCase() === "NO"
          ? { esProfesionalAdjunto: "SI" as const }
          : {}),
      };
      consultorios[index] = nextConsultorio;
      const hasAdjuntoConsultorio = consultorios.some(c => c?.esTitularConsultorio === "NO" && c?.esProfesionalAdjunto === "SI");

      if (!hasAdjuntoConsultorio && field === "esProfesionalAdjunto" && value.toUpperCase() === "NO") {
        return { ...prev, consultorios, esProfesionalAdjunto: "NO" };
      }
      if (field === 'fechaInicioConsultorio') {
        return {
          ...prev,
          consultorios,
          fechaInicioConsultorio: value || prev.fechaInicioConsultorio,
          ...(!hasAdjuntoConsultorio ? { esProfesionalAdjunto: "NO" } : {}),
        };
      }

      return !hasAdjuntoConsultorio
        ? { ...prev, consultorios, esProfesionalAdjunto: "NO" }
        : { ...prev, consultorios };
    });
  };

  const updateCantidadConsultorios = (cantidad: 1 | 2 | 3 | 4) => {
    setFormData(prev => {
      const consultorios = [...(prev.consultorios || [])];
      while (consultorios.length < cantidad) consultorios.push({ ...EMPTY_CONSULTORIO });
      return { ...prev, cantidadConsultorios: cantidad, consultorios: consultorios.slice(0, cantidad) };
    });
  };

  const getMissingRequiredFields = (data: DeclarationData) => {
    const missing: Array<{ label: string; step: number }> = [];
    const add = (value: unknown, label: string, step: number) => {
      if (!String(value ?? '').trim()) missing.push({ label, step });
    };

    add(data.apellido, 'Apellido', 0);
    add(data.nombres, 'Nombre/s', 0);
    add(data.matricula, 'Nº Matrícula Profesional', 0);
    add(data.dni, 'D.N.I.', 1);
    add(data.cuilCuit, 'CUIL / CUIT', 1);
    add(data.fechaPresentacion, 'Fecha de Presentación', 0)
    add(data.fotoUrl, 'Fotografía obligatoria del colegiado', 5);
    add(data.fechaNacimiento, 'Fecha de Nacimiento', 1);
    add(data.provinciaNacimiento, 'Provincia de Nacimiento', 1);
    add(data.ciudadNacimiento, 'Ciudad de Nacimiento', 1);
    if (!['ARGENTINO/A', 'PARAGUAYO/A', 'BRASILEÑO/A'].includes(data.nacionalidad)) add(data.nacionalidad, 'Nacionalidad', 1);
    add(data.domicilioActual, 'Domicilio actual (calle)', 2);
    add(data.numeracionDomicilioActual, 'Numeración de casa / altura', 2);
    add(data.pisoDomicilioActual, 'Piso', 2);
    add(data.municipioLocalidad, 'Municipio / Localidad', 2)
    if (data.municipioLocalidad && !MISIONES_LOCALITY_SET.has(normalizeMisionesLocality(data.municipioLocalidad))) missing.push({ label: 'Seleccione una localidad válida de Misiones', step: 2 });;
    add(data.codigoPostal, 'Código Postal', 2);
    add(data.celular, 'Celular', 2);
    add(data.email.split('@')[0], 'E-Mail', 2);
    add(data.universidad, 'Universidad de egreso', 3);
    add(data.tituloUniversitario, 'Título Universitario', 3);
    add(data.fechaEmisionTitulo, 'Fecha de emisión del Título', 3);
    add(data.actividadPublica, 'Actividad profesional pública', 4);
    if (data.actividadPublica !== 'NO') {
      add(data.lugarActividadPublica, 'Lugar de actividad pública', 4);
      if (data.lugarActividadPublica === 'OTRAS') add(data.otroLugarActividadPublica, 'Otro lugar de actividad pública', 4);
    }
    if (data.trabajaConsultorio === 'SI') {
      const cantidad = data.cantidadConsultorios || data.consultorios?.length || 1;
      const consultorios = Array.from({ length: cantidad }, (_, index) => data.consultorios?.[index] || EMPTY_CONSULTORIO);
      consultorios.forEach((consultorio, index) => {
        const numero = index + 1;
        const titular = consultorio.esTitularConsultorio || 'NO';
        add(consultorio.domicilio, `Domicilio del consultorio ${numero}`, 4);
        add(consultorio.numeracion, `Numeración del consultorio ${numero}`, 4);
        add(consultorio.ciudad, `Ciudad del consultorio ${numero}`, 4);
        add(titular, `¿Es titular del consultorio ${numero}?`, 4);
        add(consultorio.fechaInicioConsultorio, `Fecha de inicio de actividad del consultorio ${numero}`, 4);
        if (titular !== 'SI') {
          add(consultorio.esProfesionalAdjunto, `¿Es profesional adjunto en el consultorio ${numero}?`, 4);
          add(consultorio.nombreTitularConsultorio, `Apellido y nombre del titular del consultorio ${numero}`, 4);
          add(consultorio.numeroMatriculaConsultorio, `Número de Matrícula del titular / habilitación ${numero}`, 4);
        }
      });
      add(data.esAuditorObraSocialArt, 'Auditor de obra social / ART', 4);
      if (data.esAuditorObraSocialArt === 'SI') add(data.nombreObraSocialArt, 'Lugar donde realiza auditoría', 4);
    }
    // Si el colegiado es profesional adjunto (o algún consultorio lo es), exigir campos específicos
    const adjuntoFlag = isAnyConsultorioAdjunto(data);
    add(data.companiaSeguro, "Compañía de seguro de mala praxis médica", 4);
    add(data.polizaSeguro, "Número de póliza de mala praxis médica", 4);
    add(data.seguroDesde, "Póliza de mala praxis vigente desde", 4);
    add(data.seguroHasta, "Póliza de mala praxis vigente hasta", 4);
    add(data.polizaPraxisArchivo, "Archivo obligatorio del seguro de mala praxis médica", 5);
    if (String(data.seguroHasta || "") <= currentDateString()) missing.push({ label: "La vigencia de la póliza debe ser posterior a la fecha actual", step: 4 });
    if (String(data.seguroDesde || "") && String(data.seguroHasta || "") && String(data.seguroDesde) >= String(data.seguroHasta)) missing.push({ label: "La fecha hasta debe ser posterior a la fecha desde", step: 4 });
    if (data.trabajaConsultorio === 'SI') {
      add(data.atiendeObrasSociales, 'Atiende por medio de obras sociales', 4);
      if (data.atiendeObrasSociales === 'SI') {
        add(data.anssalDesde, 'ANSSAL desde', 4);
        add(data.anssalHasta, 'ANSSAL hasta', 4);
        add(data.certificadoAnssalArchivo, 'Certificado ANSSAL adjunto', 4);
      }

      const fechaInicioHabilitacion = data.fechaInicioConsultorio || (data.consultorios || []).find(c => c?.fechaInicioConsultorio)?.fechaInicioConsultorio || '';
      add(fechaInicioHabilitacion, 'Fecha de inicio de actividad en la habilitación', 4);


    }
    return missing;
  };

  const validateAllRequiredFields = () => {
    const missing = getMissingRequiredFields(formData);
    if (!missing.length) return true;
    setMissingRequiredFields(missing);
    setCurrentStep(missing[0].step);
    return false;
  };

  const optimizePhoto = (file: File) => new Promise<string>((resolve, reject) => {
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);

    image.onload = () => {
      const maxDimension = 600;
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(objectUrl);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('No se pudo procesar la imagen.'));
    };

    image.src = objectUrl;
  });

  const handlePhotoFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setImageError('El archivo seleccionado debe ser una imagen.');
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImageError('La imagen debe pesar menos de 10 MB.');
      return;
    }

    setImageError(null);
    const scrollPosition = window.scrollY;
    try {
      const photoUrl = await optimizePhoto(file);
      updateField('fotoUrl', photoUrl);

      // Keep the user at the photo section after React renders the preview.
      window.requestAnimationFrame(() => {
        window.scrollTo({ top: scrollPosition, left: 0, behavior: 'auto' });
      });
    } catch {
      setImageError('Error al procesar la imagen.');
    }
  };

  const handleAttachmentFile = (key: 'certificadoAnssalArchivo' | 'polizaPraxisArchivo', file?: File) => {
    if (!file) return;
    if (!/\.pdf$/i.test(file.name) || (file.type && file.type !== 'application/pdf')) {
      setImageError('Solo se puede subir archivo en formato PDF.');
      return;
    }
    setImageError(null);
    if (file.size > 10 * 1024 * 1024) {
      setImageError('El archivo debe pesar menos de 10 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const content = String(reader.result || '');
      updateField(key, content);
      updateField(`${key}Nombre` as keyof DeclarationData, file.name);
    };
    reader.readAsDataURL(file);
  };

  const handleNext = () => {
    const cuilInput = document.getElementById('cuilCuit') as HTMLInputElement | null;
    if (cuilInput) {
      cuilInput.setCustomValidity(
        cuilInput.value && !isValidCuilCuit(cuilInput.value)
          ? 'Ingrese un CUIL o CUIT válido de 11 dígitos.'
          : '',
      );
    }

    if (steps[currentStep]?.id === 'foto' && !String(formData.fotoUrl || '').trim()) {
      setMissingRequiredFields([{ label: 'Fotografía obligatoria del colegiado', step: 5 }]);
      return;
    }
    if (!formRef.current?.reportValidity()) return;

    const currentOrderIndex = stepperSteps.findIndex(step => step.id === steps[currentStep]?.id);
    if (currentOrderIndex < stepperSteps.length - 1) {
      const nextStep = stepperSteps[currentOrderIndex + 1];
      setCurrentStep(steps.findIndex(step => step.id === nextStep.id));
    }
  };

  const handlePrev = () => {
    const currentOrderIndex = stepperSteps.findIndex(step => step.id === steps[currentStep]?.id);
    if (currentOrderIndex > 0) {
      const previousStep = stepperSteps[currentOrderIndex - 1];
      setCurrentStep(steps.findIndex(step => step.id === previousStep.id));
    }
  };

  const handleLoadMock = () => {
    setFormData({ 
      ...MOCK_RONNY_MISHEL, 
      id: formData.id || 'dec_' + Date.now(),
      // Add a high-quality professional model photo as fallback if they want to test printing
      fotoUrl: 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&q=80&w=400&h=400'
    });
    setCurrentStep(5);
  };

  // Drag and drop photo upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handlePhotoFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) void handlePhotoFile(file);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (stepperSteps.findIndex(step => step.id === steps[currentStep]?.id) < stepperSteps.length - 1) {
      handleNext();
    } else {
      if (!validateAllRequiredFields()) return;
      if (!formRef.current?.reportValidity()) return;
      const preparedData = {
        ...formData,
        id: formData.id || 'dec_' + Date.now(),
        createdAt: formData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      if (onReview) onReview(preparedData);
      else onSave(preparedData);
    }
  };

  return (
    <div className={`bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden max-w-none w-full mx-auto ${memberInfoOnly ? 'cokifimi-member-info-only' : ''}`} id="form-wizard" style={{ width: "calc(100vw - 32px)", maxWidth: "none" }}>
      {missingRequiredFields.length > 0 && (
        <div className="cokifimi-missing-required-modal" role="dialog" aria-modal="true" aria-labelledby="missing-required-fields-title">
          <div className="cokifimi-missing-required-card">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <p style={{ color: "#000" }} className="cokifimi-missing-required-label">Datos incompletos</p>
                <h2 id="missing-required-fields-title" style={{ color: "#000" }} className="cokifimi-missing-required-heading">Faltan datos obligatorios</h2>
              </div>
            </div>
            <p className="cokifimi-missing-required-description">Completá los siguientes campos antes de guardar la declaración:</p>
            <div className="cokifimi-missing-required-list mt-3 max-h-56 overflow-y-auto rounded-xl p-3">
              <ul style={{ color: "#000" }} className="cokifimi-missing-required-items">
                {missingRequiredFields.map(field => <li key={`${field.step}-${field.label}`} className="flex gap-2"><span className="text-amber-700">•</span><span>{field.label}</span></li>)}
              </ul>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setMissingRequiredFields([])}
                className="rounded-xl bg-[#0F5A3E] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#0c4731]"
              >
                Aceptar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Upper header */}
      <div className="bg-[#0F5A3E] px-6 py-5 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">DECLARACIÓN JURADA OBLIGATORIA BIANUAL DE DATOS FILIATORIOS Y PROFESIONALES</h2>
          <p className="text-emerald-100 text-xs mt-1">La misma debe estar vigente para realizar todo trámite ante este colegio (excluyente)</p>
        </div>
      </div>

      {/* Stepper progress indicator */}
      <div className="bg-gray-50 border-b border-gray-100 px-4 py-4 md:px-6">
        <div className="flex justify-between items-center overflow-x-auto gap-4 scrollbar-none">
          {stepperSteps.map((step, idx) => {
            const StepIcon = step.icon;
            const originalIndex = steps.findIndex(item => item.id === step.id);
            const currentOrderIndex = stepperSteps.findIndex(item => item.id === steps[currentStep]?.id);
            const isCompleted = idx < currentOrderIndex;
            const isActive = originalIndex === currentStep;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setCurrentStep(originalIndex)}
                className="flex items-center gap-2.5 min-w-max text-left group focus:outline-none"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-xs transition-colors ${
                  isCompleted 
                    ? 'bg-emerald-50 text-emerald-800 border-2 border-emerald-500' 
                    : isActive 
                    ? 'bg-[#0F5A3E] text-white border-2 border-[#0F5A3E]' 
                    : 'bg-white text-gray-400 border border-gray-200 group-hover:border-gray-300'
                }`}>
                  {isCompleted ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : idx + 1}
                </div>
                <div className="hidden sm:block text-left">
                  <p className={`text-xs font-bold leading-tight ${isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-600'}`}>
                    {step.title}
                  </p>
                  <p className="text-[10px] text-gray-400 leading-none mt-0.5">{step.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Form content */}
      <form noValidate ref={formRef} onSubmit={handleSubmit} className="p-6 md:p-8 space-y-8">
        
        {/* STEP 1: MATRÍCULA Y CONTROL */}
        {currentStep === 0 && (
          <div className="space-y-6 animate-fadeIn" id="step-matricula">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Información de Matrícula Profesional</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="apellido">Apellido *</label>
                <input
                  id="apellido"
                  type="text"
                  required
                  placeholder="Ej: XISCATTI"
                  value={formData.apellido}
                  onChange={e => updateField('apellido', e.target.value.toUpperCase())}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="nombres">Nombre/s *</label>
                <input
                  id="nombres"
                  type="text"
                  required
                  placeholder="Ej: RONNY MISHEL"
                  value={formData.nombres}
                  onChange={e => updateField('nombres', e.target.value.toUpperCase())}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="matricula">Nº Matrícula Profesional *</label>
                <input
                  id="matricula"
                  type="text"
                  required
                  placeholder="Ej: 761"
                  value={formData.matricula}
                  onChange={e => updateField('matricula', e.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, ''))}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono font-medium"
                />
              </div>

              {!hideMatriculationDate && <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="fechaMatriculacion">Fecha de Matriculación *</label>
                {showMatriculationAdminNotice && <p className="mb-1.5 text-xs text-gray-500">Este campo será completado por Administración.</p>}
                <input
                  id="fechaMatriculacion"
                  type="date"
                  readOnly={dateInputLocked}
                  disabled={dateInputLocked}
                  value={formData.fechaMatriculacion}
                  onChange={e => updateField('fechaMatriculacion', e.target.value)}
                  className={`w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${dateInputLocked ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : 'bg-white text-gray-900'}`}
                />
              </div>}

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="fechaPresentacion">Fecha de Presentación *</label>
                <input
                  id="fechaPresentacion"
                  type="date"
                  required
                  disabled={dateInputLocked}
                  value={formData.fechaPresentacion}
                  onChange={e => updateField('fechaPresentacion', e.target.value)}
                  className={`w-full rounded-lg border px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 ${dateInputLocked ? 'cursor-not-allowed border-gray-200 bg-gray-50 text-gray-500' : 'border-gray-300 bg-white text-gray-900 focus:border-blue-500'}`}
                />
                {dateInputLocked && <span className="text-[10px] text-blue-700 mt-1 block">Fecha fijada automáticamente por el servidor.</span>}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Fecha de Vencimiento</label>
                <input
                  type="date"
                  disabled
                  value={formData.fechaVencimiento}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-500 cursor-not-allowed font-medium"
                />
                <span className="text-[10px] text-blue-700 mt-1 block">Calculado automáticamente (+2 años de vigencia)</span>
              </div>
            </div>
            
            <div className="bg-amber-50 rounded-xl p-4 border border-amber-200/60 flex gap-3">
              <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-amber-900">Nota sobre el vencimiento</h4>
                <p className="text-[11px] text-amber-800 mt-0.5 leading-relaxed">
                  La presente actualización de datos debe cumplimentarse antes de transcurridos los 2 años. Pasada la fecha de vencimiento, tras 5 días de corrido, se procederá a la <strong>BAJA AUTOMÁTICA DE LA MATRÍCULA PROVINCIAL</strong>.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: DATOS PERSONALES */}
        {currentStep === 1 && (
          <div className="space-y-6 animate-fadeIn" id="step-personales">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Información de Identidad</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="dni">D.N.I. *</label>
                <input
                  id="dni"
                  type="text"
                  required
                  placeholder="Ej: 36.061.001"
                  value={formData.dni}
                  onChange={e => updateField('dni', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="cuilCuit">CUIL / CUIT *</label>
                <input
                  id="cuilCuit"
                  type="text"
                  required
                  placeholder="Ej: 20-36061001-3"
                  value={formData.cuilCuit}
                  onChange={e => {
                    e.currentTarget.setCustomValidity('');
                    updateField('cuilCuit', e.target.value);
                  }}
                  inputMode="numeric"
                  pattern="[0-9]{2}-?[0-9]{8}-?[0-9]"
                  title="Ingrese un CUIL o CUIT válido de 11 dígitos."
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="fechaNacimiento">Fecha de Nacimiento *</label>
                <input
                  id="fechaNacimiento"
                  type="date"
                  required
                  value={formData.fechaNacimiento}
                  onChange={e => updateField('fechaNacimiento', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="sexo">Sexo *</label>
                <select
                  id="sexo"
                  value={formData.sexo}
                  onChange={e => updateField('sexo', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                >
                  <option value="MASCULINO">MASCULINO</option>
                  <option value="FEMENINO">FEMENINO</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="provinciaNacimiento">Provincia de Nacimiento *</label>
                {formData.nacionalidad === 'ARGENTINO/A' ? (
                  <select
                    id="provinciaNacimiento-select"
                    value={ARGENTINE_PROVINCES.includes(formData.provinciaNacimiento) ? formData.provinciaNacimiento : 'MISIONES'}
                    onChange={e => {
                      const val = e.target.value;
                      updateField('provinciaNacimiento', val);
                      if (val === 'MISIONES') {
                        updateField('ciudadNacimiento', 'LEANDRO N. ALEM');
                      } else {
                        updateField('ciudadNacimiento', '');
                      }
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  >
                    {ARGENTINE_PROVINCES.map(prov => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                ) : formData.nacionalidad === 'PARAGUAYO/A' ? (
                  <select
                    id="provinciaNacimiento-select"
                    value={PARAGUAYAN_DEPARTMENTS.includes(formData.provinciaNacimiento) ? formData.provinciaNacimiento : 'ITAPÚA'}
                    onChange={e => {
                      const val = e.target.value;
                      updateField('provinciaNacimiento', val);
                      if (PARAGUAYAN_CITIES_BY_DEPT[val]) {
                        updateField('ciudadNacimiento', PARAGUAYAN_CITIES_BY_DEPT[val][0]);
                      } else {
                        updateField('ciudadNacimiento', '');
                      }
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  >
                    {PARAGUAYAN_DEPARTMENTS.map(prov => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                ) : formData.nacionalidad === 'BRASILEÑO/A' ? (
                  <select
                    id="provinciaNacimiento-select"
                    value={BRAZILIAN_STATES.includes(formData.provinciaNacimiento) ? formData.provinciaNacimiento : 'PARANÁ'}
                    onChange={e => {
                      const val = e.target.value;
                      updateField('provinciaNacimiento', val);
                      if (BRAZILIAN_CITIES_BY_STATE[val]) {
                        updateField('ciudadNacimiento', BRAZILIAN_CITIES_BY_STATE[val][0]);
                      } else {
                        updateField('ciudadNacimiento', '');
                      }
                    }}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  >
                    {BRAZILIAN_STATES.map(prov => (
                      <option key={prov} value={prov}>{prov}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    id="provinciaNacimiento"
                    type="text"
                    required
                    placeholder="Ej: DEPARTAMENTO / PROVINCIA"
                    value={formData.provinciaNacimiento}
                    onChange={e => updateField('provinciaNacimiento', e.target.value.toUpperCase())}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="ciudadNacimiento">Ciudad de Nacimiento *</label>
                {formData.nacionalidad === 'ARGENTINO/A' && formData.provinciaNacimiento === 'MISIONES' ? (
                  <>
                    <input
                      id="ciudadNacimiento"
                      type="text"
                      required
                      list="misiones-birth-cities"
                      autoComplete="off"
                      placeholder="Escriba para buscar una ciudad o localidad"
                      value={formData.ciudadNacimiento}
                      onChange={e => updateField('ciudadNacimiento', e.target.value.toUpperCase())}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                    />
                    <datalist id="misiones-birth-cities">
                      {MISIONES_LOCALITY_OPTIONS.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </datalist>
                  </>
                ) : formData.nacionalidad === 'PARAGUAYO/A' && PARAGUAYAN_CITIES_BY_DEPT[formData.provinciaNacimiento] ? (
                  <>
                    <select
                      id="ciudadNacimiento-select"
                      value={PARAGUAYAN_CITIES_BY_DEPT[formData.provinciaNacimiento].includes(formData.ciudadNacimiento) ? formData.ciudadNacimiento : 'OTRA'}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'OTRA') {
                          updateField('ciudadNacimiento', '');
                        } else {
                          updateField('ciudadNacimiento', val);
                        }
                      }}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium mb-1.5"
                    >
                      {PARAGUAYAN_CITIES_BY_DEPT[formData.provinciaNacimiento].map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                      <option value="OTRA">OTRA CIUDAD / LOCALIDAD...</option>
                    </select>

                    {(!PARAGUAYAN_CITIES_BY_DEPT[formData.provinciaNacimiento].includes(formData.ciudadNacimiento) || formData.ciudadNacimiento === '') && (
                      <input
                        id="ciudadNacimiento"
                        type="text"
                        required
                        placeholder="Escriba la ciudad o localidad"
                        value={formData.ciudadNacimiento}
                        onChange={e => updateField('ciudadNacimiento', e.target.value.toUpperCase())}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                      />
                    )}
                  </>
                ) : formData.nacionalidad === 'BRASILEÑO/A' && BRAZILIAN_CITIES_BY_STATE[formData.provinciaNacimiento] ? (
                  <>
                    <select
                      id="ciudadNacimiento-select"
                      value={BRAZILIAN_CITIES_BY_STATE[formData.provinciaNacimiento].includes(formData.ciudadNacimiento) ? formData.ciudadNacimiento : 'OTRA'}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'OTRA') {
                          updateField('ciudadNacimiento', '');
                        } else {
                          updateField('ciudadNacimiento', val);
                        }
                      }}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium mb-1.5"
                    >
                      {BRAZILIAN_CITIES_BY_STATE[formData.provinciaNacimiento].map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                      <option value="OTRA">OTRA CIUDAD / LOCALIDAD...</option>
                    </select>

                    {(!BRAZILIAN_CITIES_BY_STATE[formData.provinciaNacimiento].includes(formData.ciudadNacimiento) || formData.ciudadNacimiento === '') && (
                      <input
                        id="ciudadNacimiento"
                        type="text"
                        required
                        placeholder="Escriba la ciudad o localidad"
                        value={formData.ciudadNacimiento}
                        onChange={e => updateField('ciudadNacimiento', e.target.value.toUpperCase())}
                        className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                      />
                    )}
                  </>
                ) : (
                  <input
                    id="ciudadNacimiento"
                    type="text"
                    required
                    placeholder="Ej: CIUDAD DE NACIMIENTO"
                    value={formData.ciudadNacimiento}
                    onChange={e => updateField('ciudadNacimiento', e.target.value.toUpperCase())}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="nacionalidad">Nacionalidad *</label>
                <select
                  id="nacionalidad-select"
                  value={['ARGENTINO/A', 'PARAGUAYO/A', 'BRASILEÑO/A'].includes(formData.nacionalidad) ? formData.nacionalidad : 'OTRO'}
                  onChange={e => {
                    const val = e.target.value;
                    if (val === 'OTRO') {
                      setFormData(prev => ({
                        ...prev,
                        nacionalidad: '',
                        provinciaNacimiento: '',
                        ciudadNacimiento: ''
                      }));
                    } else {
                      if (val === 'ARGENTINO/A') {
                        setFormData(prev => ({
                          ...prev,
                          nacionalidad: 'ARGENTINO/A',
                          provinciaNacimiento: 'MISIONES',
                          ciudadNacimiento: 'LEANDRO N. ALEM'
                        }));
                      } else if (val === 'PARAGUAYO/A') {
                        setFormData(prev => ({
                          ...prev,
                          nacionalidad: 'PARAGUAYO/A',
                          provinciaNacimiento: 'ITAPÚA',
                          ciudadNacimiento: 'ENCARNACIÓN'
                        }));
                      } else if (val === 'BRASILEÑO/A') {
                        setFormData(prev => ({
                          ...prev,
                          nacionalidad: 'BRASILEÑO/A',
                          provinciaNacimiento: 'PARANÁ',
                          ciudadNacimiento: 'FOZ DO IGUAÇU'
                        }));
                      }
                    }
                  }}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium mb-1.5"
                >
                  <option value="ARGENTINO/A">ARGENTINO/A</option>
                  <option value="PARAGUAYO/A">PARAGUAYO/A</option>
                  <option value="BRASILEÑO/A">BRASILEÑO/A</option>
                  <option value="OTRO">OTRA NACIONALIDAD...</option>
                </select>
                
                {(!['ARGENTINO/A', 'PARAGUAYO/A', 'BRASILEÑO/A'].includes(formData.nacionalidad) || formData.nacionalidad === '') && (
                  <input
                    id="nacionalidad"
                    type="text"
                    required
                    placeholder="Escriba su nacionalidad"
                    value={formData.nacionalidad}
                    onChange={e => updateField('nacionalidad', e.target.value.toUpperCase())}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: CONTACTO */}
        {currentStep === 2 && (
          <div className="space-y-6 animate-fadeIn" id="step-contacto">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Información de Localización y Contacto</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="domicilioActual">Domicilio Actual *</label>
                <input
                  id="domicilioActual"
                  type="text"
                  required
                  placeholder="Ej: AVENIDA VÉLEZ SARSFIELD"
                  value={formData.domicilioActual}
                  onChange={e => updateField('domicilioActual', e.target.value.toUpperCase())}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="numeracionDomicilioActual">Numeración de casa / altura *</label>
                <input
                  id="numeracionDomicilioActual"
                  type="text"
                  required
                  placeholder="Ej: 456"
                  value={formData.numeracionDomicilioActual}
                  onChange={e => updateField('numeracionDomicilioActual', e.target.value.toUpperCase())}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="pisoDomicilioActual">Piso *</label>
                <input
                  id="pisoDomicilioActual"
                  type="text"
                  required
                  placeholder="Ej: 2 / PB"
                  value={formData.pisoDomicilioActual}
                  onChange={e => updateField('pisoDomicilioActual', e.target.value.toUpperCase())}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="municipioLocalidad">Municipio / Localidad *</label>
                <input
                  id="municipioLocalidad"
                  type="text"
                  required
                  list="misiones-localities"
                  autoComplete="off"
                  placeholder="Escriba para buscar una localidad"
                  value={formData.municipioLocalidad}
                  onChange={e => updateField('municipioLocalidad', normalizeMisionesLocality(e.target.value))}
                  onBlur={e => { const value = normalizeMisionesLocality(e.target.value); updateField('municipioLocalidad', MISIONES_LOCALITY_SET.has(value) ? value : ''); }}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
                <datalist id="misiones-localities">
                  {MISIONES_LOCALITY_OPTIONS.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="codigoPostal">Código Postal *</label>
                <input
                  id="codigoPostal"
                  type="text"
                  required
                  readOnly
                  aria-readonly="true"
                  tabIndex={-1}
                  placeholder="Ej: 3315"
                  value={formData.codigoPostal}
                  className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 cursor-not-allowed font-mono font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="telefono">Teléfono Fijo</label>
                <input
                  id="telefono"
                  type="text"
                  placeholder="Ej: NO POSEE o 3754XXXXXX"
                  value={formData.telefono}
                  onChange={e => updateField('telefono', e.target.value.toUpperCase())}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="celular">Celular *</label>
                <input
                  id="celular"
                  type="tel"
                  required
                  inputMode="tel"
                  minLength={8}
                  pattern="[-0-9+() ]{8,}"
                  title="Ingrese un número de celular válido."
                  placeholder="Ej: 3754476963"
                  value={formData.celular}
                  onChange={e => updateField('celular', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono font-medium"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="email">E-Mail *</label>
                <div className="flex w-full items-center overflow-hidden rounded-lg border border-gray-300 bg-white focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-blue-500">
                <input
                  id="email"
                  type="text"
                  required
                    pattern="[-A-Za-z0-9._%+]+"
                  title="Ingrese una dirección de correo de Gmail que termine en @gmail.com."
                  placeholder="Ej: NOMBRE"
                  value={formData.email.split('@')[0]}
                  readOnly={lockedEmail}
                  disabled={lockedEmail}
                  onChange={e => updateField('email', `${e.target.value.replace(/@.*$/, '').toUpperCase()}@gmail.com`)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                />
                <span className="shrink-0 border-l border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-600">@gmail.com</span>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">{lockedEmail ? 'Correo validado en el acceso. No se puede modificar.' : 'Debe ser obligatoriamente un correo de Gmail.'}</p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: FORMACIÓN Y TÍTULOS */}
        {currentStep === 3 && (
          <div className="space-y-6 animate-fadeIn" id="step-educacion">
            <h3 className="text-base font-bold text-gray-900 border-b border-gray-100 pb-2">Información Académica</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="universidad">Universidad de egreso *</label>
                <select
                  id="universidad-select"
                  required
                  value={ARGENTINE_KINESIOLOGY_UNIVERSITIES.includes(formData.universidad) ? formData.universidad : (formData.universidad ? 'OTRA' : '')}
                  onChange={e => updateField('universidad', e.target.value === 'OTRA' ? '' : e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                >
                  <option value="">SELECCIONE UNIVERSIDAD</option>
                  {ARGENTINE_KINESIOLOGY_UNIVERSITIES.map((universidad) => (
                    <option key={universidad} value={universidad}>
                      {universidad}
                    </option>
                  ))}
                </select>

                {(!ARGENTINE_KINESIOLOGY_UNIVERSITIES.includes(formData.universidad) || formData.universidad === '') && (
                  <input
                    id="universidad"
                    type="text"
                    required
                    placeholder="Escriba el nombre de la universidad"
                    value={formData.universidad}
                    onChange={e => updateField('universidad', e.target.value.toUpperCase())}
                    className="w-full mt-1.5 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  />
                )}
                
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="tituloUniversitario">Título Universitario *</label>
                <select
  id="tituloUniversitario"
  required
  value={KINESIOLOGY_TITLES.includes(String(formData.tituloUniversitario || "")) ? (formData.tituloUniversitario ?? "") : ""}
  onChange={e => {
    const valor = e.target.value;

    if (valor === "OTRO") {
      setOtroTitulo(true);
      updateField('tituloUniversitario', '');
    } else {
      setOtroTitulo(false);
      updateField('tituloUniversitario', valor);
    }
  }}
  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
>
  <option value="">
    SELECCIONE TÍTULO
  </option>

  {KINESIOLOGY_TITLES.map((titulo) => (
    <option key={titulo} value={titulo}>
      {titulo}
    </option>
  ))}

</select>

                {(otroTitulo || (String(formData.tituloUniversitario || "") && !KINESIOLOGY_TITLES.includes(String(formData.tituloUniversitario || "")))) && (
                  <input
                    id="tituloUniversitarioOtro"
                    type="text"
                    required
                    placeholder="Escriba el nombre del título universitario"
                    value={formData.tituloUniversitario}
                    onChange={e => updateField('tituloUniversitario', e.target.value.toUpperCase())}
                    className="w-full mt-1.5 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  />
                )}

              <div>
  <label
    className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5"
    htmlFor="fechaEmisionTitulo"
  >
    Fecha de emisión del Título *
  </label>

  <input
    id="fechaEmisionTitulo"
    type="date"
    required
    value={formData.fechaEmisionTitulo}
    onChange={e => updateField('fechaEmisionTitulo', e.target.value)}
    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
  />
</div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="especialidadUniversidad">Especialidad de posgrado (solo con título universitario)</label>
                <select
                  id="especialidadUniversidad"
                  value={formData.especialidadUniversidad === 'NO POSEE' ? 'NO POSEE' : formData.especialidadUniversidad ? 'SI' : ''}
                  onChange={e => updateField('especialidadUniversidad', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                >
                  <option value="">SELECCIONE UNA OPCIÓN</option>
                  <option value="SI">SI</option>
                  <option value="NO POSEE">NO POSEE</option>
                </select>
                {formData.especialidadUniversidad === 'SI' && (
                  <p className="mt-1.5 text-xs font-bold text-amber-700">REMITIRSE AL COLEGIO POR CORREO ELECTRÓNICO PARA VERIFICACIÓN DEL MISMO</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="tituloRevalida">¿Título por reválida? *</label>
                <select
                  id="tituloRevalida"
                  value={formData.tituloRevalida}
                  onChange={e => updateField('tituloRevalida', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                >
                  <option value="NO">NO</option>
                  <option value="SI">SI</option>
                </select>
              </div>

              {formData.tituloRevalida === 'SI' && (
                <>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="universidadRevalida">Universidad que revalida</label>
                    <input
                      id="universidadRevalida"
                      type="text"
                      placeholder="Ej: OTRA, BORRAR Y ESCRIBIR"
                      value={formData.universidadRevalida}
                      onChange={e => updateField('universidadRevalida', e.target.value.toUpperCase())}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="tituloRevalidaNombre">Título de reválida</label>
                    <input
                      id="tituloRevalidaNombre"
                      type="text"
                      placeholder="Nombre del título revalidado"
                      value={formData.tituloRevalidaNombre}
                      onChange={e => updateField('tituloRevalidaNombre', e.target.value.toUpperCase())}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="fechaEmisionRevalida">Fecha emisión de título revalidado</label>
                    <input
                      id="fechaEmisionRevalida"
                      type="date"
                      value={formData.fechaEmisionRevalida}
                      onChange={e => updateField('fechaEmisionRevalida', e.target.value)}
                      className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* STEP 5: ACTIVIDAD PROFESIONAL */}
        {currentStep === 4 && (
          <div className="space-y-6 animate-fadeIn" id="step-actividad">
            <div>
              <h3 className="text-base font-bold text-[#0F5A3E] border-b border-gray-100 pb-2">Ejercicio y Actividad Profesional</h3>
              <p className="text-gray-500 text-xs mt-1">Completa los datos relacionados con tu ejercicio profesional actual.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="actividadPublica">¿Realiza actividad profesional pública? *</label>
                <select
                  id="actividadPublica"
                  required
                  value={formData.actividadPublica || 'NO'}
                  onChange={e => {
                    const actividadPublica = e.target.value as 'SI' | 'NO' | 'AMBAS';
                    setFormData(prev => ({
                      ...prev,
                      actividadPublica,
                      ...(actividadPublica === 'SI' ? { actividadPrivada: '' } : {}),
                    }));
                  }}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                >
                  <option value="NO">NO</option>
                  <option value="SI">SÍ</option>
                  <option value="AMBAS">PÚBLICA Y PRIVADA</option>
                </select>
              </div>

              {formData.actividadPublica !== 'NO' && (
                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="lugarActividadPublica">Especifique el lugar *</label>
                  <select
                    id="lugarActividadPublica"
                    required
                    value={formData.lugarActividadPublica || ''}
                    onChange={e => updateField('lugarActividadPublica', e.target.value)}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  >
                    <option value="">SELECCIONE EL LUGAR</option>
                    <option value="MINISTERIO DE SALUD PÚBLICA">MINISTERIO DE SALUD PÚBLICA</option>
                    <option value="MINISTERIO DE EDUCACIÓN">MINISTERIO DE EDUCACIÓN</option>
                    <option value="OTRAS">OTRAS</option>
                  </select>
                </div>
              )}

              {formData.actividadPublica !== 'NO' && formData.lugarActividadPublica === 'OTRAS' && (
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="otroLugarActividadPublica">Otro lugar *</label>
                  <input
                    id="otroLugarActividadPublica"
                    type="text"
                    required
                    value={formData.otroLugarActividadPublica || ''}
                    onChange={e => updateField('otroLugarActividadPublica', e.target.value.toUpperCase())}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium"
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-[#0F5A3E] uppercase tracking-wider mb-1.5" htmlFor="trabajaConsultorio">¿Trabaja en consultorio / área kinésica? *</label>
                <select
                  id="trabajaConsultorio"
                  value={formData.trabajaConsultorio}
                  onChange={e => updateField('trabajaConsultorio', e.target.value)}
                  className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E] font-medium"
                >
                  <option value="NO">NO</option>
                  <option value="SI">SÍ</option>
                  <option value="SOLO_DOMICILIO">SOLO A DOMICILIO</option>
                </select>
              </div>

              {formData.trabajaConsultorio === 'SI' && (
                <>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#0F5A3E] uppercase tracking-wider mb-1.5" htmlFor="cantidadConsultorios">Cantidad de consultorios *</label>
                    <select id="cantidadConsultorios" required value={formData.cantidadConsultorios || 1} onChange={e => updateCantidadConsultorios(Number(e.target.value) as 1 | 2 | 3 | 4)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E] font-medium">
                      <option value="1">1 CONSULTORIO</option>
                      <option value="2">2 CONSULTORIOS</option>
                      <option value="3">3 CONSULTORIOS</option>
                      <option value="4">4 CONSULTORIOS</option>
                    </select>
                  </div>

                  {Array.from({ length: formData.cantidadConsultorios || 1 }, (_, index) => {
                    const consultorio = { ...EMPTY_CONSULTORIO, ...(formData.consultorios?.[index] || {}) };
                    const numero = index + 1;
                    const esTitular = consultorio.esTitularConsultorio || 'NO';
                    const esAdjunto = consultorio.esProfesionalAdjunto === 'SI';
                    const showDetailedConsultorio = true;
                    const showTitularFields = esTitular !== 'SI' && !esAdjunto;

                    return (
                      <div key={numero} className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-5 rounded-xl border border-emerald-100 bg-emerald-50/30 p-4">
                        <h4 className="md:col-span-3 text-sm font-bold text-[#0F5A3E]">Consultorio {numero}</h4>

                        {showDetailedConsultorio && (
                          <>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor={`domicilioConsultorio${numero}`}>Domicilio del consultorio {numero}</label>
                              <input id={`domicilioConsultorio${numero}`} type="text" placeholder="Calle" value={consultorio.domicilio} onChange={e => updateConsultorio(index, 'domicilio', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor={`numeracionConsultorio${numero}`}>Numeración de consultorio {numero}</label>
                              <input id={`numeracionConsultorio${numero}`} type="text" value={consultorio.numeracion} onChange={e => updateConsultorio(index, 'numeracion', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor={`ciudadConsultorio${numero}`}>Ciudad de consultorio {numero}</label>
                              <input id={`ciudadConsultorio${numero}`} type="text" required list={`misiones-consultorio-localities-${numero}`} autoComplete="off" placeholder="Escriba para buscar una localidad" value={consultorio.ciudad} onChange={e => updateConsultorio(index, 'ciudad', normalizeMisionesLocality(e.target.value))} onBlur={e => { const value = normalizeMisionesLocality(e.target.value); updateConsultorio(index, 'ciudad', MISIONES_LOCALITY_SET.has(value) ? value : ''); }} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium" />
                              <datalist id={`misiones-consultorio-localities-${numero}`}>
                                {MISIONES_LOCALITY_OPTIONS.map(city => (
                                  <option key={city} value={city}>{city}</option>
                                ))}
                              </datalist>
                            </div>
                          </>
                        )}

                        {esTitular !== 'SI' && (
                          <>
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 md:col-start-1 md:col-end-4">
                              <div className="flex flex-col">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 min-h-[2.5rem] flex items-start">¿Es titular del consultorio {numero}?</label>
                                <select required value={consultorio.esTitularConsultorio || 'NO'} onChange={e => updateConsultorio(index, 'esTitularConsultorio', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                                  <option value="NO">NO</option>
                                  <option value="SI">SÍ</option>
                                </select>
                              </div>

                              <div className="flex flex-col">
                                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 min-h-[2.5rem] flex items-start">¿Es profesional adjunto? {numero}</label>
                                <select required value={consultorio.esTitularConsultorio === 'NO' ? 'SI' : (consultorio.esProfesionalAdjunto || 'NO')} onChange={e => updateConsultorio(index, 'esProfesionalAdjunto', e.target.value)} disabled={consultorio.esTitularConsultorio === 'NO'} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed">
                                  <option value="NO">NO</option>
                                  <option value="SI">SÍ</option>
                                </select>
                              </div>
                            </div>

                            <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Número de Matrícula del titular / habilitación {numero}</label>
                              <div className="flex gap-2"><input required type="text" placeholder="Ej: 1234" value={consultorio.numeroMatriculaConsultorio || ''} onChange={e => updateConsultorio(index, 'numeroMatriculaConsultorio', e.target.value)} className="min-w-0 flex-1 w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" /><button type="button" onClick={() => void lookupTitularConsultorio(index)} disabled={Boolean(titularLookupLoading[index])} className="cokifimi-search-button shrink-0 rounded-lg bg-[#0F5A3E] px-4 py-2 text-xs font-bold text-white disabled:opacity-60">{titularLookupLoading[index] ? 'Buscando...' : 'Buscar titular'}</button></div>
                              {titularLookupMessage[index] && <p className="mt-2 text-xs font-semibold text-[#0F5A3E]">{titularLookupMessage[index]}</p>}
                            </div>
                            <div className="md:col-span-2">
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Apellido y nombre del titular del consultorio {numero}</label>
                              <input required readOnly type="text" placeholder="Se completa al buscar la matrícula" value={consultorio.nombreTitularConsultorio || ''} className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 cursor-not-allowed" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Fecha de inicio de actividad {numero}</label>
                              <input required readOnly type="date" value={consultorio.fechaInicioConsultorio || ''} className="w-full bg-gray-100 border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-700 cursor-not-allowed" />
                            </div>
                          </>
                        )}

                        {esTitular === 'SI' && (
                          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-5 md:col-start-1 md:col-end-4">
                            <div className="flex flex-col">
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5 min-h-[2.5rem] flex items-start">¿Es titular del consultorio {numero}?</label>
                              <select required value={consultorio.esTitularConsultorio || 'NO'} onChange={e => updateConsultorio(index, 'esTitularConsultorio', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900">
                                <option value="NO">NO</option>
                                <option value="SI">SÍ</option>
                              </select>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">Fecha de Inicio de Actividad {numero}</label>
                              <input required type="date" value={consultorio.fechaInicioConsultorio || ''} onChange={e => updateConsultorio(index, 'fechaInicioConsultorio', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900" />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {formData.trabajaConsultorio === 'SI' && (
                    <div className="md:col-span-2 mt-4 rounded-xl border border-[#B7DCCB] bg-[#F8FFFB] p-4 md:p-5 shadow-sm">
                      <div className="mb-4">
                        <h5 className="text-base font-bold text-[#0F5A3E]">{adjuntoFlag ? "Informe sus datos como profesional" : "Datos profesionales"}</h5>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Atiende por medio de obras sociales</label>
                          <select value={formData.atiendeObrasSociales || 'NO'} onChange={e => updateField('atiendeObrasSociales', e.target.value as 'SI' | 'NO')} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]">
                            <option value="NO">NO</option>
                            <option value="SI">SÍ</option>
                          </select>
                        </div>                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Asociado/a a la Asociación de Kinesiólogos</label>
                          <select value={formData.asociadoAsociacion || "NO"} onChange={e => updateField("asociadoAsociacion", e.target.value as "SI" | "NO")} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]">
                            <option value="NO">NO</option>
                            <option value="SI">SÍ</option>
                          </select>
                        </div>


                        {formData.atiendeObrasSociales === "SI" && (
                          <>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Vigencia del certificado ANSSAL desde</label>
                              <input type="date" value={formData.anssalDesde || ""} onChange={e => updateField("anssalDesde", e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]" />
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Vigencia del certificado ANSSAL hasta</label>
                              <input type="date" value={formData.anssalHasta || ""} onChange={e => updateField("anssalHasta", e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]" />
                            </div>
                          </>
                        )}

                        <div className="md:col-span-2">
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Nombre de la compañía del seguro de praxis médica</label>
                          <input type="text" required value={formData.companiaSeguro || ''} onChange={e => updateField('companiaSeguro', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]" />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Número de la póliza de praxis médica</label>
                          <input type="text" required value={formData.polizaSeguro || ''} onChange={e => updateField('polizaSeguro', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]" />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Vigencia de la póliza desde</label>
                          <input type="date" required value={formData.seguroDesde || ''} onChange={e => updateField('seguroDesde', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]" />
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Vigencia de la póliza hasta</label>
                          <input type="date" required value={formData.seguroHasta || ''} onChange={e => updateField('seguroHasta', e.target.value)} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E]" />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="md:col-span-2">
                    <label className="block text-xs font-bold text-[#0F5A3E] uppercase tracking-wider mb-1.5" htmlFor="esAuditorObraSocialArt">¿Es auditor de obra social / ART? *</label>
                    <select id="esAuditorObraSocialArt" required value={formData.esAuditorObraSocialArt || ''} onChange={e => {
                      const esAuditorObraSocialArt = e.target.value as 'SI' | 'NO';
                      setFormData(prev => ({ ...prev, esAuditorObraSocialArt, ...(esAuditorObraSocialArt === 'NO' ? { nombreObraSocialArt: '' } : {}) }));
                    }} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#0F5A3E] focus:border-[#0F5A3E] font-medium">
                      <option value="">SELECCIONE UNA OPCIÓN</option>
                      <option value="NO">NO</option>
                      <option value="SI">SÍ</option>
                    </select>
                    {formData.esAuditorObraSocialArt === 'SI' && (
                      <div className="mt-4">
                        <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5" htmlFor="nombreObraSocialArt">Describa en dónde lo realiza *</label>
                        <input id="nombreObraSocialArt" type="text" required placeholder="Ej.: HOSPITAL" value={formData.nombreObraSocialArt || ''} onChange={e => updateField('nombreObraSocialArt', e.target.value.toUpperCase())} className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-medium" />
                      </div>
                    )}
                    <p className="mt-1.5 text-xs text-gray-500">La declaración es obligatoria cuando realiza actividad profesional.</p>
                  </div>
                </>
              )}
              {formData.trabajaConsultorio !== 'SI' && (
                <div className="md:col-span-2 mt-4 rounded-xl border border-[#B7DCCB] bg-[#F8FFFB] p-4 md:p-5 shadow-sm"><h5 className="mb-4 text-base font-bold text-[#0F5A3E]">Seguro de mala praxis médica obligatorio</h5><div className="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2"><div className="md:col-span-2"><label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Nombre de la compañía del seguro de praxis médica</label><input type="text" required value={formData.companiaSeguro || ""} onChange={e => updateField("companiaSeguro", e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900" /></div><div><label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Número de la póliza de praxis médica</label><input type="text" required value={formData.polizaSeguro || ""} onChange={e => updateField("polizaSeguro", e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900" /></div><div><label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Vigencia de la póliza desde</label><input type="date" required value={formData.seguroDesde || ""} onChange={e => updateField("seguroDesde", e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900" /></div><div><label className="block text-xs font-bold uppercase tracking-wider text-gray-700">Vigencia de la póliza hasta</label><input type="date" required value={formData.seguroHasta || ""} onChange={e => updateField("seguroHasta", e.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-900" /></div></div></div>
              )}
            </div>
            {true && (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 shadow-sm">
                <h4 className="text-sm font-bold text-[#0F5A3E] mb-4">{adjuntoFlag ? "Documentación obligatoria como profesional adjunto" : "Certificado de mala praxis obligatorio"}</h4>
                <div className={`grid grid-cols-1 gap-4 ${adjuntoFlag ? "md:grid-cols-2" : "md:grid-cols-1"}`}>
                  {formData.trabajaConsultorio === "SI" && formData.atiendeObrasSociales === "SI" && (
                  <div className="rounded-xl border border-emerald-200 bg-white p-4">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Certificado ANSSAL vigente</label>
                    <p className="mb-3 text-xs font-bold text-red-600">Solo se puede subir archivo en formato PDF.</p>
                    {formData.certificadoAnssalArchivo ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">Archivo cargado</span>
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                          Reemplazar archivo
                          <input type="file" accept=".pdf" onChange={(e) => handleAttachmentFile('certificadoAnssalArchivo', e.target.files?.[0])} className="hidden" />
                        </label>
                      </div>
                    ) : (
                      <label className="cokifimi-original-file-button inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#0F5A3E] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0c4731]">
                        Seleccionar archivo
                        <input type="file" accept=".pdf" onChange={(e) => handleAttachmentFile('certificadoAnssalArchivo', e.target.files?.[0])} className="hidden" />
                      </label>
                    )}
                    <div className="mt-3 min-h-[20px] text-xs text-gray-600">
                      {formData.certificadoAnssalArchivoNombre ? (
                        <div className="space-y-1">
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Archivo cargado</span>
                          <p className="break-all">{formData.certificadoAnssalArchivoNombre}</p>
                        </div>
                      ) : (
                        <span>Ningún archivo seleccionado</span>
                      )}
                    </div>
                    {formData.certificadoAnssalArchivo && (
                      <button type="button" onClick={() => setAttachmentPreview({ url: formData.certificadoAnssalArchivo || "", name: formData.certificadoAnssalArchivoNombre || "Certificado ANSSAL" })} className="cokifimi-attachment-view-button">Ver archivo</button>
                    )}
                  </div>
                  )}

                  <div className="rounded-xl border border-emerald-200 bg-white p-4">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-3">Póliza de praxis médica</label>
                    <p className="mb-3 text-xs font-bold text-red-600">Solo se puede subir archivo en formato PDF.</p>
                    {formData.polizaPraxisArchivo ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-800">Archivo cargado</span>
                        <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-emerald-700 bg-white px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-50">
                          Reemplazar archivo
                          <input type="file" accept=".pdf" onChange={(e) => handleAttachmentFile('polizaPraxisArchivo', e.target.files?.[0])} className="hidden" />
                        </label>
                      </div>
                    ) : (
                      <label className="cokifimi-original-file-button inline-flex cursor-pointer items-center justify-center rounded-lg bg-[#0F5A3E] px-3 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#0c4731]">
                        Seleccionar archivo
                        <input type="file" accept=".pdf" onChange={(e) => handleAttachmentFile('polizaPraxisArchivo', e.target.files?.[0])} className="hidden" />
                      </label>
                    )}
                    <div className="mt-3 min-h-[20px] text-xs text-gray-600">
                      {formData.polizaPraxisArchivoNombre ? (
                        <div className="space-y-1">
                          <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-800">Archivo cargado</span>
                          <p className="break-all">{formData.polizaPraxisArchivoNombre}</p>
                        </div>
                      ) : (
                        <span>Ningún archivo seleccionado</span>
                      )}
                    </div>
                    {formData.polizaPraxisArchivo && (
                      <button type="button" onClick={() => setAttachmentPreview({ url: formData.polizaPraxisArchivo || "", name: formData.polizaPraxisArchivoNombre || "Póliza de praxis" })} className="cokifimi-attachment-view-button">Ver archivo</button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 6: FOTOGRAFÍA DE PERFIL */}
        {currentStep === 5 && (
          <div className="space-y-6 animate-fadeIn animate-duration-300" id="step-foto">
            <div>
              <h3 className="text-2xl font-extrabold text-[#0F5A3E] border-b-2 border-[#B7DCCB] pb-3 md:text-3xl">Fotografía del Colegiado/a</h3>
              <p className="mt-2 text-base font-medium text-gray-600 md:text-lg">Sube una fotografía de perfil nítida y formal en formato carnet.</p>
              <div className="mt-4 rounded-xl border-2 border-amber-300 bg-amber-50 px-5 py-4 text-base font-extrabold leading-relaxed text-amber-950 shadow-sm md:text-lg">
                La foto debe ser tipo carnet y tener fondo blanco.
              </div>
            </div>
            
            <div className="flex flex-col md:flex-row items-center gap-8">
              {/* Image Preview Container */}
              <div className="w-48 h-48 rounded-xl border-2 border-dashed border-gray-300 flex flex-col items-center justify-center overflow-hidden bg-gray-50 relative shrink-0 group">
                {formData.fotoUrl ? (
                  <>
                    <img 
                      src={formData.fotoUrl} 
                      alt="Foto de perfil" 
                      className="w-full h-full object-cover animate-fadeIn"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => updateField('fotoUrl', '')}
                      className="absolute inset-0 bg-black/65 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity duration-200 focus:outline-none cursor-pointer"
                    >
                      Remover Foto
                    </button>
                  </>
                ) : (
                  <div className="text-center p-4">
                    <Camera className="w-10 h-10 text-gray-400 mx-auto mb-2" />
                    <span className="text-xs text-gray-500 font-semibold">Sin fotografía</span>
                  </div>
                )}
              </div>

              {/* Upload Drop Zone */}
              <div 
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 w-full border-2 border-dashed border-emerald-300 hover:border-[#0F5A3E] bg-emerald-50/10 hover:bg-emerald-50/20 rounded-xl p-6 text-center cursor-pointer transition-all duration-200"
              >
                <Upload className="w-8 h-8 text-[#0F5A3E] mx-auto mb-3" />
                <h4 className="text-sm font-bold text-gray-900">Arrastra tu fotografía aquí</h4>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">Solo formatos JPG, PNG o JPEG. Tamaño máximo de 10 MB. La foto debe ser tipo carnet y tener fondo blanco.</p>
                <div className="mt-4">
                  <span className="bg-[#0F5A3E] text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm hover:bg-[#0c4731] transition-all">Seleccionar Archivo</span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>
            </div>



            {imageError && (
              <p className="text-xs font-semibold text-red-600 bg-red-50 p-2.5 rounded-lg border border-red-100">{imageError}</p>
            )}
          </div>
        )}

        {attachmentPreview && (
          <dialog
            ref={attachmentPreviewDialogRef}
            className="cokifimi-bianual-attachment-modal"
            aria-labelledby="attachment-preview-title"
            onCancel={() => setAttachmentPreview(null)}
          >
            <div className="cokifimi-bianual-attachment-card">
              <header>
                <h2 id="attachment-preview-title">{attachmentPreview.name}</h2>
                <div className="cokifimi-bianual-attachment-actions">
                  <a href={attachmentPreview.url} download={attachmentPreview.name} target="_blank" rel="noopener">Descargar</a>
                  <button type="button" onClick={() => setAttachmentPreview(null)} aria-label="Cerrar vista previa">Cerrar</button>
                </div>
              </header>
              <div className="cokifimi-bianual-attachment-content">
                {attachmentPreview.url.startsWith("data:image/") ? (
                  <img src={attachmentPreview.url} alt={`Vista previa de ${attachmentPreview.name}`} />
                ) : attachmentPreview.url.startsWith("data:application/pdf") ? (
                  <iframe src={attachmentPreview.url} title={`Vista previa de ${attachmentPreview.name}`} />
                ) : (
                  <p>No se puede visualizar este formato dentro del formulario.</p>
                )}
              </div>
            </div>
          </dialog>
        )}        {/* Navigation actions */}
        <div className="flex justify-between items-center pt-6 border-t border-gray-100">
          <button
            type="button"
            onClick={onCancel}
            className="cokifimi-action-clear text-red-500 hover:text-red-750 hover:bg-red-50 font-semibold text-sm px-4 py-2 rounded-lg transition-colors"
          >
            Limpiar Formulario
          </button>

          <div className="flex gap-3">
            {stepperSteps.findIndex(step => step.id === steps[currentStep]?.id) > 0 && (
              <button
                type="button"
                onClick={handlePrev}
                className="cokifimi-action-prev border border-gray-300 hover:bg-gray-50 active:bg-gray-100 text-gray-700 font-semibold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" />
                Anterior
              </button>
            )}

            {stepperSteps.findIndex(step => step.id === steps[currentStep]?.id) < stepperSteps.length - 1 ? (
              <button
                key="btn-next"
                type="button"
                onClick={handleNext}
                className="cokifimi-action-next bg-[#0F5A3E] hover:bg-[#0c4731] active:bg-[#093524] text-white font-semibold text-sm px-4 py-2 rounded-lg transition-colors flex items-center gap-1 shadow-md shadow-emerald-900/10"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                key="btn-save"
                type="submit"
                className="cokifimi-action-save bg-gradient-to-r from-[#0F5A3E] to-[#0c4731] hover:from-[#0c4731] hover:to-[#083021] text-white font-bold text-sm px-5 py-2 rounded-lg transition-all flex items-center gap-2 shadow-md shadow-emerald-950/15"
                id="btn-save-declaration"
              >
                <Save className="w-4 h-4" />
                Previsualizar
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
