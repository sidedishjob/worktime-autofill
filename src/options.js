(() => {
  "use strict";

  const DEFAULTS = window.__WORKTIME_AUTOFILL_DEFAULTS__;
  const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

  const $ = (id) => document.getElementById(id);
  const inputs = {
    standardStart: $("standardStart"),
    standardEnd: $("standardEnd"),
    standardBreak: $("standardBreak"),
    autoOnLoad: $("autoOnLoad"),
  };
  const statusEl = $("status");
  const errorEl = $("error");

  const setStatus = (msg) => {
    statusEl.textContent = msg;
    if (msg) setTimeout(() => (statusEl.textContent = ""), 1500);
  };
  const setError = (msg) => {
    errorEl.textContent = msg || "";
  };

  const load = () => {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      inputs.standardStart.value = stored.standardStart;
      inputs.standardEnd.value = stored.standardEnd;
      inputs.standardBreak.value = stored.standardBreak;
      inputs.autoOnLoad.checked = !!stored.autoOnLoad;
    });
  };

  const validate = () => {
    const values = {
      standardStart: inputs.standardStart.value.trim(),
      standardEnd: inputs.standardEnd.value.trim(),
      standardBreak: inputs.standardBreak.value.trim(),
    };
    for (const [key, val] of Object.entries(values)) {
      if (!TIME_RE.test(val)) {
        return { ok: false, error: `${key} は HH:MM 形式で入力してください` };
      }
    }
    return {
      ok: true,
      values: { ...values, autoOnLoad: inputs.autoOnLoad.checked },
    };
  };

  const save = () => {
    setError("");
    const result = validate();
    if (!result.ok) {
      setError(result.error);
      return;
    }
    chrome.storage.sync.set(result.values, () => {
      if (chrome.runtime.lastError) {
        setError(chrome.runtime.lastError.message || "保存に失敗しました");
        return;
      }
      setStatus("保存しました");
    });
  };

  $("save").addEventListener("click", save);
  load();
})();
