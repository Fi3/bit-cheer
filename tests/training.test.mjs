import test from 'node:test';
import assert from 'node:assert/strict';
import { tapTempo, matchScore, estimateTempo, waveformPeaks } from '../src/training.js';
import { validateSkin, readArchive, skinTemplate } from '../src/skins.js';
import { parse } from 'smol-toml';
import { zipSync, strToU8 } from 'fflate';

test('tap tempo estimates 120 BPM and discards stale sessions',()=>{
  let times=[],result;
  for(let i=0;i<8;i++){result=tapTempo(times,100+i*500);times=result.times;}
  assert.equal(result.bpm,120);assert.equal(result.taps,8);
  result=tapTempo(times,12000);assert.equal(result.bpm,0);assert.equal(result.taps,1);
});
test('match scoring detects speed, phase, phrase, and circular wrap independently',()=>{
  const deck=(bpm,beat)=>({bpm,beat});
  assert.equal(matchScore([deck(120,4),deck(120,8)]).score,100);
  assert.equal(matchScore([deck(120,4),deck(120,8)],[],'phrase').score,0);
  assert.equal(matchScore([deck(120,4),deck(120,4.5)],[],'tempo').score,100);
  assert.ok(matchScore([deck(120,4),deck(124,4)]).score<85);
  assert.ok(matchScore([deck(120,4.99),deck(120,5.01)]).score>=95);
  assert.ok(matchScore([deck(120,4),deck(120,4.5)]).score<50);
});
test('score uses held phase history, so an instantaneous coincidence is insufficient',()=>{
  const close=[{bpm:120,beat:1},{bpm:120,beat:1}];
  const history=Array.from({length:20},()=>[{bpm:120,beat:1},{bpm:120,beat:1.5}]);
  assert.ok(matchScore(close,history).score<50);
});
test('BPM analysis finds pulse trains across common tempos; silence has no invented estimate',()=>{
  const rate=8000;
  for(const bpm of [90,120,150]){
    const pcm=new Float32Array(rate*12);
    for(let i=0;i<pcm.length;i++){const phase=(i/rate)%(60/bpm);pcm[i]=phase<.04?Math.exp(-phase*80):0;}
    const result=estimateTempo(pcm,rate);assert.ok(result);assert.ok(Math.abs(result.bpm-bpm)<1,`${bpm}: ${result.bpm}`);
  }
  assert.equal(estimateTempo(new Float32Array(rate*10),rate),null);
});
test('waveform analysis includes peaks without out of bounds values',()=>{
  const pcm=new Float32Array(1000);pcm[500]=-.8;const peaks=waveformPeaks(pcm,100);assert.ok(Math.abs(peaks[50]-.8)<.0001);assert.ok(peaks.every(Number.isFinite));
});
test('downloaded TOML template round-trips and rejects invalid CSS/assets/version',()=>{
  const base=parse(skinTemplate());assert.equal(validateSkin(base).theme.name,'My midnight session');
  for(const bad of [{...base,version:2},{...base,name:''},{...base,colors:{accent:'url(https://bad)'}},{...base,assets:{panel:'../a.png'}},{...base,assets:{panel:'https://bad/a.png'}},{...base,assets:{panel:'script.svg'}}])assert.throws(()=>validateSkin(bad));
  assert.equal(validateSkin({...base,assets:{panel:'graphics/panel.png'}}).assets.panel,'graphics/panel.png');
});
test('skin archive rejects excessive entries before extracting them',()=>{
  const files={};for(let i=0;i<121;i++)files[`file${i}`]=strToU8('x');
  assert.throws(()=>readArchive(zipSync(files)),/too large/);
  assert.ok(readArchive(zipSync({'skin.toml':strToU8(skinTemplate())}))['skin.toml']);
});
test('star drift stays in range, moves gradually, and scoring rewards held sync',async()=>{
  const { createStar, stepDrift, stepScore, starResult, STAR } = await import('../src/training.js');
  let seed=1;const random=()=>(seed=(seed*16807)%2147483647)/2147483647;
  const star=createStar(random);let previous=[0,0];
  for(let t=0;t<600;t++){stepDrift(star,.1);star.elapsed+=.1;
    for(let i=0;i<2;i++){assert.ok(Math.abs(star.drift[i])<=STAR.maxDrift+1e-9);assert.ok(Math.abs(star.drift[i]-previous[i])<=STAR.driftRate*.1+1e-9);}
    previous=[...star.drift];}
  assert.ok(star.drift.some(d=>Math.abs(d)>.1),'decks must actually drift');
  const locked=createStar(random),loose=createStar(random);
  for(let t=0;t<600;t++){stepScore(locked,[{bpm:124,beat:t/10},{bpm:124,beat:t/10+.01}],.1);stepScore(loose,[{bpm:124,beat:t/10},{bpm:125,beat:t/10+(t%2?.3:.01)}],.1);}
  assert.ok(Math.abs(locked.synced-60)<1e-6);assert.ok(Math.abs(locked.best-60)<1e-6);
  assert.ok(starResult(locked).score>=95);
  assert.ok(starResult(loose).score<40);assert.match(starResult(locked).summary,/In sync 60\.0 s/);
});
