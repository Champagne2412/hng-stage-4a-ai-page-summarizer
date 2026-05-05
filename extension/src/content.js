/**
 * content.js — Content Script
 * Extracts readable content from the page and handles highlighting.
 * Runs in the page context but communicates only via Chrome messaging.
 */

(function () {
  "use strict";

  // Track highlight elements for cleanup
  let highlightMarks = [];
  let highlightActive = false;

  /**
   * Extract meaningful text content from the page
   * Prioritizes: article > main > body, strips nav/footer/ads
   */
  function extractContent() {
    const unwantedSelectors = [
      "nav", "header", "footer", "aside",
      ".sidebar", ".advertisement", ".ad", ".ads", ".cookie-banner",
      ".newsletter", ".popup", ".modal", ".overlay",
      "[role='navigation']", "[role='banner']", "[role='complementary']",
      "script", "style", "noscript", "iframe",
    ];

    const clone = document.body.cloneNode(true);

    // Remove unwanted elements
    unwantedSelectors.forEach((sel) => {
      clone.querySelectorAll(sel).forEach((el) => el.remove());
    });

    // Try to find the main article content
    const candidates = [
      clone.querySelector("article"),
      clone.querySelector('[role="main"]'),
      clone.querySelector("main"),
      clone.querySelector(".post-content"),
      clone.querySelector(".article-content"),
      clone.querySelector(".entry-content"),
      clone.querySelector(".content"),
      clone.querySelector("#content"),
      clone,
    ];

    let bestCandidate = null;
    let bestScore = 0;

    for (const candidate of candidates) {
      if (!candidate) continue;
      const text = candidate.innerText || candidate.textContent || "";
      const wordCount = text.trim().split(/\s+/).length;
      const paragraphs = candidate.querySelectorAll("p").length;
      const score = wordCount * 0.7 + paragraphs * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestCandidate = candidate;
      }
    }

    const raw = (bestCandidate?.innerText || document.body.innerText || "")
      .replace(/\s{3,}/g, "\n\n")  // collapse excessive whitespace
      .replace(/\n{4,}/g, "\n\n")  // collapse excessive newlines
      .trim();

    return {
      text: raw,
      title: document.title,
      url: location.href,
      wordCount: raw.split(/\s+/).length,
    };
  }

  /**
   * Highlight phrases in the document using <mark> elements
   * Safe: sanitizes phrases before using in DOM
   */
  function highlightPhrases(phrases) {
    clearHighlights();
    if (!phrases || !phrases.length) return;

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const tag = node.parentElement?.tagName?.toLowerCase();
          if (["script", "style", "noscript"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    for (const phrase of phrases) {
      // Sanitize: escape special regex chars
      const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`(${escaped})`, "gi");

      for (const textNode of textNodes) {
        if (!regex.test(textNode.textContent)) continue;
        regex.lastIndex = 0;

        const parts = textNode.textContent.split(regex);
        if (parts.length <= 1) continue;

        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (regex.test(part)) {
            const mark = document.createElement("mark");
            mark.style.cssText = `
              background: linear-gradient(120deg, #fbbf24 0%, #f59e0b 100%);
              color: #1a1a1a;
              padding: 0 2px;
              border-radius: 2px;
              font-weight: 500;
            `;
            // Safe: textContent assignment, never innerHTML
            mark.textContent = part;
            highlightMarks.push(mark);
            frag.appendChild(mark);
          } else {
            frag.appendChild(document.createTextNode(part));
          }
          regex.lastIndex = 0;
        }

        textNode.parentNode?.replaceChild(frag, textNode);
      }
    }

    highlightActive = true;

    // Scroll to first highlight
    if (highlightMarks.length > 0) {
      highlightMarks[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /**
   * Remove all highlights from the page
   */
  function clearHighlights() {
    highlightMarks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        parent.normalize();
      }
    });
    highlightMarks = [];
    highlightActive = false;
  }

  /**
   * Listen for messages from the popup/background
   */
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message.type) {
      case "EXTRACT_CONTENT": {
        try {
          const data = extractContent();
          sendResponse({ success: true, ...data });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      case "HIGHLIGHT": {
        try {
          highlightPhrases(message.phrases || []);
          sendResponse({ success: true, count: highlightMarks.length });
        } catch (err) {
          sendResponse({ success: false, error: err.message });
        }
        break;
      }

      case "CLEAR_HIGHLIGHTS": {
        clearHighlights();
        sendResponse({ success: true });
        break;
      }

      case "HIGHLIGHT_STATUS": {
        sendResponse({ active: highlightActive, count: highlightMarks.length });
        break;
      }

      default:
        sendResponse({ success: false, error: "Unknown message type" });
    }

    return true; // Keep async channel open
  });
})();
