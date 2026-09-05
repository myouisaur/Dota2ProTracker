// ==UserScript==
// @name         [Dota2ProTracker] Matches Threshold
// @namespace    https://github.com/myouisaur/Dota2ProTracker
// @icon         https://dota2protracker.com/static/favicon.ico
// @version      1.4
// @description  Shows a match-count threshold next to the Matches range display and lets you apply it as a filter with one click.
// @author       Xiv
// @match        *://*.dota2protracker.com/*
// @run-at       document-idle
// @noframes
// @updateURL    https://myouisaur.github.io/Dota2ProTracker/matches-threshold.user.js
// @downloadURL  https://myouisaur.github.io/Dota2ProTracker/matches-threshold.user.js
// ==/UserScript==

(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Duplicate execution guard
  // ---------------------------------------------------------------------
  if (window.xivMatchesThresholdInitialized) return;
  window.xivMatchesThresholdInitialized = true;

  // ---------------------------------------------------------------------
  // CONFIG
  // ---------------------------------------------------------------------
  const CONFIG = {
    FEATURES: {
      DEBUG: false,
      LIVE_UPDATES: true,
    },

    SELECTORS: {
      LABEL_CANDIDATES: 'span',
      COUNT_CANDIDATES: 'span',
      OBSERVE_ROOT_FALLBACK: 'main, #app, #__nuxt, #__next, body',
      FILTER_INPUT_PLACEHOLDER: 'Filter heroes',
    },

    TEXT: {
      LABEL_TEXT: 'matches',
      RANGE_SEPARATOR: '-',
    },

    CSS_CLASSES: {
      OVERLAY_WRAPPER: 'xiv-matches-threshold',
      COUNT_SEGMENT: 'xiv-matches-threshold-count',
      PERCENT_SEGMENT: 'xiv-matches-threshold-percent',
    },

    STYLE_PROPERTIES_TO_COPY: [
      'color',
      'fontSize',
      'fontWeight',
      'fontFamily',
      'letterSpacing',
      'fontVariantNumeric',
    ],

    POSITION: {
      OFFSET_LEFT_PX: 6,
      Z_INDEX: 2147483000,
    },

    TIMING: {
      INIT_RETRY_INTERVAL_MS: 500,
      INIT_RETRY_MAX_ATTEMPTS: 20,
      MUTATION_DEBOUNCE_MS: 150,
      SPA_ROUTE_CHECK_INTERVAL_MS: 1000,
      ROOT_MUTATION_DEBOUNCE_MS: 250,
    },

    CALCULATION: {
      THRESHOLD_PERCENT: 0.20,
    },

    FILTER: {
      OPERATOR: '>',
      MATCHES_CLAUSE_REGEX: /matches\s*(>=|<=|>|<|=)\s*\d+/i,
    },
  };

  // ---------------------------------------------------------------------
  // Logging
  // ---------------------------------------------------------------------
  const Logger = {
    prefix: '[D2PT-MatchesThreshold]',
    log(module, message) {
      if (!CONFIG.FEATURES.DEBUG) return;
      console.log(`${this.prefix}[${module}] ${message}`);
    },
    warn(module, message) {
      console.warn(`${this.prefix}[${module}] ${message}`);
    },
    error(module, message, err) {
      console.error(`${this.prefix}[${module}] ${message}`, err || '');
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

    parseHighestMatchCount(rawText) {
      if (typeof rawText !== 'string') return null;
      const parts = rawText.split(CONFIG.TEXT.RANGE_SEPARATOR);
      if (parts.length < 2) return null;

      const lastPart = parts[parts.length - 1];
      const cleaned = lastPart.replace(/[^\d]/g, '');
      if (!cleaned) return null;

      const value = parseInt(cleaned, 10);
      return Number.isFinite(value) ? value : null;
    },

    calculateThreshold(highestValue) {
      return Math.floor(highestValue * CONFIG.CALCULATION.THRESHOLD_PERCENT);
    },

    formatThresholdCountText(thresholdValue) {
      return `(${thresholdValue.toLocaleString('en-US')})`;
    },

    formatThresholdPercentText() {
      const percent = Math.round(CONFIG.CALCULATION.THRESHOLD_PERCENT * 100);
      return `- ${percent}%`;
    },
  };

  // ---------------------------------------------------------------------
  // DOM Locator (read-only — never mutates the site's own DOM tree)
  // ---------------------------------------------------------------------
  const DomLocator = {
    findLabelSpan() {
      const candidates = document.querySelectorAll(CONFIG.SELECTORS.LABEL_CANDIDATES);
      for (const el of candidates) {
        const text = (el.textContent || '').trim().toLowerCase();
        if (text === CONFIG.TEXT.LABEL_TEXT) {
          return el;
        }
      }
      return null;
    },

    findCountSpan(labelSpan) {
      if (!labelSpan || !labelSpan.parentElement) return null;

      const siblingSpans = labelSpan.parentElement.querySelectorAll(
        CONFIG.SELECTORS.COUNT_CANDIDATES
      );

      for (const el of siblingSpans) {
        if (el === labelSpan) continue;
        const text = (el.textContent || '').trim();
        if (text.includes(CONFIG.TEXT.RANGE_SEPARATOR) && /\d/.test(text)) {
          return el;
        }
      }

      return null;
    },

    getObserveRoot(labelSpan) {
      const row = labelSpan && labelSpan.closest('div');
      if (row && row.parentElement) return row.parentElement;

      Logger.warn(
        'DomLocator',
        'Could not resolve a scoped container; falling back to a broader root.'
      );
      return document.querySelector(CONFIG.SELECTORS.OBSERVE_ROOT_FALLBACK) || document.body;
    },

    findFilterInput() {
      const inputs = document.querySelectorAll('input[type="text"], input:not([type])');
      for (const input of inputs) {
        const placeholder = input.getAttribute('placeholder') || '';
        if (placeholder.includes(CONFIG.SELECTORS.FILTER_INPUT_PLACEHOLDER)) {
          return input;
        }
      }
      return null;
    },
  };

  // ---------------------------------------------------------------------
  // Filter Controller
  // ---------------------------------------------------------------------
  const FilterController = {
    buildMatchesClause(thresholdValue) {
      return `matches${CONFIG.FILTER.OPERATOR}${thresholdValue}`;
    },

    computeNewValue(currentValue, thresholdValue) {
      const clause = this.buildMatchesClause(thresholdValue);
      const trimmed = (currentValue || '').trim();

      if (!trimmed) {
        return clause;
      }

      if (CONFIG.FILTER.MATCHES_CLAUSE_REGEX.test(trimmed)) {
        return trimmed.replace(CONFIG.FILTER.MATCHES_CLAUSE_REGEX, clause);
      }

      return `${clause}, ${trimmed}`;
    },

    applyThresholdToFilter(thresholdValue) {
      try {
        const input = DomLocator.findFilterInput();
        if (!input) {
          Logger.warn(
            'FilterController',
            'Could not find the hero filter input. The site layout may have changed.'
          );
          return;
        }

        const newValue = this.computeNewValue(input.value, thresholdValue);
        if (newValue === input.value) return;

        const nativeSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        nativeSetter.call(input, newValue);

        input.dispatchEvent(new Event('input', { bubbles: true }));
        Logger.log('FilterController', `Applied filter: "${newValue}"`);
      } catch (err) {
        Logger.error('FilterController', 'Failed to apply threshold to filter input.', err);
      }
    },
  };

  // ---------------------------------------------------------------------
  // Overlay Renderer — fully detached from the site's own DOM tree.
  // The wrapper is a flex box sized to match the label's own line height,
  // so both segments stay vertically centered against the label regardless
  // of their individual font sizes.
  // ---------------------------------------------------------------------
  const OverlayRenderer = {
    wrapper: null,
    countSegment: null,
    percentSegment: null,
    rafId: null,
    onCountClick: null,

    getOrCreate(clickHandler) {
      if (this.wrapper && this.wrapper.isConnected) return this.wrapper;

      const wrapper = document.createElement('span');
      wrapper.className = CONFIG.CSS_CLASSES.OVERLAY_WRAPPER;
      wrapper.style.position = 'fixed';
      wrapper.style.top = '0';
      wrapper.style.left = '0';
      wrapper.style.zIndex = String(CONFIG.POSITION.Z_INDEX);
      wrapper.style.whiteSpace = 'nowrap';
      wrapper.style.visibility = 'hidden';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.display = 'inline-flex';
      wrapper.style.alignItems = 'center';
      wrapper.style.lineHeight = 'normal';

      const countSegment = document.createElement('span');
      countSegment.className = CONFIG.CSS_CLASSES.COUNT_SEGMENT;
      countSegment.style.cursor = 'pointer';
      countSegment.style.pointerEvents = 'auto';
      countSegment.style.textDecoration = 'none';
      countSegment.style.display = 'inline-block';
      countSegment.title = 'Click to filter heroes by this match threshold';

      countSegment.addEventListener('mouseenter', () => {
        countSegment.style.textDecoration = 'underline';
        countSegment.style.filter = 'brightness(1.25)';
      });
      countSegment.addEventListener('mouseleave', () => {
        countSegment.style.textDecoration = 'none';
        countSegment.style.filter = 'none';
      });

      this.onCountClick = clickHandler;
      countSegment.addEventListener('click', () => {
        if (this.onCountClick) this.onCountClick();
      });

      const percentSegment = document.createElement('span');
      percentSegment.className = CONFIG.CSS_CLASSES.PERCENT_SEGMENT;
      percentSegment.style.marginLeft = '0.3em';
      percentSegment.style.pointerEvents = 'none';
      percentSegment.style.display = 'inline-block';

      wrapper.appendChild(countSegment);
      wrapper.appendChild(percentSegment);
      document.body.appendChild(wrapper);

      this.wrapper = wrapper;
      this.countSegment = countSegment;
      this.percentSegment = percentSegment;
      return wrapper;
    },

    applyStyles(countSourceElement, labelSourceElement) {
      if (!this.countSegment || !this.percentSegment) return;

      try {
        const countComputed = getComputedStyle(countSourceElement);
        for (const prop of CONFIG.STYLE_PROPERTIES_TO_COPY) {
          this.countSegment.style[prop] = countComputed[prop];
        }

        const labelComputed = getComputedStyle(labelSourceElement);
        for (const prop of CONFIG.STYLE_PROPERTIES_TO_COPY) {
          this.percentSegment.style[prop] = labelComputed[prop];
        }
      } catch (err) {
        Logger.error('OverlayRenderer', 'Failed to copy computed style.', err);
      }
    },

    setCountText(text) {
      if (!this.countSegment) return;
      if (this.countSegment.textContent === text) return;
      this.countSegment.textContent = text;
    },

    setPercentText(text) {
      if (!this.percentSegment) return;
      if (this.percentSegment.textContent === text) return;
      this.percentSegment.textContent = text;
    },

    // Positions the wrapper so its vertical center matches the label's
    // vertical center, regardless of font-size differences between the
    // label and the overlay's own text segments.
    reposition(anchorElement) {
      if (!this.wrapper || !anchorElement || !anchorElement.isConnected) return;

      if (this.rafId) cancelAnimationFrame(this.rafId);

      this.rafId = requestAnimationFrame(() => {
        try {
          const rect = anchorElement.getBoundingClientRect();
          this.wrapper.style.height = `${rect.height}px`;
          this.wrapper.style.top = `${rect.top}px`;
          this.wrapper.style.left = `${rect.right + CONFIG.POSITION.OFFSET_LEFT_PX}px`;
          this.wrapper.style.visibility = 'visible';
        } catch (err) {
          Logger.error('OverlayRenderer', 'Failed to reposition overlay.', err);
        }
      });
    },

    destroy() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      if (this.wrapper && this.wrapper.parentNode) {
        this.wrapper.parentNode.removeChild(this.wrapper);
      }
      this.wrapper = null;
      this.countSegment = null;
      this.percentSegment = null;
      this.onCountClick = null;
    },
  };

  // ---------------------------------------------------------------------
  // Feature: Matches Threshold
  // ---------------------------------------------------------------------
  const MatchesThresholdFeature = {
    state: {
      countObserver: null,
      rootObserver: null,
      labelSpan: null,
      countSpan: null,
      routeCheckIntervalId: null,
      lastUrl: null,
      repositionHandler: null,
      currentThresholdValue: null,
    },

    init() {
      let attempts = 0;

      const tryInit = () => {
        attempts += 1;

        try {
          if (this.setup()) return;
        } catch (err) {
          Logger.error('MatchesThresholdFeature', 'Setup threw an unexpected error.', err);
        }

        if (attempts < CONFIG.TIMING.INIT_RETRY_MAX_ATTEMPTS) {
          setTimeout(tryInit, CONFIG.TIMING.INIT_RETRY_INTERVAL_MS);
        } else {
          Logger.warn(
            'MatchesThresholdFeature',
            'Could not find the Matches label after maximum retries. The site layout may have changed.'
          );
        }
      };

      tryInit();
      this.watchForRouteChanges();
    },

    setup() {
      const labelSpan = DomLocator.findLabelSpan();
      if (!labelSpan) return false;

      const countSpan = DomLocator.findCountSpan(labelSpan);
      if (!countSpan) {
        Logger.warn(
          'MatchesThresholdFeature',
          'Found the Matches label but not its count range. The site layout may have changed.'
        );
        return false;
      }

      this.state.labelSpan = labelSpan;
      this.state.countSpan = countSpan;

      OverlayRenderer.getOrCreate(() => this.handleThresholdClick());
      OverlayRenderer.applyStyles(countSpan, labelSpan);
      OverlayRenderer.setPercentText(Utils.formatThresholdPercentText());
      this.applyThreshold(countSpan.textContent);
      OverlayRenderer.reposition(labelSpan);

      this.attachPositionListeners();

      if (CONFIG.FEATURES.LIVE_UPDATES) {
        this.attachCountObserver(countSpan);
        this.attachRootObserver(labelSpan);
      }

      Logger.log('MatchesThresholdFeature', 'Initialized successfully.');
      return true;
    },

    applyThreshold(rawCountText) {
      const highest = Utils.parseHighestMatchCount(rawCountText);
      if (highest === null) {
        Logger.warn(
          'MatchesThresholdFeature',
          `Could not parse match count from "${rawCountText}".`
        );
        return;
      }

      const threshold = Utils.calculateThreshold(highest);
      this.state.currentThresholdValue = threshold;
      OverlayRenderer.setCountText(Utils.formatThresholdCountText(threshold));
    },

    handleThresholdClick() {
      if (this.state.currentThresholdValue === null) {
        Logger.warn('MatchesThresholdFeature', 'No threshold value available yet.');
        return;
      }
      FilterController.applyThresholdToFilter(this.state.currentThresholdValue);
    },

    attachPositionListeners() {
      const handler = Utils.debounce(() => {
        OverlayRenderer.reposition(this.state.labelSpan);
      }, 16);

      window.addEventListener('scroll', handler, { passive: true, capture: true });
      window.addEventListener('resize', handler, { passive: true });

      this.state.repositionHandler = handler;
    },

    detachPositionListeners() {
      if (!this.state.repositionHandler) return;
      window.removeEventListener('scroll', this.state.repositionHandler, { capture: true });
      window.removeEventListener('resize', this.state.repositionHandler);
      this.state.repositionHandler = null;
    },

    attachCountObserver(countSpan) {
      if (this.state.countObserver) this.state.countObserver.disconnect();

      const debouncedHandler = Utils.debounce(() => {
        this.applyThreshold(countSpan.textContent);
        OverlayRenderer.reposition(this.state.labelSpan);
      }, CONFIG.TIMING.MUTATION_DEBOUNCE_MS);

      const observer = new MutationObserver(debouncedHandler);
      observer.observe(countSpan, { characterData: true, childList: true, subtree: true });

      this.state.countObserver = observer;
    },

    attachRootObserver(labelSpan) {
      if (this.state.rootObserver) this.state.rootObserver.disconnect();

      const root = DomLocator.getObserveRoot(labelSpan);
      if (!root) return;

      const debouncedHandler = Utils.debounce(() => {
        if (this.state.labelSpan && this.state.labelSpan.isConnected) return;

        Logger.log('MatchesThresholdFeature', 'Label node replaced. Re-running setup.');
        this.teardown();
        this.init();
      }, CONFIG.TIMING.ROOT_MUTATION_DEBOUNCE_MS);

      const observer = new MutationObserver(debouncedHandler);
      observer.observe(root, { childList: true, subtree: true });

      this.state.rootObserver = observer;
    },

    teardown() {
      if (this.state.countObserver) {
        this.state.countObserver.disconnect();
        this.state.countObserver = null;
      }
      if (this.state.rootObserver) {
        this.state.rootObserver.disconnect();
        this.state.rootObserver = null;
      }
      this.detachPositionListeners();
      OverlayRenderer.destroy();
      this.state.labelSpan = null;
      this.state.countSpan = null;
      this.state.currentThresholdValue = null;
    },

    watchForRouteChanges() {
      this.state.lastUrl = location.href;

      this.state.routeCheckIntervalId = setInterval(() => {
        if (location.href === this.state.lastUrl) return;

        this.state.lastUrl = location.href;
        Logger.log('MatchesThresholdFeature', 'Route change detected. Reinitializing.');

        this.teardown();

        let attempts = 0;
        const tryReinit = () => {
          attempts += 1;
          try {
            if (this.setup()) return;
          } catch (err) {
            Logger.error('MatchesThresholdFeature', 'Reinit setup threw an error.', err);
          }
          if (attempts < CONFIG.TIMING.INIT_RETRY_MAX_ATTEMPTS) {
            setTimeout(tryReinit, CONFIG.TIMING.INIT_RETRY_INTERVAL_MS);
          }
        };
        tryReinit();
      }, CONFIG.TIMING.SPA_ROUTE_CHECK_INTERVAL_MS);
    },
  };

  // ---------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------
  try {
    MatchesThresholdFeature.init();
  } catch (err) {
    Logger.error('Bootstrap', 'Fatal error during initialization.', err);
  }
})();
