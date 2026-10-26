import './style.css';
import './winamp.css';
import './skin-variants.css';
import './session.css';
import './module-skins.css';
import { AudioEngine } from './audio.js';
import { assetUrl, BASE_PATH } from './assets.js';
import { clamp, tapTempo, matchScore, estimateTempo } from './training.js';
import { applySkin, importSkin, downloadTemplate } from './skins.js';
import { SessionLibrary, DeckSelections } from './library.js';
import { adjustedPitch, wheelPitchDelta, keyPitchDelta, pitchSensitivity } from './pitch-control.js';
import { validateLayout } from './layout.js';

// Apply the saved skin before Elm mounts, so the first app frame has its final theme.
const startupSkin = restore('bit-cheer-skin');
let startupSkinName;
try { startupSkinName = applySkin(startupSkin?.id || 'classified5', startupSkin?.custom); }
catch { startupSkinName = applySkin('classified5'); }

const app = Elm.Main.init({ node: document.getElementById('app'), flags: { basePath: BASE_PATH } });
let telemetry = [], recent = [], lastStart = performance.now(), mode = 'foundation', catalog = {tracks:[]}, taps = [], zoom = [1,1], mic = null, drill = '', configVersion = 0, micEpoch = 0, micPending = false, focusActive = false, wasFullscreen = false, activeLesson = 1, transition = null;
const send = event => {
  if(event.type==='telemetry') {
    telemetry=event.decks;
    if(telemetry.every(d=>d.playing)) { recent.push({time:performance.now(),decks:telemetry.map(d=>({...d}))}); recent=recent.filter(x=>performance.now()-x.time<4000); }
    else {recent=[];lastStart=performance.now();}
  }
  app.ports.incoming.send(event);
};
const engine = new AudioEngine(send);
const library = new SessionLibrary(), selections = new DeckSelections();
let sensitivities = [.05,.05], pendingProCatalog = false;
function publishLibrary(){catalog.tracks=library.list();send({type:'catalog',tracks:catalog.tracks});}
function beginSelection(deck){engine.loadVersions[deck]++;return selections.begin(deck);}
const notice=message=>send({type:'notice',message});
const fail=error=>{if(engine.context)engine.emitRouting();send({type:'error',message:error instanceof Error?error.message:String(error)});};
function chooseFile(accept,handle) {
  const input=document.createElement('input'); input.type='file';input.accept=accept;input.style.display='none';document.body.append(input);
  input.addEventListener('change',()=>{const file=input.files?.[0];if(file)Promise.resolve(handle(file)).catch(fail);input.remove();},{once:true});
  input.addEventListener('cancel',()=>input.remove(),{once:true});input.click();
}
function store(key,value) {try{localStorage.setItem(key,JSON.stringify(value));}catch{notice('Browser storage is full or unavailable. This session still works; progress cannot be saved.');}}
function restore(key) {try{return JSON.parse(localStorage.getItem(key));}catch{return null;}}
async function loadTrack(deck,id,resumePlayback=false,genreFilter=null) {
  if(deck!==0&&deck!==1)throw new Error('Choose deck A or B.');
  const previous={...engine.state[deck]};
  const token=beginSelection(deck),track=library.find(id);
  if(!track)throw new Error('Track not found in your session library.');
  notice(`Loading ${track.title || track.name}…`);
  const bytes=await library.audioBytes(id);
  if(!selections.valid(token))return false;
  const name=track.local?track.name:`${track.title || track.name} — ${track.artist}`;
  const loaded=await engine.load(deck,bytes,name,track.bpm||undefined);
  if(!loaded||!selections.valid(token))return false;
  engine.state[deck].trackId=track.id;
  library.update(track.id,{bpm:engine.state[deck].bpm,duration:engine.state[deck].duration});
  if(resumePlayback){
    await engine.set(deck,'play',+previous.playing);
    if(!selections.valid(token))return false;
    engine.emitDeckChanged(deck);
  }
  publishLibrary();send({type:'trackSelection',deck,track:track.id,...(genreFilter?{genre:genreFilter}:{})});
  recent=[];lastStart=performance.now();return true;
}
async function navigateTrack(deck,genre,direction){
  pendingProCatalog=false;
  const state=engine.state[deck];
  const track=library.choose(state.trackId,genre||'All genres',direction);
  if(!track){notice('No other playable track in this genre. Import another file or choose another genre.');return;}
  await loadTrack(deck,track.id,true);
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
  const version=++configVersion;selections.invalidate();engine.loadVersions=engine.loadVersions.map(value=>value+1);pendingProCatalog=false;
  const requestedMode=command.mode||'foundation';mode=requestedMode;recent=[];lastStart=performance.now();zoom=[1,1];
  await engine.ensure();
  if(version!==configVersion)return;
  for(let i=0;i<2;i++){await engine.set(i,'play',0);await engine.set(i,'pitch',0);await engine.set(i,'loop',1);await engine.set(i,'bend',0);if(requestedMode==='foundation'){for(const band of ['low','mid','high'])await engine.set(i,band,0);await engine.setVoice(i,0,'gain',1);await engine.setVoice(i,0,'pan',0);}}
  if(version!==configVersion)return;
  if(requestedMode==='pro') {
    if(catalog.tracks.length>=2){await loadTrack(0,catalog.tracks[0].id);if(version!==configVersion)return;await loadTrack(1,catalog.tracks[1].id);}
    else {pendingProCatalog=true;notice('The playable library is loading. You can also import your own files.');}
  } else {
    await engine.randomize(requestedMode,requestedMode==='foundation'?1:command.elements??3);
    await constrainDrill();
  }
  recent=[];lastStart=performance.now();
}
async function handle(command) {
  const {type,deck,param,value}=command;
  switch(type) {
    case 'set': await engine.set(deck,param,param==='elements'&&mode==='foundation'?1:value); if(param==='bpm'&&engine.state[deck].trackId){library.update(engine.state[deck].trackId,{bpm:engine.state[deck].bpm});publishLibrary();}if(['bpm','pitch','elements'].includes(param)){recent=[];lastStart=performance.now();} break;
    case 'sensitivity': if(deck===0||deck===1)sensitivities[deck]=pitchSensitivity(value);break;
    case 'layout': {const layout=validateLayout(command.layout);if(layout){sensitivities=layout.sensitivity;store('bit-cheer-layout',layout);}break;}
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
      if(mode==='pro')await navigateTrack(deck,command.genre,'random');
      else {beginSelection(deck);await engine.changeGeneratedTrack(deck,mode);}
      recent=[];lastStart=performance.now();break;
    }
    case 'nextTrack': await navigateTrack(deck,command.genre,1);break;
    case 'previousTrack': await navigateTrack(deck,command.genre,-1);break;
    case 'trackGenre': break;
    case 'voice': if(mode!=='foundation')await engine.setVoice(deck,command.voice,param,value);break;
    case 'solo': if(mode!=='foundation')await engine.setSolo(deck,command.voice);break;
    case 'chaos': if(mode!=='foundation'){beginSelection(deck);await engine.chaos(deck);recent=[];lastStart=performance.now();}break;
    case 'focusSession': focusSession(!!command.active,command.fullscreen!==false);break;
    case 'focusDeck': focusSession(command.deck>=0,command.fullscreen!==false);break;
    case 'fullscreen': focusSession(focusActive,!!command.active);break;
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
    case 'importTrack': {
      pendingProCatalog=false;const token=beginSelection(deck);
      chooseFile('audio/*,.mp3,.wav,.ogg,.flac,.m4a',async file=>{
        if(file.size>100*1024*1024)throw new Error('Choose an audio file smaller than 100 MB.');
        notice(`Adding ${file.name} to this session…`);
        const bytes=await file.arrayBuffer();if(!selections.valid(token))return;
        const track=library.addLocal(file,bytes);publishLibrary();
        await loadTrack(deck,track.id,false,'Local files');
      });break;
    }
    case 'loadTrack': pendingProCatalog=false;await loadTrack(deck,command.track);break;
    case 'skin': {const name=applySkin(command.id);store('bit-cheer-skin',{id:command.id});send({type:'skin',id:command.id,name});break;}
    case 'importSkin': chooseFile('.toml,.zip,.wsz',async file=>{const custom=await importSkin(file);const name=applySkin('custom',custom);store('bit-cheer-skin',{id:'custom',custom});send({type:'skin',id:'custom',name});notice(`Skin loaded: ${name}`);});break;
    case 'exportSkin': downloadTemplate();notice('Your skin kit is downloaded. Edit skin.toml, add optional images, then import the ZIP.');break;
    case 'persist': store('bit-cheer-progress',{progress:command.progress,history:command.history});break;
    case 'mic': await toggleMic();break;
    default: break;
  }
}
app.ports.command.subscribe(command=>handle(command).catch(fail));

