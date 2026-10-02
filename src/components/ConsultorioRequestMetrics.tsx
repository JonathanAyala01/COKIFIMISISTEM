import { BadgeDollarSign, CalendarClock, CheckCircle2, Clock3, FileCheck, FileX2, MapPin, PieChart, Receipt, TimerReset } from 'lucide-react';
import { DeclarationData } from '../types';
import { normalizeMisionesLocality } from '../data/misionesLocalities';

export default function ConsultorioRequestMetrics({ declarations }: { declarations: DeclarationData[] }) {
  const requests = declarations.filter((item) => Boolean(item.formularioHabilitacionConsultorio?.submittedAt));
  const approved = requests.filter((item) => item.formularioHabilitacionConsultorio?.estadoAdmin === 'APROBADO' || item.formularioHabilitacionConsultorio?.validadoAdmin === true).length;
  const rejected = requests.filter((item) => item.formularioHabilitacionConsultorio?.estadoAdmin === 'RECHAZADO').length;
  const localities = requests.reduce<Record<string, number>>((result, item) => { const rawName = String(item.formularioHabilitacionConsultorio?.localidadConsultorio || item.municipioLocalidad || '').trim(); const name = rawName ? normalizeMisionesLocality(rawName) : 'Sin localidad'; result[name] = (result[name] || 0) + 1; return result; }, {});
  const localityRows = Object.entries(localities).sort(([, a], [, b]) => b - a);
  const maxLocality = localityRows[0]?.[1] || 1;
  const total = requests.length;
  const parseDate = (value: unknown) => { const text = String(value || '').trim(); if (!text) return null; const iso = text.match(/^(\\d{4})-(\\d{2})-(\\d{2})/); if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])); const reversed = text.match(/^(\\d{2})[-/](\\d{2})[-/](\\d{4})/); if (reversed) return new Date(Number(reversed[3]), Number(reversed[2]) - 1, Number(reversed[1])); const parsed = new Date(text); return Number.isNaN(parsed.getTime()) ? null : parsed; };
  const expiryFor = (item: DeclarationData) => { const form = item.formularioHabilitacionConsultorio || {}; const stored = parseDate(form.certificadoVigenciaHasta); if (stored) return stored; const start = parseDate(form.certificadoVigenciaDesde || form.validadoAt); if (!start) return null; const months = Number(String(form.mesesHabilitacion || form.periodoHabilitacion || '').match(/6|12|24/)?.[0] || 6); start.setMonth(start.getMonth() + months); return start; };
  const awaitingPayment = requests.filter((item) => item.formularioHabilitacionConsultorio?.estadoImporte === 'IMPORTE_CONFIRMADO' && !['COMPROBANTE_RECIBIDO', 'PAGO_VALIDADO'].includes(String(item.formularioHabilitacionConsultorio?.estadoPago || ''))).length;
  const paymentsToVerify = requests.filter((item) => item.formularioHabilitacionConsultorio?.estadoPago === 'COMPROBANTE_RECIBIDO').length;
  // Una solicitud queda pendiente hasta que Administración la aprueba o rechaza.
  // También incluye las solicitudes recién presentadas con estados iniciales PENDIENTE.
  const pendingVerification = requests.filter((item) => {
    const form = item.formularioHabilitacionConsultorio || {};
    const isApproved = form.estadoAdmin === 'APROBADO' || form.validadoAdmin === true;
    const isRejected = form.estadoAdmin === 'RECHAZADO';
    return !isApproved && !isRejected;
  }).length;
  const approvedAmount = requests.reduce((sum, item) => sum + (Number(item.formularioHabilitacionConsultorio?.importeConfirmado || 0) || 0), 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const expired = requests.filter((item) => { const isApproved = item.formularioHabilitacionConsultorio?.estadoAdmin === 'APROBADO' || item.formularioHabilitacionConsultorio?.validadoAdmin === true; const expiry = expiryFor(item); return isApproved && Boolean(expiry && expiry < today); }).length;
  const expiringSoon = requests.filter((item) => { const isApproved = item.formularioHabilitacionConsultorio?.estadoAdmin === 'APROBADO' || item.formularioHabilitacionConsultorio?.validadoAdmin === true; const expiry = expiryFor(item); if (!expiry || !isApproved) return false; const days = Math.ceil((expiry.getTime() - today.getTime()) / 86400000); return days >= 0 && days <= 7; }).length;
  let cursor = 0;
  const colors = ['#0f8f68', '#36b77f', '#7ad8aa', '#f2b84b', '#e87979', '#7b9ce8'];
  const donutStops = localityRows.length ? localityRows.map(([, count], index) => { const start = cursor; cursor += (count / total) * 100; return `${colors[index % colors.length]} ${start}% ${cursor}%`; }).join(', ') : '#dcebe3 0 100%';
  return <div className="cokifimi-consultorio-request-metrics"><div><FileCheck /><span>Altas solicitadas</span><strong>{total}</strong></div><div className="is-approved"><CheckCircle2 /><span>Altas completadas</span><strong>{approved}</strong></div><div className="is-pending"><Clock3 /><span>Pendientes de verificar</span><strong>{pendingVerification}</strong></div><div className="is-rejected"><FileX2 /><span>Rechazadas</span><strong>{rejected}</strong></div><div className="is-payment"><BadgeDollarSign /><span>Esperando pago</span><strong>{awaitingPayment}</strong></div><div className="is-payment"><Receipt /><span>Pagos para confirmar</span><strong>{paymentsToVerify}</strong></div><div className="is-amount"><BadgeDollarSign /><span>Importes aprobados</span><strong>$ {approvedAmount.toLocaleString('es-AR')}</strong></div><div className="is-expiry"><CalendarClock /><span>Altas por vencer · 7 días</span><strong>{expiringSoon}</strong></div><div className="is-expiry"><TimerReset /><span>Altas vencidas</span><strong>{expired}</strong></div><div className="cokifimi-consultorio-localities"><MapPin /><div><span>Solicitudes por localidad</span>{localityRows.length ? <div className="cokifimi-consultorio-locality-bars">{localityRows.map(([name, count]) => <div key={name}><label>{name}</label><i><b style={{ width: `${Math.max(8, (count / maxLocality) * 100)}%` }} /></i><strong>{count}</strong></div>)}</div> : <p>Sin solicitudes registradas</p>}</div></div><div className="cokifimi-consultorio-territorial-card"><div className="cokifimi-consultorio-territorial-heading"><span>Resumen territorial</span><PieChart /></div><div className="cokifimi-consultorio-territorial-content"><div className="cokifimi-consultorio-donut" style={{ background: `conic-gradient(${donutStops})` }}><div><strong>{total}</strong><span>consultorios</span></div></div><div className="cokifimi-consultorio-territorial-legend">{localityRows.length ? localityRows.map(([name, count], index) => <div key={name}><i style={{ background: colors[index % colors.length] }} /><span>{name}</span><strong>{Math.round((count / total) * 100)}%</strong></div>) : <span>Sin datos territoriales</span>}</div></div></div></div>;
}
