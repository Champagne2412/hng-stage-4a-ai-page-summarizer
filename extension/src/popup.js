/**
 * popup.js — Popup UI Controller
 * Handles all user interactions and state management in the popup.
 */

"use strict";

// ── DOM refs ────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

const dom = {
  // Page info
  pageTitle: $("page-title"),
  pageUrl: $("page-url"),

  // Views
  viewMain: $("view-main"),
  viewSettings: $("view-settings"),

  // States
  stateEmpty: $("state-empty"),
  stateLoading: $("state-loading"),
  stateError: $("state-error"),
  stateResults: $("state-results"),

  // Buttons
  btnSummarize: $("btn-summarize"),
  btnClear: $("btn-clear"),
  btnSettings: $("btn-settings"),
  btnHome: $("btn-home"),
  btnCopy: $("btn-copy"),
  btnHighlight: $("btn-highlight"),
  btnRefresh: $("btn-refresh"),
  btnSaveSettings: $("btn-save-settings"),
  btnClearCache: $("btn-clear-cache"),
  btnToggleKey: $("btn-toggle-key"),

  // Results
  metaBar: $("meta-bar"),
  resultSummary: $("result-summary"),
  resultBullets: $("result-bullets"),
  resultInsights: $("result-insights"),
  insightsSection: $("insights-section"),
  resultsFooter: $("results-footer"),

  // Loading
  loadingText: $("loading-text"),
  btnLabel: $("btn-label"),

  // Error
  errorMessage: $("error-message"),

  // Settings
  selProvider: $("sel-provider"),
  selModel: $("sel-model"),
  inputApiKey: $("input-api-key"),

  // Toast
  toast: $("toast"),
};

// ── App State ────────────────────────────────────────────────
let currentTab = null;
let currentSummary = null;
let highlightActive = false;
let selectedStyle = "detailed";
let loadingMessages = null;

const LOADING_STEPS = [
  "Extracting content…",
  "Analyzing structure…",
  "Asking AI…",
  "Formatting summary…",
];

// ── Init ────────────────────────────────────────────────────
async function init() {
  // Guard: must run as a Chrome Extension, not a web page
  if (typeof chrome === "undefined" || !chrome.tabs || !chrome.storage) {
    dom.pageTitle.textContent = "Not loaded as extension";
    showError(
      "This popup must be opened as a Chrome Extension — not a local file or web server. " +
      "Go to chrome://extensions → Load unpacked → select this folder."
    );
    return;
  }

  try {
    currentTab = await getCurrentTab();
    if (currentTab) {
      dom.pageTitle.textContent = currentTab.title || "Untitled Page";
      dom.pageUrl.textContent = currentTab.url || "";

      // Warn if this page can't be summarized
      const url = currentTab.url || "";
      if (
        url.startsWith("chrome://") ||
        url.startsWith("chrome-extension://") ||
        url.startsWith("edge://") ||
        url.startsWith("about:") ||
        url.startsWith("https://chrome.google.com/webstore")
      ) {
        dom.pageTitle.textContent = "⚠ Unsupported page";
        dom.pageUrl.textContent = "Navigate to a regular webpage to summarize";
        dom.btnSummarize.disabled = true;
      }
    }

    await loadSettings();
    bindEvents();
  } catch (err) {
    showError("Failed to initialize: " + err.message);
  }
}

async function getCurrentTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(tabs[0] || null);
      }
    });
  });
}

// ── Settings ────────────────────────────────────────────────
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(
      { apiProvider: "openai", apiKey: "", model: "gpt-4o-mini", summaryStyle: "detailed" },
      (settings) => {
        dom.selProvider.value = settings.apiProvider;
        dom.selModel.value = settings.model;
        dom.inputApiKey.value = settings.apiKey;
        selectedStyle = settings.summaryStyle || "detailed";
        updateStyleButtons();
        updateModelOptions(settings.apiProvider);
        resolve(settings);
      }
    );
  });
}

