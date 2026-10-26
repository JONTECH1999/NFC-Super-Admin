import { useState, useEffect, useLayoutEffect, useCallback, useRef, useId } from 'react';
import { createPortal } from 'react-dom';
import { profilesTable, productsTable, siteId, supabase, supabaseUrl } from './lib/supabase';
import { applyFavicon, applySiteTitle } from './lib/siteSettings';
import PasswordInput from './PasswordInput';
import {
  CLIENT_PRIVACY_VERSION,
  CLIENT_TERMS_VERSION,
  ClientLegalAcceptance,
  LegalDocumentLinks,
  PublicationConfirmation,
} from './ClientLegal';
import './admin.css';

const requiresLegalOnboarding = /^calling-card-d(?:[1-9]|10)$/.test(siteId);
const CACHE_SCOPE = (() => {
  try {
    if (supabaseUrl) {
      const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match && match[1]) return match[1];
    }
  } catch (e) {}
  return "default";
})();

const PRODUCTS_CACHE_KEY = `nfc_card_products_cache_${CACHE_SCOPE}_${siteId}`;
const ADMIN_SECTION_KEY = `nfc_admin_section_${CACHE_SCOPE}_${siteId}`;

function getAdminDraftKey(userId, section) {
  return `nfc_admin_draft_${CACHE_SCOPE}_${siteId}_${userId}_${section}`;
}

function readAdminDraft(key) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : null;
  } catch (error) {
    console.error('Unable to restore client admin draft:', error);
    return null;
  }
}

function writeAdminDraft(key, draft) {
  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (error) {
    console.error('Unable to save client admin draft:', error);
  }
}

function clearAdminDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Unable to clear client admin draft:', error);
  }
}

/* ============================================================
   Toast Component
   ============================================================ */
function Toast({ message, type, onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 3000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div className={`admin-toast ${type}`}>
      {message}
    </div>
  );
}

function HelpLabel({ htmlFor, children, help }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const triggerRef = useRef(null);
  const tooltipRef = useRef(null);
  const tooltipId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (
        !wrapperRef.current?.contains(event.target)
        && !tooltipRef.current?.contains(event.target)
      ) setOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    const updatePosition = () => {
      const trigger = triggerRef.current;
      const tooltip = tooltipRef.current;
      if (!trigger || !tooltip) return;

      const triggerRect = trigger.getBoundingClientRect();
      const tooltipWidth = Math.min(250, window.innerWidth - 24);
      const left = Math.min(
        Math.max(12, triggerRect.left),
        window.innerWidth - tooltipWidth - 12,
      );
      const below = triggerRect.bottom + 6;
      const top = below + tooltip.offsetHeight <= window.innerHeight - 12
        ? below
        : Math.max(12, triggerRect.top - tooltip.offsetHeight - 6);

      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
      tooltip.style.width = `${tooltipWidth}px`;
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [open]);

  return (
    <span className="admin-help-label" ref={wrapperRef}>
      <label className="admin-label" htmlFor={htmlFor}>{children}</label>
      <button
        ref={triggerRef}
        className="admin-help-trigger"
        type="button"
        aria-label={`Help: ${children}`}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        <i className="fa-solid fa-question" aria-hidden="true" />
      </button>
      {open && createPortal(
        <span ref={tooltipRef} className="admin-help-tooltip" id={tooltipId} role="tooltip">{help}</span>,
        document.querySelector('.admin-page') || document.body,
      )}
    </span>
  );
}

/* ============================================================
   Login Form
   ============================================================ */
function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
      if (authError) throw authError;
    } catch (err) {
      setError(err.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login admin-client-sign-in">
      <form className={`admin-login-card${loading ? ' is-signing-in' : ''}`} onSubmit={handleSubmit}>
        <div className="admin-login-brand" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 3 19 6v5c0 4.5-2.8 7.8-7 10-4.2-2.2-7-5.5-7-10V6l7-3Z" />
            <path d="m9 12 2 2 4-4" />
          </svg>
        </div>
        <p className="admin-login-eyebrow">YOUR CARD WORKSPACE</p>
        <h1 className="admin-login-title">Welcome back</h1>
        <p className="admin-login-subtitle">Sign in securely to manage your digital card.</p>

        {error && <div className="admin-login-error">{error}</div>}

        <div className="admin-form-group">
          <label className="admin-label" htmlFor="login-email">Email</label>
          <input
            id="login-email"
            className="admin-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        <div className="admin-form-group">
          <label className="admin-label" htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            className="admin-input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className={`admin-btn admin-btn-primary admin-login-submit${loading ? ' is-loading' : ''}`}
          style={{ width: '100%', marginTop: 8 }}
          disabled={loading}
          aria-live="polite"
        >
          {loading && <span className="admin-login-button-spinner" aria-hidden="true" />}
          {loading ? 'Securely signing you in…' : 'Sign in to your workspace'}
        </button>
        <p className="admin-login-security"><span aria-hidden="true">✓</span> Your account is protected with secure sign-in</p>
        <LegalDocumentLinks />
      </form>
    </div>
  );
}

function RequiredPasswordChange({ session, onComplete }) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    if (password.length < 12) {
      setError('Choose a password with at least 12 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const { data, error: completionError } = await supabase.functions.invoke('super-admin-sites', {
        body: { action: 'complete_client_password_change', new_password: password },
      });
      if (completionError) throw completionError;
      if (data?.error) throw new Error(data.error);
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      onComplete();
    } catch (updateError) {
      setError(updateError.message || 'Unable to update your password. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1 className="admin-login-title">Choose a new password</h1>
        <p className="admin-login-subtitle">For your security, replace the temporary password before continuing.</p>
        {error && <div className="admin-login-error" role="alert">{error}</div>}
        <div className="admin-form-group">
          <label className="admin-label" htmlFor="new-client-password">New password</label>
          <PasswordInput
            id="new-client-password"
            className="admin-input"
            autoComplete="new-password"
            minLength={12}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="admin-form-group">
          <label className="admin-label" htmlFor="confirm-client-password">Confirm new password</label>
          <PasswordInput
            id="confirm-client-password"
            className="admin-input"
            autoComplete="new-password"
            minLength={12}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        <button className="admin-btn admin-btn-primary" type="submit" disabled={saving}>
          {saving ? 'Updating…' : 'Set new password'}
        </button>
        <button className="admin-btn admin-btn-outline" type="button" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </form>
    </div>
  );
}

/* ============================================================
   Profile Tab
   ============================================================ */
