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

An optional Chromium smoke test simulates delayed mobile speech results (no final result), five wins, restart, and error persistence. It does not test a real microphone. Start the app first, then on Linux with Chromium installed:

```sh
npm install --prefix /tmp/say-it-five-browser --cache /tmp/say-it-five-npm-cache playwright --no-audit --no-fund
NODE_PATH=/tmp/say-it-five-browser/node_modules CHROMIUM_PATH=/usr/bin/chromium node scripts/browser-smoke.cjs
```

Set `CHROMIUM_PATH` to your installed Chromium/Chrome executable and `APP_URL` to an alternate running app URL if needed. Playwright is only an external test tool, not an app runtime dependency.

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

Outcome feedback has a dedicated area. Incorrect-word feedback shows both recognized and expected words and remains visible for at least 2.5 seconds, including automatic restarts and interim updates. Completion, explicit Start, and next word clear it immediately. Recognition failures remain distinct from red incorrect-word feedback.

To avoid mobile browsers' slow final confirmation, a matching live transcript unchanged for 350 ms is credited. Credit is tracked per result index: identical interim/final events do not add wins; appended repetitions add only new matches. A revised hypothesis adjusts prior credit before completion. Wrong words are classified only on final results; interim guesses are not treated as pronunciation errors. A fifth stable match completes practice without waiting for final. This is a speed/accuracy tradeoff: a browser could have revised that fifth guess later, so completion is word-recognition practice, not verified pronunciation.

Continuous recognition stays open while speech results arrive; speech-end recovery waits 1.2 seconds, and an interim session without updates is refreshed after 2.5 seconds. A session with no results is refreshed after 5 seconds. If stop does not produce end within 1.2 seconds, the old session is aborted and replaced. Pending speech may be lost during recovery. Some mobile browsers ignore continuous mode or provide no interim text, so final-result/network delays and brief restart gaps cannot be eliminated by this app. Repeated words omitted by the service cannot be recovered. A short pause and a quiet environment can help.
