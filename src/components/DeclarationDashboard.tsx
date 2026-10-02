import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { 
  Plus, 
  Search, 
  FileText, 
  Printer, 
  Edit, 
  Trash2, 
  Copy, 
  Calendar,
  AlertTriangle,
  FileCheck,

  ShieldCheck,
  User,
  Download,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MapPin,
  KeyRound,
  CircleDollarSign,
  Calculator,
  X,
  History,
  BellRing,
  Send,
} from 'lucide-react';
import { DeclarationData } from '../types';
import { MISIONES_LOCALITY_POSTAL_BY_NAME, normalizeMisionesLocality } from '../data/misionesLocalities';
import { deleteMemberAccount, loadServerRecordPhoto, syncLegacyMemberAccount } from '../api';
import ConsultorioRequestsPanel from './ConsultorioRequestsPanel';
import ConsultorioRequestMetrics from './ConsultorioRequestMetrics';
import LibreDeudaPanel from './LibreDeudaPanel';
import RecordPhoto from './RecordPhoto';

const localDateOnly = (value: string) => {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(value);
};
const formatCardDate = (value?: string) =>
  value ? localDateOnly(value).toLocaleDateString('es-AR') : '—';
const getBianualAlertHistory = (declaration: DeclarationData) => {
  const history = Array.isArray(declaration.bianualAlertHistory)
    ? declaration.bianualAlertHistory
    : [];
  const current = declaration.bianualAlert;
  if (current && !history.some((item) => item.createdAt === current.createdAt)) {
    return [...history, current];
  }
  return history;
};
const cardExpiryDate = (declaration: DeclarationData) => {
  const expiry = declaration.fechaVencimiento ? localDateOnly(declaration.fechaVencimiento) : null;
  const presentation = declaration.fechaPresentacion ? localDateOnly(declaration.fechaPresentacion) : null;
  const automatic = presentation ? new Date(presentation.getFullYear() + 2, presentation.getMonth(), presentation.getDate()) : null;
  return expiry && automatic && Math.abs(expiry.getTime() - automatic.getTime()) <= 86400000 ? automatic : expiry;
};

interface DeclarationDashboardProps {
  declarations: DeclarationData[];
  highlightedDeclarationId?: string | null;
  onSelect: (data: DeclarationData) => void;
  onEdit: (data: DeclarationData) => void;
  onMemberAccess: (data: DeclarationData) => void;
  onResetMemberToken: (data: DeclarationData) => void;
  onDelete: (id: string) => void | Promise<void>;
  onDeleteConsultorio: (id: string, solicitudId?: string, domicilio?: string) => void | Promise<void>;
  onDeleteAllConsultorios: () => void | Promise<void>;
  onDuplicate: (data: DeclarationData) => void;
  onCreateNew: () => void;
  onUpdateConsultorioValidation: (data: DeclarationData) => void | Promise<DeclarationData | void>;
  onSendBianualAlert: (data: DeclarationData, message: string) => void | Promise<void>;
  onDeleteBianualAlerts: (data: DeclarationData) => void | Promise<void>;
}

