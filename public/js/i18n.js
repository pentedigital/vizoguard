// ── Lightweight i18n engine ──────────────────
(function () {
  "use strict";

  var SUPPORTED = ["en", "ar", "hi", "fr", "es", "tr", "ru"];
  var RTL_LANGS = ["ar"];
  var cache = {};
  // Only these tags are allowed in translation HTML values (FAQ answers use <strong>)
  var ALLOWED_TAGS = ["STRONG", "EM", "A", "BR"];

  // Map URL path prefixes to languages (empty string = default/en)
  var LANG_PATHS = { "ar": "/ar/", "hi": "/hi/", "fr": "/fr/", "es": "/es/", "tr": "/tr/", "ru": "/ru/", "en": "/" };

  function getPathLang() {
    var seg = location.pathname.split("/")[1];
    return (SUPPORTED.indexOf(seg) !== -1) ? seg : null;
  }

  function detectLang() {
    // 1. URL path prefix (/ar/, /hi/, /fr/, /es/) — authoritative, overrides everything
    var pathLang = getPathLang();
    if (pathLang) return pathLang;
    // 2. Root path "/" is explicitly English — don't redirect away from it
    if (location.pathname === "/") return "en";
    // 3. Browser language (no localStorage redirect — URL is the source of truth)
    var nav = (navigator.language || "").slice(0, 2).toLowerCase();
    if (SUPPORTED.indexOf(nav) !== -1) return nav;
    // 4. Default
    return "en";
  }

  function getNestedValue(obj, key) {
    return key.split(".").reduce(function (o, k) {
      return o && o[k];
    }, obj);
  }

  // Sanitize HTML via DOM tree walk — only keep whitelisted tags, strip everything else
  function sanitizeHTML(str) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(str, "text/html");
    var allowed = {};
    ALLOWED_TAGS.forEach(function (t) { allowed[t] = true; });

    function clean(node) {
      var child = node.firstChild;
      while (child) {
        var next = child.nextSibling;
        if (child.nodeType === 1) { // Element
          if (!allowed[child.tagName]) {
            // Unwrap: move children up, remove the disallowed tag
            while (child.firstChild) {
              node.insertBefore(child.firstChild, child);
            }
            node.removeChild(child);
          } else {
            // Remove all attributes except href on <a> (with scheme validation)
            var attrs = Array.prototype.slice.call(child.attributes);
            attrs.forEach(function (a) {
              if (child.tagName === "A" && a.name === "href") {
                if (!/^(https?:\/\/|\/)/.test(a.value)) child.removeAttribute(a.name);
                return;
              }
              child.removeAttribute(a.name);
            });
            clean(child);
          }
        }
        child = next;
      }
    }

    clean(doc.body);
    return doc.body.innerHTML;
  }

  function applyTranslations(translations) {
    document.querySelectorAll("[data-i18n]").forEach(function (el) {
      var key = el.getAttribute("data-i18n");
      var val = getNestedValue(translations, key);
      if (!val) return;

      var attr = el.getAttribute("data-i18n-attr");
      if (attr) {
        // Sanitize href/src to prevent javascript: URI injection from translation files
        if ((attr === 'href' || attr === 'src') && !/^(https?:\/\/|\/)/.test(val)) return;
        el.setAttribute(attr, val);
      } else if (el.hasAttribute("data-i18n-html")) {
        // Sanitize before inserting — only allow whitelisted tags
        el.innerHTML = sanitizeHTML(val);
      } else {
        el.textContent = val;
      }
    });
  }

  function setDirection(lang) {
    var isRTL = RTL_LANGS.indexOf(lang) !== -1;
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", isRTL ? "rtl" : "ltr");

    // Load or remove RTL stylesheet
    var rtlLink = document.getElementById("rtl-css");
    if (isRTL && !rtlLink) {
      rtlLink = document.createElement("link");
      rtlLink.id = "rtl-css";
      rtlLink.rel = "stylesheet";
      rtlLink.href = "/css/rtl.css";
      document.head.appendChild(rtlLink);
    } else if (!isRTL && rtlLink) {
      rtlLink.remove();
    }
  }

  var LANG_LABELS = { "en": "EN", "ar": "العربية", "hi": "हिन्दी", "fr": "FR", "es": "ES", "tr": "TR", "ru": "RU" };
  var dropdownInitialized = false;

  function updateLangSwitcher(lang) {
    document.querySelectorAll("[data-lang-switch]").forEach(function (el) {
      var switchLang = el.getAttribute("data-lang-switch");
      if (switchLang === lang) {
        el.classList.add("active-lang");
      } else {
        el.classList.remove("active-lang");
      }
    });
    // Update dropdown toggle label
    var toggle = document.querySelector(".lang-switcher-toggle");
    if (toggle) toggle.textContent = LANG_LABELS[lang] || lang.toUpperCase();
  }

  // Dropdown open/close
  function initDropdown() {
    if (dropdownInitialized) return;
    dropdownInitialized = true;
    var switcher = document.getElementById("lang-switcher");
    if (!switcher) return;
    var toggle = switcher.querySelector(".lang-switcher-toggle");

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      var isOpen = switcher.classList.toggle("open");
      toggle.setAttribute("aria-expanded", isOpen);
    });

    document.addEventListener("click", function () {
      switcher.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    });

    switcher.querySelector(".lang-dropdown").addEventListener("click", function (e) {
      e.stopPropagation();
    });

    // Keyboard navigation: Escape closes, Arrow Up/Down cycles items
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && switcher.classList.contains("open")) {
        switcher.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.focus();
      }
      if (!switcher.classList.contains("open")) return;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        var items = Array.prototype.slice.call(switcher.querySelectorAll(".lang-dropdown a, .lang-dropdown button"));
        if (!items.length) return;
        var idx = items.indexOf(document.activeElement);
        if (e.key === "ArrowDown") {
          idx = (idx + 1) % items.length;
        } else {
          idx = (idx - 1 + items.length) % items.length;
        }
        items[idx].focus();
      }
    });
  }

  function loadAndApply(lang) {
    if (cache[lang] && cache[lang] !== '__loading__') {
      applyTranslations(cache[lang]);
      setDirection(lang);
      updateLangSwitcher(lang);
      localStorage.setItem("vg_lang", lang);
      return;
    }
    if (cache[lang] === '__loading__') return; // already fetching

    cache[lang] = '__loading__'; // prevent duplicate in-flight fetches
    var i18nController = new AbortController();
    var i18nTimeout = setTimeout(function() { i18nController.abort(); }, 10000);
    fetch("/locales/" + lang + ".json", { signal: i18nController.signal })
      .then(function (res) { clearTimeout(i18nTimeout); return res.json(); })
      .then(function (data) {
        cache[lang] = data;
        applyTranslations(data);
        setDirection(lang);
        updateLangSwitcher(lang);
        localStorage.setItem("vg_lang", lang);
      })
      .catch(function (err) {
        delete cache[lang]; // clear sentinel so user can retry
        console.error("i18n: failed to load " + lang, err);
        if (lang !== "en") { loadAndApply("en"); }
      });
  }

  // Switch language (called from switcher buttons)
  window.switchLang = function (lang) {
    if (SUPPORTED.indexOf(lang) === -1) return;

    // Redirect to the correct language URL path
    var currentPath = location.pathname;
    var targetPath = LANG_PATHS[lang];
    var onTargetPage = (targetPath === "/") ? (currentPath === "/") : (currentPath === targetPath || currentPath.indexOf(targetPath) === 0);
    if (!onTargetPage) {
      window.location.href = targetPath + location.hash;
      return;
    }

    loadAndApply(lang);
  };

  // Initialize on DOM ready
  function init() {
    initDropdown();
    loadAndApply(detectLang());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
