/**
 * DIGI AI Smart Parsing Engine
 * Intelligently extracts structured business information from unstructured text
 * (Facebook page "About" sections, raw bio messages, WhatsApp/SMS cards).
 */

export function parseClientRawData(rawText) {
  if (!rawText || typeof rawText !== 'string') return {};

  const text = rawText.trim();
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const result = {
    detected: {},
    links: [],
  };

  // 1. Phone numbers (Philippine mobile/landline & international)
  const phoneRegex = /(?:\+?63\s?|0)?9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}|(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) {
    result.detected.phone = phoneMatch[0].trim();
  }

  // 2. Email Address
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const emailMatch = text.match(emailRegex);
  if (emailMatch) {
    result.detected.email = emailMatch[0].trim();
  }

  // 3. URLs & Social Media Detection
  const urlRegex = /https?:\/\/[^\s]+/g;
  const urls = text.match(urlRegex) || [];

  urls.forEach((url) => {
    const cleanUrl = url.replace(/[.,;)]+$/, '');
    if (/facebook\.com|fb\.com|fb\.me/i.test(cleanUrl)) {
      result.detected.facebook = cleanUrl;
      result.links.push({
        title: 'Facebook Page',
        url: cleanUrl,
        icon: 'fa-brands fa-facebook-f',
        is_payment: false,
      });
    } else if (/instagram\.com/i.test(cleanUrl)) {
      result.links.push({
        title: 'Instagram',
        url: cleanUrl,
        icon: 'fa-brands fa-instagram',
        is_payment: false,
      });
    } else if (/tiktok\.com/i.test(cleanUrl)) {
      result.links.push({
        title: 'TikTok',
        url: cleanUrl,
        icon: 'fa-brands fa-tiktok',
        is_payment: false,
      });
    } else if (/youtube\.com|youtu\.be/i.test(cleanUrl)) {
      result.detected.youtube = cleanUrl;
      result.links.push({
        title: 'YouTube',
        url: cleanUrl,
        icon: 'fa-brands fa-youtube',
        is_payment: false,
      });
    } else if (/maps\.google|goo\.gl\/maps/i.test(cleanUrl)) {
      result.detected.address_link = cleanUrl;
    } else if (/gcash|paymaya|maya/i.test(cleanUrl)) {
      result.links.push({
        title: 'Online Payment',
        url: cleanUrl,
        icon: 'fa-solid fa-credit-card',
        is_payment: true,
      });
    } else {
      result.links.push({
        title: 'Website',
        url: cleanUrl,
        icon: 'fa-solid fa-globe',
        is_payment: false,
      });
    }
  });

  // 4. Labeled Line Parsing (e.g. "Business:", "Name:", "Address:", "Hours:")
  lines.forEach((line) => {
    const lower = line.toLowerCase();
    
    // Business Name
    if (/^(business(\s*name)?|company|shop|brand)\s*[:=-]\s*(.+)/i.test(line)) {
      const match = line.match(/^(?:business(?:\s*name)?|company|shop|brand)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) result.detected.business = match[1].trim();
    }
    // Owner / Contact Person
    else if (/^(owner|contact\s*person|name|proprietor|founder)\s*[:=-]\s*(.+)/i.test(line)) {
      const match = line.match(/^(?:owner|contact\s*person|name|proprietor|founder)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) result.detected.name = match[1].trim();
    }
    // Role / Position
    else if (/^(role|title|position|tagline)\s*[:=-]\s*(.+)/i.test(line)) {
      const match = line.match(/^(?:role|title|position|tagline)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) result.detected.role = match[1].trim();
    }
    // Address / Location
    else if (/^(address|location|store\s*address|office|branch)\s*[:=-]\s*(.+)/i.test(line)) {
      const match = line.match(/^(?:address|location|store\s*address|office|branch)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) result.detected.address = match[1].trim();
    }
    // Eyebrow / Category
    else if (/^(category|service|field|niche)\s*[:=-]\s*(.+)/i.test(line)) {
      const match = line.match(/^(?:category|service|field|niche)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) result.detected.eyebrow = match[1].trim();
    }
    // Description / Bio
    else if (/^(about|bio|description|intro)\s*[:=-]\s*(.+)/i.test(line)) {
      const match = line.match(/^(?:about|bio|description|intro)\s*[:=-]\s*(.+)/i);
      if (match && match[1]) result.detected.description = match[1].trim();
    }
  });

  // 5. Fallbacks if unlabeled:
  // First non-URL line often serves as the Business or Contact Name
  if (!result.detected.business && !result.detected.name && lines.length > 0) {
    const firstLine = lines[0];
    if (firstLine.length < 60 && !/^https?:/i.test(firstLine)) {
      result.detected.business = firstLine;
      result.detected.name = firstLine;
    }
  }

  // Address heuristic (lines containing St., Street, Ave, City, Brgy, Barangay, Philippines)
  if (!result.detected.address) {
    const addressLine = lines.find((l) => 
      /(?:st\.|street|avenue|ave|blvd|city|brgy|barangay|poblacion|philippines|metro\s*manila|davao|cebu)/i.test(l) &&
      !l.includes('http') && l.length < 120
    );
    if (addressLine) {
      result.detected.address = addressLine;
    }
  }

  // Description fallback: pick longest line that isn't a link
  if (!result.detected.description) {
    const longLines = lines.filter((l) => l.length > 50 && !l.startsWith('http') && !l.includes('@'));
    if (longLines.length > 0) {
      result.detected.description = longLines.join('\n\n');
    }
  }

  return result;
}
