import './style.css';
import './winamp.css';
import './skin-variants.css';
import { AudioEngine } from './audio.js';
import { clamp, tapTempo, matchScore, estimateTempo } from './training.js';
import { applySkin, importSkin, downloadTemplate } from './skins.js';

const app = Elm.Main.init({ node: document.getElementById('app') });
let telemetry = [], recent = [], lastStart = performance.now(), mode = 'foundation', catalog = {tracks:[]}, taps = [], zoom = [1,1], mic = null, drill = '', configVersion = 0, trackSelections = [0,0], micEpoch = 0, micPending = false, focusedDeck = -1, wasFullscreen = false, activeLesson = 1, transition = null;
const send = event => {
  if(event.type==='telemetry') {
    telemetry=event.decks;
    if(telemetry.every(d=>d.playing)) { recent.push({time:performance.now(),decks:telemetry.map(d=>({...d}))}); recent=recent.filter(x=>performance.now()-x.time<4000); }
    else {recent=[];lastStart=performance.now();}
  }
  app.ports.incoming.send(event);
};
const engine = new AudioEngine(send);
const notice=message=>send({type:'notice',message});
const fail=error=>{if(engine.context)engine.emitRouting();send({type:'error',message:error instanceof Error?error.message:String(error)});};
function chooseFile(accept,handle) {
  const input=document.createElement('input'); input.type='file';input.accept=accept;input.style.display='none';document.body.append(input);
  input.addEventListener('change',()=>{const file=input.files?.[0];if(file)Promise.resolve(handle(file)).catch(fail);input.remove();},{once:true});
  input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();
}
function store(key,value) {try{localStorage.setItem(key,JSON.stringify(value));}catch{notice('Browser storage is full or unavailable. This session still works; progress cannot be saved.');}}
function restore(key) {try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
async function loadTrack(deck,id,keepTempo=false) {
  const previous={...engine.state[deck]},effective=previous.bpm*(1+previous.pitch/100);
  const config=configVersion, selection=++trackSelections[deck];
  const track=catalog.tracks.find(x=>x.id===id);if(!track)throw new Error('Track not found in your library.');
  notice(`Loading ${track.title || track.name}…`);
  const response=await fetch(track.url);if(!response.ok)throw new Error('Track download failed. Please try again.');
  const bytes=await response.arrayBuffer();
  if(config!==configVersion||selection!==trackSelections[deck])return;
  const loaded=await engine.load(deck,bytes,`${track.title || track.name} — ${track.artist}`,track.bpm);
  if(!loaded||config!==configVersion||selection!==trackSelections[deck])return;
  engine.state[deck].trackId=track.id;
  if(keepTempo){await engine.set(deck,'pitch',(effective/track.bpm-1)*100);await engine.set(deck,'play',+previous.playing);engine.emitDeckChanged(deck);}
  recent=[];lastStart=performance.now();
}
function primaryGenre(tags) {
  const tag=tags.join(' ').toLowerCase();
  if(/drum.*bass|jungle|dnb/.test(tag))return 'Drum & Bass';
  if(/techno/.test(tag))return 'Techno';
  if(/house/.test(tag))return 'House';
  if(/break/.test(tag))return 'Breakbeat';
  if(/disco/.test(tag))return 'Disco';
  if(/ambient|downtempo/.test(tag))return 'Ambient';
  if(/trance/.test(tag))return 'Trance';
  return 'Electronic';
}
async function constrainDrill() {
  if(drill!=='phase'&&drill!=='phrase')return;
  const bpm=engine.state[0].bpm;
  await engine.set(1,'bpm',bpm);
  await engine.set(1,'seek',(drill==='phase'?.28:4)*60/bpm);
  send({type:'randomized',bpms:[bpm,bpm],names:engine.state.map(d=>d.name)});
}
async function configure(command) {
  const version=++configVersion;trackSelections=trackSelections.map(v=>v+1);
  const requestedMode=command.mode||'foundation';mode=requestedMode;recent=[];lastStart=performance.now();zoom=[1,1];
  await engine.ensure();
  if(version!==configVersion)return;
  for(let i=0;i<2;i++){await engine.set(i,'play',0);await engine.set(i,'pitch',0);await engine.set(i,'loop',1);await engine.set(i,'bend',0);if(requestedMode==='foundation'){for(const band of ['low','mid','high'])await engine.set(i,band,0);await engine.setVoice(i,0,'gain',1);await engine.setVoice(i,0,'pan',0);}}
  if(version!==configVersion)return;
  if(requestedMode==='pro') {
    if(catalog.tracks.length>=2){await loadTrack(0,catalog.tracks[0].id);if(version!==configVersion)return;await loadTrack(1,catalog.tracks[1].id);}
    else notice('Import a track into each deck to start real-track practice.');
  } else {
    await engine.randomize(requestedMode,requestedMode==='foundation'?1:command.elements??3);
    await constrainDrill();
  }
  recent=[];lastStart=performance.now();
}
async function handle(command) {
  const {type,deck,param,value}=command;
  switch(type) {
    case 'set': await engine.set(deck,param,param==='elements'&&mode==='foundation'?1:value); if(['bpm','pitch','elements'].includes(param)){recent=[];lastStart=performance.now();} break;
    case 'mixer': await engine.mixer(param,value);if(activeLesson===8&&param==='crossfade'&&telemetry.every(d=>d.playing)){if(value<=.1||value>=.9){const edge=value<=.1?0:1;if(!transition)transition={edge,time:performance.now(),done:false};else if(edge!==transition.edge&&performance.now()-transition.time>=3000)transition.done=true;}}break;
    case 'routing': await engine.setRouting({mode:command.mode,a:command.a,b:command.b});break;
    case 'refreshOutputs': await engine.refreshOutputs();break;
    case 'audioOutput': await engine.chooseOutput(command.deviceId);break;
    case 'pickOutput': await engine.chooseOutput('');break;
    case 'cue': await engine.set(deck,'play',0);await engine.set(deck,'cue',1);recent=[];lastStart=performance.now();break;
    case 'setCue': await engine.set(deck,'setCue',1);break;
    case 'nudge': await engine.set(deck,'nudge',value);break;
    case 'seek': await engine.set(deck,'seek',clamp(value,0,1)*engine.state[deck].duration);recent=[];lastStart=performance.now();break;
    case 'zoom': zoom[deck]=clamp(zoom[deck] * value,1,16);break;
    case 'grid': await engine.set(deck,'beatOffset',engine.state[deck].position);recent=[];lastStart=performance.now();notice('Current position marked as beat one. Grid checks now use this downbeat.');break;
    case 'randomizeTempo':
      if(drill==='phase'||drill==='phrase'){notice('This drill keeps tempos equal. Use New challenge for a fresh offset.');break;}
      await engine.randomizeTempo(deck,mode);recent=[];lastStart=performance.now();break;
    case 'changeTrack': {
      ++trackSelections[deck];
      if(mode==='pro'){
        const current=engine.state[deck],effective=current.bpm*(1+current.pitch/100),genre=command.genre||'All genres';
        const pool=catalog.tracks.filter(t=>(genre==='All genres'||t.genre===genre)&&t.id!==current.trackId&&Math.abs((effective/t.bpm-1)*100)<=50);
        if(!pool.length){notice('No other compatible track in this genre. Import your own track or select another genre.');break;}
        await loadTrack(deck,pool[Math.floor(Math.random()*pool.length)].id,true);
      }else await engine.changeGeneratedTrack(deck,mode);
      recent=[];lastStart=performance.now();break;
    }
    case 'voice': if(mode!=='foundation')await engine.setVoice(deck,command.voice,param,value);break;
    case 'solo': if(mode!=='foundation')await engine.setSolo(deck,command.voice);break;
    case 'chaos': if(mode!=='foundation'){++trackSelections[deck];await engine.chaos(deck);recent=[];lastStart=performance.now();}break;
    case 'focusDeck': focusDeck(command.deck);break;
    case 'newChallenge': await configure(command);break;
    case 'mode': activeLesson=null;transition=null;drill='';await configure(command);break;
    case 'lesson': activeLesson=command.lesson;transition=null;drill='';await configure(command);break;
    case 'drill': activeLesson=null;transition=null;drill=command.drill;await configure(command);break;
    case 'check': {
      if(!telemetry.length||!telemetry.every(d=>d.playing)) {notice('Play both decks, match the pitch, then check your mix.');break;}
      if(performance.now()-lastStart<3000||recent.length<20){notice('Let both decks run together for at least 3 seconds before checking. Listen for drift.');break;}
      if(mode==='pro' && !engine.state.every(d=>d.source==='pcm')){notice('Load a real track into both decks before checking a Pro mix.');break;}
      if(engine.state.some(d=>d.source==='generated'&&d.elements===0)){notice('Add an instrument to both decks so you can hear the match.');break;}
      const result=matchScore(telemetry,recent.map(x=>x.decks),command.drill||drill);
      if(activeLesson===8&&result.score>=85&&!transition?.done){notice('Complete the handover: while both decks play, move the crossfader from one end to the other over at least 3 seconds, then check your match.');break;}
      send(result);break;
    }
    case 'tap': {const result=tapTempo(taps,performance.now());taps=result.times;send({type:'tap',bpm:result.bpm,taps:result.taps});break;}
    case 'importTrack': {const config=configVersion, selection=++trackSelections[deck];chooseFile('audio/*,.mp3,.wav,.ogg,.flac,.m4a',async file=>{if(file.size>100*1024*1024)throw new Error('Choose an audio file smaller than 100 MB.');notice(`Decoding ${file.name}…`);const bytes=await file.arrayBuffer();if(config!==configVersion||selection!==trackSelections[deck])return;await engine.load(deck,bytes,file.name);recent=[];lastStart=performance.now();});break;}
    case 'loadTrack': await loadTrack(deck,command.track);break;
    case 'skin': {const name=applySkin(command.id);store('bit-cheer-skin',{id:command.id});send({type:'skin',id:command.id,name});break;}
    case 'importSkin': chooseFile('.toml,.zip,.wsz',async file=>{const custom=await importSkin(file);const name=applySkin('custom',custom);store('bit-cheer-skin',{id:'custom',custom});send({type:'skin',id:'custom',name});notice(`Skin loaded: ${name}`);});break;
    case 'exportSkin': downloadTemplate();notice('Your skin kit is downloaded. Edit skin.toml, add optional images, then import the ZIP.');break;
    case 'persist': store('bit-cheer-progress',{progress:command.progress,history:command.history});break;
    case 'mic': await toggleMic();break;
    default: break;
  }
}
app.ports.command.subscribe(command=>handle(command).catch(fail));

function focusDeck(deck){
  focusedDeck=deck;
  if(deck<0){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});return;}
  if(!document.fullscreenElement&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().then(()=>{wasFullscreen=true;}).catch(()=>{});
}
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement){wasFullscreen=true;}else if(wasFullscreen){wasFullscreen=false;focusedDeck=-1;send({type:'focus',deck:-1});}});
async function toggleMic() {
  const epoch=++micEpoch;
  if(micPending){micPending=false;send({type:'mic',active:false,bpm:0});notice('Microphone request cancelled.');return;}
  if(mic){mic.capture.port.postMessage({type:'stop'});mic.stream.getTracks().forEach(t=>t.stop());mic.source.disconnect();mic.capture.disconnect();mic.silent.disconnect();mic=null;send({type:'mic',active:false,bpm:0});return;}
  if(!navigator.mediaDevices?.getUserMedia)throw new Error('Microphone access requires HTTPS or localhost and browser support.');
  micPending=true;notice('Waiting for microphone permission…');
  let stream;
  try{
  await engine.ensure();
  stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
  if(epoch!==micEpoch){stream.getTracks().forEach(t=>t.stop());return;}
    await engine.context.audioWorklet.addModule('/mic-worklet.js');
    if(epoch!==micEpoch){stream.getTracks().forEach(t=>t.stop());return;}
    const source=engine.context.createMediaStreamSource(stream);
    const capture=new AudioWorkletNode(engine.context,'bit-cheer-mic',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1]});
    const silent=engine.context.createGain();silent.gain.value=0;
    source.connect(capture).connect(silent).connect(engine.context.destination);
    capture.port.onmessage=({data})=>{if(data.type==='samples'&&epoch===micEpoch){const result=estimateTempo(data.pcm,data.sampleRate);send({type:'mic',active:true,bpm:result?.bpm||0});}};
    mic={stream,source,capture,silent};
    send({type:'mic',active:true,bpm:0});notice('Microphone listening locally. Give it 6 seconds of a clear rhythm. Click again to stop.');
  } catch(error){stream?.getTracks().forEach(t=>t.stop());if(epoch===micEpoch)throw error;}finally{if(epoch===micEpoch)micPending=false;}
}

