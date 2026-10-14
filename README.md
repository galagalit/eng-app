# Say It Five

A mobile-first, free English word-recognition practice app. No API keys, paid services, runtime dependencies, or build step. It compares the browser's recognized words with the target; it does **not** provide phonetic pronunciation scores.

## Run

Requires Node.js 18 or later (validated with Node 24).

```sh
cd /workspace/eng-app
npm start
```

On your own computer, open `http://localhost:3000` in Chrome. Allow microphone access, press **Start Recording**, and repeat the displayed word with short pauses. Recording continues until five successful repetitions or **Stop Recording**. Stopping preserves progress for the current word; refreshing the page resets it. **Next word** becomes available after completion. There are five common verbs: go, come, make, take, and give, cycling back to the first.

For a phone or a remotely hosted version, serve these static files over **HTTPS**. Opening an HTTP LAN address does not grant microphone access. The included Node server is a development server; it does not configure TLS. This cloud onboarding UI does not provide a localhost app preview.

## Tests

```sh
npm test
```

The Node tests exercise final/interim deduplication, multiple words per result, incorrect words, empty recognition, five-success completion, pause/resume, session index resets, unexpected ends, silence, permission denial, stale callbacks, network error retry limits, and start failures. They use fake recognition sessions and do not contact a speech service.

Manual browser checks:

1. Say the target five times with pauses; check green cells, positive sounds, completion animation, stopped microphone, and enabled Next word.
2. Say another word; check a red indicator, negative sound, “Try again!”, and unchanged success count.
3. Say several repetitions quickly; check each word returned by the service is counted once. Services may omit repetitions.
4. Stay silent or interrupt connectivity; check “Didn't catch that. Try again.” without a red incorrect-word classification. Unexpected session ends restart while active. Five consecutive service errors stop automatic retries; press Start to retry.
5. Stop, resume, and deny microphone permission. Confirm stopped sessions cannot add progress, permission denial stops retries, and the guidance is clear.
6. Complete a word and move to the next; check progress resets. Test at phone widths and in desktop Chrome. Backgrounding the tab intentionally pauses recording to avoid hidden microphone use.
7. Test an unsupported browser; the Start button should be disabled with browser guidance.

## Browser limits and privacy

Web Speech API availability depends on browser, platform, service availability, and internet access. Desktop/Android Chrome is recommended; Safari behavior varies, and other browsers may lack support. Browser interruptions, device locks, permission revocation, and background restrictions cannot be fully controlled by app code. No-speech/network failures are not treated as pronunciation mistakes.

Live interim text is displayed as “Hearing” so you can distinguish delayed confirmation from a wrong recognized word. The app uses short, single-utterance recognition sessions while practice stays active, immediately restarting after the browser ends each session. This lets the browser finalize a word or a rapid group of words naturally, rather than cutting speech every 0.65 seconds. A stalled interim result is finalized after 1.8 seconds without updates; a session with no result is refreshed after 5 seconds. If stop does not produce an end event within 1.2 seconds, the old session is aborted and replaced. Pending unconfirmed speech may be lost during this recovery. There can still be a brief microphone gap during browser session restart. Error retries retain a backoff. Wait for “Listening” after “One moment” before speaking again. Only final results count. Result indexes are deduplicated per recognition session. Every returned token is evaluated; punctuation and case are ignored. The app cannot detect repetitions omitted or merged by the recognition service, nor guarantee that a recognized word means accurate pronunciation. A short pause helps. Recognition quality may vary with accent, noise, and microphone quality.

The app does not store audio or recognized transcripts persistently. Your browser may send microphone audio to its recognition provider under that provider's privacy terms. Feedback sounds are synthesized locally with Web Audio and can be suppressed by browser/device audio policies.

## Files

- `practice.js`: independently tested counting and recognition-session lifecycle.
- `app.js`: browser integration, controls, audio feedback, vocabulary.
- `index.html`, `style.css`: responsive accessible interface.
- `server.js`: dependency-free development static server.

All application assets are local; no font or analytics requests are required.
