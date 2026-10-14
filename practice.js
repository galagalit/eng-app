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
  constructor({ create, onResult, onError, onListening, onWaiting = () => {}, schedule = (fn, delay) => setTimeout(fn, delay), cancel = timer => clearTimeout(timer) }) {
    Object.assign(this, { create, onResult, onError, onListening, onWaiting, schedule, cancel });
    this.active = false; this.listening = false; this.session = null;
    this.timer = null; this.finalizeTimer = null; this.recoveryTimer = null; this.failures = 0;
  }
  start() { if (this.active) return; this.active = true; this.failures = 0; this.open(); }
  clearFinalizeTimer() {
    if (this.finalizeTimer !== null) this.cancel(this.finalizeTimer);
    this.finalizeTimer = null;
  }
  clearSessionTimers() {
    this.clearFinalizeTimer();
    if (this.recoveryTimer !== null) this.cancel(this.recoveryTimer);
    this.recoveryTimer = null;
  }
  open() {
    if (!this.active) return;
    const recognition = this.create();
    this.session = recognition;
    let finalizing = false;
    const current = () => this.session === recognition && this.active;
    const ended = () => {
      if (this.session !== recognition) return;
      this.clearSessionTimers();
      this.session = null; this.listening = false;
      if (this.active) {
        if (!this.failures) this.onWaiting();
        const delay = this.failures ? Math.min(300 * 2 ** this.failures, 4000) : 0;
        this.timer = this.schedule(() => { this.timer = null; this.open(); }, delay);
      }
    };
    const finish = () => {
      if (!current() || finalizing) return;
      finalizing = true; this.listening = false; this.clearFinalizeTimer(); this.onWaiting();
      // A browser can fail to emit end after stop. Recover just as a manual
      // Stop/Start would, but invalidate callbacks before aborting the old session.
      this.recoveryTimer = this.schedule(() => {
        this.recoveryTimer = null;
        if (!current()) return;
        ended();
        try { recognition.abort(); } catch {}
      }, 1200);
      try { recognition.stop(); }
      catch { ended(); try { recognition.abort(); } catch {} }
    };
    const arm = delay => {
      this.clearFinalizeTimer();
      if (current() && !finalizing) this.finalizeTimer = this.schedule(() => {
        this.finalizeTimer = null; finish();
      }, delay);
    };
    recognition.onstart = () => {
      if (current()) { this.listening = true; this.onListening(); arm(5000); }
    };
    recognition.onresult = event => {
      if (!current()) return;
      this.failures = 0; this.onResult(event);
      // Let native single-utterance endpointing confirm rapid speech first.
      // This timer is a recovery fallback, not the normal word boundary.
      const pending = Array.from(event.results).some(result => !result.isFinal && result[0]?.transcript?.trim());
      arm(pending ? 1800 : 5000);
    };
    recognition.onerror = event => {
      if (!current()) return;
      this.failures++;
      const terminal = errorAction(event.error) === 'stop' || this.failures >= 5;
      this.onError(event.error, terminal);
      if (terminal) this.stop(); else finish();
    };
    recognition.onend = ended;
    try { recognition.start(); arm(5000); }
    catch { this.onError('start-failed', true); this.stop(); }
  }
  stop() {
    this.active = false; this.listening = false; this.clearSessionTimers();
    if (this.timer !== null) this.cancel(this.timer);
    this.timer = null;
    const session = this.session; this.session = null;
    if (session) { try { session.abort(); } catch {} }
  }
}
