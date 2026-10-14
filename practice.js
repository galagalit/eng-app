export function words(text) {
  return text.toLowerCase().replace(/[’']/g, '').match(/[a-z]+/g) || [];
}

// One result index may change many times while interim; consume only its final value.
export class Practice {
  constructor(target) { this.target = target; this.count = 0; this.active = false; this.seen = new Set(); }
  start() { this.active = this.count < 5; }
  stop() { this.active = false; }
  newSession() { this.seen.clear(); }
  consume(event) {
    const outcomes = [];
    if (!this.active) return outcomes;
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result.isFinal || this.seen.has(i)) continue;
      this.seen.add(i);
      const tokens = words(result[0]?.transcript || '');
      if (!tokens.length) outcomes.push('unclear');
      for (const token of tokens) {
        if (token === this.target) {
          this.count++;
          outcomes.push('correct');
          if (this.count === 5) { this.stop(); outcomes.push('complete'); return outcomes; }
        } else outcomes.push('incorrect');
      }
    }
    return outcomes;
  }
}

export function errorAction(code) {
  if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(code)) return 'stop';
  return 'retry';
}

export class RecognitionLoop {
  constructor({ create, onResult, onError, onListening, schedule = setTimeout, cancel = clearTimeout }) {
    Object.assign(this, { create, onResult, onError, onListening, schedule, cancel });
    this.active = false; this.session = null; this.timer = null; this.failures = 0;
  }
  start() { if (this.active) return; this.active = true; this.failures = 0; this.open(); }
  open() {
    if (!this.active) return;
    const recognition = this.create();
    this.session = recognition;
    recognition.onstart = () => { if (this.session === recognition && this.active) this.onListening(); };
    recognition.onresult = event => {
      if (this.session !== recognition || !this.active) return;
      this.failures = 0; this.onResult(event);
    };
    recognition.onerror = event => {
      if (this.session !== recognition || !this.active) return;
      this.failures++;
      const terminal = errorAction(event.error) === 'stop' || this.failures >= 5;
      this.onError(event.error, terminal);
      if (terminal) this.stop();
    };
    recognition.onend = () => {
      if (this.session !== recognition) return;
      this.session = null;
      if (this.active) this.timer = this.schedule(() => { this.timer = null; this.open(); }, Math.min(300 * 2 ** this.failures, 4000));
    };
    try { recognition.start(); }
    catch { this.onError('start-failed', true); this.stop(); }
  }
  stop() {
    this.active = false;
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    const session = this.session; this.session = null;
    if (session) { try { session.abort(); } catch {} }
  }
}
