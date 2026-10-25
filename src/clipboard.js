// src/clipboard.js - Text Clipboard Monitoring Module
const { clipboard } = require('electron');
const EventEmitter = require('events');
const storage = require('./storage.js');

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
   * Validates whether text is a standalone URL using standard URL parsing rules
   * @param {string} text
   * @returns {boolean}
   */
  isUrl(text) {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed || trimmed.includes('\n') || trimmed.includes('\r')) return false;
    if (/\s/.test(trimmed)) return false;

    // Check standard protocols (http, https, ftp)
    if (/^(https?|ftp):\/\//i.test(trimmed)) {
      try {
        const parsed = new URL(trimmed);
        return Boolean(parsed.hostname && parsed.hostname.length > 0);
      } catch {
        return false;
      }
    }

    // Check www. prefix
    if (/^www\.[a-z0-9-]+(\.[a-z0-9-]+)+/i.test(trimmed)) {
      try {
        const parsed = new URL('https://' + trimmed);
        return Boolean(parsed.hostname && parsed.hostname.length > 0);
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Rule-based heuristic to detect likely code snippets using syntax and multiline structures
   * @param {string} text
   * @returns {boolean}
   */
  isCode(text) {
    if (typeof text !== 'string') return false;
    const trimmed = text.trim();
    if (!trimmed) return false;

    // 1. HTML / XML tags
    if (/<\/?(?:html|head|body|div|span|p|a|script|style|template|button|input|form|table|tr|td|th|ul|ol|li|section|header|footer|nav|aside|main|svg|path|code|pre)[>\s]/i.test(trimmed)) {
      return true;
    }

    // 2. Shell / CLI commands at line start
    if (/^(?:\$ |# )?(?:npm|npx|pnpm|yarn|git|cd|ls|mkdir|rm|cp|mv|docker|docker-compose|kubectl|curl|wget|pip|pip3|brew|chmod|chown|sudo|cat|grep|echo|kill|systemctl|ssh|scp)\s+[^\n]+/m.test(trimmed)) {
      return true;
    }

    // 3. SQL queries
    if (/^(?:SELECT\s+.+\s+FROM|INSERT\s+INTO|UPDATE\s+.+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE)\s+/im.test(trimmed)) {
      return true;
    }

    // 4. JSON objects or arrays
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      if (trimmed.includes('\n') || trimmed.includes('":') || trimmed.includes('",') || trimmed.includes('": ')) {
        try {
          const parsed = JSON.parse(trimmed);
          if (typeof parsed === 'object' && parsed !== null) {
            return true;
          }
        } catch {}
      }
    }

    // 5. CSS rule sets
    if (/[.#]?[a-zA-Z0-9_-]+\s*\{\s*[\r\n]+(?:\s*[a-zA-Z-]+:\s*[^;]+;[\r\n]+)+\s*\}/.test(trimmed)) {
      return true;
    }

    // 6. Common programming language declaration keywords at line starts or word boundaries
    const codePatterns = [
      /^(?:const|let|var|function\*?|class|interface|type|enum)\s+[a-zA-Z_$]/m,
      /^(?:import|export)\s+(?:\{|\*|default|[a-zA-Z_$])/m,
      /^(?:def|class|from|import)\s+[a-zA-Z_]/m, // Python
      /^(?:public|private|protected)\s+(?:static\s+)?(?:final\s+)?(?:void|class|interface|int|String|boolean|[a-zA-Z_$]+)\s+[a-zA-Z_$]/m, // Java / C#
      /^(?:fn|pub\s+fn|let\s+mut|impl|struct|enum|use\s+[a-zA-Z_:]+)\b/m, // Rust
      /^(?:package\s+[a-zA-Z_]+|func\s+[a-zA-Z_]+)/m, // Go
      /#include\s+[<"][a-zA-Z0-9_.]+[>"]/m, // C / C++
      /^(?:if|else\s+if|for|while|switch|catch)\s*\([^\n]+\)\s*\{/m,
      /=>\s*\{?/, // Arrow function
      /console\.(?:log|warn|error|info|debug|trace)\(/,
      /document\.(?:getElementById|querySelector|addEventListener)\(/,
      /return\s+[^;\n]+;/m
    ];

    for (const pattern of codePatterns) {
      if (pattern.test(trimmed)) return true;
    }

    // 7. Multiline structures with indentation and programming tokens
    const lines = trimmed.split('\n');
    if (lines.length >= 2) {
      const hasIndentedLines = lines.some((line) => /^(?: {2,}|\t)[^\s]/.test(line));
      const punctuationCount = (trimmed.match(/[{}();=><]/g) || []).length;
      if (hasIndentedLines && punctuationCount >= 3) {
        return true;
      }
    }

    return false;
  }

  /**
   * Lightweight rule-based categorization: 'link', 'code', or 'text'.
   * Defaults uncertain content to 'text'.
   * @param {string} text
   * @returns {'link' | 'code' | 'text'}
   */
  detectType(text) {
    if (!text || typeof text !== 'string') return 'text';
    const trimmed = text.trim();
    if (!trimmed) return 'text';

    // 1. Detect URLs using standard URL parsing rules
    if (this.isUrl(trimmed)) {
      return 'link';
    }

    // 2. Identify likely code snippets using programming syntax & structure
    if (this.isCode(trimmed)) {
      return 'code';
    }

    // 3. Default uncertain content to Text
    return 'text';
  }

  /**
   * Initializes the monitor with saved history and sets previous clipboard value
   * so existing clipboard content is not unexpectedly captured at startup.
   * Ensures backwards compatibility with older saved entries.
   * @param {Array} initialClips Saved history loaded from storage
   */
  async init(initialClips = []) {
    try {
      this.lastText = await clipboard.readText();
    } catch {
      this.lastText = '';
    }
    // Prune loaded clips and ensure valid type categorization for backwards compatibility
    const pruned = storage.pruneHistory(initialClips);
    this.clips = pruned.map((item) => {
      if (!item.type || !['link', 'code', 'text'].includes(item.type)) {
        item.type = this.detectType(item.text);
      }
      return item;
    });
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
    this.emit('monitoring-changed', true);
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
    this.emit('monitoring-changed', false);
  }

  /**
   * Set monitoring state (pause / resume)
   * @param {boolean} enabled
   * @returns {Promise<boolean>}
   */
  async setMonitoring(enabled) {
    if (enabled) {
      await this.start();
    } else {
      this.stop();
    }
    return this.isMonitoring;
  }

  /**
   * Poll check: read clipboard, detect new non-empty text, emit event, and persist
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

      // Enforce 200 ordinary history limit, preserving pinned
      this.clips = storage.pruneHistory(this.clips);

      // Persist to history.json
      await storage.saveHistory(this.clips);

      // Emit new clip event
      this.emit('new-clip', clipItem);
    } catch (err) {
      console.error('[Clipboard] Error checking clipboard:', err.name || 'CheckError');
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
   * Delete an in-memory clip and update persistent storage
   * @param {string} id
   */
  async deleteClip(id) {
    const index = this.clips.findIndex((c) => c.id === id);
    if (index !== -1) {
      this.clips.splice(index, 1);
      await storage.saveHistory(this.clips);
      return true;
    }
    return false;
  }

  /**
   * Update an in-memory clip (e.g. pinned state) and update persistent storage
   * @param {string} id
   * @param {Object} updates
   */
  async updateClip(id, updates) {
    const clip = this.clips.find((c) => c.id === id);
    if (clip) {
      Object.assign(clip, updates);
      this.clips = storage.pruneHistory(this.clips);
      await storage.saveHistory(this.clips);
      return clip;
    }
    return null;
  }

  /**
   * Clear in-memory history and persistent storage
   * @param {boolean} keepPinned When true, preserves pinned entries
   */
  async clearClips(keepPinned = false) {
    if (keepPinned) {
      this.clips = this.clips.filter((c) => c.pinned);
    } else {
      this.clips.length = 0;
    }
    await storage.saveHistory(this.clips);
  }
}

module.exports = new ClipboardMonitor();