function ProfileTab({ showToast, section, submitEditRequest, draftKey, requiresPublicationConfirmation = false }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [customLinksDirty, setCustomLinksDirty] = useState(false);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [customLinks, setCustomLinks] = useState([]);
  const [pendingLinkRemoval, setPendingLinkRemoval] = useState(null);
  const [uploadingPaymentIndex, setUploadingPaymentIndex] = useState(null);
  const fileRef = useRef(null);
  const iconFileRef = useRef(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from(profilesTable).select('*').eq('site_id', siteId).single();
      if (error) throw error;
      setProfile(data);
      const draft = readAdminDraft(draftKey);
      const hasDraft = draft?.version === 1
        && draft.form
        && typeof draft.form === 'object'
        && (draft.formDirty || draft.customLinksDirty);
      const restoredForm = hasDraft ? { ...data, ...draft.form } : data;
      setForm(restoredForm);
      setDirty(Boolean(hasDraft));
      setFormDirty(Boolean(hasDraft && draft.formDirty));
      setCustomLinksDirty(Boolean(hasDraft && draft.customLinksDirty));

      // Load custom social/action links from the live database.
      try {
        let links = [];
        if (data?.custom_links) {
          links = typeof data.custom_links === 'string' ? JSON.parse(data.custom_links) : data.custom_links;
        }
        const normalizedLinks = Array.isArray(links)
          ? links.map((item) => (
            item?.icon?.includes('youtube') && /^youtube(?:\s+\d+)?$/i.test(item.label?.trim() || '')
              ? { ...item, label: 'YouTube' }
              : item
          ))
          : [];
        const legacySocials = [
          { key: 'facebook', label: 'Facebook', icon: 'fa-brands fa-facebook-f' },
          { key: 'youtube', label: 'YouTube', icon: 'fa-brands fa-youtube' },
        ];
        legacySocials.forEach(({ key, label, icon }) => {
          const url = data?.[key]?.trim();
          const alreadyAdded = normalizedLinks.some(
            (item) => item?.type !== 'payment' && item?.url?.trim() === url,
          );
          if (url && !alreadyAdded) {
            normalizedLinks.push({
              id: `legacy-${key}`,
              type: 'social',
              label,
              icon,
              url,
            });
          }
        });
        setCustomLinks(hasDraft && Array.isArray(draft.customLinks) ? draft.customLinks : normalizedLinks);
      } catch (e) {
        setCustomLinks([]);
      }

      if (restoredForm?.site_title) {
        applySiteTitle(restoredForm.site_title, true);
        try { localStorage.setItem('nfc_card_site_title', restoredForm.site_title); } catch (e) {}
      }
      if (data?.site_icon_url) {
        applyFavicon(data.site_icon_url);
        try { localStorage.setItem('nfc_card_site_icon', data.site_icon_url); } catch (e) {}
      }
      if (data?.custom_qr_url) {
        try { localStorage.setItem('nfc_card_custom_qr_url', data.custom_qr_url); } catch (e) {}
      }
    } catch (err) {
      showToast('Failed to load profile: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [draftKey, showToast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useLayoutEffect(() => {
    if (loading) return;
    if (!formDirty && !customLinksDirty) {
      clearAdminDraft(draftKey);
      return;
    }
    writeAdminDraft(draftKey, {
      version: 1,
      form,
      customLinks,
      formDirty,
      customLinksDirty,
    });
  }, [customLinks, customLinksDirty, draftKey, form, formDirty, loading]);

  const handleChange = (field, value) => {
    setPublicationConfirmed(false);
    setForm((prev) => field === 'phone'
      ? { ...prev, phone: value, phone_link: value }
      : { ...prev, [field]: value });
    setDirty(true);
    setFormDirty(true);
    if (field === 'site_title') {
      applySiteTitle(value, true);
    }
  };

  const handleAddCustomLink = () => {
    setPublicationConfirmed(false);
    setCustomLinks((prev) => [
      ...prev,
      { id: Date.now().toString(), type: 'social', label: '', url: '', icon: 'fa-brands fa-tiktok' },
    ]);
    setDirty(true);
    setCustomLinksDirty(true);
  };

  const handleAddPaymentLink = () => {
    setPublicationConfirmed(false);
    setCustomLinks((prev) => [
      ...prev,
      { id: Date.now().toString(), type: 'payment', label: 'GCash', icon: 'gcash', qr_image_url: '' },
    ]);
    setDirty(true);
    setCustomLinksDirty(true);
  };

  const handleUpdateCustomLink = (index, field, value) => {
    setPublicationConfirmed(false);
    setCustomLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setDirty(true);
    setCustomLinksDirty(true);
  };

  const requestRemoveCustomLink = (index) => {
    const item = customLinks[index];
    if (!item) return;
    setPendingLinkRemoval({
      index,
      label: item.label || (item.type === 'payment' ? 'Payment QR button' : 'Untitled button'),
      type: item.type,
    });
  };

  const handleRemoveCustomLink = () => {
    if (!pendingLinkRemoval) return;
    const { index } = pendingLinkRemoval;
    setPublicationConfirmed(false);
    setCustomLinks((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
    setCustomLinksDirty(true);
    setPendingLinkRemoval(null);
  };

  const handlePaymentQrUpload = async (index, event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    event.target.value = '';
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file for the payment QR code.', 'error');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      showToast('Payment QR images must be 5 MB or smaller.', 'error');
      return;
    }

    setUploadingPaymentIndex(index);
    try {
      const safeName = file.name.replace(/[^\w.-]/g, '_');
      const path = `${siteId}/payments/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
      handleUpdateCustomLink(index, 'qr_image_url', urlData.publicUrl);
      showToast('Payment QR image uploaded.', 'success');
    } catch (err) {
      showToast('Payment QR upload failed: ' + err.message, 'error');
    } finally {
      setUploadingPaymentIndex(null);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = siteId + '/profile/' + Date.now() + '_' + file.name;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
      handleChange('profile_image_url', urlData.publicUrl);
      showToast('Image uploaded successfully', 'success');
    } catch (err) {
      showToast('Image upload failed: ' + err.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleIconUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIcon(true);
    try {
      const path = siteId + '/profile/icon_' + Date.now() + '_' + file.name;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
      handleChange('site_icon_url', urlData.publicUrl);
      showToast('Site icon uploaded successfully', 'success');
    } catch (err) {
      showToast('Icon upload failed: ' + err.message, 'error');
    } finally {
      setUploadingIcon(false);
      if (iconFileRef.current) iconFileRef.current.value = '';
    }
  };

  const handleSave = async (includeCustomLinks = false) => {
    if (includeCustomLinks) {
      const incompleteSocial = customLinks.some(
        (item) => item.type !== 'payment' && item.label?.trim() && !item.url?.trim(),
      );
      if (incompleteSocial) {
        showToast('Add a destination URL to each social button with a label.', 'error');
        return;
      }
      const invalidPhoneButton = customLinks.some((item) => (
        item.type !== 'payment'
        && item.icon === 'fa-solid fa-phone'
        && item.url?.trim()
        && !/^\+?[\d\s().-]+$/.test(item.url.trim().replace(/^tel:/i, ''))
      ));
      if (invalidPhoneButton) {
        showToast('Enter a valid phone number for the phone button.', 'error');
        return;
      }
      const incompletePayment = customLinks.some((item) => {
        if (item.type !== 'payment') return false;
        if (!item.label?.trim() || !item.qr_image_url?.trim()) return true;
        try {
          const url = new URL(item.qr_image_url);
          if (!['http:', 'https:'].includes(url.protocol)) return true;
        } catch {
          return true;
        }
        if (!item.payment_url?.trim()) return false;
        try {
          const url = new URL(item.payment_url);
          return !['http:', 'https:'].includes(url.protocol);
        } catch {
          return true;
        }
      });
      if (incompletePayment) {
        showToast('Each payment QR needs a label and valid image URL. Payment links must use HTTP or HTTPS.', 'error');
        return;
      }
    }
    if (requiresPublicationConfirmation && !publicationConfirmed) {
      showToast('Confirm that you are authorized to submit this information before requesting approval.', 'error');
      return;
    }
    setSaving(true);
    try {
      const updateData = Object.fromEntries(
        Object.entries(form).filter(([key, value]) => (
          !['id', 'site_id', 'created_at', 'updated_at', 'custom_links'].includes(key)
          && JSON.stringify(value) !== JSON.stringify(profile[key])
        )),
      );
      if (includeCustomLinks) {
        updateData.custom_links = customLinks;
        updateData.facebook = '';
        updateData.youtube = '';
      }
      if (Object.keys(updateData).length === 0) {
        showToast('There are no changed fields to request.', 'error');
        return;
      }
      await submitEditRequest({
        requestType: 'profile',
        payload: updateData,
        fields: updateData,
        publicationConfirmed,
      });
      setProfile((current) => ({ ...current, ...updateData }));
      setFormDirty(false);
      if (includeCustomLinks) setCustomLinksDirty(false);
      setDirty(!includeCustomLinks && customLinksDirty);
      setPublicationConfirmed(false);
      showToast('Change request sent. It will not update your live card until approved and published.', 'success');
    } catch (err) {
      showToast('Request failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin-spinner" />;

  if (!profile) {
    return <div className="admin-empty"><div className="admin-empty-icon">⚠️</div>No profile found.</div>;
  }

  const fieldGroups = [
    {
      title: 'Identity',
      fields: [
        { key: 'name', label: 'Name', type: 'text', help: 'Your name as it should appear on your card.' },
        { key: 'business', label: 'Business', type: 'text', help: 'Your company or business name.' },
        { key: 'role', label: 'Role', type: 'text', help: 'Your job title or the service you provide.' },
        { key: 'eyebrow', label: 'Eyebrow text', type: 'text', help: 'A short line shown above your name, such as a specialty or tagline.' },
      ],
    },
    {
      title: 'Contact details',
      fields: [
        { key: 'phone', label: 'Phone', type: 'tel', help: 'The phone number customers can see on your card.' },
        { key: 'email', label: 'Email', type: 'email', help: 'The email address customers can use to contact you.' },
        { key: 'address', label: 'Address', type: 'text', help: 'Your business location or mailing address.' },
        { key: 'address_link', label: 'Map link', type: 'url', help: 'Paste a Google Maps or other map link so customers can find you.' },
      ],
    },
  ];

  const socialCustomLinks = customLinks
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type !== 'payment');
  const paymentCustomLinks = customLinks
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.type === 'payment');

  return (
    <>
      {/* Website Settings */}
      {section === 'website' && (
      <div className="admin-card">
        <h3 className="admin-card-title">🌐 Website Settings</h3>
        <p className="admin-card-subtitle">Configure your browser tab title and site icon (favicon).</p>

        <div className="admin-form-row">
          <div className="admin-form-group">
            <HelpLabel htmlFor="pf-site_title" help="The name shown in the browser tab when customers open your card.">Browser Tab Title</HelpLabel>
            <input
              id="pf-site_title"
              className="admin-input"
              type="text"
              value={form.site_title || ''}
              onChange={(e) => handleChange('site_title', e.target.value)}
              placeholder="e.g. Contact Me, My Business Card"
            />
          </div>
          <div className="admin-form-group">
            <HelpLabel help="The small image shown beside your website name in browser tabs.">Site Icon (Favicon)</HelpLabel>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div className="admin-image-preview" style={{ width: 48, height: 48, borderRadius: 8 }}>
                {form.site_icon_url ? (
                  <img src={form.site_icon_url} alt="Site icon" />
                ) : (
                  <span className="admin-image-preview-placeholder" style={{ fontSize: '0.7rem' }}>No icon</span>
                )}
              </div>
              <div className="admin-file-input">
                <input type="file" accept="image/*" onChange={handleIconUpload} ref={iconFileRef} />
              </div>
            </div>
            {uploadingIcon && <div className="admin-uploading">Uploading icon…</div>}
          </div>
        </div>

        <div className="admin-form-group" style={{ marginTop: 12 }}>
          <HelpLabel htmlFor="pf-custom_qr_url" help="Optional: use a fixed website link for your QR code. Leave empty to use this card’s current web address.">Permanent QR Code Link (Optional)</HelpLabel>
          <input
            id="pf-custom_qr_url"
            className="admin-input"
            type="url"
            value={form.custom_qr_url || ''}
            onChange={(e) => handleChange('custom_qr_url', e.target.value)}
            placeholder="Default: auto-uses your domain (e.g. https://calling-card.web.app)"
          />
          <small style={{ color: 'var(--admin-text-muted)', fontSize: '0.74rem', marginTop: 4, display: 'block' }}>
            Leave blank to automatically generate the QR code using your current domain, or specify a permanent redirect link.
          </small>
        </div>

        {/* Permanent Theme Selection */}
        <div className="admin-form-group" style={{ marginTop: 12 }}>
          <HelpLabel help="Choose the appearance customers see when they first open your card.">Permanent Default Theme Color</HelpLabel>
          <div className="admin-theme-picker">
            {/* Dark */}
            <label className={`admin-theme-option ${(form.theme_mode || 'dark') === 'dark' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="theme_mode"
                value="dark"
                checked={(form.theme_mode || 'dark') === 'dark'}
                onChange={() => handleChange('theme_mode', 'dark')}
              />
              <div className="admin-theme-swatch dark-swatch">
                <span className="admin-color-dot" style={{ background: '#000000', border: '1.5px solid rgba(255, 255, 255, 0.4)' }} />
              </div>
              <div className="admin-theme-option-info">
                <strong>Pitch Black</strong>
              </div>
            </label>

            {/* Beige / Light */}
            <label className={`admin-theme-option ${form.theme_mode === 'light' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="theme_mode"
                value="light"
                checked={form.theme_mode === 'light'}
                onChange={() => handleChange('theme_mode', 'light')}
              />
              <div className="admin-theme-swatch light-swatch">
                <span className="admin-color-dot" style={{ background: '#a87232' }} />
              </div>
              <div className="admin-theme-option-info">
                <strong>Warm Beige</strong>
              </div>
            </label>

            {/* Red */}
            <label className={`admin-theme-option ${form.theme_mode === 'red' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="theme_mode"
                value="red"
                checked={form.theme_mode === 'red'}
                onChange={() => handleChange('theme_mode', 'red')}
              />
              <div className="admin-theme-swatch red-swatch">
                <span className="admin-color-dot" style={{ background: '#e63946' }} />
              </div>
              <div className="admin-theme-option-info">
                <strong>Crimson Red</strong>
              </div>
            </label>

            {/* Blue */}
            <label className={`admin-theme-option ${form.theme_mode === 'blue' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="theme_mode"
                value="blue"
                checked={form.theme_mode === 'blue'}
                onChange={() => handleChange('theme_mode', 'blue')}
              />
              <div className="admin-theme-swatch blue-swatch">
                <span className="admin-color-dot" style={{ background: '#1d70f5' }} />
              </div>
              <div className="admin-theme-option-info">
                <strong>Royal Blue</strong>
              </div>
            </label>

            {/* Pure White */}
            <label className={`admin-theme-option ${form.theme_mode === 'white' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="theme_mode"
                value="white"
                checked={form.theme_mode === 'white'}
                onChange={() => handleChange('theme_mode', 'white')}
              />
              <div className="admin-theme-swatch white-swatch">
                <span className="admin-color-dot" style={{ background: '#ffffff', border: '1.5px solid rgba(0, 0, 0, 0.4)' }} />
              </div>
              <div className="admin-theme-option-info">
                <strong>Pure White</strong>
              </div>
            </label>

            {/* Soft Lavender */}
            <label className={`admin-theme-option ${form.theme_mode === 'lavender' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="theme_mode"
                value="lavender"
                checked={form.theme_mode === 'lavender'}
                onChange={() => handleChange('theme_mode', 'lavender')}
              />
              <div className="admin-theme-swatch lavender-swatch">
                <span className="admin-color-dot" style={{ background: '#8b72cc' }} />
              </div>
              <div className="admin-theme-option-info">
                <strong>Soft Lavender</strong>
              </div>
            </label>

            {/* Emerald */}
            <label className={`admin-theme-option ${form.theme_mode === 'emerald' ? 'selected' : ''}`}>
              <input
                type="radio"
                name="theme_mode"
                value="emerald"
                checked={form.theme_mode === 'emerald'}
                onChange={() => handleChange('theme_mode', 'emerald')}
              />
              <div className="admin-theme-swatch emerald-swatch">
                <span className="admin-color-dot" style={{ background: '#10b981' }} />
              </div>
              <div className="admin-theme-option-info">
                <strong>Emerald Green</strong>
              </div>
            </label>
          </div>

          <div className="admin-save-bar" style={{ marginTop: 18 }}>
            {dirty && <span className="admin-unsaved">● Unsaved changes</span>}
            {requiresPublicationConfirmation && (
              <PublicationConfirmation checked={publicationConfirmed} onChange={setPublicationConfirmed} />
            )}
            <button
              className="admin-btn admin-btn-primary"
              onClick={handleSave}
              disabled={saving || !dirty || (requiresPublicationConfirmation && !publicationConfirmed)}
            >
              {saving ? 'Submitting…' : 'Request approval'}
            </button>
          </div>
        </div>
      </div>
      )}

      {/* Profile Section */}
      {section === 'profile' && (
      <>
      <div className="admin-card">
        <h3 className="admin-card-title">Profile Image</h3>
        <div className="admin-image-preview">
          {form.profile_image_url ? (
            <img src={form.profile_image_url} alt="Profile" />
          ) : (
            <span className="admin-image-preview-placeholder">No image</span>
          )}
        </div>
        <div className="admin-file-input">
          <input type="file" accept="image/*" onChange={handleImageUpload} ref={fileRef} />
        </div>
        {uploading && <div className="admin-uploading">Uploading image…</div>}
      </div>

      {/* Info Section */}
      <div className="admin-card">
        <h3 className="admin-card-title">Profile Information</h3>
        <p className="admin-card-subtitle">Keep your contact details current so customers can reach you quickly.</p>
        {fieldGroups.map((group) => (
          <section className="admin-field-section" key={group.title}>
            <h4 className="admin-field-section-title">{group.title}</h4>
            <div className="admin-form-grid">
              {group.fields.map((field) => (
                <div className="admin-form-group" key={field.key}>
                  <HelpLabel htmlFor={`pf-${field.key}`} help={field.help}>{field.label}</HelpLabel>
                  <input
                    id={`pf-${field.key}`}
                    className="admin-input"
                    type={field.type}
                    value={form[field.key] || ''}
                    onChange={(e) => handleChange(field.key, e.target.value)}
                    placeholder={field.type === 'url' ? 'https://' : ''}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}

        <div className="admin-form-group">
          <HelpLabel htmlFor="pf-description" help="A short introduction to your business, products, or services.">Description</HelpLabel>
          <textarea
            id="pf-description"
            className="admin-textarea"
            value={form.description || ''}
            onChange={(e) => handleChange('description', e.target.value)}
            rows={4}
          />
        </div>

        <div className="admin-save-bar">
          {dirty && <span className="admin-unsaved">● Unsaved changes</span>}
          {requiresPublicationConfirmation && (
            <PublicationConfirmation checked={publicationConfirmed} onChange={setPublicationConfirmed} />
          )}
          <button
            className="admin-btn admin-btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty || (requiresPublicationConfirmation && !publicationConfirmed)}
          >
            {saving ? 'Submitting…' : 'Request approval'}
          </button>
        </div>
      </div>
      </>
      )}

      {/* Custom Social Media & Action Buttons */}
      {section === 'social' && (
      <div className="admin-card">
        <div className="admin-social-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div className="admin-social-card-copy">
            <h3 className="admin-card-title admin-social-card-title" style={{ margin: 0 }}>Social Media & Custom Action Buttons</h3>
            <p className="admin-card-desc admin-social-card-desc" style={{ marginTop: 4, marginBottom: 0 }}>
              Manage Facebook, YouTube, and other social links together. Social links appear in their own card on your public page.
            </p>
          </div>
          <button
            type="button"
            className="admin-btn admin-btn-sm admin-btn-primary"
            onClick={handleAddCustomLink}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <i className="fa-solid fa-plus" aria-hidden="true" />
            <span>Add Button</span>
          </button>
        </div>

        {socialCustomLinks.length === 0 ? (
          <div className="admin-empty-custom-links" style={{ textAlign: 'center', padding: '24px 12px', border: '1px dashed var(--admin-border)', borderRadius: 8, color: 'var(--admin-text-muted)' }}>
            <i className="fa-brands fa-tiktok" style={{ fontSize: '1.8rem', opacity: 0.4, marginBottom: 8, display: 'block' }} />
            <p style={{ margin: 0, fontSize: '0.88rem' }}>No custom media buttons added yet.</p>
            <p style={{ margin: '4px 0 12px', fontSize: '0.78rem' }}>Click "Add Button" above to add TikTok, a 2nd FB page, Telegram, and more.</p>
            <button
              type="button"
              className="admin-btn admin-btn-sm admin-btn-outline"
              onClick={handleAddCustomLink}
            >
              + Add First Media Button
            </button>
          </div>
        ) : (
          <div className="admin-custom-links-list admin-social-links-list">
            {socialCustomLinks.map(({ item, index }, socialIndex) => (
              <div
                key={item.id || index}
                className="admin-custom-link-card admin-social-link-card"
              >
                <div className="admin-social-link-heading">
                  <div className="admin-social-link-name">
                    <div className="admin-social-link-icon">
                      <i className={item.icon || 'fa-solid fa-globe'} aria-hidden="true" />
                    </div>
                    <span>Button #{socialIndex + 1}: {item.label || 'Untitled Link'}</span>
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    onClick={() => requestRemoveCustomLink(index)}
                    title="Remove button"
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" /> Remove
                  </button>
                </div>

                <div className="admin-form-row admin-social-fields-row">
                  <div className="admin-form-group" style={{ marginBottom: 0 }}>
                    <HelpLabel help="Choose the service this button will open, such as Facebook, WhatsApp, or TikTok.">Platform / Icon</HelpLabel>
                    <select
                      className="admin-input"
                      value={item.icon || 'fa-brands fa-tiktok'}
                      onChange={(e) => {
                        const newIcon = e.target.value;
                        handleUpdateCustomLink(index, 'icon', newIcon);
                        if (newIcon.includes('youtube')) {
                          handleUpdateCustomLink(index, 'label', 'YouTube');
                          return;
                        }
                        if (newIcon.includes('facebook-messenger')) {
                          handleUpdateCustomLink(index, 'label', 'Messenger');
                          return;
                        }
                        // Auto-set label if empty or previously default
                        if (!item.label || item.label === 'TikTok' || item.label === 'Facebook' || item.label === 'Instagram') {
                          if (newIcon.includes('tiktok')) handleUpdateCustomLink(index, 'label', 'TikTok');
                          else if (newIcon === 'fa-solid fa-phone') handleUpdateCustomLink(index, 'label', 'Call');
                          else if (newIcon.includes('facebook')) handleUpdateCustomLink(index, 'label', 'FB Page 2');
                          else if (newIcon.includes('instagram')) handleUpdateCustomLink(index, 'label', 'Instagram');
                          else if (newIcon.includes('whatsapp')) handleUpdateCustomLink(index, 'label', 'WhatsApp');
                          else if (newIcon.includes('telegram')) handleUpdateCustomLink(index, 'label', 'Telegram');
                          else if (newIcon.includes('linkedin')) handleUpdateCustomLink(index, 'label', 'LinkedIn');
                          else if (newIcon.includes('shopping') || newIcon.includes('bag')) handleUpdateCustomLink(index, 'label', 'Shop');
                        }
                      }}
                    >
                      <option value="fa-solid fa-phone">☎️ Phone / Call</option>
                      <option value="fa-brands fa-tiktok">🎵 TikTok</option>
                      <option value="fa-brands fa-facebook-f">📘 Facebook Page / Group</option>
                      <option value="fa-brands fa-instagram">📸 Instagram</option>
                      <option value="fa-brands fa-youtube">🔴 YouTube</option>
                      <option value="fa-brands fa-facebook-messenger">💬 Messenger</option>
                      <option value="fa-brands fa-whatsapp">💬 WhatsApp</option>
                      <option value="fa-brands fa-telegram">✈️ Telegram</option>
                      <option value="fa-brands fa-viber">🟣 Viber</option>
                      <option value="fa-brands fa-x-twitter">✖️ X (Twitter)</option>
                      <option value="fa-brands fa-linkedin-in">💼 LinkedIn</option>
                      <option value="fa-solid fa-bag-shopping">🛍️ Shopee / Store</option>
                      <option value="fa-solid fa-cart-shopping">🛒 Lazada / Online Shop</option>
                      <option value="fa-solid fa-globe">🌐 Custom Website</option>
                      <option value="fa-solid fa-link">🔗 Generic Link</option>
                    </select>
                  </div>

                  <div className="admin-form-group" style={{ marginBottom: 0 }}>
                    <HelpLabel help="The short button name customers will see, such as “Instagram” or “Message us.”">Button Label (Text on card)</HelpLabel>
                    <input
                      className="admin-input"
                      type="text"
                      placeholder="e.g. TikTok or Second Page"
                      value={item.label || ''}
                      onChange={(e) => handleUpdateCustomLink(index, 'label', e.target.value)}
                    />
                  </div>
                </div>

                <div className="admin-form-group" style={{ marginBottom: 0 }}>
                  <HelpLabel help="Paste the link to your profile or page. For a Call button, enter the phone number instead.">Destination URL</HelpLabel>
                  <input
                    className="admin-input"
                    type="text"
                    inputMode="url"
                    placeholder={item.icon === 'fa-solid fa-phone' ? 'Phone number, e.g. +1 555 123 4567' : item.icon?.includes('facebook-messenger') ? 'm.me/yourPageName or a Messenger chat link' : 'https://www.tiktok.com/@youraccount or https://facebook.com/...'}
                    value={item.url || ''}
                    onChange={(e) => handleUpdateCustomLink(index, 'url', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="admin-save-bar">
          {dirty && <span className="admin-unsaved">● Unsaved changes</span>}
          {requiresPublicationConfirmation && (
            <PublicationConfirmation checked={publicationConfirmed} onChange={setPublicationConfirmed} />
          )}
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => handleSave(true)}
            disabled={saving || !dirty || (requiresPublicationConfirmation && !publicationConfirmed)}
          >
            {saving ? 'Submitting…' : 'Request approval'}
          </button>
        </div>
      </div>
      )}

      {/* Payment QR Buttons */}
      {section === 'payments' && (
      <div className="admin-card admin-payment-card">
        <div className="admin-card-title">
          Payment QR Buttons
        </div>
        <p className="admin-card-subtitle">Add payment QR codes customers can scan from your card.</p>
        <div className="admin-payment-links">
          <div className="admin-payment-heading">
            <div>
              <h4>Payment methods</h4>
              <p>Upload a QR image or paste a public image URL. Tapping the payment button opens it for customers to scan.</p>
            </div>
            <button type="button" className="admin-btn admin-btn-sm admin-btn-primary" onClick={handleAddPaymentLink}>
              <i className="fa-solid fa-plus" aria-hidden="true" /> Add Payment QR
            </button>
          </div>

          {paymentCustomLinks.map(({ item, index }) => (
            <div className="admin-payment-link-card" key={item.id || index}>
              <div className="admin-payment-link-top">
                <div className="admin-payment-preview">
                  {item.qr_image_url
                    ? <img src={item.qr_image_url} alt={`${item.label || 'Payment'} QR preview`} />
                    : <i className="fa-solid fa-qrcode" aria-hidden="true" />}
                </div>
                <div className="admin-payment-fields">
                  <div className="admin-form-row">
                    <div className="admin-form-group">
                      <HelpLabel help="Choose the payment service for this QR code, such as GCash, Maya, or PayPal.">Payment Platform / Icon</HelpLabel>
                      <select
                        className="admin-input"
                        value={item.icon || 'gcash'}
                        onChange={(event) => {
                          const platform = event.target.value;
                          handleUpdateCustomLink(index, 'icon', platform);
                          if (!item.label || ['GCash', 'Maya', 'PayPal', 'Bank QR'].includes(item.label)) {
                            const labels = { gcash: 'GCash', maya: 'Maya', paypal: 'PayPal', bank: 'Bank QR' };
                            handleUpdateCustomLink(index, 'label', labels[platform]);
                          }
                        }}
                      >
                        <option value="gcash">GCash</option>
                        <option value="maya">Maya</option>
                        <option value="paypal">PayPal</option>
                        <option value="bank">Bank QR / Transfer</option>
                      </select>
                    </div>
                    <div className="admin-form-group">
                      <HelpLabel help="The payment button name customers will see on your card.">Button Label</HelpLabel>
                      <input
                        className="admin-input"
                        type="text"
                        maxLength={32}
                        value={item.label || ''}
                        onChange={(event) => handleUpdateCustomLink(index, 'label', event.target.value)}
                        placeholder="e.g. Pay via GCash"
                      />
                    </div>
                  </div>
                  <div className="admin-payment-upload-row">
                    <label className="admin-btn admin-btn-sm admin-btn-outline">
                      <i className="fa-solid fa-upload" aria-hidden="true" />
                      {uploadingPaymentIndex === index ? 'Uploading…' : item.qr_image_url ? 'Replace QR Image' : 'Upload QR Image'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={uploadingPaymentIndex !== null}
                        onChange={(event) => handlePaymentQrUpload(index, event)}
                      />
                    </label>
                    <span>PNG, JPG, or WebP · 5 MB max</span>
                  </div>
                  <div className="admin-payment-url-field">
                    <HelpLabel htmlFor={`payment-destination-${item.id || index}`} help="Optional: paste your payment or checkout link to let customers continue after viewing the QR code.">
                      Optional payment destination link
                    </HelpLabel>
                    <input
                      id={`payment-destination-${item.id || index}`}
                      className="admin-input"
                      type="url"
                      inputMode="url"
                      value={item.payment_url || ''}
                      onChange={(event) => handleUpdateCustomLink(index, 'payment_url', event.target.value)}
                      placeholder="https://payment-provider.com/checkout/..."
                    />
                    <small>When provided, customers will also see a “Proceed to payment” button below the QR code.</small>
                  </div>
                </div>
                <button
                  type="button"
                  className="admin-btn admin-btn-sm admin-btn-danger"
                  onClick={() => requestRemoveCustomLink(index)}
                  aria-label={`Remove ${item.label || 'payment'} QR button`}
                >
                  <i className="fa-solid fa-trash" aria-hidden="true" /> Remove
                </button>
              </div>
            </div>
          ))}
          {paymentCustomLinks.length === 0 && (
            <div className="admin-empty">
              <div className="admin-empty-icon"><i className="fa-solid fa-qrcode" aria-hidden="true" /></div>
              No payment QR buttons yet.
            </div>
          )}
        </div>

        <div className="admin-save-bar" style={{ marginTop: 20 }}>
          {dirty && <span className="admin-unsaved">● Unsaved changes</span>}
          {requiresPublicationConfirmation && (
            <PublicationConfirmation checked={publicationConfirmed} onChange={setPublicationConfirmed} />
          )}
          <button
            className="admin-btn admin-btn-primary"
            onClick={() => handleSave(true)}
            disabled={saving || !dirty || (requiresPublicationConfirmation && !publicationConfirmed)}
          >
            {saving ? 'Submitting…' : 'Request approval'}
          </button>
        </div>
      </div>
      )}

      {pendingLinkRemoval && (
        <div className="admin-confirm-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPendingLinkRemoval(null);
        }}>
          <section
            className="admin-confirm-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="admin-remove-title"
            aria-describedby="admin-remove-description"
          >
            <div className="admin-confirm-icon" aria-hidden="true">
              <i className="fa-solid fa-trash" />
            </div>
            <h2 id="admin-remove-title">Remove this {pendingLinkRemoval.type === 'payment' ? 'payment QR' : 'button'}?</h2>
            <p id="admin-remove-description">
              <strong>{pendingLinkRemoval.label}</strong> will be included in an approval request when you submit the changes.
            </p>
            <div className="admin-confirm-actions">
              <button
                className="admin-btn admin-btn-outline"
                type="button"
                onClick={() => setPendingLinkRemoval(null)}
              >
                Cancel
              </button>
              <button
                className="admin-btn admin-btn-danger"
                type="button"
                onClick={handleRemoveCustomLink}
                autoFocus
              >
                <i className="fa-solid fa-trash" aria-hidden="true" /> Remove
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

/* ============================================================
   Products Tab — Two Sections
   ============================================================ */
function ProductsTab({ showToast, submitEditRequest, draftKey, requiresPublicationConfirmation = false }) {
  const [products, setProducts] = useState([]);
  const [productsDirty, setProductsDirty] = useState(false);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState({ name: '', description: '', price: '', is_featured: false, image_url: '', gallery: [] });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingGallery, setUploadingGallery] = useState(false);
  const fileRef = useRef(null);
  const galleryRef = useRef(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from(productsTable).select('*').eq('site_id', siteId).order('sort_order');
      if (error) throw error;
      const list = data || [];
      const draft = readAdminDraft(draftKey);
      const hasDraft = draft?.version === 1
        && Array.isArray(draft.products)
        && (draft.productsDirty || draft.formOpen);
      setProducts(hasDraft ? draft.products : list);
      setProductsDirty(Boolean(hasDraft && draft.productsDirty));
      setFormOpen(Boolean(hasDraft && draft.formOpen));
      setEditingProduct(hasDraft ? draft.editingProduct || null : null);
      setProductForm(hasDraft && draft.productForm && typeof draft.productForm === 'object'
        ? { name: '', description: '', price: '', is_featured: false, image_url: '', gallery: [], ...draft.productForm }
        : { name: '', description: '', price: '', is_featured: false, image_url: '', gallery: [] });
      try {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list));
      } catch (e) {}
    } catch (err) {
      showToast('Failed to load products: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [draftKey, showToast]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  useLayoutEffect(() => {
    if (loading) return;
    if (!productsDirty && !formOpen) {
      clearAdminDraft(draftKey);
      return;
    }
    writeAdminDraft(draftKey, {
      version: 1,
      products,
      productsDirty,
      formOpen,
      editingProduct,
      productForm,
    });
  }, [draftKey, editingProduct, formOpen, loading, productForm, products, productsDirty]);

  const openAdd = () => {
    setEditingProduct(null);
    setProductForm({ name: '', description: '', price: '', is_featured: false, image_url: '', gallery: [] });
    setFormOpen(true);
  };

  const openEdit = (product) => {
    setEditingProduct(product);
    setProductForm({
      name: product.name || '',
      description: product.description || '',
      price: product.price || '',
      is_featured: product.is_featured || false,
      image_url: product.image_url || '',
      gallery: product.gallery || [],
    });
    setFormOpen(true);
  };

  const closeForm = () => { setFormOpen(false); setEditingProduct(null); };

  const handleFormChange = (field, value) => {
    setPublicationConfirmed(false);
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProductImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = siteId + '/products/' + Date.now() + '_' + file.name;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
      handleFormChange('image_url', urlData.publicUrl);
      showToast('Image uploaded', 'success');
    } catch (err) {
      showToast('Image upload failed: ' + err.message, 'error');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const handleGalleryUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploadingGallery(true);
    try {
      const urls = [];
      for (const file of files) {
        const path = siteId + '/products/gallery/' + Date.now() + '_' + file.name;
        const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
        if (uploadError) throw uploadError;
        const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
        urls.push(urlData.publicUrl);
      }
      handleFormChange('gallery', [...(productForm.gallery || []), ...urls]);
      showToast(urls.length + ' image(s) added to gallery', 'success');
    } catch (err) {
      showToast('Gallery upload failed: ' + err.message, 'error');
    } finally {
      setUploadingGallery(false);
      if (galleryRef.current) galleryRef.current.value = '';
    }
  };

  const removeGalleryImage = (index) => {
    setPublicationConfirmed(false);
    setProductForm((prev) => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  };

  const handleSave = () => {
    if (!productForm.name.trim()) { showToast('Product name is required', 'error'); return; }
    const nextProduct = {
      ...(editingProduct || {}),
      name: productForm.name,
      description: productForm.description,
      price: productForm.price,
      is_featured: productForm.is_featured,
      image_url: productForm.image_url,
      gallery: productForm.gallery || [],
    };
    const nextProducts = editingProduct
      ? products.map((product) => product.id === editingProduct.id ? nextProduct : product)
      : [...products, { ...nextProduct, id: crypto.randomUUID(), sort_order: products.length }];
    setProducts(nextProducts);
    setProductsDirty(true);
    setPublicationConfirmed(false);
    showToast('Product changes staged. Submit them for administrator approval when ready.', 'success');
    closeForm();
  };

  const handleDelete = (product) => {
    if (!window.confirm('Delete "' + product.name + '"? This cannot be undone.')) return;
    setProducts(products.filter((item) => item.id !== product.id));
    setProductsDirty(true);
    setPublicationConfirmed(false);
    showToast('Product removal staged. Submit the changes for administrator approval.', 'success');
  };

  const toggleFeatured = (product) => {
    setProducts(products.map((item) => item.id === product.id
      ? { ...item, is_featured: !item.is_featured }
      : item));
    setProductsDirty(true);
    setPublicationConfirmed(false);
  };

  const handleRequestApproval = async () => {
    if (requiresPublicationConfirmation && !publicationConfirmed) {
      showToast('Confirm that you are authorized to submit this information before requesting approval.', 'error');
      return;
    }
    setSaving(true);
    try {
      await submitEditRequest({
        requestType: 'products',
        payload: products,
        fields: { products: products.length },
        publicationConfirmed,
      });
      setProductsDirty(false);
      setPublicationConfirmed(false);
      clearAdminDraft(draftKey);
      showToast('Product change request sent. Live products remain unchanged until approved and published.', 'success');
    } catch (err) {
      showToast('Request failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin-spinner" />;

  const featuredProducts = products.filter((p) => p.is_featured);

  return (
    <>
      <div className="admin-save-bar">
        {productsDirty && <span className="admin-unsaved">● Product changes not submitted</span>}
        {requiresPublicationConfirmation && (
          <PublicationConfirmation checked={publicationConfirmed} onChange={setPublicationConfirmed} />
        )}
        <button className="admin-btn admin-btn-primary" type="button" onClick={handleRequestApproval} disabled={saving || !productsDirty || (requiresPublicationConfirmation && !publicationConfirmed)}>
          {saving ? 'Submitting…' : 'Request approval for product changes'}
        </button>
      </div>
      {/* ── Section 1: Featured Products ── */}
      <div className="admin-card">
        <h3 className="admin-card-title">⭐ Featured Products — Main Card</h3>
        <p className="admin-card-subtitle">These show on your main business card. Toggle ★ on products below to add/remove.</p>
        {featuredProducts.length === 0 ? (
          <div className="admin-empty"><div className="admin-empty-icon">⭐</div>No featured products yet.</div>
        ) : (
          <div className="admin-featured-grid">
            {featuredProducts.map((p) => (
              <div className="admin-featured-item" key={p.id}>
                <div className="admin-featured-thumb">
                  {p.image_url ? <img src={p.image_url} alt={p.name} /> : <span>🖼</span>}
                </div>
                <span className="admin-featured-name">{p.name}</span>
                <div className="admin-featured-actions">
                  <button className="admin-btn admin-btn-sm admin-btn-outline" onClick={() => openEdit(p)} title="Edit product">Edit</button>
                  <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => toggleFeatured(p)} title="Remove from featured">✕</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Section 2: All Shop Products ── */}
      <div className="admin-card">
        <div className="admin-section-header">
          <h3 className="admin-card-title" style={{ margin: 0, padding: 0, border: 'none' }}>🛒 Shop Products — Visit Shop Page</h3>
          <button className="admin-btn admin-btn-primary admin-btn-sm" onClick={openAdd}>+ Add Product</button>
        </div>
        <p className="admin-card-subtitle">Full product details with descriptions, prices, and gallery images for your shop.</p>

        {/* Inline Form */}
        {formOpen && (
          <div className="admin-product-form">
            <h4 className="admin-product-form-title">{editingProduct ? 'Edit Product' : 'New Product'}</h4>

            <div className="admin-form-group">
              <HelpLabel help="The name of the product or service customers will see.">Name</HelpLabel>
              <input className="admin-input" type="text" value={productForm.name} onChange={(e) => handleFormChange('name', e.target.value)} placeholder="Product name" />
            </div>

            <div className="admin-form-group">
              <HelpLabel help="Enter the price or a starting price. You can also write “Free” or “Contact for pricing.”">Price</HelpLabel>
              <input className="admin-input" type="text" value={productForm.price} onChange={(e) => handleFormChange('price', e.target.value)} placeholder="e.g. ₱500, Starting at ₱1,000, Free" />
            </div>

            <div className="admin-form-group">
              <HelpLabel help="Explain what the product or service includes. This appears in your shop.">Description</HelpLabel>
              <textarea className="admin-textarea" value={productForm.description} onChange={(e) => handleFormChange('description', e.target.value)} placeholder="Describe this product or service in detail..." rows={4} />
            </div>

            <div className="admin-form-group">
              <label className="admin-checkbox-group">
                <input type="checkbox" checked={productForm.is_featured} onChange={(e) => handleFormChange('is_featured', e.target.checked)} />
                <span>Featured Product (show on main card)</span>
              </label>
            </div>

            <div className="admin-form-group">
              <HelpLabel help="Choose the main photo customers will see for this product.">Main Image</HelpLabel>
              {productForm.image_url && <div className="admin-image-preview"><img src={productForm.image_url} alt="Product" /></div>}
              <div className="admin-file-input"><input type="file" accept="image/*" onChange={handleProductImage} ref={fileRef} /></div>
              {uploading && <div className="admin-uploading">Uploading…</div>}
            </div>

            <div className="admin-form-group">
              <HelpLabel help="Add extra photos customers can browse for this product.">Gallery Images (multiple)</HelpLabel>
              {productForm.gallery && productForm.gallery.length > 0 && (
                <div className="admin-gallery-grid">
                  {productForm.gallery.map((url, i) => (
                    <div className="admin-gallery-item" key={i}>
                      <img src={url} alt={'Gallery ' + (i + 1)} />
                      <button className="admin-gallery-remove" type="button" onClick={() => removeGalleryImage(i)} title="Remove">✕</button>
                    </div>
                  ))}
                </div>
              )}
              <div className="admin-file-input"><input type="file" accept="image/*" multiple onChange={handleGalleryUpload} ref={galleryRef} /></div>
              {uploadingGallery && <div className="admin-uploading">Uploading gallery…</div>}
            </div>

            <div className="admin-product-form-actions">
              <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving || uploading || uploadingGallery}>
                Stage product changes
              </button>
              <button className="admin-btn admin-btn-outline" onClick={closeForm} disabled={saving}>Cancel</button>
            </div>
          </div>
        )}

        {/* Product List */}
        {products.length === 0 ? (
          <div className="admin-empty"><div className="admin-empty-icon">📦</div>No products yet.</div>
        ) : (
          <div className="admin-product-list">
            {products.map((product) => (
              <div className="admin-product-item" key={product.id}>
                <div className="admin-product-thumb">
                  {product.image_url ? <img src={product.image_url} alt={product.name} /> : <span className="admin-product-thumb-placeholder">🖼</span>}
                </div>
                <div className="admin-product-info">
                  <h4>{product.name}</h4>
                  <p>
                    {product.price && <span className="admin-price-badge">{product.price}</span>}
                    {product.is_featured && <span className="admin-featured-badge">★ Featured</span>}
                    {product.gallery && product.gallery.length > 0 && <span className="admin-gallery-badge">📷 {product.gallery.length}</span>}
                  </p>
                </div>
                <div className="admin-product-actions">
                  <button className={'admin-btn admin-btn-sm ' + (product.is_featured ? 'admin-btn-success' : 'admin-btn-outline')} onClick={() => toggleFeatured(product)} title={product.is_featured ? 'Remove featured' : 'Make featured'}>★</button>
                  <button className="admin-btn admin-btn-sm admin-btn-outline" onClick={() => openEdit(product)}>Edit</button>
                  <button className="admin-btn admin-btn-sm admin-btn-danger" onClick={() => handleDelete(product)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ============================================================
   Admin Dashboard (Main Component)
   ============================================================ */
function Admin() {
  const [session, setSession] = useState(undefined);
  const [siteAccess, setSiteAccess] = useState(null);
  const [accessError, setAccessError] = useState(false);
  const [legalStatus, setLegalStatus] = useState(requiresLegalOnboarding ? 'loading' : 'not-required');
  const [legalError, setLegalError] = useState('');
  const [legalCheckAttempt, setLegalCheckAttempt] = useState(0);
  const [legalSaving, setLegalSaving] = useState(false);
  const [activeSection, setActiveSection] = useState(() => {
    try {
      const savedSection = localStorage.getItem(ADMIN_SECTION_KEY);
      return ['website', 'profile', 'social', 'payments', 'products'].includes(savedSection)
        ? savedSection
        : 'website';
    } catch (error) {
      console.error('Unable to restore client admin section:', error);
      return 'website';
    }
  });
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [adminTheme, setAdminTheme] = useState(() => {
    try {
      return localStorage.getItem('nfc_admin_theme') === 'dark' ? 'dark' : 'light';
    } catch (error) {
      return 'light';
    }
  });
  const [toast, setToast] = useState(null);
  const [businessName, setBusinessName] = useState('');

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_SECTION_KEY, activeSection);
    } catch (error) {
      console.error('Unable to save client admin section:', error);
    }
  }, [activeSection]);

  const submitEditRequest = useCallback(async ({ requestType, payload, fields, notes = '', publicationConfirmed = false }) => {
    if (!session?.user) throw new Error('Sign in again before requesting changes.');
    if (requiresLegalOnboarding) {
      if (legalStatus !== 'accepted') throw new Error('Review and accept the current client terms before submitting changes.');
      if (!publicationConfirmed) throw new Error('Confirm you are authorized to submit information for public display.');
      const { error } = await supabase.rpc('submit_client_edit_request_with_confirmation', {
        target_site_id: siteId,
        target_request_type: requestType,
        target_client_email: session.user.email || '',
        target_payload: payload,
        target_fields: fields,
        target_notes: notes,
        target_publication_confirmed: publicationConfirmed,
      });
      if (error) throw error;
      return;
    }
    const { error } = await supabase.from('site_edit_requests').insert({
      site_id: siteId,
      user_id: session.user.id,
      client_email: session.user.email || '',
      request_type: requestType,
      payload,
      fields,
      notes,
    });
    if (error) throw error;
  }, [legalStatus, session]);

  useEffect(() => {
    try {
      localStorage.setItem('nfc_admin_theme', adminTheme);
    } catch (error) {
      console.error('Unable to save admin appearance preference:', error);
    }
  }, [adminTheme]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setMobileNavOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  // Load cached title & favicon immediately on mount
  useEffect(() => {
    try {
      const cachedTitle = localStorage.getItem('nfc_card_site_title');
      if (cachedTitle) applySiteTitle(cachedTitle, true);
      const cachedIcon = localStorage.getItem('nfc_card_site_icon');
      if (cachedIcon) applyFavicon(cachedIcon);
    } catch (e) {}
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }) => { setSession(s); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => { setSession(s); });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let active = true;
    setSiteAccess(null);
    setAccessError(false);
    if (!session) return () => { active = false; };

    supabase.rpc('can_manage_site', { target_site_id: siteId })
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) setSiteAccess(data === true);
      })
      .catch((error) => {
        console.error('Unable to verify client site access:', error);
        if (active) {
          setSiteAccess(false);
          setAccessError(true);
        }
      });

    return () => { active = false; };
  }, [session]);

  useEffect(() => {
    if (!requiresLegalOnboarding || !session || siteAccess !== true) {
      if (!requiresLegalOnboarding) setLegalStatus('not-required');
      return undefined;
    }

    let active = true;
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
      .then(({ data, error }) => {
        if (error) throw error;
        if (active) setLegalStatus(data ? 'accepted' : 'required');
      })
      .catch((error) => {
        console.error('Unable to verify client legal acknowledgement:', error);
        if (active) {
          setLegalError(error.message || 'The acknowledgement could not be verified.');
          setLegalStatus('error');
        }
      });

    return () => { active = false; };
  }, [session?.user?.id, siteAccess, legalCheckAttempt]);

  const acceptLegalDocuments = async () => {
    if (!session?.user) return;
    setLegalSaving(true);
    setLegalError('');
    try {
      const { error } = await supabase.rpc('record_client_legal_acknowledgement', {
        target_site_id: siteId,
        target_terms_version: CLIENT_TERMS_VERSION,
        target_privacy_notice_version: CLIENT_PRIVACY_VERSION,
      });
      if (error) throw error;
      setLegalStatus('accepted');
    } catch (error) {
      console.error('Unable to save client legal acknowledgement:', error);
      setLegalError(error.message || 'Unable to save your acknowledgement. Please try again.');
      setLegalStatus('required');
    } finally {
      setLegalSaving(false);
    }
  };

  useEffect(() => {
    if (session && (!requiresLegalOnboarding || legalStatus === 'accepted')) {
      supabase.from(profilesTable).select('business, site_title, site_icon_url').eq('site_id', siteId).single().then(({ data }) => {
        if (data?.business) setBusinessName(data.business);
        if (data?.site_title) {
          applySiteTitle(data.site_title, true);
          try { localStorage.setItem('nfc_card_site_title', data.site_title); } catch (e) {}
        }
        if (data?.site_icon_url) {
          applyFavicon(data.site_icon_url);
          try { localStorage.setItem('nfc_card_site_icon', data.site_icon_url); } catch (e) {}
        }
      });
    }
  }, [session, legalStatus]);

  if (session === undefined) return <div className="admin-login"><div className="admin-spinner" /></div>;
  if (!session) return <><LoginForm />{toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}</>;
  if (session.user.app_metadata?.force_password_change) {
    return <RequiredPasswordChange session={session} onComplete={() => showToast('Password updated. Please continue to your site dashboard.', 'success')} />;
  }
  if (siteAccess === null) return <div className="admin-login"><div className="admin-spinner" /></div>;
  if (!siteAccess) {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1 className="admin-login-title">{accessError ? 'Access check unavailable' : 'Site access not assigned'}</h1>
          <p className="admin-login-subtitle">
            {accessError
              ? 'We could not verify this account. The site owner must complete the secure access setup before you can manage this card.'
              : 'This account is not authorized to manage this site. Please contact the site administrator.'}
          </p>
          <button className="admin-btn admin-btn-outline" type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  if (requiresLegalOnboarding && legalStatus === 'loading') {
    return <div className="admin-login"><div className="admin-spinner" /></div>;
  }
  if (requiresLegalOnboarding && legalStatus === 'error') {
    return (
      <div className="admin-login">
        <div className="admin-login-card">
          <h1 className="admin-login-title">Acknowledgement check unavailable</h1>
          <p className="admin-login-subtitle">
            The site cannot open the client editor until the privacy and terms acknowledgement table is installed and available.
          </p>
          {legalError && <div className="admin-login-error" role="alert">{legalError}</div>}
          <p className="admin-login-subtitle">Ask the site administrator to run <code>supabase/client-legal-acceptance.sql</code>, then retry.</p>
          <button className="admin-btn admin-btn-primary" type="button" onClick={() => setLegalCheckAttempt((attempt) => attempt + 1)}>
            Retry acknowledgement check
          </button>
          <button className="admin-btn admin-btn-outline" type="button" onClick={() => supabase.auth.signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }
  if (requiresLegalOnboarding && legalStatus === 'required') {
    return (
      <ClientLegalAcceptance
        onAccept={acceptLegalDocuments}
        onSignOut={() => supabase.auth.signOut()}
        saving={legalSaving}
        error={legalError}
      />
    );
  }

  const sectionLabels = {
    website: 'Website settings',
    profile: 'Profile',
    social: 'Social & buttons',
    payments: 'Payment QR buttons',
    products: 'Products',
  };

  return (
    <div className="admin-page" data-admin-theme={adminTheme}>
      <header className="admin-header">
        <div className="admin-header-left">
          <button
            className="admin-mobile-nav-toggle"
            type="button"
            aria-label={mobileNavOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileNavOpen}
            aria-controls="admin-sidebar-navigation"
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <span className="admin-hamburger" aria-hidden="true"><span /><span /><span /></span>
          </button>
          <span className="admin-header-title">Card manager{businessName && <span className="admin-header-business"> · {businessName}</span>}</span>
        </div>
        <div className="admin-header-right">
          {requiresLegalOnboarding && <LegalDocumentLinks className="admin-header-legal-links" />}
          <button
            className="admin-btn admin-btn-sm admin-btn-outline admin-theme-toggle"
            type="button"
            onClick={() => setAdminTheme((theme) => theme === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${adminTheme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${adminTheme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <i className={`fa-solid ${adminTheme === 'dark' ? 'fa-sun' : 'fa-moon'}`} aria-hidden="true" />
            <span>{adminTheme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
          </button>
          <button className="admin-btn admin-btn-sm admin-btn-outline" onClick={() => supabase.auth.signOut()}>Logout</button>
        </div>
      </header>

      <div className="admin-workspace">
        {mobileNavOpen && (
          <button
            className="admin-sidebar-backdrop"
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileNavOpen(false)}
          />
        )}
        <aside className={`admin-sidebar ${mobileNavOpen ? 'is-open' : ''}`} aria-label="Admin sections">
          <p className="admin-sidebar-heading">WORKSPACE</p>
          <nav id="admin-sidebar-navigation" className="admin-sidebar-nav">
            <button className={`admin-sidebar-link ${activeSection === 'website' ? 'active' : ''}`} aria-current={activeSection === 'website' ? 'page' : undefined} onClick={() => { setActiveSection('website'); setMobileNavOpen(false); }}>
              <i className="fa-solid fa-globe" aria-hidden="true" /><span>Website settings</span>
            </button>
            <button className={`admin-sidebar-link ${activeSection === 'profile' ? 'active' : ''}`} aria-current={activeSection === 'profile' ? 'page' : undefined} onClick={() => { setActiveSection('profile'); setMobileNavOpen(false); }}>
              <i className="fa-solid fa-id-card" aria-hidden="true" /><span>Profile</span>
            </button>
            <button className={`admin-sidebar-link ${activeSection === 'social' ? 'active' : ''}`} aria-current={activeSection === 'social' ? 'page' : undefined} onClick={() => { setActiveSection('social'); setMobileNavOpen(false); }}>
              <i className="fa-solid fa-share-nodes" aria-hidden="true" /><span>Social &amp; buttons</span>
            </button>
            <button className={`admin-sidebar-link ${activeSection === 'payments' ? 'active' : ''}`} aria-current={activeSection === 'payments' ? 'page' : undefined} onClick={() => { setActiveSection('payments'); setMobileNavOpen(false); }}>
              <i className="fa-solid fa-qrcode" aria-hidden="true" /><span>Payment QR buttons</span>
            </button>
            <span className="admin-sidebar-divider" />
            <button className={`admin-sidebar-link ${activeSection === 'products' ? 'active' : ''}`} aria-current={activeSection === 'products' ? 'page' : undefined} onClick={() => { setActiveSection('products'); setMobileNavOpen(false); }}>
              <i className="fa-solid fa-box-open" aria-hidden="true" /><span>Products</span>
            </button>
          </nav>
          <div className="admin-sidebar-footer">
            <span className="admin-status"><span aria-hidden="true" /> Admin workspace</span>
          </div>
        </aside>

      <main className="admin-content">
        <div className="admin-page-intro">
          <div>
            <p className="admin-eyebrow">BUSINESS CARD</p>
            <h1>{sectionLabels[activeSection]}</h1>
            <p>{({
              website: 'Set your card appearance, browser title, icon, and QR destination.',
              profile: 'Manage your business identity and customer contact information.',
              social: 'Choose which social and action buttons appear on your card.',
              payments: 'Manage the QR codes and payment links customers can use.',
              products: 'Organize featured items and products shown in your shop.',
            })[activeSection]}</p>
          </div>
        </div>
        <p className="admin-approval-notice">
          Changes submitted here are requests only. A super administrator must approve them into a private draft and separately publish that draft before the live card changes.
        </p>
        <div hidden={activeSection === 'products'}>
          <ProfileTab showToast={showToast} section={activeSection} submitEditRequest={submitEditRequest} draftKey={getAdminDraftKey(session.user.id, 'profile')} requiresPublicationConfirmation={requiresLegalOnboarding} />
        </div>
        {activeSection === 'products' && <ProductsTab showToast={showToast} submitEditRequest={submitEditRequest} draftKey={getAdminDraftKey(session.user.id, 'products')} requiresPublicationConfirmation={requiresLegalOnboarding} />}
      </main>
      </div>

      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default Admin;
