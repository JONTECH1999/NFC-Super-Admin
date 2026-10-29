import React, { useState, useRef, useEffect, useCallback } from 'react';
import { getImageFocalInfo, setImageFocalPoint } from './lib/imageFocalPoint';

/**
 * ImageFocalModal
 * A clean, intuitive modal allowing users to click/drag to select
 * the focal point of an image. Shows a live circular and rectangular preview.
 *
 * @param {Object} props
 * @param {string} props.imageUrl - Current image URL
 * @param {string} props.title - Modal title, e.g. "Adjust Profile Photo Focus"
 * @param {'portrait'|'square'|'contain'} [props.previewShape='portrait'] - Shape to simulate in preview
 * @param {function(string): void} props.onSave - Callback receiving the updated URL with #pos=X,Y
 * @param {function(): void} props.onClose - Callback to close the modal
 */
export default function ImageFocalModal({
  imageUrl,
  title = 'Adjust Photo Focus',
  previewShape = 'portrait',
  onSave,
  onClose,
}) {
  const focalInfo = getImageFocalInfo(imageUrl);
  const [posX, setPosX] = useState(focalInfo.x);
  const [posY, setPosY] = useState(focalInfo.y);
  const [isDragging, setIsDragging] = useState(false);
  const imageContainerRef = useRef(null);

  const cleanUrl = focalInfo.cleanUrl;

  const updateCoordinatesFromPointer = useCallback((e) => {
    if (!imageContainerRef.current) return;
    const rect = imageContainerRef.current.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;

    const rawX = ((clientX - rect.left) / rect.width) * 100;
    const rawY = ((clientY - rect.top) / rect.height) * 100;

    const clampedX = Math.round(Math.max(0, Math.min(100, rawX)));
    const clampedY = Math.round(Math.max(0, Math.min(100, rawY)));

    setPosX(clampedX);
    setPosY(clampedY);
  }, []);

  const handlePointerDown = (e) => {
    setIsDragging(true);
    updateCoordinatesFromPointer(e);
  };

  useEffect(() => {
    const handlePointerMove = (e) => {
      if (!isDragging) return;
      updateCoordinatesFromPointer(e);
    };

    const handlePointerUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      window.addEventListener('mousemove', handlePointerMove);
      window.addEventListener('mouseup', handlePointerUp);
      window.addEventListener('touchmove', handlePointerMove);
      window.addEventListener('touchend', handlePointerUp);
    }

    return () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };
  }, [isDragging, updateCoordinatesFromPointer]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handlePreset = (x, y) => {
    setPosX(x);
    setPosY(y);
  };

  const handleSave = () => {
    const finalUrl = setImageFocalPoint(cleanUrl, posX, posY);
    onSave(finalUrl);
    onClose();
  };

  return (
    <div className="image-focal-backdrop" role="dialog" aria-modal="true" aria-labelledby="focal-modal-title">
      <div className="image-focal-modal">
        <header className="image-focal-header">
          <div className="image-focal-header-titles">
            <h3 id="focal-modal-title">{title}</h3>
            <p>Click or drag the crosshair to pick which part remains visible on all screens.</p>
          </div>
          <button type="button" className="image-focal-close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </header>

        <div className="image-focal-body">
          {/* Main Interactive Picker Canvas */}
          <div className="image-focal-interactive-area">
            <div
              className="image-focal-image-wrap"
              ref={imageContainerRef}
              onMouseDown={handlePointerDown}
              onTouchStart={handlePointerDown}
            >
              <img
                src={cleanUrl}
                alt="Framing selector"
                draggable={false}
                className="image-focal-source"
              />

              {/* Draggable Target Crosshair */}
              <div
                className="image-focal-crosshair"
                style={{
                  left: `${posX}%`,
                  top: `${posY}%`,
                }}
              >
                <div className="image-focal-crosshair-ring" />
                <div className="image-focal-crosshair-dot" />
              </div>
            </div>

            <div className="image-focal-presets">
              <span className="image-focal-presets-label">Quick Presets:</span>
              <button
                type="button"
                className={`image-focal-preset-btn ${posX === 50 && posY === 20 ? 'active' : ''}`}
                onClick={() => handlePreset(50, 20)}
              >
                Top / Face (50%, 20%)
              </button>
              <button
                type="button"
                className={`image-focal-preset-btn ${posX === 50 && posY === 50 ? 'active' : ''}`}
                onClick={() => handlePreset(50, 50)}
              >
                Center (50%, 50%)
              </button>
              <button
                type="button"
                className={`image-focal-preset-btn ${posX === 50 && posY === 80 ? 'active' : ''}`}
                onClick={() => handlePreset(50, 80)}
              >
                Bottom (50%, 80%)
              </button>
            </div>
          </div>

          {/* Live Previews Column */}
          <div className="image-focal-preview-sidebar">
            <h4>Live View Preview</h4>
            <p className="image-focal-preview-hint">How this displays in card and store frames:</p>

            <div className="image-focal-previews">
              {/* Portrait Preview (like card hero / background) */}
              <div className="image-focal-preview-card">
                <span className="image-focal-preview-title">Hero / Card Frame (Portrait)</span>
                <div className="image-focal-frame portrait">
                  <img
                    src={cleanUrl}
                    alt="Portrait Preview"
                    style={{ objectPosition: `${posX}% ${posY}%` }}
                  />
                </div>
              </div>

              {/* Square / Circle Preview (like avatar or icon) */}
              <div className="image-focal-preview-card">
                <span className="image-focal-preview-title">Avatar / Shop Thumbnail (1:1)</span>
                <div className="image-focal-frame square">
                  <img
                    src={cleanUrl}
                    alt="Square Preview"
                    style={{ objectPosition: `${posX}% ${posY}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="image-focal-coordinates-badge">
              Focal Point: <strong>X: {posX}%</strong>, <strong>Y: {posY}%</strong>
            </div>
          </div>
        </div>

        <footer className="image-focal-footer">
          <button type="button" className="image-focal-cancel-btn" onClick={onClose}>
            Cancel
          </button>
          <button type="button" className="image-focal-save-btn" onClick={handleSave}>
            Apply Framing
          </button>
        </footer>
      </div>
    </div>
  );
}