// Turntable-style jog: wheel temporarily bends rate; dragging scrubs the timeline.
const bendTimers=[null,null];let drag=null;
const jogDeck=target=>{const jog=target.closest?.('.jog-wheel');return jog?{element:jog,deck:jog.id==='jog-b'?1:0}:null;};
document.addEventListener('wheel',event=>{
  const jog=jogDeck(event.target);
  if(!jog){const pitch=event.target.closest?.('.vertical-fader')||document.activeElement?.matches?.('.vertical-fader')&&document.activeElement;
    if(pitch){event.preventDefault();const index=pitch.getAttribute('aria-label').includes(' B ')?1:0;const step=event.shiftKey?.01:.05;const units=event.deltaMode===1?event.deltaY/3:event.deltaY/100;const change=clamp(-units,-4,4)*step;const next=clamp(engine.state[index].pitch+change,Number(pitch.min),Number(pitch.max));engine.set(index,'pitch',Math.round(next*100)/100).then(()=>send({type:'pitchChanged',deck:index,pitch:engine.state[index].pitch})).catch(fail);recent=[];lastStart=performance.now();return;}
    const canvas=event.target.closest?.('canvas[id^=\"waveform-\"]');if(canvas){event.preventDefault();const deck=canvas.id==='waveform-b'?1:0;zoom[deck]=clamp(zoom[deck]*(event.deltaY<0?1.25:.8),1,16);}return;}event.preventDefault();
  const amount=clamp(-event.deltaY*(event.deltaMode===1?1:.06),-16,16);
  clearTimeout(bendTimers[jog.deck]);engine.set(jog.deck,'bend',amount).catch(fail);
  jog.element.classList.add('jogging');
  bendTimers[jog.deck]=setTimeout(()=>{engine.set(jog.deck,'bend',0).catch(fail);jog.element.classList.remove('jogging');},160);
},{passive:false});
document.addEventListener('pointerdown',event=>{
  const jog=jogDeck(event.target);
  const canvas=event.target.closest?.('canvas[id^="waveform-"]');
  if(jog){event.preventDefault();jog.element.setPointerCapture(event.pointerId);drag={deck:jog.deck,x:event.clientX,y:event.clientY,position:engine.state[jog.deck].position,element:jog.element,kind:'jog'};jog.element.classList.add('jogging');engine.ensure().catch(fail);}
  else if(canvas){const deck=canvas.id==='waveform-b'?1:0,r=canvas.getBoundingClientRect();canvas.setPointerCapture(event.pointerId);drag={deck,element:canvas,kind:'waveform'};seekWave(deck,(event.clientX-r.left)/r.width);}
});
document.addEventListener('pointermove',event=>{if(!drag)return;if(drag.kind==='waveform'){const r=drag.element.getBoundingClientRect();seekWave(drag.deck,(event.clientX-r.left)/r.width);return;}const seconds=drag.position+(event.clientX-drag.x-(event.clientY-drag.y))*.018;engine.set(drag.deck,'seek',Math.max(0,seconds)).catch(fail);recent=[];lastStart=performance.now();});
const endDrag=()=>{if(drag)drag.element.classList.remove('jogging');drag=null;};
document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);
function seekWave(deck,fraction){const duration=engine.state[deck].duration,visibleDuration=duration/zoom[deck],start=zoom[deck]>1?clamp(engine.state[deck].position-visibleDuration/2,0,duration-visibleDuration):0;engine.set(deck,'seek',start+clamp(fraction,0,1)*visibleDuration).catch(fail);recent=[];lastStart=performance.now();}
document.addEventListener('keydown',event=>{
  if(event.target.matches('input,textarea,select')||event.ctrlKey||event.metaKey||event.altKey)return;
  const jog=jogDeck(event.target);
  if(jog&&['Home','End'].includes(event.code)){event.preventDefault();engine.set(jog.deck,'seek',event.code==='Home'?0:Math.max(0,engine.state[jog.deck].duration-.01)).catch(fail);return;}
  if(jog&&['ArrowLeft','ArrowRight'].includes(event.code)){event.preventDefault();engine.set(jog.deck,'nudge',event.code==='ArrowRight'?.04:-.04).catch(fail);return;}
  if(!event.target.closest('button,a')&&['Space','ArrowLeft','ArrowRight'].includes(event.code))event.preventDefault();
});
window.addEventListener('blur',()=>{endDrag();for(let i=0;i<2;i++)if(engine.node){clearTimeout(bendTimers[i]);engine.set(i,'bend',0).catch(()=>{});}});

