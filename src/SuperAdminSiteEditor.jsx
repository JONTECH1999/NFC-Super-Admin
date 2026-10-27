import { useCallback, useEffect, useState } from 'react';
import { supabase } from './lib/supabase';

const profileGroups = [
  {
    title: 'Business profile',
    fields: [
      ['name', 'Name', 'text'],
      ['business', 'Business', 'text'],
      ['role', 'Role or title', 'text'],
      ['eyebrow', 'Short label', 'text'],
      ['description', 'Description', 'textarea'],
    ],
  },
  {
    title: 'Contact details',
    fields: [
      ['phone', 'Phone', 'tel'],
      ['email', 'Public email', 'email'],
      ['address', 'Address', 'text'],
      ['address_link', 'Address / map link', 'url'],
      ['facebook', 'Facebook URL', 'url'],
      ['youtube', 'YouTube URL', 'url'],
    ],
  },
  {
    title: 'Card appearance',
    fields: [
      ['site_title', 'Browser tab title', 'text'],
      ['custom_qr_url', 'Custom QR image URL', 'url'],
    ],
  },
];

const socialPlatforms = [
  ['fa-solid fa-phone', 'Phone / Call', 'Call'],
  ['fa-brands fa-tiktok', 'TikTok', 'TikTok'],
  ['fa-brands fa-facebook-f', 'Facebook', 'Facebook'],
  ['fa-brands fa-instagram', 'Instagram', 'Instagram'],
  ['fa-brands fa-youtube', 'YouTube', 'YouTube'],
  ['fa-brands fa-facebook-messenger', 'Messenger', 'Messenger'],
  ['fa-brands fa-whatsapp', 'WhatsApp', 'WhatsApp'],
  ['fa-brands fa-telegram', 'Telegram', 'Telegram'],
  ['fa-brands fa-viber', 'Viber', 'Viber'],
  ['fa-brands fa-x-twitter', 'X (Twitter)', 'X'],
  ['fa-brands fa-linkedin-in', 'LinkedIn', 'LinkedIn'],
  ['fa-solid fa-bag-shopping', 'Shopee / Store', 'Shop'],
  ['fa-solid fa-cart-shopping', 'Lazada / Online shop', 'Shop'],
  ['fa-solid fa-globe', 'Website', 'Website'],
  ['fa-solid fa-link', 'Custom link', 'Link'],
];

const paymentPlatforms = [
  ['gcash', 'GCash'],
  ['maya', 'Maya'],
  ['paypal', 'PayPal'],
  ['bank', 'Bank QR / Transfer'],
];

const publishProfileFields = [
  ['name', 'Name'],
  ['business', 'Business'],
  ['role', 'Role or title'],
  ['eyebrow', 'Short label'],
  ['description', 'Description'],
  ['phone', 'Phone'],
  ['phone_link', 'Phone link'],
  ['email', 'Public email'],
  ['address', 'Address'],
  ['address_link', 'Address / map link'],
  ['facebook', 'Facebook URL'],
  ['youtube', 'YouTube URL'],
  ['site_title', 'Browser tab title'],
  ['site_icon_url', 'Site icon'],
  ['profile_image_url', 'Profile image'],
  ['custom_qr_url', 'Custom QR link'],
  ['theme_mode', 'Default theme'],
];

const publishProductFields = [
  ['name', 'Name'],
  ['price', 'Price'],
  ['description', 'Description'],
  ['image_url', 'Main image'],
  ['alt', 'Image alt text'],
  ['gallery', 'Gallery images'],
  ['is_featured', 'Featured on card'],
];