function updateModelOptions(provider) {
  const modelMap = {
    openai: [
      { value: "gpt-4o-mini", label: "GPT-4o Mini (Fast, cheap)" },
      { value: "gpt-4o", label: "GPT-4o (Best quality)" },
      { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo (Legacy)" },
    ],
    gemini: [
      { value: "gemini-2.0-flash", label: "Gemini 2.0 Flash (Recommended)" },
      { value: "gemini-1.5-flash-latest", label: "Gemini 1.5 Flash (Stable)" },
      { value: "gemini-1.5-pro-latest", label: "Gemini 1.5 Pro (Best quality)" },
    ],
    groq: [
      { value: "llama-3.3-70b-versatile", label: "Llama 3.3 70B (Best — FREE)" },
      { value: "llama-3.1-8b-instant", label: "Llama 3.1 8B (Fastest — FREE)" },
      { value: "mixtral-8x7b-32768", label: "Mixtral 8x7B (Good — FREE)" },
      { value: "gemma2-9b-it", label: "Gemma 2 9B (Light — FREE)" },
    ],
    mistral: [
      { value: "mistral-small-latest", label: "Mistral Small (Recommended — FREE)" },
      { value: "open-mistral-7b", label: "Mistral 7B (Fastest — FREE)" },
      { value: "open-mixtral-8x7b", label: "Mixtral 8x7B (Best free)" },
    ],
  };

  const models = modelMap[provider] || modelMap.openai;
  dom.selModel.innerHTML = models
    .map((m) => `<option value="${m.value}">${m.label}</option>`)
    .join("");

  // Set first as default if current selection doesn't match provider
  const values = models.map((m) => m.value);
  if (!values.includes(dom.selModel.value)) {
    dom.selModel.value = values[0];
  }
}

function saveSettings() {
  const settings = {
    apiProvider: dom.selProvider.value,
    apiKey: dom.inputApiKey.value.trim(),
    model: dom.selModel.value,
    summaryStyle: selectedStyle,
  };

  chrome.storage.sync.set(settings, () => {
    showToast("✓ Settings saved");
    showMainView();
  });
}

// ── Events ───────────────────────────────────────────────────
function bindEvents() {
  // Summarize
  dom.btnSummarize.addEventListener("click", () => summarizePage(false));
  dom.btnRefresh.addEventListener("click", () => summarizePage(true));
  dom.btnClear.addEventListener("click", clearResults);

  // Navigation
  dom.btnSettings.addEventListener("click", showSettingsView);
  dom.btnHome.addEventListener("click", showMainView);

  // Results actions
  dom.btnCopy.addEventListener("click", copySummary);
  dom.btnHighlight.addEventListener("click", toggleHighlights);

  // Settings
  dom.selProvider.addEventListener("change", () => updateModelOptions(dom.selProvider.value));
  dom.btnSaveSettings.addEventListener("click", saveSettings);
  dom.btnClearCache.addEventListener("click", clearAllCache);
  dom.btnToggleKey.addEventListener("click", toggleKeyVisibility);

  // Style buttons
  document.querySelectorAll(".style-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedStyle = btn.dataset.style;
      updateStyleButtons();
      chrome.storage.sync.set({ summaryStyle: selectedStyle });
    });
  });

  // Keyboard: Enter on summarize button
  dom.btnSummarize.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") dom.btnSummarize.click();
  });
}

function updateStyleButtons() {
  document.querySelectorAll(".style-btn").forEach((btn) => {
    const isActive = btn.dataset.style === selectedStyle;
    btn.classList.toggle("active", isActive);
    btn.setAttribute("aria-pressed", String(isActive));
  });
}

