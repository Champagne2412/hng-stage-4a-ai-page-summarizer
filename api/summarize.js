/**
 * api/summarize.js — Vercel Serverless Function
 * Acts as a secure proxy between the Chrome Extension and Groq API.
 * The API key lives ONLY in Vercel environment variables — never in the extension.
 */

export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // CORS — allow requests from Chrome Extensions
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Handle preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  const { content, style } = req.body;

  // Validate input
  if (!content || typeof content !== "string") {
    return res.status(400).json({ error: "Missing or invalid content" });
  }

  if (content.trim().length < 50) {
    return res.status(400).json({ error: "Content too short to summarize" });
  }

  // API key lives ONLY here in Vercel env vars — never sent to client
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server misconfiguration: API key not set" });
  }

  const styleInstructions = {
    brief: "Provide a very concise summary in exactly 3 bullet points.",
    detailed: "Provide a comprehensive summary with 5-7 bullet points.",
    academic: "Provide a structured academic analysis.",
  };

  const prompt = `You are an expert content analyst. Analyze the following webpage content and respond ONLY with valid JSON.

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

  try {
    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1000,
        temperature: 0.3,
      }),
    });

    if (!groqResponse.ok) {
      const err = await groqResponse.json().catch(() => ({}));
      return res.status(groqResponse.status).json({
        error: err?.error?.message || `Groq API error: ${groqResponse.status}`,
      });
    }

    const data = await groqResponse.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) {
      return res.status(500).json({ error: "Empty response from Groq" });
    }

    // Parse and validate JSON response
    const summary = JSON.parse(text.replace(/```json|```/g, "").trim());

    if (!summary.bullets || !Array.isArray(summary.bullets)) {
      return res.status(500).json({ error: "Unexpected AI response format" });
    }

    return res.status(200).json({ success: true, summary });

  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
