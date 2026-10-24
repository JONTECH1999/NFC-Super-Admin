import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import './superadmin.css';

function getSiteAdminUrl(site) {
  try {
    const url = new URL(site.public_url);
    url.pathname = '/admin';
    url.searchParams.set('site_id', site.site_id);
    return url.toString();
  } catch {
    return '';
  }
}

const dashboardPages = {
  overview: 'Dashboard',
  sites: 'Connected sites',
  'add-site': 'Add a site',
};

function SuperAdmin() {
  const [session, setSession] = useState(undefined);
  const [authorized, setAuthorized] = useState(null);
  const [activePage, setActivePage] = useState(() => {
    const page = window.location.hash.slice(1);
    return Object.hasOwn(dashboardPages, page) ? page : 'overview';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [loginBusy, setLoginBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [credential, setCredential] = useState(null);
  const [assignSite, setAssignSite] = useState(null);
  const [assignEmail, setAssignEmail] = useState('');
  const [assignPassword, setAssignPassword] = useState('');
  const [assignPasswordConfirm, setAssignPasswordConfirm] = useState('');
  const [resetSite, setResetSite] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState('');
  const [form, setForm] = useState({ site_id: '', name: '', public_url: '', client_email: '', password: '', confirm_password: '' });

  const navigateTo = (page) => {
    if (!Object.hasOwn(dashboardPages, page)) return;
    window.history.pushState(null, '', `#${page}`);
    setActivePage(page);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const syncPageFromLocation = () => {
      const page = window.location.hash.slice(1);
      setActivePage(Object.hasOwn(dashboardPages, page) ? page : 'overview');
      setMobileMenuOpen(false);
    };
    window.addEventListener('popstate', syncPageFromLocation);
    window.addEventListener('hashchange', syncPageFromLocation);
    return () => {
      window.removeEventListener('popstate', syncPageFromLocation);
      window.removeEventListener('hashchange', syncPageFromLocation);
    };
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [mobileMenuOpen]);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) setError(sessionError.message);
      setSession(data?.session || null);
    }).catch((sessionError) => {
      if (!active) return;
      console.error('Unable to load super-admin session:', sessionError);
      setError('Unable to check your sign-in session. Please refresh and try again.');
      setSession(null);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const invoke = useCallback(async (body) => {
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw new Error('Unable to check your sign-in session. Please sign in again.');
    if (!sessionData.session) throw new Error('Your session has expired. Please sign in again.');

    if (sessionData.session.expires_at && sessionData.session.expires_at * 1000 <= Date.now() + 60_000) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError || !refreshed.session) {
        throw new Error('Your session has expired. Please sign in again.');
      }
    }

    let { data, error: functionError } = await supabase.functions.invoke('super-admin-sites', { body });
    if (functionError?.context instanceof Response && functionError.context.status === 401) {
      const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
      if (!refreshError && refreshed.session) {
        ({ data, error: functionError } = await supabase.functions.invoke('super-admin-sites', { body }));
      }
    }
    if (functionError) {
      let message = functionError.message || 'Super-admin request failed.';
      if (functionError.context instanceof Response) {
        const responseText = await functionError.context.clone().text();
        if (responseText) {
          try {
            const responseBody = JSON.parse(responseText);
            if (typeof responseBody.error === 'string') message = responseBody.error;
          } catch (parseError) {
            console.error('Could not parse super-admin error response:', parseError);
          }
        }
        if (functionError.context.status === 401) {
          message = 'Your sign-in has expired. Please sign out and sign in again.';
        }
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }, []);

  const loadSites = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await invoke({ action: 'list_sites' });
      setSites(data.sites || []);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    let active = true;
    setAuthorized(null);
    if (!session) return () => { active = false; };
    supabase.rpc('is_super_admin').then(({ data, error: accessError }) => {
      if (!active) return;
      if (accessError) {
        setError(accessError.message);
        setAuthorized(false);
        return;
      }
      setAuthorized(data === true);
    }).catch((accessError) => {
      if (!active) return;
      console.error('Unable to verify super-admin access:', accessError);
      setError('Unable to verify super-admin access. Please refresh and try again.');
      setAuthorized(false);
    });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (authorized) loadSites();
  }, [authorized, loadSites]);

  const handleCreateSite = async (event) => {
    event.preventDefault();
    if (form.password !== form.confirm_password) {
      setError('The client password entries do not match.');
      return;
    }
    setBusyAction('create');
    setError('');
    setNotice('');
    setCredential(null);
    try {
      const data = await invoke({
        action: 'create_site',
        site_id: form.site_id,
        name: form.name,
        public_url: form.public_url,
        client_email: form.client_email,
        password: form.password,
      });
      setCredential({ email: data.site.client_email, password: form.password });
      setNotice('Site and client login created. Share the password securely; it will not be shown again.');
      setForm({ site_id: '', name: '', public_url: '', client_email: '', password: '', confirm_password: '' });
      await loadSites();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusyAction('');
    }
  };

  const runSiteAction = async (site, action, confirmMessage) => {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setBusyAction(`${action}:${site.site_id}`);
    setError('');
    setNotice('');
    setCredential(null);
    try {
      await invoke({ action, site_id: site.site_id, is_active: action === 'set_site_active' ? !site.is_active : undefined });
      if (action === 'revoke_client') {
        setNotice(`Client access for ${site.name} was revoked.`);
      } else if (action === 'restore_client') {
        setNotice(`Client access for ${site.name} was restored.`);
      } else {
        setNotice(`${site.name} is now ${site.is_active ? 'paused' : 'active'}.`);
      }
      await loadSites();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleAssignClient = async (event) => {
    event.preventDefault();
    if (!assignSite) return;
    if (assignPassword !== assignPasswordConfirm) {
      setError('The client password entries do not match.');
      return;
    }
    setBusyAction(`assign:${assignSite.site_id}`);
    setError('');
    setNotice('');
    setCredential(null);
    try {
      const data = await invoke({
        action: 'assign_client',
        site_id: assignSite.site_id,
        client_email: assignEmail,
        password: assignPassword,
      });
      setCredential({ email: data.site.client_email, password: assignPassword });
      setNotice('Client login created. Share the password securely; it will not be shown again.');
      setAssignSite(null);
      setAssignEmail('');
      setAssignPassword('');
      setAssignPasswordConfirm('');
      await loadSites();
    } catch (assignError) {
      setError(assignError.message);
    } finally {
      setBusyAction('');
    }
  };

  const handleResetClientPassword = async (event) => {
    event.preventDefault();
    if (!resetSite) return;
    if (resetPassword !== resetPasswordConfirm) {
      setError('The client password entries do not match.');
      return;
    }
    setBusyAction(`reset:${resetSite.site_id}`);
    setError('');
    setNotice('');
    setCredential(null);
    try {
      await invoke({
        action: 'reset_client_password',
        site_id: resetSite.site_id,
        password: resetPassword,
      });
      setCredential({ email: resetSite.client_email, password: resetPassword });
      setNotice('Client password updated. Share the new password securely; it will not be shown again.');
      setResetSite(null);
      setResetPassword('');
      setResetPasswordConfirm('');
    } catch (resetError) {
      setError(resetError.message);
    } finally {
      setBusyAction('');
    }
  };

  const copyClientPassword = async () => {
    if (!credential) return;
    try {
      await navigator.clipboard.writeText(credential.password);
      setNotice('Client password copied. Store or send it securely, then close this message.');
    } catch {
      setError('Clipboard access failed. Select and copy the client password manually.');
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setLoginBusy(true);
    const formData = new FormData(event.currentTarget);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: String(formData.get('email') || ''),
        password: String(formData.get('password') || ''),
      });
      if (signInError) throw signInError;
    } catch (signInError) {
      setError(signInError.message || 'Unable to sign in. Please try again.');
    } finally {
      setLoginBusy(false);
    }
  };

  const activeSiteCount = sites.filter((site) => site.is_active).length;
  const pausedSiteCount = sites.length - activeSiteCount;
  const clientCount = sites.filter((site) => site.client_user_id && site.client_enabled).length;

  if (session === undefined || (session && authorized === null)) {
    return <main className="superadmin-loading"><span className="superadmin-spinner" aria-label="Loading" /></main>;
  }

  if (!session) {
    return (
      <main className="superadmin-login-wrap">
        <form className="superadmin-login" onSubmit={handleLogin}>
          <div className="superadmin-brandmark" aria-hidden="true">S</div>
          <p className="superadmin-eyebrow">CONTROL CENTER</p>
          <h1>Super Admin</h1>
          <p className="superadmin-muted">Sign in with your owner account to manage all connected sites.</p>
          {error && <div className="superadmin-alert error" role="alert">{error}</div>}
          <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button className="superadmin-primary" type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in…' : 'Sign in securely'}</button>
        </form>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="superadmin-login-wrap">
        <section className="superadmin-login">
          <p className="superadmin-eyebrow">ACCESS RESTRICTED</p>
          <h1>Owner access required</h1>
          <p className="superadmin-muted">This account is not authorized to administer sites. Sign in with the owner account assigned in the Supabase super_admins table.</p>
          {error && <div className="superadmin-alert error" role="alert">{error}</div>}
          <button className="superadmin-secondary" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  return (
    <main className="superadmin-shell">
      <aside className={`superadmin-sidebar${mobileMenuOpen ? ' is-open' : ''}`}>
        <a className="superadmin-brand" href="#overview" aria-label="Site Control dashboard" onClick={(event) => { event.preventDefault(); navigateTo('overview'); }}>
          <span className="superadmin-brand-icon">N</span>
          <span><strong>NFC SITES</strong><small>Site control center</small></span>
        </a>
        <p className="superadmin-nav-label">WORKSPACE</p>
        <nav className="superadmin-nav" aria-label="Dashboard navigation">
          <a className={activePage === 'overview' ? 'selected' : ''} aria-current={activePage === 'overview' ? 'page' : undefined} href="#overview" onClick={(event) => { event.preventDefault(); navigateTo('overview'); }}><span aria-hidden="true">▦</span> Overview</a>
          <a className={activePage === 'sites' ? 'selected' : ''} aria-current={activePage === 'sites' ? 'page' : undefined} href="#sites" onClick={(event) => { event.preventDefault(); navigateTo('sites'); }}><span aria-hidden="true">▤</span> Connected sites</a>
          <a className={activePage === 'add-site' ? 'selected' : ''} aria-current={activePage === 'add-site' ? 'page' : undefined} href="#add-site" onClick={(event) => { event.preventDefault(); navigateTo('add-site'); }}><span aria-hidden="true">＋</span> Add a site</a>
        </nav>
        <div className="superadmin-sidebar-account">
          <span className="superadmin-avatar" aria-hidden="true">{session.user.email?.slice(0, 1).toUpperCase()}</span>
          <span className="superadmin-sidebar-identity"><strong>Administrator</strong><small>{session.user.email}</small></span>
          <button type="button" aria-label="Sign out" title="Sign out" onClick={() => supabase.auth.signOut()}>↗</button>
        </div>
      </aside>
      {mobileMenuOpen && <button className="superadmin-sidebar-backdrop" type="button" aria-label="Close navigation menu" onClick={() => setMobileMenuOpen(false)} />}

      <div className="superadmin-workspace">
        <header className="superadmin-topbar">
          <div className="superadmin-topbar-leading">
            <button className="superadmin-mobile-menu" type="button" aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>{mobileMenuOpen ? '×' : '☰'}</button>
            <div><span className="superadmin-breadcrumb">Workspace</span><span className="superadmin-breadcrumb-separator">/</span><strong>{dashboardPages[activePage]}</strong></div>
          </div>
          <span className="superadmin-topbar-status"><i /> Shared database connected</span>
        </header>

        <div className="superadmin-content">
          <section className="superadmin-page-heading">
            <div><p className="superadmin-eyebrow">SITE ADMINISTRATION</p><h1>{dashboardPages[activePage]}</h1><p>{activePage === 'overview' ? 'Manage client websites and their access from one workspace.' : activePage === 'sites' ? 'Review and manage every site connected to your workspace.' : 'Register a website and set up its initial client access.'}</p></div>
            {activePage !== 'add-site' && <button type="button" className="superadmin-primary superadmin-compact-action" onClick={() => navigateTo('add-site')}>＋ Add site</button>}
          </section>

          {error && <div className="superadmin-alert error" role="alert">{error}</div>}
          {notice && <div className="superadmin-alert success" role="status">{notice}</div>}
          {credential && (
            <section className="superadmin-credential">
              <div>
                <strong>Client login password</strong>
                <p>For {credential.email}. It is shown once here; share it with the client through a secure channel.</p>
                <code>{credential.password}</code>
              </div>
              <button type="button" className="superadmin-secondary" onClick={copyClientPassword}>Copy password</button>
            </section>
          )}

          {activePage === 'overview' && (
            <>
              <section className="superadmin-metrics" aria-label="Site summary">
                <article className="superadmin-metric-card"><span className="superadmin-metric-icon">▤</span><div><span>Total sites</span><strong>{sites.length}</strong></div><small>Registered in workspace</small></article>
                <article className="superadmin-metric-card"><span className="superadmin-metric-icon green">●</span><div><span>Active sites</span><strong>{activeSiteCount}</strong></div><small>Available to visitors</small></article>
                <article className="superadmin-metric-card"><span className="superadmin-metric-icon amber">Ⅱ</span><div><span>Paused sites</span><strong>{pausedSiteCount}</strong></div><small>Temporarily unavailable</small></article>
                <article className="superadmin-metric-card"><span className="superadmin-metric-icon blue">♙</span><div><span>Client accounts</span><strong>{clientCount}</strong></div><small>Enabled client access</small></article>
              </section>
              <section className="superadmin-panel superadmin-sites-panel">
                <div className="superadmin-panel-heading">
                  <div><p className="superadmin-eyebrow">WORKSPACE</p><h2>Site overview</h2><p className="superadmin-section-note">A quick look at your connected websites.</p></div>
                  <button className="superadmin-secondary" type="button" onClick={() => navigateTo('sites')}>View all sites</button>
                </div>
                {sites.length === 0 ? <p className="superadmin-empty">No sites are connected yet. Add a site to get started.</p> : (
                  <div className="superadmin-overview-sites">
                    {sites.slice(0, 4).map((site) => (
                      <article className="superadmin-overview-site" key={site.site_id}>
                        <span className="superadmin-site-mark" aria-hidden="true">{site.name?.slice(0, 1).toUpperCase() || 'S'}</span>
                        <span><strong>{site.name}</strong><small>{site.client_email || 'No client login assigned'}</small></span>
                        <span className={`superadmin-status ${site.is_active ? 'active' : ''}`}>{site.is_active ? 'Active' : 'Paused'}</span>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}

          {activePage === 'sites' && (
            <section className="superadmin-panel superadmin-sites-panel">
              <div className="superadmin-panel-heading">
                <div><p className="superadmin-eyebrow">WORKSPACE</p><h2>Connected sites</h2><p className="superadmin-section-note">Review site status, client access, and management actions.</p></div>
                <button className="superadmin-secondary" type="button" onClick={loadSites} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh list'}</button>
              </div>
              {loading && sites.length === 0 ? <p className="superadmin-muted">Loading your sites…</p> : null}
              {!loading && !error && sites.length === 0 ? <p className="superadmin-empty">No sites are connected yet. Use “Add a site” to create your first workspace.</p> : null}
              <div className="superadmin-site-list">
                {sites.map((site) => (
                  <article className="superadmin-site" key={site.site_id}>
                    <div className="superadmin-site-main">
                      <span className="superadmin-site-mark" aria-hidden="true">{site.name?.slice(0, 1).toUpperCase() || 'S'}</span>
                      <div className="superadmin-site-details">
                        <div className="superadmin-site-titleline"><h3>{site.name}</h3><span className={`superadmin-status ${site.is_active ? 'active' : ''}`}>{site.is_active ? 'Active' : 'Paused'}</span></div>
                        <code>{site.site_id}</code>
                        <a className="superadmin-site-url" href={site.public_url} target="_blank" rel="noreferrer">{site.public_url || 'No public URL configured'}</a>
                      </div>
                      <div className="superadmin-client-summary"><small>CLIENT ACCOUNT</small><span>{site.client_email || 'No login assigned'}</span><em className={site.client_user_id && site.client_enabled ? 'enabled' : ''}>{site.client_user_id && site.client_enabled ? 'Access enabled' : site.client_user_id ? 'Access revoked' : 'Not configured'}</em></div>
                    </div>
                    <div className="superadmin-site-actions">
                      {getSiteAdminUrl(site) && <a className="superadmin-manage-link" href={getSiteAdminUrl(site)} target="_blank" rel="noreferrer">Manage card</a>}
                      {site.client_user_id && site.client_enabled ? <>
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => { setResetSite(site); setResetPassword(''); setResetPasswordConfirm(''); setError(''); }}>Change password</button>
                        <button type="button" className="superadmin-danger" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'revoke_client', `Revoke ${site.client_email}'s access to ${site.name}?`)}>Revoke access</button>
                      </> : site.client_user_id ? (
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'restore_client', `Restore ${site.client_email}'s access to ${site.name}?`)}>Restore access</button>
                      ) : (
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => { setAssignSite(site); setAssignEmail(''); setAssignPassword(''); setAssignPasswordConfirm(''); setError(''); }}>Create client login</button>
                      )}
                      <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'set_site_active', `${site.is_active ? 'Pause' : 'Activate'} ${site.name}?`)}>{site.is_active ? 'Pause site' : 'Activate site'}</button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activePage === 'add-site' && <section className="superadmin-panel superadmin-create-panel">
            <div className="superadmin-panel-heading">
              <div><p className="superadmin-eyebrow">NEW WORKSPACE</p><h2>Add a site and client</h2><p className="superadmin-section-note">Register a site and create its initial client login.</p></div>
            </div>
            <form className="superadmin-form superadmin-create-form" onSubmit={handleCreateSite}>
              <label>Site ID<input value={form.site_id} onChange={(event) => setForm({ ...form, site_id: event.target.value })} placeholder="e.g. acme-cards" pattern="[a-z0-9][a-z0-9-]{1,62}" required /></label>
              <label>Business / site name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Acme Business" maxLength={120} required /></label>
              <label>Public website URL<input type="url" value={form.public_url} onChange={(event) => setForm({ ...form, public_url: event.target.value })} placeholder="https://acme.web.app" required /></label>
              <label>Client email<input type="email" value={form.client_email} onChange={(event) => setForm({ ...form, client_email: event.target.value })} placeholder="client@example.com" required /></label>
              <label>Client password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
              <label>Confirm client password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required /></label>
              <p className="superadmin-form-note">Use a unique email and a password between 12 and 128 characters. The hosting site must be set up and deployed separately.</p>
              <button className="superadmin-primary" type="submit" disabled={busyAction === 'create'}>{busyAction === 'create' ? 'Creating…' : 'Create site and login'}</button>
            </form>
          </section>}
        </div>
      </div>
      {assignSite && (
        <div className="superadmin-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyAction) {
            setAssignSite(null);
            setAssignPassword('');
            setAssignPasswordConfirm('');
          }
        }}>
          <form className="superadmin-login superadmin-assign-modal" onSubmit={handleAssignClient} aria-labelledby="assign-client-title">
            <p className="superadmin-eyebrow">CLIENT ACCESS</p>
            <h2 id="assign-client-title">Create login for {assignSite.name}</h2>
            <p className="superadmin-muted">Choose a password between 12 and 128 characters for this client.</p>
            {error && <div className="superadmin-alert error" role="alert">{error}</div>}
            <label>Client email<input type="email" autoComplete="email" required value={assignEmail} onChange={(event) => setAssignEmail(event.target.value)} /></label>
            <label>Client password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={assignPassword} onChange={(event) => setAssignPassword(event.target.value)} /></label>
            <label>Confirm client password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={assignPasswordConfirm} onChange={(event) => setAssignPasswordConfirm(event.target.value)} /></label>
            <div className="superadmin-site-actions">
              <button className="superadmin-secondary" type="button" disabled={busyAction !== ''} onClick={() => { setAssignSite(null); setAssignPassword(''); setAssignPasswordConfirm(''); }}>Cancel</button>
              <button className="superadmin-primary" type="submit" disabled={busyAction !== ''}>{busyAction ? 'Creating…' : 'Create login'}</button>
            </div>
          </form>
        </div>
      )}
      {resetSite && (
        <div className="superadmin-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyAction) {
            setResetSite(null);
            setResetPassword('');
            setResetPasswordConfirm('');
          }
        }}>
          <form className="superadmin-login superadmin-assign-modal" onSubmit={handleResetClientPassword} aria-labelledby="reset-client-password-title">
            <p className="superadmin-eyebrow">CLIENT ACCESS</p>
            <h2 id="reset-client-password-title">Set a new password for {resetSite.name}</h2>
            <p className="superadmin-muted">The current password will stop working. Choose 12 to 128 characters.</p>
            {error && <div className="superadmin-alert error" role="alert">{error}</div>}
            <label>New client password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label>
            <label>Confirm new password<input type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} /></label>
            <div className="superadmin-site-actions">
              <button className="superadmin-secondary" type="button" disabled={busyAction !== ''} onClick={() => { setResetSite(null); setResetPassword(''); setResetPasswordConfirm(''); }}>Cancel</button>
              <button className="superadmin-primary" type="submit" disabled={busyAction !== ''}>{busyAction ? 'Saving…' : 'Save new password'}</button>
            </div>
          </form>
        </div>
      )}
      <footer className="superadmin-footer">Client passwords are set by the administrator and never stored in this dashboard.</footer>
    </main>
  );
}

export default SuperAdmin;
