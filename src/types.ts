export interface ConsultorioData {
  domicilio: string;
  numeracion: string;
  ciudad: string;
  esTitularConsultorio?: 'SI' | 'NO';
  esProfesionalAdjunto?: 'SI' | 'NO';
  nombreTitularConsultorio?: string;
  fechaInicioConsultorio?: string;
  numeroMatriculaConsultorio?: string;
}

export interface ConsultorioRequestData {
  id: string;
  formularioHabilitacionConsultorio: Record<string, string | boolean | undefined | unknown[]>;
}

export interface LibreDeudaRequestData {
  id: string;
  submittedAt: string;
  estado: "PENDIENTE" | "APROBADO" | "RECHAZADO";
  mensajeAdmin?: string;
  revisadoAt?: string;
  venceAt?: string;
  certificadoUrl?: string;
  certificadoNombre?: string;
  comprobantePagoUrl?: string;
  comprobantePagoNombre?: string;
  comprobanteColegiadoUrl?: string;
  comprobanteColegiadoNombre?: string;
  historial?: Array<{ estado: "RECHAZADO"; mensaje: string; fecha: string }>;
}
export interface BianualAlertData {
  message: string;
  createdAt: string;
}

export interface DeclarationData {
  id: string;
  createdAt: string;
  updatedAt: string;
  
  // Header / Control Info
  apellido: string;
  nombres: string;
  matricula: string;
  fechaMatriculacion: string;
  fechaMatriculacionAdmin: boolean;
  memberEnabled?: boolean;
  memberAccessTokenHash?: string;
  memberTokenFailedAttempts?: number;
  memberTokenBlocked?: boolean;
  // Records created before the current two-page A4 template are upgraded
  // automatically when opened/saved from admin.
  printLayoutVersion: 2;
  memberProvisional?: boolean;
  fechaPresentacion: string;
  fechaVencimiento: string;

  // Personal Info
  dni: string;
  cuilCuit: string;
  fechaNacimiento: string;
  sexo: 'MASCULINO' | 'FEMENINO' | 'OTRO';
  provinciaNacimiento: string;
  ciudadNacimiento: string;
  nacionalidad: string;
  domicilioActual: string;
  numeracionDomicilioActual: string;
  pisoDomicilioActual: string;
  municipioLocalidad: string;
  codigoPostal: string;
  telefono: string;
  celular: string;
  email: string;

  // University Info
  universidad: string;
  tituloUniversitario: string;
  fechaEmisionTitulo: string;
  tituloRevalida: 'SI' | 'NO';
  universidadRevalida?: string;
  tituloRevalidaNombre?: string;
  fechaEmisionRevalida?: string;
  especialidadUniversidad?: string;

  // Professional Activity
  actividadPublica: 'SI' | 'NO' | 'AMBAS';
  lugarActividadPublica?: string;
  otroLugarActividadPublica?: string;
  actividadPrivada: string; // e.g. "CONSULTORIO PARTICULAR"
  trabajaConsultorio: 'SI' | 'NO' | 'SOLO_DOMICILIO';
  domicilioConsultorio?: string;
  numeracionConsultorio?: string;
  ciudadConsultorio?: string;
  atiendeObrasSociales?: 'SI' | 'NO';
  asociadoAsociacion?: 'SI' | 'NO';
  poseeAnssal?: 'SI' | 'NO';
  anssalDesde?: string;
  anssalHasta?: string;
  companiaSeguro?: string;
  polizaSeguro?: string;
  seguroDesde?: string;
  seguroHasta?: string;
  cantidadConsultorios?: 1 | 2 | 3 | 4;
  consultorios?: ConsultorioData[];
  formularioHabilitacionConsultorio?: Record<string, string | boolean | undefined | unknown[]>;
  consultorioSolicitudes?: ConsultorioRequestData[];
  consultorioSolicitudId?: string;
  libreDeudaSolicitud?: LibreDeudaRequestData;
  bianualAlert?: BianualAlertData;
  bianualAlertHistory?: BianualAlertData[];
  esTitularConsultorio: 'SI' | 'NO';
  esProfesionalAdjunto: 'SI' | 'NO';
  nombreTitularConsultorio?: string;
  fechaInicioConsultorio?: string;
  numeroMatriculaConsultorio?: string;
  esAuditorObraSocialArt?: 'SI' | 'NO';
  nombreObraSocialArt?: string;

  // Photo and required documents for professional adjunto
  fotoUrl: string; // base64 representation of uploaded/adjusted portrait
  certificadoAnssalArchivo?: string;
  polizaPraxisArchivo?: string;
  certificadoAnssalArchivoNombre?: string;
  polizaPraxisArchivoNombre?: string;
}

