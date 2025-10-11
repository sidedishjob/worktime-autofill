// ==UserScript==
// @name         作業時間 平日デフォルト入力（祝日・休暇対応）
// @namespace    sidedishjob
// @version      1.3.0
// @description  平日・未入力の日に 08:15-17:15 / 休憩00:45 を自動または手動で入力（祝日・休暇行はスキップ）
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
  // 既定の標準時間
  const STANDARD = {
    start: "08:15",
    end: "17:15",
    break: "00:45",
  };

  const AUTO_ON_LOAD = false; // ← trueで従来どおり自動投入/falseで手動（ボタン・ショートカット）

  /** -------------------------------------------
   * 定数定義
   * ------------------------------------------- */
  const API_URL = "https://holidays-jp.github.io/api/v1/date.json";
  const WORK_CONTENT_SELECTOR =
    'input[name^="data[DailyReport]"][name$="[work_content]"]'; // 作業内容入力欄のセレクタ

  /*************************************************
   * 共通ユーティリティ
   *************************************************/

  /**
   * 行から "YYYY-MM-DD" を取得（作業内容 input の name を解析）
   * name 例: data[DailyReport][20251001][work_content]
   */
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

  /** 行配列から最初の年月 "YYYY-MM" を推定（ログ用） */
  function guessYmFromRows(rows) {
    for (const tr of rows) {
      const dateStr = extractDateStrFromRow(tr);
      if (dateStr) return dateStr.slice(0, 7);
    }
    return null;
  }

  /** 祝日APIを取得（全量）。Map<'YYYY-MM-DD','祝日名'> を返す。失敗時は alert + 例外 */
  async function fetchHolidayMap() {
    const res = await fetch(API_URL, { cache: "no-store" });
    if (!res.ok) {
      alert("祝日APIの取得に失敗しました。時間をおいて再実行してください。");
      throw new Error(`holiday api http ${res.status}`);
    }
    const all = await res.json(); // { 'YYYY-MM-DD': '祝日名', ... }
    const map = new Map(Object.entries(all));
    return map;
  }

  /** 平日かつ祝日か/週末かを判定 */
  function isHolidayOrWeekend(dateStr, holidayMap) {
    if (!dateStr) return { isWeekend: false, isWeekdayHoliday: false };
    const d = new Date(dateStr);
    const day = d.getDay(); // 0:日, 6:土
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

  /** -------------------------------------------
   * 以下、ロジック部
   * ------------------------------------------- */
  const filled = (el) => el && el.value && el.value.trim().length > 0;

  /** -------------------------------------------
   * 本体：一覧に標準時間を投入
   *  force=false: 未入力のみ
   *  force=true : 既入力も上書き
   * ※ 祝日対応：平日の祝日はスキップし、作業内容に "祝日_名称" を入れる
   * ------------------------------------------- */
  async function fillAll(force = false) {
    const rows = Array.from(document.querySelectorAll("table tr")).filter(
      (tr) =>
        tr.querySelector('input[ref="start_time"],input[name*="[start_time]"]')
    );

    if (rows.length === 0) {
      console.log("[worktime-autofill] 対象行が見つかりませんでした。");
      return;
    }

    // 祝日マップ取得（失敗ならここで中断）
    let holidayMap;
    try {
      holidayMap = await fetchHolidayMap();
    } catch {
      return;
    }

    // ログ用に対象年月を推定（行から抽出）
    const ym = guessYmFromRows(rows);
    if (ym) {
      // 当月に該当する件数だけを数えて表示（厳密には全量から startsWith で絞る）
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

      // 土日：従来どおりスキップ
      if (stat.isWeekend) return;

      // 作業内容に「休暇」が含まれている場合：時刻入力をスキップ
      const workInput = tr.querySelector(WORK_CONTENT_SELECTOR);
      if (workInput && workInput.value && workInput.value.includes("休暇")) {
        return;
      }

      // 平日の祝日：作業内容に "祝日_名称" を入れて、時刻入力はスキップ
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

    mkBtn("初期値入力", async () => await fillAll(false));
    mkBtn("初期値入力(上書き)", async () => await fillAll(true));
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
