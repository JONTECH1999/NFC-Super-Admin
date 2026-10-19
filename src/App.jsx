import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase, supabaseUrl } from "./lib/supabase";
import { applyFavicon, applySiteTitle } from "./lib/siteSettings";

/* ── Fallback data (used until Supabase loads) ── */
const fallbackProfile = {
  name: "",
  business: "",
  role: "",
  phone: "",
  phoneLink: "",
  email: "",
  address: "",
  facebook: "",
  youtube: "",
  description: "",
  eyebrow: "",
  profile_image_url: "",
  theme_mode: (typeof window !== "undefined" && localStorage.getItem("nfc_card_theme")) || "dark",
};

const fallbackProducts = [];

/** Normalise a Supabase profiles row to the shape our UI expects. */
function normalizeProfile(row) {
  if (!row) return fallbackProfile;
  return {
    name: row.name !== undefined && row.name !== null ? row.name : fallbackProfile.name,
    business: row.business !== undefined && row.business !== null ? row.business : fallbackProfile.business,
    role: row.role !== undefined && row.role !== null ? row.role : fallbackProfile.role,
    phone: row.phone !== undefined && row.phone !== null ? row.phone : fallbackProfile.phone,
    phoneLink: row.phone_link !== undefined && row.phone_link !== null ? row.phone_link : fallbackProfile.phoneLink,
    email: row.email !== undefined && row.email !== null ? row.email : fallbackProfile.email,
    address: row.address !== undefined && row.address !== null ? row.address : fallbackProfile.address,
    address_link: row.address_link || row.addressLink || "",
    facebook: row.facebook !== undefined && row.facebook !== null ? row.facebook : fallbackProfile.facebook,
    youtube: row.youtube !== undefined && row.youtube !== null ? row.youtube : "",
    description: row.description !== undefined && row.description !== null ? row.description : fallbackProfile.description,
    eyebrow: row.eyebrow !== undefined && row.eyebrow !== null ? row.eyebrow : fallbackProfile.eyebrow,
    showcase_caption: row.showcase_caption || '',
    profile_image_url: row.profile_image_url || fallbackProfile.profile_image_url,
    site_title: row.site_title || '',
    site_icon_url: row.site_icon_url || '',
    theme_mode: row.theme_mode || 'dark',
    custom_qr_url: row.custom_qr_url || '',
    custom_links: (() => {
      try {
        if (row.custom_links) {
          return typeof row.custom_links === 'string' ? JSON.parse(row.custom_links) : row.custom_links;
        }
        const cached = localStorage.getItem('nfc_card_custom_links');
        if (cached) return JSON.parse(cached);
      } catch (e) {}
      return [];
    })(),
  };
}

/** Normalise Supabase product rows. */
function normalizeProducts(rows) {
  if (!rows || rows.length === 0) return fallbackProducts;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    image_url: r.image_url,
    alt: r.alt,
    description: r.description,
    price: r.price,
    gallery: r.gallery,
    is_featured: r.is_featured ?? true,
  }));
}

function TouchThumbLayer() {
  const [ripples, setRipples] = useState([]);

  useEffect(() => {
    function handlePointerDown(e) {
      const x = e.clientX;
      const y = e.clientY;
      if (typeof x !== "number" || typeof y !== "number") return;

      const newRipple = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        x,
        y,
      };

      setRipples((prev) => [...prev.slice(-4), newRipple]);

      setTimeout(() => {
        setRipples((prev) => prev.filter((r) => r.id !== newRipple.id));
      }, 600);
    }

    window.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  return (
    <div className="touch-thumb-layer" aria-hidden="true">
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="touch-thumb-ripple"
          style={{ left: ripple.x, top: ripple.y }}
        >
          <span className="touch-thumb-glow" />
          <span className="touch-thumb-core" />
          <span className="touch-thumb-ring" />
          <span className="touch-thumb-ring touch-thumb-ring-2" />
        </div>
      ))}
    </div>
  );
}

