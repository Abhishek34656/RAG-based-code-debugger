// ── DOM refs ───────────────────────────────────────────────────
const debugBtn         = document.getElementById("debug-btn");
const compareBtn       = document.getElementById("compare-btn");
const clearBtn         = document.getElementById("clear-btn");
const copyBtn          = document.getElementById("copy-btn");
const codeInput        = document.getElementById("code-input");
const languageSelect   = document.getElementById("language-select");
const lineNumbers      = document.getElementById("line-numbers");
const statusLines      = document.getElementById("status-lines");
const statusLang       = document.getElementById("status-lang");
const statusReady      = document.getElementById("status-ready");
const timeSavedCounter = document.getElementById("time-saved-counter");
const timeSavedValue   = document.getElementById("time-saved-value");
const rulesBadge       = document.getElementById("rules-badge");
const output           = document.getElementById("tab-analysis");

// Mode toggle
const btnSingleMode     = document.getElementById("btn-single-mode");
const btnComparisonMode = document.getElementById("btn-comparison-mode");
const singleEditor      = document.getElementById("single-editor");
const singleToolbar     = document.getElementById("single-toolbar");
const comparisonEditors = document.getElementById("comparison-editors");
const comparisonToolbar = document.getElementById("comparison-toolbar");

// Comparison editors
const codeInputA      = document.getElementById("code-input-a");
const codeInputB      = document.getElementById("code-input-b");
const lineNumbersA    = document.getElementById("line-numbers-a");
const lineNumbersB    = document.getElementById("line-numbers-b");
const langSelectA     = document.getElementById("language-select-a");
const langSelectB     = document.getElementById("language-select-b");

// Output tabs
const tabAnalysis  = document.getElementById("tab-analysis");
const tabHeatmap   = document.getElementById("tab-heatmap");
const heatmapSingle = document.getElementById("heatmap-single");
const heatmapSplit  = document.getElementById("heatmap-split");
const heatmapPanelA = document.getElementById("heatmap-panel-a");
const heatmapPanelB = document.getElementById("heatmap-panel-b");
const heatmapCodeSingle = document.getElementById("heatmap-code-single");
const heatmapCodeA  = document.getElementById("heatmap-code-a");
const heatmapCodeB  = document.getElementById("heatmap-code-b");

// ── State ──────────────────────────────────────────────────────
let currentMode = "single";   // "single" | "comparison"
const MINUTES_PER_SESSION = 15;
let totalMinutesSaved = 0;

// ── Marked config ──────────────────────────────────────────────
marked.setOptions({
  highlight: (code, lang) => {
    if (lang && hljs.getLanguage(lang)) return hljs.highlight(code, { language: lang }).value;
    return hljs.highlightAuto(code).value;
  },
  breaks: true, gfm: true,
});

// ══════════════════════════════════════════════════════════════
// LINE NUMBERS
// ══════════════════════════════════════════════════════════════
function syncLineNumbers(textarea, lnEl) {
  const count = textarea.value.split("\n").length;
  lnEl.textContent = Array.from({ length: count }, (_, i) => i + 1).join("\n");
  lnEl.scrollTop = textarea.scrollTop;
}

function updateLineNumbers() {
  syncLineNumbers(codeInput, lineNumbers);
  statusLines.textContent = `${codeInput.value.split("\n").length} line${codeInput.value.split("\n").length !== 1 ? "s" : ""}`;
}

codeInput.addEventListener("input", updateLineNumbers);
codeInput.addEventListener("scroll", () => { lineNumbers.scrollTop = codeInput.scrollTop; });
codeInputA.addEventListener("input", () => syncLineNumbers(codeInputA, lineNumbersA));
codeInputA.addEventListener("scroll", () => { lineNumbersA.scrollTop = codeInputA.scrollTop; });
codeInputB.addEventListener("input", () => syncLineNumbers(codeInputB, lineNumbersB));
codeInputB.addEventListener("scroll", () => { lineNumbersB.scrollTop = codeInputB.scrollTop; });

languageSelect.addEventListener("change", () => { statusLang.textContent = languageSelect.value; });

