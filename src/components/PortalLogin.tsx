import { FormEvent, useState } from 'react';
import { ArrowRight, Eye, EyeOff, KeyRound, LockKeyhole, LogIn, ShieldCheck, UserRound } from 'lucide-react';
import { portalLogin } from '../api';

interface PortalLoginProps {
  onSuccess: () => void;
}

export default function PortalLogin({ onSuccess }: PortalLoginProps) {
  const [username, setUsername] = useState('admincokifi');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      await portalLogin(username, password);
      onSuccess();
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : 'No se pudo iniciar sesión.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="cokifimi-login-shell">
      <div className="cokifimi-login-orb cokifimi-login-orb-one" />
      <div className="cokifimi-login-orb cokifimi-login-orb-two" />
      <div className="cokifimi-login-card">
        <aside className="cokifimi-login-welcome">
          <div className="cokifimi-login-mark"><KeyRound /></div>
          <p className="cokifimi-login-eyebrow">COKIFIMI MISIONES</p>
          <h1>Portal de gestión profesional</h1>
          <p className="cokifimi-login-copy">Administre declaraciones juradas, consulte registros y controle los vencimientos desde un solo lugar.</p>
          <div className="cokifimi-login-security"><ShieldCheck /><span>Acceso exclusivo para personal autorizado</span></div>
          <div className="cokifimi-login-lines" aria-hidden="true"><span /><span /><span /></div>
        </aside>

        <form onSubmit={handleSubmit} className="cokifimi-login-form">
          <div className="cokifimi-login-form-heading">
            <p>BIENVENIDO/A</p>
            <h2>Acceso administrativo</h2>
            <span>Ingrese sus credenciales para continuar.</span>
          </div>

          <div className="cokifimi-login-fields">
            <label htmlFor="portal-username">Usuario</label>
            <div className="cokifimi-login-input-wrap">
              <UserRound aria-hidden="true" />
              <input id="portal-username" type="text" required value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" />
            </div>

            <label htmlFor="portal-password">Contraseña</label>
            <div className="cokifimi-login-input-wrap">
              <LockKeyhole aria-hidden="true" />
              <input id="portal-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" />
              <button type="button" className="cokifimi-login-toggle" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          {error && <p className="cokifimi-login-error" role="alert">{error}</p>}

          <button type="submit" disabled={loading} className="cokifimi-login-submit">
            <LogIn />
            <span>{loading ? 'Verificando acceso...' : 'Ingresar al portal'}</span>
            {!loading && <ArrowRight className="cokifimi-login-arrow" />}
          </button>
          <p className="cokifimi-login-footer">Sistema de Declaraciones Juradas · Acceso seguro</p>
        </form>
      </div>
    </section>
  );
}
