import { getImageFocalInfo } from "./lib/imageFocalPoint";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { profilesTable, productsTable, siteId, supabase } from "./lib/supabase";
import { applyFavicon, applySiteTitle } from "./lib/siteSettings";
import "./i_2_Soft Neumorphic Ivory.css";

function parseLinks(value) {
  try {
    const result = typeof value === "string" ? JSON.parse(value) : value;
    return Array.isArray(result) ? result : [];
  } catch (error) {
    console.error("Unable to parse client links:", error);
    return [];
  }
}

function escapeVCard(value = "") {
  return String(value)
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/([,;])/g, "\\$1");
}

function socialHref(link) {
  const destination = (link.url || "").trim();
  if (link.icon === "fa-solid fa-phone") {
    const number = destination.replace(/^tel:/i, "").replace(/[^\d+]/g, "");
    return number ? `tel:${number}` : "";
  }
  if (!destination) return "";
  return /^(https?:|mailto:|sms:|tel:)/i.test(destination)
    ? destination
    : `https://${destination}`;
}

function resolveCustomIcon(icon, label = "", url = "") {
  if (icon && icon.trim()) return icon.trim();
  const text = `${label} ${url}`.toLowerCase();
  if (text.includes("tiktok")) return "fa-brands fa-tiktok";
  if (text.includes("messenger") || text.includes("m.me")) return "fa-brands fa-facebook-messenger";
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

/* ✦ Ripple Layer on Touch/Click across screen ✦ */
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
    <div className="ivory-touch-layer" aria-hidden="true">
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="ivory-touch-ripple"
          style={{ left: ripple.x, top: ripple.y }}
        >
          <span className="ivory-touch-glow" />
          <span className="ivory-touch-core" />
          <span className="ivory-touch-ring" />
          <span className="ivory-touch-ring ivory-touch-ring-2" />
        </div>
      ))}
    </div>
  );
}

/* ✦ Fullscreen Image Lightbox with Touch Swiping and Keyboard Controls ✦ */
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
      className="ivory-lightbox-overlay"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <button
        className="ivory-lightbox-close"
        type="button"
        aria-label="Close preview"
        onClick={onClose}
      >
        <i className="fa-solid fa-xmark" aria-hidden="true" />
      </button>

      {images.length > 1 && (
        <div className="ivory-lightbox-counter" onClick={(e) => e.stopPropagation()}>
          <span>{activeIndex + 1} / {images.length}</span>
        </div>
      )}

      {images.length > 1 && (
        <button
          className="ivory-lightbox-nav ivory-lightbox-prev"
          type="button"
          aria-label="Previous image"
          onClick={onPrev}
        >
          <i className="fa-solid fa-chevron-left" aria-hidden="true" />
        </button>
      )}

      <div
        className="ivory-lightbox-content"
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
          className="ivory-lightbox-nav ivory-lightbox-next"
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

function IvoryAction({ icon, label, href, external, onClick, className = "" }) {
  const content = (
    <>
      <span className="ivory-action-icon"><i className={icon} aria-hidden="true" /></span>
      <span className="ivory-action-label">{label}</span>
    </>
  );

  if (onClick) {
    return (
      <button className={`ivory-action ${className}`} type="button" onClick={onClick}>
        {content}
      </button>
    );
  }
  if (!href) return null;
  return (
    <a
      className={`ivory-action ${className}`}
      href={href}
      target={external ? "_blank" : undefined}
      rel={external ? "noopener noreferrer" : undefined}
    >
      {content}
    </a>
  );
}