// ══════════════════════════════════════════════════════════════
// MODE TOGGLE
// ══════════════════════════════════════════════════════════════
function setMode(mode) {
  currentMode = mode;
  const isSingle = mode === "single";

  btnSingleMode.classList.toggle("mode-btn-active", isSingle);
  btnComparisonMode.classList.toggle("mode-btn-active", !isSingle);

  singleToolbar.classList.toggle("hidden", !isSingle);
  singleEditor.classList.toggle("hidden", !isSingle);
  comparisonToolbar.classList.toggle("hidden", isSingle);
  comparisonEditors.classList.toggle("hidden", isSingle);

  // Reset output
  resetOutput();
}

btnSingleMode.addEventListener("click", () => setMode("single"));
btnComparisonMode.addEventListener("click", () => setMode("comparison"));

// ══════════════════════════════════════════════════════════════
// OUTPUT TABS
// ══════════════════════════════════════════════════════════════
document.querySelectorAll(".output-tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".output-tab").forEach(b => {
      b.classList.remove("output-tab-active");
      b.setAttribute("aria-selected", "false");
    });
    btn.classList.add("output-tab-active");
    btn.setAttribute("aria-selected", "true");

    const tab = btn.dataset.tab;
    tabAnalysis.classList.toggle("hidden", tab !== "analysis");
    tabHeatmap.classList.toggle("hidden", tab !== "heatmap");
  });
});

function switchToTab(tab) {
  document.querySelectorAll(".output-tab").forEach(b => {
    b.classList.toggle("output-tab-active", b.dataset.tab === tab);
    b.setAttribute("aria-selected", b.dataset.tab === tab ? "true" : "false");
  });
  tabAnalysis.classList.toggle("hidden", tab !== "analysis");
  tabHeatmap.classList.toggle("hidden", tab !== "heatmap");
}

// ══════════════════════════════════════════════════════════════
// HEATMAP RENDERER
// ══════════════════════════════════════════════════════════════
function interpolateColor(rating) {
  const t = (Math.max(1, Math.min(10, rating)) - 1) / 9;
  const r = Math.round(255 * t);
  const g = Math.round(255 * (1 - t));
  const a = 0.2 + 0.3 * t;
  return `rgba(${r}, ${g}, 0, ${a})`;
}

function buildLegend(containerEl) {
  const stops = [
    { rating: 1,  label: "1: Efficient" },
    { rating: 3,  label: "3" },
    { rating: 5,  label: "5: Moderate" },
    { rating: 7,  label: "7" },
    { rating: 10, label: "10: Critical" },
  ];
  containerEl.innerHTML = stops.map(s => `
    <span class="legend-stop">
      <span class="legend-swatch" style="background:${interpolateColor(s.rating)}"></span>
      <span>${s.label}</span>
    </span>`).join("");
}

