const debugBtn       = document.getElementById("debug-btn");
const clearBtn       = document.getElementById("clear-btn");
const copyBtn        = document.getElementById("copy-btn");
const codeInput      = document.getElementById("code-input");
const languageSelect = document.getElementById("language-select");
const output         = document.getElementById("output");
const rulesBadge     = document.getElementById("rules-badge");
const lineNumbers    = document.getElementById("line-numbers");
const statusLines    = document.getElementById("status-lines");
const statusLang     = document.getElementById("status-lang");
const statusReady    = document.getElementById("status-ready");
const timeSavedCounter = document.getElementById("time-saved-counter");
const timeSavedValue   = document.getElementById("time-saved-value");

const MINUTES_PER_SESSION = 15;
let totalMinutesSaved = 0;

// ── Marked config ──────────────────────────────────────────────
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) {
      return hljs.highlight(code, { language: lang }).value;
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true,
});

// ── Line numbers ───────────────────────────────────────────────
function updateLineNumbers() {
  const lines = codeInput.value.split("\n").length;
  lineNumbers.textContent = Array.from({ length: lines }, (_, i) => i + 1).join("\n");
  statusLines.textContent = `${lines} line${lines !== 1 ? "s" : ""}`;
  // Sync scroll
  lineNumbers.scrollTop = codeInput.scrollTop;
}

codeInput.addEventListener("input", updateLineNumbers);
codeInput.addEventListener("scroll", () => {
  lineNumbers.scrollTop = codeInput.scrollTop;
});

// ── Language select ────────────────────────────────────────────
languageSelect.addEventListener("change", () => {
  statusLang.textContent = languageSelect.value;
});

// ── Loading state ──────────────────────────────────────────────
function setLoading(isLoading) {
  debugBtn.disabled = isLoading;
  debugBtn.innerHTML = isLoading
    ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="2" stroke-dasharray="20" stroke-dashoffset="0">
          <animateTransform attributeName="transform" type="rotate" from="0 6.5 6.5" to="360 6.5 6.5" dur="0.7s" repeatCount="indefinite"/>
        </circle>
       </svg> Running...`
    : `<svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor" aria-hidden="true"><path d="M0 0l11 6.5L0 13V0z"/></svg> Run`;

  if (isLoading) {
    rulesBadge.classList.add("hidden");
    copyBtn.classList.add("hidden");
    statusReady.textContent = "Analyzing…";
    // Only show spinner if output isn't already streaming
    if (!document.getElementById("stream-output")) {
      output.innerHTML = `
        <div class="loading">
          <div class="spinner"></div>
          <span>Retrieving rules &amp; calling Gemini…</span>
        </div>`;
    }
  }
}

// ── Render result ──────────────────────────────────────────────
function renderResult(text, rulesUsed) {
  output.innerHTML = `<div class="markdown-body">${marked.parse(text)}</div>`;
  output.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));

  rulesBadge.textContent = `${rulesUsed} rules`;
  rulesBadge.classList.remove("hidden");
  copyBtn.classList.remove("hidden");
  statusReady.textContent = "Done";

  updateTimeSaved();
}

function renderError(msg) {
  output.innerHTML = `<div class="error-box">⚠ ${msg}</div>`;
  rulesBadge.classList.add("hidden");
  copyBtn.classList.add("hidden");
  statusReady.textContent = "Error";
}

// ── Time saved ─────────────────────────────────────────────────
function updateTimeSaved() {
  totalMinutesSaved += MINUTES_PER_SESSION;
  const display = totalMinutesSaved >= 60
    ? `${(totalMinutesSaved / 60).toFixed(1)}h`
    : `${totalMinutesSaved}m`;

  timeSavedCounter.classList.remove("hidden");
  void timeSavedCounter.offsetWidth;
  timeSavedCounter.classList.add("visible");

  timeSavedValue.classList.remove("pop");
  void timeSavedValue.offsetWidth;
  timeSavedValue.textContent = display;
  timeSavedValue.classList.add("pop");
}

// ── Debug ──────────────────────────────────────────────────────
async function debugCode() {
  const code = codeInput.value.trim();
  if (!code) { renderError("Paste some code first."); return; }

  setLoading(true);

  let fullText = "";

  try {
    const res = await fetch("/debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, language: languageSelect.value }),
    });

    if (!res.ok) {
      const data = await res.json();
      renderError(data.error || "Unexpected error.");
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    // Clear loading state and prepare output for streaming
    output.innerHTML = `<div class="markdown-body" id="stream-output"></div>`;
    const streamEl = document.getElementById("stream-output");
    debugBtn.disabled = true;
    statusReady.textContent = "Streaming…";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop(); // keep incomplete chunk

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));

        if (payload.error) {
          renderError(payload.error);
          return;
        }
        if (payload.rules_used !== undefined) {
          rulesBadge.textContent = `${payload.rules_used} rules`;
          rulesBadge.classList.remove("hidden");
        }
        if (payload.chunk) {
          fullText += payload.chunk;
          streamEl.innerHTML = marked.parse(fullText);
        }
        if (payload.done) {
          // Final highlight pass
          streamEl.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
          copyBtn.classList.remove("hidden");
          statusReady.textContent = "Done";
          updateTimeSaved();
        }
      }
    }
  } catch {
    renderError("Cannot reach the server. Is Flask running?");
  } finally {
    setLoading(false);
  }
}

// ── Copy output ────────────────────────────────────────────────
copyBtn.addEventListener("click", () => {
  const text = output.querySelector(".markdown-body")?.innerText ?? "";
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.5" fill="none"/>
      </svg> Copy`;
    }, 1800);
  });
});

// ── Clear ──────────────────────────────────────────────────────
clearBtn.addEventListener("click", () => {
  codeInput.value = "";
  updateLineNumbers();
  output.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-graphic">
        <div class="pg-line"></div>
        <div class="pg-line pg-line--short"></div>
        <div class="pg-line"></div>
        <div class="pg-line pg-line--med"></div>
      </div>
      <p class="placeholder-title">No output yet</p>
      <p class="placeholder-sub">Paste code on the left and hit <kbd>Run</kbd></p>
    </div>`;
  rulesBadge.classList.add("hidden");
  copyBtn.classList.add("hidden");
  statusReady.textContent = "Ready";
  codeInput.focus();
});

// ── Events ─────────────────────────────────────────────────────
debugBtn.addEventListener("click", debugCode);
codeInput.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); debugCode(); }

  // Tab key inserts spaces instead of changing focus
  if (e.key === "Tab") {
    e.preventDefault();
    const s = codeInput.selectionStart;
    codeInput.value = codeInput.value.substring(0, s) + "    " + codeInput.value.substring(s);
    codeInput.selectionStart = codeInput.selectionEnd = s + 4;
    updateLineNumbers();
  }
});

// Init
updateLineNumbers();