function ImageLightbox({
  images,
  activeIndex,
  onClose,
  onNext,
  onPrev,
  onTouchStart,
  onTouchEnd,
}) {
  if (activeIndex === null || !images || !images[activeIndex]) return null;

  return (
    <div
      className="shop-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        className="shop-lightbox-close"
        type="button"
        aria-label="Close preview"
        onClick={onClose}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>

      {images.length > 1 && (
        <div className="shop-lightbox-counter" onClick={(e) => e.stopPropagation()}>
          <span>{activeIndex + 1} / {images.length}</span>
        </div>
      )}

      {images.length > 1 && (
        <button
          className="shop-lightbox-nav shop-lightbox-prev"
          type="button"
          aria-label="Previous image"
          onClick={onPrev}
        >
          <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        </button>
      )}

      <div
        className="shop-lightbox-content"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          key={images[activeIndex]}
          src={images[activeIndex]}
          alt={`Slide ${activeIndex + 1}`}
        />
      </div>

      {images.length > 1 && (
        <button
          className="shop-lightbox-nav shop-lightbox-next"
          type="button"
          aria-label="Next image"
          onClick={onNext}
        >
          <i className="fa-solid fa-chevron-right" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}

function ProjectDetailModal({ project, profile, onClose, onOpenLightbox }) {
  if (!project) return null;

  function buildInquiryEmail() {
    const subject = encodeURIComponent(`Project Inquiry: ${project.name}`);
    const body = encodeURIComponent(
      `Hi ${profile.name},\n\nI am interested in your project/service: ${project.name}.\n\nPlease let me know more details, pricing, and availability.\n\nThank you!`
    );
    return `mailto:${profile.email || ""}?subject=${subject}&body=${body}`;
  }

  const galleryImages = Array.isArray(project.gallery) ? project.gallery : [];

  return (
    <div
      className="project-detail-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="project-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="project-detail-modal-card">
        <button
          className="project-modal-close"
          type="button"
          aria-label="Close project details"
          onClick={onClose}
        >
          <i className="fa-solid fa-xmark" aria-hidden="true" />
        </button>

        {project.image_url && (
          <div
            className="project-modal-hero"
            onClick={() => onOpenLightbox(0)}
            title="Click to view full image"
          >
            <img src={project.image_url} alt={project.alt || project.name} />
            <span className="project-modal-zoom-hint">
              <i className="fa-solid fa-expand" aria-hidden="true" /> Zoom
            </span>
          </div>
        )}

        <div className="project-modal-body">
          <p className="project-modal-eyebrow">{profile.business} • Featured Project</p>
          <h2 id="project-modal-title" className="project-modal-title">{project.name}</h2>

          {project.price && (
            <p className="project-modal-price">{project.price}</p>
          )}

          <div className="project-modal-desc-section">
            <h3>Description</h3>
            <p className="project-modal-desc">
              {project.description || "Contact us to learn more about this project and discuss your requirements."}
            </p>
          </div>

          {galleryImages.length > 0 && (
            <div className="project-modal-gallery-section">
              <h3>More photos ({galleryImages.length})</h3>
              <div className="project-modal-gallery-grid">
                {galleryImages.map((imgUrl, idx) => (
                  <div
                    key={imgUrl || idx}
                    className="project-modal-gallery-thumb"
                    onClick={() => onOpenLightbox(project.image_url ? idx + 1 : idx)}
                    title="Click to view photo"
                  >
                    <img src={imgUrl} alt={`${project.name} photo ${idx + 1}`} loading="lazy" />
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="project-modal-actions">
            <a
              className="project-modal-order-btn"
              href={buildInquiryEmail()}
            >
              <i className="fa-regular fa-envelope" aria-hidden="true" />
              <span>Inquire / Order</span>
            </a>
            <a
              className="project-modal-shop-btn"
              href="/shop"
            >
              <i className="fa-solid fa-store" aria-hidden="true" />
              <span>Visit Shop</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProductShop({ profile, products: initialProducts }) {
  const [shopProducts, setShopProducts] = useState(initialProducts);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [activeImageIndex, setActiveImageIndex] = useState(null); // index in allImages
  const touchStartX = useRef(null);

  // Compute all viewable images for the selected product (main image + gallery)
  const allImages = selectedProduct
    ? [
        ...(selectedProduct.image_url ? [selectedProduct.image_url] : []),
        ...(Array.isArray(selectedProduct.gallery) ? selectedProduct.gallery : []),
      ]
    : [];

  useEffect(() => {
    let cancelled = false;
    async function loadAllProducts() {
      try {
        const { data } = await supabase
          .from("products")
          .select("*")
          .order("sort_order");
        if (!cancelled && data && data.length > 0) setShopProducts(data);
      } catch (err) {
        console.error("Failed to load shop products:", err);
      }
    }
    loadAllProducts();
    return () => { cancelled = true; };
  }, []);

  function buildOrderEmail(productName) {
    const subject = encodeURIComponent('Order Inquiry: ' + productName);
    const body = encodeURIComponent(
      'Hi ' + profile.name + ',\n\n' +
      'I\'m interested in ordering: ' + productName + '\n\n' +
      'Here are my requirements:\n- \n\n' +
      'Please let me know the pricing and availability.\n\n' +
      'Thank you!'
    );
    return 'mailto:' + (profile.email || '') + '?subject=' + subject + '&body=' + body;
  }

  function handleOrderEmailClick(e, productName) {
    e.preventDefault();
    const mailtoUrl = buildOrderEmail(productName);
    window.location.href = mailtoUrl;
  }

  // Synchronize browser history and popstate so phone back button works step-by-step:
  // Step 3 (Image Lightbox) -> Step 2 (Product Details) -> Step 1 (Shop List) -> Main Page
  useEffect(() => {
    function handlePopState() {
      const hash = window.location.hash;
      if (hash.startsWith("#product-")) {
        // We are on a product page, close lightbox if open
        setActiveImageIndex(null);
        const productId = hash.replace("#product-", "");
        const found = shopProducts.find((p) => String(p.id || p.name) === productId);
        if (found) {
          setSelectedProduct(found);
        }
      } else {
        // Back to shop list: close both lightbox and product
        setActiveImageIndex(null);
        setSelectedProduct(null);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [shopProducts]);

  function openProduct(product) {
    setSelectedProduct(product);
    setActiveImageIndex(null);
    const productKey = encodeURIComponent(String(product.id || product.name));
    window.history.pushState({ view: "product", id: productKey }, "", `#product-${productKey}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function openLightbox(index) {
    setActiveImageIndex(index);
    const currentHash = window.location.hash || "#product";
    window.history.pushState({ view: "lightbox" }, "", `${currentHash}-image`);
  }

  function closeLightbox() {
    if (activeImageIndex !== null) {
      if (window.location.hash.endsWith("-image")) {
        window.history.back();
      } else {
        setActiveImageIndex(null);
      }
    }
  }

  function backToProducts() {
    if (window.location.hash) {
      window.history.back();
    } else {
      setSelectedProduct(null);
      setActiveImageIndex(null);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function nextImage(e) {
    if (e) e.stopPropagation();
    if (allImages.length <= 1) return;
    setActiveImageIndex((prev) => (prev + 1) % allImages.length);
  }

  function prevImage(e) {
    if (e) e.stopPropagation();
    if (allImages.length <= 1) return;
    setActiveImageIndex((prev) => (prev - 1 + allImages.length) % allImages.length);
  }

  // Handle keyboard arrows (Left / Right / Esc)
  useEffect(() => {
    if (activeImageIndex === null) return;
    function handleKeyDown(e) {
      if (e.key === "ArrowRight") nextImage();
      else if (e.key === "ArrowLeft") prevImage();
      else if (e.key === "Escape") setActiveImageIndex(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImageIndex, allImages.length]);

  // Touch Swipe Handlers for mobile gallery slide
  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) nextImage(); // Swiped left -> next
      else prevImage();         // Swiped right -> prev
    }
    touchStartX.current = null;
  }

  return (
    <main className="shop-placeholder">
      <TouchThumbLayer />
      {selectedProduct && (
        <section className="shop-product-page" aria-labelledby="shop-product-title">
          <button
            className="shop-product-back"
            type="button"
            onClick={backToProducts}
          >
            <i className="fa-solid fa-arrow-left" aria-hidden="true" />
            <span>Back to products</span>
          </button>

          <article className="shop-product-full">
            <div
              className="shop-product-full-image"
              onClick={() => openLightbox(0)}
              style={{ cursor: "pointer" }}
              title="Click to view full image"
            >
              <img
                src={selectedProduct.image_url}
                alt={selectedProduct.alt || selectedProduct.name}
              />
            </div>
            <div className="shop-product-full-content">
              <p className="layout-gallery-eyebrow">{profile.business} product</p>
              <h1 id="shop-product-title">{selectedProduct.name}</h1>
              {selectedProduct.price && (
                <p className="shop-product-full-price">{selectedProduct.price}</p>
              )}
              <div className="shop-product-full-description">
                <h2>Description</h2>
                <p>
                  {selectedProduct.description ||
                    "Contact us to learn more about this product and discuss your requirements."}
                </p>
              </div>
              <a
                className="shop-order-btn shop-product-full-order"
                href={buildOrderEmail(selectedProduct.name)}
                onClick={(e) => handleOrderEmailClick(e, selectedProduct.name)}
                aria-label={`Email to order ${selectedProduct.name}`}
              >
                <i className="fa-regular fa-envelope" aria-hidden="true" />
                <span>Email to Order</span>
              </a>
            </div>
          </article>

          {selectedProduct.gallery?.length > 0 && (
            <section className="shop-product-gallery" aria-label="Product gallery">
              <h2>More photos</h2>
              <div className="shop-product-gallery-grid">
                {selectedProduct.gallery.map((url, i) => (
                  <div
                    className="shop-product-gallery-item"
                    key={url || i}
                    onClick={() => {
                      // Main image is index 0 if it exists, so gallery starts at index 1 (or 0 if no main image)
                      const targetIdx = selectedProduct.image_url ? i + 1 : i;
                      openLightbox(targetIdx);
                    }}
                    style={{ cursor: "pointer" }}
                    title="Click to zoom image"
                  >
                    <img
                      src={url}
                      alt={`${selectedProduct.name}, photo ${i + 1}`}
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </section>
          )}
        </section>
      )}

      {/* Lightbox / Fullscreen Image Viewer Modal with Slide Features */}
      <ImageLightbox
        images={allImages}
        activeIndex={activeImageIndex}
        onClose={closeLightbox}
        onNext={nextImage}
        onPrev={prevImage}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      />

      {!selectedProduct && (
        <>
          <header className="layout-gallery-header">
            <a className="layout-gallery-back" href="/">
              <i className="fa-solid fa-arrow-left" aria-hidden="true" />
              <span>Back to business card</span>
            </a>
            <p className="layout-gallery-eyebrow">{profile.business} products &amp; services</p>
            <h1>Our Products &amp; Services</h1>
            <p className="layout-gallery-description">
              Browse our offerings below. Tap <strong>View Product</strong> for
              details or <strong>Email to Order</strong> to get in touch.
            </p>
          </header>

          <section className="shop-products-grid" aria-label="Products and services">
            {shopProducts.map((product, idx) => (
              <article className="shop-product-card" key={product.id || idx}>
                <div className="shop-product-image-wrap">
                  <img
                    src={product.image_url}
                    alt={product.alt || product.name}
                    loading="lazy"
                  />
                </div>
                <div className="shop-product-details">
                  <h2>{product.name}</h2>
                  {product.price && <p className="shop-product-price">{product.price}</p>}
                  <div className="shop-product-buttons">
                    <button
                      className="shop-view-btn"
                      type="button"
                      onClick={() => openProduct(product)}
                    >
                      <i className="fa-solid fa-eye" aria-hidden="true" />
                      <span>View Product</span>
                    </button>
                    <a
                      className="shop-order-btn"
                      href={buildOrderEmail(product.name)}
                      onClick={(e) => handleOrderEmailClick(e, product.name)}
                      aria-label={`Email to order ${product.name}`}
                    >
                      <i className="fa-regular fa-envelope" aria-hidden="true" />
                      <span>Email to Order</span>
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}

function ActionLink({ action }) {
  return (
    <a
      className={`action${action.social ? ` social social-${action.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`}
      href={action.href}
      aria-label={action.ariaLabel}
      {...(action.external
        ? { target: "_blank", rel: "noopener noreferrer" }
        : {})}
    >
      <i className={action.icon} aria-hidden="true" />
      <span>{action.label}</span>
    </a>
  );
}

function getInstallGuide() {
  const userAgent = navigator.userAgent || "";
  const isIOS =
    /iPad|iPhone|iPod/.test(userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(userAgent);
  const isSafari = /^((?!chrome|android).)*safari/i.test(userAgent);

  if (isIOS) {
    return {
      device: "ios",
      browser: "iPhone & iPad (Safari)",
      subtitle: "Install in 2 quick taps — no app store needed!",
      steps: [
        {
          num: 1,
          icon: "fa-solid fa-arrow-up-from-bracket",
          title: "Tap the Share button",
          detail: "Look at the bottom toolbar of Safari and tap the Share icon (square with arrow pointing up).",
        },
        {
          num: 2,
          icon: "fa-regular fa-square-plus",
          title: "Select 'Add to Home Screen'",
          detail: "Scroll down the menu slightly and tap 'Add to Home Screen'.",
        },
        {
          num: 3,
          icon: "fa-solid fa-check",
          title: "Tap 'Add' at the top right",
          detail: "Tap Add in the top-right corner. The app icon will appear right on your home screen!",
        },
      ],
    };
  }

  if (isAndroid) {
    return {
      device: "android",
      browser: "Android (Chrome / Samsung Internet)",
      subtitle: "Add this card directly to your home screen",
      steps: [
        {
          num: 1,
          icon: "fa-solid fa-ellipsis-vertical",
          title: "Tap the Menu button (⋮)",
          detail: "Tap the 3 dots at the top right (or bottom right in Samsung Internet).",
        },
        {
          num: 2,
          icon: "fa-solid fa-download",
          title: "Tap 'Install app' or 'Add to Home screen'",
          detail: "Select Install app or Add to Home screen from the dropdown menu.",
        },
        {
          num: 3,
          icon: "fa-solid fa-check",
          title: "Tap 'Install' or 'Add'",
          detail: "Confirm to place the card icon right on your phone's home screen alongside your apps.",
        },
      ],
    };
  }

  if (isSafari) {
    return {
      device: "mac-safari",
      browser: "Mac (Safari)",
      subtitle: "Add to your Mac Dock",
      steps: [
        {
          num: 1,
          icon: "fa-solid fa-window-maximize",
          title: "Open the File menu",
          detail: "Click File in the menu bar at the top of your screen.",
        },
        {
          num: 2,
          icon: "fa-solid fa-plus",
          title: "Choose 'Add to Dock'",
          detail: "Select Add to Dock, then confirm to launch it as a standalone app.",
        },
      ],
    };
  }

  return {
    device: "desktop",
    browser: "Computer (Chrome / Edge / Brave)",
    subtitle: "Install as a desktop application",
    steps: [
      {
        num: 1,
        icon: "fa-solid fa-download",
        title: "Click the Install icon in the address bar",
        detail: "Look for the install monitor/arrow icon on the right side of your browser URL bar.",
      },
      {
        num: 2,
        icon: "fa-solid fa-check",
        title: "Click 'Install'",
        detail: "Confirm to open this digital card in its own standalone app window.",
      },
    ],
  };
}

/** Helper to resolve the clickable map URL from profile */
function resolveMapUrl(profile) {
  if (profile.address_link && profile.address_link.trim()) {
    return profile.address_link.trim();
  }
  if (profile.address && /^https?:\/\//i.test(profile.address.trim())) {
    return profile.address.trim();
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address || "")}`;
}

/** Helper to resolve an icon class for custom social/media links if not specified */
function resolveCustomIcon(icon, label = "", url = "") {
  if (icon && icon.trim()) return icon.trim();
  const text = `${label} ${url}`.toLowerCase();
  if (text.includes("tiktok")) return "fa-brands fa-tiktok";
  if (text.includes("facebook") || text.includes("fb.")) return "fa-brands fa-facebook-f";
  if (text.includes("instagram") || text.includes("ig.")) return "fa-brands fa-instagram";
  if (text.includes("youtube")) return "fa-brands fa-youtube";
  if (text.includes("linkedin")) return "fa-brands fa-linkedin-in";
  if (text.includes("whatsapp") || text.includes("wa.me")) return "fa-brands fa-whatsapp";
  if (text.includes("telegram") || text.includes("t.me")) return "fa-brands fa-telegram";
  if (text.includes("twitter") || text.includes("x.com")) return "fa-brands fa-x-twitter";
  if (text.includes("shopee")) return "fa-solid fa-bag-shopping";
  if (text.includes("lazada")) return "fa-solid fa-cart-shopping";
  if (text.includes("viber")) return "fa-brands fa-viber";
  if (text.includes("github")) return "fa-brands fa-github";
  return "fa-solid fa-globe";
}

/** Build the action buttons array from a profile object. */
function buildActions(profile) {
  const mapUrl = resolveMapUrl(profile);
  const baseActions = [];
  const phone = profile.phoneLink || profile.phone;

  if (phone) {
    baseActions.push({
      label: "Call",
      icon: "fa-solid fa-phone",
      href: `tel:${profile.phoneLink || profile.phone}`,
      ariaLabel: `Call ${profile.name} at ${profile.phone || profile.phoneLink}`,
    });
    baseActions.push({
      label: "Text",
      icon: "fa-regular fa-comment-dots",
      href: `sms:${profile.phoneLink || profile.phone}`,
      ariaLabel: `Text ${profile.name}`,
    });
  }

  if (profile.email) {
    baseActions.push({
      label: "Email",
      icon: "fa-regular fa-envelope",
      href: `mailto:${profile.email}`,
      ariaLabel: `Email ${profile.name}`,
    });
  }

  if (profile.address || profile.address_link) {
    baseActions.push({
      label: "Location",
      icon: "fa-solid fa-location-dot",
      href: mapUrl,
      ariaLabel: `Find ${profile.business} at ${profile.address}`,
      external: true,
    });
  }

  if (profile.facebook && profile.facebook.trim()) {
    baseActions.push({
      label: "Facebook",
      icon: "fa-brands fa-facebook-f",
      href: profile.facebook,
      ariaLabel: `${profile.business} on Facebook`,
      external: true,
      social: true,
    });
  }

  // Optional YouTube action button: only shown when profile.youtube has a valid URL
  if (profile.youtube && profile.youtube.trim()) {
    baseActions.push({
      label: "YouTube",
      icon: "fa-brands fa-youtube",
      href: profile.youtube.trim().startsWith("http") ? profile.youtube.trim() : `https://${profile.youtube.trim()}`,
      ariaLabel: `${profile.business} on YouTube`,
      external: true,
      social: true,
    });
  }

  // Map any custom links (TikTok, another FB page, Instagram, LinkedIn, etc.)
  const customLinksList = Array.isArray(profile.custom_links)
    ? profile.custom_links
        .filter((item) => item && (item.label || item.url))
        .map((item) => ({
          label: item.label || "Link",
          icon: resolveCustomIcon(item.icon, item.label, item.url),
          href: item.url ? (item.url.startsWith("http") ? item.url : `https://${item.url}`) : "#",
          ariaLabel: `${item.label || "Link"} for ${profile.business}`,
          external: true,
          social: true,
        }))
    : [];

  return [...baseActions, ...customLinksList];
}

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

function getInitialProfile() {
  try {
    const cached = localStorage.getItem(PROFILE_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {}
  return fallbackProfile;
}

function getInitialProducts() {
  try {
    const cached = localStorage.getItem(PRODUCTS_CACHE_KEY);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (e) {}
  return fallbackProducts;
}

function App() {
  /* ── Supabase data ── */
  const [profile, setProfile] = useState(getInitialProfile);
  const [allProducts, setAllProducts] = useState(getInitialProducts);
  const [dataReady, setDataReady] = useState(false);

  /* Featured products for the main card, all products for the shop */
  const featuredProducts = allProducts.filter((p) => p.is_featured !== false);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      try {
        const [profileRes, productsRes] = await Promise.all([
          supabase.from("profiles").select("*").limit(1).single(),
          supabase.from("products").select("*").order("sort_order"),
        ]);

        if (cancelled) return;

        if (profileRes.data) {
          const norm = normalizeProfile(profileRes.data);
          setProfile(norm);
          try {
            localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(norm));
            localStorage.setItem("nfc_card_profile_cache", JSON.stringify(norm));
          } catch (e) {}
          if (norm.theme_mode) {
            try {
              localStorage.setItem("nfc_card_theme", norm.theme_mode);
            } catch (e) {}
          }
          if (norm.site_title) {
            try {
              localStorage.setItem("nfc_card_site_title", norm.site_title);
            } catch (e) {}
          }
          if (norm.site_icon_url) {
            try {
              localStorage.setItem("nfc_card_site_icon", norm.site_icon_url);
            } catch (e) {}
          }
          if (Array.isArray(norm.custom_links)) {
            try {
              localStorage.setItem(`nfc_card_custom_links_${CACHE_SCOPE}`, JSON.stringify(norm.custom_links));
              localStorage.setItem("nfc_card_custom_links", JSON.stringify(norm.custom_links));
            } catch (e) {}
          }
        }
        if (productsRes.data) {
          const normProds = normalizeProducts(productsRes.data);
          setAllProducts(normProds);
          try {
            localStorage.setItem(PRODUCTS_CACHE_KEY, JSON.stringify(normProds));
            localStorage.setItem("nfc_card_products_cache", JSON.stringify(normProds));
          } catch (e) {}
        }
      } catch (err) {
        console.error("Failed to load data from Supabase:", err);
      } finally {
        if (!cancelled) setDataReady(true);
      }
    }

    loadData();
    return () => { cancelled = true; };
  }, []);

  /* ── Dynamic browser tab title & favicon ── */
  useEffect(() => {
    if (profile.site_title) {
      applySiteTitle(profile.site_title, false);
    }
    if (profile.site_icon_url) {
      applyFavicon(profile.site_icon_url);
    }
  }, [profile.site_title, profile.site_icon_url]);

  const actions = buildActions(profile);

  const [introPhase, setIntroPhase] = useState("loading");
  const [tapRipple, setTapRipple] = useState(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [installPrompt, setInstallPrompt] = useState(null);
  // Active theme follows the saved profile theme, with a paired light/dark toggle.
  const baseTheme = profile.theme_mode || "dark";
  const [themeOverride, setThemeOverride] = useState(() => {
    try {
      const stored = localStorage.getItem("nfc_card_user_theme");
      const storedBase = localStorage.getItem("nfc_card_user_base");
      const currentBase = profile.theme_mode || "dark";
      if (stored && storedBase === currentBase) {
        return stored;
      }
    } catch (e) {}
    return null;
  });

  const activeTheme = themeOverride || baseTheme;
  const isLightMode = ["light", "white", "lavender"].includes(activeTheme);

  // When profile.theme_mode changes from admin, clear user override if admin changed the base
  useEffect(() => {
    try {
      const storedBase = localStorage.getItem("nfc_card_user_base");
      if (storedBase && storedBase !== baseTheme) {
        localStorage.removeItem("nfc_card_user_theme");
        localStorage.removeItem("nfc_card_user_base");
        setThemeOverride(null);
      }
    } catch (e) {}
  }, [baseTheme]);

  const toastTimer = useRef(null);
  const rippleTimer = useRef(null);
  const pageRef = useRef(null);
  const qrButton = useRef(null);
  const closeButton = useRef(null);
  const installButton = useRef(null);
  const installCloseButton = useRef(null);
  const installHelpWasOpen = useRef(false);

  /* ── Project Details Modal & Lightbox State (Main Card) ── */
  const [selectedProject, setSelectedProject] = useState(null);
  const [activeProjectImageIndex, setActiveProjectImageIndex] = useState(null);
  const projectTouchStartX = useRef(null);

  const projectImages = selectedProject
    ? [
        ...(selectedProject.image_url ? [selectedProject.image_url] : []),
        ...(Array.isArray(selectedProject.gallery) ? selectedProject.gallery : []),
      ]
    : [];

  // Synchronize browser history and popstate on Main Card:
  // Step 2 (Project Image Lightbox) -> Step 1 (Project Details Modal) -> Main Card
  useEffect(() => {
    function handleMainPopState() {
      const hash = window.location.hash;
      if (hash.startsWith("#project-")) {
        // Project modal open, lightbox closed
        setActiveProjectImageIndex(null);
        const projectId = hash.replace("#project-", "");
        const found = allProducts.find((p) => String(p.id || p.name) === projectId);
        if (found) {
          setSelectedProject(found);
        }
      } else {
        // Back to main card: close both lightbox and project modal
        setActiveProjectImageIndex(null);
        setSelectedProject(null);
      }
    }

    window.addEventListener("popstate", handleMainPopState);
    return () => window.removeEventListener("popstate", handleMainPopState);
  }, [allProducts]);

  function openProjectModal(product) {
    setSelectedProject(product);
    setActiveProjectImageIndex(null);
    const projectKey = encodeURIComponent(String(product.id || product.name));
    window.history.pushState({ view: "project", id: projectKey }, "", `#project-${projectKey}`);
  }

  function closeProjectModal() {
    if (selectedProject) {
      if (window.location.hash) {
        window.history.back();
      } else {
        setSelectedProject(null);
        setActiveProjectImageIndex(null);
      }
    }
  }

  function openProjectLightbox(index) {
    setActiveProjectImageIndex(index);
    const currentHash = window.location.hash || "#project";
    window.history.pushState({ view: "project-lightbox" }, "", `${currentHash}-image`);
  }

  function closeProjectLightbox() {
    if (activeProjectImageIndex !== null) {
      if (window.location.hash.endsWith("-image")) {
        window.history.back();
      } else {
        setActiveProjectImageIndex(null);
      }
    }
  }

  function nextProjectImage(e) {
    if (e) e.stopPropagation();
    if (projectImages.length <= 1) return;
    setActiveProjectImageIndex((prev) => (prev + 1) % projectImages.length);
  }

  function prevProjectImage(e) {
    if (e) e.stopPropagation();
    if (projectImages.length <= 1) return;
    setActiveProjectImageIndex((prev) => (prev - 1 + projectImages.length) % projectImages.length);
  }

  function handleProjectTouchStart(e) {
    projectTouchStartX.current = e.touches[0].clientX;
  }

  function handleProjectTouchEnd(e) {
    if (projectTouchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - projectTouchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) nextProjectImage();
      else prevProjectImage();
    }
    projectTouchStartX.current = null;
  }

  useEffect(() => {
    if (activeProjectImageIndex === null) return;
    function handleKeyDown(e) {
      if (e.key === "ArrowRight") nextProjectImage();
      else if (e.key === "ArrowLeft") prevProjectImage();
      else if (e.key === "Escape") setActiveProjectImageIndex(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeProjectImageIndex, projectImages.length]);

  useEffect(() => {
    if (!selectedProject || activeProjectImageIndex !== null) return;
    function handleKeyDown(e) {
      if (e.key === "Escape") setSelectedProject(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProject, activeProjectImageIndex]);

  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", activeTheme);
    if (document.body) {
      document.body.setAttribute("data-theme", activeTheme);
    }
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      const colors = {
        light: "#f4f0e8",
        white: "#ffffff",
        lavender: "#f2effa",
        red: "#120406",
        blue: "#040a18",
        emerald: "#03140e",
        dark: "#000000",
      };
      metaTheme.setAttribute("content", colors[activeTheme] || "#000000");
    }
  }, [activeTheme]);

  function toggleTheme() {
    let nextTheme;
    if (baseTheme === "light") {
      // Warm Beige is light mode; dark mode is Pitch Black
      nextTheme = activeTheme === "light" ? "dark" : "light";
    } else if (baseTheme === "white" || baseTheme === "lavender") {
      // Pure White and Soft Lavender are light modes; dark mode is Pitch Black
      nextTheme = activeTheme === baseTheme ? "dark" : baseTheme;
    } else {
      // Green (emerald), Blue (blue), Red (red), Pitch Black (dark):
      // Dark mode is the base theme; Light mode is Pure White
      nextTheme = activeTheme === "white" ? baseTheme : "white";
    }
    setThemeOverride(nextTheme);
    try {
      localStorage.setItem("nfc_card_user_theme", nextTheme);
      localStorage.setItem("nfc_card_user_base", baseTheme);
    } catch (e) {}
  }

  useEffect(() => {
    if (pageRef.current) pageRef.current.inert = introPhase !== "done";
  }, [introPhase]);

  useEffect(() => {
    // Check if early event was already captured in index.html
    if (window.deferredInstallPrompt) {
      setInstallPrompt(window.deferredInstallPrompt);
    }

    function handleInstallAvailable(event) {
      event.preventDefault();
      window.deferredInstallPrompt = event;
      setInstallPrompt(event);
    }

    function handleAppInstalled() {
      window.deferredInstallPrompt = null;
      setInstallPrompt(null);
      setInstallHelpOpen(false);
      showToast(`${profile.business} was added to your apps.`);
    }

    function handleAppInstallReady() {
      if (window.deferredInstallPrompt) {
        setInstallPrompt(window.deferredInstallPrompt);
      }
    }

    window.addEventListener("beforeinstallprompt", handleInstallAvailable);
    window.addEventListener("appinstalled", handleAppInstalled);
    window.addEventListener("app-install-ready", handleAppInstallReady);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleInstallAvailable);
      window.removeEventListener("appinstalled", handleAppInstalled);
      window.removeEventListener("app-install-ready", handleAppInstallReady);
    };
  }, [profile.business]);

  useEffect(() => {
    // Only begin exiting the intro screen once the latest data is ready from Supabase
    if (!dataReady) return undefined;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const revealDelay = reducedMotion ? 80 : 1050;
    const exitDelay = reducedMotion ? 0 : 550;
    const revealTimer = window.setTimeout(
      () => setIntroPhase("exiting"),
      revealDelay,
    );
    const finishTimer = window.setTimeout(
      () => setIntroPhase("done"),
      revealDelay + exitDelay,
    );

    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(finishTimer);
      window.clearTimeout(toastTimer.current);
      window.clearTimeout(rippleTimer.current);
    };
  }, [dataReady]);

  useEffect(() => {
    if (qrOpen) closeButton.current?.focus();
  }, [qrOpen]);

  useEffect(() => {
    if (installHelpOpen) {
      installHelpWasOpen.current = true;
      installCloseButton.current?.focus();
    } else if (installHelpWasOpen.current) {
      installHelpWasOpen.current = false;
      installButton.current?.focus();
    }
  }, [installHelpOpen]);

  const installGuide = getInstallGuide();

  function showToast(message) {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3200);
  }

  function closeQR() {
    setQrOpen(false);
    window.requestAnimationFrame(() => qrButton.current?.focus());
  }

  function closeInstallHelp() {
    setInstallHelpOpen(false);
  }

  function animateCardTap(event) {
    if (
      event.target instanceof Element &&
      event.target.closest("a, button")
    ) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const ripple = {
      id: Date.now(),
      x: event.clientX - bounds.left,
      y: event.clientY - bounds.top,
    };
    setTapRipple(ripple);
    window.clearTimeout(rippleTimer.current);
    rippleTimer.current = window.setTimeout(() => setTapRipple(null), 850);
  }

  async function shareCard() {
    const shareData = {
      title: `${profile.name} | ${profile.business}`,
      text: `Connect with ${profile.name}, ${profile.role} at ${profile.business}.`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(window.location.href);
        showToast("Business card link copied.");
      } else {
        const input = document.createElement("textarea");
        input.value = window.location.href;
        input.setAttribute("readonly", "");
        input.style.position = "fixed";
        input.style.opacity = "0";
        document.body.appendChild(input);
        input.select();
        const copied = document.execCommand("copy");
        input.remove();
        if (!copied) throw new Error("The browser did not copy the link.");
        showToast("Business card link copied.");
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        console.error("Unable to share business card:", error);
        showToast(
          "Unable to share the link. Please copy it from your browser address bar.",
        );
      }
    }
  }

  function downloadContact() {
    const escapeVCardValue = (value) =>
      String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\r?\n/g, "\\n")
        .replace(/([,;])/g, "\\$1");
    const phone = profile.phoneLink || profile.phone;
    const fields = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${escapeVCardValue(profile.name)}`,
      profile.business && `ORG:${escapeVCardValue(profile.business)}`,
      profile.role && `TITLE:${escapeVCardValue(profile.role)}`,
      phone && `TEL;TYPE=CELL:${escapeVCardValue(phone)}`,
      profile.email && `EMAIL:${escapeVCardValue(profile.email)}`,
      profile.address && `ADR;TYPE=WORK:;;${escapeVCardValue(profile.address)};;;;`,
      `URL:${escapeVCardValue(window.location.href)}`,
      "END:VCARD",
    ].filter(Boolean);
    const blob = new Blob([fields.join("\r\n")], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = (profile.name || profile.business || "business-contact")
      .trim()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_|_$/g, "");
    link.href = url;
    link.download = `${filename || "business-contact"}.vcf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast("Contact saved to your device.");
  }

  async function installCard() {
    const isInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true;

    if (isInstalled) {
      showToast(`${profile.business} is already open as an app.`);
      return;
    }

    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (outcome === "accepted") {
          showToast(`${profile.business} was added to your apps.`);
        } else {
          setInstallHelpOpen(true);
        }
      } catch (error) {
        console.error("Unable to install:", error);
        setInstallHelpOpen(true);
      }
      return;
    }

    setInstallHelpOpen(true);
  }

  useEffect(() => {
    if (!qrOpen && !installHelpOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        if (installHelpOpen) closeInstallHelp();
        else closeQR();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [qrOpen, installHelpOpen]);

  if (window.location.pathname.replace(/\/+$/, "") === "/shop") {
    return <ProductShop profile={profile} products={allProducts} />;
  }

  return (
    <>
      {introPhase !== "done" && (
        <div
          className={`intro-screen${introPhase === "exiting" ? " is-exiting" : ""}`}
          role="status"
          aria-live="polite"
          aria-label="Preparing your introduction"
        >
          <div className="intro-content">
            <div className="intro-card">
              <span className="intro-card-glow" aria-hidden="true" />
              <div className="intro-emblem">
                <span className="intro-orbit intro-orbit-one" />
                <span className="intro-orbit intro-orbit-two" />
                <span className="intro-emblem-core">
                  {profile.profile_image_url ? (
                    <img src={profile.profile_image_url} alt="" />
                  ) : (
                    <i className="fa-solid fa-user-tie" aria-hidden="true" />
                  )}
                </span>
                <span className="intro-contact-icon intro-contact-phone" aria-hidden="true">
                  <i className="fa-solid fa-phone" />
                </span>
                <span className="intro-contact-icon intro-contact-message" aria-hidden="true">
                  <i className="fa-solid fa-comment-dots" />
                </span>
                <span className="intro-contact-icon intro-contact-email" aria-hidden="true">
                  <i className="fa-solid fa-envelope" />
                </span>
                <span className="intro-contact-icon intro-contact-location" aria-hidden="true">
                  <i className="fa-solid fa-location-dot" />
                </span>
              </div>
              <div className="intro-copy">
                <span className="intro-business">
                  <i className="fa-solid fa-id-card" aria-hidden="true" />
                  {profile.business}
                </span>
                {profile.eyebrow && <p className="intro-eyebrow">{profile.eyebrow}</p>}
                <h1 className="intro-brand">{profile.name}</h1>
                {profile.role && <p className="intro-role">{profile.role}</p>}
              </div>
              <div className="intro-loader" role="presentation">
                <span />
              </div>
              <p className="intro-caption">
                <span className="intro-loading-dot" aria-hidden="true" />
                Preparing your introduction
              </p>
              <span className="intro-card-shine" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      <main
        ref={pageRef}
        className="page"
        aria-hidden={introPhase !== "done"}
      >
        <article
          className={`business-card${introPhase === "loading" ? " is-loading" : " is-entering"}${tapRipple ? " is-tapped" : ""}`}
          aria-labelledby="person-name"
          onClick={animateCardTap}
        >
          {tapRipple && (
            <>
              <span
                key={`sweep-${tapRipple.id}`}
                className="card-light-sweep"
                aria-hidden="true"
              />
              <span
                key={`ripple-${tapRipple.id}`}
                className="card-ripple"
                style={{ left: tapRipple.x, top: tapRipple.y }}
                aria-hidden="true"
              />
            </>
          )}
          <header className="app-status-bar" aria-label="Card controls">
            <span className="status-brand">{profile.business}</span>
            <button
              className="status-theme-button"
              type="button"
              onClick={toggleTheme}
              aria-label={
                isLightMode
                  ? "Switch to dark mode"
                  : "Switch to light mode"
              }
              title={
                isLightMode
                  ? (["light", "white", "lavender"].includes(baseTheme) ? "Switch to Pitch Black" : `Switch to ${baseTheme} mode`)
                  : "Switch to light mode"
              }
            >
              <i
                className={
                  isLightMode ? "fa-solid fa-moon" : "fa-solid fa-sun"
                }
                aria-hidden="true"
              />
            </button>
          </header>

          <section className="profile-panel" aria-label="Business owner profile">
            <div className="profile-halo" aria-hidden="true" />
            {profile.profile_image_url ? (
              <img
                className="profile-photo"
                src={profile.profile_image_url}
                alt={`Portrait of ${profile.name}`}
                onError={(event) => {
                  event.currentTarget.hidden = true;
                }}
              />
            ) : (
              <div className="profile-photo-placeholder" aria-hidden="true">
                <i className="fa-solid fa-user" />
              </div>
            )}
          </section>

          <section className="details-panel" aria-label="Business information">
            <section className="profile-summary-card" aria-labelledby="person-name">
              <div className="profile-copy">
                {profile.eyebrow && <p className="eyebrow">{profile.eyebrow}</p>}
                <h1 id="person-name">{profile.name}</h1>
                {profile.role && <p className="role">{profile.role}</p>}
                {profile.business && (
                  <div className="company-name">
                    <i className="fa-solid fa-id-card" aria-hidden="true" />
                    <span>{profile.business}</span>
                  </div>
                )}
              </div>

              <nav className="profile-quick-actions" aria-label="Quick contact actions">
                {actions.filter((action) => ["Call", "Text", "Email"].includes(action.label)).map((action) => (
                  <ActionLink action={action} key={action.label} />
                ))}
                <button
                  className="action"
                  type="button"
                  aria-label="Share this business card"
                  onClick={shareCard}
                >
                  <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden="true" />
                  <span>Share</span>
                </button>
              </nav>

              <button
                className="save-contact-button"
                type="button"
                onClick={downloadContact}
              >
                <i className="fa-solid fa-id-card" aria-hidden="true" />
                <span>Save contact</span>
              </button>

              <div className="profile-utility-actions">
                <button
                  className="profile-utility-button"
                  ref={installButton}
                  type="button"
                  aria-label={`Install ${profile.business}`}
                  onClick={installCard}
                >
                  <i className="fa-solid fa-download" aria-hidden="true" />
                  <span>Install card</span>
                </button>
                <button
                  className="profile-utility-button"
                  ref={qrButton}
                  type="button"
                  aria-label="Show QR code for this business card"
                  onClick={() => setQrOpen(true)}
                >
                  <i className="fa-solid fa-qrcode" aria-hidden="true" />
                  <span>QR code</span>
                </button>
              </div>
            </section>

            {actions.some((action) => action.social && action.href && action.href !== "#") && (
              <section className="social-section" aria-labelledby="social-heading">
                <div className="content-card-heading">
                  <div>
                    <p className="section-kicker">Find us online</p>
                    <h2 id="social-heading">Connect with us</h2>
                  </div>
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                </div>
                <nav className="social-grid" aria-label="Social media links">
                  {actions
                    .filter((action) => action.social && action.href && action.href !== "#")
                    .map((action) => (
                      <ActionLink action={action} key={action.label} />
                    ))}
                </nav>
              </section>
            )}

            {(profile.description || profile.phone || profile.email || profile.address) && (
              <section className="showcase-frame" aria-labelledby="showcase-heading">
                {featuredProducts[0]?.image_url && (
                  <div className="showcase-image">
                    <img
                      src={featuredProducts[0].image_url}
                      alt={featuredProducts[0]?.alt || "Featured work"}
                      loading="lazy"
                    />
                    <span>
                      {profile.showcase_caption && profile.showcase_caption.trim()
                        ? profile.showcase_caption.trim()
                        : (profile.business || "Featured work")}
                    </span>
                  </div>
                )}
                <h2 id="showcase-heading">{profile.business ? `About ${profile.business}` : "About us"}</h2>
                {profile.description && <p className="description">{profile.description}</p>}
                <div className="contact-list" aria-label="Direct contact details">
                  {profile.phone && (
                    <a href={`tel:${profile.phoneLink || profile.phone}`}>
                      <i className="fa-solid fa-phone" aria-hidden="true" />
                      <span><small>Direct call</small>{profile.phone}</span>
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
                      href={resolveMapUrl(profile)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <i className="fa-solid fa-location-dot" aria-hidden="true" />
                      <span><small>Business location</small>{profile.address || "View location"}</span>
                      <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                    </a>
                  )}
                </div>
              </section>
            )}

            {featuredProducts.length > 0 && (
              <section className="product-section" aria-labelledby="products-heading">
                <div className="product-heading">
                  <div>
                    <p className="product-kicker">A selection of our work</p>
                    <h2 id="products-heading">Featured services</h2>
                  </div>
                  <span className="product-heading-icon" aria-hidden="true">
                    <i className="fa-solid fa-sparkles" />
                  </span>
                </div>
                <div className="products-grid">
                  {featuredProducts.map((product) => (
                    <article
                      className="product-card"
                      key={product.id || product.name}
                      onClick={() => openProjectModal(product)}
                      role="button"
                      tabIndex={0}
                      aria-label={`View full details of ${product.name}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openProjectModal(product);
                        }
                      }}
                    >
                      <div className="product-card-info">
                        <h3>{product.name}</h3>
                        {product.price && (
                          <span className="product-card-badge">{product.price}</span>
                        )}
                      </div>
                      <img
                        className="product-image"
                        src={product.image_url}
                        alt={product.alt || product.name}
                        loading="lazy"
                      />
                    </article>
                  ))}
                </div>
              </section>
            )}
          </section>

          <nav className="bottom-nav" aria-label="Card actions">
            <button
              className="bottom-nav-icon"
              type="button"
              aria-label="Share this business card"
              onClick={shareCard}
            >
              <i className="fa-solid fa-arrow-up-from-bracket" aria-hidden="true" />
            </button>
            <a
              className="contact-button"
              href="/shop"
              aria-label="Visit the shop"
            >
              <span>Visit Shop</span>
              <span className="contact-button-icon">
                <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
              </span>
            </a>
          </nav>

        </article>
      </main>

      {installHelpOpen && (
        <div
          className="modal"
          role="presentation"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeInstallHelp();
          }}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInstallHelp();
          }}
        >
          <section
            className="modal-card install-guide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
          >
            <button
              className="modal-close"
              ref={installCloseButton}
              type="button"
              aria-label="Close install instructions"
              onClick={closeInstallHelp}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
            <div className="install-guide-icon" aria-hidden="true">
              <i className="fa-solid fa-mobile-screen-button" />
            </div>
            <h2 id="install-title">Install {profile.business}</h2>
            <p className="install-guide-sub">
              {installGuide.subtitle}
            </p>

            <div className="install-device-badge">
              <i className={installGuide.device === "ios" ? "fa-brands fa-apple" : installGuide.device === "android" ? "fa-brands fa-android" : "fa-solid fa-desktop"} aria-hidden="true" />
              <span>{installGuide.browser}</span>
            </div>

            <div className="install-steps-container">
              {installGuide.steps.map((step) => (
                <div className="install-step-card" key={step.num}>
                  <div className="install-step-num">{step.num}</div>
                  <div className="install-step-content">
                    <div className="install-step-title">
                      <i className={step.icon} aria-hidden="true" />
                      <strong>{step.title}</strong>
                    </div>
                    <p className="install-step-detail">{step.detail}</p>
                  </div>
                </div>
              ))}
            </div>

            {installGuide.device === "ios" && (
              <div className="install-safari-arrow-tip">
                <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                <span>Tap the Share icon at the bottom of your screen to start</span>
              </div>
            )}

            <button
              className="install-guide-done"
              type="button"
              onClick={closeInstallHelp}
            >
              Got it, let's do it!
            </button>
          </section>
        </div>
      )}

      {qrOpen && (
        <div
          className="modal"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeQR();
          }}
        >
          <section
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qr-title"
          >
            <button
              className="modal-close"
              ref={closeButton}
              type="button"
              aria-label="Close QR code"
              onClick={closeQR}
            >
              <i className="fa-solid fa-xmark" aria-hidden="true" />
            </button>
            <h2 id="qr-title">Scan to connect</h2>
            <p>Point your phone camera to instantly open {profile.business}&apos;s digital card.</p>

            {/* Permanent QR Code Frame */}
            <div className="qr-frame" id="permanent-qr-container">
              <QRCodeSVG
                id="permanent-card-qr"
                value={
                  profile.custom_qr_url && profile.custom_qr_url.trim()
                    ? profile.custom_qr_url.trim()
                    : window.location.origin
                }
                size={180}
                fgColor="#000000"
                bgColor="#ffffff"
                level="H"
                includeMargin
              />
            </div>

            <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              <div style={{
                fontSize: '0.74rem',
                color: 'var(--screen-muted)',
                background: 'rgba(255, 255, 255, 0.05)',
                padding: '6px 12px',
                borderRadius: 8,
                wordBreak: 'break-all',
                fontFamily: 'monospace'
              }}>
                {profile.custom_qr_url && profile.custom_qr_url.trim()
                  ? profile.custom_qr_url.trim()
                  : window.location.origin}
              </div>

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--screen-control)',
                    border: '1px solid var(--screen-control-border)',
                    color: 'var(--screen-text)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                  onClick={() => {
                    const svg = document.getElementById('permanent-card-qr');
                    if (!svg) return;
                    const svgData = new XMLSerializer().serializeToString(svg);
                    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                    const svgUrl = URL.createObjectURL(svgBlob);
                    const downloadLink = document.createElement('a');
                    downloadLink.href = svgUrl;
                    downloadLink.download = `${profile.business.replace(/\s+/g, '-').toLowerCase()}-qr-code.svg`;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                    URL.revokeObjectURL(svgUrl);
                    showToast('QR Code downloaded!');
                  }}
                >
                  <i className="fa-solid fa-download" aria-hidden="true" />
                  <span>Download QR</span>
                </button>

                <button
                  type="button"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: 'var(--screen-control)',
                    border: '1px solid var(--screen-control-border)',
                    color: 'var(--screen-text)',
                    fontSize: '0.78rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6
                  }}
                  onClick={() => {
                    const targetUrl = profile.custom_qr_url && profile.custom_qr_url.trim()
                      ? profile.custom_qr_url.trim()
                      : window.location.origin;
                    navigator.clipboard.writeText(targetUrl);
                    showToast('Card link copied to clipboard!');
                  }}
                >
                  <i className="fa-regular fa-copy" aria-hidden="true" />
                  <span>Copy Link</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {/* Full Project Details Modal */}
      {selectedProject && (
        <ProjectDetailModal
          project={selectedProject}
          profile={profile}
          onClose={closeProjectModal}
          onOpenLightbox={(idx) => openProjectLightbox(idx)}
        />
      )}

      {/* Lightbox / Fullscreen Image Viewer Modal with Slide Features for Project */}
      {activeProjectImageIndex !== null && projectImages.length > 0 && (
        <ImageLightbox
          images={projectImages}
          activeIndex={activeProjectImageIndex}
          onClose={closeProjectLightbox}
          onNext={nextProjectImage}
          onPrev={prevProjectImage}
          onTouchStart={handleProjectTouchStart}
          onTouchEnd={handleProjectTouchEnd}
        />
      )}

      {/* Super Good Touch Thumb Feedback Layer */}
      <TouchThumbLayer />

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </>
  );
}

export default App;