function renderHeatmap(lines, containerEl) {
  containerEl.innerHTML = lines.map(l => `
    <div class="heatmap-line" style="background:${interpolateColor(l.rating)}">
      <span class="heatmap-lineno">${l.line_number}</span>
      <span class="heatmap-code">${escapeHtml(l.code)}</span>
    </div>`).join("");
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ══════════════════════════════════════════════════════════════
// SYNCED SCROLL (comparison heatmaps)
// ══════════════════════════════════════════════════════════════
let syncingScroll = false;

function setupSyncedScroll() {
  const wrapA = heatmapCodeA;
  const wrapB = heatmapCodeB;

  wrapA.addEventListener("scroll", () => {
    if (syncingScroll) return;
    syncingScroll = true;
    wrapB.scrollTop = wrapA.scrollTop;
    syncingScroll = false;
  });

  wrapB.addEventListener("scroll", () => {
    if (syncingScroll) return;
    syncingScroll = true;
    wrapA.scrollTop = wrapB.scrollTop;
    syncingScroll = false;
  });
}

setupSyncedScroll();

// ══════════════════════════════════════════════════════════════
// LOADING / ERROR / RESET
// ══════════════════════════════════════════════════════════════
function setLoading(isLoading) {
  const btn = currentMode === "comparison" ? compareBtn : debugBtn;
  btn.disabled = isLoading;
  btn.innerHTML = isLoading
    ? `<svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden="true">
        <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" stroke-width="2" stroke-dasharray="20">
          <animateTransform attributeName="transform" type="rotate" from="0 6.5 6.5" to="360 6.5 6.5" dur="0.7s" repeatCount="indefinite"/>
        </circle></svg> Running...`
    : (currentMode === "comparison"
        ? `<svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor"><path d="M0 0l11 6.5L0 13V0z"/></svg> Compare`
        : `<svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor"><path d="M0 0l11 6.5L0 13V0z"/></svg> Run`);

  if (isLoading) {
    rulesBadge.classList.add("hidden");
    copyBtn.classList.add("hidden");
    statusReady.textContent = "Analyzing…";
    if (!document.getElementById("stream-output")) {
      output.innerHTML = `<div class="loading"><div class="spinner"></div><span>Calling Groq…</span></div>`;
    }
  }
}

function renderError(msg) {
  output.innerHTML = `<div class="error-box">⚠ ${msg}</div>`;
  rulesBadge.classList.add("hidden");
  copyBtn.classList.add("hidden");
  statusReady.textContent = "Error";
}

function resetOutput() {
  output.innerHTML = `
    <div class="placeholder">
      <div class="placeholder-graphic">
        <div class="pg-line"></div><div class="pg-line pg-line--short"></div>
        <div class="pg-line"></div><div class="pg-line pg-line--med"></div>
      </div>
      <p class="placeholder-title">No output yet</p>
      <p class="placeholder-sub">Paste code and hit <kbd>${currentMode === "comparison" ? "Compare" : "Run"}</kbd></p>
    </div>`;
  rulesBadge.classList.add("hidden");
  copyBtn.classList.add("hidden");
  statusReady.textContent = "Ready";
  heatmapSingle.classList.add("hidden");
  heatmapSplit.classList.add("hidden");
  switchToTab("analysis");
}

// ══════════════════════════════════════════════════════════════
// TIME SAVED
// ══════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════
// SINGLE MODE — DEBUG
// ══════════════════════════════════════════════════════════════
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

    if (!res.ok) { renderError((await res.json()).error || "Unexpected error."); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    output.innerHTML = `<div class="markdown-body" id="stream-output"></div>`;
    const streamEl = document.getElementById("stream-output");
    debugBtn.disabled = true;
    statusReady.textContent = "Streaming…";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));

        if (payload.error)       { renderError(payload.error); return; }
        if (payload.rules_used !== undefined) {
          rulesBadge.textContent = `${payload.rules_used} rules`;
          rulesBadge.classList.remove("hidden");
        }
        if (payload.heatmap) {
          // Render single heatmap and switch to heatmap tab
          buildLegend(document.getElementById("heatmap-legend-single"));
          renderHeatmap(payload.heatmap.lines, heatmapCodeSingle);
          heatmapSingle.classList.remove("hidden");
          heatmapSplit.classList.add("hidden");
          switchToTab("heatmap");
          // Switch back to analysis for the streaming text
          setTimeout(() => switchToTab("analysis"), 300);
        }
        if (payload.chunk) {
          fullText += payload.chunk;
          streamEl.innerHTML = marked.parse(fullText);
        }
        if (payload.done) {
          streamEl.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
          copyBtn.classList.remove("hidden");
          statusReady.textContent = "Done";
          updateTimeSaved();
        }
      }
    }
  } catch { renderError("Cannot reach the server. Is Flask running?"); }
  finally  { setLoading(false); }
}

