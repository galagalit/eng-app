import { Practice, RecognitionLoop } from './practice.js';
const vocabulary = [ ['go','To move or travel somewhere.'], ['come','To move toward someone or somewhere.'], ['make','To create or prepare something.'], ['take','To pick up or carry something.'], ['give','To offer something to someone.'] ];
const $ = id => document.getElementById(id);
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
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
  onResult(event) {
    const outcomes = practice.consume(event);
    for (const outcome of outcomes) {
      if (outcome === 'correct') { message('Nice work! Keep going.'); sound(true); }
      if (outcome === 'incorrect') { message('Try again!', true); sound(false); }
      if (outcome === 'unclear') message("Didn't catch that. Try again.");
      if (outcome === 'complete') { loop.stop(); message('Five little wins. Well done!'); $('celebration').hidden = false; }
    }
    const changed = Array.from(event.results).slice(event.resultIndex);
    const interim = changed.filter(result => !result.isFinal).map(result => result[0]?.transcript || '').join(' ').trim();
    const final = changed.filter(result => result.isFinal).map(result => result[0]?.transcript || '').join(' ').trim();
    if (interim) {
      $('heard').textContent = `Hearing: “${interim}” — waiting for confirmation.`;
      if (!outcomes.length) message('Speech detected… pause briefly after the word.');
    } else if (outcomes.length) {
      $('heard').textContent = final ? `Heard: “${final}”` : 'Try a short pause between words.';
    }
    render();
  },
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
    message(detail ? `${detail}${terminal && ['network', 'no-speech'].includes(code) ? ' Press Start Recording to retry.' : ''}` : (terminal ? "Didn't catch that. Try again. Check your connection and press Start Recording." : "Didn't catch that. Try again."));
    if (terminal) practice.stop();
    render();
  }
});
$('start').onclick = () => {
  if (!SpeechRecognition) return;
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); audio.resume().catch(() => {}); } catch {}
  practice.start(); message('Starting microphone…'); loop.start(); render();
};
$('stop').onclick = () => { practice.stop(); loop.stop(); message('Paused. Your progress is saved.'); render(); };
$('next').onclick = () => {
  loop.stop(); index = (index + 1) % vocabulary.length; practice = new Practice(vocabulary[index][0]);
  $('target').textContent = vocabulary[index][0]; $('meaning').textContent = vocabulary[index][1];
  $('word-number').textContent = `WORD ${String(index+1).padStart(2,'0')} / ${String(vocabulary.length).padStart(2,'0')}`;
  $('celebration').hidden = true; $('heard').textContent = 'Your five wins start here.'; message('Ready when you are.'); render();
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden && practice.active) { practice.stop(); loop.stop(); message('Paused while this tab is in the background. Press Start Recording to resume.'); render(); }
});
window.addEventListener('pagehide', () => loop.stop());
if (!SpeechRecognition) message('Speech recognition is not supported here. Try Chrome on desktop or Android.');
else if (!window.isSecureContext) { message('Microphone access requires HTTPS or localhost.'); $('start').disabled = true; }
render();
if (!window.isSecureContext) $('start').disabled = true;
