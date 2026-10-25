// src/clipboard.js - Text Clipboard Monitoring Module
const { clipboard } = require('electron');
const EventEmitter = require('events');

class ClipboardMonitor extends EventEmitter {
  constructor() {
    super();
    this.pollIntervalMs = 1000;
    this.pollTimer = null;
    this.lastText = '';
    this.isMonitoring = false;
    this.clips = [];
  }

  /**
   * Trims excessive outer whitespace without destroying meaningful multiline formatting or indentation.
   * @param {string} text
   * @returns {string}
   */
  cleanText(text) {
    if (typeof text !== 'string') return '';
    // Normalize newlines (CRLF / CR -> LF)
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    // Trim leading and trailing outer whitespace while preserving internal formatting/newlines
    return normalized.trim();
  }

  /**
   * Heuristic to determine clip type (text, code, link)
   * @param {string} text
   * @returns {'text' | 'code' | 'link'}
   */
  detectType(text) {
    if (!text) return 'text';
    const trimmed = text.trim();

    // Check for URL
    const isUrl = /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(trimmed);
    if (isUrl) return 'link';

    // Check for common code patterns/syntax
    const codeIndicators = [
      /^(const|let|var|function|class|import|export|if|for|while|return)\b/m,
      /[{}();=>]{3,}/,
      /^(git|npm|npx|cd|ls|mkdir|docker|curl|chmod|cat|echo)\s+/m,
      /^\s*<[a-zA-Z][\s\S]*>/m
    ];
    if (codeIndicators.some((regex) => regex.test(text))) {
      return 'code';
    }

    return 'text';
  }

  /**
   * Initializes the monitor and sets previous clipboard value
   * so existing clipboard content is not unexpectedly captured at startup.
   * @param {Array} initialClips Optional initial in-memory items
   */
  async init(initialClips = []) {
    try {
      this.lastText = await clipboard.readText();
    } catch {
      this.lastText = '';
    }
    this.clips = [...initialClips];
  }

  /**
   * Starts polling clipboard every ~1000ms
   */
  async start() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // Reseed lastText on start so nothing stale is immediately re-captured
    try {
      this.lastText = await clipboard.readText();
    } catch {
      this.lastText = '';
    }

    this.pollTimer = setInterval(() => {
      this.checkClipboard();
    }, this.pollIntervalMs);
  }

  /**
   * Stops polling
   */
  stop() {
    if (!this.isMonitoring) return;
    this.isMonitoring = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Poll check: read clipboard, detect new non-empty text, emit event, and update memory
   */
  async checkClipboard() {
    if (!this.isMonitoring) return;

    try {
      const currentRaw = await clipboard.readText();
      if (!currentRaw) return;

      // Skip unchanged raw clipboard contents
      if (currentRaw === this.lastText) return;

      const cleaned = this.cleanText(currentRaw);
      // Skip empty or whitespace-only content
      if (!cleaned) {
        this.lastText = currentRaw;
        return;
      }

      // Skip if cleaned version is identical to previous cleaned content
      if (cleaned === this.cleanText(this.lastText)) {
        this.lastText = currentRaw;
        return;
      }

      // Update baseline
      this.lastText = currentRaw;

      // Create new clip entry
      const clipItem = {
        id: `clip_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        text: cleaned,
        type: this.detectType(cleaned),
        pinned: false,
        timestamp: Date.now(),
        characterCount: cleaned.length
      };

      // Keep in memory (prepended as most recent)
      this.clips.unshift(clipItem);

      // Emit new clip event
      this.emit('new-clip', clipItem);
    } catch (err) {
      console.error('Clipboard check error:', err);
    }
  }

  /**
   * Set lastText baseline (used when copying from within the app to avoid re-capturing)
   * @param {string} text
   */
  setLastText(text) {
    this.lastText = text;
  }

  /**
   * Return in-memory history
   */
  getClips() {
    return [...this.clips];
  }

  /**
   * Delete an in-memory clip
   */
  deleteClip(id) {
    const index = this.clips.findIndex((c) => c.id === id);
    if (index !== -1) {
      this.clips.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Update an in-memory clip
   */
  updateClip(id, updates) {
    const clip = this.clips.find((c) => c.id === id);
    if (clip) {
      Object.assign(clip, updates);
      return clip;
    }
    return null;
  }

  /**
   * Clear in-memory history
   */
  clearClips() {
    this.clips.length = 0;
  }
}

module.exports = new ClipboardMonitor();
