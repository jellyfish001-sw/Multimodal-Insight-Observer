// ── Visual reaction analysis via AI (OpenAI gpt-5-nano or Gemini) ────────────

const OPENAI_KEY = process.env.REACT_APP_OPENAI_API_KEY || '';
const GEMINI_KEY = process.env.REACT_APP_GEMINI_API_KEY || '';
const USE_OPENAI = !!OPENAI_KEY;

export async function analyzeVisualReactions(images, videoTitle = '') {
  const prompt = `You are analyzing a series of images (up to 20) captured of a viewer while they watched a YouTube video${videoTitle ? ` titled "${videoTitle}"` : ''}. 
Describe the viewer's reactions and expressions over time. Include:
- Overall emotional reactions (e.g., surprised, amused, focused, smiling, neutral)
- Notable moments (e.g., "At one point they smiled", "They looked surprised around the middle")
- Any patterns in their engagement
Write a concise, well-formatted visual evaluation report (2-4 paragraphs). Be specific about what you observe. Use markdown for nice formatting.`;

  if (USE_OPENAI) {
    const OpenAI = (await import('openai')).default;
    const openai = new OpenAI({ apiKey: OPENAI_KEY });
    const content = [
      { type: 'text', text: prompt },
      ...images.map((img) => ({
        type: 'image_url',
        image_url: { url: `data:${img.mimeType || 'image/jpeg'};base64,${img.data}` },
      })),
    ];
    const response = await openai.chat.completions.create({
      model: 'gpt-5-nano',
      messages: [{ role: 'user', content }],
      max_tokens: 1024,
    });
    return response.choices?.[0]?.message?.content || 'No analysis generated.';
  }

  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(GEMINI_KEY);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  const parts = [{ text: prompt }];
  for (const img of images) {
    parts.push({ inlineData: { mimeType: img.mimeType || 'image/jpeg', data: img.data } });
  }
  const result = await model.generateContent(parts);
  return result.response.text();
}