const getTodayString = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const getExpiryString = () => {
  const d = new Date();
  return `${d.getFullYear() + 2}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const INITIAL_DECLARATION: DeclarationData = {
  id: '',
  createdAt: '',
  updatedAt: '',
  printLayoutVersion: 2,
  fechaMatriculacionAdmin: false,
  memberProvisional: false,
  
  apellido: '',
  nombres: '',
  matricula: '',
  fechaMatriculacion: '',
  fechaPresentacion: getTodayString(),
  fechaVencimiento: getExpiryString(),

  dni: '',
  cuilCuit: '',
  fechaNacimiento: '',
  sexo: 'MASCULINO',
  provinciaNacimiento: 'MISIONES',
  ciudadNacimiento: '',
  nacionalidad: 'ARGENTINO/A',
  domicilioActual: '',
  numeracionDomicilioActual: '',
  pisoDomicilioActual: '',
  municipioLocalidad: '',
  codigoPostal: '',
  telefono: 'NO POSEE',
  celular: '',
  email: '',

  universidad: '',
  tituloUniversitario: '',
  fechaEmisionTitulo: '',
  tituloRevalida: 'NO',
  universidadRevalida: '',
  tituloRevalidaNombre: '',
  fechaEmisionRevalida: '',
  especialidadUniversidad: '',

  actividadPublica: 'NO',
  lugarActividadPublica: '',
  otroLugarActividadPublica: '',
  actividadPrivada: '',
  trabajaConsultorio: 'NO',
  domicilioConsultorio: '',
  numeracionConsultorio: '',
  ciudadConsultorio: '',
  cantidadConsultorios: 1,
  consultorios: [],
  esTitularConsultorio: 'NO',
  esProfesionalAdjunto: 'NO',
  nombreTitularConsultorio: '',
  fechaInicioConsultorio: '',
  atiendeObrasSociales: 'NO',
  poseeAnssal: 'NO',
  anssalDesde: '',
  anssalHasta: '',
  companiaSeguro: '',
  polizaSeguro: '',
  seguroDesde: '',
  seguroHasta: '',
  numeroMatriculaConsultorio: '',
  esAuditorObraSocialArt: 'NO',
  nombreObraSocialArt: '',
  
  fotoUrl: '',
  certificadoAnssalArchivo: '',
  polizaPraxisArchivo: '',
  certificadoAnssalArchivoNombre: '',
  polizaPraxisArchivoNombre: ''
};

export const MOCK_RONNY_MISHEL: DeclarationData = {
  id: 'mock-ronny-mishel',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  printLayoutVersion: 2,
  fechaMatriculacionAdmin: true,
  memberProvisional: false,
  
  apellido: 'XISCATTI',
  nombres: 'RONNY MISHEL',
  matricula: '761',
  fechaMatriculacion: '2023-10-03',
  fechaPresentacion: '2026-06-16',
  fechaVencimiento: '2028-06-16',

  dni: '36.061.001',
  cuilCuit: '20-36061001-3',
  fechaNacimiento: '1991-07-15',
  sexo: 'MASCULINO',
  provinciaNacimiento: 'MISIONES',
  ciudadNacimiento: 'LEANDRO N. ALEM',
  nacionalidad: 'ARGENTINO/A',
  domicilioActual: 'AVENIDA VÉLEZ SARSFIELD N° 456',
  numeracionDomicilioActual: '456',
  pisoDomicilioActual: '1',
  municipioLocalidad: 'LEANDRO N. ALEM',
  codigoPostal: '3315',
  telefono: 'NO POSEE',
  celular: '3754476963',
  email: 'XISCATTIRONNYMISHEL@GMAIL.COM',

  universidad: 'UNIVERSIDAD GASTÓN DACHARY',
  tituloUniversitario: 'LICENCIATURA EN KINESIOLOGÍA Y FISIATRÍA',
  fechaEmisionTitulo: '2023-01-21',
  tituloRevalida: 'NO',
  universidadRevalida: 'OTRA, BORRAR Y ESCRIBIR',
  tituloRevalidaNombre: '',
  fechaEmisionRevalida: '',
  especialidadUniversidad: 'R.P.G - ',

  actividadPublica: 'NO',
  lugarActividadPublica: '',
  otroLugarActividadPublica: '',
  actividadPrivada: 'CONSULTORIO PARTICULAR',
  trabajaConsultorio: 'SI',
  domicilioConsultorio: 'CALLE 25 DE MAYO N° 366',
  numeracionConsultorio: '',
  ciudadConsultorio: 'LEANDRO N. ALEM',
  cantidadConsultorios: 1,
  consultorios: [{ domicilio: 'CALLE 25 DE MAYO', numeracion: '366', ciudad: 'LEANDRO N. ALEM' }],
  esTitularConsultorio: 'SI',
  esProfesionalAdjunto: 'NO',
  nombreTitularConsultorio: '',
  fechaInicioConsultorio: '',
  numeroMatriculaConsultorio: '',
  esAuditorObraSocialArt: 'NO',
  nombreObraSocialArt: '',
  
  // We can default this or let them set it, or load a realistic placeholder avatar in base64
  fotoUrl: ''
};
