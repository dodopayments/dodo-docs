// Global SEO: Inject Organization + WebSite JSON-LD structured data
(function () {
  if (typeof document === "undefined") return;

  // --- Organization + WebSite schema (all pages) ---
  var orgSchema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://dodopayments.com/#organization",
        name: "Dodo Payments",
        url: "https://dodopayments.com",
        logo: {
          "@type": "ImageObject",
          url: "https://docs.dodopayments.com/logo/dark.svg",
        },
        sameAs: [
          "https://x.com/dodopayments",
          "https://linkedin.com/company/dodopayments",
          "https://github.com/dodopayments",
          "https://discord.gg/bYqAp4ayYh",
          "https://www.instagram.com/dodo.payments/",
          "https://www.facebook.com/profile.php?id=61565515607280",
        ],
        description:
          "Dodo Payments is the all-in-one payments, billing, and merchant of record platform for SaaS, AI, and digital products.",
      },
      {
        "@type": "WebSite",
        "@id": "https://docs.dodopayments.com/#website",
        url: "https://docs.dodopayments.com",
        name: "Dodo Payments Documentation",
        publisher: {
          "@id": "https://dodopayments.com/#organization",
        },
        inLanguage: [
          "en",
          "es",
          "fr",
          "de",
          "ja",
          "ko",
          "hi",
          "ar",
          "zh-CN",
          "id",
          "it",
          "pt-BR",
          "sv",
          "vi",
        ],
        description:
          "Documentation for Dodo Payments — the all-in-one payments, billing, and merchant of record platform for SaaS, AI, and digital products.",
        potentialAction: {
          "@type": "SearchAction",
          target: {
            "@type": "EntryPoint",
            urlTemplate:
              "https://docs.dodopayments.com/?q={search_term_string}",
          },
          "query-input": {
            "@type": "PropertyValueSpecification",
            valueRequired: true,
            valueName: "search_term_string",
          },
        },
      },
    ],
  };

  function injectSchema(data) {
    var s = document.createElement("script");
    s.type = "application/ld+json";
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  }

  injectSchema(orgSchema);

  // --- FAQPage schema (FAQ page only, parsed from accordion content) ---
  if (window.location.pathname.replace(/\/$/, "").endsWith("/miscellaneous/faq")) {
    function buildFAQSchema() {
      var faqs = [];

      // Mintlify accordions render as interactive elements with trigger + content.
      // Try common patterns: details/summary, data-state divs, role-based selectors.
      var accordions =
        document.querySelectorAll("details") ||
        document.querySelectorAll("[data-state]");

      // Fallback: find all accordion-like containers by looking for trigger buttons
      // whose text starts with "Q" followed by a digit.
      if (!accordions || !accordions.length) {
        var buttons = document.querySelectorAll("button, [role='button']");
        var seen = new Set();
        buttons.forEach(function (btn) {
          var text = btn.textContent.trim();
          if (/^Q\d+:/i.test(text) && !seen.has(text)) {
            seen.add(text);
            var question = text.replace(/^Q\d+:\s*/i, "");
            // The answer is in the next sibling or parent's content region
            var parent = btn.closest("[data-state]") || btn.parentElement;
            var content =
              parent && parent.querySelector("[role='region'], [data-content]");
            var answer = content
              ? content.textContent.trim().replace(/^A:\s*/i, "")
              : "";
            if (question && answer && answer.length > 10) {
              faqs.push({
                "@type": "Question",
                name: question,
                acceptedAnswer: {
                  "@type": "Answer",
                  text: answer.substring(0, 500),
                },
              });
            }
          }
        });
      } else {
        accordions.forEach(function (acc) {
          var trigger = acc.querySelector("summary, button, [role='button']");
          var content = acc.querySelector(
            "[role='region'], .accordion-content, dd, p"
          );
          if (!trigger) return;

          var qText = trigger.textContent.trim();
          if (!/^Q\d+:/i.test(qText)) return;

          var question = qText.replace(/^Q\d+:\s*/i, "");
          var answer = content
            ? content.textContent.trim().replace(/^A:\s*/i, "")
            : "";

          if (question && answer && answer.length > 10) {
            faqs.push({
              "@type": "Question",
              name: question,
              acceptedAnswer: {
                "@type": "Answer",
                text: answer.substring(0, 500),
              },
            });
          }
        });
      }

      if (faqs.length > 0) {
        injectSchema({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: faqs,
        });
      }
    }

    // Mintlify is SSR (Next.js) so DOM should be ready, but allow time for hydration
    if (document.readyState === "complete") {
      setTimeout(buildFAQSchema, 500);
    } else {
      window.addEventListener("load", function () {
        setTimeout(buildFAQSchema, 500);
      });
    }
  }
})();
