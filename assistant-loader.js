// Dodo Payments docs — "Ask AI" assistant loader.
//
// Mintlify auto-injects every root-level `.js` file on every page (same mechanism that
// loads `seo.js`). This file injects the self-owned chat widget bundle and its config.
// The widget bundle itself is served from the private Cloudflare Worker, NOT this repo,
// so no heavy JS or secrets live here — only the public endpoint + Turnstile sitekey.
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var WIDGET_SRC = "https://chat.dodopayments.com/widget.js";
  var SCRIPT_ID = "dodo-assistant-widget-script";

  // Config consumed by widget.js (the `window.DodoAssistant` contract).
  // turnstileSitekey is a PUBLIC key (safe to ship to the browser); the matching
  // secret key never leaves the Worker.
  window.DodoAssistant = {
    chatEndpoint: "https://chat.dodopayments.com/chat",
    turnstileSitekey: "0x4AAAAAADrfVZLFta7tMqJJ",
    starterQuestions: [
      "How do I create a subscription?",
      "How do I integrate Checkout?",
      "Which payment methods are supported?",
      "How do webhooks work?",
    ],
    hotkey: "mod+i",
  };

  // Idempotent across Mintlify SPA navigations: if the loader runs again, don't
  // re-inject the bundle. (The widget also guards against duplicate hosts.)
  if (document.getElementById(SCRIPT_ID)) return;

  var s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.src = WIDGET_SRC;
  s.defer = true;
  document.head.appendChild(s);
})();