function stableValue(value) {
  if (Array.isArray(value)) return `[${value.map(stableValue).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableValue(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'undefined';
}

function getLocalDraftKey(siteId, userId) {
  return `superadmin_site_editor_draft_${siteId}_${userId}`;
}

function readLocalDraft(key) {
  try {
    const stored = localStorage.getItem(key);
    if (!stored) return null;
    const draft = JSON.parse(stored);
    if (
      !draft
      || typeof draft !== 'object'
      || !draft.profile
      || !Array.isArray(draft.products)
      || !Array.isArray(draft.customLinks)
      || !Number.isFinite(draft.savedAt)
    ) return null;
    return draft;
  } catch (error) {
    console.error('Unable to restore the super-admin site editor draft:', error);
    return null;
  }
}

function clearLocalDraft(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error('Unable to clear the super-admin site editor draft:', error);
  }
}

function publishValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (Array.isArray(value)) return value.length ? value.map((item) => String(item)).join('\n') : 'None';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function getPublishChanges(liveProfile, draftProfile, liveProducts, draftProducts) {
  const changes = [];
  for (const [field, label] of publishProfileFields) {
    const before = liveProfile?.[field] ?? '';
    const after = draftProfile?.[field] ?? '';
    if (stableValue(before) !== stableValue(after)) {
      changes.push({ section: 'Business profile', label, before, after });
    }
  }

  const linkIdentity = (link, index) => link?.id ? `id:${link.id}` : `index:${index}`;
  const liveLinks = Array.isArray(liveProfile?.custom_links) ? liveProfile.custom_links : [];
  const draftLinks = Array.isArray(draftProfile?.custom_links) ? draftProfile.custom_links : [];
  const oldLinksById = new Map(liveLinks.map((link, index) => [linkIdentity(link, index), link]));
  const newLinksById = new Map(draftLinks.map((link, index) => [linkIdentity(link, index), link]));
  const linkIds = [...new Set([
    ...liveLinks.map(linkIdentity),
    ...draftLinks.map(linkIdentity),
  ])];
  const oldLinkOrder = liveLinks.map((link, index) => linkIdentity(link, index));
  const newLinkOrder = draftLinks.map((link, index) => linkIdentity(link, index));
  if (stableValue(oldLinkOrder) !== stableValue(newLinkOrder)) {
    changes.push({
      section: 'Social and payment buttons',
      label: 'Button display order',
      before: liveLinks.map((link) => link.label || 'Untitled').join('\n') || 'None',
      after: draftLinks.map((link) => link.label || 'Untitled').join('\n') || 'None',
    });
  }
  for (const id of linkIds) {
    const before = oldLinksById.get(id) ?? null;
    const after = newLinksById.get(id) ?? null;
    if (stableValue(before) === stableValue(after)) continue;
    const item = after || before;
    const type = item?.type === 'payment' ? 'Payment method' : 'Social/action button';
    const name = item?.label || 'Untitled';
    changes.push({
      section: 'Social and payment buttons',
      label: `${type}: ${name}`,
      before: before ? publishValue(before) : null,
      after: after ? publishValue(after) : null,
    });
  }

  const productIdentity = (product, index) => product?.id ? `id:${product.id}` : `new:${index}`;
  const oldProductsById = new Map((liveProducts || []).map((product, index) => [productIdentity(product, index), product]));
  const newProductsById = new Map((draftProducts || []).map((product, index) => [productIdentity(product, index), product]));
  const productIds = [...new Set([
    ...(liveProducts || []).map(productIdentity),
    ...(draftProducts || []).map(productIdentity),
  ])];
  const oldProductOrder = (liveProducts || []).map((product, index) => productIdentity(product, index));
  const newProductOrder = (draftProducts || []).map((product, index) => productIdentity(product, index));
  if (stableValue(oldProductOrder) !== stableValue(newProductOrder)) {
    changes.push({
      section: 'Products',
      label: 'Product display order',
      before: (liveProducts || []).map((product) => product.name || 'Untitled').join('\n') || 'None',
      after: (draftProducts || []).map((product) => product.name || 'Untitled').join('\n') || 'None',
    });
  }
  for (const id of productIds) {
    const before = oldProductsById.get(id) ?? null;
    const after = newProductsById.get(id) ?? null;
    const productName = after?.name || before?.name || 'Product';
    if (!before || !after) {
      changes.push({
        section: 'Products',
        label: `${before ? 'Remove' : 'Add'} product: ${productName}`,
        before: before ? publishValue(before) : null,
        after: after ? publishValue(after) : null,
      });
      continue;
    }
    for (const [field, label] of publishProductFields) {
      const oldValue = before[field] ?? (field === 'gallery' ? [] : '');
      const newValue = after[field] ?? (field === 'gallery' ? [] : '');
      if (stableValue(oldValue) === stableValue(newValue)) continue;
      changes.push({
        section: 'Products',
        label: `${productName} · ${label}`,
        before: oldValue,
        after: newValue,
      });
    }
  }
  return changes;
}

function ReviewCustomLinks({ value }) {
  let links = value;
  if (typeof links === 'string') {
    try {
      links = JSON.parse(links);
    } catch {
      links = null;
    }
  }

  if (links === null || links === undefined) links = [];
  if (links && typeof links === 'object' && !Array.isArray(links)) links = [links];
  if (!Array.isArray(links)) {
    return <pre>{value === null || value === undefined ? '—' : typeof value === 'string' ? value : JSON.stringify(value, null, 2)}</pre>;
  }
  if (links.length === 0) return <p className="superadmin-review-links-empty">No social or payment buttons.</p>;

  return (
    <div className="superadmin-review-custom-link-list">
      {links.map((link, index) => {
        if (!link || typeof link !== 'object') {
          return <pre key={index}>{JSON.stringify(link)}</pre>;
        }
        const isPayment = link.type === 'payment';
        return (
          <article className="superadmin-review-link-card" key={link.id || `${link.type}-${index}`}>
            <div className="superadmin-review-link-heading">
              <span className={`superadmin-review-link-icon${isPayment ? ' payment' : ''}`}>
                {isPayment ? <i className="fa-solid fa-qrcode" aria-hidden="true" /> : <i className={link.icon || 'fa-solid fa-link'} aria-hidden="true" />}
              </span>
              <div>
                <strong>{link.label || (isPayment ? 'Payment method' : 'Social button')}</strong>
                <small>{isPayment ? 'Payment QR button' : 'Social / action button'}</small>
              </div>
            </div>
            {isPayment ? (
              <div className="superadmin-review-payment-content">
                {link.qr_image_url
                  ? <a href={link.qr_image_url} target="_blank" rel="noreferrer" aria-label={`Open ${link.label || 'payment'} QR image`}>
                    <img className="superadmin-review-qr" src={link.qr_image_url} alt={`${link.label || 'Payment'} QR code`} />
                  </a>
                  : <span className="superadmin-review-qr-placeholder">No QR image</span>}
                <div>
                  <span><small>Platform</small><strong>{link.icon || 'Not specified'}</strong></span>
                  {link.payment_url && <span><small>Payment destination</small><strong className="superadmin-review-link-url">{link.payment_url}</strong></span>}
                </div>
              </div>
            ) : (
              <div className="superadmin-review-link-destination">
                <small>Destination</small>
                <strong className="superadmin-review-link-url">{link.url || 'No destination set'}</strong>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function parseReviewValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;
  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function getReviewImageUrls(value) {
  const parsed = parseReviewValue(value);
  const values = Array.isArray(parsed) ? parsed : [parsed];
  return values
    .filter((item) => typeof item === 'string' && item.trim())
    .map((item) => {
      try {
        const url = new URL(item.trim(), window.location.href);
        return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function ReviewImagePreview({ url, alt }) {
  const [failed, setFailed] = useState(false);
  return (
    <a className="superadmin-review-image-link" href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={alt} loading="lazy" onError={() => setFailed(true)} />
      {failed && <span className="superadmin-review-image-error">Image could not be loaded. Open the image link to check it.</span>}
    </a>
  );
}

function ReviewImageValue({ value, label }) {
  const urls = getReviewImageUrls(value);
  if (urls.length === 0) return <pre>{displayReviewValue(value)}</pre>;

  return (
    <div className="superadmin-review-image-list">
      {urls.map((url, index) => (
        <ReviewImagePreview
          key={`${url}-${index}`}
          url={url}
          alt={`${label || 'Requested'} image ${index + 1}`}
        />
      ))}
    </div>
  );
}

function displayReviewValue(value) {
  if (value === null || value === undefined) return '—';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

function ReviewProductValue({ value, changeKey }) {
  const parsed = parseReviewValue(value);
  if (parsed === null || parsed === undefined || parsed === '') return <pre>—</pre>;

  const field = changeKey.split(':').pop();
  const product = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  const imageUrls = field === 'image_url' || field === 'gallery'
    ? getReviewImageUrls(parsed)
    : [
        ...getReviewImageUrls(product?.image_url),
        ...getReviewImageUrls(product?.gallery),
      ];
  const images = [...new Set(imageUrls)];
  const isImageValue = field === 'image_url' || field === 'gallery';

  if (!product && !isImageValue) {
    return <pre>{typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2)}</pre>;
  }

  return (
    <div className="superadmin-review-product">
      {images.length > 0 ? (
        <div className="superadmin-review-product-images">
          {images.map((url, index) => (
            <ReviewImagePreview
              key={`${url}-${index}`}
              url={url}
              alt={product?.alt || product?.name || 'Product image'}
            />
          ))}
        </div>
      ) : (
        <span className="superadmin-review-product-no-image">No product image</span>
      )}
      {product && (
        <div className="superadmin-review-product-details">
          {product.name && <strong>{product.name}</strong>}
          {product.price && <span>{product.price}</span>}
          {product.description && <p>{product.description}</p>}
        </div>
      )}
      {isImageValue && typeof parsed === 'string' && (
        images[0]
          ? <a className="superadmin-review-product-image-url" href={images[0]} target="_blank" rel="noreferrer">{parsed}</a>
          : <span className="superadmin-review-product-image-url">{parsed}</span>
      )}
    </div>
  );
}

function SuperAdminSiteEditor({ site, invoke, onClose, onChanged }) {
  const [profile, setProfile] = useState({});
  const [products, setProducts] = useState([]);
  const [liveProfile, setLiveProfile] = useState({});
  const [liveProducts, setLiveProducts] = useState([]);
  const [customLinks, setCustomLinks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishModalOpen, setPublishModalOpen] = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [draftUpdatedAt, setDraftUpdatedAt] = useState(null);
  const [publishedAt, setPublishedAt] = useState(null);
  const [requests, setRequests] = useState([]);
  const [emailFollowups, setEmailFollowups] = useState([]);
  const [reviewChoices, setReviewChoices] = useState({});
  const [dirty, setDirty] = useState(false);
  const [draftCacheKey, setDraftCacheKey] = useState('');
  const [localDraftSavedAt, setLocalDraftSavedAt] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadEditor = useCallback(async () => {
    setLoading(true);
    setDirty(false);
    setDraftCacheKey('');
    setLocalDraftSavedAt(null);
    setError('');
    try {
      const [data, { data: sessionData, error: sessionError }] = await Promise.all([
        invoke({ action: 'get_site_editor', site_id: site.site_id }),
        supabase.auth.getSession(),
      ]);
      if (sessionError) throw sessionError;
      if (!sessionData.session?.user?.id) throw new Error('Your sign-in session expired. Please sign in again.');

      const cacheKey = getLocalDraftKey(site.site_id, sessionData.session.user.id);
      const localDraft = readLocalDraft(cacheKey);
      const serverDraftUpdatedAt = data.draft_updated_at ? Date.parse(data.draft_updated_at) : 0;
      const restoreLocalDraft = localDraft && localDraft.savedAt > serverDraftUpdatedAt;
      const loadedProfile = restoreLocalDraft ? localDraft.profile : data.profile || {};
      const loadedProducts = restoreLocalDraft ? localDraft.products : data.products || [];
      const loadedLinks = restoreLocalDraft
        ? localDraft.customLinks
        : loadedProfile.custom_links ?? [];

      if (localDraft && !restoreLocalDraft) clearLocalDraft(cacheKey);
      setDraftCacheKey(cacheKey);
      setProfile(loadedProfile);
      setLiveProfile(data.live_profile || {});
      setLiveProducts(data.live_products || []);
      setCustomLinks(Array.isArray(loadedLinks) ? loadedLinks : []);
      setProducts(loadedProducts.map((product) => ({
        ...product,
        gallery: Array.isArray(product.gallery) ? product.gallery : [],
      })));
      setHasDraft(Boolean(data.has_draft));
      setDraftUpdatedAt(data.draft_updated_at);
      setPublishedAt(data.published_at);
      setRequests(data.requests || []);
      setEmailFollowups(data.email_followups || []);
      setReviewChoices({});
      if (restoreLocalDraft) {
        setDirty(true);
        setLocalDraftSavedAt(localDraft.savedAt);
        setNotice('Recovered your unsaved changes from this browser. Save draft when you are ready.');
      }
    } catch (loadError) {
      setError(loadError.message || 'Could not load this site’s profile data.');
    } finally {
      setLoading(false);
    }
  }, [invoke, site.site_id]);

  useEffect(() => {
    loadEditor();
  }, [loadEditor]);

  useEffect(() => {
    if (!dirty || loading || !draftCacheKey) return;
    const savedAt = Date.now();
    try {
      localStorage.setItem(draftCacheKey, JSON.stringify({
        profile,
        products,
        customLinks,
        savedAt,
      }));
      setLocalDraftSavedAt(savedAt);
    } catch (storageError) {
      console.error('Unable to save the super-admin site editor draft:', storageError);
      setError('Your changes could not be saved in this browser. Click “Save draft” to store them on the server.');
    }
  }, [customLinks, dirty, draftCacheKey, loading, products, profile]);

  useEffect(() => {
    if (!publishModalOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape' && !publishing) setPublishModalOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [publishModalOpen, publishing]);

  const updateProfile = (key, value) => {
    setProfile((current) => key === 'phone'
      ? { ...current, phone: value, phone_link: value }
      : { ...current, [key]: value });
    setDirty(true);
    setNotice('');
  };

  const updateProduct = (index, key, value) => {
    setProducts((current) => current.map((product, productIndex) => (
      productIndex === index ? { ...product, [key]: value } : product
    )));
    setDirty(true);
    setNotice('');
  };

  const uploadImage = async (file, folder) => {
    if (!file) return null;
    if (!file.type.startsWith('image/')) throw new Error('Choose an image file.');
    if (file.size > 5 * 1024 * 1024) throw new Error('Images must be 5 MB or smaller.');
    const safeName = file.name.replace(/[^\w.-]/g, '_');
    const path = `${site.site_id}/${folder}/${Date.now()}_${safeName}`;
    setUploading(folder);
    try {
      const { error: uploadError } = await supabase.storage.from('images').upload(path, file);
      if (uploadError) throw uploadError;
      return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
    } finally {
      setUploading('');
    }
  };

  const handleProfileImageUpload = async (field, folder, file) => {
    setError('');
    try {
      const url = await uploadImage(file, folder);
      if (url) updateProfile(field, url);
    } catch (uploadError) {
      setError(`Image upload failed: ${uploadError.message}`);
    }
  };

  const handleProductImageUpload = async (index, folder, file) => {
    setError('');
    try {
      const url = await uploadImage(file, folder);
      if (url) {
        updateProduct(index, 'image_url', url);
      }
    } catch (uploadError) {
      setError(`Image upload failed: ${uploadError.message}`);
    }
  };

  const handleProductGalleryUpload = async (index, files) => {
    if (!files.length) return;
    setError('');
    try {
      const urls = [];
      for (const file of Array.from(files)) {
        const url = await uploadImage(file, 'products/gallery');
        if (url) urls.push(url);
      }
      const product = products[index];
      updateProduct(index, 'gallery', [...(product.gallery || []), ...urls]);
    } catch (uploadError) {
      setError(`Gallery upload failed: ${uploadError.message}`);
    }
  };

  const handleLinkImageUpload = async (index, file) => {
    setError('');
    try {
      const url = await uploadImage(file, 'payments');
      if (url) updateCustomLink(index, 'qr_image_url', url);
    } catch (uploadError) {
      setError(`Payment QR upload failed: ${uploadError.message}`);
    }
  };

  const updateCustomLink = (index, key, value) => {
    setCustomLinks((current) => current.map((link, linkIndex) => (
      linkIndex === index ? { ...link, [key]: value } : link
    )));
    setDirty(true);
    setNotice('');
  };

  const addSocialLink = () => {
    setCustomLinks((current) => [...current, {
      id: crypto.randomUUID(),
      type: 'social',
      label: 'TikTok',
      url: '',
      icon: 'fa-brands fa-tiktok',
    }]);
    setDirty(true);
  };

  const addPaymentLink = () => {
    setCustomLinks((current) => [...current, {
      id: crypto.randomUUID(),
      type: 'payment',
      label: 'GCash',
      icon: 'gcash',
      qr_image_url: '',
      payment_url: '',
    }]);
    setDirty(true);
  };

  const removeCustomLink = (index) => {
    setCustomLinks((current) => current.filter((_link, linkIndex) => linkIndex !== index));
    setDirty(true);
    setNotice('');
  };

  const addProduct = () => {
    setProducts((current) => [...current, {
      id: null,
      name: '',
      description: '',
      price: '',
      image_url: '',
      alt: '',
      gallery: [],
      is_featured: true,
      sort_order: current.length,
    }]);
    setDirty(true);
    setNotice('');
  };

  const removeProduct = (index) => {
    setProducts((current) => current.filter((_product, productIndex) => productIndex !== index));
    setDirty(true);
    setNotice('');
  };

  const saveDraft = async (event) => {
    event.preventDefault();
    if (uploading) {
      setError('Wait for image uploads to finish before saving the draft.');
      return;
    }
    setError('');
    setNotice('');
    let serializedProducts;
    try {
      serializedProducts = products.map((product, index) => {
        if (!Array.isArray(product.gallery)) throw new Error(`Product ${index + 1} gallery must be a list.`);
        return { ...product, sort_order: index };
      });
    } catch (parseError) {
      setError(`Check the JSON data: ${parseError.message}`);
      return;
    }

    setSaving(true);
    try {
      const result = await invoke({
        action: 'save_site_draft',
        site_id: site.site_id,
        profile: { ...profile, custom_links: customLinks },
        products: serializedProducts,
      });
      setHasDraft(true);
      setDraftUpdatedAt(result.draft_updated_at);
      setPublishedAt(null);
      setDirty(false);
      clearLocalDraft(draftCacheKey);
      setLocalDraftSavedAt(null);
      setNotice('Draft saved privately. The live site has not changed.');
      await Promise.all([loadEditor(), onChanged()]);
    } catch (saveError) {
      setError(saveError.message || 'Could not save this draft.');
    } finally {
      setSaving(false);
    }
  };

  const publishDraft = async () => {
    if (!hasDraft || dirty || publishing || saving || uploading) return;
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      const result = await invoke({ action: 'publish_site_draft', site_id: site.site_id });
      clearLocalDraft(draftCacheKey);
      setLocalDraftSavedAt(null);
      setPublishModalOpen(false);
      setNotice(result.rejection_email_warning
        ? `Draft published. Rejection email delivery needs attention: ${result.rejection_email_warning}`
        : result.rejection_emails_sent
          ? `Draft published. Sent ${result.rejection_emails_sent} client rejection email(s).`
          : 'Draft published. The live card now shows these changes.');
      await Promise.all([loadEditor(), onChanged()]);
    } catch (publishError) {
      setError(publishError.message || 'Could not publish this draft.');
    } finally {
      setPublishing(false);
    }
  };

  const setReviewChoice = (requestId, changeKey, decision) => {
    setReviewChoices((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        [changeKey]: {
          ...current[requestId]?.[changeKey],
          decision,
          reason: decision === 'approve' ? '' : current[requestId]?.[changeKey]?.reason || '',
        },
      },
    }));
  };

  const setReviewReason = (requestId, changeKey, reason) => {
    setReviewChoices((current) => ({
      ...current,
      [requestId]: {
        ...current[requestId],
        [changeKey]: {
          ...current[requestId]?.[changeKey],
          decision: 'reject',
          reason,
        },
      },
    }));
  };

  const submitReview = async (request) => {
    const choices = reviewChoices[request.id] || {};
    const missingChoice = request.changes.some((change) => (
      !choices[change.key]?.decision
      || (choices[change.key].decision === 'reject' && !choices[change.key].reason?.trim())
    ));
    if (missingChoice) {
      setError('Choose approve or reject for every requested item, and add a reason to each rejection.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await invoke({
        action: 'review_edit_request',
        request_id: request.id,
        decisions: choices,
      });
      const emailNote = result.email_warning
        ? ` Email not sent yet: ${result.email_warning}`
        : result.email_sent
          ? ` Sent ${result.email_sent} email(s) to the client.`
          : result.rejected_count > 0 && result.approved_count > 0
            ? ' Rejection email will be sent after you publish the approved draft.'
            : '';
      setNotice(result.status === 'completed'
        ? 'Closed request: its requested values already match the current site data.'
        : result.approved_count > 0
        ? `${result.approved_count} item(s) approved into the private draft; ${result.rejected_count} rejected.${emailNote} Live content is unchanged until publish.`
        : `All ${result.rejected_count} item(s) rejected.${emailNote}`);
      await Promise.all([loadEditor(), onChanged()]);
    } catch (reviewError) {
      setError(reviewError.message || 'Could not submit these review decisions.');
    } finally {
      setSaving(false);
    }
  };

  const retryRejectionEmails = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await invoke({ action: 'retry_rejection_emails', site_id: site.site_id });
      setNotice(result.warning
        ? `Email delivery still needs attention: ${result.warning}`
        : `Sent ${result.sent} rejection email(s).`);
      await loadEditor();
    } catch (retryError) {
      setError(retryError.message || 'Could not retry the rejection emails.');
    } finally {
      setSaving(false);
    }
  };

  const displayValue = (value) => value === null || value === undefined
    ? '—'
    : typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  const renderReviewValue = (change, value) => change.key === 'profile:custom_links'
    || change.key.startsWith('profile:custom_link:')
    ? <ReviewCustomLinks value={value} />
    : ['profile:profile_image_url', 'profile:site_icon_url', 'profile:custom_qr_url'].includes(change.key)
      ? <ReviewImageValue label={change.label} value={value} />
    : change.key.startsWith('product:')
      ? <ReviewProductValue changeKey={change.key} value={value} />
    : <pre>{displayValue(value)}</pre>;

  const hasEmailFollowUp = emailFollowups.length > 0;
  const publishChanges = getPublishChanges(liveProfile, { ...profile, custom_links: customLinks }, liveProducts, products);
  const groupedPublishChanges = publishChanges.reduce((groups, change) => {
    groups[change.section] = [...(groups[change.section] || []), change];
    return groups;
  }, {});

  return (
    <section className="superadmin-panel superadmin-editor-panel">
      <div className="superadmin-panel-heading superadmin-editor-heading">
        <div>
          <p className="superadmin-eyebrow">SITE CONTENT</p>
          <h2>Edit {site.name}</h2>
          <p className="superadmin-section-note">Save privately while you prepare. Review the before-and-after summary before confirming any live update.</p>
        </div>
        <div className="superadmin-editor-heading-actions">
          <button className="superadmin-secondary" type="button" onClick={onClose}>Back to sites</button>
          {site.public_url && <a className="superadmin-secondary" href={site.public_url} target="_blank" rel="noreferrer">View live card ↗</a>}
        </div>
      </div>

      {error && <div className="superadmin-alert error" role="alert">{error}</div>}
      {notice && <div className="superadmin-alert success" role="status">{notice}</div>}

      <div className="superadmin-draft-status">
        <div>
          <strong>{dirty ? 'Unsaved changes' : hasDraft ? 'Private draft saved' : 'Editing current live content'}</strong>
          {dirty && localDraftSavedAt
            ? <small>Changes auto-saved in this browser at {new Date(localDraftSavedAt).toLocaleString()}.</small>
            : <small>{draftUpdatedAt ? `Last saved ${new Date(draftUpdatedAt).toLocaleString()}` : 'Save a draft to keep edits off the live card.'}</small>}
          {publishedAt && !dirty && <small>Last published {new Date(publishedAt).toLocaleString()}</small>}
        </div>
        <span className={`superadmin-status ${site.payment_status === 'paid' ? 'active' : ''}`}>
          {site.payment_status === 'paid' ? 'Paid' : 'Payment required'}
        </span>
      </div>

      {loading ? <p className="superadmin-muted">Loading site content…</p> : (
        <>
        {(requests.length > 0 || hasEmailFollowUp) && (
          <section className="superadmin-editor-section superadmin-request-review">
            <div className="superadmin-editor-products-heading">
              <div>
                <h3>Client change requests</h3>
                <p className="superadmin-section-note">Current site data is loaded below. Review each requested item against its current value; rejected items require an individual reason.</p>
              </div>
              <span className="superadmin-panel-count">{requests.length}</span>
            </div>
            {hasEmailFollowUp && (
              <div className="superadmin-email-followup">
                <div>
                  <strong>{emailFollowups.length} rejected-change email(s) are pending or need retry.</strong>
                  {emailFollowups.map((item) => (
                    <small key={item.id}>{item.client_email}{item.email_error ? ` · ${item.email_error}` : ''}</small>
                  ))}
                </div>
                <button className="superadmin-secondary" type="button" disabled={saving} onClick={retryRejectionEmails}>Retry email delivery</button>
              </div>
            )}
            {requests.map((request) => (
              <article className="superadmin-request-review-card" key={request.id}>
                <div className="superadmin-request-review-heading">
                  <div>
                    <strong>{request.request_type === 'products' ? 'Product updates' : 'Profile updates'}</strong>
                    <small>{request.client_email} · {new Date(request.created_at).toLocaleString()}</small>
                    {request.notes && <p>{request.notes}</p>}
                  </div>
                  <span className="superadmin-status">{request.changes.length} requested</span>
                </div>
                {request.changes.length === 0 ? <p className="superadmin-muted">No changes remain to review. The requested values may already match the current site or may have been superseded by a newer request.</p> : (
                  <div className="superadmin-review-change-list">
                    {request.changes.map((change) => {
                      const choice = reviewChoices[request.id]?.[change.key] || {};
                      return (
                        <article className={`superadmin-review-change${choice.decision ? ` ${choice.decision}` : ''}`} key={change.key}>
                          <div className="superadmin-review-change-title">
                            <strong>{change.label}</strong>
                            {choice.decision && <span>{choice.decision === 'approve' ? '✓ Approved' : '× Rejected'}</span>}
                          </div>
                          <div className="superadmin-review-values">
                            <div><small>Current data</small>{renderReviewValue(change, change.old_value)}</div>
                            <div><small>Requested data</small>{renderReviewValue(change, change.new_value)}</div>
                          </div>
                          <div className="superadmin-review-choice-actions">
                            <button className={`superadmin-secondary${choice.decision === 'approve' ? ' selected-approve' : ''}`} type="button" onClick={() => setReviewChoice(request.id, change.key, 'approve')}>✓ Approve this item</button>
                            <button className={`superadmin-secondary${choice.decision === 'reject' ? ' selected-reject' : ''}`} type="button" onClick={() => setReviewChoice(request.id, change.key, 'reject')}>× Reject this item</button>
                          </div>
                          {choice.decision === 'reject' && (
                            <label className="superadmin-review-reason">Reason for rejecting this item
                              <textarea maxLength={2000} value={choice.reason || ''} onChange={(event) => setReviewReason(request.id, change.key, event.target.value)} />
                            </label>
                          )}
                        </article>
                      );
                    })}
                  </div>
                )}
                <div className="superadmin-editor-actions">
                  <button className="superadmin-primary" type="button" disabled={saving || dirty || Boolean(uploading)} onClick={() => submitReview(request)}>
                    {saving ? 'Submitting decisions…' : request.changes.length === 0 ? 'Close unchanged request' : 'Submit item decisions'}
                  </button>
                </div>
                {dirty && <p className="superadmin-editor-payment-note">Save or discard your current editor changes before reviewing requests, so the comparison uses a saved version.</p>}
              </article>
            ))}
          </section>
        )}
        <form className="superadmin-editor-form" onSubmit={saveDraft}>
          {profileGroups.map((group) => (
            <section className="superadmin-editor-section" key={group.title}>
              <h3>{group.title}</h3>
              <div className="superadmin-editor-fields">
                {group.fields.map(([key, label, type]) => (
                  <label className={type === 'textarea' ? 'wide' : ''} key={key}>
                    {label}
                    {type === 'textarea' ? (
                      <textarea rows={4} value={profile[key] || ''} onChange={(event) => updateProfile(key, event.target.value)} />
                    ) : (
                      <input type={type} value={profile[key] || ''} onChange={(event) => updateProfile(key, event.target.value)} />
                    )}
                  </label>
                ))}
              </div>
            </section>
          ))}

          <section className="superadmin-editor-section">
            <h3>Card photos and site icon</h3>
            <p className="superadmin-section-note">Upload images or paste an image URL. Uploads are stored under this site’s image folder.</p>
            <div className="superadmin-editor-media-grid">
              {[
                ['profile_image_url', 'Profile image', 'profile'],
                ['site_icon_url', 'Site icon (favicon)', 'profile'],
              ].map(([field, label, folder]) => (
                <div className="superadmin-editor-media" key={field}>
                  <strong>{label}</strong>
                  <div className="superadmin-editor-image-preview">
                    {profile[field] ? <img src={profile[field]} alt={`${label} preview`} /> : <span>No image</span>}
                  </div>
                  <label className="superadmin-secondary superadmin-upload-button">
                    {uploading === folder ? 'Uploading…' : `Upload ${label.toLowerCase()}`}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={Boolean(uploading)}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.target.value = '';
                        handleProfileImageUpload(field, folder, file);
                      }}
                    />
                  </label>
                  <input
                    aria-label={`${label} URL`}
                    type="url"
                    placeholder={`${label} URL`}
                    value={profile[field] || ''}
                    onChange={(event) => updateProfile(field, event.target.value)}
                  />
                </div>
              ))}
            </div>
          </section>

          <section className="superadmin-editor-section">
            <h3>Default card theme</h3>
            <p className="superadmin-section-note">Choose the theme visitors see when they first open the card.</p>
            <div className="superadmin-theme-options">
              {[
                ['dark', 'Pitch Black', '#111111'],
                ['light', 'Warm Beige', '#a87232'],
                ['red', 'Crimson Red', '#e63946'],
                ['blue', 'Royal Blue', '#1d70f5'],
                ['white', 'Pure White', '#ffffff'],
                ['emerald', 'Emerald Green', '#10b981'],
                ['lavender', 'Soft Lavender', '#8b72cc'],
              ].map(([theme, label, color]) => (
                <label className={`superadmin-theme-choice${(profile.theme_mode || 'dark') === theme ? ' selected' : ''}`} key={theme}>
                  <input
                    type="radio"
                    name="site-default-theme"
                    checked={(profile.theme_mode || 'dark') === theme}
                    onChange={() => updateProfile('theme_mode', theme)}
                  />
                  <span style={{ backgroundColor: color }} />
                  {label}
                </label>
              ))}
            </div>
          </section>

          <section className="superadmin-editor-section">
            <div className="superadmin-editor-products-heading">
              <div>
                <h3>Social media and action buttons</h3>
                <p className="superadmin-section-note">Manage every social, contact, and website button shown on the card.</p>
              </div>
              <button className="superadmin-secondary" type="button" onClick={addSocialLink}>＋ Add button</button>
            </div>
            {customLinks.map((link, index) => link.type !== 'payment' && (
              <article className="superadmin-editor-link" key={link.id || `social-${index}`}>
                <div className="superadmin-editor-product-heading">
                  <strong>{link.label || `Button ${index + 1}`}</strong>
                  <button className="superadmin-danger" type="button" onClick={() => removeCustomLink(index)}>Remove</button>
                </div>
                <div className="superadmin-editor-fields">
                  <label>Platform / icon
                    <select
                      value={link.icon || 'fa-solid fa-globe'}
                      onChange={(event) => {
                        const option = socialPlatforms.find(([icon]) => icon === event.target.value);
                        updateCustomLink(index, 'icon', event.target.value);
                        if (option && (!link.label || socialPlatforms.some(([, , defaultLabel]) => defaultLabel === link.label))) {
                          updateCustomLink(index, 'label', option[2]);
                        }
                      }}
                    >
                      {socialPlatforms.map(([icon, label]) => <option value={icon} key={icon}>{label}</option>)}
                    </select>
                  </label>
                  <label>Button label<input maxLength={80} value={link.label || ''} onChange={(event) => updateCustomLink(index, 'label', event.target.value)} /></label>
                  <label className="wide">Destination URL
                    <input
                      type="text"
                      inputMode="url"
                      placeholder={link.icon === 'fa-solid fa-phone' ? 'Phone number or tel:+...' : 'https://...'}
                      value={link.url || ''}
                      onChange={(event) => updateCustomLink(index, 'url', event.target.value)}
                    />
                  </label>
                </div>
              </article>
            ))}
            {customLinks.every((link) => link.type === 'payment') && <p className="superadmin-empty">No social or action buttons configured yet.</p>}
          </section>

          <section className="superadmin-editor-section">
            <div className="superadmin-editor-products-heading">
              <div>
                <h3>Payment QR buttons</h3>
                <p className="superadmin-section-note">Upload the QR image customers scan, and optionally add a checkout link.</p>
              </div>
              <button className="superadmin-secondary" type="button" onClick={addPaymentLink}>＋ Add payment method</button>
            </div>
            {customLinks.map((link, index) => link.type === 'payment' && (
              <article className="superadmin-editor-link" key={link.id || `payment-${index}`}>
                <div className="superadmin-editor-product-heading">
                  <strong>{link.label || `Payment method ${index + 1}`}</strong>
                  <button className="superadmin-danger" type="button" onClick={() => removeCustomLink(index)}>Remove</button>
                </div>
                <div className="superadmin-editor-payment-layout">
                  <div className="superadmin-editor-image-preview superadmin-payment-image-preview">
                    {link.qr_image_url ? <img src={link.qr_image_url} alt={`${link.label || 'Payment'} QR preview`} /> : <span>No QR image</span>}
                  </div>
                  <div className="superadmin-editor-fields">
                    <label>Payment platform
                      <select
                        value={link.icon || 'gcash'}
                        onChange={(event) => {
                          const platform = event.target.value;
                          updateCustomLink(index, 'icon', platform);
                          const option = paymentPlatforms.find(([value]) => value === platform);
                          if (option && (!link.label || paymentPlatforms.some(([, label]) => label === link.label))) {
                            updateCustomLink(index, 'label', option[1]);
                          }
                        }}
                      >
                        {paymentPlatforms.map(([value, label]) => <option value={value} key={value}>{label}</option>)}
                      </select>
                    </label>
                    <label>Button label<input maxLength={32} value={link.label || ''} onChange={(event) => updateCustomLink(index, 'label', event.target.value)} /></label>
                    <label className="superadmin-secondary superadmin-upload-button">
                      {uploading === 'payments' ? 'Uploading QR…' : link.qr_image_url ? 'Replace QR image' : 'Upload QR image'}
                      <input
                        type="file"
                        accept="image/*"
                        disabled={Boolean(uploading)}
                        onChange={(event) => {
                          const file = event.target.files?.[0];
                          event.target.value = '';
                          handleLinkImageUpload(index, file);
                        }}
                      />
                    </label>
                    <label className="wide">QR image URL<input type="url" value={link.qr_image_url || ''} onChange={(event) => updateCustomLink(index, 'qr_image_url', event.target.value)} /></label>
                    <label className="wide">Optional payment or checkout link<input type="url" placeholder="https://..." value={link.payment_url || ''} onChange={(event) => updateCustomLink(index, 'payment_url', event.target.value)} /></label>
                  </div>
                </div>
              </article>
            ))}
            {customLinks.every((link) => link.type !== 'payment') && <p className="superadmin-empty">No payment QR buttons configured yet.</p>}
          </section>

          <section className="superadmin-editor-section">
            <div className="superadmin-editor-products-heading">
              <div><h3>Products</h3><p className="superadmin-section-note">Product changes remain in draft until you publish.</p></div>
              <button className="superadmin-secondary" type="button" onClick={addProduct}>＋ Add product</button>
            </div>
            {products.length === 0 ? <p className="superadmin-empty">No products are configured for this site.</p> : (
              <div className="superadmin-editor-products">
                {products.map((product, index) => (
                  <article className="superadmin-editor-product" key={product.id || `new-${index}`}>
                    <div className="superadmin-editor-product-heading">
                      <h4>Product {index + 1}</h4>
                      <button className="superadmin-danger" type="button" onClick={() => removeProduct(index)}>Remove</button>
                    </div>
                    <div className="superadmin-editor-fields">
                      <label>Name<input required maxLength={200} value={product.name || ''} onChange={(event) => updateProduct(index, 'name', event.target.value)} /></label>
                      <label>Price<input value={product.price || ''} onChange={(event) => updateProduct(index, 'price', event.target.value)} /></label>
                      <label className="wide">Description<textarea rows={3} value={product.description || ''} onChange={(event) => updateProduct(index, 'description', event.target.value)} /></label>
                      <div className="superadmin-editor-product-images wide">
                        <div className="superadmin-editor-media">
                          <strong>Main product image</strong>
                          <div className="superadmin-editor-image-preview superadmin-product-image-preview">
                            {product.image_url ? <img src={product.image_url} alt={product.alt || product.name || 'Product'} /> : <span>No image</span>}
                          </div>
                          <label className="superadmin-secondary superadmin-upload-button">
                            {uploading === 'products' ? 'Uploading…' : 'Upload main image'}
                            <input
                              type="file"
                              accept="image/*"
                              disabled={Boolean(uploading)}
                              onChange={(event) => {
                                const file = event.target.files?.[0];
                                event.target.value = '';
                                handleProductImageUpload(index, 'products', file);
                              }}
                            />
                          </label>
                          <input type="url" aria-label="Main image URL" placeholder="Or paste image URL" value={product.image_url || ''} onChange={(event) => updateProduct(index, 'image_url', event.target.value)} />
                        </div>
                        <div className="superadmin-editor-media">
                          <strong>Gallery images</strong>
                          <div className="superadmin-editor-gallery">
                            {(product.gallery || []).map((url, imageIndex) => (
                              <div className="superadmin-editor-gallery-item" key={`${url}-${imageIndex}`}>
                                <img src={url} alt={`${product.name || 'Product'} gallery ${imageIndex + 1}`} />
                                <button type="button" className="superadmin-danger" onClick={() => updateProduct(index, 'gallery', product.gallery.filter((_image, itemIndex) => itemIndex !== imageIndex))}>Remove</button>
                              </div>
                            ))}
                            {product.gallery?.length === 0 && <span className="superadmin-muted">No gallery images</span>}
                          </div>
                          <label className="superadmin-secondary superadmin-upload-button">
                            {uploading === 'products/gallery' ? 'Uploading…' : '＋ Add gallery images'}
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              disabled={Boolean(uploading)}
                              onChange={(event) => {
                                const files = event.target.files;
                                event.target.value = '';
                                handleProductGalleryUpload(index, files);
                              }}
                            />
                          </label>
                        </div>
                      </div>
                      <label className="wide">Image alt text<input value={product.alt || ''} onChange={(event) => updateProduct(index, 'alt', event.target.value)} /></label>
                      <label className="superadmin-editor-checkbox"><input type="checkbox" checked={product.is_featured !== false} onChange={(event) => updateProduct(index, 'is_featured', event.target.checked)} /> Featured product</label>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>

          <div className="superadmin-editor-actions">
            <button className="superadmin-secondary" type="submit" disabled={saving || loading || Boolean(uploading)}>{saving ? 'Saving draft…' : 'Save as draft'}</button>
            <button className="superadmin-primary" type="button" disabled={!hasDraft || dirty || saving || publishing || loading || Boolean(uploading)} onClick={() => setPublishModalOpen(true)}>
              {publishing ? 'Publishing…' : 'Publish to live site'}
            </button>
          </div>
          {site.payment_status !== 'paid' && <p className="superadmin-editor-payment-note">This site is not marked paid. Publishing is still available; confirm the changes carefully.</p>}
          {dirty && <p className="superadmin-editor-payment-note">Save your changes as a draft before publishing.</p>}
        </form>
        {publishModalOpen && (
          <div
            className="superadmin-publish-modal-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget && !publishing) setPublishModalOpen(false);
            }}
          >
            <section className="superadmin-publish-modal" role="dialog" aria-modal="true" aria-labelledby="superadmin-publish-title">
              <div className="superadmin-publish-modal-heading">
                <div>
                  <p className="superadmin-eyebrow">PUBLISH CONFIRMATION</p>
                  <h2 id="superadmin-publish-title">Publish changes to {site.name}?</h2>
                </div>
                <button className="superadmin-secondary" type="button" disabled={publishing} onClick={() => setPublishModalOpen(false)}>Close</button>
              </div>
              <p className="superadmin-publish-modal-intro">Review the saved draft changes below. Confirming will replace the matching live card data with these draft values.</p>
              {site.payment_status !== 'paid' && (
                <div className="superadmin-publish-unpaid-warning" role="note">
                  This site is not marked as paid. Publishing will still proceed if you confirm.
                </div>
              )}
              <div className="superadmin-publish-change-summary">
                <strong>{publishChanges.length} change{publishChanges.length === 1 ? '' : 's'} will be published</strong>
                {publishChanges.length === 0 ? (
                  <p className="superadmin-empty">The saved draft matches the current live data.</p>
                ) : (
                  Object.entries(groupedPublishChanges).map(([section, changes]) => (
                    <section className="superadmin-publish-change-group" key={section}>
                      <h3>{section}</h3>
                      {changes.map((change, index) => (
                        <article className="superadmin-publish-change" key={`${change.label}-${index}`}>
                          <strong>{change.label}</strong>
                          <div>
                            <span><small>Live now</small><pre>{publishValue(change.before)}</pre></span>
                            <span><small>After publish</small><pre>{publishValue(change.after)}</pre></span>
                          </div>
                        </article>
                      ))}
                    </section>
                  ))
                )}
              </div>
              <div className="superadmin-publish-modal-actions">
                <button className="superadmin-secondary" type="button" disabled={publishing} onClick={() => setPublishModalOpen(false)}>Cancel</button>
                <button className="superadmin-primary" type="button" disabled={publishing || !hasDraft} onClick={publishDraft}>
                  {publishing ? 'Publishing…' : 'Confirm and publish'}
                </button>
              </div>
            </section>
          </div>
        )}
        </>
      )}
    </section>
  );
}

export default SuperAdminSiteEditor;