let lastDraw=0;
function draw(now) {
  if(now-lastDraw>32&&!document.hidden){lastDraw=now;
    const style=getComputedStyle(document.documentElement),color=style.getPropertyValue('--accent').trim()||'#b8ee75';
    for(let deck=0;deck<2;deck++){
      const canvas=document.getElementById(deck?'waveform-b':'waveform-a');if(!canvas)continue;
      const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
      const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);if(!w||!h)continue;
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);ctx.fillStyle=style.getPropertyValue('--screen').trim()||'#080b08';ctx.fillRect(0,0,w,h);
      ctx.strokeStyle=color+'25';ctx.lineWidth=ratio;
      for(let i=0;i<=16;i++){ctx.beginPath();ctx.moveTo(i*w/16,0);ctx.lineTo(i*w/16,h);ctx.stroke();}
      ctx.beginPath();ctx.moveTo(0,h/2);ctx.lineTo(w,h/2);ctx.stroke();
      const peaks=engine.waveforms[deck],state=engine.state[deck],duration=Math.max(1,state.duration),visibleDuration=duration/zoom[deck],start=zoom[deck]>1?clamp(state.position-visibleDuration/2,0,duration-visibleDuration):0;
      ctx.fillStyle=color;const step=3*ratio;
      for(let x=0;x<w;x+=step){const index=Math.min(peaks.length-1,Math.floor((start+x/w*visibleDuration)/duration*peaks.length));const amp=Math.max(.018,peaks[index]||0)*h*.43;ctx.globalAlpha=.65+.35*Math.sin(x*.01)**2;ctx.fillRect(x,h/2-amp,Math.max(ratio,step-ratio),amp*2);}
      ctx.globalAlpha=1;const playhead=clamp((state.position-start)/visibleDuration,0,1)*w;ctx.fillStyle='#f1e2ad';ctx.fillRect(playhead,0,1.5*ratio,h);
      ctx.beginPath();ctx.moveTo(playhead-4*ratio,0);ctx.lineTo(playhead+4*ratio,0);ctx.lineTo(playhead,5*ratio);ctx.fill();
    }
  }
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);

queueMicrotask(async()=>{
  const saved=restore('bit-cheer-progress');if(saved&&Array.isArray(saved.progress)&&Array.isArray(saved.history))send({type:'restore',...saved});
  const skin=restore('bit-cheer-skin');if(skin){try{const name=applySkin(skin.id,skin.custom);send({type:'skin',id:skin.id,name});}catch{applySkin('classic');}}else applySkin('classic');
  try{const response=await fetch('/catalog.json');if(!response.ok)throw new Error('Library catalog unavailable. Local imports still work.');catalog=await response.json();send({type:'catalog',tracks:catalog.tracks.map(t=>({...t,name:t.title||t.name}))});send({type:'skins',skins:catalog.skins});send({type:'referenceCatalog',tracks:(catalog.referenceTracks||[]).map(t=>({id:String(t.id),name:t.title,source:t.source,genre:primaryGenre(t.tags||[]),bpm:Number(t.bpm)||0}))});}catch(error){fail(error);}
});
// Small diagnostics surface for automated browser/audio verification.
window.bitCheer={get audio(){return engine;},get telemetry(){return telemetry;},get mode(){return mode;}};