function SoftNeumorphicIvory() {
  const [profile, setProfile] = useState(null);
  const [products, setProducts] = useState([]);
  const [dataReady, setDataReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [productsError, setProductsError] = useState("");
  const [aboutOpen, setAboutOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState("");

  /* Intro Screen State */
  const [introPhase, setIntroPhase] = useState("loading");
  const [isWritingReady, setIsWritingReady] = useState(false);
  const [profileImageLoadedUrl, setProfileImageLoadedUrl] = useState("");
  const [failedProfileImageUrl, setFailedProfileImageUrl] = useState("");
  const profileImageReady =
    !profile?.profile_image_url ||
    profileImageLoadedUrl === profile.profile_image_url ||
    failedProfileImageUrl === profile.profile_image_url;

  /* Card Tap Ripple */
  const [tapRipple, setTapRipple] = useState(null);
  const rippleTimer = useRef(null);

  /* PWA Install */
  const [installPrompt, setInstallPrompt] = useState(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);

  /* Action Hints Pulse */
  const actionHintTimer = useRef(null);
  const actionHintsStopped = useRef(false);
  const pageRef = useRef(null);

  /* Lightbox State for Dialog Product Images */
  const [activeImageIndex, setActiveImageIndex] = useState(null);
  const touchStartX = useRef(null);

  useLayoutEffect(() => {
    window.history.scrollRestoration = "manual";
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const [profileResult, productsResult] = await Promise.all([
          supabase.from(profilesTable).select("*").eq("site_id", siteId).single(),
          supabase.from(productsTable).select("*").eq("site_id", siteId).order("sort_order"),
        ]);
        if (profileResult.error) throw profileResult.error;
        if (cancelled) return;

        const data = profileResult.data;
        setProfile({ ...data, custom_links: parseLinks(data.custom_links) });
        if (data.site_title) applySiteTitle(data.site_title, false);
        if (data.site_icon_url) applyFavicon(data.site_icon_url);
        if (productsResult.error) {
          console.error("Unable to load Soft Neumorphic Ivory products:", productsResult.error);
          setProductsError("Featured products are temporarily unavailable.");
        } else {
          setProducts((productsResult.data || []).filter((product) => product.is_featured !== false));
        }
        setDataReady(true);
      } catch (loadError) {
        if (!cancelled) {
          console.error("Unable to load Soft Neumorphic Ivory profile:", loadError);
          setErrorMessage("We couldn't load this business card. Please refresh and try again.");
          setDataReady(true);
        }
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  /* PWA Install Prompt Listener */
  useEffect(() => {
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
      showToast(`${profile?.business || "Card"} was added to your apps.`);
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
  }, [profile?.business]);

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

  /* Distinct 3-Stage Cinematic Intro:
     1. Stage 1 (0ms - 850ms): Loading bar fills up & Digipen NFC chip verifies
     2. Stage 2 (850ms - 2500ms): Digipen glides down and writes name on screen
     3. Stage 3 (2500ms+): Seamlessly reveals main profile card
  */
  useEffect(() => {
    if (!dataReady) return;
    let active = true;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setIntroPhase("done");
      return;
    }

    const fontPromise = (document.fonts && document.fonts.ready)
      ? document.fonts.ready
      : Promise.resolve();

    fontPromise.then(() => {
      if (!active) return;
      // Stage 1: Give 850ms for initial loading progress bar to sweep and verify
      const writingTimer = window.setTimeout(() => {
        if (!active) return;
        setIsWritingReady(true);
      }, 850);

      // Stage 2: Digipen finishes writing (850ms + 1650ms = 2500ms)
      const exitTimer = window.setTimeout(() => {
        if (!active) return;
        setIntroPhase("exiting");
      }, 2550);

      // Stage 3: Smooth reveal of main card
      const finishTimer = window.setTimeout(() => {
        if (!active) return;
        setIntroPhase("done");
      }, 3150);

      return () => {
        window.clearTimeout(writingTimer);
        window.clearTimeout(exitTimer);
        window.clearTimeout(finishTimer);
      };
    });

    return () => {
      active = false;
      window.clearTimeout(rippleTimer.current);
    };
  }, [dataReady]);

  /* Interactive Action Pulse Hints */
  useEffect(() => {
    const stopActionHints = () => {
      actionHintsStopped.current = true;
      window.clearTimeout(actionHintTimer.current);
      pageRef.current?.querySelectorAll(".is-action-hint-active").forEach((element) => {
        element.classList.remove("is-action-hint-active");
      });
    };
    const interactionEvents = ["pointerdown", "touchstart", "keydown", "wheel", "click"];

    interactionEvents.forEach((eventName) => {
      window.addEventListener(eventName, stopActionHints, { capture: true, passive: true });
    });

    return () => {
      interactionEvents.forEach((eventName) => {
        window.removeEventListener(eventName, stopActionHints, { capture: true });
      });
    };
  }, []);

  useEffect(() => {
    if (introPhase !== "done" || actionHintsStopped.current) return undefined;

    const container = pageRef.current;
    if (!container || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const prioritySelectors = [
      ".ivory-quick-actions .ivory-action",
      ".ivory-utility-actions .ivory-action",
      ".ivory-social-actions .ivory-action",
      ".ivory-payment-actions .ivory-action",
      ".ivory-about-toggle",
      ".ivory-product",
    ];
    const targets = prioritySelectors
      .flatMap((selector) => Array.from(container.querySelectorAll(selector)))
      .filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          element.getClientRects().length > 0 &&
          style.visibility !== "hidden" &&
          !element.closest('[aria-hidden="true"], [hidden], [inert]')
        );
      });

    if (targets.length === 0) return undefined;

    let activeTarget = null;
    let index = 0;
    const pulseNextTarget = () => {
      if (actionHintsStopped.current) return;
      activeTarget?.classList.remove("is-action-hint-active");
      activeTarget = targets[index];
      activeTarget.classList.add("is-action-hint-active");
      index = (index + 1) % targets.length;
      actionHintTimer.current = window.setTimeout(pulseNextTarget, 950);
    };

    pulseNextTarget();
    return () => {
      window.clearTimeout(actionHintTimer.current);
      activeTarget?.classList.remove("is-action-hint-active");
    };
  }, [introPhase]);

  function showToast(message) {
    setToast(message);
    window.clearTimeout(rippleTimer.current);
    rippleTimer.current = window.setTimeout(() => setToast(""), 3200);
  }

  // Escape key for dialogs
  useEffect(() => {
    if (!dialog && !installHelpOpen && activeImageIndex === null) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        if (activeImageIndex !== null) setActiveImageIndex(null);
        else if (installHelpOpen) setInstallHelpOpen(false);
        else setDialog(null);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [dialog, installHelpOpen, activeImageIndex]);

  /* Hash sync for product dialog / back button handling */
  useEffect(() => {
    function handlePopState() {
      const hash = window.location.hash;
      if (hash.startsWith("#product-")) {
        setActiveImageIndex(null);
        const productId = hash.replace("#product-", "");
        const found = products.find((p) => String(p.id || p.name) === productId);
        if (found) {
          setDialog({ type: "product", product: found });
        }
      } else {
        setActiveImageIndex(null);
        setDialog(null);
      }
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [products]);

  function openProductDialog(product) {
    setDialog({ type: "product", product });
    setActiveImageIndex(null);
    const productKey = encodeURIComponent(String(product.id || product.name));
    window.history.pushState({ view: "product", id: productKey }, "", `#product-${productKey}`);
  }

  function closeDialog() {
    if (window.location.hash) {
      window.history.back();
    } else {
      setDialog(null);
      setActiveImageIndex(null);
    }
  }

  /* Card tap animation */
  function animateCardTap(event) {
    if (event.target instanceof Element && event.target.closest("a, button, input, [role='button']")) {
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

  /* Web Share API */
  async function shareCard() {
    const shareData = {
      title: `${profile?.name || "Business Card"} | ${profile?.business || ""}`,
      text: `Connect with ${profile?.name || "us"}, ${profile?.role || ""} at ${profile?.business || ""}.`,
      url: window.location.href,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(window.location.href);
        showToast("Business card link copied to clipboard.");
      } else {
        const input = document.createElement("textarea");
        input.value = window.location.href;
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
        showToast("Business card link copied to clipboard.");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("Share failed:", err);
      }
    }
  }

  /* Install PWA */
  async function installCard() {
    const isInstalled =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true;

    if (isInstalled) {
      showToast(`${profile?.business || "Card"} is already open as an app.`);
      return;
    }

    if (installPrompt) {
      try {
        await installPrompt.prompt();
        const { outcome } = await installPrompt.userChoice;
        setInstallPrompt(null);
        if (outcome === "accepted") {
          showToast(`${profile?.business || "Card"} was added to your apps.`);
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
  const phone = profile?.phone_link || profile?.phone || "";
  const displayName = profile?.name || profile?.business || "Business card";

  const quickLinks = [
    phone && {
      label: "Call",
      icon: "fa-solid fa-phone-volume",
      href: `tel:${phone.replace(/^tel:/i, "")}`,
    },
    phone && {
      label: "Text",
      icon: "fa-solid fa-comment-dots",
      href: `sms:${phone.replace(/^tel:/i, "")}`,
    },
    (profile?.address || profile?.address_link) && {
      label: "Location",
      icon: "fa-solid fa-location-dot",
      href: profile.address_link || (
        /^https?:\/\//i.test(profile.address || "")
          ? profile.address
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address || "")}`
      ),
      external: true,
    },
    profile?.email && {
      label: "Email",
      icon: "fa-solid fa-envelope",
      href: `mailto:${profile.email}`,
    },
  ].filter(Boolean);

  /* High-fidelity vCard download with embedded photo */
  const saveContact = async () => {
    if (!profile) return;

    showToast("Preparing contact file...");

    const foldVCardLine = (line) => {
      let folded = "";
      let lineLength = 0;
      for (const character of line) {
        const codePoint = character.codePointAt(0);
        const characterLength = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
        if (lineLength + characterLength > 75) {
          folded += "\r\n ";
          lineLength = 1;
        }
        folded += character;
        lineLength += characterLength;
      }
      return folded;
    };

    let photoField = "";
    if (profile.profile_image_url) {
      let objectUrl = "";
      try {
        const response = await fetch(profile.profile_image_url);
        if (!response.ok) throw new Error("Profile photo could not be downloaded.");
        const imageBlob = await response.blob();
        if (!imageBlob.type.startsWith("image/")) {
          throw new Error("Profile photo URL is not an image.");
        }

        objectUrl = URL.createObjectURL(imageBlob);
        const image = new Image();
        image.src = objectUrl;
        await image.decode();

        const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas context unavailable.");
        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);

        const jpegBlob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (blob) => blob ? resolve(blob) : reject(new Error("Encoding failed.")),
            "image/jpeg",
            0.82,
          );
        });
        const bytes = new Uint8Array(await jpegBlob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 0x8000) {
          binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
        }
        photoField = `PHOTO;ENCODING=b;TYPE=JPEG:${btoa(binary)}`;
      } catch (error) {
        console.error("Unable to embed profile photo in vCard:", error);
      } finally {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
      }
    }

    const currentPhone = profile.phone || profile.phone_link;
    const fields = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `FN:${escapeVCard(profile.name || profile.business || "")}`,
      profile.business && `ORG:${escapeVCard(profile.business)}`,
      profile.role && `TITLE:${escapeVCard(profile.role)}`,
      currentPhone && `TEL;TYPE=CELL:${escapeVCard(currentPhone.replace(/^tel:/i, ""))}`,
      profile.email && `EMAIL:${escapeVCard(profile.email)}`,
      profile.address && `ADR;TYPE=WORK:;;${escapeVCard(profile.address)};;;;`,
      photoField,
      `URL:${escapeVCard(window.location.href)}`,
      "END:VCARD",
    ].filter(Boolean);

    const blob = new Blob([fields.map(foldVCardLine).join("\r\n")], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const filename = (profile.name || profile.business || "contact")
      .trim()
      .replace(/[^a-z0-9]+/gi, "_")
      .replace(/^_|_$/g, "");
    link.href = url;
    link.download = `${filename || "contact"}.vcf`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(photoField ? "Contact with profile photo downloaded." : "Contact downloaded.");
  };

  /* Product Dialog gallery images calculation */
  const dialogProductImages = dialog?.type === "product" && dialog.product
    ? [
        ...(dialog.product.image_url ? [dialog.product.image_url] : []),
        ...(Array.isArray(dialog.product.gallery) ? dialog.product.gallery : []),
      ]
    : [];

  function openLightbox(index) {
    setActiveImageIndex(index);
  }

  function closeLightbox() {
    setActiveImageIndex(null);
  }

  function nextImage(e) {
    if (e) e.stopPropagation();
    if (dialogProductImages.length <= 1) return;
    setActiveImageIndex((prev) => (prev + 1) % dialogProductImages.length);
  }

  function prevImage(e) {
    if (e) e.stopPropagation();
    if (dialogProductImages.length <= 1) return;
    setActiveImageIndex((prev) => (prev - 1 + dialogProductImages.length) % dialogProductImages.length);
  }

  // Keyboard navigation for Lightbox
  useEffect(() => {
    if (activeImageIndex === null) return;
    function handleKeyDown(e) {
      if (e.key === "ArrowRight") nextImage();
      else if (e.key === "ArrowLeft") prevImage();
      else if (e.key === "Escape") setActiveImageIndex(null);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeImageIndex, dialogProductImages.length]);

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX;
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 40) {
      if (diff < 0) nextImage();
      else prevImage();
    }
    touchStartX.current = null;
  }

  const installGuide = getInstallGuide();

  if (errorMessage && !profile) {
    return (
      <main className="ivory-page">
        <div className="ivory-state" role="alert">
          {errorMessage}
        </div>
      </main>
    );
  }

  return (
    <>
      {/* ✦ Premium Signature Intro Screen ✦ */}
      {/* ? Cinematic Digipen Calligraphic Writing Intro Screen ? */}
      {introPhase !== "done" && (
        <div
          className={`ivory-intro-screen${introPhase === "exiting" ? " is-exiting" : ""}`}
          role="status"
          aria-live="polite"
          aria-label="Digipen is personalizing your digital business card"
        >
          <div className="ivory-intro-content">
            <div className="ivory-intro-card ivory-pen-intro-card">
              <span className="ivory-intro-card-glow" aria-hidden="true" />

              {/* Digipen Smart Pen Icon & NFC Wave Pulse */}
              <div className="ivory-digipen-badge">
                <span className="ivory-digipen-nfc-wave wave-1" aria-hidden="true" />
                <span className="ivory-digipen-nfc-wave wave-2" aria-hidden="true" />
                <span className="ivory-digipen-chip-icon" aria-hidden="true">
                  <i className="fa-solid fa-pen-nib" />
                </span>
                <span className="ivory-digipen-chip-tag">Digipen Smart NFC</span>
              </div>

              {/* Writing Canvas / Signature Pad */}
              <div className="ivory-writing-stage">
                <div className={"ivory-handwritten-wrap" + (isWritingReady ? " is-writing-active" : "")}>
                  {/* Animated Calligraphic Name Writing */}
                  <span className="ivory-handwritten-name">
                    {profile?.name || "Business Card"}
                  </span>
                  <span className="ivory-handwritten-underline" aria-hidden="true" />

                  {/* Precision Pen Nesting: Physically bounds directly to the name width & baseline */}
                  <div className="ivory-pen-stylus-carrier" aria-hidden="true">
                    <svg
                      className="ivory-stylus-svg"
                      viewBox="0 0 48 180"
                      width="36"
                      height="135"
                    >
                      <defs>
                        <linearGradient id="digipenBarrel" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#18181b" />
                          <stop offset="35%" stopColor="#27272a" />
                          <stop offset="65%" stopColor="#3f3f46" />
                          <stop offset="85%" stopColor="#27272a" />
                          <stop offset="100%" stopColor="#09090b" />
                        </linearGradient>
                        <linearGradient id="digipenGold" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#b45309" />
                          <stop offset="25%" stopColor="#f59e0b" />
                          <stop offset="55%" stopColor="#fef3c7" />
                          <stop offset="80%" stopColor="#f59e0b" />
                          <stop offset="100%" stopColor="#92400e" />
                        </linearGradient>
                        <linearGradient id="digipenSteel" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor="#52525b" />
                          <stop offset="50%" stopColor="#d4d4d8" />
                          <stop offset="100%" stopColor="#3f3f46" />
                        </linearGradient>
                        <filter id="digipenShadow" x="-20%" y="-20%" width="150%" height="150%">
                          <feDropShadow dx="-2" dy="4" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
                        </filter>
                      </defs>

                      {/* Pen Cap Finial */}
                      <path d="M 18 4 Q 24 0 30 4 L 32 10 L 16 10 Z" fill="url(#digipenGold)" />
                      <circle cx="24" cy="5" r="1.8" fill="#d32f2f" />

                      {/* Upper Barrel */}
                      <rect x="16" y="10" width="16" height="60" rx="1.5" fill="url(#digipenBarrel)" />

                      {/* Ergonomic Gold Pocket Clip */}
                      <path d="M 29 14 L 34 18 L 34 50 L 30 52 L 29 48 Z" fill="url(#digipenGold)" filter="url(#digipenShadow)" />

                      {/* Center Ring Band */}
                      <rect x="15" y="70" width="18" height="5" fill="url(#digipenGold)" />
                      <line x1="15" y1="72.5" x2="33" y2="72.5" stroke="#78350f" strokeWidth="0.5" />

                      {/* Lower Barrel */}
                      <rect x="16.5" y="75" width="15" height="42" fill="url(#digipenBarrel)" />

                      {/* Tapered Grip Section */}
                      <path d="M 16.5 117 L 31.5 117 L 29 145 L 19 145 Z" fill="url(#digipenSteel)" />
                      <line x1="18" y1="124" x2="30" y2="124" stroke="#27272a" strokeWidth="0.8" opacity="0.5" />
                      <line x1="18.5" y1="131" x2="29.5" y2="131" stroke="#27272a" strokeWidth="0.8" opacity="0.5" />
                      <line x1="19" y1="138" x2="29" y2="138" stroke="#27272a" strokeWidth="0.8" opacity="0.5" />

                      {/* Gold Nib Section */}
                      <path d="M 19 145 L 29 145 L 26 166 L 22 166 Z" fill="url(#digipenGold)" />

                      {/* Precision Ballpoint Tip / Nib Quill */}
                      <path d="M 22 166 L 26 166 L 24.8 175 L 23.2 175 Z" fill="url(#digipenSteel)" />
                      {/* Ultra-fine Tungsten Carbide Ball / Ink Point */}
                      <circle cx="24" cy="177.5" r="1.4" fill="#d32f2f" />
                    </svg>

                    {/* Exact Ink Contact Micro-Sparkle Bloom */}
                    <span className="ivory-contact-bloom" />
                  </div>
                </div>
              </div>

              {/* Sub-identity reveal: Business & Role */}
              <div className="ivory-intro-copy">
                {profile?.role && <p className="ivory-intro-role">{profile.role}</p>}
                {profile?.business && (
                  <span className="ivory-intro-business">
                    <i className="fa-solid fa-id-card" aria-hidden="true" />
                    {profile.business}
                  </span>
                )}
              </div>

              {/* Real-time Ink Loading Bar */}
              <div
                className={`ivory-intro-loader${dataReady && profileImageReady ? " is-ready" : ""}`}
                role="presentation"
              >
                <span />
              </div>

              <p className="ivory-intro-caption">
                <span className="ivory-intro-loading-dot" aria-hidden="true" />
                {isWritingReady ? "Writing personalized profile via Digipen..." : "Reading Digipen NFC data..."}
              </p>
              <span className="ivory-intro-card-shine" aria-hidden="true" />
            </div>
          </div>
        </div>
      )}

      <main
        ref={pageRef}
        className="ivory-page"
        aria-hidden={introPhase !== "done"}
      >
        {/* Top-Right Creator Promo Badge */}
        <aside className="ivory-card-promo" aria-label="Create a business card">
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

        <div
          className={`ivory-device${introPhase === "loading" ? " is-loading" : " is-entering"}${tapRipple ? " is-tapped" : ""}`}
          onClick={animateCardTap}
        >
          {/* Card Tap Ripple & Light Sweep */}
          {tapRipple && (
            <>
              <span
                key={`sweep-${tapRipple.id}`}
                className="ivory-card-light-sweep"
                aria-hidden="true"
              />
              <span
                key={`ripple-${tapRipple.id}`}
                className="ivory-card-ripple"
                style={{ left: tapRipple.x, top: tapRipple.y }}
                aria-hidden="true"
              />
            </>
          )}

          <div className="ivory-scroll">
            <header className="ivory-banner">
              <div className="ivory-brand-copy">
                <div className="ivory-brand-name">
                  <span className="ivory-script">{(profile?.name || "").split(" ")[0]}</span>
                  <span className="ivory-serif">{(profile?.name || profile?.business || "").split(" ").slice(1).join(" ")}</span>
                </div>
                {(profile?.eyebrow || profile?.business) && <p>{profile.eyebrow || profile.business}</p>}
              </div>
              <span className="ivory-brand-mark" aria-hidden="true">
                <i className="fa-solid fa-address-card" />
              </span>
            </header>

            <section className="ivory-profile" aria-label="Business owner profile">
              <div className="ivory-avatar">
                {profile?.profile_image_url && failedProfileImageUrl !== profile.profile_image_url ? (
                  <img src={profile.profile_image_url} alt={displayName} style={{ objectPosition: getImageFocalInfo(profile.profile_image_url).objectPosition }} onLoad={() => setProfileImageLoadedUrl(profile.profile_image_url)} onError={() => setFailedProfileImageUrl(profile.profile_image_url)} />
                ) : (
                  <i className="fa-solid fa-user" aria-hidden="true" />
                )}
              </div>
              <div className="ivory-profile-copy">
                <h1>{displayName}</h1>
                {profile?.role && <p>{profile.role}</p>}
                {profile?.business && <span>{profile.business}</span>}
              </div>
            </section>

            <section className="ivory-contact-section" aria-label="Quick contact actions">
              <nav className="ivory-actions ivory-quick-actions" aria-label="Contact links">
                {quickLinks.map((link) => (
                  <IvoryAction
                    key={link.label}
                    icon={link.icon}
                    label={link.label}
                    href={link.href}
                    external={link.external}
                  />
                ))}
              </nav>

              <nav className="ivory-actions ivory-utility-actions" aria-label="Contact utilities">
                <IvoryAction
                  icon="fa-solid fa-address-card"
                  label="Save contact"
                  onClick={saveContact}
                />
                <IvoryAction
                  icon="fa-solid fa-download"
                  label="Install card"
                  onClick={installCard}
                />
                <IvoryAction
                  icon="fa-solid fa-qrcode"
                  label="QR code"
                  onClick={() => setDialog({ type: "card-qr" })}
                />
                <IvoryAction
                  icon="fa-solid fa-arrow-up-from-bracket"
                  label="Share card"
                  onClick={shareCard}
                />
              </nav>
            </section>

            {socialLinks.some((link) => socialHref(link)) && (
              <section className="ivory-social-section" aria-labelledby="ivory-social-title">
                <div className="ivory-section-heading">
                  <div>
                    <p>Find us online</p>
                    <h2 id="ivory-social-title">Connect with us</h2>
                  </div>
                  <i className="fa-solid fa-arrow-up-right-from-square" aria-hidden="true" />
                </div>
                <nav className="ivory-actions ivory-social-actions" aria-label="Social media links">
                  {socialLinks.map((link, index) => {
                    const href = socialHref(link);
                    return href ? (
                      <IvoryAction
                        key={link.id || `${link.label}-${index}`}
                        icon={resolveCustomIcon(link.icon, link.label, link.url)}
                        label={link.label || "Website"}
                        href={href}
                        external={link.icon !== "fa-solid fa-phone"}
                      />
                    ) : null;
                  })}
                </nav>
              </section>
            )}

            {paymentLinks.length > 0 && (
              <section className="ivory-payment-section" aria-labelledby="ivory-payment-title">
                <div className="ivory-section-heading">
                  <div>
                    <p>Quick and convenient</p>
                    <h2 id="ivory-payment-title">Payment options</h2>
                  </div>
                  <i className="fa-solid fa-wallet" aria-hidden="true" />
                </div>
                <nav className="ivory-actions ivory-payment-actions" aria-label="Payment QR codes">
                  {paymentLinks.map((link, index) => (
                    <IvoryAction
                      key={link.id || `${link.label}-${index}`}
                      icon="fa-solid fa-qrcode"
                      label={link.label}
                      onClick={() => setDialog({ type: "payment", payment: link })}
                    />
                  ))}
                </nav>
              </section>
            )}

            {(profile?.description || profile?.phone || profile?.phone_link || profile?.email || profile?.address) && (
              <section className={`ivory-about${aboutOpen ? " is-open" : ""}`}>
                <button
                  className="ivory-about-toggle"
                  type="button"
                  aria-expanded={aboutOpen}
                  onClick={() => setAboutOpen((open) => !open)}
                >
                  <span><b aria-hidden="true">{aboutOpen ? "−" : "+"}</b> About {displayName}</span>
                  <i className="fa-solid fa-chevron-down" aria-hidden="true" />
                </button>
                <div className="ivory-about-content">
                  <div>
                    <p>{profile.description}</p>
                    {(profile.phone || profile.phone_link || profile.email || profile.address) && (
                      <div className="ivory-about-details" aria-label="Direct contact details">
                        {(profile.phone || profile.phone_link) && (
                          <a href={`tel:${phone.replace(/^tel:/i, "")}`}>
                            <small>Direct call</small>{profile.phone || phone}
                          </a>
                        )}
                        {profile.email && (
                          <a href={`mailto:${profile.email}`}>
                            <small>Email</small>{profile.email}
                          </a>
                        )}
                        {profile.address && (
                          <a
                            href={profile.address_link || (
                              /^https?:\/\//i.test(profile.address)
                                ? profile.address
                                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(profile.address)}`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <small>Business location</small>{profile.address}
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {products.length > 0 && (
              <section className="ivory-products-section" aria-labelledby="ivory-products-title">
                <div className="ivory-section-heading">
                  <div>
                    <p>A selection of our work</p>
                    <h2 id="ivory-products-title">Featured services</h2>
                  </div>
                  <i className="fa-solid fa-sparkles" aria-hidden="true" />
                </div>
                <div className="ivory-products">
                  {products.map((product) => (
                    <button
                      className="ivory-product"
                      type="button"
                      key={product.id || product.name}
                      aria-label={`View details for ${product.name}`}
                      onClick={() => openProductDialog(product)}
                    >
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.alt || product.name} loading="lazy" style={{ objectPosition: getImageFocalInfo(product.image_url).objectPosition }} />
                      ) : (
                        <div className="ivory-product-placeholder" aria-hidden="true">
                          <i className="fa-solid fa-box-open" />
                        </div>
                      )}
                      <div className="ivory-product-copy">
                        <h3>{product.name}</h3>
                        {product.description && <p>{product.description}</p>}
                        {product.price && <strong>{product.price}</strong>}
                      </div>
                    </button>
                  ))}
                </div>
                {productsError && <p className="ivory-products-error" role="status">{productsError}</p>}
              </section>
            )}
          </div>

          {/* ✦ Dialog Modal (Payment, QR Code, Product Details) ✦ */}
          {dialog && (
            <div
              className="ivory-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeDialog();
              }}
            >
              <section className="ivory-dialog" role="dialog" aria-modal="true" aria-labelledby="ivory-dialog-title">
                <button className="ivory-dialog-close" type="button" aria-label="Close" onClick={closeDialog}>
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
                {dialog.type === "payment" ? (
                  <>
                    <h2 id="ivory-dialog-title">{dialog.payment.label} payment QR</h2>
                    <img src={dialog.payment.qr_image_url} alt={`${dialog.payment.label} payment QR code`} style={{ objectPosition: getImageFocalInfo(dialog.payment.qr_image_url).objectPosition }} />
                    {dialog.payment.payment_url && (
                      <a href={dialog.payment.payment_url} target="_blank" rel="noopener noreferrer">
                        Open payment link
                      </a>
                    )}
                  </>
                ) : dialog.type === "card-qr" ? (
                  <>
                    <h2 id="ivory-dialog-title">Scan to open {displayName}&apos;s card</h2>
                    <p style={{ margin: "0 0 14px", fontSize: "0.75rem", color: "#6b7280" }}>
                      Point your phone camera to instantly connect.
                    </p>
                    <div className="ivory-card-qr">
                      <QRCodeSVG
                        id="ivory-card-qr-svg"
                        value={profile?.custom_qr_url?.trim() || window.location.href}
                        size={220}
                        level="H"
                        includeMargin
                        title={`${displayName} business card QR code`}
                      />
                    </div>
                    <div className="ivory-qr-url-box">
                      {profile?.custom_qr_url?.trim() || window.location.href}
                    </div>
                    <div className="ivory-qr-actions">
                      <button
                        type="button"
                        className="ivory-qr-btn"
                        onClick={() => {
                          const svg = document.getElementById("ivory-card-qr-svg");
                          if (!svg) return;
                          const svgData = new XMLSerializer().serializeToString(svg);
                          const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
                          const svgUrl = URL.createObjectURL(svgBlob);
                          const downloadLink = document.createElement("a");
                          downloadLink.href = svgUrl;
                          downloadLink.download = `${(profile?.business || "card").replace(/\s+/g, "-").toLowerCase()}-qr-code.svg`;
                          document.body.appendChild(downloadLink);
                          downloadLink.click();
                          document.body.removeChild(downloadLink);
                          URL.revokeObjectURL(svgUrl);
                          showToast("QR Code downloaded!");
                        }}
                      >
                        <i className="fa-solid fa-download" aria-hidden="true" />
                        <span>Download QR</span>
                      </button>
                      <button
                        type="button"
                        className="ivory-qr-btn"
                        onClick={() => {
                          const targetUrl = profile?.custom_qr_url?.trim() || window.location.href;
                          navigator.clipboard.writeText(targetUrl);
                          showToast("Card link copied to clipboard!");
                        }}
                      >
                        <i className="fa-regular fa-copy" aria-hidden="true" />
                        <span>Copy Link</span>
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {dialog.product.image_url && (
                      <div
                        className="ivory-dialog-hero-wrap"
                        onClick={() => openLightbox(0)}
                        title="Click to view full image"
                      >
                        <img src={dialog.product.image_url} alt={dialog.product.alt || dialog.product.name} style={{ objectPosition: getImageFocalInfo(dialog.product.image_url).objectPosition }} />
                        <span className="ivory-zoom-hint">
                          <i className="fa-solid fa-expand" aria-hidden="true" /> Zoom
                        </span>
                      </div>
                    )}
                    <h2 id="ivory-dialog-title">{dialog.product.name}</h2>
                    {dialog.product.price && <p className="ivory-product-dialog-price">{dialog.product.price}</p>}
                    <p className="ivory-product-dialog-description">
                      {dialog.product.description || "Contact us to learn more about this project and discuss your requirements."}
                    </p>
                    {Array.isArray(dialog.product.gallery) && dialog.product.gallery.length > 0 && (
                      <div className="ivory-product-gallery" aria-label={`${dialog.product.name} gallery`}>
                        {dialog.product.gallery.map((image, index) => (
                          <div
                            key={image || index}
                            className="ivory-product-gallery-thumb"
                            onClick={() => openLightbox(dialog.product.image_url ? index + 1 : index)}
                            title="Click to zoom image"
                          >
                            <img src={image} alt={`${dialog.product.name} photo ${index + 1}`} loading="lazy" style={{ objectPosition: getImageFocalInfo(image).objectPosition }} />
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="ivory-product-dialog-actions">
                      {profile?.email && (
                        <a
                          href={`mailto:${profile.email}?subject=${encodeURIComponent(`Project Inquiry: ${dialog.product.name}`)}&body=${encodeURIComponent(`Hi ${profile.name},\n\nI am interested in your project/service: ${dialog.product.name}.\n\nPlease let me know more details, pricing, and availability.\n\nThank you!`)}`}
                        >
                          <i className="fa-regular fa-envelope" aria-hidden="true" /> Inquire / Order
                        </a>
                      )}
                      <a href="/shop">
                        <i className="fa-solid fa-store" aria-hidden="true" /> Visit Shop
                      </a>
                    </div>
                  </>
                )}
              </section>
            </div>
          )}

          {/* ✦ PWA Install Help Modal ✦ */}
          {installHelpOpen && (
            <div
              className="ivory-overlay"
              role="presentation"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setInstallHelpOpen(false);
              }}
            >
              <section className="ivory-dialog ivory-install-dialog" role="dialog" aria-modal="true" aria-labelledby="ivory-install-title">
                <button
                  className="ivory-dialog-close"
                  type="button"
                  aria-label="Close install instructions"
                  onClick={() => setInstallHelpOpen(false)}
                >
                  <i className="fa-solid fa-xmark" aria-hidden="true" />
                </button>
                <div className="ivory-install-icon" aria-hidden="true">
                  <i className="fa-solid fa-mobile-screen-button" />
                </div>
                <h2 id="ivory-install-title">Install {profile?.business || "Card"}</h2>
                <p className="ivory-install-sub">{installGuide.subtitle}</p>

                <div className="ivory-install-badge">
                  <i className={installGuide.device === "ios" ? "fa-brands fa-apple" : installGuide.device === "android" ? "fa-brands fa-android" : "fa-solid fa-desktop"} aria-hidden="true" />
                  <span>{installGuide.browser}</span>
                </div>

                <div className="ivory-install-steps">
                  {installGuide.steps.map((step) => (
                    <div className="ivory-install-step" key={step.num}>
                      <div className="ivory-install-step-num">{step.num}</div>
                      <div className="ivory-install-step-body">
                        <div className="ivory-install-step-title">
                          <i className={step.icon} aria-hidden="true" />
                          <strong>{step.title}</strong>
                        </div>
                        <p>{step.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>

                {installGuide.device === "ios" && (
                  <div className="ivory-install-arrow-tip">
                    <i className="fa-solid fa-arrow-down" aria-hidden="true" />
                    <span>Tap the Share icon at the bottom of your screen to start</span>
                  </div>
                )}

                <button
                  className="ivory-install-done-btn"
                  type="button"
                  onClick={() => setInstallHelpOpen(false)}
                >
                  Got it, let's do it!
                </button>
              </section>
            </div>
          )}

          {/* ✦ Fullscreen Image Lightbox with Touch Swiping ✦ */}
          {activeImageIndex !== null && dialogProductImages.length > 0 && (
            <ImageLightbox
              images={dialogProductImages}
              activeIndex={activeImageIndex}
              onClose={closeLightbox}
              onNext={nextImage}
              onPrev={prevImage}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            />
          )}

          {/* ✦ Floating Toast Feedback ✦ */}
          {toast && <div className="ivory-toast" role="status">{toast}</div>}
        </div>
      </main>

      {/* ✦ Touch Ripple Burst Effect on Screen ✦ */}
      <TouchThumbLayer />
    </>
  );
}

export default SoftNeumorphicIvory;
