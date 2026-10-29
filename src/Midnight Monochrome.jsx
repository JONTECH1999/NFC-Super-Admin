import { getImageFocalInfo } from "./lib/imageFocalPoint";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { profilesTable, productsTable, siteId, supabase } from "./lib/supabase";
import { applyFavicon, applySiteTitle } from "./lib/siteSettings";
import "./Midnight Monochrome.css";

function normalizeLinks(value) {
  try {
    const links = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(links) ? links : [];
  } catch (error) {
    console.error("Unable to read client links:", error);
    return [];
  }
}

function escapeVCard(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function getLinkHref(link) {
  const destination = (link.url || "").trim();
  if (link.icon === "fa-solid fa-phone") {
    const number = destination.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
    return number ? `tel:${number}` : "";
  }
  if (!destination) return "";
  return /^https?:\/\//i.test(destination) ? destination : `https://${destination}`;
}

function Digipen() {
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");

  /* Intro Screen State & Profile Preload */
  const [introPhase, setIntroPhase] = useState("loading");
  const [profileImageLoadedUrl, setProfileImageLoadedUrl] = useState("");
  const [failedProfileImageUrl, setFailedProfileImageUrl] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadPageData() {
      try {
        const [profileResult, productsResult] = await Promise.all([
          supabase.from(profilesTable).select("*").eq("site_id", siteId).single(),
          supabase.from(productsTable).select("*").eq("site_id", siteId).order("sort_order"),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (productsResult.error) throw productsResult.error;
        if (cancelled) return;

        const nextProfile = {
          ...profileResult.data,
          custom_links: normalizeLinks(profileResult.data.custom_links),
        };
        setProfile(nextProfile);
        setProducts(productsResult.data || []);
        if (nextProfile.site_title) applySiteTitle(nextProfile.site_title, false);
        if (nextProfile.site_icon_url) applyFavicon(nextProfile.site_icon_url);
      } catch (error) {
        if (!cancelled) {
          console.error("Failed to load Digipen client page:", error);
          setLoadError("We couldn't load this business card. Please refresh and try again.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPageData();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Preload Profile Avatar in Background */
  useEffect(() => {
    if (!profile?.profile_image_url) return undefined;

    let active = true;
    const img = new Image();
    img.src = profile.profile_image_url;
    img.onload = () => {
      if (active) setProfileImageLoadedUrl(profile.profile_image_url);
    };
    img.onerror = () => {
      if (active) setFailedProfileImageUrl(profile.profile_image_url);
    };

    return () => {
      active = false;
    };
  }, [profile?.profile_image_url]);

  /* Intro Screen Reveal Timing: Auto-proceeds to main card upon animation finish */
  useEffect(() => {
    if (loading) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealDelay = reducedMotion ? 80 : 2100;
    const exitDelay = reducedMotion ? 0 : 650;

    const revealTimer = window.setTimeout(() => setIntroPhase("exiting"), revealDelay);
    const finishTimer = window.setTimeout(() => setIntroPhase("done"), revealDelay + exitDelay);

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(finishTimer);
    };
  }, [loading]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!dialog) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setDialog(null);
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [dialog]);

  const featuredProducts = useMemo(
    () => products.filter((product) => product.is_featured !== false),
    [products],
  );
  const phone = profile?.phone_link || profile?.phone || "";
  const socialLinks = useMemo(() => {
    const links = (profile?.custom_links || []).filter(
      (link) => link && link.type !== "payment" && (link.label || link.url),
    );
    [
      { key: "facebook", label: "Facebook", icon: "fa-brands fa-facebook-f" },
      { key: "youtube", label: "YouTube", icon: "fa-brands fa-youtube" },
    ].forEach(({ key, label, icon }) => {
      const url = profile?.[key]?.trim();
      if (url && !links.some((link) => link.url?.trim() === url)) {
        links.push({ id: `legacy-${key}`, label, icon, url });
      }
    });
    return links;
  }, [profile]);
  const paymentLinks = (profile?.custom_links || []).filter(
    (link) => link?.type === "payment" && link.label && link.qr_image_url,
  );
  const contactUrl = profile?.custom_qr_url?.trim() || window.location.href;

  const sharePage = async () => {
    const shareData = {
      title: profile?.business || profile?.name || "Digital business card",
      text: `Connect with ${profile?.business || profile?.name || "us"}`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        setToast("Card link copied.");
      }
    } catch (error) {
      if (error?.name !== "AbortError") {
        console.error("Unable to share client card:", error);
        setToast("Sharing isn't available in this browser.");
      }
    }
  };

  const downloadContact = () => {
    if (!profile) return;
    const fullName = escapeVCard(profile.name || profile.business || "");
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${fullName}`,
      `ORG:${escapeVCard(profile.business || "")}`,
      `TITLE:${escapeVCard(profile.role || "")}`,
    ];
    if (phone) lines.push(`TEL;TYPE=CELL:${escapeVCard(phone)}`);
    if (profile.email) lines.push(`EMAIL:${escapeVCard(profile.email)}`);
    if (profile.address) lines.push(`ADR;TYPE=WORK:;;${escapeVCard(profile.address)};;;;`);
    lines.push("END:VCARD");

    const file = new Blob([lines.join("\r\n")], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(profile.name || profile.business || "contact").trim().replace(/[^\w-]+/g, "_")}.vcf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setToast("Contact downloaded.");
  };

  if (loading) {
    return (
      <main className="digipen-page">
        <div className="digipen-state" role="status">
          Preparing your business card…
        </div>
      </main>
    );
  }

  if (loadError || !profile) {
    return (
      <main className="digipen-page">
        <div className="digipen-state" role="alert">
          {loadError || "We couldn't load this business card. Please refresh and try again."}
        </div>
      </main>
    );
  }

  return (
    <>
      {/* ── Top-Right Creator Promo Badge ── */}
      <aside className="digipen-card-promo" aria-label="Create a business card">
        <span>Want a Smart NFC Business Card like this?</span>
        <a
          href="https://calling-card.web.app/"
          target="_blank"
          rel="noopener noreferrer"
        >
          Click here
          <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
        </a>
      </aside>

      {/* ── Cinematic Digipen Calligraphic Writing Intro Screen ── */}
      {introPhase !== "done" && (
        <div
          className={`digipen-intro-screen${introPhase === "exiting" ? " is-exiting" : ""}`}
          role="status"
          aria-live="polite"
          aria-label="Digipen is personalizing your digital business card"
        >
          <div className="digipen-intro-content">
            <div className="digipen-intro-card">
              <span className="digipen-intro-card-glow" aria-hidden="true" />

              {/* Digipen Smart Pen Badge */}
              <div className="digipen-badge">
                <span className="digipen-nfc-wave wave-1" aria-hidden="true" />
                <span className="digipen-nfc-wave wave-2" aria-hidden="true" />
                <span className="digipen-chip-icon" aria-hidden="true">
                  <i className="fa-solid fa-pen-nib" />
                </span>
                <span className="digipen-chip-tag">Digipen Smart NFC</span>
              </div>

              {/* Writing Canvas / Signature Pad */}
              <div className="digipen-writing-stage">
                <div className="digipen-handwritten-wrap">
                  {/* Animated Calligraphic Name Writing */}
                  <span className="digipen-handwritten-name">
                    {profile?.name || profile?.business || "Business Card"}
                  </span>
                  <span className="digipen-handwritten-underline" aria-hidden="true" />

                  {/* Precision Pen Carrier strictly synchronized with calligraphy */}
                  <div className="digipen-pen-stylus-carrier" aria-hidden="true">
                    <svg
                      className="digipen-stylus-svg"
                      viewBox="0 0 48 180"
                      width="36"
                      height="135"
                    >
                      <defs>
                        <linearGradient id="monoDigipenBarrel" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#09090b" />
                          <stop offset="35%" stopColor="#18181b" />
                          <stop offset="65%" stopColor="#27272a" />
                          <stop offset="85%" stopColor="#18181b" />
                          <stop offset="100%" stopColor="#050505" />
                        </linearGradient>
                        <linearGradient id="monoDigipenSilver" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#52525b" />
                          <stop offset="25%" stopColor="#d4d4d8" />
                          <stop offset="55%" stopColor="#ffffff" />
                          <stop offset="80%" stopColor="#d4d4d8" />
                          <stop offset="100%" stopColor="#3f3f46" />
                        </linearGradient>
                        <linearGradient id="monoDigipenSteel" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#3f3f46" />
                          <stop offset="50%" stopColor="#a1a1aa" />
                          <stop offset="100%" stopColor="#27272a" />
                        </linearGradient>
                        <filter id="monoDigipenShadow" x="-20%" y="-20%" width="150%" height="150%">
                          <feDropShadow dx="-2" dy="4" stdDeviation="3" floodColor="#000" floodOpacity="0.5" />
                        </filter>
                      </defs>

                      {/* Pen Cap Finial */}
                      <path d="M 18 4 Q 24 0 30 4 L 32 10 L 16 10 Z" fill="url(#monoDigipenSilver)" />
                      <circle cx="24" cy="5" r="1.8" fill="#ffffff" />

                      {/* Upper Barrel */}
                      <rect x="16" y="10" width="16" height="60" rx="1.5" fill="url(#monoDigipenBarrel)" />

                      {/* Silver Pocket Clip */}
                      <path d="M 29 14 L 34 18 L 34 50 L 30 52 L 29 48 Z" fill="url(#monoDigipenSilver)" filter="url(#monoDigipenShadow)" />

                      {/* Center Ring Band */}
                      <rect x="15" y="70" width="18" height="5" fill="url(#monoDigipenSilver)" />
                      <line x1="15" y1="72.5" x2="33" y2="72.5" stroke="#27272a" strokeWidth="0.5" />

                      {/* Lower Barrel */}
                      <rect x="16.5" y="75" width="15" height="42" fill="url(#monoDigipenBarrel)" />

                      {/* Tapered Grip Section */}
                      <path d="M 16.5 117 L 31.5 117 L 29 145 L 19 145 Z" fill="url(#monoDigipenSteel)" />
                      <line x1="18" y1="124" x2="30" y2="124" stroke="#18181b" strokeWidth="0.8" opacity="0.6" />
                      <line x1="18.5" y1="131" x2="29.5" y2="131" stroke="#18181b" strokeWidth="0.8" opacity="0.6" />
                      <line x1="19" y1="138" x2="29" y2="138" stroke="#18181b" strokeWidth="0.8" opacity="0.6" />

                      {/* Silver Nib Section */}
                      <path d="M 19 145 L 29 145 L 26 166 L 22 166 Z" fill="url(#monoDigipenSilver)" />

                      {/* Precision Ballpoint Tip */}
                      <path d="M 22 166 L 26 166 L 24.8 175 L 23.2 175 Z" fill="url(#monoDigipenSteel)" />
                      <circle cx="24" cy="177.5" r="1.4" fill="#ffffff" />
                    </svg>

                    {/* Point-of-Contact Ink Sparkle Bloom */}
                    <span className="digipen-contact-bloom" />
                  </div>
                </div>
              </div>

              {/* Sub-identity reveal: Business & Role */}
              <div className="digipen-intro-copy">
                {profile?.role && <p className="digipen-intro-role">{profile.role}</p>}
                {profile?.business && (
                  <span className="digipen-intro-business">
                    <i className="fa-solid fa-briefcase" /> {profile.business}
                  </span>
                )}
              </div>

              {/* Real-time Ink Loading Bar */}
              <div
                className={`digipen-intro-loader${!loading ? " is-ready" : ""}`}
                role="presentation"
              >
                <span />
              </div>

              <p className="digipen-intro-caption">
                <span className="digipen-intro-loading-dot" aria-hidden="true" />
                Writing personalized profile via Digipen...
              </p>
              <span className="digipen-intro-card-shine" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      <main className="digipen-page" aria-hidden={introPhase !== "done"}>
        <div className={`digipen-shell${introPhase === "loading" ? " is-loading" : " is-entering"}`}>
        <div className="digipen-scroll">
          <header className="digipen-portrait-row">
            <div className="digipen-portrait-frame">
              {profile.profile_image_url && failedProfileImageUrl !== profile.profile_image_url ? (
                <img
                  src={profile.profile_image_url}
                  alt={profile.name || profile.business || "Profile"}
                  style={{ objectPosition: getImageFocalInfo(profile.profile_image_url).objectPosition }}
                  onLoad={() => setProfileImageLoadedUrl(profile.profile_image_url)}
                  onError={() => setFailedProfileImageUrl(profile.profile_image_url)}
                />
              ) : (
                <span className="digipen-portrait-placeholder" aria-hidden="true">
                  <i className="fa-solid fa-user" />
                </span>
              )}
            </div>
          </header>

          <section className="digipen-identity" aria-labelledby="digipen-name">
            {profile.eyebrow && <p className="digipen-eyebrow">{profile.eyebrow}</p>}
            <h1 id="digipen-name">{profile.name || profile.business}</h1>
            <span className="digipen-rule" />
            {profile.role && <p className="digipen-role">{profile.role}</p>}
            {profile.business && <p className="digipen-business">{profile.business}</p>}
          </section>

          <nav className="digipen-quick-actions" aria-label="Quick contact">
            {phone && (
              <a href={`tel:${phone}`} aria-label={`Call ${profile.name || profile.business}`}>
                <i className="fa-solid fa-phone" aria-hidden="true" />
              </a>
            )}
            {profile.email && (
              <a href={`mailto:${profile.email}`} aria-label={`Email ${profile.name || profile.business}`}>
                <i className="fa-regular fa-envelope" aria-hidden="true" />
              </a>
            )}
            {phone && (
              <a href={`sms:${phone}`} aria-label={`Text ${profile.name || profile.business}`}>
                <i className="fa-regular fa-comment-dots" aria-hidden="true" />
              </a>
            )}
            {socialLinks.slice(0, 5).map((link, index) => {
              const href = getLinkHref(link);
              return href ? (
                <a
                  key={link.id || `${link.label}-${index}`}
                  href={href}
                  aria-label={link.label || "Social link"}
                  target={link.icon === "fa-solid fa-phone" ? undefined : "_blank"}
                  rel={link.icon === "fa-solid fa-phone" ? undefined : "noopener noreferrer"}
                >
                  <i className={link.icon || "fa-solid fa-link"} aria-hidden="true" />
                </a>
              ) : null;
            })}
            {paymentLinks.slice(0, 3).map((link, index) => (
              <button
                key={link.id || `${link.label}-${index}`}
                type="button"
                onClick={() => setDialog({ type: "payment", payment: link })}
                aria-label={`Show ${link.label} payment QR`}
              >
                <i className="fa-solid fa-qrcode" aria-hidden="true" />
              </button>
            ))}
          </nav>

          {featuredProducts.length > 0 && (
            <section className="digipen-work-section" aria-label="Featured work">
              <div className="digipen-crosshair">
                {featuredProducts[0].image_url ? (
                  <img
                    className="digipen-feature-image"
                    src={featuredProducts[0].image_url}
                    alt={featuredProducts[0].alt || featuredProducts[0].name || "Featured work"}
                    loading="lazy"
                  />
                ) : (
                  <div className="digipen-feature-placeholder">
                    <i className="fa-regular fa-image" aria-hidden="true" />
                  </div>
                )}
                <div className="digipen-feature-caption">
                  <span>{profile.business || "Featured work"}</span>
                  <h2>{featuredProducts[0].name}</h2>
                </div>
                <button
                  className="digipen-feature-open"
                  type="button"
                  onClick={() => setDialog({ type: "product", product: featuredProducts[0] })}
                  aria-label={`View ${featuredProducts[0].name}`}
                >
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                </button>
              </div>
            </section>
          )}

          {profile.description && (
            <section className="digipen-about">
              <p className="digipen-section-kicker">A little about us</p>
              <h2>{profile.business ? `About ${profile.business}` : "About me"}</h2>
              <p>{profile.description}</p>
            </section>
          )}

          {(profile.phone || profile.email || profile.address || profile.address_link) && (
            <section className="digipen-contact-card" aria-label="Contact details">
              <p className="digipen-section-kicker">Get in touch</p>
              {profile.phone && (
                <a href={`tel:${phone}`}>
                  <i className="fa-solid fa-phone" aria-hidden="true" />
                  <span><small>Call us</small>{profile.phone}</span>
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`}>
                  <i className="fa-regular fa-envelope" aria-hidden="true" />
                  <span><small>Email</small>{profile.email}</span>
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                </a>
              )}
              {(profile.address || profile.address_link) && (
                <a
                  href={profile.address_link || `https://maps.google.com/?q=${encodeURIComponent(profile.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="fa-solid fa-location-dot" aria-hidden="true" />
                  <span><small>Location</small>{profile.address || "View on map"}</span>
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                </a>
              )}
            </section>
          )}

          {featuredProducts.length > 1 && (
            <section className="digipen-services">
              <p className="digipen-section-kicker">A selection of our work</p>
              <h2>Featured services</h2>
              <div className="digipen-service-list">
                {featuredProducts.slice(1).map((product) => (
                  <button
                    className="digipen-service"
                    key={product.id || product.name}
                    type="button"
                    onClick={() => setDialog({ type: "product", product })}
                  >
                    {product.image_url ? (
                      <img src={product.image_url} alt="" loading="lazy" style={{ objectPosition: getImageFocalInfo(product.image_url).objectPosition }} />
                    ) : (
                      <span className="digipen-service-placeholder"><i className="fa-regular fa-image" /></span>
                    )}
                    <span className="digipen-service-copy">
                      <strong>{product.name}</strong>
                      {product.price && <small>{product.price}</small>}
                    </span>
                    <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="digipen-scroll-end" />
        </div>

        <nav className="digipen-bottom-bar" aria-label="Card actions">
          <div className="digipen-bottom-icons">
            <button type="button" aria-label="Show card QR code" onClick={() => setDialog({ type: "qr" })}>
              <i className="fa-solid fa-qrcode" aria-hidden="true" />
            </button>
            <button type="button" aria-label="Share card" onClick={sharePage}>
              <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden="true" />
            </button>
          </div>
          <button className="digipen-contact-cta" type="button" onClick={downloadContact}>
            <span>Add to contact</span>
            <i className="fa-solid fa-plus" aria-hidden="true" />
          </button>
        </nav>

        {dialog && (
          <div
            className="digipen-overlay"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setDialog(null);
            }}
          >
            <section
              className="digipen-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="digipen-dialog-title"
            >
              <button
                className="digipen-dialog-close"
                type="button"
                aria-label="Close"
                onClick={() => setDialog(null)}
              >
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
              {dialog.type === "qr" ? (
                <>
                  <h2 id="digipen-dialog-title">Scan to connect</h2>
                  <p>Point your phone camera to open {profile.business || profile.name}&apos;s card.</p>
                  <div className="digipen-qr-frame">
                    <QRCodeSVG value={contactUrl} size={190} level="H" includeMargin />
                  </div>
                  <span className="digipen-qr-caption">Scan with your phone camera</span>
                </>
              ) : dialog.type === "payment" ? (
                <>
                  <h2 id="digipen-dialog-title">Pay with {dialog.payment.label}</h2>
                  <p>Scan this payment QR code to continue.</p>
                  <img className="digipen-payment-qr" src={dialog.payment.qr_image_url} style={{ objectPosition: getImageFocalInfo(dialog.payment.qr_image_url).objectPosition }} alt={`${dialog.payment.label} payment QR code`} />
                  {dialog.payment.payment_url && (
                    <a className="digipen-payment-link" href={dialog.payment.payment_url} target="_blank" rel="noopener noreferrer">
                      Open payment link <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                    </a>
                  )}
                </>
              ) : (
                <>
                  <p className="digipen-section-kicker">{profile.business || "Featured work"}</p>
                  <h2 id="digipen-dialog-title">{dialog.product.name}</h2>
                  {dialog.product.image_url && (
                    <img className="digipen-product-image" src={dialog.product.image_url} alt={dialog.product.alt || dialog.product.name} />
                  )}
                  {dialog.product.price && <p className="digipen-product-price">{dialog.product.price}</p>}
                  <p>{dialog.product.description || "Contact us to learn more about this service."}</p>
                  {Array.isArray(dialog.product.gallery) && dialog.product.gallery.length > 0 && (
                    <div className="digipen-gallery">
                      {dialog.product.gallery.map((image, index) => (
                        <img key={`${image}-${index}`} src={image} alt={`${dialog.product.name} gallery ${index + 1}`} loading="lazy" />
                      ))}
                    </div>
                  )}
                  {profile.email && (
                    <a
                      className="digipen-inquire"
                      href={`mailto:${profile.email}?subject=${encodeURIComponent(`Inquiry: ${dialog.product.name}`)}`}
                    >
                      <i className="fa-regular fa-envelope" aria-hidden="true" /> Inquire
                    </a>
                  )}
                </>
              )}
            </section>
          </div>
        )}

        {toast && <div className="digipen-toast" role="status">{toast}</div>}
      </div>
    </main>
    </>
  );
}

export default Digipen;
