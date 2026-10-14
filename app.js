import { Practice, RecognitionLoop, words } from './practice.js?v=7';
const vocabulary = [ ['go','To move or travel somewhere.'], ['come','To move toward someone or somewhere.'], ['make','To create or prepare something.'], ['take','To pick up or carry something.'], ['give','To offer something to someone.'] ];
const $ = id => document.getElementById(id);
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let feedbackUntil = 0, feedbackTimer;
let index = 0, practice = new Practice(vocabulary[0][0]), audio;
function sound(positive) {
  try {
    if (!audio || audio.state !== 'running') return;
    const oscillator = audio.createOscillator(), gain = audio.createGain();
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.frequency.setValueAtTime(positive ? 660 : 220, audio.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(positive ? 880 : 150, audio.currentTime + .12);
    gain.gain.setValueAtTime(.06, audio.currentTime);
    gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .18);
    oscillator.start(); oscillator.stop(audio.currentTime + .2);
  } catch { /* Audio feedback is optional when browser audio is unavailable. */ }
}
function message(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function feedback(text, error = false, force = false) {
  clearTimeout(feedbackTimer);
  const remaining = feedbackUntil - Date.now();
  if (!force && !error && remaining > 0) {
    feedbackTimer = setTimeout(() => feedback(text), remaining);
    return;
  }
  feedbackUntil = error ? Date.now() + 2500 : 0;
  $('feedback').textContent = text;
  $('feedback').classList.toggle('error', error);
}
function render() {
  $('progress').replaceChildren(...Array.from({length:5}, (_, i) => {
    const cell = document.createElement('div'); cell.className = `cell${i < practice.count ? ' success' : ''}`;
    cell.textContent = i < practice.count ? '✓' : i + 1; cell.setAttribute('aria-label', `Repetition ${i+1}: ${i < practice.count ? 'successful' : 'pending'}`); return cell;
  }));
  $('start').disabled = !SpeechRecognition || practice.active || practice.count === 5;
  $('stop').disabled = !practice.active; $('next').disabled = practice.count !== 5;
}
const loop = new RecognitionLoop({
  create() {
    practice.newSession();
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US'; recognition.continuous = true; recognition.interimResults = true; recognition.maxAlternatives = 1;
    return recognition;
  },
  onListening() { message('Listening… say the word, then pause.'); },
  onWaiting() { message('One moment… wait for Listening before the next word.'); },
  onResult: event => handleResult(event),
  onStableResult: event => handleResult(event, true),
  onError(code, terminal) {
    const descriptions = {
      'not-allowed': 'Microphone permission was denied. Allow access in browser settings, then try again.',
      'service-not-allowed': 'Speech recognition is unavailable. Try Chrome and check browser settings.',
      'audio-capture': 'No microphone is available. Connect a microphone and try again.',
      'language-not-supported': 'English recognition is unavailable in this browser.',
      'start-failed': 'Could not start recognition. Check microphone access and try again.',
      'network': "Didn't catch that. Try again. The browser speech service could not connect.",
      'no-speech': "Didn't catch that. Try again. Check your selected microphone and speak after Listening appears."
    };
    const detail = descriptions[code];
    feedback(detail ? `${detail}${terminal && ['network', 'no-speech'].includes(code) ? ' Press Start Recording to retry.' : ''}` : (terminal ? "Didn't catch that. Try again. Check your connection and press Start Recording." : "Didn't catch that. Try again."));
    message(terminal ? 'Recording stopped.' : 'Reconnecting microphone…');
    if (terminal) practice.stop();
    render();
  }
});
function handleResult(event, stable = false) {
    const outcomes = practice.consume(event, { stable });
    for (const outcome of outcomes) {
      if (outcome === 'correct') sound(true);
      if (outcome === 'incorrect') sound(false);
    }
    // Keep outcome feedback separate from microphone/restart status.
    // A mixed batch must not erase an incorrect word with a later correct token.
    if (outcomes.includes('complete')) {
      loop.stop(); message('Practice complete.'); feedback('Five little wins. Well done!', false, true); $('celebration').hidden = false;
    } else if (outcomes.includes('incorrect')) {
      const wrong = Array.from(event.results).filter(r => r.isFinal).flatMap(r => words(r[0]?.transcript || '')).filter(word => word !== practice.target);
      feedback(`Try again! Heard “${wrong.join(' ')}”; say “${practice.target}”.`, true);
    }
    else if (outcomes.includes('correct')) feedback('Nice work!');
    else if (outcomes.includes('revised')) feedback('Recognition changed its guess. Try again.');
    else if (outcomes.includes('unclear')) feedback("Didn't catch that. Try again.");
    if (stable && !outcomes.length) {
      const tentative = Array.from(event.results).filter(r => !r.isFinal).map(r => r[0]?.transcript || '').join(' ').trim();
      if (tentative && !words(tentative).includes(practice.target)) feedback(`Hearing “${tentative}”. Try saying “${practice.target}” again.`);
    }
    const changed = Array.from(event.results).slice(event.resultIndex);
    const interim = changed.filter(result => !result.isFinal).map(result => result[0]?.transcript || '').join(' ').trim();
    const final = changed.filter(result => result.isFinal).map(result => result[0]?.transcript || '').join(' ').trim();
    if (interim) {
      $('heard').textContent = `Hearing: “${interim}” — live recognition.`;
      if (!outcomes.length) message('Listening… keep speaking at a comfortable pace.');
    } else if (outcomes.length) {
      $('heard').textContent = final ? `Heard: “${final}”` : 'Try a short pause between words.';
    }
    render();
}
$('start').onclick = () => {
  if (!SpeechRecognition) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch {}
  feedback('', false, true); practice.start(); message('Starting microphone…'); loop.start(); render();
};
$('stop').onclick = () => { practice.stop(); loop.stop(); message('Paused. Your progress is saved.'); render(); };
function showWord() {
  $('target').textContent = vocabulary[index][0];
  $('meaning').textContent = vocabulary[index][1];
  $('word-number').textContent = `WORD ${String(index+1).padStart(2,'0')} / ${String(vocabulary.length).padStart(2,'0')}`;
}
$('next').onclick = () => {
  loop.stop(); index = (index + 1) % vocabulary.length; practice = new Practice(vocabulary[index][0]);
  showWord();
  feedback('', false, true); $('celebration').hidden = true; $('heard').textContent = 'Your five wins start here.'; message('Ready when you are.'); render();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && practice.active) { practice.stop(); loop.stop(); message('Paused while this tab is in the background. Press Start Recording to resume.'); render(); }
});
window.addEventListener('pagehide', () => loop.stop());
showWord();
if (!SpeechRecognition) message('Speech recognition is not supported here. Try Chrome on desktop or Android.');
else if (!window.isSecureContext) { message('Microphone access requires HTTPS or localhost.'); $('start').disabled = true; }
render();
if (!window.isSecureContext) $('start').disabled = true;
