export function words(text) {
  return text.toLowerCase().replace(/[’']/g, '').match(/[a-z]+/g) || [];
}

// Credit stable hypotheses per result index, then reconcile with final text.
// Appended hypotheses and later final events can never credit the same word twice.
export class Practice {
  constructor(target) { this.target = target; this.count = 0; this.active = false; this.seen = new Set(); this.credits = new Map(); }
  start() { this.active = this.count < 5; }
  stop() { this.active = false; }
  newSession() { this.seen.clear(); this.credits.clear(); }
  consume(event, { stable = false } = {}) {
    const outcomes = [];
    if (!this.active) return outcomes;
    for (const [index, credit] of this.credits) {
      if (index >= event.results.length && !this.seen.has(index)) {
        this.count -= credit; this.credits.delete(index);
        if (credit) outcomes.push('revised');
      }
    }
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if ((!result.isFinal && !stable) || this.seen.has(i)) continue;
      const tokens = words(result[0]?.transcript || '');
      const matches = tokens.filter(token => token === this.target).length;
      let credited = this.credits.get(i) || 0;
      if (matches < credited) {
        this.count -= credited - matches;
        credited = matches;
        outcomes.push('revised');
      }
      if (result.isFinal) this.seen.add(i);
      if (!tokens.length && result.isFinal) outcomes.push('unclear');
      let skipped = 0;
      for (const token of tokens) {
        if (token === this.target) {
          if (skipped++ < credited) continue;
          this.count++;
          this.credits.set(i, skipped);
          outcomes.push('correct');
          if (this.count === 5) { this.stop(); outcomes.push('complete'); return outcomes; }
        } else if (result.isFinal) outcomes.push('incorrect');
      }
      this.credits.set(i, matches);
    }
    return outcomes;
  }
}

export function errorAction(code) {
  if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(code)) return 'stop';
  return 'retry';
}

export class RecognitionLoop {
  constructor({ create, onResult, onError, onListening, onWaiting = () => {}, onStableResult = null, schedule = (fn, delay) => setTimeout(fn, delay), cancel = timer => clearTimeout(timer) }) {
    Object.assign(this, { create, onResult, onError, onListening, onWaiting, onStableResult, schedule, cancel });
    this.active = false; this.listening = false; this.session = null;
    this.timer = null; this.finalizeTimer = null; this.recoveryTimer = null; this.stableTimer = null; this.failures = 0;
  }
  start() { if (this.active) return; this.active = true; this.failures = 0; this.open(); }
  clearFinalizeTimer() {
    if (this.finalizeTimer !== null) this.cancel(this.finalizeTimer);
    this.finalizeTimer = null;
  }
  clearSessionTimers() {
    this.clearFinalizeTimer();
    if (this.stableTimer !== null) this.cancel(this.stableTimer);
    this.stableTimer = null;
    if (this.recoveryTimer !== null) this.cancel(this.recoveryTimer);
    this.recoveryTimer = null;
  }
  open() {
    if (!this.active) return;
    const recognition = this.create();
    this.session = recognition;
    let finalizing = false, speaking = false, speechEnded = false;
    let signature = '';
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
    recognition.onspeechstart = () => {
      if (current() && !finalizing) { speaking = true; speechEnded = false; arm(5000); }
    };
    recognition.onspeechend = () => {
      if (current() && !finalizing) { speaking = false; speechEnded = true; arm(this.onStableResult ? 1200 : 180); }
    };
    recognition.onresult = event => {
      if (!current()) return;
      this.failures = 0; this.onResult(event);
      const snapshot = Array.from(event.results, result => Object.assign([{ transcript: result[0]?.transcript || '' }], { isFinal: result.isFinal }));
      const pendingSignature = JSON.stringify(snapshot.map((r, i) => r.isFinal ? null : [i, r[0].transcript]));
      if (pendingSignature !== signature) {
        signature = pendingSignature;
        if (this.stableTimer !== null) this.cancel(this.stableTimer);
        this.stableTimer = null;
        if (snapshot.some(r => !r.isFinal && r[0].transcript.trim()) && current() && this.onStableResult) {
          this.stableTimer = this.schedule(() => {
            this.stableTimer = null;
            if (current()) this.onStableResult({ resultIndex: 0, results: snapshot });
          }, 350);
        }
      }
      // Let the browser process the speech stream without ending every credited word.
      // This timer is a recovery fallback, not the normal word boundary.
      const pending = Array.from(event.results).some(result => !result.isFinal && result[0]?.transcript?.trim());
      arm(this.onStableResult ? (pending ? 2500 : 5000) : pending ? (speechEnded ? 180 : speaking ? 2500 : 900) : 5000);
    };
    recognition.onerror = event => {
      if (!current()) return;
      if (this.stableTimer !== null) this.cancel(this.stableTimer);
      this.stableTimer = null;
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