// ── Summarize Flow ───────────────────────────────────────────
async function summarizePage(forceRefresh = false) {
  if (!currentTab) return showError("No active tab found.");

  showState("loading");
  dom.btnSummarize.disabled = true;
  dom.btnClear.style.display = "none";
  dom.resultsFooter.style.display = "none";

  // Animated loading steps
  let step = 0;
  dom.loadingText.textContent = LOADING_STEPS[step];
  loadingMessages = setInterval(() => {
    step = (step + 1) % LOADING_STEPS.length;
    dom.loadingText.textContent = LOADING_STEPS[step];
  }, 1800);

  try {
    // Step 1: Extract content from page
    const extracted = await sendToContent({ type: "EXTRACT_CONTENT" });
    if (!extracted?.success) {
      throw new Error(extracted?.error || "Could not extract page content.");
    }

    // Step 2: Send to background for AI processing
    const result = await sendToBackground({
      type: "SUMMARIZE",
      content: extracted.text,
      url: currentTab.url,
      forceRefresh,
    });

    if (!result?.success) {
      throw new Error(result?.error || "AI request failed.");
    }

    currentSummary = result.summary;
    renderResults(result.summary, result.fromCache);

  } catch (err) {
    clearInterval(loadingMessages);
    showError(err.message || "An unexpected error occurred.");
    dom.btnSummarize.disabled = false;
    return;
  }

  clearInterval(loadingMessages);
  dom.btnSummarize.disabled = false;
  dom.btnLabel.textContent = "Re-summarize";
  dom.btnClear.style.display = "block";
}

// ── Render Results ───────────────────────────────────────────
function renderResults(summary, fromCache = false) {
  // Meta chips
  dom.metaBar.innerHTML = "";

  if (summary.readingTimeMinutes) {
    dom.metaBar.appendChild(createChip(`⏱ ${summary.readingTimeMinutes} min read`));
  }
  if (summary.wordCount) {
    dom.metaBar.appendChild(createChip(`📄 ~${summary.wordCount.toLocaleString()} words`));
  }
  if (summary.sentiment) {
    const icons = { positive: "😊", neutral: "😐", negative: "😟" };
    const chip = createChip(`${icons[summary.sentiment] || "🔵"} ${capitalize(summary.sentiment)}`);
    chip.classList.add(`sentiment-${summary.sentiment}`);
    dom.metaBar.appendChild(chip);
  }
  if (fromCache) {
    const chip = createChip("⚡ Cached");
    chip.classList.add("cached");
    dom.metaBar.appendChild(chip);
  }

  // Overview
  // Safe: textContent only
  dom.resultSummary.textContent = summary.summary || "";

  // Bullets
  dom.resultBullets.innerHTML = "";
  (summary.bullets || []).forEach((bullet) => {
    const li = document.createElement("li");
    li.className = "bullet-item";
    const dot = document.createElement("span");
    dot.className = "bullet-dot";
    const text = document.createElement("span");
    text.textContent = bullet; // safe: textContent
    li.appendChild(dot);
    li.appendChild(text);
    dom.resultBullets.appendChild(li);
  });

  // Insights
  dom.resultInsights.innerHTML = "";
  const insights = summary.keyInsights || [];
  if (insights.length > 0) {
    dom.insightsSection.style.display = "";
    insights.forEach((insight) => {
      const div = document.createElement("div");
      div.className = "insight-item";
      const icon = document.createElement("span");
      icon.className = "insight-icon";
      icon.textContent = "→";
      const text = document.createElement("span");
      text.textContent = insight; // safe: textContent
      div.appendChild(icon);
      div.appendChild(text);
      dom.resultInsights.appendChild(div);
    });
  } else {
    dom.insightsSection.style.display = "none";
  }

  showState("results");
  dom.resultsFooter.style.display = "flex";
}

function createChip(text) {
  const div = document.createElement("div");
  div.className = "meta-chip";
  div.textContent = text; // safe: textContent
  return div;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ── Actions ──────────────────────────────────────────────────
function clearResults() {
  currentSummary = null;
  highlightActive = false;
  dom.btnHighlight.classList.remove("highlight-active");
  dom.btnHighlight.textContent = "✨ Highlight";
  dom.resultsFooter.style.display = "none";
  dom.btnClear.style.display = "none";
  dom.btnLabel.textContent = "Summarize Page";

  // Clear page highlights
  sendToContent({ type: "CLEAR_HIGHLIGHTS" }).catch(() => {});
  showState("empty");
}

async function copySummary() {
  if (!currentSummary) return;

  const lines = [
    currentSummary.summary,
    "",
    "Key Points:",
    ...(currentSummary.bullets || []).map((b) => `• ${b}`),
  ];

  if ((currentSummary.keyInsights || []).length) {
    lines.push("", "Insights:");
    (currentSummary.keyInsights || []).forEach((i) => lines.push(`→ ${i}`));
  }

  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    showToast("✓ Copied to clipboard");
    dom.btnCopy.textContent = "✓ Copied!";
    setTimeout(() => (dom.btnCopy.textContent = "📋 Copy"), 2000);
  } catch (err) {
    showToast("Failed to copy");
  }
}

