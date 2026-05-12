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

  const mergeWithDefaults = (stored) => ({ ...DEFAULTS, ...(stored || {}) });

  const postConfig = (config) => {
    window.postMessage(
      { source: MSG.SOURCE, type: MSG.UPDATE, payload: config },
      "*"
    );
  };

  const sendCurrentConfig = () => {
    chrome.storage.sync.get(DEFAULTS, (stored) => {
      postConfig(mergeWithDefaults(stored));
    });
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== MSG.SOURCE) return;
    if (data.type === MSG.REQUEST) {
      sendCurrentConfig();
    } else if (data.type === MSG.SAVE_POSITION) {
      const payload = data.payload || {};
      const top = Number(payload.top);
      const left = Number(payload.left);
      if (Number.isFinite(top) && Number.isFinite(left)) {
        chrome.storage.sync.set({ panelTop: top, panelLeft: left });
      }
    }
  });

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "sync") return;
    sendCurrentConfig();
  });

  sendCurrentConfig();
})();