export default function DeclarationDashboard({
  declarations,
  highlightedDeclarationId,
  onSelect,
  onEdit,
  onMemberAccess,
  onResetMemberToken,
  onDelete,
  onDeleteConsultorio,
  onDeleteAllConsultorios,
  onDuplicate,
  onCreateNew,
  onUpdateConsultorioValidation,
  onSendBianualAlert,
  onDeleteBianualAlerts
}: DeclarationDashboardProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [showExpiredOnly, setShowExpiredOnly] = useState(false);
  const [declarationToDelete, setDeclarationToDelete] = useState<DeclarationData | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'table'>('cards');
  const [photoRecord, setPhotoRecord] = useState<DeclarationData | null>(null);
  const [postalCodeFilter, setPostalCodeFilter] = useState('');
  const [showMemberAccessModal, setShowMemberAccessModal] = useState(false);
  const [memberAccessSearch, setMemberAccessSearch] = useState('');
  const [syncingLegacyAccount, setSyncingLegacyAccount] = useState(false);
  const [deletingMemberAccount, setDeletingMemberAccount] = useState('');
  const [showConsultorioRequests, setShowConsultorioRequests] = useState(false);
  const [showLibreDeuda, setShowLibreDeuda] = useState(false);
  const [bianualAlertTarget, setBianualAlertTarget] = useState<DeclarationData | null>(null);
  const [bianualAlertDraft, setBianualAlertDraft] = useState('');
  const [savingBianualAlert, setSavingBianualAlert] = useState(false);
  useEffect(() => {
    if (!showLibreDeuda) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>(".cokifimi-libre-deuda-header")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [showLibreDeuda]);
  useEffect(() => {
    if (!showConsultorioRequests) return;
    const timer = window.setTimeout(() => {
      document.querySelector<HTMLElement>('.cokifimi-consultorio-panel-header')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [showConsultorioRequests]);
  const [consultorioEditing, setConsultorioEditing] = useState(false);
  const [initialConsultorioRequestId, setInitialConsultorioRequestId] = useState<string | null>(null);
  const [monthlyHabilitationFee, setMonthlyHabilitationFee] = useState(() => {
    const stored = Number(window.localStorage.getItem('cokifimi_habilitacion_monthly_fee'));
    return Number.isFinite(stored) && stored >= 0 ? stored : 15000;
  });
  const [pricingDraft, setPricingDraft] = useState('15000');
  const [showPricingModal, setShowPricingModal] = useState(false);
  const formatCurrency = (value: number) => value.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
  const openPricingModal = () => {
    setPricingDraft(String(monthlyHabilitationFee));
    setShowPricingModal(true);
  };
  const savePricing = () => {
    const value = Math.max(0, Number(pricingDraft) || 0);
    setMonthlyHabilitationFee(value);
    window.localStorage.setItem('cokifimi_habilitacion_monthly_fee', String(value));
    setShowPricingModal(false);
  };
  const pricingPanel = <>
    <section className="cokifimi-habilitacion-pricing-card" aria-labelledby="habilitacion-pricing-title">
      <div className="cokifimi-habilitacion-pricing-icon"><CircleDollarSign /></div>
      <div className="cokifimi-habilitacion-pricing-copy">
        <p>Arancel de habilitación</p>
        <h3 id="habilitacion-pricing-title">Importe mensual vigente</h3>
        <strong>{formatCurrency(monthlyHabilitationFee)}</strong>
        <span>El total se calcula según el período solicitado: 6, 12 o 24 meses.</span>
      </div>
      <button type="button" className="cokifimi-habilitacion-pricing-button" onClick={openPricingModal}>
        <Calculator /> Actualizar importe
      </button>
    </section>
    {showPricingModal && createPortal(
      <div className="cokifimi-pricing-modal" role="dialog" aria-modal="true" aria-labelledby="pricing-modal-title">
        <section className="cokifimi-pricing-dialog">
          <header>
            <div><p>Configuración administrativa</p><h2 id="pricing-modal-title">Importe de habilitación</h2></div>
            <button type="button" onClick={() => setShowPricingModal(false)} aria-label="Cerrar"><X /></button>
          </header>
          <div className="cokifimi-pricing-content">
            <label htmlFor="monthly-habilitation-fee">Valor por mes</label>
            <div className="cokifimi-pricing-input-wrap"><span>$</span><input id="monthly-habilitation-fee" type="number" min="0" step="1000" value={pricingDraft} onChange={event => setPricingDraft(event.target.value)} autoFocus /></div>
            <p className="cokifimi-pricing-help">Este importe se aplicará al cálculo de la habilitación del consultorio.</p>
            <div className="cokifimi-pricing-preview">
              {[6, 12, 24].map(months => <div key={months}><span>{months} meses</span><strong>{formatCurrency((Number(pricingDraft) || 0) * months)}</strong></div>)}
            </div>
          </div>
          <footer><button type="button" onClick={() => setShowPricingModal(false)} className="cokifimi-pricing-cancel">Cancelar</button><button type="button" onClick={savePricing} className="cokifimi-pricing-save">Guardar importe</button></footer>
        </section>
      </div>, document.body
    )}
  </>;

  const isExpired = (declaration: DeclarationData) => {
    const expiry = cardExpiryDate(declaration);
    if (!expiry) return false;
    return new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate(), 23, 59, 59) < new Date();
  };

  const getAge = (dateOfBirth: string) => {
    if (!dateOfBirth) return null;
    const birthDate = new Date(`${dateOfBirth}T00:00:00`);
    if (Number.isNaN(birthDate.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const hasHadBirthday = today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate());
    if (!hasHadBirthday) age -= 1;
    return age >= 0 ? age : null;
  };

  const getConsultorios = (dec: DeclarationData) => {
    if (dec.trabajaConsultorio !== "SI") return [];
    if (dec.consultorios?.length) return dec.consultorios.map((consultorio) => ({ ...consultorio, ciudad: normalizeMisionesLocality(consultorio.ciudad) }));
    if (dec.trabajaConsultorio === 'SI' && (dec.domicilioConsultorio || dec.numeracionConsultorio || dec.ciudadConsultorio)) {
      return [{ domicilio: dec.domicilioConsultorio || '', numeracion: dec.numeracionConsultorio || '', ciudad: normalizeMisionesLocality(dec.ciudadConsultorio) }];
    }
    return [];
  };

  const getConsultorioLocality = (dec: DeclarationData, city?: string) => {
    const raw = (city || dec.municipioLocalidad || '').trim();
    return raw ? normalizeMisionesLocality(raw) : 'Sin localidad';
  };

  const getConsultorioPostalCode = (dec: DeclarationData, city?: string) => {
    const locality = getConsultorioLocality(dec, city);
    const normalized = normalizeMisionesLocality(locality);
    if (MISIONES_LOCALITY_POSTAL_BY_NAME[normalized]) return MISIONES_LOCALITY_POSTAL_BY_NAME[normalized];
    const digits = (dec.codigoPostal || '').replace(/\D/g, '');
    return digits || 'Sin C.P.';
  };
  const memberEnabled = (dec: DeclarationData) => dec.memberEnabled !== false;
  const tokenBlocked = (dec: DeclarationData) => Boolean(dec.memberTokenBlocked || (dec.memberTokenFailedAttempts || 0) >= 6);
  const accessLabel = (dec: DeclarationData) => !memberEnabled(dec) ? 'Baja' : tokenBlocked(dec) ? 'Inhabilitado por intentos fallidos' : dec.memberAccessTokenHash ? 'Habilitado' : 'Sin token';
  const memberAccessRecords = declarations.filter((dec) => {
    const query = memberAccessSearch.trim().toLowerCase();
    return !query || `${dec.apellido} ${dec.nombres} ${dec.matricula} ${dec.dni} ${dec.email}`.toLowerCase().includes(query);
  });
  const enabledMemberCount = declarations.filter(memberEnabled).length;
  const tokenMemberCount = declarations.filter((dec) => memberEnabled(dec) && Boolean(dec.memberAccessTokenHash)).length;
  const disabledMemberCount = declarations.filter((dec) => !memberEnabled(dec)).length;
  const syncLegacyAccount = async () => {
    const dni = memberAccessSearch.replace(/\D/g, '');
    if (dni.length < 7) return;
    setSyncingLegacyAccount(true);
    try {
      await syncLegacyMemberAccount(dni);
      window.alert('Acceso sincronizado. Se incorporará a la lista automáticamente en unos segundos.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo sincronizar el acceso.');
    } finally {
      setSyncingLegacyAccount(false);
    }
  };
  const removeMemberAccount = async (dec: DeclarationData) => {
    if (!window.confirm(`¿Eliminar completamente a ${dec.apellido}, ${dec.nombres}? Se eliminarán su acceso, token y declaración si existe. Esta acción no se puede deshacer.`)) return;
    setDeletingMemberAccount(dec.dni);
    try {
      await deleteMemberAccount(dec.dni);
      window.alert('El colegiado, su token y su declaración fueron eliminados.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo eliminar el colegiado.');
    } finally {
      setDeletingMemberAccount('');
    }
  };

  // Filter declarations based on search
  const submittedDeclarations = declarations.filter(dec => !dec.memberProvisional);
  const filtered = submittedDeclarations.filter(dec => {
    const query = searchTerm.toLowerCase();
    const matchesSearch = (
      dec.apellido.toLowerCase().includes(query) ||
      dec.nombres.toLowerCase().includes(query) ||
      dec.matricula.includes(query) ||
      dec.dni.includes(query) ||
      dec.ciudadNacimiento.toLowerCase().includes(query) ||
      getConsultorioPostalCode(dec).toLowerCase().includes(query) ||
      getConsultorios(dec).some(consultorio => consultorio.ciudad.toLowerCase().includes(query))
    );
    const matchesPostalCode = !postalCodeFilter.trim() ||
      getConsultorioPostalCode(dec).includes(postalCodeFilter.trim()) ||
      getConsultorios(dec).some(consultorio => getConsultorioPostalCode(dec, consultorio.ciudad).includes(postalCodeFilter.trim()));
    return matchesSearch && matchesPostalCode && (!showExpiredOnly || isExpired(dec));
  });
  const listSortedByMatricula = [...filtered].sort((a, b) => {
    const matriculaA = Number.parseInt(a.matricula.replace(/\D/g, ''), 10);
    const matriculaB = Number.parseInt(b.matricula.replace(/\D/g, ''), 10);
    const valueA = Number.isNaN(matriculaA) ? -1 : matriculaA;
    const valueB = Number.isNaN(matriculaB) ? -1 : matriculaB;
    return valueB - valueA || b.matricula.localeCompare(a.matricula, 'es', { numeric: true });
  });

  // Calculate some analytics
  const total = submittedDeclarations.length;
  const expiredCount = submittedDeclarations.filter(isExpired).length;
  const consultorioCount = submittedDeclarations.reduce((sum, dec) => sum + getConsultorios(dec).length, 0);
  const localityCounts = submittedDeclarations.reduce<Record<string, number>>((counts, dec) => {
    getConsultorios(dec).forEach(consultorio => {
      const locality = getConsultorioLocality(dec, consultorio.ciudad);
      const postalCode = getConsultorioPostalCode(dec, consultorio.ciudad);
      const key = `${locality}|||${postalCode}`;
      counts[key] = (counts[key] || 0) + 1;
    });
    return counts;
  }, {});
  const localityRows = Object.entries(localityCounts).sort((a, b) => b[1] - a[1]);
  const openPhotoOnly = async (dec: DeclarationData) => {
    try {
      const fotoUrl = dec.fotoUrl || await loadServerRecordPhoto(dec.id);
      if (!fotoUrl) { window.alert("Este colegiado no tiene una foto cargada."); return; }
      setPhotoRecord({ ...dec, fotoUrl });
    } catch {
      window.alert("No se pudo cargar la foto del colegiado.");
    }
  };  const downloadPhoto = (dec: DeclarationData) => {
    if (!dec.fotoUrl) return;
    const link = document.createElement('a');
    link.href = dec.fotoUrl;
    link.download = `foto-matricula-${dec.matricula || 'sin-matricula'}.jpg`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const openAttachment = (file: string | undefined, label: string) => {
    if (!file) return;
    window.open(file, '_blank', 'noopener,noreferrer');
  };

  const downloadAttachment = (file: string | undefined, fallbackName: string) => {
    if (!file) return;
    const anchor = document.createElement('a');
    anchor.href = file;
    anchor.download = fallbackName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const hasActiveAdjunto = (dec: DeclarationData) =>
    (dec.consultorios || []).some(c => c.esTitularConsultorio === "NO" && c.esProfesionalAdjunto === "SI");

  const getProfessionalStatusLabel = (dec: DeclarationData) => {
    const isYes = (value: unknown) =>
      ["SI", "SÍ", "YES", "TRUE", "1"].includes(String(value ?? "").trim().toUpperCase());
    const isNo = (value: unknown) =>
      ["NO", "N", "FALSE", "0"].includes(String(value ?? "").trim().toUpperCase());
    const consultorios = dec.consultorios || [];
    const noTrabajaEnConsultorio = dec.trabajaConsultorio !== "SI" || consultorios.length === 0;
    const titular =
      isYes(dec.esTitularConsultorio) ||
      consultorios.some(c => isYes(c.esTitularConsultorio));
    const consultorioAdjunto = consultorios.some(c => isYes(c.esProfesionalAdjunto));
    const directAdjunto = isYes(dec.esProfesionalAdjunto);
    const adjunto = directAdjunto || consultorioAdjunto;

    if (titular && adjunto) return 'Profesional Adjunto y titular';
    if (titular) return 'Titular de consultorio';
    if (adjunto) return 'Profesional adjunto';
    if (noTrabajaEnConsultorio) return "No trabaja en consultorio / área kinésica";
    return 'Consulta de condición';
  };
  if (showLibreDeuda) return <div className='cokifimi-consultorio-dashboard-shell'><LibreDeudaPanel declarations={declarations} onUpdate={onUpdateConsultorioValidation} onClose={() => setShowLibreDeuda(false)} /></div>;
  if (showConsultorioRequests) return <div className="cokifimi-consultorio-dashboard-shell">{!consultorioEditing && <div className="cokifimi-consultorio-pricing-slot">{pricingPanel}</div>}<ConsultorioRequestsPanel declarations={declarations} initialRequestId={initialConsultorioRequestId} onUpdate={onUpdateConsultorioValidation} onDelete={onDeleteConsultorio} onDeleteAll={onDeleteAllConsultorios} onEditingChange={setConsultorioEditing} onClose={() => { setInitialConsultorioRequestId(null); setShowConsultorioRequests(false); setConsultorioEditing(false); }} />{!consultorioEditing && <ConsultorioRequestMetrics declarations={declarations} />}</div>;
  return (
    <div className="space-y-6" id="dashboard-container">
      {/* Banner / Hero Section */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-950 text-white p-6 md:p-8 rounded-2xl shadow-lg relative overflow-hidden">
        {/* Background decorative path representing waves/mountains */}
        <div className="absolute right-0 bottom-0 opacity-10 pointer-events-none transform translate-y-12 translate-x-12 scale-125">
          <svg width="400" height="400" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M0 80 Q 25 50, 50 80 T 100 80" stroke="currentColor" strokeWidth="8" fill="none" />
            <path d="M0 60 Q 25 30, 50 60 T 100 60" stroke="currentColor" strokeWidth="4" fill="none" />
          </svg>
        </div>

        <div className="max-w-2xl space-y-3 relative z-10">
          <span className="bg-blue-500/10 text-blue-300 text-[10px] font-extrabold uppercase tracking-widest px-3 py-1 rounded-full border border-blue-500/20">
            CoKiFiMi Misiones
          </span>
          <h2 className="text-2xl md:text-3xl font-black tracking-tight leading-tight">
            Gestor de Declaraciones Juradas Digitales
          </h2>
          <p className="text-slate-300 text-xs md:text-sm leading-relaxed">
            Puede gestionar consultas, impresiones de registros, verificar vencimientos y mucho más en un solo portal.
          </p>
          <div className="pt-3">
            <button
              onClick={onCreateNew}
              className="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-xs px-5 py-2.5 rounded-xl shadow transition-transform hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2"
              id="btn-create-declaration"
            >
              <Plus className="w-4 h-4 text-white" />
              Nueva Declaración Jurada
            </button>
          </div>
        </div>
      </div>

      {/* Analytics widgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <div className="cokifimi-metric-card cokifimi-metric-blue bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
          <div className="cokifimi-metric-icon w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-800">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <p className="cokifimi-metric-label text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total Registradas</p>
            <p className="cokifimi-metric-value text-xl font-extrabold text-slate-900 mt-0.5">{total}</p>
          </div>
        </div>

        <div className="cokifimi-metric-card cokifimi-metric-slate bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
          <div className="cokifimi-metric-icon w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-800">
            <FileCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="cokifimi-metric-label text-[10px] font-bold text-gray-500 uppercase tracking-wider">Vigencia Normal</p>
            <p className="cokifimi-metric-value text-xl font-extrabold text-slate-900 mt-0.5">{total - expiredCount}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowExpiredOnly(current => !current)}
          className={`cokifimi-metric-card cokifimi-expired-filter-card rounded-xl border p-4 flex items-center gap-4 text-left transition-colors ${
            showExpiredOnly ? 'bg-red-100 border-red-300 ring-2 ring-red-200' : 'bg-red-50 border-red-200 hover:bg-red-100'
          }`}
          aria-pressed={showExpiredOnly}
          title="Mostrar solo declaraciones vencidas"
        >
          <div className="cokifimi-metric-icon w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center text-amber-800">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <p className="cokifimi-metric-label text-[10px] font-bold text-red-700 uppercase tracking-wider">Vencidas / Expiradas</p>
            <p className="cokifimi-metric-value text-xl font-extrabold text-red-700 mt-0.5">{expiredCount}</p>
            <p className="text-[10px] text-red-600 mt-0.5">{showExpiredOnly ? 'Mostrando vencidas' : 'Ver todas las vencidas'}</p>
          </div>
        </button>
        <div className="cokifimi-metric-card cokifimi-metric-emerald bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-4">
          <div className="cokifimi-metric-icon w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-800">
            <MapPin className="w-5 h-5" />
          </div>
          <div>
            <p className="cokifimi-metric-label text-[10px] font-bold text-gray-500 uppercase tracking-wider">Consultorios</p>
            <p className="cokifimi-metric-value text-xl font-extrabold text-slate-900 mt-0.5">{consultorioCount}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">en {localityRows.length} localidades</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5">
        <section className="cokifimi-dashboard-locality-panel bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div>
              <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">Distribución territorial</p>
              <h3 className="text-base font-extrabold text-slate-900 mt-1">Consultorios por localidad</h3>
            </div>
            <MapPin className="w-5 h-5 text-emerald-700" />
          </div>
          {localityRows.length ? <div className="cokifimi-dashboard-locality-grid">{localityRows.map(([localityKey, count]) => {
            const [locality, postalCode] = localityKey.split('|||');
            const width = consultorioCount ? `${Math.max(8, (count / consultorioCount) * 100)}%` : '0%';
            return <div key={localityKey}>
              <div className="flex justify-between text-xs font-semibold text-slate-600 mb-1"><span>{locality} <span className="font-normal text-slate-400">· C.P. {postalCode}</span></span><span>{count} consultorio{count === 1 ? '' : 's'}</span></div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden"><div className="h-full rounded-full bg-emerald-600" style={{ width }} /></div>
            </div>;
          })}</div> : <p className="text-xs text-slate-500">Todavía no hay consultorios registrados.</p>}
          </section>
      </div>

      {/* Search and List Header */}
      <div className="cokifimi-dashboard-toolbar flex flex-col md:flex-row justify-between items-center gap-4 pt-2">
        <div className="cokifimi-dashboard-search-group flex w-full flex-col gap-2 md:max-w-2xl md:flex-row">
        <div className="w-full relative">
          <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Apellido, Nombre, Matrícula o DNI..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-gray-200 rounded-xl pl-10 pr-4 py-2.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm"
          />
        </div>
        <input
          type="search"
          inputMode="numeric"
          maxLength={10}
          placeholder="Filtra por código postal"
          value={postalCodeFilter}
          onChange={e => setPostalCodeFilter(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-xs text-gray-900 shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 md:max-w-[210px]"
          aria-label="Filtrar consultorios por código postal"
        />
        </div>
        <div className="cokifimi-dashboard-toolbar-actions flex items-center gap-3">
          <p className="text-xs text-gray-500 font-medium">Mostrando {filtered.length} de {total} declaraciones</p>
          <button type="button" onClick={() => setShowMemberAccessModal(true)} className="cokifimi-dashboard-access-button" title="Administrar accesos de colegiados"><ShieldCheck className="h-4 w-4" /> Accesos</button>
          <button type="button" onClick={() => { setConsultorioEditing(false); setShowConsultorioRequests(true); }} className="cokifimi-consultorio-requests-launcher" title="Gestionar altas de consultorio"><Calculator /> <span>Altas de consultorio</span></button><button type="button" onClick={() => setShowLibreDeuda(true)} className="cokifimi-libre-deuda-launcher" title="Gestionar Libre Deuda"><ShieldCheck /> <span>Libre Deuda</span></button>
          <div className="cokifimi-view-toggle flex rounded-lg border border-gray-200 bg-white p-1 shadow-sm">
            <button type="button" onClick={() => setViewMode('cards')} className={`cokifimi-view-toggle-button p-1.5 rounded ${viewMode === 'cards' ? 'is-active' : ''}`} title="Vista tarjetas"><LayoutGrid className="w-4 h-4" /></button>
            <button type="button" onClick={() => setViewMode('table')} className={`cokifimi-view-toggle-button p-1.5 rounded ${viewMode === 'table' ? 'is-active' : ''}`} title="Vista planilla"><List className="w-4 h-4" /></button>
          </div>
        </div>
      </div>

      {/* Grid of Declarations */}
      {filtered.length > 0 ? (
        viewMode === 'table' ? (
          <div className="overflow-x-auto bg-white rounded-2xl border border-gray-200 shadow-sm">
            <table className="w-full text-left text-xs min-w-[920px]">
              <thead className="bg-slate-50 border-b border-gray-200 text-[10px] uppercase tracking-wider text-slate-500"><tr>
                <th className="px-4 py-3">Profesional</th><th className="px-4 py-3">Matrícula —</th><th className="px-4 py-3">DNI</th><th className="px-4 py-3">Localidad</th><th className="px-4 py-3">Consultorios</th><th className="px-4 py-3">Foto</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Acciones</th>
              </tr></thead>
              <tbody className="divide-y divide-gray-100">{listSortedByMatricula.map(dec => <tr key={dec.id} className="hover:bg-emerald-50/40">
                <td className="px-4 py-3 font-bold text-slate-800 uppercase">{dec.apellido}, {dec.nombres}</td>
                <td className="px-4 py-3 font-mono font-bold text-emerald-800">{dec.matricula || '—'}</td><td className="px-4 py-3">{dec.dni || '—'}</td>
                <td className="px-4 py-3">{getConsultorioLocality(dec, getConsultorios(dec)[0]?.ciudad)} <span className="text-slate-400">({getConsultorioPostalCode(dec, getConsultorios(dec)[0]?.ciudad)})</span></td><td className="px-4 py-3 font-bold">{getConsultorios(dec).length}</td>
                <td className="px-4 py-3">{dec.fotoUrl ? <div className="cokifimi-table-photo-cell flex items-center gap-2"><button type="button" onClick={() => void openPhotoOnly(dec)} className="cokifimi-table-photo-thumb" title={`Ver foto de matrícula ${dec.matricula}`}><img src={dec.fotoUrl} alt={`Miniatura matrícula ${dec.matricula}`} /></button><button type="button" onClick={() => void openPhotoOnly(dec)} className="cokifimi-table-photo-action text-emerald-700 font-bold hover:underline">Ver / descargar</button></div> : <span className="text-slate-400">Sin foto</span>}</td>
                <td className="px-4 py-3">{isExpired(dec) ? <span className="text-red-700 font-bold">Vencida</span> : <span className="text-emerald-700 font-bold">Vigente</span>}</td>
                <td className="px-4 py-3"><div className="cokifimi-table-actions flex gap-2"><button type="button" onClick={() => onSelect(dec)} className="cokifimi-table-action cokifimi-table-open-action text-emerald-700 font-bold hover:underline">Abrir</button><button type="button" onClick={() => onEdit(dec)} className="cokifimi-table-action cokifimi-table-edit-action text-slate-500 font-bold hover:underline">Editar</button></div></td>
              </tr>)}</tbody>
            </table>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(dec => {
            const expired = isExpired(dec);
            const consultorios = getConsultorios(dec);
            const consultorioCities = Array.from(
              new Set(consultorios.map(({ ciudad }) => ciudad.trim()).filter(Boolean))
            );

            return (
              <div 
                key={dec.id}
                data-record-id={dec.id}
                className={`cokifimi-admin-record-card ${highlightedDeclarationId === dec.id ? "is-updated" : ""} bg-white rounded-xl border border-slate-200 hover:border-blue-300 shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden flex flex-col justify-between group`}
              >
                {/* Upper card header accent */}
                <div className="cokifimi-admin-record-header bg-gradient-to-r from-slate-50 to-blue-50/20 px-5 py-4 border-b border-gray-150 flex items-start justify-between gap-3">
                  <div className="cokifimi-admin-record-identity space-y-1">
                    <h3 className="font-bold text-gray-900 text-sm leading-tight uppercase">
                      {dec.apellido}, {dec.nombres}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="bg-blue-100 text-blue-800 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wide">
                        M.P. {dec.matricula}
                      </span>
                      <span className="bg-emerald-100 text-emerald-800 text-[9px] font-extrabold px-2 py-0.5 rounded uppercase tracking-wide">
                        {getProfessionalStatusLabel(dec)}
                      </span>
                      <span className="text-[10px] text-gray-400 font-mono">DNI {dec.dni || '—'}</span>
                    </div>
                    <p className="text-xs font-semibold text-gray-600">
                      Fecha de matriculación: {formatCardDate(dec.fechaMatriculacion)}
                    </p>
                  </div>
                  <button type="button" onClick={() => void openPhotoOnly(dec)} title="Ver y descargar foto" className="w-11 h-11 rounded-full border border-gray-200 overflow-hidden bg-blue-50 shrink-0 flex items-center justify-center text-blue-600 cursor-pointer hover:border-emerald-400 focus:outline-none">
                    <RecordPhoto recordId={dec.id} name={`${dec.nombres} ${dec.apellido}`} className="cokifimi-avatar-button w-full h-full" />
                  </button>
                  
                </div>

                {/* Card middle info */}
                <div className="cokifimi-admin-record-body p-5 space-y-3.5 text-xs flex-1">
                  <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-gray-600">
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Fecha Nacimiento</p>
                      <p className="font-medium text-gray-800 mt-0.5">{dec.fechaNacimiento ? new Date(dec.fechaNacimiento).toLocaleDateString('es-AR') : '—'}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Edad</p>
                      <p className="font-medium text-gray-800 mt-0.5">{getAge(dec.fechaNacimiento) ?? '—'}{getAge(dec.fechaNacimiento) !== null ? ' años' : ''}</p>
                    </div>
                    <div>
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Ciudad del colegiado</p>
                      <p className="font-medium text-gray-800 mt-0.5 break-all">{dec.municipioLocalidad || '—'}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Consultorios asignados</p>
                      <p className="font-medium text-gray-800 mt-0.5 break-all">
                        {consultorios.length} consultorio{consultorios.length === 1 ? '' : 's'}{consultorioCities.length ? ' · ' + consultorioCities.join(', ') : ''}
                      </p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">Título</p>
                      <p className="font-medium text-gray-800 mt-0.5 cokifimi-line-clamp-1">{dec.tituloUniversitario || '—'}</p>
                    </div>
                  </div>

                  <div className={`flex items-center gap-2 p-2 rounded-xl border text-[10px] font-bold ${memberEnabled(dec) ? (dec.memberAccessTokenHash ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-amber-50 border-amber-100 text-amber-700') : 'bg-red-50 border-red-100 text-red-700'}`}>
                    <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                    <span>Acceso del colegiado: {accessLabel(dec)}</span>
                  </div>

                  {(dec.polizaPraxisArchivo || (hasActiveAdjunto(dec) && dec.certificadoAnssalArchivo)) && (
                    <div className="grid grid-cols-1 gap-2 pt-1">
                      {hasActiveAdjunto(dec) && dec.certificadoAnssalArchivo && (
                        <button
                          type="button"
                          onClick={() => downloadAttachment(dec.certificadoAnssalArchivo, dec.certificadoAnssalArchivoNombre || 'certificado-anssal.pdf')}
                          className="cokifimi-admin-card-download-button"
                        >
                          Descargar certificado ANSSAL
                        </button>
                      )}
                      {dec.polizaPraxisArchivo && (
                        <button
                          type="button"
                          onClick={() => downloadAttachment(dec.polizaPraxisArchivo, dec.polizaPraxisArchivoNombre || 'poliza-praxis.pdf')}
                          className="cokifimi-admin-card-download-button"
                        >
                          Descargar póliza de praxis
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expiration warning badge */}
                  <div className={`flex items-center gap-2 p-2 rounded-xl border text-[10px] font-medium ${
                    expired 
                      ? 'bg-red-50 border-red-100 text-red-700' 
                      : 'bg-blue-50/50 border-blue-100/60 text-blue-800'
                  }`}>
                    {expired ? (
                      <>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>Expirado: {dec.fechaVencimiento ? cardExpiryDate(dec)?.toLocaleDateString('es-AR') : '—'}</span>
                      </>
                    ) : (
                      <>
                        <Calendar className="w-3.5 h-3.5 shrink-0" />
                        <span>Vence: {dec.fechaVencimiento ? cardExpiryDate(dec)?.toLocaleDateString('es-AR') : '—'}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Card footer actions */}
                <div className="cokifimi-admin-actions bg-gray-50/70 border-t border-gray-150 px-4 py-3 flex items-center justify-end">
                  <div className="cokifimi-admin-action-group flex gap-2">
                    <button
                      onClick={() => setDeclarationToDelete(dec)}
                      className="cokifimi-admin-action p-1.5 text-gray-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition-colors focus:outline-none"
                      title="Eliminar registro"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDuplicate(dec)}
                      className="cokifimi-admin-action p-1.5 text-gray-400 hover:text-blue-700 rounded-lg hover:bg-blue-50 transition-colors focus:outline-none"
                      title="Duplicar / Renovar"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    
                    <button
                      onClick={() => onEdit(dec)}
                      className="cokifimi-admin-action p-1.5 text-gray-400 hover:text-amber-700 rounded-lg hover:bg-amber-50 transition-colors focus:outline-none"
                      title="Editar formulario"
                    >
                      <Edit className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => onMemberAccess(dec)}
                      className={`cokifimi-admin-action p-1.5 rounded-lg transition-colors focus:outline-none ${memberEnabled(dec) ? 'text-red-500 hover:text-red-700 hover:bg-red-50' : 'text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50'}`}
                      title={memberEnabled(dec) ? 'Dar de baja el acceso' : 'Habilitar acceso'}
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                                        <div className="cokifimi-admin-primary-actions">
<button
                      onClick={() => onSelect(dec)}
                      className="cokifimi-admin-action cokifimi-admin-print-action bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-bold text-[11px] px-3.5 py-1.5 rounded-lg transition-colors flex items-center gap-1 shadow-sm focus:outline-none"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      Imprimir / Descargar
                    </button>
<button
                      type="button"
                      onClick={() => {
                        setBianualAlertTarget(dec);
                        setBianualAlertDraft(dec.bianualAlert?.message || '');
                      }}
                      className="cokifimi-admin-action cokifimi-bianual-alert-action p-1.5 rounded-lg transition-colors focus:outline-none"
                      title="Enviar alerta al colegiado"
                      aria-label="Enviar alerta al colegiado"
                    >
                      <BellRing className="w-4 h-4" />
                      <span className="cokifimi-bianual-alert-action-label">ENVIAR ALERTA</span>
                      <span className="cokifimi-bianual-alert-count">{getBianualAlertHistory(dec).length}</span>
                    </button>
                                        </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )) : (
        <div className="bg-white rounded-2xl border border-gray-150 p-12 text-center max-w-lg mx-auto shadow-sm space-y-4">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center text-blue-800 mx-auto">
            <FileText className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="font-bold text-gray-900 text-base">No se encontraron declaraciones</h3>
            <p className="text-xs text-gray-500">
              {searchTerm 
                ? 'No hay registros que coincidan con los criterios de búsqueda. Intente con otro término.' 
                : 'Comience creando su primera declaración jurada para completar en línea.'}
            </p>
          </div>
          <div className="pt-2">
            {searchTerm ? (
              <button
                onClick={() => setSearchTerm('')}
                className="text-xs font-bold text-blue-800 hover:underline focus:outline-none"
              >
                Limpiar filtros de búsqueda
              </button>
      ) : (
              <button
                onClick={onCreateNew}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-lg transition-colors inline-flex items-center gap-1.5 shadow"
              >
                <Plus className="w-3.5 h-3.5" />
                Crear Declaración
              </button>
            )}
          </div>
        </div>
      )}

      {showMemberAccessModal && createPortal(<div className="cokifimi-access-modal fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="member-access-title">
        <section className="cokifimi-access-dialog flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden">
          <header className="cokifimi-access-header flex items-start justify-between gap-4">
            <div><p className="cokifimi-access-kicker">Administración de accesos</p><h2 id="member-access-title">Colegiados y tokens de acceso</h2><p>El token es confidencial: se informa su estado, pero nunca se muestra su valor.</p></div>
            <button type="button" onClick={() => setShowMemberAccessModal(false)} className="cokifimi-access-close" aria-label="Cerrar"><X /></button>
          </header>
          <div className="grid grid-cols-1 gap-3 border-b border-slate-100 bg-slate-50 p-4 sm:grid-cols-3">
            <div className="cokifimi-access-stat rounded-xl border border-emerald-100 bg-white p-3"><p>Habilitados</p><strong>{enabledMemberCount}</strong></div>
            <div className="cokifimi-access-stat rounded-xl border border-blue-100 bg-white p-3"><p>Con token</p><strong>{tokenMemberCount}</strong></div>
            <div className="cokifimi-access-stat rounded-xl border border-red-100 bg-white p-3"><p>Dados de baja</p><strong>{disabledMemberCount}</strong></div>
          </div>
          <div className="cokifimi-access-search border-b border-slate-100 px-4 py-3"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={memberAccessSearch} onChange={(event) => setMemberAccessSearch(event.target.value)} placeholder="Buscar por nombre, DNI, matrícula o correo" /></div></div>
          <div className="cokifimi-access-table-wrap overflow-auto p-4"><div className="min-w-[760px] overflow-hidden rounded-xl border border-slate-200"><table><thead><tr><th>Colegiado</th><th>Correo registrado</th><th>Acceso</th><th className="text-right">Acciones</th></tr></thead><tbody>{memberAccessRecords.map((dec) => <tr key={dec.id}><td><strong>{dec.apellido}, {dec.nombres}</strong><span>DNI {dec.dni || '—'} · M.P. {dec.matricula || '—'}</span>{dec.memberProvisional && <em className="cokifimi-access-form-pending">Sin formulario presentado</em>}</td><td>{dec.email || 'Sin correo registrado'}</td><td><span className={`cokifimi-access-badge ${memberEnabled(dec) ? tokenBlocked(dec) ? 'is-disabled' : dec.memberAccessTokenHash ? 'is-enabled' : 'is-pending' : 'is-disabled'}`}>{accessLabel(dec)}</span></td><td><div className="cokifimi-access-actions"><button type="button" onClick={() => onMemberAccess(dec)} className={`cokifimi-access-action ${memberEnabled(dec) ? 'is-danger' : 'is-success'}`}>{memberEnabled(dec) ? 'Dar de baja' : 'Dar de alta'}</button><button type="button" onClick={() => { setShowMemberAccessModal(false); onEdit(dec); }} className="cokifimi-access-action is-neutral">Editar correo</button><button type="button" disabled={!dec.memberAccessTokenHash && !tokenBlocked(dec)} onClick={() => { if (window.confirm(`¿Restablecer el token de ${dec.apellido}, ${dec.nombres}? Deberá crear uno nuevo desde el portal.`)) onResetMemberToken(dec); }} className="cokifimi-access-action is-token"><KeyRound /> Restablecer token</button><button type="button" title="Eliminar colegiado, token y declaración" disabled={deletingMemberAccount === dec.dni} onClick={() => removeMemberAccount(dec)} className="cokifimi-access-action is-delete-member"><Trash2 /> {deletingMemberAccount === dec.dni ? 'Eliminando...' : 'Eliminar'}</button></div></td></tr>)}</tbody></table></div>{memberAccessRecords.length === 0 && <div className="cokifimi-access-empty"><p>No se encontraron colegiados con esos datos.</p>{memberAccessSearch.replace(/\D/g, '').length >= 7 && <button type="button" onClick={syncLegacyAccount} disabled={syncingLegacyAccount}><KeyRound /> {syncingLegacyAccount ? 'Sincronizando acceso...' : 'Incorporar acceso con token existente'}</button>}</div>}</div>
        </section>
      </div>, document.body)}

      {photoRecord && photoRecord.fotoUrl && <div className="cokifimi-photo-viewer-modal fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4" role="dialog" aria-modal="true">
        <div className="cokifimi-photo-viewer-dialog relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
          <button type="button" onClick={() => setPhotoRecord(null)} className="cokifimi-photo-viewer-close absolute right-3 top-3 rounded-full bg-slate-100 p-2 text-slate-500 hover:bg-slate-200" title="Cerrar"><X className="w-4 h-4" /></button>
          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Foto de matrícula</p><h3 className="mt-1 pr-8 text-lg font-extrabold text-slate-900">M.P. {photoRecord.matricula || 'Sin matrícula'}</h3>
          <p className="text-xs text-slate-500">{photoRecord.apellido}, {photoRecord.nombres}</p>
          <img src={photoRecord.fotoUrl} alt={`Foto matrícula ${photoRecord.matricula}`} className="cokifimi-photo-viewer-image mx-auto mt-5 max-h-[55vh] rounded-xl object-contain shadow-sm" />
          <button type="button" onClick={() => downloadPhoto(photoRecord)} className="cokifimi-photo-viewer-download mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-xs font-bold text-white hover:bg-emerald-800"><Download className="w-4 h-4" /> Descargar foto</button>
        </div>
      </div>}

      {declarationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/45" role="dialog" aria-modal="true" aria-labelledby="delete-declaration-title">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-red-700">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <h3 id="delete-declaration-title" className="text-base font-bold">Eliminar registro</h3>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-600">
              ¿Está seguro de eliminar la declaración de <strong>{declarationToDelete.apellido}, {declarationToDelete.nombres}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeclarationToDelete(null)} className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">Cancelar</button>
              <button type="button" onClick={() => { onDelete(declarationToDelete.id); setDeclarationToDelete(null); }} className="rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700">Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {bianualAlertTarget && createPortal(
        <div className="cokifimi-bianual-alert-modal" role="dialog" aria-modal="true" aria-labelledby="bianual-alert-title">
          <section className="cokifimi-bianual-alert-dialog">
            <header>
              <div className="cokifimi-bianual-alert-heading"><BellRing /><div><span>AVISO AL COLEGIADO</span><h2 id="bianual-alert-title">Enviar alerta de edición</h2></div></div>
              <button type="button" onClick={() => setBianualAlertTarget(null)} aria-label="Cerrar"><X /></button>
            </header>
            <p className="cokifimi-bianual-alert-recipient">{bianualAlertTarget.apellido}, {bianualAlertTarget.nombres}</p>
            {getBianualAlertHistory(bianualAlertTarget).length > 0 && (
              <div className="cokifimi-bianual-alert-history" aria-label="Historial de alertas enviadas">
                <div className="cokifimi-bianual-alert-history-title"><History /> <span>Mini historial de alertas enviadas</span></div>
                <div className="cokifimi-bianual-alert-history-list">
                  {[...getBianualAlertHistory(bianualAlertTarget)].reverse().slice(0, 5).map((item, index) => (
                    <article key={item.createdAt + "-" + index}>
                      <time>{new Date(item.createdAt).toLocaleString('es-AR')}</time>
                      <p>{item.message}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
            <label htmlFor="bianual-alert-message">Detalle de lo que debe editar o modificar</label>
            <textarea
              id="bianual-alert-message"
              value={bianualAlertDraft}
              onChange={(event) => setBianualAlertDraft(event.target.value)}
              placeholder="Ej.: Debe corregir la fecha de vencimiento de la póliza y volver a cargar el archivo."
              rows={6}
              maxLength={1000}
              autoFocus
            />
            <div className="cokifimi-bianual-alert-counter">{bianualAlertDraft.length}/1000</div>
            <div className="cokifimi-bianual-alert-actions">
              {getBianualAlertHistory(bianualAlertTarget).length > 0 && (
                <button type="button" className="cokifimi-bianual-alert-delete" disabled={savingBianualAlert} onClick={async () => {
                  if (!bianualAlertTarget) return;
                  if (!window.confirm('¿Eliminar la alerta del panel del colegiado y todo su historial?')) return;
                  setSavingBianualAlert(true);
                  try {
                    await onDeleteBianualAlerts(bianualAlertTarget);
                    setBianualAlertTarget(null);
                    setBianualAlertDraft('');
                  } finally {
                    setSavingBianualAlert(false);
                  }
                }}>Eliminar alerta e historial</button>
              )}
              <button type="button" onClick={() => setBianualAlertTarget(null)}>Cancelar</button>
              <button
                type="button"
                disabled={savingBianualAlert || !bianualAlertDraft.trim()}
                onClick={async () => {
                  if (!bianualAlertTarget || !bianualAlertDraft.trim()) return;
                  setSavingBianualAlert(true);
                  try {
                    await onSendBianualAlert(bianualAlertTarget, bianualAlertDraft.trim());
                    setBianualAlertTarget(null);
                    setBianualAlertDraft('');
                  } finally {
                    setSavingBianualAlert(false);
                  }
                }}
              >
                <Send /> {savingBianualAlert ? 'Enviando...' : 'ENVIAR ALERTA'}
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
      {/* Privacy note */}
      <div className="hidden bg-blue-50 border border-blue-100/70 rounded-2xl p-4 flex gap-3 text-blue-800 text-xs">
        <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5 text-blue-700" />
        <div>
          <h4 className="font-bold">Privacidad del Profesional Asegurada</h4>
          <p className="text-blue-700/90 leading-relaxed mt-0.5">
            Toda la información personal y títulos universitarios se almacena de forma segura y local en tu navegador. Los datos nunca son transmitidos a servidores externos, garantizando la total confidencialidad de tu matrícula médica provincial.
          </p>
        </div>
      </div>
    </div>
  );
}

