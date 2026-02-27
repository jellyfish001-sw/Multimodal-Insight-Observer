// ── Image generation via OpenAI DALL-E or Gemini ────────────────────────────

const OPENAI_KEY = process.env.REACT_APP_OPENAI_API_KEY || '';
const GEMINI_KEY = process.env.REACT_APP_GEMINI_API_KEY || '';
const USE_OPENAI = !!OPENAI_KEY;

// Create File from base64 (browser-compatible; dall-e-2 requires PNG file)
function base64ToFile(base64, filename, mimeType) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], { type: mimeType || 'image/png' });
  return new File([blob], filename, { type: mimeType || 'image/png' });
}

export async function generateImage(prompt, anchorImageBase64, mimeType = 'image/png') {
  if (USE_OPENAI && OPENAI_KEY) {
    try {
      const OpenAI = (await import('openai')).default;
      const openai = new OpenAI({ apiKey: OPENAI_KEY });
      const imageFile = base64ToFile(anchorImageBase64, 'image.png', mimeType || 'image/png');
      const response = await openai.images.edit({
        model: 'dall-e-2',
        image: imageFile,
        prompt: prompt || 'Transform this image while keeping the main subject.',
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      });
      const b64 = response.data?.[0]?.b64_json;
      if (b64) return { data: b64, mimeType: 'image/png' };
      const url = response.data?.[0]?.url;
      if (url) {
        const imgRes = await fetch(url);
        const blob = await imgRes.blob();
        const arrBuf = await blob.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrBuf)));
        return { data: base64, mimeType: blob.type || 'image/png' };
      }
      return { error: 'No image was generated.' };
    } catch (err) {
      // DALL-E edit may not support all formats; fallback to variations or error
      if (err.code === 'invalid_image' || err.message?.includes('edit')) {
        return { error: 'Image edit failed. Try a different image or prompt.' };
      }
      console.error('[generateImage OpenAI]', err);
      return { error: err.message || 'Image generation failed.' };
    }
  }

  if (!GEMINI_KEY) {
    return { error: 'API key not configured. Add REACT_APP_OPENAI_API_KEY or REACT_APP_GEMINI_API_KEY to .env' };
  }

  try {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const genAI = new GoogleGenerativeAI(GEMINI_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const parts = [
      { text: `Generate a new image based on this reference image and the following prompt. Output the generated image:\n\n${prompt}` },
      { inlineData: { mimeType: mimeType || 'image/png', data: anchorImageBase64 } },
    ];
    const result = await model.generateContent(parts);
    const response = result.response;
    const candidates = response.candidates || [];
    for (const c of candidates) {
      const content = c.content?.parts || [];
      for (const p of content) {
        if (p.inlineData?.data) {
          return { data: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/png' };
        }
      }
    }
    return { error: 'No image was generated. The model may not support image output.' };
  } catch (err) {
    console.error('[generateImage Gemini]', err);
    return { error: err.message || 'Image generation failed.' };
  }
}
