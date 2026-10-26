import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import PasswordInput from './PasswordInput';
import {
  CLIENT_PRIVACY_VERSION,
  CLIENT_TERMS_VERSION,
  ClientLegalAcceptance,
  LegalDocumentLinks,
  PublicationConfirmation,
} from './ClientLegal';
import './edit-request.css';

const requiresLegalForSite = (targetSiteId) => /^calling-card-d(?:[1-9]|10)$/.test(targetSiteId || '');

const profileFields = [
  { key: 'name', label: 'Name', type: 'text', maxLength: 120 },
  { key: 'business', label: 'Business', type: 'text', maxLength: 160 },
  { key: 'role', label: 'Role or title', type: 'text', maxLength: 120 },
  { key: 'phone', label: 'Phone', type: 'tel', maxLength: 80 },
  { key: 'email', label: 'Public email', type: 'email', maxLength: 254 },
  { key: 'address', label: 'Address', type: 'text', maxLength: 300 },
  { key: 'facebook', label: 'Facebook URL', type: 'url', maxLength: 500 },
  { key: 'youtube', label: 'YouTube URL', type: 'url', maxLength: 500 },
  { key: 'description', label: 'Profile description', type: 'textarea', maxLength: 2000 },
];

function EditRequest() {
  const [session, setSession] = useState(undefined);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [sites, setSites] = useState([]);
  const [siteId, setSiteId] = useState('');
  const [requests, setRequests] = useState([]);
  const [selectedFields, setSelectedFields] = useState([]);
  const [values, setValues] = useState({});
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [legalStatus, setLegalStatus] = useState('loading');
  const [legalStatusSiteId, setLegalStatusSiteId] = useState('');
  const [legalError, setLegalError] = useState('');
  const [legalSaving, setLegalSaving] = useState(false);
  const [legalCheckAttempt, setLegalCheckAttempt] = useState(0);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return;
      if (sessionError) {
        setError(sessionError.message);
        setSession(null);
      } else {
        setSession(data?.session || null);
      }
      setLoading(false);
    }).catch((sessionError) => {
      if (!active) return;
      console.error('Unable to load edit-request session:', sessionError);
      setError('Unable to check your sign-in session. Refresh and try again.');
      setSession(null);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setError('');
      setNotice('');
    });
    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!session) {
      setSites([]);
      setSiteId('');
      setRequests([]);
      return () => { active = false; };
    }

    setLoading(true);
    setError('');
    supabase.rpc('get_my_managed_sites')
      .then((siteResult) => {
        if (!active) return;
        if (siteResult.error) throw siteResult.error;
        const assignedSites = siteResult.data || [];
        setSites(assignedSites);
        setSiteId((current) => (
          assignedSites.some((site) => site.site_id === current)
            ? current
            : assignedSites[0]?.site_id || ''
        ));
      })
      .catch((loadError) => {
        if (!active) return;
        console.error('Unable to load edit-request data:', loadError);
        setError('Unable to load your assigned site or request history. Contact your site administrator.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!session || !siteId || (
      requiresLegalForSite(siteId)
      && (legalStatusSiteId !== siteId || legalStatus !== 'accepted')
    )) {
      setRequests([]);
      return undefined;
    }

    let active = true;
    setLoading(true);
    supabase.from('site_edit_requests')
      .select('id, site_id, fields, notes, status, rejection_reason, review_decisions, email_status, created_at, reviewed_at')
      .eq('user_id', session.user.id)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error: requestError }) => {
        if (requestError) throw requestError;
        if (active) setRequests(data || []);
      })
      .catch((requestError) => {
        if (!active) return;
        console.error('Unable to load edit-request history:', requestError);
        setError('Unable to load your request history. Contact your site administrator.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [session?.user?.id, siteId, legalStatus, legalStatusSiteId]);

  useEffect(() => {
    if (!session || !siteId || !requiresLegalForSite(siteId)) {
      setLegalStatusSiteId(siteId);
      setLegalStatus('not-required');
      return undefined;
    }

    let active = true;
    setLegalStatusSiteId(siteId);
    setLegalStatus('loading');
    setLegalError('');
    supabase.from('client_legal_acceptances')
      .select('id')
      .eq('site_id', siteId)
      .eq('user_id', session.user.id)
      .eq('acceptance_type', 'onboarding')
      .eq('terms_version', CLIENT_TERMS_VERSION)
      .eq('privacy_notice_version', CLIENT_PRIVACY_VERSION)
      .limit(1)
      .maybeSingle()
      .then(({ data, error: acceptanceError }) => {
        if (acceptanceError) throw acceptanceError;
        if (active) {
          setLegalStatusSiteId(siteId);
          setLegalStatus(data ? 'accepted' : 'required');
        }
      })
      .catch((acceptanceError) => {
        console.error('Unable to verify edit-request legal acknowledgement:', acceptanceError);
        if (active) {
          setLegalError(acceptanceError.message || 'The acknowledgement could not be verified.');
          setLegalStatusSiteId(siteId);
          setLegalStatus('error');
        }
      });
    return () => { active = false; };
  }, [session?.user?.id, siteId, legalCheckAttempt]);

  const acceptLegalDocuments = async () => {
    if (!session?.user || !siteId) return;
    setLegalSaving(true);
    setLegalError('');
    try {
      const { error: acceptanceError } = await supabase.rpc('record_client_legal_acknowledgement', {
        target_site_id: siteId,
        target_terms_version: CLIENT_TERMS_VERSION,
        target_privacy_notice_version: CLIENT_PRIVACY_VERSION,
      });
      if (acceptanceError) throw acceptanceError;
      setLegalStatusSiteId(siteId);
      setLegalStatus('accepted');
    } catch (acceptanceError) {
      console.error('Unable to save edit-request legal acknowledgement:', acceptanceError);
      setLegalError(acceptanceError.message || 'Unable to save your acknowledgement. Please try again.');
      setLegalStatusSiteId(siteId);
      setLegalStatus('required');
    } finally {
      setLegalSaving(false);
    }
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
      if (loginError) throw loginError;
      setPassword('');
    } catch (loginError) {
      setError(loginError.message || 'Unable to sign in. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  const toggleField = (key) => {
    setSelectedFields((current) => current.includes(key)
      ? current.filter((field) => field !== key)
      : [...current, key]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!siteId) {
      setError('No active site is assigned to this account.');
      return;
    }
    if (selectedFields.length === 0) {
      setError('Select at least one profile field to update.');
      return;
    }
    if (requiresLegalForSite(siteId) && legalStatus !== 'accepted') {
      setError('Review and accept the current privacy notice and client terms before submitting a request.');
      return;
    }
    if (requiresLegalForSite(siteId) && !publicationConfirmed) {
      setError('Confirm that you are authorized to submit this information before sending the request.');
      return;
    }
    setSubmitting(true);
    try {
      const requestedFields = Object.fromEntries(
        selectedFields.map((key) => [key, String(values[key] || '').trim()]),
      );
      if (requiresLegalForSite(siteId)) {
        const { error: submitError } = await supabase.rpc('submit_client_edit_request_with_confirmation', {
          target_site_id: siteId,
          target_request_type: 'profile',
          target_client_email: session.user.email || '',
          target_payload: requestedFields,
          target_fields: requestedFields,
          target_notes: notes.trim(),
          target_publication_confirmed: publicationConfirmed,
        });
        if (submitError) throw submitError;
      } else {
        const { error: submitError } = await supabase.from('site_edit_requests').insert({
          site_id: siteId,
          user_id: session.user.id,
          client_email: session.user.email || '',
          fields: requestedFields,
          payload: requestedFields,
          notes: notes.trim(),
        });
        if (submitError) throw submitError;
      }
      setSelectedFields([]);
      setValues({});
      setNotes('');
      setPublicationConfirmed(false);
      setNotice('Your profile update request was sent to the administrator.');
      const { data, error: historyError } = await supabase.from('site_edit_requests')
        .select('id, site_id, fields, notes, status, rejection_reason, review_decisions, email_status, created_at, reviewed_at')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (historyError) throw historyError;
      setRequests(data || []);
    } catch (submitError) {
      console.error('Unable to submit edit request:', submitError);
      setError(submitError.message || 'Unable to send your request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && session === undefined) {
    return <main className="edit-request-loading"><span className="edit-request-spinner" aria-label="Loading" /></main>;
  }

  if (!session) {
    return (
      <main className="edit-request-wrap edit-request-auth-screen">
        <form className="edit-request-login" onSubmit={handleLogin}>
          <span className="edit-request-mark edit-request-login-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false">
              <path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
          </span>
          <p className="edit-request-eyebrow">CLIENT PORTAL</p>
          <h1>Welcome back</h1>
          <p className="edit-request-muted">Sign in securely to manage profile updates for your digital card.</p>
          {error && <div className="edit-request-alert error" role="alert">{error}</div>}
          <label>Email address<input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label>Password<PasswordInput autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <button className={`edit-request-submit edit-request-login-submit${loading ? ' is-loading' : ''}`} type="submit" disabled={loading} aria-live="polite">
            {loading && <span className="edit-request-login-spinner" aria-hidden="true" />}
            {loading ? 'Securely signing you in…' : 'Sign in to your workspace'}
          </button>
          <p className="edit-request-login-security"><span aria-hidden="true">✓</span> Your account is protected with secure sign-in</p>
          <LegalDocumentLinks />
          <a className="edit-request-back" href="/">Back to card</a>
        </form>
      </main>
    );
  }

  const currentSite = sites.find((site) => site.site_id === siteId);
  const selectedSiteRequiresLegal = requiresLegalForSite(siteId);
  const selectedSiteLegalStatus = legalStatusSiteId === siteId ? legalStatus : 'loading';

  if (selectedSiteRequiresLegal && selectedSiteLegalStatus === 'loading') {
    return <main className="edit-request-loading"><span className="edit-request-spinner" aria-label="Loading acknowledgement" /></main>;
  }

  if (selectedSiteRequiresLegal && selectedSiteLegalStatus === 'error') {
    return (
      <main className="edit-request-wrap">
        <section className="edit-request-login">
          <h1>Acknowledgement check unavailable</h1>
          <p className="edit-request-muted">The profile request form stays locked until the acknowledgement table is installed and available.</p>
          {legalError && <div className="edit-request-alert error" role="alert">{legalError}</div>}
          <p className="edit-request-muted">Ask the site administrator to run <code>supabase/client-legal-acceptance.sql</code>, then retry.</p>
          <button className="edit-request-submit" type="button" onClick={() => setLegalCheckAttempt((attempt) => attempt + 1)}>Retry acknowledgement check</button>
          <button className="edit-request-signout" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </section>
      </main>
    );
  }

  if (selectedSiteRequiresLegal && selectedSiteLegalStatus === 'required') {
    return (
      <ClientLegalAcceptance
        onAccept={acceptLegalDocuments}
        onSignOut={() => supabase.auth.signOut()}
        saving={legalSaving}
        error={legalError}
      />
    );
  }

  return (
    <main className="edit-request-wrap">
      <div className="edit-request-page">
        <header className="edit-request-header">
          <div>
            <span className="edit-request-mark" aria-hidden="true">N</span>
            <p className="edit-request-eyebrow">CLIENT PORTAL</p>
            <h1>Request a profile update</h1>
            <p className="edit-request-muted">Choose the profile fields you want changed. Submitting a request does not change your live card; an administrator must approve the request and publish the private draft separately.</p>
          </div>
          {selectedSiteRequiresLegal && <LegalDocumentLinks className="admin-header-legal-links" />}
          <button className="edit-request-signout" type="button" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </header>

        {error && <div className="edit-request-alert error" role="alert">{error}</div>}
        {notice && <div className="edit-request-alert success" role="status">{notice}</div>}

        {loading ? <p className="edit-request-muted">Loading your site…</p> : sites.length === 0 ? (
          <section className="edit-request-card">
            <h2>No active site assigned</h2>
            <p className="edit-request-muted">Ask your administrator to enable your client access, then sign in again.</p>
          </section>
        ) : (
          <>
            <form className="edit-request-card" onSubmit={handleSubmit}>
              <div className="edit-request-section-heading">
                <div><span>01</span><h2>Profile details</h2></div>
                {sites.length > 1 && (
                  <label className="edit-request-site-select">Site
                    <select value={siteId} onChange={(event) => {
                      setSiteId(event.target.value);
                      setPublicationConfirmed(false);
                    }}>
                      {sites.map((site) => <option key={site.site_id} value={site.site_id}>{site.name}</option>)}
                    </select>
                  </label>
                )}
              </div>
              {currentSite && <p className="edit-request-site-name">Request for <strong>{currentSite.name}</strong></p>}
              <p className="edit-request-muted">Select each field you want changed. Leave a selected field blank if you want it cleared. Approval stages the change privately; it is not live until the administrator publishes it.</p>
              <div className="edit-request-fields">
                {profileFields.map((field) => (
                  <div className={`edit-request-field${selectedFields.includes(field.key) ? ' selected' : ''}`} key={field.key}>
                    <label className="edit-request-field-toggle">
                      <input type="checkbox" checked={selectedFields.includes(field.key)} onChange={() => toggleField(field.key)} />
                      <span>{field.label}</span>
                    </label>
                    {field.type === 'textarea' ? (
                      <textarea
                        disabled={!selectedFields.includes(field.key)}
                        maxLength={field.maxLength}
                        value={values[field.key] || ''}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    ) : (
                      <input
                        type={field.type}
                        disabled={!selectedFields.includes(field.key)}
                        maxLength={field.maxLength}
                        value={values[field.key] || ''}
                        onChange={(event) => setValues((current) => ({ ...current, [field.key]: event.target.value }))}
                      />
                    )}
                  </div>
                ))}
              </div>
              {selectedSiteRequiresLegal && (
                <PublicationConfirmation checked={publicationConfirmed} onChange={setPublicationConfirmed} />
              )}
              <label className="edit-request-notes">Additional instructions (optional)
                <textarea maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} />
              </label>
              <div className="edit-request-submit-row">
                <span>Signed in as {session.user.email}</span>
                <button className="edit-request-submit" type="submit" disabled={submitting || (selectedSiteRequiresLegal && !publicationConfirmed)}>{submitting ? 'Sending request…' : 'Send update request'}</button>
              </div>
            </form>

            <section className="edit-request-card">
              <div className="edit-request-section-heading"><div><span>02</span><h2>Your recent requests</h2></div></div>
              {requests.length === 0 ? <p className="edit-request-muted">You have not submitted any requests yet.</p> : (
                <div className="edit-request-history">
                  {requests.map((request) => (
                    <article className="edit-request-history-item" key={request.id}>
                      <div><strong>{sites.find((site) => site.site_id === request.site_id)?.name || request.site_id}</strong><span>{new Date(request.created_at).toLocaleString()}</span></div>
                      <span className={`edit-request-status ${request.status}`}>{request.status === 'completed' ? 'Completed' : request.status === 'approved' ? 'Approved to draft' : request.status === 'rejected' ? 'Rejected' : 'In review'}</span>
                      <p>{Object.keys(request.fields || {}).map((key) => profileFields.find((field) => field.key === key)?.label || key).join(', ')}</p>
                      {request.status === 'rejected' && request.rejection_reason && <p>{request.rejection_reason}</p>}
                      {Object.entries(request.review_decisions || {})
                        .filter(([, decision]) => decision?.decision === 'reject')
                        .map(([key, decision]) => (
                          <p className="edit-request-rejection-detail" key={key}>
                            <strong>{decision.label || key}:</strong> {decision.reason || 'Not approved'}
                          </p>
                        ))}
                      {request.email_status === 'failed' && <p className="edit-request-rejection-detail">The administrator was unable to send the email notification yet; the rejection reasons are shown above.</p>}
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default EditRequest;