function focusSession(active,fullscreen=true){
  focusActive=active;
  if(!active){if(document.fullscreenElement)document.exitFullscreen().catch(()=>{});return;}
  if(fullscreen&&!document.fullscreenElement&&document.documentElement.requestFullscreen)document.documentElement.requestFullscreen().then(()=>{wasFullscreen=true;}).catch(()=>{});
}
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement){wasFullscreen=true;}else if(wasFullscreen){wasFullscreen=false;focusActive=false;send({type:'focus',active:false});}});

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
    await engine.context.audioWorklet.addModule(assetUrl('/mic-worklet.js'));
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
const pitchDeck=element=>element.getAttribute('data-deck')==='1'||element.getAttribute('aria-label')?.includes(' B ')?1:0;
const pitchRequests=[0,0];
function applyPitch(element,delta,absolute=null){
  const deck=pitchDeck(element),request=++pitchRequests[deck];
  const next=absolute===null?adjustedPitch(engine.state[deck].pitch,delta,Number(element.min),Number(element.max)):absolute;
  // Keep high-frequency trackpad/key input cumulative while ensure() is pending.
  engine.state[deck].pitch=next;
  engine.set(deck,'pitch',next).then(()=>{if(request===pitchRequests[deck])send({type:'pitchChanged',deck,pitch:engine.state[deck].pitch});}).catch(fail);
  recent=[];lastStart=performance.now();
}