async function toggleHighlights() {
  if (!currentSummary?.highlights?.length) return showToast("No phrases to highlight");

  if (highlightActive) {
    await sendToContent({ type: "CLEAR_HIGHLIGHTS" });
    highlightActive = false;
    dom.btnHighlight.classList.remove("highlight-active");
    dom.btnHighlight.textContent = "✨ Highlight";
    showToast("Highlights cleared");
  } else {
    const result = await sendToContent({
      type: "HIGHLIGHT",
      phrases: currentSummary.highlights,
    });
    highlightActive = true;
    dom.btnHighlight.classList.add("highlight-active");
    dom.btnHighlight.textContent = "✕ Clear";
    showToast(result?.count ? `Highlighted ${result.count} phrases` : "Highlighted key phrases");
  }
}

function toggleKeyVisibility() {
  const input = dom.inputApiKey;
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  dom.btnToggleKey.textContent = isPassword ? "🙈" : "👁";
}

async function clearAllCache() {
  await sendToBackground({ type: "CLEAR_ALL_CACHE" });
  showToast("✓ Cache cleared");
}

// ── State/View Management ────────────────────────────────────
function showState(stateName) {
  ["empty", "loading", "error", "results"].forEach((name) => {
    const el = $(`state-${name}`);
    el.classList.toggle("visible", name === stateName);
  });
}

function showSettingsView() {
  dom.viewMain.style.display = "none";
  dom.viewSettings.style.display = "block";
  dom.btnSettings.style.display = "none";
  dom.btnHome.style.display = "flex";
}

function showMainView() {
  dom.viewMain.style.display = "block";
  dom.viewSettings.style.display = "none";
  dom.btnSettings.style.display = "flex";
  dom.btnHome.style.display = "none";
}

function showError(message) {
  dom.errorMessage.textContent = message; // safe: textContent
  showState("error");
}

// ── Toast ────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, duration = 2200) {
  dom.toast.textContent = message;
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), duration);
}

// ── Messaging Helpers ────────────────────────────────────────
function sendToBackground(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(response);
      }
    });
  });
}

/**
 * Inject the content script if not already present, then send a message.
 * Fixes "Receiving end does not exist" on tabs that haven't been refreshed
 * since the extension was installed/updated.
 */
async function sendToContent(message) {
  if (!currentTab?.id) return { success: false, error: "No active tab found." };

  const tabId = currentTab.id;
  const url = currentTab.url || "";

  // Block non-injectable pages up front with a clear message
  if (
    url.startsWith("chrome://") ||
    url.startsWith("chrome-extension://") ||
    url.startsWith("edge://") ||
    url.startsWith("about:") ||
    url.startsWith("https://chrome.google.com/webstore")
  ) {
    return {
      success: false,
      error: "Cannot summarize this page. Navigate to a regular website (e.g. a news article or Wikipedia) and try again.",
    };
  }

  // First attempt — content script may already be injected
  const first = await trySendMessage(tabId, message);
  if (first !== null) return first;

  // Not injected yet — inject it now programmatically
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content.js"],
    });
  } catch (err) {
    return {
      success: false,
      error: `Could not inject content script: ${err.message}. Try refreshing the page.`,
    };
  }

  // Small delay to let the script initialise
  await new Promise((r) => setTimeout(r, 150));

  // Second attempt after injection
  const second = await trySendMessage(tabId, message);
  if (second !== null) return second;

  return {
    success: false,
    error: "Content script did not respond. Please refresh the page and try again.",
  };
}

/** Send a message and return the response, or null if the receiving end doesn't exist. */
function trySendMessage(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message || "";
        if (msg.includes("Receiving end does not exist") || msg.includes("Could not establish connection")) {
          resolve(null); // signal: not injected yet
        } else {
          resolve({ success: false, error: msg });
        }
      } else {
        resolve(response);
      }
    });
  });
}

// ── Start ────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", init);
