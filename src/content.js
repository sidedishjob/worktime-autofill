(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    standardStart: "08:50",
    standardEnd: "17:20",
    standardBreak: "00:45",
    standardComment: "結合テスト",
    autoOnLoad: false,
    panelTop: null,
    panelLeft: null,
  });
  const MSG = Object.freeze({
    SOURCE: "worktime-autofill",
    REQUEST: "config:request",
    UPDATE: "config:update",
    SAVE_POSITION: "position:save",
  });

  const API_URL = "https://holidays-jp.github.io/api/v1/date.json";
  const START_SELECTOR = 'input[name^="rows."][name$=".startTime"]';
  const TERM_SELECTOR = 'dl[data-field="workReportTerm"] dd';

  let currentConfig = { ...DEFAULTS };
  let initialized = false;

  const pad2 = (n) => String(n).padStart(2, "0");
  const toDateStr = (d) =>
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

  // 「対象期間」の開始日 (例: 2026/10/01 ～ 2026/10/31)
  function getTermStart() {
    const text = document.querySelector(TERM_SELECTOR)?.textContent || "";
    const m = text.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function getRowIndex(tr) {
    const name = tr.querySelector(START_SELECTOR)?.getAttribute("name") || "";
    const m = name.match(/^rows\.(\d+)\.startTime$/);
    return m ? Number(m[1]) : null;
  }

  // rows.N は対象期間開始日から N 日目。取得できなければ行ラベル (10/01（木）) から推定
  function extractDateStrFromRow(tr, termStart) {
    const index = getRowIndex(tr);
    if (termStart && index !== null) {
      const d = new Date(termStart);
      d.setDate(d.getDate() + index);
      return toDateStr(d);
    }
    const label = tr.querySelector("td")?.textContent || "";
    const m = label.match(/(\d{1,2})\/(\d{1,2})/);
    if (!m) return null;
    const year = termStart ? termStart.getFullYear() : new Date().getFullYear();
    return `${year}-${pad2(m[1])}-${pad2(m[2])}`;
  }

  function findRows() {
    return Array.from(document.querySelectorAll("tbody tr")).filter((tr) =>
      tr.querySelector(START_SELECTOR)
    );
  }

  // React 管理の input は value 直接代入だと state に反映されないため native setter 経由で設定する
  const nativeValueSetter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  ).set;

  function setInputValue(input, value) {
    nativeValueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    input.dispatchEvent(new FocusEvent("blur"));
  }

  function guessYmFromRows(rows, termStart) {
    for (const tr of rows) {
      const dateStr = extractDateStrFromRow(tr, termStart);
      if (dateStr) return dateStr.slice(0, 7);
    }
    return null;
  }

  async function fetchHolidayMap() {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) {
      alert("祝日APIの取得に失敗しました。時間をおいて再実行してください。");
      throw new Error(`holiday api http ${res.status}`);
    }
    const all = await res.json();
    return new Map(Object.entries(all));
  }

  function isHolidayOrWeekend(dateStr, holidayMap) {
    if (!dateStr) return { isWeekend: false, isWeekdayHoliday: false };
    const [y, mo, dd] = dateStr.split("-").map(Number);
    const day = new Date(y, mo - 1, dd).getDay();
    const isWeekend = day === 0 || day === 6;

    if (isWeekend) {
      return { isWeekend: true, isWeekdayHoliday: false };
    }
    if (holidayMap.has(dateStr)) {
      return {
        isWeekend: false,
        isWeekdayHoliday: true,
        holidayName: holidayMap.get(dateStr),
      };
    }
    return { isWeekend: false, isWeekdayHoliday: false };
  }

  const filled = (el) => el && el.value && el.value.trim().length > 0;

  async function fillAll(force = false) {
    const rows = findRows();

    if (rows.length === 0) {
      console.log("[worktime-autofill] 対象行が見つかりませんでした。");
      return;
    }

    let holidayMap;
    try {
      holidayMap = await fetchHolidayMap();
    } catch {
      return;
    }

    const termStart = getTermStart();
    const ym = guessYmFromRows(rows, termStart);
    if (ym) {
      let cnt = 0;
      for (const d of holidayMap.keys()) {
        if (d.startsWith(`${ym}-`)) cnt++;
      }
      console.info(`API取得成功 ${ym}: ${cnt}件`);
    } else {
      console.info("API取得成功（年月不明）");
    }

    let count = 0;

    rows.forEach((tr) => {
      const dateStr = extractDateStrFromRow(tr, termStart);
      const stat = isHolidayOrWeekend(dateStr, holidayMap);

      if (stat.isWeekend) return;

      const index = getRowIndex(tr);
      const field = (key) =>
        tr.querySelector(`input[name="rows.${index}.${key}"]`);

      const workInput = field("comment");
      if (workInput && workInput.value && workInput.value.includes("休暇")) {
        return;
      }

      if (stat.isWeekdayHoliday) {
        if (workInput) setInputValue(workInput, `祝日_${stat.holidayName}`);
        return;
      }

      const startInput = field("startTime");
      const endInput = field("endTime");
      const breakInput = field("breakTime");
      if (!startInput || !endInput || !breakInput) return;

      // 作業内容は入力必須のため、空欄なら時刻の入力有無に関わらず既定値を入れる (上書きはしない)
      if (workInput && !filled(workInput) && currentConfig.standardComment) {
        setInputValue(workInput, currentConfig.standardComment);
      }

      if (
        !force &&
        (filled(startInput) || filled(endInput) || filled(breakInput))
      )
        return;

      setInputValue(startInput, currentConfig.standardStart);
      setInputValue(endInput, currentConfig.standardEnd);
      setInputValue(breakInput, currentConfig.standardBreak);

      count++;
    });

    console.log(
      `[worktime-autofill] 平日の${force ? "全行を上書き" : "空欄行にのみ"} ${
        currentConfig.standardStart
      }-${currentConfig.standardEnd} (休憩${
        currentConfig.standardBreak
      }) を入力しました。対象行: ${count}`
    );
  }

  const IDLE_FOOT = "土日・祝日・休暇行はスキップ";

  const PANEL_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    .panel {
      --bg: hsl(240 10% 3.9%);
      --fg: hsl(0 0% 98%);
      --muted: hsl(240 5% 64.9%);
      --border: hsl(240 3.7% 15.9%);
      --accent: hsl(240 3.7% 15.9%);
      --accent-hover: hsl(240 4% 19%);
      --primary: hsl(0 0% 98%);
      --primary-fg: hsl(240 5.9% 10%);
      --ring: hsl(240 4.9% 83.9%);

      position: fixed;
      width: 256px;
      padding: 14px;
      background: var(--bg);
      color: var(--fg);
      font-family:
        "Geist", "Inter", ui-sans-serif, system-ui, -apple-system,
        BlinkMacSystemFont, "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo",
        sans-serif;
      font-size: 13px;
      line-height: 1.45;
      letter-spacing: -0.005em;
      border-radius: 10px;
      border: 1px solid var(--border);
      box-shadow:
        0 10px 30px -12px rgba(0,0,0,0.55),
        0 4px 10px -4px rgba(0,0,0,0.35);
      pointer-events: auto;
      user-select: none;
      transition: opacity 180ms ease;
      animation: wa-enter 320ms cubic-bezier(.2,.7,.25,1) both;
    }

    .brand {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding: 1px 0;
      cursor: grab;
      touch-action: none;
    }
    .brand.is-dragging { cursor: grabbing; }
    .brand-dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: hsl(142 71% 45%);
      flex: 0 0 auto;
      transition: background 160ms ease;
    }
    .brand-text {
      font-size: 12.5px;
      font-weight: 500;
      color: var(--fg);
      letter-spacing: -0.01em;
    }

    .actions {
      display: grid;
      gap: 6px;
    }
    .btn {
      appearance: none;
      -webkit-appearance: none;
      font: inherit;
      font-size: 12.5px;
      font-weight: 500;
      height: 32px;
      padding: 0 10px 0 12px;
      border-radius: 6px;
      cursor: pointer;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      transition:
        background-color 140ms ease,
        border-color 140ms ease,
        color 140ms ease;
    }
    .btn:focus-visible {
      outline: none;
      box-shadow: 0 0 0 2px var(--bg), 0 0 0 4px var(--ring);
    }

    .btn--primary {
      background: var(--primary);
      color: var(--primary-fg);
      border: 1px solid var(--primary);
    }
    .btn--primary:hover { background: hsl(0 0% 92%); }

    .btn--secondary {
      background: transparent;
      color: var(--fg);
      border: 1px solid var(--border);
    }
    .btn--secondary:hover {
      background: var(--accent);
      border-color: var(--accent-hover);
    }

    .btn__label { text-align: left; }

    .kbd {
      display: inline-flex;
      align-items: center;
      height: 18px;
      padding: 0 5px;
      font-family:
        "Geist Mono", ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo,
        Consolas, monospace;
      font-size: 10px;
      font-weight: 500;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: hsl(240 5% 10%);
      color: var(--muted);
      white-space: nowrap;
    }
    .btn--primary .kbd {
      background: hsl(0 0% 88%);
      border-color: hsl(0 0% 80%);
      color: hsl(240 5% 35%);
    }

    .foot {
      margin-top: 12px;
      padding-top: 10px;
      border-top: 1px solid var(--border);
      font-size: 11.5px;
      color: var(--muted);
      min-height: 14px;
      transition: color 180ms ease;
    }
    .foot[data-tone="ok"]  { color: hsl(142 71% 55%); }
    .foot[data-tone="err"] { color: hsl(0 72% 65%); }

    .panel[data-busy="true"] .brand-dot {
      background: hsl(38 92% 55%);
      animation: wa-pulse 900ms ease-in-out infinite;
    }
    .panel[data-busy="true"] .btn { pointer-events: none; opacity: 0.7; }

    @keyframes wa-enter {
      from { opacity: 0; transform: translateY(6px) scale(0.99); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes wa-pulse {
      0%, 100% { opacity: 1; }
      50%      { opacity: 0.4; }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel, .brand-dot { animation: none !important; transition: none !important; }
    }
  `;

  const PANEL_HTML = `
    <div class="panel" data-busy="false">
      <div class="brand" title="ドラッグで移動">
        <span class="brand-dot"></span>
        <span class="brand-text">worktime-autofill</span>
      </div>
      <div class="actions">
        <button class="btn btn--primary" type="button" data-action="fill">
          <span class="btn__label">未入力を埋める</span>
          <span class="kbd">⌥ I</span>
        </button>
        <button class="btn btn--secondary" type="button" data-action="overwrite">
          <span class="btn__label">全行を上書き</span>
          <span class="kbd">⌥ ⇧ I</span>
        </button>
      </div>
      <div class="foot" data-tone="muted">${IDLE_FOOT}</div>
    </div>
  `;

  const PANEL_DEFAULT_MARGIN = 22;
  let shadowRoot = null;
  let dragging = false;

  function clampPosition(top, left, panel) {
    const rect = panel.getBoundingClientRect();
    const w = rect.width || 252;
    const h = rect.height || 120;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - w - margin);
    const maxTop = Math.max(margin, window.innerHeight - h - margin);
    return {
      top: Math.max(margin, Math.min(maxTop, top)),
      left: Math.max(margin, Math.min(maxLeft, left)),
    };
  }

  function applyDefaultPosition(panel) {
    panel.style.top = "auto";
    panel.style.left = "auto";
    panel.style.right = `${PANEL_DEFAULT_MARGIN}px`;
    panel.style.bottom = `${PANEL_DEFAULT_MARGIN}px`;
  }

  function applyAbsolutePosition(panel, top, left) {
    const c = clampPosition(top, left, panel);
    panel.style.top = `${c.top}px`;
    panel.style.left = `${c.left}px`;
    panel.style.right = "auto";
    panel.style.bottom = "auto";
  }

  function applyPositionFromConfig() {
    if (!shadowRoot) return;
    const panel = shadowRoot.querySelector(".panel");
    if (!panel) return;
    const { panelTop, panelLeft } = currentConfig;
    if (Number.isFinite(panelTop) && Number.isFinite(panelLeft)) {
      applyAbsolutePosition(panel, panelTop, panelLeft);
    } else {
      applyDefaultPosition(panel);
    }
  }

  function enableDrag(panel) {
    const handle = panel.querySelector(".brand");
    let startX = 0;
    let startY = 0;
    let originTop = 0;
    let originLeft = 0;

    handle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      handle.classList.add("is-dragging");
      handle.setPointerCapture(e.pointerId);
      const rect = panel.getBoundingClientRect();
      originTop = rect.top;
      originLeft = rect.left;
      startX = e.clientX;
      startY = e.clientY;
      e.preventDefault();
    });

    handle.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      applyAbsolutePosition(
        panel,
        originTop + (e.clientY - startY),
        originLeft + (e.clientX - startX)
      );
    });

    const finish = (e) => {
      if (!dragging) return;
      dragging = false;
      handle.classList.remove("is-dragging");
      try {
        handle.releasePointerCapture(e.pointerId);
      } catch {}
      const rect = panel.getBoundingClientRect();
      window.postMessage(
        {
          source: MSG.SOURCE,
          type: MSG.SAVE_POSITION,
          payload: { top: Math.round(rect.top), left: Math.round(rect.left) },
        },
        "*"
      );
    };
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
  }

  function mountUI() {
    if (document.getElementById("__wa-host")) return;
    const host = document.createElement("div");
    host.id = "__wa-host";
    host.style.cssText =
      "all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
    document.documentElement.appendChild(host);
    shadowRoot = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = PANEL_CSS;
    shadowRoot.appendChild(style);

    const tpl = document.createElement("template");
    tpl.innerHTML = PANEL_HTML.trim();
    const panel = tpl.content.firstElementChild;
    shadowRoot.appendChild(panel);

    applyPositionFromConfig();
    enableDrag(panel);

    shadowRoot
      .querySelector('[data-action="fill"]')
      .addEventListener("click", () => runWithFeedback(false));
    shadowRoot
      .querySelector('[data-action="overwrite"]')
      .addEventListener("click", () => runWithFeedback(true));

    window.addEventListener("resize", () => {
      if (dragging) return;
      const rect = panel.getBoundingClientRect();
      if (
        Number.isFinite(currentConfig.panelTop) &&
        Number.isFinite(currentConfig.panelLeft)
      ) {
        applyAbsolutePosition(panel, rect.top, rect.left);
      }
    });
  }

  async function runWithFeedback(force) {
    if (!shadowRoot) return fillAll(force);
    const panel = shadowRoot.querySelector(".panel");
    const foot = shadowRoot.querySelector(".foot");
    panel.dataset.busy = "true";
    if (panel._statusTimer) clearTimeout(panel._statusTimer);
    foot.textContent = force ? "上書き中…" : "入力中…";
    foot.dataset.tone = "muted";
    try {
      await fillAll(force);
      foot.textContent = force
        ? "上書きを完了しました"
        : "未入力欄に入力しました";
      foot.dataset.tone = "ok";
    } catch {
      foot.textContent = "失敗しました";
      foot.dataset.tone = "err";
    } finally {
      panel.dataset.busy = "false";
      panel._statusTimer = setTimeout(() => {
        foot.textContent = IDLE_FOOT;
        foot.dataset.tone = "muted";
      }, 2400);
    }
  }

  function registerShortcuts() {
    document.addEventListener("keydown", (e) => {
      const isAltLike = e.altKey && !e.ctrlKey && !e.metaKey;
      const isIKey =
        e.code === "KeyI" ||
        (e.key && (e.key.toLowerCase?.() === "i" || e.key === "Dead"));

      if (isAltLike && isIKey) {
        e.preventDefault();
        runWithFeedback(e.shiftKey);
      }
    });
  }

  function init() {
    if (initialized) return;
    initialized = true;
    mountUI();
    registerShortcuts();

    if (!currentConfig.autoOnLoad) return;

    waitForRows().then((found) => found && runWithFeedback(false));
  }

  // Next.js の描画・hydration 完了前に値を入れると React state に反映されないため、行の出現 + 少し待ってから実行する
  function waitForRows(timeoutMs = 10000, settleMs = 800) {
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        if (findRows().length > 0) return setTimeout(() => resolve(true), settleMs);
        if (Date.now() - started > timeoutMs) return resolve(false);
        setTimeout(tick, 200);
      };
      tick();
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== MSG.SOURCE) return;
    if (data.type === MSG.UPDATE && data.payload) {
      currentConfig = { ...DEFAULTS, ...data.payload };
      if (!initialized) init();
      else if (!dragging) applyPositionFromConfig();
    }
  });

  window.postMessage({ source: MSG.SOURCE, type: MSG.REQUEST }, "*");
})();