document.addEventListener('wheel',event=>{
  const jog=jogDeck(event.target);
  if(!jog){const pitch=event.target.closest?.('.vertical-fader')||document.activeElement?.matches?.('.vertical-fader')&&document.activeElement;
    if(pitch){event.preventDefault();const index=pitchDeck(pitch),sensitivity=pitch.getAttribute('data-pitch-sensitivity')||sensitivities[index];applyPitch(pitch,wheelPitchDelta(event,sensitivity));return;}
    const canvas=event.target.closest?.('canvas[id^=\"waveform-\"]');if(canvas){event.preventDefault();const deck=canvas.id==='waveform-b'?1:0;zoom[deck]=clamp(zoom[deck]*(event.deltaY<0?1.25:.8),1,16);}return;}event.preventDefault();
  const amount=clamp(-event.deltaY*(event.deltaMode===1?1:.06),-16,16);
  clearTimeout(bendTimers[jog.deck]);engine.set(jog.deck,'bend',amount).catch(fail);
  jog.element.classList.add('jogging');
  bendTimers[jog.deck]=setTimeout(()=>{engine.set(jog.deck,'bend',0).catch(fail);jog.element.classList.remove('jogging');},160);
},{passive:false});
document.addEventListener('pointerdown',event=>{
  const pitch=event.target.closest?.('.vertical-fader');
  if(pitch&&event.shiftKey){event.preventDefault();pitch.setPointerCapture(event.pointerId);const rect=pitch.getBoundingClientRect();drag={kind:'pitch-fine',deck:pitchDeck(pitch),element:pitch,y:event.clientY,position:engine.state[pitchDeck(pitch)].pitch,scale:(Number(pitch.max)-Number(pitch.min))/Math.max(1,rect.height)*.1};engine.ensure().catch(fail);return;}
  const jog=jogDeck(event.target);
  const canvas=event.target.closest?.('canvas[id^="waveform-"]');
  if(jog){event.preventDefault();jog.element.setPointerCapture(event.pointerId);drag={deck:jog.deck,x:event.clientX,y:event.clientY,position:engine.state[jog.deck].position,element:jog.element,kind:'jog'};jog.element.classList.add('jogging');engine.ensure().catch(fail);}
  else if(canvas){const deck=canvas.id==='waveform-b'?1:0,r=canvas.getBoundingClientRect();canvas.setPointerCapture(event.pointerId);drag={deck,element:canvas,kind:'waveform'};seekWave(deck,(event.clientX-r.left)/r.width);}
});
document.addEventListener('pointermove',event=>{if(!drag)return;if(drag.kind==='pitch-fine'){const next=adjustedPitch(drag.position,(drag.y-event.clientY)*drag.scale,Number(drag.element.min),Number(drag.element.max));applyPitch(drag.element,0,Math.round(next*100)/100);return;}if(drag.kind==='waveform'){const r=drag.element.getBoundingClientRect();seekWave(drag.deck,(event.clientX-r.left)/r.width);return;}const seconds=drag.position+(event.clientX-drag.x-(event.clientY-drag.y))*.018;engine.set(drag.deck,'seek',Math.max(0,seconds)).catch(fail);recent=[];lastStart=performance.now();});
const endDrag=()=>{if(drag)drag.element.classList.remove('jogging');drag=null;};
document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);
function seekWave(deck,fraction){const duration=engine.state[deck].duration,visibleDuration=duration/zoom[deck],start=zoom[deck]>1?clamp(engine.state[deck].position-visibleDuration/2,0,duration-visibleDuration):0;engine.set(deck,'seek',start+clamp(fraction,0,1)*visibleDuration).catch(fail);recent=[];lastStart=performance.now();}
document.addEventListener('keydown',event=>{
  if(event.ctrlKey||event.metaKey||event.altKey)return;
  if(focusActive&&event.code==='Space'&&event.target.matches('input[type=range]'))event.preventDefault();
  const pitch=event.target.closest?.('.vertical-fader');
  if(pitch){const deck=pitchDeck(pitch),delta=keyPitchDelta(event,pitch.getAttribute('data-pitch-sensitivity')||sensitivities[deck]);if(delta!==null||event.code==='Home'||event.code==='End'){event.preventDefault();event.stopPropagation();applyPitch(pitch,delta||0,event.code==='Home'?Number(pitch.min):event.code==='End'?Number(pitch.max):null);return;}}
  if(event.target.matches('input,textarea,select'))return;
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
  const layout=validateLayout(restore('bit-cheer-layout'));if(layout){sensitivities=layout.sensitivity;send({type:'restoreLayout',layout});}
  const saved=restore('bit-cheer-progress');if(saved&&Array.isArray(saved.progress)&&Array.isArray(saved.history))send({type:'restore',...saved});
  send({type:'skin',id:document.documentElement.dataset.skin,name:startupSkinName});
  try{const response=await fetch(assetUrl('/catalog.json'));if(!response.ok)throw new Error('Library catalog unavailable. Local imports still work.');catalog=await response.json();library.setBundled(catalog.tracks);publishLibrary();send({type:'skins',skins:(catalog.skins||[]).map(skin=>({...skin,preview:skin.preview?assetUrl(skin.preview):'',archive:skin.archive?assetUrl(skin.archive):''}))});send({type:'referenceCatalog',tracks:(catalog.referenceTracks||[]).map(t=>({id:String(t.id),name:t.title,source:t.source,genre:primaryGenre(t.tags||[]),bpm:Number(t.bpm)||0}))});if(pendingProCatalog&&mode==='pro'&&catalog.tracks.length>=2){pendingProCatalog=false;const version=configVersion;await loadTrack(0,catalog.tracks[0].id);if(version===configVersion&&mode==='pro')await loadTrack(1,catalog.tracks[1].id);}}catch(error){fail(error);}
});
// Small diagnostics surface for automated browser/audio verification.
window.bitCheer={get audio(){return engine;},get telemetry(){return telemetry;},get mode(){return mode;},get library(){return library.list();},get focus(){return focusActive;}};
