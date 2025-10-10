// ==UserScript==
// @name         作業時間 平日デフォルト入力（手動トリガー対応）
// @namespace    sidedishjob
// @version      1.1.0
// @description  平日・未入力の日に 08:15-17:15/休憩00:45 をボタン/ショートカットで投入（オプションで自動）
// @match        https://platform.levtech.jp/p/workreport/input/*
// @updateURL    https://raw.githubusercontent.com/sidedishjob/worktime-autofill/main/autofill.user.js
// @downloadURL  https://raw.githubusercontent.com/sidedishjob/worktime-autofill/main/autofill.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  /** -------------------------------------------
   * 設定
   * ------------------------------------------- */
  // 既定の標準時間（ダイアログで上書き保存可）
  const STANDARD = {
    start: "08:15",
    end: "17:15",
    break: "00:45",
  };

  const AUTO_ON_LOAD = false; // ← trueで従来どおり自動投入/falseで手動（ボタン・ショートカット）

  /** -------------------------------------------
   * 以下、ロジック部
   * ------------------------------------------- */
  const isWeekendLabel = (txt) => /（\s*土\s*）|（\s*日\s*）/.test(txt || "");

  const filled = (el) => el && el.value && el.value.trim().length > 0;

  /** -------------------------------------------
   * 本体：一覧に標準時間を投入
   *  force=false: 未入力のみ
   *  force=true : 既入力も上書き
   * ------------------------------------------- */
  function fillAll(force = false) {
    const rows = Array.from(document.querySelectorAll("table tr")).filter(
      (tr) =>
        tr.querySelector('input[ref="start_time"],input[name*="[start_time]"]')
    );

    let count = 0;

    rows.forEach((tr) => {
      const dayLabel = tr.querySelector("td")?.textContent || "";
      if (isWeekendLabel(dayLabel)) return;

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

      // 未入力のみ or 強制上書き
      if (
        !force &&
        (filled(startInput) || filled(endInput) || filled(breakInput))
      )
        return;

      startInput.value = STANDARD.start;
      endInput.value = STANDARD.end;
      breakInput.value = STANDARD.break;

      try {
        // 既存サイト固有の反映関数を尊重（現状踏襲）
        const datetime =
          startInput.getAttribute("datetime") ||
          endInput.getAttribute("datetime");

        if (typeof reflect_times === "function" && datetime) {
          reflect_times($(startInput));
          reflect_times($(endInput));
          reflect_times($(breakInput));
        } else {
          // 代替：イベント発火で画面側に伝える
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
        STANDARD.start
      }-${STANDARD.end} (休憩${
        STANDARD.break
      }) を入力しました。対象行: ${count}`
    );
  }

  /** -------------------------------------------
   * UI：ボタン設置（ツールバーがなければ右上に浮かせる）
   * ------------------------------------------- */
  function addButtons() {
    const toolbar =
      document.querySelector(".js-toolbar, .toolbar, header, .page-title") ||
      createFloatingToolbar();

    const mkBtn = (label, handler) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.style.marginLeft = "6px";
      btn.style.padding = "6px 10px";
      btn.style.borderRadius = "6px";
      btn.style.border = "1px solid #888";
      btn.style.cursor = "pointer";
      btn.style.background = "#fff";
      btn.addEventListener("click", handler);
      toolbar.appendChild(btn);
      return btn;
    };

    mkBtn("初期値入力", () => fillAll(false));
    mkBtn("初期値入力(上書き)", () => fillAll(true));
  }

  function createFloatingToolbar() {
    const wrap = document.createElement("div");
    wrap.style.position = "fixed";
    wrap.style.top = "12px";
    wrap.style.right = "12px";
    wrap.style.zIndex = "99999";
    wrap.style.background = "rgba(30,30,30,0.85)";
    wrap.style.color = "#fff";
    wrap.style.padding = "8px";
    wrap.style.borderRadius = "8px";
    document.body.appendChild(wrap);
    return wrap;
  }

  /** -------------------------------------------
   * ショートカット
   *  Alt+I         … 未入力のみ適用
   *  Alt+Shift+I   … 既存値も上書き適用
   * ------------------------------------------- */
  function registerShortcuts() {
    document.addEventListener("keydown", (e) => {
      const isAltLike = e.altKey && !e.ctrlKey && !e.metaKey;
      const isIKey =
        e.code === "KeyI" ||
        (e.key && (e.key.toLowerCase?.() === "i" || e.key === "Dead"));

      if (isAltLike && isIKey) {
        e.preventDefault();
        fillAll(e.shiftKey); // Shift併用で上書き
      }
    });
  }

  /** -------------------------------------------
   * 初期化
   * ------------------------------------------- */
  function init() {
    addButtons();
    registerShortcuts();

    // 従来どおり「画面開いて自動投入」したい場合は AUTO_ON_LOAD を true にする
    if (!AUTO_ON_LOAD) return;

    const ready = () =>
      document.readyState === "interactive" ||
      document.readyState === "complete";
    if (ready()) fillAll(false);
    document.addEventListener(
      "readystatechange",
      () => ready() && fillAll(false)
    );
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
