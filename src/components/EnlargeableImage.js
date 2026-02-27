import { useState } from 'react';

export default function EnlargeableImage({ data, mimeType = 'image/png' }) {
  const [enlarged, setEnlarged] = useState(false);
  const src = `data:${mimeType};base64,${data}`;

  const handleDownload = (e) => {
    e.stopPropagation();
    const link = document.createElement('a');
    link.download = `generated_image.png`;
    link.href = src;
    link.click();
  };

  return (
    <div
      className={`generated-image-wrap ${enlarged ? 'enlarged' : ''}`}
      onClick={() => setEnlarged(!enlarged)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && setEnlarged(!enlarged)}
    >
      <img src={src} alt="Generated" />
      {enlarged && (
        <div className="generated-image-actions">
          <button type="button" onClick={handleDownload}>
            Download
          </button>
          <button type="button" onClick={(e) => { e.stopPropagation(); setEnlarged(false); }}>
            Close
          </button>
        </div>
      )}
    </div>
  );
}