// ══════════════════════════════════════════════════════════════
// COMPARISON MODE — COMPARE
// ══════════════════════════════════════════════════════════════
async function compareCode() {
  const codeA = codeInputA.value.trim();
  const codeB = codeInputB.value.trim();
  if (!codeA || !codeB) { renderError("Paste code in both editors first."); return; }

  setLoading(true);
  let fullText = "";
  let pendingA = null, pendingB = null, pendingWinner = null;

  try {
    const res = await fetch("/debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "comparison",
        code_a: codeA, code_b: codeB,
        language_a: langSelectA.value, language_b: langSelectB.value,
      }),
    });

    if (!res.ok) { renderError((await res.json()).error || "Unexpected error."); return; }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    output.innerHTML = `<div class="markdown-body" id="stream-output"></div>`;
    const streamEl = document.getElementById("stream-output");
    compareBtn.disabled = true;
    statusReady.textContent = "Comparing…";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = JSON.parse(line.slice(6));

        if (payload.error) { renderError(payload.error); return; }

        if (payload.heatmap_a) { pendingA = payload.heatmap_a.lines; }
        if (payload.heatmap_b) { pendingB = payload.heatmap_b.lines; }

        if (payload.winner) {
          pendingWinner = payload.winner;
          const justification = payload.justification || "";
          const summary = payload.comparison_summary || "";

          // Inject winner banner at top of analysis tab
          const banner = document.createElement("div");
          banner.className = "winner-banner";
          banner.innerHTML = `
            🏆 Winner: <strong>Code ${pendingWinner}</strong>
            <span class="winner-banner-justification">— ${justification}</span>
            <div class="winner-banner-summary">${summary}</div>`;
          streamEl.prepend(banner);

          // Render split heatmaps once we have both payloads and winner
          if (pendingA && pendingB) {
            buildLegend(document.getElementById("heatmap-legend-a"));
            buildLegend(document.getElementById("heatmap-legend-b"));
            renderHeatmap(pendingA, heatmapCodeA);
            renderHeatmap(pendingB, heatmapCodeB);

            heatmapPanelA.classList.toggle("winner", pendingWinner === "A");
            heatmapPanelB.classList.toggle("winner", pendingWinner === "B");

            heatmapSingle.classList.add("hidden");
            heatmapSplit.classList.remove("hidden");
            switchToTab("heatmap");
            setTimeout(() => switchToTab("analysis"), 400);
          }
        }

        if (payload.chunk) {
          fullText += payload.chunk;
          // Keep banner if present, append markdown after it
          const banner = streamEl.querySelector(".winner-banner");
          const mdDiv = streamEl.querySelector(".comp-md") || (() => {
            const d = document.createElement("div");
            d.className = "markdown-body comp-md";
            streamEl.appendChild(d);
            return d;
          })();
          mdDiv.innerHTML = marked.parse(fullText);
        }

        if (payload.done) {
          streamEl.querySelectorAll("pre code").forEach(b => hljs.highlightElement(b));
          copyBtn.classList.remove("hidden");
          statusReady.textContent = "Done";
          updateTimeSaved();
        }
      }
    }
  } catch { renderError("Cannot reach the server. Is Flask running?"); }
  finally  { setLoading(false); }
}

// ══════════════════════════════════════════════════════════════
// COPY
// ══════════════════════════════════════════════════════════════
copyBtn.addEventListener("click", () => {
  const text = output.querySelector(".markdown-body")?.innerText ?? "";
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = "Copied!";
    setTimeout(() => {
      copyBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
        <rect x="5" y="5" width="9" height="9" rx="1.5" stroke="currentColor" stroke-width="1.5" fill="none"/>
        <path d="M3 11H2a1 1 0 01-1-1V2a1 1 0 011-1h8a1 1 0 011 1v1" stroke="currentColor" stroke-width="1.5" fill="none"/>
      </svg> Copy`;
    }, 1800);
  });
});

// ══════════════════════════════════════════════════════════════
// CLEAR
// ══════════════════════════════════════════════════════════════
clearBtn.addEventListener("click", () => {
  codeInput.value = "";
  updateLineNumbers();
  resetOutput();
  codeInput.focus();
});

// ══════════════════════════════════════════════════════════════
// EVENTS
// ══════════════════════════════════════════════════════════════
debugBtn.addEventListener("click", debugCode);
compareBtn.addEventListener("click", compareCode);

codeInput.addEventListener("keydown", e => {
  if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); debugCode(); }
  if (e.key === "Tab") {
    e.preventDefault();
    const s = codeInput.selectionStart;
    codeInput.value = codeInput.value.substring(0, s) + "    " + codeInput.value.substring(s);
    codeInput.selectionStart = codeInput.selectionEnd = s + 4;
    updateLineNumbers();
  }
});

[codeInputA, codeInputB].forEach(ta => {
  ta.addEventListener("keydown", e => {
    if (e.ctrlKey && e.key === "Enter") { e.preventDefault(); compareCode(); }
    if (e.key === "Tab") {
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = ta.value.substring(0, s) + "    " + ta.value.substring(s);
      ta.selectionStart = ta.selectionEnd = s + 4;
    }
  });
});

// Init
updateLineNumbers();
