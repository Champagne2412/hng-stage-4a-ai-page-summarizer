/**
 * background.js — Service Worker
 * Handles all AI API communication securely.
 * API keys never leave this context.
 */

const RATE_LIMIT = {
  maxRequests: 10,
  windowMs: 60_000,
  requests: [],
};

/**
 * Check if request is within rate limits
 */
function isRateLimited() {
  const now = Date.now();
  RATE_LIMIT.requests = RATE_LIMIT.requests.filter(
    (t) => now - t < RATE_LIMIT.windowMs,
  );
  if (RATE_LIMIT.requests.length >= RATE_LIMIT.maxRequests) return true;
  RATE_LIMIT.requests.push(now);
  return false;
}

/**
 * Proxy URL — the only config needed in the extension.
 * API key lives on Vercel, never here.
 *
 * After deploying to Vercel, replace this URL with your deployment URL.
 * e.g. "https://ai-summarizer-proxy.vercel.app"
 */
const PROXY_URL = "https://hng-stage-4a-ai-page-summarizer.vercel.app";

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get({ summaryStyle: "detailed" }, resolve);
  });
}

/**
 * Build the AI prompt based on style preference
 */
function buildPrompt(content, style) {
  const styleInstructions = {
    brief: "Provide a very concise summary in exactly 3 bullet points.",
    detailed: "Provide a comprehensive summary with 5-7 bullet points.",
    academic: "Provide a structured academic analysis.",
  };

  return `You are an expert content analyst. Analyze the following webpage content and respond ONLY with valid JSON.

${styleInstructions[style] || styleInstructions.detailed}

Respond with this exact JSON structure:
{
  "title": "Page topic in 5-8 words",
  "summary": "2-3 sentence overview of the main content",
  "bullets": ["bullet point 1", "bullet point 2", "bullet point 3"],
  "keyInsights": ["insight 1", "insight 2"],
  "wordCount": <estimated word count as number>,
  "readingTimeMinutes": <estimated minutes as number>,
  "sentiment": "positive|neutral|negative",
  "highlights": ["short phrase to highlight on page 1", "short phrase 2"]
}

WEBPAGE CONTENT:
---
${content.slice(0, 12000)}
---`;
}

/**
 * Call the Vercel proxy — no API key needed in the extension.
 * The proxy handles the Groq API call server-side.
 */
async function callProxy(content, style) {
  const response = await fetch(`${PROXY_URL}/api/summarize`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, style }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || `Proxy error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Proxy returned failure");
  return data.summary;
}

/**
 * Call Gemini API
 */
async function callGemini(content, settings) {
  const model = settings.model || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${settings.apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        { parts: [{ text: buildPrompt(content, settings.summaryStyle) }] },
      ],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1000 },
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(
      err?.error?.message || `Gemini API error: ${response.status}`,
    );
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini");
  return JSON.parse(text.replace(/```json|```/g, "").trim());
}

/**
 * Generate a cache key from URL
 */
function cacheKey(url, style) {
  return `summary_${style}_${url}`;
}

/**
 * Main message listener
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SUMMARIZE") {
    handleSummarize(message)
      .then(sendResponse)
      .catch((err) => {
        sendResponse({ success: false, error: err.message });
      });
    return true; // keep channel open for async
  }

  if (message.type === "CLEAR_CACHE") {
    chrome.storage.local.remove(message.key || [], () => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === "CLEAR_ALL_CACHE") {
    chrome.storage.local.clear(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

async function handleSummarize({ content, url, forceRefresh }) {
  const settings = await getSettings();
  const key = cacheKey(url, settings.summaryStyle);

  // Check cache unless forced refresh
  if (!forceRefresh) {
    const cached = await new Promise((resolve) => {
      chrome.storage.local.get(key, (res) => resolve(res[key] || null));
    });

    if (cached && Date.now() - cached.timestamp < 3_600_000) {
      return { success: true, summary: cached.data, fromCache: true };
    }
  }

  // Rate limiting
  if (isRateLimited()) {
    throw new Error("Too many requests. Please wait a moment.");
  }

  // Validate content
  if (!content || content.trim().length < 50) {
    throw new Error("Not enough readable content found on this page.");
  }

  // Call Vercel proxy — API key never touches the extension
  const summary = await callProxy(content, settings.summaryStyle);

  // Validate response shape
  if (!summary.bullets || !Array.isArray(summary.bullets)) {
    throw new Error("Unexpected AI response format. Please try again.");
  }

  // Store in cache
  await new Promise((resolve) => {
    chrome.storage.local.set(
      { [key]: { data: summary, timestamp: Date.now(), url } },
      resolve,
    );
  });

  return { success: true, summary, fromCache: false };
}
