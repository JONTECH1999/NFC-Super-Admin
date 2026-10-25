import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import SuperAdminSiteEditor from './SuperAdminSiteEditor';
import './superadmin.css';

const dashboardPages = {
  overview: 'Dashboard',
  sites: 'Connected sites',
  'add-site': 'Add a site',
};

function formatAge(timestamp) {
  if (!timestamp) return '';
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 60000));
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const elapsedHours = Math.floor(elapsedMinutes / 60);
  if (elapsedHours < 24) return `${elapsedHours}h`;
  return `${Math.floor(elapsedHours / 24)}d`;
}

function SuperAdmin() {
  const [session, setSession] = useState(undefined);
  const [authorized, setAuthorized] = useState(null);
  const [activePage, setActivePage] = useState(() => {
    const page = window.location.hash.slice(1);
    return Object.hasOwn(dashboardPages, page) ? page : 'overview';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [editingSiteId, setEditingSiteId] = useState('');
  const [siteSearch, setSiteSearch] = useState('');
  const [siteFilter, setSiteFilter] = useState('all');
  const [siteSort, setSiteSort] = useState('attention');
  const [showHostingInfo, setShowHostingInfo] = useState(false);
  const [dashboardData, setDashboardData] = useState({ activity: [], requests: [] });
  const [dashboardLoading, setDashboardLoading] = useState(false);
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

  const openSitesFilter = (filter) => {
    setSiteSearch('');
    setSiteFilter(filter);
    navigateTo('sites');
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

  const loadDashboardData = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const data = await invoke({ action: 'get_dashboard_data' });
      setDashboardData({ activity: data.activity || [], requests: data.requests || [] });
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setDashboardLoading(false);
    }
  }, [invoke]);

  useEffect(() => {
    if (authorized) {
      loadSites();
      loadDashboardData();
    }
  }, [authorized, loadSites, loadDashboardData]);

  useEffect(() => {
    if (!authorized) return undefined;
    const refreshDashboard = () => {
      if (document.visibilityState === 'visible') loadDashboardData();
    };
    window.addEventListener('focus', refreshDashboard);
    document.addEventListener('visibilitychange', refreshDashboard);
    return () => {
      window.removeEventListener('focus', refreshDashboard);
      document.removeEventListener('visibilitychange', refreshDashboard);
    };
  }, [authorized, loadDashboardData]);

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
      await Promise.all([loadSites(), loadDashboardData()]);
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
      await Promise.all([loadSites(), loadDashboardData()]);
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyAction('');
    }
  };

  const setSitePaymentStatus = async (site, paymentStatus) => {
    setBusyAction(`payment:${site.site_id}`);
    setError('');
    setNotice('');
    try {
      await invoke({ action: 'set_payment_status', site_id: site.site_id, payment_status: paymentStatus });
      const labels = { none: 'No payment follow-up', awaiting_payment: 'Awaiting payment', paid: 'Paid' };
      setNotice(`${site.name} marked: ${labels[paymentStatus]}.`);
      await Promise.all([loadSites(), loadDashboardData()]);
    } catch (paymentError) {
      setError(paymentError.message);
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
      await Promise.all([loadSites(), loadDashboardData()]);
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
      await loadDashboardData();
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
  const sitesNeedingAttention = sites.map((site) => {
    const issues = [];
    if (!site.is_active) issues.push('Site paused');
    if (site.missing_configuration?.length) issues.push(...site.missing_configuration);
    if (!site.client_user_id) issues.push('Client not assigned');
    else if (!site.client_enabled) issues.push('Client access revoked');
    if (site.has_unpublished_draft && site.payment_status !== 'paid') issues.push('Draft waiting for payment');
    if ((site.pending_request_count || 0) > 0) issues.push(`${site.pending_request_count} pending edit request(s)`);
    let readiness;
    if (!site.is_active) readiness = 'Paused';
    else if (site.missing_configuration?.length) readiness = 'Needs setup';
    else if (site.has_unpublished_draft && site.payment_status !== 'paid') readiness = 'Payment required';
    else if (site.has_unpublished_draft) readiness = 'Ready to publish';
    else readiness = 'Live';
    return { ...site, issues: [...new Set(issues)], readiness };
  }).filter((site) => site.issues.length > 0);
  const paymentSites = sites.filter((site) => site.payment_status === 'awaiting_payment');
  const unassignedSites = sites.filter((site) => !site.client_user_id);
  const siteOperationalSummary = sites.map((site) => {
    const missingConfiguration = site.missing_configuration || [];
    const hasUnpublishedDraft = Boolean(site.has_unpublished_draft);
    const issueCount = Number(!site.is_active)
      + missingConfiguration.length
      + Number(!site.client_user_id || !site.client_enabled)
      + Number(site.payment_status !== 'paid' && hasUnpublishedDraft)
      + Number((site.pending_request_count || 0) > 0);
    let readiness;
    if (!site.is_active) readiness = 'Paused';
    else if (missingConfiguration.length) readiness = 'Needs setup';
    else if (hasUnpublishedDraft && site.payment_status !== 'paid') readiness = 'Payment required';
    else if (hasUnpublishedDraft) readiness = 'Ready to publish';
    else readiness = 'Live';
    return { ...site, readiness, issueCount };
  });
  const visibleSites = siteOperationalSummary
    .filter((site) => {
      const query = siteSearch.trim().toLowerCase();
      const matchesSearch = !query || [
        site.name,
        site.site_id,
        site.client_email,
        site.public_url,
      ].some((value) => value?.toLowerCase().includes(query));
      if (!matchesSearch) return false;
      if (siteFilter === 'needs_attention') return site.issueCount > 0;
      if (siteFilter === 'draft') return site.has_unpublished_draft;
      if (siteFilter === 'unpaid') return site.payment_status !== 'paid';
      if (siteFilter === 'paused') return !site.is_active;
      if (siteFilter === 'unassigned') return !site.client_user_id;
      if (siteFilter === 'requests') return site.pending_request_count > 0;
      if (siteFilter === 'live') return site.readiness === 'Live';
      return true;
    })
    .sort((a, b) => {
      if (siteSort === 'name') return a.name.localeCompare(b.name);
      if (siteSort === 'oldest_request') {
        if (!a.oldest_pending_request_at) return b.oldest_pending_request_at ? 1 : a.name.localeCompare(b.name);
        if (!b.oldest_pending_request_at) return -1;
        return a.oldest_pending_request_at.localeCompare(b.oldest_pending_request_at);
      }
      if (siteSort === 'newest') return b.created_at.localeCompare(a.created_at);
      return b.issueCount - a.issueCount || b.created_at.localeCompare(a.created_at);
    });
  const sitesWithUnpublishedChanges = sites.filter((site) => site.has_unpublished_draft).length;
  const totalPendingRequests = sites.reduce((count, site) => count + (site.pending_request_count || 0), 0);
  const sitesRequiringAttention = siteOperationalSummary.filter((site) => site.issueCount > 0).length;

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
          <a className={activePage === 'overview' ? 'selected' : ''} aria-current={activePage === 'overview' ? 'page' : undefined} href="#overview" onClick={(event) => { event.preventDefault(); navigateTo('overview'); }}><span aria-hidden="true">▦</span> Dashboard</a>
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
              <div className="superadmin-dashboard-panels">
                <section className="superadmin-panel superadmin-dashboard-panel">
                  <div className="superadmin-panel-heading">
                    <div><p className="superadmin-eyebrow">ACTION REQUIRED</p><h2>Sites needing attention</h2><p className="superadmin-section-note">Paused sites and missing hosting or client configuration.</p></div>
                    <span className="superadmin-panel-count">{sitesNeedingAttention.length}</span>
                  </div>
                  {sitesNeedingAttention.length === 0 ? <p className="superadmin-empty">All sites are active and configured.</p> : (
                    <div className="superadmin-dashboard-list">
                      {sitesNeedingAttention.map((site) => (
                        <article className="superadmin-dashboard-row" key={site.site_id}>
                          <div><strong>{site.name}</strong><small>{site.issues.join(' · ')}</small></div>
                          <button className="superadmin-secondary" type="button" onClick={() => navigateTo('sites')}>Review</button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="superadmin-panel superadmin-dashboard-panel">
                  <div className="superadmin-panel-heading">
                    <div><p className="superadmin-eyebrow">PAYMENT FOLLOW-UP</p><h2>Pending to save</h2><p className="superadmin-section-note">Edited sites you marked as awaiting payment before upload.</p></div>
                    <span className="superadmin-panel-count">{paymentSites.length}</span>
                  </div>
                  {paymentSites.length === 0 ? <p className="superadmin-empty">No sites are marked as awaiting payment. Set this manually from Connected sites.</p> : (
                    <div className="superadmin-dashboard-list">
                      {paymentSites.map((site) => (
                        <article className="superadmin-dashboard-row" key={site.site_id}>
                          <div><strong>{site.name}</strong><small>{site.client_email || 'No client assigned'} · Awaiting payment</small></div>
                          <button className="superadmin-secondary" type="button" disabled={busyAction !== ''} onClick={() => setSitePaymentStatus(site, 'paid')}>{busyAction === `payment:${site.site_id}` ? 'Saving…' : 'Mark paid'}</button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="superadmin-panel superadmin-dashboard-panel">
                  <div className="superadmin-panel-heading">
                    <div><p className="superadmin-eyebrow">CLIENT SUPPORT</p><h2>Edit requests</h2><p className="superadmin-section-note">Client profile and product changes waiting for administrator review.</p></div>
                    <span className="superadmin-panel-count">{dashboardData.requests.length}</span>
                  </div>
                  <p className="superadmin-request-link"><a href="/edit-request.html" target="_blank" rel="noreferrer">Open the client request form ↗</a></p>
                  {dashboardLoading ? <p className="superadmin-muted">Loading requests…</p> : dashboardData.requests.length === 0 ? <p className="superadmin-empty">No pending client changes.</p> : (
                    <div className="superadmin-dashboard-list">
                      {dashboardData.requests.map((request) => {
                        const site = sites.find((item) => item.site_id === request.site_id);
                        const fields = request.request_type === 'products'
                          ? 'Product changes'
                          : Object.keys(request.payload || request.fields || {}).join(', ');
                        return (
                          <article className="superadmin-dashboard-row request" key={request.id}>
                            <div><strong>{site?.name || request.site_id}</strong><small>{request.client_email} · {fields || 'Profile update'}</small><small>{new Date(request.created_at).toLocaleString()}</small>{request.notes && <p>{request.notes}</p>}</div>
                            <button className="superadmin-secondary" type="button" disabled={busyAction !== ''} onClick={() => { setEditingSiteId(request.site_id); navigateTo('sites'); }}>Review in editor</button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="superadmin-panel superadmin-dashboard-panel">
                  <div className="superadmin-panel-heading">
                    <div><p className="superadmin-eyebrow">AUDIT TRAIL</p><h2>Recent admin activity</h2><p className="superadmin-section-note">Site and client-account changes made by super admins.</p></div>
                    <button className="superadmin-secondary" type="button" onClick={loadDashboardData} disabled={dashboardLoading}>{dashboardLoading ? 'Refreshing…' : 'Refresh'}</button>
                  </div>
                  {dashboardLoading && dashboardData.activity.length === 0 ? <p className="superadmin-muted">Loading activity…</p> : dashboardData.activity.length === 0 ? <p className="superadmin-empty">No admin activity recorded yet.</p> : (
                    <div className="superadmin-dashboard-list">
                      {dashboardData.activity.map((item) => (
                        <article className="superadmin-dashboard-row activity" key={item.id}>
                          <div><strong>{item.description}</strong><small>{sites.find((site) => site.site_id === item.site_id)?.name || 'Workspace'} · {item.actor_email}</small></div>
                          <time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                <section className="superadmin-panel superadmin-dashboard-panel">
                  <div className="superadmin-panel-heading">
                    <div><p className="superadmin-eyebrow">CLIENT ASSIGNMENT</p><h2>Unassigned sites</h2><p className="superadmin-section-note">Sites that have no client account assigned yet.</p></div>
                    <span className="superadmin-panel-count">{unassignedSites.length}</span>
                  </div>
                  {unassignedSites.length === 0 ? <p className="superadmin-empty">Every site has a client assigned.</p> : (
                    <div className="superadmin-dashboard-list">
                      {unassignedSites.map((site) => (
                        <article className="superadmin-dashboard-row" key={site.site_id}>
                          <div><strong>{site.name}</strong><small>{site.site_id} · No client assigned</small></div>
                          <button className="superadmin-secondary" type="button" onClick={() => navigateTo('sites')}>Assign</button>
                        </article>
                      ))}
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {activePage === 'sites' && (
            <section className="superadmin-panel superadmin-sites-panel">
              <div className="superadmin-panel-heading">
                <div><p className="superadmin-eyebrow">WORKSPACE</p><h2>Connected sites</h2><p className="superadmin-section-note">Review site readiness, unpublished content, client access, and pending work.</p></div>
                <button className="superadmin-secondary" type="button" onClick={loadSites} disabled={loading}>{loading ? 'Refreshing…' : 'Refresh list'}</button>
              </div>
              <div className="superadmin-sites-summary" aria-label="Site operations summary">
                <article>
                  <span>Needs attention</span>
                  <strong>{sitesRequiringAttention}</strong>
                  <button type="button" onClick={() => openSitesFilter('needs_attention')}>View affected sites</button>
                </article>
                <article>
                  <span>Unpublished drafts</span>
                  <strong>{sitesWithUnpublishedChanges}</strong>
                  <button type="button" onClick={() => openSitesFilter('draft')}>View draft sites</button>
                </article>
                <article>
                  <span>Pending requests</span>
                  <strong>{totalPendingRequests}</strong>
                  <button type="button" onClick={() => openSitesFilter('requests')}>View request sites</button>
                </article>
                <article>
                  <span>Hosting health</span>
                  <strong>Not monitored</strong>
                  <button type="button" aria-expanded={showHostingInfo} onClick={() => setShowHostingInfo((visible) => !visible)}>
                    {showHostingInfo ? 'Hide details' : 'What does this mean?'}
                  </button>
                </article>
              </div>
              {showHostingInfo && (
                <div className="superadmin-hosting-info" role="status">
                  <strong>Hosting is not checked automatically.</strong>
                  <span>This dashboard does not currently run availability checks, so “Not monitored” does not mean the site is down. Open Connected sites below and use each site’s public URL to check it manually.</span>
                  <button type="button" className="superadmin-secondary" onClick={() => openSitesFilter('all')}>View site URLs</button>
                </div>
              )}
              <div className="superadmin-sites-toolbar">
                <label className="superadmin-sites-search">Search sites
                  <input type="search" value={siteSearch} onChange={(event) => setSiteSearch(event.target.value)} placeholder="Name, site ID, client, or URL" />
                </label>
                <label>Filter
                  <select value={siteFilter} onChange={(event) => setSiteFilter(event.target.value)}>
                    <option value="all">All sites</option>
                    <option value="needs_attention">Needs attention</option>
                    <option value="draft">Unpublished changes</option>
                    <option value="unpaid">Not marked paid</option>
                    <option value="paused">Paused</option>
                    <option value="unassigned">Unassigned client</option>
                    <option value="requests">Pending requests</option>
                    <option value="live">Live content</option>
                  </select>
                </label>
                <label>Sort by
                  <select value={siteSort} onChange={(event) => setSiteSort(event.target.value)}>
                    <option value="attention">Attention priority</option>
                    <option value="oldest_request">Oldest request</option>
                    <option value="newest">Recently added</option>
                    <option value="name">Site name</option>
                  </select>
                </label>
              </div>
              {loading && sites.length === 0 ? <p className="superadmin-muted">Loading your sites…</p> : null}
              {!loading && !error && sites.length === 0 ? <p className="superadmin-empty">No sites are connected yet. Use “Add a site” to create your first workspace.</p> : null}
              {editingSiteId && sites.some((site) => site.site_id === editingSiteId) ? (
                <SuperAdminSiteEditor
                  site={sites.find((site) => site.site_id === editingSiteId)}
                  invoke={invoke}
                  onClose={() => setEditingSiteId('')}
                  onChanged={() => Promise.all([loadSites(), loadDashboardData()])}
                />
              ) : <div className="superadmin-site-list">
                {visibleSites.map((site) => (
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
                    <div className="superadmin-site-operational">
                      <span className={`superadmin-readiness ${site.readiness.toLowerCase().replaceAll(' ', '-')}`}>{site.readiness}</span>
                      <span className="superadmin-operational-item"><small>PAYMENT</small><strong>{site.payment_status === 'paid' ? 'Paid' : site.payment_status === 'awaiting_payment' ? 'Awaiting payment' : 'Not recorded'}</strong></span>
                      <span className="superadmin-operational-item"><small>CONTENT</small><strong>{site.has_unpublished_draft ? 'Unpublished changes' : 'Live content'}</strong><time dateTime={site.published_at || undefined}>{site.published_at ? `Published ${new Date(site.published_at).toLocaleDateString()}` : 'Publish time not tracked'}</time></span>
                      <span className="superadmin-operational-item"><small>HOSTING</small><strong className="not-monitored">Not monitored</strong></span>
                      <span className="superadmin-operational-item"><small>EDIT REQUESTS</small><strong>{site.pending_request_count || 0} pending</strong>{site.oldest_pending_request_at && <time dateTime={site.oldest_pending_request_at}>Oldest waiting {formatAge(site.oldest_pending_request_at)} · {new Date(site.oldest_pending_request_at).toLocaleDateString()}</time>}</span>
                      {site.missing_configuration?.length > 0 && <p className="superadmin-config-warning">Missing configuration: {site.missing_configuration.join(', ')}</p>}
                    </div>
                    <div className="superadmin-site-actions">
                      <button type="button" className="superadmin-manage-link" disabled={busyAction !== ''} onClick={() => setEditingSiteId(site.site_id)}>Edit site</button>
                      {site.client_user_id && site.client_enabled ? <>
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => { setResetSite(site); setResetPassword(''); setResetPasswordConfirm(''); setError(''); }}>Change password</button>
                        <button type="button" className="superadmin-danger" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'revoke_client', `Revoke ${site.client_email}'s access to ${site.name}?`)}>Revoke access</button>
                      </> : site.client_user_id ? (
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'restore_client', `Restore ${site.client_email}'s access to ${site.name}?`)}>Restore access</button>
                      ) : (
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => { setAssignSite(site); setAssignEmail(''); setAssignPassword(''); setAssignPasswordConfirm(''); setError(''); }}>Create client login</button>
                      )}
                      <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'set_site_active', `${site.is_active ? 'Pause' : 'Activate'} ${site.name}?`)}>{site.is_active ? 'Pause site' : 'Activate site'}</button>
                      <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => setSitePaymentStatus(site, site.payment_status === 'awaiting_payment' ? 'paid' : site.payment_status === 'paid' ? 'none' : 'awaiting_payment')}>
                        {site.payment_status === 'awaiting_payment' ? 'Mark paid' : site.payment_status === 'paid' ? 'Clear payment' : 'Mark awaiting payment'}
                      </button>
                    </div>
                  </article>
                ))}
                {visibleSites.length === 0 && sites.length > 0 && <p className="superadmin-empty">No sites match this search and filter.</p>}
              </div>}
            </section>
          )}

          {activePage === 'add-site' && <section className="superadmin-panel superadmin-create-panel">
            <div className="superadmin-panel-heading">
              <div><p className="superadmin-eyebrow">NEW WORKSPACE</p><h2>Add a site and client</h2><p className="superadmin-section-note">Register a site and create its initial client login.</p></div>
            </div>
            <form className="superadmin-form superadmin-create-form" onSubmit={handleCreateSite}>
              <label>Site ID<input value={form.site_id} onChange={(event) => setForm({ ...form, site_id: event.target.value })} placeholder="e.g. acme-cards" pattern="[a-z0-9][a-z0-9-]{1,39}" maxLength={40} required /></label>
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
