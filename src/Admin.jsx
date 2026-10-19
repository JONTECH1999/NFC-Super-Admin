import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, supabaseUrl } from './lib/supabase';
import { applyFavicon, applySiteTitle } from './lib/siteSettings';
import './admin.css';

const CACHE_SCOPE = (() => {
  try {
    if (supabaseUrl) {
      const match = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match && match[1]) return match[1];
    }
  } catch (e) {}
  return "default";
})();

const PROFILE_CACHE_KEY = `nfc_card_profile_cache_${CACHE_SCOPE}`;
const PRODUCTS_CACHE_KEY = `nfc_card_products_cache_${CACHE_SCOPE}`;

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

/* ============================================================
   Login Form
   ============================================================ */
function LoginForm({ onLogin }) {
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
    <div className="admin-login">
      <form className="admin-login-card" onSubmit={handleSubmit}>
        <h1 className="admin-login-title">Admin Login</h1>
        <p className="admin-login-subtitle">Sign in to manage your business card</p>

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
          <input
            id="login-password"
            className="admin-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
            autoComplete="current-password"
          />
        </div>

        <button
          type="submit"
          className="admin-btn admin-btn-primary"
          style={{ width: '100%', marginTop: 8 }}
          disabled={loading}
        >
          {loading ? 'Signing in…' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

/* ============================================================
   Profile Tab
   ============================================================ */
function ProfileTab({ showToast }) {
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [customLinks, setCustomLinks] = useState([]);
  const fileRef = useRef(null);
  const iconFileRef = useRef(null);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('profiles').select('*').limit(1).single();
      if (error) throw error;
      setProfile(data);
      setForm(data);
      setDirty(false);

      // Load custom social/action links from DB or localStorage
      try {
        let links = [];
        if (data?.custom_links) {
          links = typeof data.custom_links === 'string' ? JSON.parse(data.custom_links) : data.custom_links;
        } else {
          const cached = localStorage.getItem('nfc_card_custom_links');
          if (cached) links = JSON.parse(cached);
        }
        setCustomLinks(Array.isArray(links) ? links : []);
      } catch (e) {
        setCustomLinks([]);
      }

      if (data?.site_title) {
        applySiteTitle(data.site_title, true);
        try { localStorage.setItem('nfc_card_site_title', data.site_title); } catch (e) {}
      }
      if (data?.site_icon_url) {
        applyFavicon(data.site_icon_url);
        try { localStorage.setItem('nfc_card_site_icon', data.site_icon_url); } catch (e) {}
      }
      if (data?.custom_qr_url) {
        try { localStorage.setItem('nfc_card_custom_qr_url', data.custom_qr_url); } catch (e) {}
      } else {
        const cachedQr = localStorage.getItem('nfc_card_custom_qr_url');
        if (cachedQr) {
          setForm((prev) => ({ ...prev, custom_qr_url: cachedQr }));
        }
      }
    } catch (err) {
      showToast('Failed to load profile: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setDirty(true);
    if (field === 'site_title') {
      applySiteTitle(value, true);
    }
  };

  const handleAddCustomLink = () => {
    setCustomLinks((prev) => [
      ...prev,
      { id: Date.now().toString(), label: '', url: '', icon: 'fa-brands fa-tiktok' },
    ]);
    setDirty(true);
  };

  const handleUpdateCustomLink = (index, field, value) => {
    setCustomLinks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
    setDirty(true);
  };

  const handleRemoveCustomLink = (index) => {
    setCustomLinks((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = 'profile/' + Date.now() + '_' + file.name;
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
      const path = 'profile/icon_' + Date.now() + '_' + file.name;
      const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from('images').getPublicUrl(path);
      handleChange('site_icon_url', urlData.publicUrl);
      applyFavicon(urlData.publicUrl);
      try { localStorage.setItem('nfc_card_site_icon', urlData.publicUrl); } catch (e) {}
      showToast('Site icon uploaded successfully', 'success');
    } catch (err) {
      showToast('Icon upload failed: ' + err.message, 'error');
    } finally {
      setUploadingIcon(false);
      if (iconFileRef.current) iconFileRef.current.value = '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { id, created_at, updated_at, ...updateData } = form;
      updateData.custom_links = customLinks;

      let { error } = await supabase.from('profiles').update(updateData).eq('id', profile.id);

      // If custom_links, address_link, or custom_qr_url column does not exist yet in DB schema cache, retry without them
      if (error && error.message) {
        let retryData = { ...updateData };
        let shouldRetry = false;
        if (error.message.includes('custom_links')) {
          delete retryData.custom_links;
          shouldRetry = true;
        }
        if (error.message.includes('address_link')) {
          delete retryData.address_link;
          shouldRetry = true;
        }
        if (error.message.includes('custom_qr_url')) {
          delete retryData.custom_qr_url;
          shouldRetry = true;
        }
        if (error.message.includes('showcase_caption')) {
          delete retryData.showcase_caption;
          shouldRetry = true;
        }
        if (shouldRetry) {
          const retryResult = await supabase.from('profiles').update(retryData).eq('id', profile.id);
          error = retryResult.error;
        }
      }

      if (error) throw error;
      setProfile({ ...form, custom_links: customLinks });
      setDirty(false);
      try {
        localStorage.setItem(`nfc_card_custom_links_${CACHE_SCOPE}`, JSON.stringify(customLinks));
        localStorage.setItem('nfc_card_custom_links', JSON.stringify(customLinks));
        localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ ...form, custom_links: customLinks }));
        localStorage.setItem('nfc_card_profile_cache', JSON.stringify({ ...form, custom_links: customLinks }));
        if (form.custom_qr_url !== undefined) {
          localStorage.setItem('nfc_card_custom_qr_url', form.custom_qr_url || '');
        }
        if (form.theme_mode) {
          localStorage.setItem('nfc_card_theme', form.theme_mode);
          localStorage.removeItem('nfc_card_user_theme');
          localStorage.removeItem('nfc_card_user_base');
          sessionStorage.removeItem('nfc_card_user_theme');
          sessionStorage.removeItem('nfc_card_user_base');
        }
        if (form.site_title) {
          localStorage.setItem('nfc_card_site_title', form.site_title);
          applySiteTitle(form.site_title, true);
        }
        if (form.site_icon_url) {
          localStorage.setItem('nfc_card_site_icon', form.site_icon_url);
          applyFavicon(form.site_icon_url);
        }
      } catch (e) {}
      showToast('Profile & social buttons saved successfully!', 'success');
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="admin-spinner" />;

  if (!profile) {
    return <div className="admin-empty"><div className="admin-empty-icon">⚠️</div>No profile found.</div>;
  }

  const fields = [
    { key: 'name', label: 'Name', type: 'text' },
    { key: 'business', label: 'Business', type: 'text' },
    { key: 'role', label: 'Role', type: 'text' },
    { key: 'eyebrow', label: 'Eyebrow Text', type: 'text' },
    { key: 'showcase_caption', label: 'Showcase Image Caption (e.g. Upholstery Repair Shop)', type: 'text' },
    { key: 'phone', label: 'Phone', type: 'text' },
    { key: 'phone_link', label: 'Phone Link', type: 'text' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'address', label: 'Address', type: 'text' },
    { key: 'address_link', label: 'Address Link (e.g. Google Maps URL)', type: 'url' },
    { key: 'facebook', label: 'Facebook URL', type: 'url' },
    { key: 'youtube', label: 'YouTube URL (Optional - leave blank to hide)', type: 'url' },
  ];

  return (
    <>
      {/* Website Settings */}
      <div className="admin-card">
        <h3 className="admin-card-title">🌐 Website Settings</h3>
        <p className="admin-card-subtitle">Configure your browser tab title and site icon (favicon).</p>

        <div className="admin-form-row">
          <div className="admin-form-group">
            <label className="admin-label" htmlFor="pf-site_title">Browser Tab Title</label>
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
            <label className="admin-label">Site Icon (Favicon)</label>
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
          <label className="admin-label" htmlFor="pf-custom_qr_url">Permanent QR Code Link (Optional)</label>
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
          <label className="admin-label">Permanent Default Theme Color</label>
          <p className="admin-card-subtitle" style={{ margin: '0 0 12px' }}>
            Choose the card's default appearance. Light themes switch to Pitch Black when a visitor taps the theme control.
          </p>
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
                <span>Pure black & dark charcoal</span>
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
                <span>Natural cream & warm tan</span>
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
                <span>Bold ruby & deep burgundy</span>
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
                <span>Electric blue & cobalt</span>
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
                <span>Crisp black & pure white</span>
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
                <span>Lavender backdrop &amp; clean white cards</span>
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
                <span>Lush forest & jade green</span>
              </div>
            </label>
          </div>

          <div className="admin-save-bar" style={{ marginTop: 18 }}>
            {dirty && <span className="admin-unsaved">● Unsaved changes</span>}
            <button
              className="admin-btn admin-btn-primary"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? 'Saving…' : 'Save Website Settings & Theme'}
            </button>
          </div>
        </div>
      </div>

      {/* Image Section */}
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

        {/* Render paired rows */}
        {Array.from({ length: Math.ceil(fields.length / 2) }, (_, i) => {
          const left = fields[i * 2];
          const right = fields[i * 2 + 1];
          return (
            <div className="admin-form-row" key={left.key}>
              <div className="admin-form-group">
                <label className="admin-label" htmlFor={`pf-${left.key}`}>{left.label}</label>
                <input
                  id={`pf-${left.key}`}
                  className="admin-input"
                  type={left.type}
                  value={form[left.key] || ''}
                  onChange={(e) => handleChange(left.key, e.target.value)}
                />
              </div>
              {right && (
                <div className="admin-form-group">
                  <label className="admin-label" htmlFor={`pf-${right.key}`}>{right.label}</label>
                  <input
                    id={`pf-${right.key}`}
                    className="admin-input"
                    type={right.type}
                    value={form[right.key] || ''}
                    onChange={(e) => handleChange(right.key, e.target.value)}
                  />
                </div>
              )}
            </div>
          );
        })}

        <div className="admin-form-group">
          <label className="admin-label" htmlFor="pf-description">Description</label>
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
          <button
            className="admin-btn admin-btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save Profile'}
          </button>
        </div>
      </div>

      {/* Custom Social Media & Action Buttons */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <h3 className="admin-card-title" style={{ margin: 0 }}>Social Media & Custom Action Buttons</h3>
            <p className="admin-card-desc" style={{ marginTop: 4, marginBottom: 0 }}>
              Add TikTok, an extra Facebook page, Instagram, WhatsApp, or any other media link. These appear in the 3rd row of your card!
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

        {customLinks.length === 0 ? (
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
          <div className="admin-custom-links-list" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {customLinks.map((item, index) => (
              <div
                key={item.id || index}
                className="admin-custom-link-card"
                style={{
                  background: 'var(--admin-input-bg)',
                  border: '1px solid var(--admin-border)',
                  borderRadius: 8,
                  padding: 14,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, fontSize: '0.88rem', color: 'var(--admin-text-primary)' }}>
                    <div style={{
                      width: 32,
                      height: 32,
                      borderRadius: '50%',
                      background: 'rgba(255,255,255,0.08)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'var(--admin-accent)',
                      fontSize: '1rem',
                    }}>
                      <i className={item.icon || 'fa-solid fa-globe'} aria-hidden="true" />
                    </div>
                    <span>Button #{index + 1}: {item.label || 'Untitled Link'}</span>
                  </div>
                  <button
                    type="button"
                    className="admin-btn admin-btn-sm admin-btn-danger"
                    onClick={() => handleRemoveCustomLink(index)}
                    title="Remove button"
                  >
                    <i className="fa-solid fa-trash" aria-hidden="true" /> Remove
                  </button>
                </div>

                <div className="admin-form-row" style={{ margin: 0 }}>
                  <div className="admin-form-group" style={{ marginBottom: 0 }}>
                    <label className="admin-label">Platform / Icon</label>
                    <select
                      className="admin-input"
                      value={item.icon || 'fa-brands fa-tiktok'}
                      onChange={(e) => {
                        const newIcon = e.target.value;
                        handleUpdateCustomLink(index, 'icon', newIcon);
                        // Auto-set label if empty or previously default
                        if (!item.label || item.label === 'TikTok' || item.label === 'Facebook' || item.label === 'Instagram') {
                          if (newIcon.includes('tiktok')) handleUpdateCustomLink(index, 'label', 'TikTok');
                          else if (newIcon.includes('facebook')) handleUpdateCustomLink(index, 'label', 'FB Page 2');
                          else if (newIcon.includes('instagram')) handleUpdateCustomLink(index, 'label', 'Instagram');
                          else if (newIcon.includes('whatsapp')) handleUpdateCustomLink(index, 'label', 'WhatsApp');
                          else if (newIcon.includes('telegram')) handleUpdateCustomLink(index, 'label', 'Telegram');
                          else if (newIcon.includes('youtube')) handleUpdateCustomLink(index, 'label', 'YouTube 2');
                          else if (newIcon.includes('linkedin')) handleUpdateCustomLink(index, 'label', 'LinkedIn');
                          else if (newIcon.includes('shopping') || newIcon.includes('bag')) handleUpdateCustomLink(index, 'label', 'Shop');
                        }
                      }}
                    >
                      <option value="fa-brands fa-tiktok">🎵 TikTok</option>
                      <option value="fa-brands fa-facebook-f">📘 Facebook Page / Group</option>
                      <option value="fa-brands fa-instagram">📸 Instagram</option>
                      <option value="fa-brands fa-youtube">🔴 YouTube</option>
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
                    <label className="admin-label">Button Label (Text on card)</label>
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
                  <label className="admin-label">Destination URL</label>
                  <input
                    className="admin-input"
                    type="url"
                    placeholder="https://www.tiktok.com/@youraccount or https://facebook.com/..."
                    value={item.url || ''}
                    onChange={(e) => handleUpdateCustomLink(index, 'url', e.target.value)}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="admin-save-bar" style={{ marginTop: 20 }}>
          {dirty && <span className="admin-unsaved">● Unsaved changes</span>}
          <button
            className="admin-btn admin-btn-primary"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            {saving ? 'Saving…' : 'Save Social Buttons & Profile'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   Products Tab — Two Sections
   ============================================================ */
function ProductsTab({ showToast }) {
  const [products, setProducts] = useState([]);
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
      const { data, error } = await supabase.from('products').select('*').order('sort_order');
      if (error) throw error;
      const list = data || [];
      setProducts(list);
      try {
        localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(list));
        localStorage.setItem('nfc_card_products_cache', JSON.stringify(list));
      } catch (e) {}
    } catch (err) {
      showToast('Failed to load products: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

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
    setProductForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleProductImage = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = 'products/' + Date.now() + '_' + file.name;
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
        const path = 'products/gallery/' + Date.now() + '_' + file.name;
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
    setProductForm((prev) => ({ ...prev, gallery: prev.gallery.filter((_, i) => i !== index) }));
  };

  const handleSave = async () => {
    if (!productForm.name.trim()) { showToast('Product name is required', 'error'); return; }
    setSaving(true);
    try {
      const payload = {
        name: productForm.name,
        description: productForm.description,
        price: productForm.price,
        is_featured: productForm.is_featured,
        image_url: productForm.image_url,
        gallery: productForm.gallery || [],
      };
      if (editingProduct) {
        const { error } = await supabase.from('products').update(payload).eq('id', editingProduct.id);
        if (error) throw error;
        showToast('Product updated!', 'success');
      } else {
        const { error } = await supabase.from('products').insert([payload]);
        if (error) throw error;
        showToast('Product added!', 'success');
      }
      closeForm();
      await fetchProducts();
    } catch (err) {
      showToast('Save failed: ' + err.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (product) => {
    if (!window.confirm('Delete "' + product.name + '"? This cannot be undone.')) return;
    try {
      const { error } = await supabase.from('products').delete().eq('id', product.id);
      if (error) throw error;
      showToast('Product deleted', 'success');
      await fetchProducts();
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
  };

  const toggleFeatured = async (product) => {
    try {
      const { error } = await supabase.from('products').update({ is_featured: !product.is_featured }).eq('id', product.id);
      if (error) throw error;
      await fetchProducts();
    } catch (err) {
      showToast('Update failed: ' + err.message, 'error');
    }
  };

  if (loading) return <div className="admin-spinner" />;

  const featuredProducts = products.filter((p) => p.is_featured);

  return (
    <>
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
              <label className="admin-label">Name</label>
              <input className="admin-input" type="text" value={productForm.name} onChange={(e) => handleFormChange('name', e.target.value)} placeholder="Product name" />
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Price</label>
              <input className="admin-input" type="text" value={productForm.price} onChange={(e) => handleFormChange('price', e.target.value)} placeholder="e.g. ₱500, Starting at ₱1,000, Free" />
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Description</label>
              <textarea className="admin-textarea" value={productForm.description} onChange={(e) => handleFormChange('description', e.target.value)} placeholder="Describe this product or service in detail..." rows={4} />
            </div>

            <div className="admin-form-group">
              <label className="admin-checkbox-group">
                <input type="checkbox" checked={productForm.is_featured} onChange={(e) => handleFormChange('is_featured', e.target.checked)} />
                <span>Featured Product (show on main card)</span>
              </label>
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Main Image</label>
              {productForm.image_url && <div className="admin-image-preview"><img src={productForm.image_url} alt="Product" /></div>}
              <div className="admin-file-input"><input type="file" accept="image/*" onChange={handleProductImage} ref={fileRef} /></div>
              {uploading && <div className="admin-uploading">Uploading…</div>}
            </div>

            <div className="admin-form-group">
              <label className="admin-label">Gallery Images (multiple)</label>
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
              <button className="admin-btn admin-btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editingProduct ? 'Update Product' : 'Add Product'}
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
  const [activeTab, setActiveTab] = useState('profile');
  const [toast, setToast] = useState(null);
  const [businessName, setBusinessName] = useState('');

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
    if (session) {
      supabase.from('profiles').select('business, site_title, site_icon_url').limit(1).single().then(({ data }) => {
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
  }, [session]);

  if (session === undefined) return <div className="admin-login"><div className="admin-spinner" /></div>;
  if (!session) return <><LoginForm />{toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}</>;

  return (
    <div className="admin-page">
      <header className="admin-header">
        <div className="admin-header-left">
          <a href="/">← Back to Card</a>
          <span className="admin-header-title">Admin Dashboard{businessName && <span className="admin-header-business"> — {businessName}</span>}</span>
        </div>
        <div className="admin-header-right">
          <button className="admin-btn admin-btn-sm admin-btn-outline" onClick={() => supabase.auth.signOut()}>Logout</button>
        </div>
      </header>

      <nav className="admin-tabs">
        <button className={'admin-tab ' + (activeTab === 'profile' ? 'active' : '')} onClick={() => setActiveTab('profile')}>Profile</button>
        <button className={'admin-tab ' + (activeTab === 'products' ? 'active' : '')} onClick={() => setActiveTab('products')}>Products</button>
      </nav>

      <main className="admin-content">
        {activeTab === 'profile' && <ProfileTab showToast={showToast} />}
        {activeTab === 'products' && <ProductsTab showToast={showToast} />}
      </main>

      {toast && <Toast key={toast.key} message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}
    </div>
  );
}

export default Admin;
