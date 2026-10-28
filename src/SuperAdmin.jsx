import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import PasswordInput from './PasswordInput';
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

function getClientAdminUrl(site) {
  try {
    const url = new URL(site.public_url);
    url.pathname = '/admin';
    url.searchParams.set('site_id', site.site_id);
    return url.toString();
  } catch {
    return '';
  }
}

function SuperAdmin() {
  const [theme, setTheme] = useState(() => {
    try {
      return window.localStorage.getItem('superadmin-theme') === 'dark' ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });
  const [session, setSession] = useState(undefined);
  const [authorized, setAuthorized] = useState(null);
  const [activePage, setActivePage] = useState(() => {
    const page = window.location.hash.slice(1);
    return Object.hasOwn(dashboardPages, page) ? page : 'overview';
  });
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sites, setSites] = useState([]);
  const [editingSiteId, setEditingSiteId] = useState('');
  const [siteCategoryTab, setSiteCategoryTab] = useState('clients'); // 'clients' | 'trials' | 'templates'
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
  const [emailSite, setEmailSite] = useState(null);
  const [trialStartSite, setTrialStartSite] = useState(null);
  const [trialStartDays, setTrialStartDays] = useState('7');
  const [clientEmail, setClientEmail] = useState('');
  const [replacementPassword, setReplacementPassword] = useState('');
  const [replacementPasswordConfirm, setReplacementPasswordConfirm] = useState('');
  const [form, setForm] = useState({
    site_id: '',
    name: '',
    public_url: '',
    client_email: '',
    password: '',
    confirm_password: '',
    is_trial: false,
    trial_days: 7,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem('superadmin-theme', theme);
    } catch (themeError) {
      console.warn('Unable to save super-admin theme preference:', themeError);
    }
  }, [theme]);

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
        is_trial: form.is_trial,
        trial_days: Number(form.trial_days),
      });
      setCredential({
        email: data.site.client_email,
        password: form.password,
        publicUrl: data.site.public_url,
      });
      setNotice(data.site.is_trial
        ? `${form.trial_days}-day preview created. Share the preview link privately; it expires ${new Date(data.site.trial_ends_at).toLocaleString()}.`
        : 'Site and client login created. Share the password securely; it will not be shown again.');
      setForm({
        site_id: '',
        name: '',
        public_url: '',
        client_email: '',
        password: '',
        confirm_password: '',
        is_trial: false,
        trial_days: 7,
      });
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
      await invoke({
        action,
        site_id: site.site_id,
        is_active: action === 'set_site_active' ? !site.is_active : undefined,
        trial_days: action === 'extend_trial' ? 7 : undefined,
      });
      if (action === 'revoke_client') {
        setNotice(`Client access for ${site.name} was revoked.`);
      } else if (action === 'restore_client') {
        setNotice(`Client access for ${site.name} was restored.`);
      } else if (action === 'extend_trial') {
        setNotice(`${site.name}'s preview was extended by 7 days.`);
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

  const handleStartExistingSiteTrial = async (event) => {
    event.preventDefault();
    if (!trialStartSite) return;
    const days = Number(trialStartDays);
    if (!Number.isInteger(days) || days < 1 || days > 30) {
      setError('Choose a trial length between 1 and 30 days.');
      return;
    }
    setBusyAction(`start_trial:${trialStartSite.site_id}`);
    setError('');
    setNotice('');
    try {
      await invoke({
        action: 'start_trial',
        site_id: trialStartSite.site_id,
        trial_days: days,
      });
      setNotice(`${trialStartSite.name} is now on a ${days}-day trial. Its existing URL, content, and client login are unchanged.`);
      setTrialStartSite(null);
      setTrialStartDays('7');
      await Promise.all([loadSites(), loadDashboardData()]);
    } catch (trialError) {
      setError(trialError.message);
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

  const handleChangeClientEmail = async (event) => {
    event.preventDefault();
    if (!emailSite) return;
    if (replacementPassword !== replacementPasswordConfirm) {
      setError('The client password entries do not match.');
      return;
    }
    setBusyAction(`email:${emailSite.site_id}`);
    setError('');
    setNotice('');
    setCredential(null);
    try {
      await invoke({
        action: 'replace_client_login',
        site_id: emailSite.site_id,
        client_email: clientEmail,
        password: replacementPassword,
      });
      setCredential({ email: clientEmail.trim().toLowerCase(), password: replacementPassword });
      setNotice('A separate client login was created and assigned to this site. The previous account and its access to other sites remain unchanged.');
      setEmailSite(null);
      setClientEmail('');
      setReplacementPassword('');
      setReplacementPasswordConfirm('');
      await Promise.all([loadSites(), loadDashboardData()]);
    } catch (emailError) {
      setError(emailError.message);
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

  const isTemplateSite = (site) => {
    return /^calling-card-d(?:[1-9]|10)$/i.test(site.site_id) && !site.client_user_id;
  };

  const activeSiteCount = sites.filter((site) => site.is_active && !isTemplateSite(site)).length;
  const pausedSiteCount = sites.filter((site) => !site.is_active && !isTemplateSite(site)).length;
  const trialSiteCount = sites.filter((site) => site.is_trial).length;
  const clientCount = sites.filter((site) => site.client_user_id && site.client_enabled).length;

  const sitesNeedingAttention = sites.filter((site) => !isTemplateSite(site)).map((site) => {
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
  const unassignedSites = sites.filter((site) => !site.client_user_id && !isTemplateSite(site));

  const siteOperationalSummary = sites.map((site) => {
    const missingConfiguration = site.missing_configuration || [];
    const hasUnpublishedDraft = Boolean(site.has_unpublished_draft);
    const isTemplate = isTemplateSite(site);
    const category = isTemplate ? 'templates' : site.is_trial ? 'trials' : 'clients';

    const issueCount = isTemplate ? 0 : (
      Number(!site.is_active)
      + missingConfiguration.length
      + Number(!site.client_user_id || !site.client_enabled)
      + Number(site.payment_status !== 'paid' && hasUnpublishedDraft)
      + Number((site.pending_request_count || 0) > 0)
    );

    let readiness;
    if (isTemplate) readiness = 'Template';
    else if (!site.is_active) readiness = site.trial_expired ? 'Expired' : 'Paused';
    else if (missingConfiguration.length) readiness = 'Needs setup';
    else if (hasUnpublishedDraft && site.payment_status !== 'paid') readiness = 'Payment required';
    else if (hasUnpublishedDraft) readiness = 'Ready to publish';
    else readiness = 'Live';

    return { ...site, readiness, issueCount, category, isTemplate };
  });

  const categorizedCounts = {
    clients: siteOperationalSummary.filter((s) => s.category === 'clients').length,
    trials: siteOperationalSummary.filter((s) => s.category === 'trials').length,
    templates: siteOperationalSummary.filter((s) => s.category === 'templates').length,
  };

  const visibleSites = siteOperationalSummary
    .filter((site) => {
      if (siteCategoryTab !== 'all' && site.category !== siteCategoryTab) return false;
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
    return <main className="superadmin-loading" data-theme={theme}><span className="superadmin-spinner" aria-label="Loading" /></main>;
  }

  if (!session) {
    return (
      <main className="superadmin-login-wrap" data-theme={theme}>
        <form className="superadmin-login" onSubmit={handleLogin}>
          <div className="superadmin-brandmark" aria-hidden="true">S</div>
          <p className="superadmin-eyebrow">CONTROL CENTER</p>
          <h1>Super Admin</h1>
          <p className="superadmin-muted">Sign in with your owner account to manage all connected sites.</p>
          <button className="superadmin-theme-toggle login-theme-toggle" type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          {error && <div className="superadmin-alert error" role="alert">{error}</div>}
          <label>Email address<input name="email" type="email" autoComplete="username" required /></label>
          <label>Password<PasswordInput name="password" autoComplete="current-password" required /></label>
          <button className="superadmin-primary" type="submit" disabled={loginBusy}>{loginBusy ? 'Signing in…' : 'Sign in securely'}</button>
        </form>
      </main>
    );
  }

  if (!authorized) {
    return (
      <main className="superadmin-login-wrap" data-theme={theme}>
        <section className="superadmin-login">
          <p className="superadmin-eyebrow">ACCESS RESTRICTED</p>
          <h1>Owner access required</h1>
          <p className="superadmin-muted">This account is not authorized to administer sites. Sign in with the owner account assigned in the Supabase super_admins table.</p>
          <button className="superadmin-theme-toggle login-theme-toggle" type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
            <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
            {theme === 'light' ? 'Dark mode' : 'Light mode'}
          </button>
          {error && <div className="superadmin-alert error" role="alert">{error}</div>}
          <button className="superadmin-secondary" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  return (
    <main className="superadmin-shell" data-theme={theme}>
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
          <div className="superadmin-topbar-actions">
            <button className="superadmin-theme-toggle" type="button" onClick={() => setTheme((current) => current === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`} title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}>
              <span aria-hidden="true">{theme === 'light' ? '☾' : '☀'}</span>
              <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
            </button>
            <span className="superadmin-topbar-status"><i /> Shared database connected</span>
          </div>
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
                {credential.publicUrl && <p><a href={credential.publicUrl} target="_blank" rel="noreferrer">Open preview link ↗</a></p>}
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
                <article className="superadmin-metric-card"><span className="superadmin-metric-icon amber">◷</span><div><span>Prospect trials</span><strong>{trialSiteCount}</strong></div><small>Active or awaiting expiry</small></article>
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
                  <span>Attention required</span>
                  <strong>{sitesRequiringAttention}</strong>
                  <button type="button" onClick={() => openSitesFilter('needs_attention')}>View issues</button>
                </article>
                <article>
                  <span>Active clients</span>
                  <strong>{categorizedCounts.clients}</strong>
                  <button type="button" onClick={() => setSiteCategoryTab('clients')}>View clients</button>
                </article>
                <article>
                  <span>Prospect trials</span>
                  <strong>{categorizedCounts.trials}</strong>
                  <button type="button" onClick={() => setSiteCategoryTab('trials')}>View trials</button>
                </article>
                <article>
                  <span>Pending edit requests</span>
                  <strong>{totalPendingRequests}</strong>
                  <button type="button" onClick={() => openSitesFilter('requests')}>View requests</button>
                </article>
              </div>
              {showHostingInfo && (
                <div className="superadmin-hosting-info" role="status">
                  <strong>Hosting is not checked automatically.</strong>
                  <span>This dashboard does not currently run availability checks, so “Not monitored” does not mean the site is down. Open Connected sites below and use each site’s public URL to check it manually.</span>
                  <button type="button" className="superadmin-secondary" onClick={() => openSitesFilter('all')}>View site URLs</button>
                </div>
              )}
              <div className="superadmin-category-tabs" role="tablist" aria-label="Site categories">
                <button
                  type="button"
                  role="tab"
                  className={`superadmin-category-tab ${siteCategoryTab === 'clients' ? 'active' : ''}`}
                  aria-selected={siteCategoryTab === 'clients'}
                  onClick={() => setSiteCategoryTab('clients')}
                >
                  <span className="superadmin-tab-icon">👥</span>
                  <span>Active Clients</span>
                  <span className="superadmin-tab-count">{categorizedCounts.clients}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`superadmin-category-tab ${siteCategoryTab === 'trials' ? 'active' : ''}`}
                  aria-selected={siteCategoryTab === 'trials'}
                  onClick={() => setSiteCategoryTab('trials')}
                >
                  <span className="superadmin-tab-icon">⏳</span>
                  <span>Prospect Trials</span>
                  <span className="superadmin-tab-count">{categorizedCounts.trials}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`superadmin-category-tab ${siteCategoryTab === 'templates' ? 'active' : ''}`}
                  aria-selected={siteCategoryTab === 'templates'}
                  onClick={() => setSiteCategoryTab('templates')}
                >
                  <span className="superadmin-tab-icon">🎨</span>
                  <span>Design Templates</span>
                  <span className="superadmin-tab-count">{categorizedCounts.templates}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  className={`superadmin-category-tab ${siteCategoryTab === 'all' ? 'active' : ''}`}
                  aria-selected={siteCategoryTab === 'all'}
                  onClick={() => setSiteCategoryTab('all')}
                >
                  <span>All ({sites.length})</span>
                </button>
              </div>
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
                        {site.is_trial && <div className="superadmin-trial-summary">
                          <strong>Time-limited trial</strong>
                          <span>{site.trial_ends_at ? `Ends ${new Date(site.trial_ends_at).toLocaleString()}` : 'Trial expiry not set'}</span>
                          <span>Last 7 days: {site.usage_last_7_days?.page_views || 0} page views · {site.usage_last_7_days?.unique_visitors || 0} daily unique browsers</span>
                          {site.usage_last_7_days?.last_visit_at && <span>Last visit {new Date(site.usage_last_7_days.last_visit_at).toLocaleString()}</span>}
                          {getClientAdminUrl(site) && <a href={getClientAdminUrl(site)} target="_blank" rel="noreferrer">Open client admin ↗</a>}
                        </div>}
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
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => { setEmailSite(site); setClientEmail(''); setReplacementPassword(''); setReplacementPasswordConfirm(''); setError(''); }}>Replace login</button>
                        <button type="button" className="superadmin-danger" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'revoke_client', `Revoke ${site.client_email}'s access to ${site.name}?`)}>Revoke access</button>
                      </> : site.client_user_id ? (
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'restore_client', `Restore ${site.client_email}'s access to ${site.name}?`)}>Restore access</button>
                      ) : (
                        <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => { setAssignSite(site); setAssignEmail(''); setAssignPassword(''); setAssignPasswordConfirm(''); setError(''); }}>Create client login</button>
                      )}
                      {site.site_id === 'aljon-contacts' && !site.is_trial && site.is_active && <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => { setTrialStartSite(site); setTrialStartDays('7'); setError(''); }}>Start trial</button>}
                      <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'set_site_active', `${site.is_active ? 'Pause' : 'Activate'} ${site.name}?`)}>{site.is_active ? 'Pause site' : 'Activate site'}</button>
                      {site.is_trial && <button type="button" className="superadmin-secondary" disabled={busyAction !== ''} onClick={() => runSiteAction(site, 'extend_trial', `Extend ${site.name}'s preview by 7 days?`)}>Extend 7 days</button>}
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
              <label className="superadmin-trial-toggle"><input type="checkbox" checked={form.is_trial} onChange={(event) => setForm({ ...form, is_trial: event.target.checked })} /> Create a time-limited prospect preview with the D10 design</label>
              {form.is_trial ? <>
                <label>Trial length (days)<input type="number" min="1" max="30" step="1" value={form.trial_days} onChange={(event) => setForm({ ...form, trial_days: event.target.value })} required /></label>
                <p className="superadmin-form-note">Preview link: https://calling-card-d10.web.app/?site_id={form.site_id || 'your-site-id'}. The new site starts with blank data; enter only details the prospect has authorized you to use. Anyone with the link can view it, so do not add confidential information.</p>
              </> : <label>Public website URL<input type="url" value={form.public_url} onChange={(event) => setForm({ ...form, public_url: event.target.value })} placeholder="https://acme.web.app" required /></label>}
              <label>Client email<input type="email" value={form.client_email} onChange={(event) => setForm({ ...form, client_email: event.target.value })} placeholder="client@example.com" required /></label>
              <label>Client password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} required /></label>
              <label>Confirm client password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} value={form.confirm_password} onChange={(event) => setForm({ ...form, confirm_password: event.target.value })} required /></label>
              <p className="superadmin-form-note">Use a unique email and a password between 12 and 128 characters. Trial links use the D10 design; no D10 client data is copied.</p>
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
            <label>Client password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} required value={assignPassword} onChange={(event) => setAssignPassword(event.target.value)} /></label>
            <label>Confirm client password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} required value={assignPasswordConfirm} onChange={(event) => setAssignPasswordConfirm(event.target.value)} /></label>
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
            <label>New client password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} required value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} /></label>
            <label>Confirm new password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} required value={resetPasswordConfirm} onChange={(event) => setResetPasswordConfirm(event.target.value)} /></label>
            <div className="superadmin-site-actions">
              <button className="superadmin-secondary" type="button" disabled={busyAction !== ''} onClick={() => { setResetSite(null); setResetPassword(''); setResetPasswordConfirm(''); }}>Cancel</button>
              <button className="superadmin-primary" type="submit" disabled={busyAction !== ''}>{busyAction ? 'Saving…' : 'Save new password'}</button>
            </div>
          </form>
        </div>
      )}
      {emailSite && (
        <div className="superadmin-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyAction) {
            setEmailSite(null);
            setClientEmail('');
            setReplacementPassword('');
            setReplacementPasswordConfirm('');
          }
        }}>
          <form className="superadmin-login superadmin-assign-modal" onSubmit={handleChangeClientEmail} aria-labelledby="change-client-email-title">
            <p className="superadmin-eyebrow">CLIENT ACCESS</p>
            <h2 id="change-client-email-title">Create a separate login for {emailSite.name}</h2>
            <p className="superadmin-muted">This creates a new account for this site only. The previous Gmail and its access to other sites will remain unchanged. The new account gets the password you set below.</p>
            {error && <div className="superadmin-alert error" role="alert">{error}</div>}
            <label>New client Gmail or email<input type="email" autoComplete="email" required value={clientEmail} onChange={(event) => setClientEmail(event.target.value)} /></label>
            <label>New client password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} required value={replacementPassword} onChange={(event) => setReplacementPassword(event.target.value)} /></label>
            <label>Confirm new client password<PasswordInput autoComplete="new-password" minLength={12} maxLength={128} required value={replacementPasswordConfirm} onChange={(event) => setReplacementPasswordConfirm(event.target.value)} /></label>
            <div className="superadmin-site-actions">
              <button className="superadmin-secondary" type="button" disabled={busyAction !== ''} onClick={() => { setEmailSite(null); setClientEmail(''); setReplacementPassword(''); setReplacementPasswordConfirm(''); }}>Cancel</button>
              <button className="superadmin-primary" type="submit" disabled={busyAction !== ''}>{busyAction === `email:${emailSite.site_id}` ? 'Creating…' : 'Create replacement login'}</button>
            </div>
          </form>
        </div>
      )}
      {trialStartSite && (
        <div className="superadmin-modal-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busyAction) {
            setTrialStartSite(null);
            setError('');
          }
        }}>
          <form className="superadmin-login superadmin-assign-modal superadmin-trial-start-modal" onSubmit={handleStartExistingSiteTrial} aria-labelledby="start-site-trial-title">
            <p className="superadmin-eyebrow">EXISTING SITE TRIAL</p>
            <h2 id="start-site-trial-title">Start a trial for {trialStartSite.name}</h2>
            <p className="superadmin-muted">This keeps the current URL, content, and client login. The site stays public during the trial; when it expires, the public site and client admin access will be blocked until you extend it or mark it paid.</p>
            {error && <div className="superadmin-alert error" role="alert">{error}</div>}
            <label>Trial length (days)<input type="number" min="1" max="30" step="1" required value={trialStartDays} onChange={(event) => setTrialStartDays(event.target.value)} /></label>
            <div className="superadmin-site-actions">
              <button className="superadmin-secondary" type="button" disabled={busyAction !== ''} onClick={() => { setTrialStartSite(null); setError(''); }}>Cancel</button>
              <button className="superadmin-primary" type="submit" disabled={busyAction !== ''}>{busyAction === `start_trial:${trialStartSite.site_id}` ? 'Starting…' : 'Start trial'}</button>
            </div>
          </form>
        </div>
      )}
      <footer className="superadmin-footer">Client passwords are set by the administrator and never stored in this dashboard.</footer>
    </main>
  );
}

export default SuperAdmin;
