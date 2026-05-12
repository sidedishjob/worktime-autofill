(() => {
  "use strict";

  const DEFAULTS = Object.freeze({
    standardStart: "08:45",
    standardEnd: "17:15",
    standardBreak: "00:45",
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
  const WORK_CONTENT_SELECTOR =
    'input[name^="data[DailyReport]"][name$="[work_content]"]';

  let currentConfig = { ...DEFAULTS };
  let initialized = false;

  function extractDateStrFromRow(tr) {
    const input = tr.querySelector(WORK_CONTENT_SELECTOR);
    if (!input) return null;
    const name = input.getAttribute("name") || "";
    const m = name.match(/data\[DailyReport\]\[(\d{8})\]\[work_content\]/);
    if (!m) return null;
    const y = m[1].slice(0, 4);
    const mo = m[1].slice(4, 6);
    const d = m[1].slice(6, 8);
    return `${y}-${mo}-${d}`;
  }

  function guessYmFromRows(rows) {
    for (const tr of rows) {
      const dateStr = extractDateStrFromRow(tr);
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
    const d = new Date(dateStr);
    const day = d.getDay();
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
    const rows = Array.from(document.querySelectorAll("table tr")).filter(
      (tr) =>
        tr.querySelector('input[ref="start_time"],input[name*="[start_time]"]')
    );

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

    const ym = guessYmFromRows(rows);
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
      const dateStr = extractDateStrFromRow(tr);
      const stat = isHolidayOrWeekend(dateStr, holidayMap);

      if (stat.isWeekend) return;

      const workInput = tr.querySelector(WORK_CONTENT_SELECTOR);
      if (workInput && workInput.value && workInput.value.includes("休暇")) {
        return;
      }

      if (stat.isWeekdayHoliday) {
        if (workInput) {
          workInput.value = `祝日_${stat.holidayName}`;
          workInput.dispatchEvent(new Event("input", { bubbles: true }));
          workInput.dispatchEvent(new Event("change", { bubbles: true }));
          workInput.dispatchEvent(new Event("blur", { bubbles: true }));
        }
        return;
      }

      const startInput = tr.querySelector(
        'input[ref="start_time"], input[name*="[start_time]"]'
      );
      const endInput = tr.querySelector(
        'input[ref="end_time"],   input[name*="[end_time]"]'
      );
      const breakInput = tr.querySelector(
        'input[ref="relax_time"], input[name*="[relax_time]"]'
      );
      if (!startInput || !endInput || !breakInput) return;

      if (
        !force &&
        (filled(startInput) || filled(endInput) || filled(breakInput))
      )
        return;

      startInput.value = currentConfig.standardStart;
      endInput.value = currentConfig.standardEnd;
      breakInput.value = currentConfig.standardBreak;

      try {
        const datetime =
          startInput.getAttribute("datetime") ||
          endInput.getAttribute("datetime");

        if (typeof reflect_times === "function" && datetime) {
          reflect_times($(startInput));
          reflect_times($(endInput));
          reflect_times($(breakInput));
        } else {
          [startInput, endInput, breakInput].forEach((i) => {
            i.dispatchEvent(new Event("input", { bubbles: true }));
            i.dispatchEvent(new Event("change", { bubbles: true }));
            i.dispatchEvent(new Event("blur", { bubbles: true }));
          });
        }
      } catch {}

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
      position: fixed;
      width: 252px;
      padding: 12px 14px 12px;
      background: #14171d;
      color: #f4f6fa;
      font-family:
        ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
        "Hiragino Kaku Gothic ProN", "Yu Gothic", "Meiryo", sans-serif;
      font-size: 12px;
      line-height: 1.45;
      border-radius: 12px;
      border: 1px solid rgba(255,255,255,0.10);
      box-shadow:
        0 24px 60px -22px rgba(0,0,0,0.65),
        0 10px 24px -10px rgba(0,0,0,0.45),
        inset 0 1px 0 rgba(255,255,255,0.06);
      pointer-events: auto;
      user-select: none;
      opacity: 0.96;
      transform-origin: bottom right;
      transition: opacity 220ms ease;
      animation: wa-enter 480ms cubic-bezier(.2,.7,.25,1) both;
      overflow: hidden;
    }
    .panel:hover { opacity: 1; }

    .panel::before {
      content: "";
      position: absolute;
      top: 10px; bottom: 10px; left: 0;
      width: 2px;
      border-radius: 2px;
      background: linear-gradient(180deg, #7fe7d5 0%, #5a9bff 100%);
      opacity: 1;
    }
    .panel::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      background:
        radial-gradient(120% 80% at 100% 0%, rgba(127,231,213,0.06) 0%, transparent 55%),
        radial-gradient(80% 60% at 0% 100%, rgba(90,155,255,0.05) 0%, transparent 55%);
    }

    .brand {
      position: relative;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 11px;
      padding: 2px 0 2px 2px;
      cursor: grab;
      touch-action: none;
    }
    .brand.is-dragging { cursor: grabbing; }
    .brand-grip {
      width: 8px;
      height: 12px;
      flex: 0 0 auto;
      background-image:
        radial-gradient(circle, rgba(255,255,255,0.45) 1px, transparent 1.4px);
      background-size: 4px 4px;
      background-position: 0 0;
      background-repeat: repeat;
      opacity: 0.55;
      transition: opacity 140ms ease;
    }
    .brand:hover .brand-grip { opacity: 0.9; }
    .brand-dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: #7fe7d5;
      box-shadow: 0 0 8px rgba(127,231,213,0.7);
      flex: 0 0 auto;
    }
    .brand-text {
      font-family:
        ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
      font-size: 10.5px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: rgba(255,255,255,0.86);
      font-weight: 500;
    }

    .actions {
      position: relative;
      display: grid;
      gap: 6px;
    }
    .btn {
      appearance: none;
      -webkit-appearance: none;
      background: rgba(255,255,255,0.06);
      color: #ffffff;
      border: 1px solid rgba(255,255,255,0.14);
      font: inherit;
      font-size: 13px;
      font-weight: 500;
      padding: 9px 11px 9px 12px;
      border-radius: 7px;
      cursor: pointer;
      display: grid;
      grid-template-columns: 1fr auto;
      align-items: center;
      gap: 10px;
      transition:
        background 140ms ease,
        border-color 140ms ease,
        transform 140ms ease;
    }
    .btn:hover {
      background: rgba(255,255,255,0.11);
      border-color: rgba(255,255,255,0.24);
    }
    .btn:active { transform: scale(0.985); }
    .btn:focus-visible {
      outline: none;
      border-color: rgba(127,231,213,0.65);
      box-shadow: 0 0 0 2px rgba(127,231,213,0.22);
    }
    .btn--primary {
      background:
        linear-gradient(180deg, rgba(127,231,213,0.28) 0%, rgba(90,155,255,0.16) 100%),
        rgba(255,255,255,0.02);
      border-color: rgba(127,231,213,0.45);
      color: #ffffff;
    }
    .btn--primary:hover {
      background:
        linear-gradient(180deg, rgba(127,231,213,0.36) 0%, rgba(90,155,255,0.22) 100%),
        rgba(255,255,255,0.02);
      border-color: rgba(127,231,213,0.60);
    }
    .btn__label { text-align: left; }
    .kbd {
      font-family:
        ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace;
      font-size: 10.5px;
      color: rgba(255,255,255,0.82);
      background: rgba(0,0,0,0.38);
      padding: 2px 6px;
      border-radius: 4px;
      border: 1px solid rgba(255,255,255,0.10);
      letter-spacing: 0.04em;
      white-space: nowrap;
    }

    .foot {
      position: relative;
      margin-top: 11px;
      padding-top: 10px;
      border-top: 1px solid rgba(255,255,255,0.10);
      font-size: 11px;
      color: rgba(255,255,255,0.62);
      letter-spacing: 0.02em;
      min-height: 14px;
      transition: color 220ms ease;
    }
    .foot[data-tone="ok"]  { color: #7fe7d5; }
    .foot[data-tone="err"] { color: #ff8a8a; }

    .panel[data-busy="true"] .brand-dot {
      animation: wa-pulse 800ms ease-in-out infinite;
    }
    .panel[data-busy="true"] .btn { pointer-events: none; opacity: 0.85; }

    @keyframes wa-enter {
      from { opacity: 0; transform: translateY(8px) scale(0.985); }
      to   { opacity: 0.96; transform: translateY(0) scale(1); }
    }
    @keyframes wa-pulse {
      0%, 100% { opacity: 1;   box-shadow: 0 0 8px rgba(127,231,213,0.7); }
      50%      { opacity: 0.4; box-shadow: 0 0 2px rgba(127,231,213,0.30); }
    }

    @media (prefers-reduced-motion: reduce) {
      .panel, .brand-dot { animation: none !important; transition: none !important; }
    }
  `;

  const PANEL_HTML = `
    <div class="panel" data-busy="false">
      <div class="brand" title="ドラッグで移動">
        <span class="brand-grip" aria-hidden="true"></span>
        <span class="brand-dot"></span>
        <span class="brand-text">worktime · autofill</span>
      </div>
      <div class="actions">
        <button class="btn btn--primary" type="button" data-action="fill">
          <span class="btn__label">未入力を埋める</span>
          <span class="kbd">⌥ I</span>
        </button>
        <button class="btn" type="button" data-action="overwrite">
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

    const ready = () =>
      document.readyState === "interactive" ||
      document.readyState === "complete";
    if (ready()) {
      runWithFeedback(false);
    } else {
      document.addEventListener(
        "readystatechange",
        () => ready() && runWithFeedback(false)
      );
    }
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
