import { useCallback, useEffect, useRef, useState } from 'react';
import './client-legal.css';

export const CLIENT_TERMS_VERSION = '2026-10-26-v1';
export const CLIENT_PRIVACY_VERSION = '2026-10-26-v1';

const documents = {
  privacy: {
    title: 'Privacy notice',
    sections: [
      {
        heading: 'Information handled',
        text: 'The service handles account details used to sign in and the profile, contact, image, link, and product information you choose to submit for your business card. Do not submit sensitive personal information or information about another person unless you are authorized to do so.',
      },
      {
        heading: 'Why it is used',
        text: 'Information is used to operate your client account, prepare and manage your business card, review requested changes, provide support, and protect the service. Profile details are not made public by this editor submission alone: requested changes are reviewed by the site administrator and the card is published separately.',
      },
      {
        heading: 'Service providers and public information',
        text: 'The service uses Supabase for account, database, and image-storage functions and Firebase for website hosting. Information is shared with these providers as needed to operate the service. Once a card is published, its displayed information is public and may be copied or saved by visitors.',
      },
      {
        heading: 'Your choices and requests',
        text: 'Provide only information needed for your card. You may ask the site administrator who issued your login to access, correct, block, or remove information, unpublish your card, or help with another privacy request. Some records may need to be retained for security, legal, or dispute-resolution reasons.',
      },
      {
        heading: 'Retention and service contact',
        text: 'Information is retained as needed to provide and administer the card, meet legal obligations, resolve disputes, and maintain service backups. Ask the administrator who issued your account for the applicable retention schedule and the identity of the service operator.',
      },
      {
        heading: 'Security and questions',
        text: 'Access to client editing is limited to assigned accounts, but no online service can guarantee absolute security. For a privacy question or request, contact the site administrator who provided your account credentials.',
      },
    ],
  },
  terms: {
    title: 'Client terms',
    sections: [
      {
        heading: 'Using the client editor',
        text: 'Use the account only for the site assigned to you. Keep your password private, notify the site administrator if you believe your account has been accessed without permission, and provide accurate information you are authorized to submit.',
      },
      {
        heading: 'Information and permissions',
        text: 'You are responsible for having the rights and permissions needed for the text, images, contact details, links, and product information you submit. Do not submit unlawful, misleading, confidential, or sensitive information that is not necessary for your card.',
      },
      {
        heading: 'Review before publication',
        text: 'Submitting a change sends it to the site administrator for review. It does not itself publish the change. The administrator may approve, decline, or request changes. If approved and published, the information selected for the card will be publicly accessible.',
      },
      {
        heading: 'Account and content requests',
        text: 'Contact the site administrator who issued your login for account help, correction or removal requests, or to ask that a card be unpublished. The administrator may suspend access to protect the site or investigate suspected misuse.',
      },
      {
        heading: 'Availability and changes',
        text: 'The editor and public card are provided online and may be changed or temporarily unavailable for maintenance, security, or operational reasons. These client terms do not replace the separate privacy notice or any written service or payment agreement you have with the site administrator.',
      },
    ],
  },
};

export function LegalDocumentDialog({ documentType, onClose }) {
  const closeButtonRef = useRef(null);

  useEffect(() => {
    if (!documentType) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.document.addEventListener('keydown', closeOnEscape);
    closeButtonRef.current?.focus();
    return () => window.document.removeEventListener('keydown', closeOnEscape);
  }, [documentType, onClose]);

  if (!documentType) return null;
  const document = documents[documentType];

  return (
    <div className="admin-legal-backdrop" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="admin-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-legal-dialog-title">
        <header className="admin-legal-dialog-header">
          <h2 id="admin-legal-dialog-title">{document.title}</h2>
          <button ref={closeButtonRef} className="admin-btn admin-btn-outline" type="button" onClick={onClose}>Close</button>
        </header>
        <div className="admin-legal-dialog-content">
          {document.sections.map((section) => (
            <section key={section.heading}>
              <h3>{section.heading}</h3>
              <p>{section.text}</p>
            </section>
          ))}
          <p className="admin-legal-version">Document version {documentType === 'terms' ? CLIENT_TERMS_VERSION : CLIENT_PRIVACY_VERSION}</p>
        </div>
      </section>
    </div>
  );
}

export function ClientLegalAcceptance({ onAccept, onSignOut, saving, error }) {
  const [privacyRead, setPrivacyRead] = useState(false);
  const [termsRead, setTermsRead] = useState(false);
  const [openDocument, setOpenDocument] = useState('');
  const closeDocument = useCallback(() => setOpenDocument(''), []);

  const handleAccept = (event) => {
    event.preventDefault();
    if (privacyRead && termsRead) onAccept();
  };

  return (
    <div className="admin-login admin-legal-page">
      <form className="admin-login-card admin-legal-card" onSubmit={handleAccept}>
        <p className="admin-eyebrow">CLIENT ACCOUNT · FIRST SIGN-IN</p>
        <h1 className="admin-login-title">Before you manage your card</h1>
        <p className="admin-login-subtitle">
          Please review the privacy notice and client terms. You must acknowledge both before opening the profile editor.
        </p>
        <div className="admin-legal-document-links">
          <button className="admin-btn admin-btn-outline" type="button" onClick={() => setOpenDocument('privacy')}>Read privacy notice</button>
          <button className="admin-btn admin-btn-outline" type="button" onClick={() => setOpenDocument('terms')}>Read client terms</button>
        </div>
        <label className="admin-legal-check">
          <input type="checkbox" checked={privacyRead} onChange={(event) => setPrivacyRead(event.target.checked)} />
          <span>I have read the privacy notice and understand how information for this card is handled.</span>
        </label>
        <label className="admin-legal-check">
          <input type="checkbox" checked={termsRead} onChange={(event) => setTermsRead(event.target.checked)} />
          <span>I have read and agree to the client terms.</span>
        </label>
        <p className="admin-legal-publication-note">
          These acknowledgements do not publish your card. You will separately confirm when submitting information that you are authorized to provide it and understand approved changes may be published.
        </p>
        {error && <div className="admin-login-error" role="alert">{error}</div>}
        <button className="admin-btn admin-btn-primary" type="submit" disabled={saving || !privacyRead || !termsRead}>
          {saving ? 'Saving acknowledgement…' : 'Accept and continue'}
        </button>
        <button className="admin-btn admin-btn-outline" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </form>
      <LegalDocumentDialog documentType={openDocument} onClose={closeDocument} />
    </div>
  );
}

export function LegalDocumentLinks({ className = 'admin-legal-login-links' }) {
  const [openDocument, setOpenDocument] = useState('');
  const closeDocument = useCallback(() => setOpenDocument(''), []);

  return (
    <>
      <div className={className}>
        <button type="button" onClick={() => setOpenDocument('privacy')}>Privacy notice</button>
        <button type="button" onClick={() => setOpenDocument('terms')}>Client terms</button>
      </div>
      <LegalDocumentDialog documentType={openDocument} onClose={closeDocument} />
    </>
  );
}

export function PublicationConfirmation({ checked, onChange }) {
  return (
    <label className="admin-legal-publication-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>I confirm I am authorized to submit this information and understand approved changes may be published publicly on my card.</span>
    </label>
  );
}
