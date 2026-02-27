// ── AI service: uses OpenAI gpt-5-nano (or Gemini fallback) ─────────────────
// Primary: OpenAI gpt-5-nano for all AI processing
// Fallback: Gemini when OpenAI key not configured

import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { CSV_TOOL_DECLARATIONS } from './csvTools';
import { JSON_TOOL_DECLARATIONS } from './jsonTools';
import { IMAGE_TOOL_DECLARATIONS } from './imageTools';

const OPENAI_KEY = process.env.REACT_APP_OPENAI_API_KEY || '';
const GEMINI_KEY = process.env.REACT_APP_GEMINI_API_KEY || '';
const USE_OPENAI = !!OPENAI_KEY;

const openai = OPENAI_KEY ? new OpenAI({ apiKey: OPENAI_KEY }) : null;
const genAI = GEMINI_KEY ? new GoogleGenerativeAI(GEMINI_KEY) : null;

const MODEL_OPENAI = 'gpt-5-nano';
const MODEL_GEMINI = 'gemini-2.5-flash';

const SEARCH_TOOL = { googleSearch: {} };
const CODE_EXEC_TOOL = { codeExecution: {} };

export const CODE_KEYWORDS = /\b(plot|chart|graph|analyz|statistic|regression|correlat|histogram|visualiz|calculat|compute|run code|write code|execute|pandas|numpy|matplotlib|csv|data)\b/i;

// Convert Gemini-style tool declarations to OpenAI format
function toOpenAITools(declarations) {
  return (declarations || []).map((d) => ({
    type: 'function',
    function: {
      name: d.name,
      description: d.description || '',
      parameters: normalizeParams(d.parameters || {}),
    },
  }));
}

function normalizeParams(params) {
  const p = { ...params };
  if (p.type === 'OBJECT') p.type = 'object';
  if (p.properties) {
    p.properties = Object.fromEntries(
      Object.entries(p.properties).map(([k, v]) => [k, normalizeProp(v)])
    );
  }
  return p;
}

function normalizeProp(prop) {
  const v = { ...prop };
  if (v.type === 'STRING') v.type = 'string';
  if (v.type === 'NUMBER') v.type = 'number';
  if (v.type === 'BOOLEAN') v.type = 'boolean';
  if (v.type === 'ARRAY') v.type = 'array';
  if (v.type === 'OBJECT') v.type = 'object';
  return v;
}

let cachedPrompt = null;

async function loadSystemPrompt() {
  if (cachedPrompt) return cachedPrompt;
  try {
    const res = await fetch('/prompt_chat.txt');
    cachedPrompt = res.ok ? (await res.text()).trim() : '';
  } catch {
    cachedPrompt = '';
  }
  return cachedPrompt;
}

