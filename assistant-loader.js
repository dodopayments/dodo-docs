// Dodo Payments docs — "Ask AI" (Sentra) assistant loader.
//
// Mintlify auto-injects every root-level `.js` file on every page (same mechanism that
// loads `seo.js`). This injects the ContextChat widget bundle and its config. The bundle
// is served from the Cloudflare Worker (ContextChat), NOT this repo — so no heavy JS or
// secrets live here, only the public endpoint, Turnstile sitekey, brand copy, and theme.
//
// The widget bundle is generic/de-branded (open-sourced as ContextChat); Sentra's entire
// identity — name, copy, brand palette (light + dark), and fonts — is reproduced from the
// config below.
(function () {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  var WIDGET_SRC = "https://chat.dodopayments.com/widget.js";
  var SCRIPT_ID = "dodo-assistant-widget-script";

  var config = {
    chatEndpoint: "https://chat.dodopayments.com/chat",
    // PUBLIC Turnstile sitekey (safe to ship); the matching secret never leaves the Worker.
    turnstileSitekey: "0x4AAAAAADrfVZLFta7tMqJJ",

    assistantName: "Sentra",
    tagline: "Answers from the Dodo Payments docs",
    welcomeHeading: "Ask Sentra about Dodo Payments",
    welcomeSubtext: "Get answers from the documentation, with sources.",
    launcherLabel: "Ask AI",
    disclaimer: "AI can make mistakes. Verify important details in the docs.",
    starterQuestions: [
      "How do I create a subscription?",
      "How do I integrate Checkout?",
      "Which payment methods are supported?",
      "How do webhooks work?",
    ],
    hotkey: "mod+i",

    // Body = Inter, headings/display = ApfelGrotezk. Both are already registered as
    // document-level @font-face by Mintlify (docs.json `fonts`), and @font-face is
    // global to the document, so the widget's Shadow DOM can use them by name.
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, sans-serif",
    fontFamilyDisplay: "ApfelGrotezk, Inter, ui-sans-serif, system-ui, sans-serif",

    // Dodo brand palette — light.
    theme: {
      "--background": "#ffffff",
      "--foreground": "#292a25",
      "--card": "#ffffff",
      "--card-foreground": "#292a25",
      "--popover": "#ffffff",
      "--popover-foreground": "#292a25",
      "--primary": "#779812",
      "--primary-foreground": "#ffffff",
      "--primary-hover": "#166534",
      "--secondary": "#f1f3ea",
      "--secondary-foreground": "#2c3413",
      "--muted": "#f5f6f1",
      "--muted-foreground": "#53554f",
      "--accent": "#eef3df",
      "--accent-foreground": "#2c3413",
      "--destructive": "#b42318",
      "--destructive-foreground": "#ffffff",
      "--border": "#e5e7e0",
      "--input": "#e5e7e0",
      "--ring": "#779812",
      "--radius": "0.75rem",
      "--ring-soft": "rgba(119, 152, 18, 0.18)",
      "--shadow-launcher": "0 1px 2px rgba(20, 24, 10, 0.12), 0 10px 28px -10px rgba(119, 152, 18, 0.5)",
      "--shadow-launcher-hover": "0 2px 6px rgba(20, 24, 10, 0.16), 0 18px 38px -10px rgba(119, 152, 18, 0.62)",
      "--shadow-panel": "0 1px 2px rgba(20, 24, 10, 0.08), 0 24px 50px -16px rgba(20, 24, 10, 0.26), 0 8px 18px -12px rgba(20, 24, 10, 0.18)",
    },

    // Dodo brand palette — dark.
    themeDark: {
      "--background": "#191a17",
      "--foreground": "#ffffff",
      "--card": "#1f201c",
      "--card-foreground": "#ffffff",
      "--popover": "#1f201c",
      "--popover-foreground": "#ffffff",
      "--primary": "#c6fe1e",
      "--primary-foreground": "#14180a",
      "--primary-hover": "#d4ff4d",
      "--secondary": "#262620",
      "--secondary-foreground": "#eaf3d3",
      "--muted": "#232420",
      "--muted-foreground": "#a2a49e",
      "--accent": "#2b3315",
      "--accent-foreground": "#eaf3d3",
      "--destructive": "#ff9b8f",
      "--destructive-foreground": "#14180a",
      "--border": "#2c2d28",
      "--input": "#34352f",
      "--ring": "#c6fe1e",
      "--ring-soft": "rgba(198, 254, 30, 0.16)",
      "--shadow-launcher": "0 1px 2px rgba(0, 0, 0, 0.5), 0 10px 28px -10px rgba(198, 254, 30, 0.3)",
      "--shadow-launcher-hover": "0 2px 6px rgba(0, 0, 0, 0.6), 0 18px 38px -10px rgba(198, 254, 30, 0.42)",
      "--shadow-panel": "0 1px 2px rgba(0, 0, 0, 0.6), 0 24px 56px -16px rgba(0, 0, 0, 0.72), 0 8px 20px -12px rgba(0, 0, 0, 0.55)",
    },
  };

  // Set the new global and mirror to the legacy one so the currently-deployed widget keeps
  // working during cutover: the old bundle reads only chatEndpoint/turnstile/starters/hotkey
  // from window.DodoAssistant and ignores the extra fields; the new bundle reads window.ContextChat.
  window.ContextChat = config;
  window.DodoAssistant = config;

  // Idempotent across Mintlify SPA navigations.
  if (document.getElementById(SCRIPT_ID)) return;

  var s = document.createElement("script");
  s.id = SCRIPT_ID;
  s.src = WIDGET_SRC;
  s.defer = true;
  document.head.appendChild(s);
})();
