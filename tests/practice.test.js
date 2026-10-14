import test from 'node:test';
import assert from 'node:assert/strict';
import { Practice, RecognitionLoop, errorAction } from '../practice.js';
const result = (text, final=true) => Object.assign([{transcript:text}], {isFinal:final});
const event = (results,index=0) => ({results,resultIndex:index});
test('interim and repeated final events never double count',()=>{
 const p=new Practice('hello');p.start();
 assert.deepEqual(p.consume(event([result('hello',false)])),[]);
 p.consume(event([result('hello')]));p.consume(event([result('hello')]));assert.equal(p.count,1);
 p.consume(event([result('hello'),result('hello')],1));assert.equal(p.count,2);
});
test('rapid repetitions, wrong words and five-success cap',()=>{
 const p=new Practice('hello');p.start();
 assert.deepEqual(p.consume(event([result('Hello, goodbye hello hello hello hello hello')])),['correct','incorrect','correct','correct','correct','correct','complete']);
 assert.equal(p.count,5);assert.equal(p.active,false);assert.deepEqual(p.consume(event([result('hello')])),[]);
});
test('silence and unintelligible speech do not count as incorrect',()=>{
 const p=new Practice('hello');p.start();assert.deepEqual(p.consume(event([result('')])),['unclear']);assert.equal(p.count,0);
});
test('pause and new sessions retain progress but reset result indexes',()=>{
 const p=new Practice('hello');p.start();p.consume(event([result('hello')]));p.stop();p.newSession();
 assert.deepEqual(p.consume(event([result('hello')])),[]);p.start();p.consume(event([result('hello')]));assert.equal(p.count,2);
});
function fixture(){
 const sessions=[],timers=new Map();let n=0,now=0;const errors=[];
 const loop=new RecognitionLoop({create:()=>{const s={start(){},stop(){},abort(){this.aborted=true;}};sessions.push(s);return s;},onResult(){},onError:(...e)=>errors.push(e),onListening(){},schedule:(fn,delay)=>{timers.set(++n,{fn,at:now+delay});return n;},cancel:id=>timers.delete(id)});
 const tick=(duration)=>{
  const limit=duration === undefined ? Math.min(...[...timers.values()].map(t=>t.at)) : now+duration;
  if (!Number.isFinite(limit)) return;
  const jobs=[...timers.entries()].filter(([,t])=>t.at<=limit);now=limit;
  jobs.forEach(([id,t])=>{if(timers.delete(id))t.fn();});
 };
 return {loop,sessions,timers,errors,tick};
}
test('unexpected end and silence restart; Stop cancels pending restart',()=>{
 const f=fixture();f.loop.start();f.loop.start();assert.equal(f.sessions.length,1);
 f.sessions[0].onerror({error:'no-speech'});f.sessions[0].onend();f.tick();assert.equal(f.sessions.length,2);
 f.sessions[1].onend();f.loop.stop();f.tick();assert.equal(f.sessions.length,2);assert.equal(f.loop.active,false);
});
test('permission denial stops and stale callbacks cannot restart',()=>{
 const f=fixture();f.loop.start();const old=f.sessions[0];old.onerror({error:'not-allowed'});old.onend();f.tick();assert.equal(f.loop.active,false);assert.equal(old.aborted,true);
 f.loop.start();old.onend();assert.equal(f.timers.size,1);assert.equal(f.sessions.length,2);
});
test('repeated network errors stop after five attempts',()=>{
 const f=fixture();f.loop.start();for(let i=0;i<5;i++){f.sessions[i].onerror({error:'network'});f.sessions[i].onend();f.tick();}
 assert.equal(f.loop.active,false);assert.equal(f.sessions.length,5);assert.deepEqual(f.errors.at(-1),['network',true]);
});
test('error policy and synchronous start failure',()=>{
 assert.equal(errorAction('audio-capture'),'stop');assert.equal(errorAction('no-speech'),'retry');
 const f=fixture();f.loop.create=()=>({start(){throw Error('blocked');},abort(){}});f.loop.start();assert.equal(f.loop.active,false);assert.deepEqual(f.errors,[['start-failed',true]]);
});
test('an idle interim result requests finalization, counts final once, and restarts',()=>{
 const f=fixture();const p=new Practice('go');p.start();f.loop.onResult=e=>p.consume(e);f.loop.start();
 const s=f.sessions[0];let stopped=0;s.stop=()=>{stopped++;s.onresult(event([result('go')]));s.onresult(event([result('go')]));s.onend();};
 s.onresult(event([result('go',false)]));assert.equal(p.count,0);assert.equal(f.timers.size,1);
 f.tick();assert.equal(stopped,1);assert.equal(p.count,1);assert.equal(f.loop.active,true);
 f.tick();assert.equal(f.sessions.length,2);
});
test('new interim updates postpone finalization and final results cancel it',()=>{
 const f=fixture();f.loop.start();const s=f.sessions[0];let stopped=0;s.stop=()=>stopped++;
 s.onresult(event([result('go',false)]));const first=[...f.timers.keys()][0];
 s.onresult(event([result('go go',false)]));assert.equal(f.timers.has(first),false);assert.equal(f.timers.size,1);
 s.onresult(event([result('go go')]));assert.equal(f.timers.size,1);f.tick(1800);assert.equal(stopped,0);
});
test('user Stop and unexpected end cancel pending interim finalization',()=>{
 for(const userStop of [true,false]){
  const f=fixture();f.loop.start();const s=f.sessions[0];let stopped=0;s.stop=()=>stopped++;
  s.onresult(event([result('go',false)]));if(userStop)f.loop.stop();else s.onend();
  f.tick();assert.equal(stopped,0);assert.equal(f.sessions.length,userStop?1:2);
 }
});
test('the displayed verb go is accepted as a final result',()=>{
 const p=new Practice('go');p.start();
 assert.deepEqual(p.consume(event([result('go')])),['correct']);assert.equal(p.count,1);
 p.newSession();assert.deepEqual(p.consume(event([result('Go.')])),['correct']);assert.equal(p.count,2);
});
test('three consecutive sessions count the third repetition and restart without delay',()=>{
 const f=fixture();const p=new Practice('go');p.start();const delays=[];let waiting=0;
 const create=f.loop.create;f.loop.create=()=>{p.newSession();return create();};
 const schedule=f.loop.schedule;f.loop.schedule=(fn,delay)=>{delays.push(delay);return schedule(fn,delay);};
 f.loop.onWaiting=()=>waiting++;f.loop.onResult=e=>p.consume(e);f.loop.start();
 for(let i=0;i<3;i++){
  const s=f.sessions[i];s.onstart();assert.equal(f.loop.listening,true);
  s.stop=()=>{s.onresult(event([result('go')]));s.onend();};
  s.onresult(event([result('go',false)]));f.tick();assert.equal(p.count,i+1);assert.equal(f.loop.listening,false);
  f.tick();
 }
 assert.deepEqual(delays.filter(d=>d===900 || d===0),[900,0,900,0,900,0]);assert.equal(waiting,6);assert.equal(f.sessions.length,4);
});
test('native rapid utterance confirms five words without a forced 650ms cut',()=>{
 const f=fixture();const p=new Practice('make');p.start();f.loop.onResult=e=>{p.consume(e);if(!p.active)f.loop.stop();};f.loop.start();const s=f.sessions[0];let stops=0;s.stop=()=>stops++;
 s.onresult(event([result('make make',false)]));f.tick(700);assert.equal(stops,0);
 s.onresult(event([result('make make make make make',false)]));f.tick(700);assert.equal(stops,0);assert.equal(p.count,0);
 s.onresult(event([result('make make make make make')]));assert.equal(p.count,5);assert.equal(f.loop.active,false);assert.equal(f.timers.size,0);
});
test('stalled session without results or end automatically recovers',()=>{
 const f=fixture();f.loop.start();const old=f.sessions[0];let stops=0;old.stop=()=>stops++;
 f.tick(5000);assert.equal(stops,1);assert.equal(f.loop.listening,false);
 f.tick(1200);assert.equal(old.aborted,true);f.tick();assert.equal(f.sessions.length,2);
 old.onresult(event([result('go')]));old.onend();assert.equal(f.loop.session,f.sessions[1]);
});
test('Stop during stalled-session recovery cancels all scheduled work',()=>{
 const f=fixture();f.loop.start();f.tick(5000);f.loop.stop();f.tick(10000);assert.equal(f.sessions.length,1);assert.equal(f.timers.size,0);
});
test('five native sessions count third and fifth results despite index reuse',()=>{
 const f=fixture();const p=new Practice('make');p.start();const create=f.loop.create;
 f.loop.create=()=>{p.newSession();return create();};
 f.loop.onResult=e=>{p.consume(e);if(!p.active)f.loop.stop();};f.loop.start();
 for(let i=0;i<5;i++){
  const s=f.sessions[i];s.onstart();s.onresult(event([result('make',false)]));
  s.onresult(event([result('make')]));s.onresult(event([result('make')]));s.onend();
  assert.equal(p.count,i+1);if(i<4)f.tick();
 }
 assert.equal(f.loop.active,false);assert.equal(f.timers.size,0);assert.equal(f.sessions.length,5);
});
test('speech end requests confirmation promptly, but a new utterance cancels it',()=>{
 const f=fixture();f.loop.start();const s=f.sessions[0];let stopped=0;s.stop=()=>stopped++;
 s.onspeechstart();s.onresult(event([result('go',false)]));s.onspeechend();
 f.tick(100);assert.equal(stopped,0);s.onspeechstart();f.tick(100);assert.equal(stopped,0);
 s.onspeechend();f.tick(180);assert.equal(stopped,1);
});
test('an interim update after speech end does not restore a long confirmation delay',()=>{
 const f=fixture();f.loop.start();const s=f.sessions[0];let stops=0;s.stop=()=>stops++;
 s.onspeechstart();s.onspeechend();s.onresult(event([result('go',false)]));f.tick(180);assert.equal(stops,1);
});
