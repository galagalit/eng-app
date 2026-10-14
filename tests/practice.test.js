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
 const sessions=[],timers=new Map();let n=0;const errors=[];
 const loop=new RecognitionLoop({create:()=>{const s={start(){},abort(){this.aborted=true;}};sessions.push(s);return s;},onResult(){},onError:(...e)=>errors.push(e),onListening(){},schedule:fn=>{timers.set(++n,fn);return n;},cancel:id=>timers.delete(id)});
 const tick=()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());};return {loop,sessions,timers,errors,tick};
}
test('unexpected end and silence restart; Stop cancels pending restart',()=>{
 const f=fixture();f.loop.start();f.loop.start();assert.equal(f.sessions.length,1);
 f.sessions[0].onerror({error:'no-speech'});f.sessions[0].onend();f.tick();assert.equal(f.sessions.length,2);
 f.sessions[1].onend();f.loop.stop();f.tick();assert.equal(f.sessions.length,2);assert.equal(f.loop.active,false);
});
test('permission denial stops and stale callbacks cannot restart',()=>{
 const f=fixture();f.loop.start();const old=f.sessions[0];old.onerror({error:'not-allowed'});old.onend();f.tick();assert.equal(f.loop.active,false);assert.equal(old.aborted,true);
 f.loop.start();old.onend();assert.equal(f.timers.size,0);assert.equal(f.sessions.length,2);
});
test('repeated network errors stop after five attempts',()=>{
 const f=fixture();f.loop.start();for(let i=0;i<5;i++){f.sessions[i].onerror({error:'network'});f.sessions[i].onend();f.tick();}
 assert.equal(f.loop.active,false);assert.equal(f.sessions.length,5);assert.deepEqual(f.errors.at(-1),['network',true]);
});
test('error policy and synchronous start failure',()=>{
 assert.equal(errorAction('audio-capture'),'stop');assert.equal(errorAction('no-speech'),'retry');
 const f=fixture();f.loop.create=()=>({start(){throw Error('blocked');},abort(){}});f.loop.start();assert.equal(f.loop.active,false);assert.deepEqual(f.errors,[['start-failed',true]]);
});
