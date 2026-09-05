// ==UserScript==
// @name         [Dota2ProTracker] Hero ID Generator
// @namespace    https://github.com/myouisaur/Dota2ProTracker
// @icon         https://dota2protracker.com/static/favicon.ico
// @version      1.2
// @description  Generates a copyable list of hero IDs based on the heroes currently shown in the table.
// @author       Xiv
// @match        *://*.dota2protracker.com/*
// @grant        GM_getValue
// @grant        GM_setValue
// @run-at       document-idle
// @noframes
// @updateURL    https://myouisaur.github.io/Dota2ProTracker/hero-id.user.js
// @downloadURL  https://myouisaur.github.io/Dota2ProTracker/hero-id.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Duplicate execution guard
  // ---------------------------------------------------------------------
  if (window.xivHeroIdGeneratorInitialized) return;
  window.xivHeroIdGeneratorInitialized = true;

  // ---------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------
  const CONFIG = {
    // Feature Flags
    FEATURES: {
      DEBUG: false,
      LIVE_REFRESH_WHILE_OPEN: true,
    },

    // Selectors
    SELECTORS: {
      HERO_LINK: 'a[href^="/hero/"]',
      TABLE_CONTAINER_PRIMARY: '.d2-table-scroll-area',
      TABLE_ROW_MARKER: '[data-d2-table-column-key]',
    },

    // Text
    TEXT: {
      MISSING_ID_SUFFIX: 'missing id>',
    },

    // CSS Classes
    CSS_CLASSES: {
      FAB: 'xiv-hig-fab',
      PANEL: 'xiv-hig-panel',
      PANEL_OPEN: 'xiv-hig-panel-open',
      TOAST: 'xiv-hig-toast',
      TOAST_SHOW: 'xiv-hig-toast-show',
      TOAST_SUCCESS: 'xiv-hig-toast-success',
      TOAST_WARNING: 'xiv-hig-toast-warning',
      SETTINGS_OVERLAY: 'xiv-hig-settings-overlay',
      SETTINGS_OPEN: 'xiv-hig-settings-open',
    },

    // Storage Keys
    STORAGE: {
      HERO_MAP_OVERRIDES: 'xiv_hig_hero_map_overrides',
    },

    // Timing
    TIMING: {
      MUTATION_DEBOUNCE_MS: 200,
      TOAST_DURATION_MS: 2600,
      // Only active while the panel is open — checks whether SPA navigation
      // has swapped in a new table container so the observer can reattach.
      CONTAINER_WATCHDOG_INTERVAL_MS: 1000,
    },
  };

  // ---------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------
  const Logger = {
    prefix: '[D2PT-HeroIdGenerator]',
    log(module, message, data) {
      if (!CONFIG.FEATURES.DEBUG) return;
      console.log(`${this.prefix}[${module}] ${message}`, data !== undefined ? data : '');
    },
    warn(module, message) {
      console.warn(`${this.prefix}[${module}] ${message}`);
    },
    error(module, message, err) {
      console.error(`${this.prefix}[${module}] ${message}`, err || '');
    },
  };

  // ---------------------------------------------------------------------
  // Default Hero ID Map — sourced from the user-provided hero ID spreadsheet.
  // Keys are the hero's display/localized name; values are the hero ID.
  // Editable in-page via the settings panel (gear icon), or directly here.
  // ---------------------------------------------------------------------
  const DEFAULT_HERO_MAP = {
    'Anti-Mage': 1, 'Axe': 2, 'Bane': 3, 'Bloodseeker': 4, 'Crystal Maiden': 5,
    'Drow Ranger': 6, 'Earthshaker': 7, 'Juggernaut': 8, 'Mirana': 9, 'Morphling': 10,
    'Shadow Fiend': 11, 'Phantom Lancer': 12, 'Puck': 13, 'Pudge': 14, 'Razor': 15,
    'Sand King': 16, 'Storm Spirit': 17, 'Sven': 18, 'Tiny': 19, 'Vengeful Spirit': 20,
    'Windranger': 21, 'Zeus': 22, 'Kunkka': 23, 'Lina': 25, 'Lion': 26,
    'Shadow Shaman': 27, 'Slardar': 28, 'Tidehunter': 29, 'Witch Doctor': 30, 'Lich': 31,
    'Riki': 32, 'Enigma': 33, 'Tinker': 34, 'Sniper': 35, 'Necrophos': 36,
    'Warlock': 37, 'Beastmaster': 38, 'Queen of Pain': 39, 'Venomancer': 40, 'Faceless Void': 41,
    'Wraith King': 42, 'Death Prophet': 43, 'Phantom Assassin': 44, 'Pugna': 45, 'Templar Assassin': 46,
    'Viper': 47, 'Luna': 48, 'Dragon Knight': 49, 'Dazzle': 50, 'Clockwerk': 51,
    'Leshrac': 52, "Nature's Prophet": 53, 'Lifestealer': 54, 'Dark Seer': 55, 'Clinkz': 56,
    'Omniknight': 57, 'Enchantress': 58, 'Huskar': 59, 'Night Stalker': 60, 'Broodmother': 61,
    'Bounty Hunter': 62, 'Weaver': 63, 'Jakiro': 64, 'Batrider': 65, 'Chen': 66,
    'Spectre': 67, 'Ancient Apparition': 68, 'Doom': 69, 'Ursa': 70, 'Spirit Breaker': 71,
    'Gyrocopter': 72, 'Alchemist': 73, 'Invoker': 74, 'Silencer': 75, 'Outworld Devourer': 76,
    'Lycanthrope': 77, 'Brewmaster': 78, 'Shadow Demon': 79, 'Lone Druid': 80, 'Chaos Knight': 81,
    'Meepo': 82, 'Treant Protector': 83, 'Ogre Magi': 84, 'Undying': 85, 'Rubick': 86,
    'Disruptor': 87, 'Nyx Assassin': 88, 'Naga Siren': 89, 'Keeper of the Light': 90, 'Wisp': 91,
    'Visage': 92, 'Slark': 93, 'Medusa': 94, 'Troll Warlord': 95, 'Centaur Warrunner': 96,
    'Magnus': 97, 'Timbersaw': 98, 'Bristleback': 99, 'Tusk': 100, 'Skywrath Mage': 101,
    'Abaddon': 102, 'Elder Titan': 103, 'Legion Commander': 104, 'Techies': 105, 'Ember Spirit': 106,
    'Earth Spirit': 107, 'Underlord': 108, 'Terrorblade': 109, 'Phoenix': 110, 'Oracle': 111,
    'Winter Wyvern': 112, 'Arc Warden': 113, 'Monkey King': 114, 'Dark Willow': 119, 'Pangolier': 120,
    'Grimstroke': 121, 'Hoodwink': 123, 'Void Spirit': 126, 'Snapfire': 128, 'Mars': 129,
    'Ringmaster': 131, 'Dawnbreaker': 135, 'Marci': 136, 'Primal Beast': 137, 'Muerta': 138,
    'Kez': 145, 'Largo': 155,
  };

  // Alternate/legacy display names the site may use that differ from the
  // spreadsheet's localized name. Maps alias -> canonical DEFAULT_HERO_MAP key.
  const NAME_ALIASES = {
    'Outworld Destroyer': 'Outworld Devourer',
    'Lycan': 'Lycanthrope',
    'Windrunner': 'Windranger',
    'Nevermore': 'Shadow Fiend',
    'Furion': "Nature's Prophet",
  };

  // ---------------------------------------------------------------------
  // Hero Map Store — merges built-in defaults with user-saved overrides.
  // ---------------------------------------------------------------------
  const HeroMapStore = {
    overrides: {},

    init() {
      this.overrides = this.loadOverrides();
    },

    loadOverrides() {
      try {
        if (typeof GM_getValue !== 'function') return {};
        const raw = GM_getValue(CONFIG.STORAGE.HERO_MAP_OVERRIDES, '{}');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        return parsed;
      } catch (err) {
        Logger.error('HeroMapStore', 'Stored hero map overrides were corrupted. Falling back to defaults.', err);
        return {};
      }
    },

    saveOverrides(overridesObject) {
      try {
        if (typeof GM_setValue !== 'function') return false;
        GM_setValue(CONFIG.STORAGE.HERO_MAP_OVERRIDES, JSON.stringify(overridesObject));
        this.overrides = overridesObject;
        return true;
      } catch (err) {
        Logger.error('HeroMapStore', 'Failed to save hero map overrides.', err);
        return false;
      }
    },

    resetOverrides() {
      return this.saveOverrides({});
    },

    getMergedMap() {
      return Object.assign({}, DEFAULT_HERO_MAP, this.overrides);
    },

    getOverridesRaw() {
      return this.overrides;
    },

    // Builds a normalized (lowercase, punctuation-stripped) lookup table so
    // minor formatting differences (curly quotes, extra spaces) don't cause
    // false "missing id" results.
    buildNormalizedLookup() {
      const merged = this.getMergedMap();
      const lookup = new Map();

      for (const [name, id] of Object.entries(merged)) {
        const numericId = Number(id);
        if (!Number.isFinite(numericId)) continue;
        lookup.set(Utils.normalizeName(name), numericId);
      }

      for (const [alias, canonical] of Object.entries(NAME_ALIASES)) {
        const targetId = merged[canonical];
        if (targetId === undefined) continue;
        const numericId = Number(targetId);
        if (!Number.isFinite(numericId)) continue;
        lookup.set(Utils.normalizeName(alias), numericId);
      }

      return lookup;
    },
  };

  // ---------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------
  const Utils = {
    debounce(fn, delayMs) {
      let timeoutId = null;
      return (...args) => {
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delayMs);
      };
    },

    normalizeName(name) {
      if (typeof name !== 'string') return '';
      return name
        .normalize('NFKD')
        .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
        .replace(/[^a-z0-9']/gi, '')
        .toLowerCase();
    },

    decodeHeroNameFromHref(href) {
      try {
        const path = href.replace(/^\/hero\//, '');
        return decodeURIComponent(path).trim();
      } catch (err) {
        return href.replace(/^\/hero\//, '').trim();
      }
    },
  };

  // ---------------------------------------------------------------------
  // DOM Locator (read-only — never mutates the site's own DOM tree)
  // ---------------------------------------------------------------------
  const DomLocator = {
    // Resolves the actual data table container — never the whole document —
    // so unrelated hero links elsewhere on the page (e.g. "Top Heroes" cards)
    // are never picked up. Returns null if no table can be found, rather than
    // silently falling back to a page-wide scope.
    findTableContainer() {
      const primary = document.querySelector(CONFIG.SELECTORS.TABLE_CONTAINER_PRIMARY);
      if (primary) return primary;

      // Fallback: climb up from a table cell marker to find a reasonably
      // scoped ancestor, in case the site renames the scroll-area class.
      const marker = document.querySelector(CONFIG.SELECTORS.TABLE_ROW_MARKER);
      if (marker) {
        const ancestor = marker.closest('div[class]');
        if (ancestor) {
          Logger.warn('DomLocator', 'Primary table selector not found; using marker-based fallback container.');
          return ancestor.parentElement || ancestor;
        }
      }

      return null;
    },

    findHeroLinks(container) {
      if (!container) return [];
      return Array.from(container.querySelectorAll(CONFIG.SELECTORS.HERO_LINK));
    },

    isElementVisible(element) {
      if (!element || !element.isConnected) return false;

      let node = element;
      while (node && node.nodeType === 1) {
        const style = window.getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') return false;
        node = node.parentElement;
      }

      return true;
    },

    // Extracts hero display names, in table order, deduplicated by href.
    // Returns { names, containerFound } so callers can distinguish "no table
    // on this page" from "table present but every row is filtered out".
    extractHeroNamesInOrder() {
      const container = this.findTableContainer();
      if (!container) {
        return { names: [], containerFound: false };
      }

      const links = this.findHeroLinks(container);
      const seenHrefs = new Set();
      const names = [];

      for (const link of links) {
        if (!this.isElementVisible(link)) continue;

        const href = link.getAttribute('href') || '';
        if (!href || seenHrefs.has(href)) continue;
        seenHrefs.add(href);

        const name = this.resolveHeroNameForLink(link, href);
        if (name) names.push(name);
      }

      return { names, containerFound: true };
    },

    resolveHeroNameForLink(link, href) {
      const fromHref = Utils.decodeHeroNameFromHref(href);
      if (fromHref) return fromHref;

      const img = link.querySelector('img[alt]');
      if (img && img.alt && img.alt.trim()) return img.alt.trim();

      const hiddenSpan = link.querySelector('span');
      if (hiddenSpan && hiddenSpan.textContent && hiddenSpan.textContent.trim()) {
        return hiddenSpan.textContent.trim();
      }

      return null;
    },

    getObserveRoot() {
      return this.findTableContainer();
    },
  };

  // ---------------------------------------------------------------------
  // Generator — turns hero names into the final output text.
  // ---------------------------------------------------------------------
  const Generator = {
    generate() {
      const { names, containerFound } = DomLocator.extractHeroNamesInOrder();

      if (!containerFound) {
        return { lines: [], isEmpty: true, emptyReason: 'no-table' };
      }

      if (names.length === 0) {
        return { lines: [], isEmpty: true, emptyReason: 'no-matches' };
      }

      const lookup = HeroMapStore.buildNormalizedLookup();
      const lines = names.map((name) => {
        const id = lookup.get(Utils.normalizeName(name));
        return id !== undefined ? String(id) : `${name} - ${CONFIG.TEXT.MISSING_ID_SUFFIX}`;
      });

      return { lines, isEmpty: false, emptyReason: null };
    },

    formatOutputText(lines) {
      return lines.join(',\n');
    },
  };

  // ---------------------------------------------------------------------
  // DOM Builder — safe element creation, no innerHTML templating for content.
  // ---------------------------------------------------------------------
  const DOMBuilder = {
    create(tag, attributes = {}, ...children) {
      const el = document.createElement(tag);
      for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className') el.className = value;
        else if (key === 'style') el.style.cssText = value;
        else if (key === 'dataset') Object.assign(el.dataset, value);
        else if (key.startsWith('on') && typeof value === 'function') {
          el.addEventListener(key.substring(2).toLowerCase(), value);
        } else if (key === 'html') {
          // Reserved exclusively for trusted, static SVG icon markup defined
          // in this script — never used with user-supplied or remote text.
          el.innerHTML = value;
        } else {
          el.setAttribute(key, value);
        }
      }
      children.forEach((child) => {
        if (child === null || child === undefined) return;
        if (typeof child === 'string' || typeof child === 'number') {
          el.appendChild(document.createTextNode(String(child)));
        } else if (child instanceof Node) {
          el.appendChild(child);
        }
      });
      return el;
    },
  };

  // ---------------------------------------------------------------------
  // Icons (trusted, static SVG markup only)
  // ---------------------------------------------------------------------
  const Icons = {
    generate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h3m10 0h3v3M4 17v3h3m10 0h3v-3M9 8h6m-6 4h6m-6 4h4"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 2v6h-6M3 22v-6h6M3.51 9a9 9 0 0114.85-3.36L21 8M3 16l2.64 2.36A9 9 0 0020.49 15"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06A1.65 1.65 0 009 4.6a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
  };

  // ---------------------------------------------------------------------
  // Styles
  // ---------------------------------------------------------------------
  const Styles = {
    init() {
      const css = `
        .${CONFIG.CSS_CLASSES.FAB} {
          position: fixed;
          bottom: clamp(1rem, 3vw, 2rem);
          right: clamp(1rem, 3vw, 2rem);
          width: clamp(2.75rem, 6vw, 3.5rem);
          height: clamp(2.75rem, 6vw, 3.5rem);
          border-radius: 50%;
          background: #0e7490;
          color: #ecfeff;
          border: 1px solid #22d3ee55;
          box-shadow: 0 4px 16px rgba(14, 116, 144, 0.4);
          cursor: pointer;
          z-index: 2147483000;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease, background-color 0.2s ease;
        }
        .${CONFIG.CSS_CLASSES.FAB}:hover { transform: translateY(-2px) scale(1.05); background: #155e75; }
        .${CONFIG.CSS_CLASSES.FAB}:focus-visible { outline: 2px solid #67e8f9; outline-offset: 3px; }
        .${CONFIG.CSS_CLASSES.FAB}:active { transform: translateY(1px) scale(0.95); }
        .${CONFIG.CSS_CLASSES.FAB} svg { width: 1.35rem; height: 1.35rem; }

        .${CONFIG.CSS_CLASSES.PANEL} {
          position: fixed;
          bottom: calc(clamp(2.75rem, 6vw, 3.5rem) + clamp(1rem, 3vw, 2rem) + 0.75rem);
          right: clamp(1rem, 3vw, 2rem);
          width: clamp(19rem, 88vw, 24rem);
          max-height: min(65vh, 32rem);
          display: flex;
          flex-direction: column;
          background: #0b1620;
          border: 1px solid #1f3442;
          border-radius: 0.75rem;
          box-shadow: 0 12px 36px rgba(0, 0, 0, 0.45);
          z-index: 2147483001;
          opacity: 0;
          pointer-events: none;
          transform: translateY(0.5rem);
          transform-origin: bottom right;
          transition: opacity 0.18s ease, transform 0.18s ease;
          font-family: inherit;
          color: #e2e8f0;
        }
        .${CONFIG.CSS_CLASSES.PANEL}.${CONFIG.CSS_CLASSES.PANEL_OPEN} {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }

        .xiv-hig-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          padding: clamp(0.75rem, 2vw, 1rem);
          border-bottom: 1px solid #1f3442;
        }
        .xiv-hig-title { font-size: clamp(0.9rem, 2vw, 1rem); font-weight: 700; color: #67e8f9; letter-spacing: 0.02em; }
        .xiv-hig-header-actions { display: flex; gap: 0.35rem; align-items: center; }

        .xiv-hig-icon-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: clamp(2rem, 5vw, 2.25rem);
          height: clamp(2rem, 5vw, 2.25rem);
          border-radius: 0.5rem;
          border: 1px solid #223645;
          background: #0d1821;
          color: #cbd5e1;
          cursor: pointer;
          transition: background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease;
        }
        .xiv-hig-icon-btn:hover { background: #142330; color: #67e8f9; border-color: #22d3ee55; }
        .xiv-hig-icon-btn:focus-visible { outline: 2px solid #67e8f9; outline-offset: 2px; }
        .xiv-hig-icon-btn svg { width: 1.1rem; height: 1.1rem; }

        .xiv-hig-body {
          padding: clamp(0.75rem, 2vw, 1rem);
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 0.65rem;
          flex: 1;
        }

        .xiv-hig-textarea {
          width: 100%;
          min-height: 10rem;
          resize: vertical;
          background: #060b10;
          color: #d1fae5;
          border: 1px solid #1f3442;
          border-radius: 0.5rem;
          padding: 0.65rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: clamp(0.75rem, 1.6vw, 0.85rem);
          line-height: 1.5;
        }
        .xiv-hig-textarea:focus-visible { outline: 2px solid #67e8f9; outline-offset: 1px; }

        .xiv-hig-empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 1.5rem 1rem;
          color: #94a3b8;
          text-align: center;
          font-size: 0.85rem;
        }

        .xiv-hig-status-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: #7dd3fc;
        }

        .xiv-hig-footer {
          display: flex;
          gap: 0.5rem;
          padding: clamp(0.6rem, 2vw, 0.85rem);
          border-top: 1px solid #1f3442;
        }

        .xiv-hig-btn {
          flex: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.4rem;
          padding: 0.55rem 0.75rem;
          border-radius: 0.5rem;
          border: 1px solid #223645;
          background: #0d1821;
          color: #e2e8f0;
          font-size: 0.85rem;
          font-weight: 600;
          cursor: pointer;
          transition: background-color 0.15s ease, border-color 0.15s ease, transform 0.1s ease;
        }
        .xiv-hig-btn:hover { background: #142330; border-color: #22d3ee55; }
        .xiv-hig-btn:focus-visible { outline: 2px solid #67e8f9; outline-offset: 2px; }
        .xiv-hig-btn:active { transform: translateY(1px); }
        .xiv-hig-btn svg { width: 1rem; height: 1rem; }
        .xiv-hig-btn-primary { background: #0e7490; border-color: #0e7490; }
        .xiv-hig-btn-primary:hover { background: #155e75; }

        .${CONFIG.CSS_CLASSES.TOAST} {
          position: fixed;
          bottom: clamp(4.5rem, 10vw, 6rem);
          right: clamp(1rem, 3vw, 2rem);
          display: flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.6rem 0.9rem;
          border-radius: 0.5rem;
          background: #0d1821;
          border: 1px solid #223645;
          color: #e2e8f0;
          font-size: 0.8rem;
          z-index: 2147483003;
          opacity: 0;
          transform: translateY(0.5rem);
          pointer-events: none;
          transition: opacity 0.2s ease, transform 0.2s ease;
        }
        .${CONFIG.CSS_CLASSES.TOAST}.${CONFIG.CSS_CLASSES.TOAST_SHOW} { opacity: 1; transform: translateY(0); }
        .${CONFIG.CSS_CLASSES.TOAST}.${CONFIG.CSS_CLASSES.TOAST_SUCCESS} svg { color: #34d399; }
        .${CONFIG.CSS_CLASSES.TOAST}.${CONFIG.CSS_CLASSES.TOAST_WARNING} svg { color: #fbbf24; }
        .${CONFIG.CSS_CLASSES.TOAST} svg { width: 1.1rem; height: 1.1rem; flex-shrink: 0; }

        .${CONFIG.CSS_CLASSES.SETTINGS_OVERLAY} {
          position: fixed;
          inset: 0;
          background: rgba(4, 8, 12, 0.6);
          z-index: 2147483004;
          opacity: 0;
          pointer-events: none;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity 0.2s ease;
        }
        .${CONFIG.CSS_CLASSES.SETTINGS_OVERLAY}.${CONFIG.CSS_CLASSES.SETTINGS_OPEN} { opacity: 1; pointer-events: auto; }

        .xiv-hig-settings-box {
          width: clamp(20rem, 90vw, 30rem);
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          background: #0b1620;
          border: 1px solid #1f3442;
          border-radius: 0.75rem;
          box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
          color: #e2e8f0;
        }

        .xiv-hig-hint {
          font-size: 0.72rem;
          color: #94a3b8;
          line-height: 1.4;
        }

        .xiv-hig-error-text {
          font-size: 0.75rem;
          color: #f87171;
          min-height: 1rem;
        }

        @media (prefers-reduced-motion: reduce) {
          .${CONFIG.CSS_CLASSES.FAB}, .${CONFIG.CSS_CLASSES.PANEL},
          .${CONFIG.CSS_CLASSES.TOAST}, .${CONFIG.CSS_CLASSES.SETTINGS_OVERLAY} {
            transition: none !important;
          }
        }
      `;

      const styleEl = document.createElement('style');
      styleEl.textContent = css;
      styleEl.dataset.xivHigStyles = 'true';
      document.head.appendChild(styleEl);
    },
  };

  // ---------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------
  const Toast = {
    el: null,
    hideTimeoutId: null,

    ensureCreated() {
      if (this.el) return this.el;
      this.el = DOMBuilder.create('div', { className: CONFIG.CSS_CLASSES.TOAST, role: 'status', 'aria-live': 'polite' });
      document.body.appendChild(this.el);
      return this.el;
    },

    show(message, type) {
      const el = this.ensureCreated();
      el.innerHTML = '';

      const iconWrapper = document.createElement('span');
      iconWrapper.innerHTML = type === 'warning' ? Icons.alert : Icons.check;

      const text = document.createElement('span');
      text.textContent = message;

      el.appendChild(iconWrapper.firstElementChild);
      el.appendChild(text);

      el.classList.remove(CONFIG.CSS_CLASSES.TOAST_SUCCESS, CONFIG.CSS_CLASSES.TOAST_WARNING);
      el.classList.add(type === 'warning' ? CONFIG.CSS_CLASSES.TOAST_WARNING : CONFIG.CSS_CLASSES.TOAST_SUCCESS);
      el.classList.add(CONFIG.CSS_CLASSES.TOAST_SHOW);

      if (this.hideTimeoutId) clearTimeout(this.hideTimeoutId);
      this.hideTimeoutId = setTimeout(() => {
        el.classList.remove(CONFIG.CSS_CLASSES.TOAST_SHOW);
      }, CONFIG.TIMING.TOAST_DURATION_MS);
    },
  };

  // ---------------------------------------------------------------------
  // Clipboard
  // ---------------------------------------------------------------------
  const Clipboard = {
    async copy(text) {
      if (!text) {
        Toast.show('Nothing to copy.', 'warning');
        return;
      }

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          Toast.show('Copied to clipboard!', 'success');
          return;
        }
        throw new Error('Clipboard API unavailable.');
      } catch (err) {
        this.copyViaFallback(text);
      }
    },

    copyViaFallback(text) {
      const tempTextarea = document.createElement('textarea');
      tempTextarea.value = text;
      tempTextarea.style.position = 'fixed';
      tempTextarea.style.opacity = '0';
      document.body.appendChild(tempTextarea);
      tempTextarea.select();

      try {
        document.execCommand('copy');
        Toast.show('Copied to clipboard!', 'success');
      } catch (err) {
        Logger.error('Clipboard', 'Fallback copy failed.', err);
        Toast.show('Could not copy automatically. Select the text manually.', 'warning');
      } finally {
        document.body.removeChild(tempTextarea);
        window.getSelection().removeAllRanges();
      }
    },
  };

  // ---------------------------------------------------------------------
  // Settings Panel — hero ID map editor
  // ---------------------------------------------------------------------
  const SettingsPanel = {
    overlayEl: null,
    textareaEl: null,
    errorEl: null,

    open() {
      this.ensureBuilt();
      this.textareaEl.value = JSON.stringify(HeroMapStore.getOverridesRaw(), null, 2);
      this.errorEl.textContent = '';
      this.overlayEl.classList.add(CONFIG.CSS_CLASSES.SETTINGS_OPEN);
      document.addEventListener('keydown', this.handleEsc);
    },

    close() {
      if (!this.overlayEl) return;
      this.overlayEl.classList.remove(CONFIG.CSS_CLASSES.SETTINGS_OPEN);
      document.removeEventListener('keydown', this.handleEsc);
    },

    handleEsc: (event) => {
      if (event.key === 'Escape') SettingsPanel.close();
    },

    ensureBuilt() {
      if (this.overlayEl) return;

      this.errorEl = DOMBuilder.create('div', { className: 'xiv-hig-error-text' });
      this.textareaEl = DOMBuilder.create('textarea', {
        className: 'xiv-hig-textarea',
        spellcheck: 'false',
        'aria-label': 'Hero ID overrides JSON',
      });

      const hint = DOMBuilder.create(
        'p',
        { className: 'xiv-hig-hint' },
        'Add or fix hero name → ID entries as JSON. These are merged on top of the built-in defaults. ',
        'Example: {"Keeper of the Light": 90}'
      );

      const saveBtn = DOMBuilder.create(
        'button',
        { className: 'xiv-hig-btn xiv-hig-btn-primary', type: 'button', onClick: () => this.handleSave() },
        'Save'
      );
      const resetBtn = DOMBuilder.create(
        'button',
        { className: 'xiv-hig-btn', type: 'button', onClick: () => this.handleReset() },
        'Reset to defaults'
      );

      const header = DOMBuilder.create(
        'div',
        { className: 'xiv-hig-header' },
        DOMBuilder.create('span', { className: 'xiv-hig-title' }, 'Hero ID Overrides'),
        DOMBuilder.create(
          'button',
          {
            className: 'xiv-hig-icon-btn',
            type: 'button',
            'aria-label': 'Close settings',
            html: Icons.close,
            onClick: () => this.close(),
          }
        )
      );

      const body = DOMBuilder.create(
        'div',
        { className: 'xiv-hig-body' },
        hint,
        this.textareaEl,
        this.errorEl
      );

      const footer = DOMBuilder.create('div', { className: 'xiv-hig-footer' }, resetBtn, saveBtn);

      const box = DOMBuilder.create('div', { className: 'xiv-hig-settings-box' }, header, body, footer);

      this.overlayEl = DOMBuilder.create(
        'div',
        {
          className: CONFIG.CSS_CLASSES.SETTINGS_OVERLAY,
          onClick: (event) => {
            if (event.target === this.overlayEl) this.close();
          },
        },
        box
      );

      document.body.appendChild(this.overlayEl);
    },

    handleSave() {
      const raw = this.textareaEl.value.trim() || '{}';
      let parsed;

      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        this.errorEl.textContent = 'Invalid JSON — please check for missing commas or quotes.';
        return;
      }

      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        this.errorEl.textContent = 'The JSON must be an object like {"Hero Name": 123}.';
        return;
      }

      const invalidEntry = Object.entries(parsed).find(([, value]) => !Number.isFinite(Number(value)));
      if (invalidEntry) {
        this.errorEl.textContent = `Value for "${invalidEntry[0]}" must be a number.`;
        return;
      }

      const saved = HeroMapStore.saveOverrides(parsed);
      if (!saved) {
        this.errorEl.textContent = 'Could not save — storage is unavailable.';
        return;
      }

      this.errorEl.textContent = '';
      Toast.show('Hero ID overrides saved.', 'success');
      Panel.refresh();
    },

    handleReset() {
      HeroMapStore.resetOverrides();
      this.textareaEl.value = '{}';
      this.errorEl.textContent = '';
      Toast.show('Reset to built-in defaults.', 'success');
      Panel.refresh();
    },
  };

  // ---------------------------------------------------------------------
  // Main Panel — FAB + popup with the generated hero ID list
  // ---------------------------------------------------------------------
  const Panel = {
    panelEl: null,
    textareaEl: null,
    statusEl: null,
    fabEl: null,
    tableObserver: null,
    observedContainer: null,
    containerWatchdogId: null,
    isOpen: false,

    init() {
      Styles.init();
      this.buildFAB();
    },

    buildFAB() {
      this.fabEl = DOMBuilder.create('button', {
        className: CONFIG.CSS_CLASSES.FAB,
        type: 'button',
        title: 'Generate Hero IDs',
        'aria-label': 'Generate Hero IDs',
        html: Icons.generate,
        onClick: () => this.toggle(),
      });
      document.body.appendChild(this.fabEl);
    },

    toggle() {
      if (this.isOpen) this.close();
      else this.open();
    },

    ensurePanelBuilt() {
      if (this.panelEl) return;

      this.textareaEl = DOMBuilder.create('textarea', {
        className: 'xiv-hig-textarea',
        readonly: 'true',
        spellcheck: 'false',
        'aria-label': 'Generated hero ID list',
      });

      this.statusEl = DOMBuilder.create('span', { className: 'xiv-hig-status-row' }, '');

      const refreshBtn = DOMBuilder.create(
        'button',
        {
          className: 'xiv-hig-icon-btn',
          type: 'button',
          title: 'Regenerate now',
          'aria-label': 'Regenerate now',
          html: Icons.refresh,
          onClick: () => this.refresh(true),
        }
      );

      const settingsBtn = DOMBuilder.create(
        'button',
        {
          className: 'xiv-hig-icon-btn',
          type: 'button',
          title: 'Edit hero ID overrides',
          'aria-label': 'Edit hero ID overrides',
          html: Icons.settings,
          onClick: () => SettingsPanel.open(),
        }
      );

      const closeBtn = DOMBuilder.create(
        'button',
        {
          className: 'xiv-hig-icon-btn',
          type: 'button',
          title: 'Close',
          'aria-label': 'Close',
          html: Icons.close,
          onClick: () => this.close(),
        }
      );

      const header = DOMBuilder.create(
        'div',
        { className: 'xiv-hig-header' },
        DOMBuilder.create('span', { className: 'xiv-hig-title' }, 'Hero IDs'),
        DOMBuilder.create('div', { className: 'xiv-hig-header-actions' }, refreshBtn, settingsBtn, closeBtn)
      );

      const body = DOMBuilder.create('div', { className: 'xiv-hig-body' }, this.textareaEl, this.statusEl);

      const copyBtn = DOMBuilder.create(
        'button',
        { className: 'xiv-hig-btn xiv-hig-btn-primary', type: 'button', html: Icons.copy, onClick: () => this.handleCopy() },
        'Copy'
      );
      const footer = DOMBuilder.create('div', { className: 'xiv-hig-footer' }, copyBtn);

      this.panelEl = DOMBuilder.create(
        'div',
        { className: CONFIG.CSS_CLASSES.PANEL, role: 'region', 'aria-label': 'Hero ID Generator' },
        header,
        body,
        footer
      );

      document.body.appendChild(this.panelEl);
    },

    // Docked, non-modal panel: no backdrop, so the page underneath stays
    // fully interactive (navigation, filtering, sorting) while it's open.
    open() {
      this.ensurePanelBuilt();
      this.panelEl.classList.add(CONFIG.CSS_CLASSES.PANEL_OPEN);
      this.isOpen = true;

      document.addEventListener('keydown', this.handleEsc);
      this.refresh(false);

      if (CONFIG.FEATURES.LIVE_REFRESH_WHILE_OPEN) {
        this.attachTableObserver();
        this.startContainerWatchdog();
      }
    },

    close() {
      if (!this.isOpen) return;
      this.panelEl.classList.remove(CONFIG.CSS_CLASSES.PANEL_OPEN);
      this.isOpen = false;

      document.removeEventListener('keydown', this.handleEsc);
      this.detachTableObserver();
      this.stopContainerWatchdog();
    },

    handleEsc: (event) => {
      if (event.key === 'Escape') Panel.close();
    },

    refresh(showToast) {
      if (!this.panelEl) return;

      try {
        const { lines, isEmpty, emptyReason } = Generator.generate();

        if (isEmpty) {
          this.textareaEl.value = '';
          this.textareaEl.style.display = 'none';
          this.renderEmptyState(emptyReason);
          this.statusEl.textContent = '';
          return;
        }

        this.removeEmptyState();
        this.textareaEl.style.display = '';
        this.textareaEl.value = Generator.formatOutputText(lines);

        const missingCount = lines.filter((line) => line.includes(CONFIG.TEXT.MISSING_ID_SUFFIX)).length;
        this.statusEl.textContent = missingCount > 0
          ? `${lines.length} heroes • ${missingCount} missing`
          : `${lines.length} heroes matched`;

        if (showToast) Toast.show('List regenerated.', 'success');
      } catch (err) {
        Logger.error('Panel', 'Failed to refresh the hero ID list.', err);
        this.statusEl.textContent = 'Something went wrong generating the list.';
      }
    },

    renderEmptyState(reason) {
      this.removeEmptyState();

      const [primaryText, secondaryText] = reason === 'no-table'
        ? ['No hero table found on this page.', 'Navigate to a page with a hero table, then click refresh.']
        : ['The table is visible, but no rows match your current filters.', 'Adjust or clear your filters to see hero IDs.'];

      const emptyEl = DOMBuilder.create(
        'div',
        { className: 'xiv-hig-empty-state', 'data-xiv-hig-empty': 'true' },
        DOMBuilder.create('span', {}, primaryText),
        DOMBuilder.create('span', {}, secondaryText)
      );
      this.textareaEl.parentElement.insertBefore(emptyEl, this.textareaEl);
    },

    removeEmptyState() {
      const existing = this.panelEl && this.panelEl.querySelector('[data-xiv-hig-empty]');
      if (existing) existing.remove();
    },

    attachTableObserver() {
      this.detachTableObserver();

      const root = DomLocator.getObserveRoot();
      if (!root) return;

      const debouncedRefresh = Utils.debounce(() => this.refresh(false), CONFIG.TIMING.MUTATION_DEBOUNCE_MS);

      const observer = new MutationObserver(debouncedRefresh);
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden'],
      });
      this.tableObserver = observer;
      this.observedContainer = root;
    },

    detachTableObserver() {
      if (this.tableObserver) {
        this.tableObserver.disconnect();
        this.tableObserver = null;
      }
      this.observedContainer = null;
    },

    // SPA navigation can swap in an entirely new table container node,
    // which leaves the existing MutationObserver watching a detached
    // subtree. This lightweight check (only runs while the panel is open)
    // detects that swap and reattaches to the current container.
    startContainerWatchdog() {
      this.stopContainerWatchdog();

      this.containerWatchdogId = setInterval(() => {
        const currentContainer = DomLocator.getObserveRoot();

        const containerChanged = currentContainer !== this.observedContainer
          && (currentContainer !== null || this.observedContainer !== null);

        if (!containerChanged) return;

        Logger.log('Panel', 'Table container changed (likely SPA navigation). Reattaching observer.');
        this.attachTableObserver();
        this.refresh(false);
      }, CONFIG.TIMING.CONTAINER_WATCHDOG_INTERVAL_MS);
    },

    stopContainerWatchdog() {
      if (this.containerWatchdogId) {
        clearInterval(this.containerWatchdogId);
        this.containerWatchdogId = null;
      }
    },

    async handleCopy() {
      const { lines, isEmpty } = Generator.generate();
      if (isEmpty) {
        Toast.show('Nothing to copy.', 'warning');
        return;
      }
      await Clipboard.copy(Generator.formatOutputText(lines));
    },
  };

  // ---------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------
  try {
    HeroMapStore.init();
    Panel.init();
  } catch (err) {
    Logger.error('Bootstrap', 'Fatal error during initialization.', err);
  }
})();