// Build messages array for OpenAI
function buildMessages(systemInstruction, baseHistory, newMessage, imageParts = []) {
  const messages = [];
  if (systemInstruction) {
    messages.push({ role: 'system', content: `Follow these instructions in every response:\n\n${systemInstruction}` });
  }
  for (const m of baseHistory) {
    messages.push({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content || '',
    });
  }
  const content = [];
  if (newMessage) content.push({ type: 'text', text: newMessage });
  for (const img of imageParts) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:${img.mimeType || 'image/png'};base64,${img.data}` },
    });
  }
  messages.push({ role: 'user', content: content.length === 1 && content[0].type === 'text' ? content[0].text : content });
  return messages;
}

// ── OpenAI: streamChat ─────────────────────────────────────────────────────
async function* streamChatOpenAI(history, newMessage, imageParts = [], useCodeExecution = false) {
  const systemInstruction = await loadSystemPrompt();
  const baseHistory = history.map((m) => ({
    role: m.role,
    content: m.content || '',
  }));
  const messages = buildMessages(systemInstruction, baseHistory, newMessage, imageParts);

  const tools = useCodeExecution ? [{ type: 'code_interpreter' }] : undefined;
  // gpt-5-nano: no built-in search/code_execution like Gemini; use plain chat
  const opts = {
    model: MODEL_OPENAI,
    messages,
    stream: true,
  };

  const stream = await openai.chat.completions.create(opts);
  let fullContent = '';
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (delta) {
      fullContent += delta;
      yield { type: 'text', text: delta };
    }
  }
}

// ── Gemini fallback: streamChat ────────────────────────────────────────────
async function* streamChatGemini(history, newMessage, imageParts = [], useCodeExecution = false) {
  const systemInstruction = await loadSystemPrompt();
  const tools = useCodeExecution ? [CODE_EXEC_TOOL] : [SEARCH_TOOL];
  const model = genAI.getGenerativeModel({ model: MODEL_GEMINI, tools });

  const baseHistory = history.map((m) => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.content || '' }],
  }));

  const chatHistory = systemInstruction
    ? [
        { role: 'user', parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }] },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;

  const chat = model.startChat({ history: chatHistory });
  const parts = [
    { text: newMessage },
    ...imageParts.map((img) => ({ inlineData: { mimeType: img.mimeType || 'image/png', data: img.data } })),
  ].filter((p) => p.text !== undefined || p.inlineData !== undefined);

  const result = await chat.sendMessageStream(parts);
  for await (const chunk of result.stream) {
    const chunkParts = chunk.candidates?.[0]?.content?.parts || [];
    for (const part of chunkParts) {
      if (part.text) yield { type: 'text', text: part.text };
    }
  }
  const response = await result.response;
  const allParts = response.candidates?.[0]?.content?.parts || [];
  const hasCodeExecution = allParts.some(
    (p) => p.executableCode || p.codeExecutionResult || (p.inlineData && p.inlineData.mimeType?.startsWith('image/'))
  );
  if (hasCodeExecution) {
    const structuredParts = allParts
      .map((p) => {
        if (p.text) return { type: 'text', text: p.text };
        if (p.executableCode) return { type: 'code', language: p.executableCode.language || 'PYTHON', code: p.executableCode.code };
        if (p.codeExecutionResult) return { type: 'result', outcome: p.codeExecutionResult.outcome, output: p.codeExecutionResult.output };
        if (p.inlineData) return { type: 'image', mimeType: p.inlineData.mimeType, data: p.inlineData.data };
        return null;
      })
      .filter(Boolean);
    yield { type: 'fullResponse', parts: structuredParts };
  }
  const grounding = response.candidates?.[0]?.groundingMetadata;
  if (grounding) yield { type: 'grounding', data: grounding };
}

export const streamChat = USE_OPENAI ? streamChatOpenAI : streamChatGemini;

// ── OpenAI: chatWithCsvTools ───────────────────────────────────────────────
async function chatWithCsvToolsOpenAI(history, newMessage, csvHeaders, executeFn) {
  const systemInstruction = await loadSystemPrompt();
  const baseHistory = history.map((m) => ({ role: m.role, content: m.content || '' }));
  const msgWithContext = csvHeaders?.length ? `[CSV columns: ${csvHeaders.join(', ')}]\n\n${newMessage}` : newMessage;
  const messages = buildMessages(systemInstruction, baseHistory, msgWithContext);
  const tools = toOpenAITools(CSV_TOOL_DECLARATIONS);

  const charts = [];
  const toolCalls = [];
  let response = await openai.chat.completions.create({
    model: MODEL_OPENAI,
    messages,
    tools: tools.length ? tools : undefined,
    tool_choice: tools.length ? 'auto' : undefined,
  });

  for (let round = 0; round < 5; round++) {
    const msg = response.choices?.[0]?.message;
    if (!msg?.tool_calls?.length) break;
    const messagesWithAssistant = [...messages];
    messagesWithAssistant.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name;
      const args = JSON.parse(tc.function?.arguments || '{}');
      const toolResult = executeFn(name, args);
      toolCalls.push({ name, args, result: toolResult });
      if (toolResult?._chartType) charts.push(toolResult);
      messagesWithAssistant.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(toolResult),
      });
    }
    response = await openai.chat.completions.create({
      model: MODEL_OPENAI,
      messages: messagesWithAssistant,
      tools,
      tool_choice: 'auto',
    });
  }

  const text = response.choices?.[0]?.message?.content || '';
  return { text, charts, toolCalls };
}

// ── Gemini: chatWithCsvTools ───────────────────────────────────────────────
async function chatWithCsvToolsGemini(history, newMessage, csvHeaders, executeFn) {
  const systemInstruction = await loadSystemPrompt();
  const model = genAI.getGenerativeModel({ model: MODEL_GEMINI, tools: [{ functionDeclarations: CSV_TOOL_DECLARATIONS }] });
  const baseHistory = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content || '' }] }));
  const chatHistory = systemInstruction
    ? [
        { role: 'user', parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }] },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;
  const chat = model.startChat({ history: chatHistory });
  const msgWithContext = csvHeaders?.length ? `[CSV columns: ${csvHeaders.join(', ')}]\n\n${newMessage}` : newMessage;
  let response = (await chat.sendMessage(msgWithContext)).response;
  const charts = [];
  const toolCalls = [];
  for (let round = 0; round < 5; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) break;
    const { name, args } = funcCall.functionCall;
    const toolResult = executeFn(name, args);
    toolCalls.push({ name, args, result: toolResult });
    if (toolResult?._chartType) charts.push(toolResult);
    response = (await chat.sendMessage([{ functionResponse: { name, response: { result: toolResult } } }])).response;
  }
  return { text: response.text(), charts, toolCalls };
}

export const chatWithCsvTools = USE_OPENAI ? chatWithCsvToolsOpenAI : chatWithCsvToolsGemini;

// ── OpenAI: chatWithJsonTools ──────────────────────────────────────────────
const ALL_JSON_TOOLS = [...JSON_TOOL_DECLARATIONS, ...IMAGE_TOOL_DECLARATIONS];

async function chatWithJsonToolsOpenAI(history, newMessage, jsonContext, executeFn) {
  const systemInstruction = await loadSystemPrompt();
  const baseHistory = history.map((m) => ({ role: m.role, content: m.content || '' }));
  const msgWithContext = jsonContext
    ? `[YouTube Channel JSON loaded: ${jsonContext.videoCount || 0} videos. Fields: ${(jsonContext.fields || []).join(', ')}]\n\n${newMessage}`
    : newMessage;
  const messages = buildMessages(systemInstruction, baseHistory, msgWithContext);
  const tools = toOpenAITools(ALL_JSON_TOOLS);

  const charts = [];
  const toolCalls = [];
  const generatedImages = [];
  let response = await openai.chat.completions.create({
    model: MODEL_OPENAI,
    messages,
    tools,
    tool_choice: 'auto',
  });

  for (let round = 0; round < 8; round++) {
    const msg = response.choices?.[0]?.message;
    if (!msg?.tool_calls?.length) break;
    const messagesWithAssistant = [...messages];
    messagesWithAssistant.push({ role: 'assistant', content: msg.content || null, tool_calls: msg.tool_calls });
    for (const tc of msg.tool_calls) {
      const name = tc.function?.name;
      const args = JSON.parse(tc.function?.arguments || '{}');
      let toolResult = executeFn(name, args);
      if (toolResult && typeof toolResult.then === 'function') toolResult = await toolResult;
      toolCalls.push({ name, args, result: toolResult });
      if (toolResult?._chartType) charts.push(toolResult);
      if (toolResult?._imageType === 'generated' && toolResult.data) generatedImages.push(toolResult);
      messagesWithAssistant.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(toolResult) });
    }
    response = await openai.chat.completions.create({
      model: MODEL_OPENAI,
      messages: messagesWithAssistant,
      tools,
      tool_choice: 'auto',
    });
  }

  const text = response.choices?.[0]?.message?.content || '';
  return { text, charts, toolCalls, generatedImages };
}

// ── Gemini: chatWithJsonTools ──────────────────────────────────────────────
async function chatWithJsonToolsGemini(history, newMessage, jsonContext, executeFn) {
  const systemInstruction = await loadSystemPrompt();
  const model = genAI.getGenerativeModel({ model: MODEL_GEMINI, tools: [{ functionDeclarations: ALL_JSON_TOOLS }] });
  const baseHistory = history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content || '' }] }));
  const chatHistory = systemInstruction
    ? [
        { role: 'user', parts: [{ text: `Follow these instructions in every response:\n\n${systemInstruction}` }] },
        { role: 'model', parts: [{ text: "Got it! I'll follow those instructions." }] },
        ...baseHistory,
      ]
    : baseHistory;
  const chat = model.startChat({ history: chatHistory });
  const msgWithContext = jsonContext
    ? `[YouTube Channel JSON loaded: ${jsonContext.videoCount || 0} videos. Fields: ${(jsonContext.fields || []).join(', ')}]\n\n${newMessage}`
    : newMessage;
  let response = (await chat.sendMessage(msgWithContext)).response;
  const charts = [];
  const toolCalls = [];
  const generatedImages = [];
  for (let round = 0; round < 8; round++) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const funcCall = parts.find((p) => p.functionCall);
    if (!funcCall) break;
    const { name, args } = funcCall.functionCall;
    let toolResult = executeFn(name, args);
    if (toolResult && typeof toolResult.then === 'function') toolResult = await toolResult;
    toolCalls.push({ name, args, result: toolResult });
    if (toolResult?._chartType) charts.push(toolResult);
    if (toolResult?._imageType === 'generated' && toolResult.data) generatedImages.push(toolResult);
    response = (await chat.sendMessage([{ functionResponse: { name, response: { result: toolResult } } }])).response;
  }
  return { text: response.text(), charts, toolCalls, generatedImages };
}

export const chatWithJsonTools = USE_OPENAI ? chatWithJsonToolsOpenAI : chatWithJsonToolsGemini;

// ── Final Synthesis (same OpenAI client as chat; Gemini fallback if no OpenAI key) ─
export async function generateFinalSynthesis(prompt) {
  if (openai) {
    const response = await openai.chat.completions.create({
      model: MODEL_OPENAI,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2048,
    });
    return response.choices?.[0]?.message?.content || 'No report generated.';
  }
  if (genAI) {
    const model = genAI.getGenerativeModel({ model: MODEL_GEMINI });
    const result = await model.generateContent(prompt);
    return result.response?.text?.() || 'No report generated.';
  }
  throw new Error('OpenAI API key not configured. Add REACT_APP_OPENAI_API_KEY to your .env file and restart the server.');
}
