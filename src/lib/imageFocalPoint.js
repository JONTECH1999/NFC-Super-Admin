/**
 * Utilities for extracting and applying image focal points (#pos=X,Y)
 * or setting focal point query/hash parameters.
 */

/**
 * Extracts coordinates from an image URL with `#pos=X,Y`.
 * Returns default { x: 50, y: 50, style: { objectPosition: '50% 50%' } } if none specified.
 *
 * @param {string} url
 * @param {string} defaultPos - Optional default fallback e.g. '50% 25%' or 'center 30%'
 * @returns {{ x: number, y: number, objectPosition: string, cleanUrl: string }}
 */
export function getImageFocalInfo(url, defaultPos = '50% 50%') {
  if (!url || typeof url !== 'string') {
    return {
      x: 50,
      y: 50,
      objectPosition: defaultPos,
      cleanUrl: url || '',
    };
  }

  const hashIndex = url.indexOf('#pos=');
  if (hashIndex === -1) {
    return {
      x: 50,
      y: 50,
      objectPosition: defaultPos,
      cleanUrl: url,
    };
  }

  const cleanUrl = url.substring(0, hashIndex);
  const hashPart = url.substring(hashIndex + 5);
  const [rawX, rawY] = hashPart.split(',');

  const parsedX = parseFloat(rawX);
  const parsedY = parseFloat(rawY);

  const x = !isNaN(parsedX) && parsedX >= 0 && parsedX <= 100 ? parsedX : 50;
  const y = !isNaN(parsedY) && parsedY >= 0 && parsedY <= 100 ? parsedY : 50;

  return {
    x,
    y,
    objectPosition: `${x}% ${y}%`,
    cleanUrl,
  };
}

/**
 * Appends or updates the `#pos=X,Y` hash on an image URL.
 *
 * @param {string} url
 * @param {number} x (0 to 100)
 * @param {number} y (0 to 100)
 * @returns {string}
 */
export function setImageFocalPoint(url, x, y) {
  if (!url || typeof url !== 'string') return '';
  const hashIndex = url.indexOf('#pos=');
  const baseUrl = hashIndex !== -1 ? url.substring(0, hashIndex) : url;
  
  const clampedX = Math.round(Math.max(0, Math.min(100, x)));
  const clampedY = Math.round(Math.max(0, Math.min(100, y)));

  // If centered at 50,50 we can still keep #pos=50,50 for explicit framing or remove it
  return `${baseUrl}#pos=${clampedX},${clampedY}`;
}
