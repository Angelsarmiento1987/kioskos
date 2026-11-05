import test from "node:test";
import assert from "node:assert/strict";
import { createOrderSound } from "../src/order-sound.js";
test("El audio exige activación, limita volumen y puede detenerse", async () => {
 const tones=[], levels=[];
 class Context {
  state="suspended";currentTime=0;destination={};
  resume(){this.state="running";return Promise.resolve();}
  close(){this.state="closed";return Promise.resolve();}
  createOscillator(){const node={frequency:{},connect(){},disconnect(){},start(){},stop(){node.stopped=true;}};tones.push(node);return node;}
  createGain(){return {connect(){},disconnect(){},gain:{setValueAtTime(){},linearRampToValueAtTime(v){levels.push(v);},exponentialRampToValueAtTime(){}}};}
 }
 const sound=createOrderSound(Context);
 assert.equal(sound.play(),false);
 assert.equal(await sound.unlock(),true);
 assert.equal(sound.play(50),true);
 assert.deepEqual(tones.map(t=>t.frequency.value),[660,880,1100]);
 assert.ok(levels.every(x=>x<=0.22));
 sound.stop();assert.ok(tones.every(t=>t.stopped));
 sound.close();assert.equal(sound.ready,false);
});
test("Sin soporte de audio hay un error útil y los avisos visuales pueden continuar", async () => {
 const sound=createOrderSound(null);assert.equal(sound.play(),false);
 await assert.rejects(sound.unlock(),/avisos visuales/);
});
