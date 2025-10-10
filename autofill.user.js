// ==UserScript==
// @name         作業時間 平日デフォルト入力
// @namespace    sidedishjob
// @version      1.0.0
// @description  平日・未入力の日に 08:15-17:15/休憩00:45 を自動投入
// @match        https://platform.levtech.jp/p/workreport/input/*
// @updateURL    https://raw.githubusercontent.com/sidedishjob/worktime-autofill/main/autofill.user.js
// @downloadURL  https://raw.githubusercontent.com/sidedishjob/worktime-autofill/main/autofill.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  "use strict";

  const START = "08:15";
  const END = "17:15";
  const BREAK = "00:45";

  const isWeekendLabel = (txt) => /（\s*土\s*）|（\s*日\s*）/.test(txt || "");

  function fill() {
    const rows = Array.from(document.querySelectorAll("table tr")).filter(
      (tr) =>
        tr.querySelector('input[ref="start_time"],input[name*="[start_time]"]')
    );

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

      const filled = (el) => el && el.value && el.value.trim().length > 0;
      if (filled(startInput) || filled(endInput) || filled(breakInput)) return;

      startInput.value = START;
      endInput.value = END;
      breakInput.value = BREAK;

      try {
        const datetime =
          startInput.getAttribute("datetime") ||
          endInput.getAttribute("datetime");
        if (typeof reflect_times === "function" && datetime) {
          reflect_times($(startInput));
          reflect_times($(endInput));
          reflect_times($(breakInput));
        } else {
          [startInput, endInput, breakInput].forEach((i) =>
            i.dispatchEvent(new Event("blur", { bubbles: true }))
          );
        }
      } catch (e) {}
    });
    console.log(
      `[worktime-autofill] 平日の空欄に ${START}-${END} (休憩${BREAK}) を入力しました。`
    );
  }

  const ready = () =>
    document.readyState === "interactive" || document.readyState === "complete";
  if (ready()) fill();
  document.addEventListener("readystatechange", () => ready() && fill());
})();
