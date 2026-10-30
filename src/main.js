import './style.css';
import './winamp.css';
import './skin-variants.css';
import './session.css';
import './module-skins.css';
import './lcd.css';
import './skin-studio.css';
import './kit.css';
import { AudioEngine } from './audio.js';
import { assetUrl, BASE_PATH } from './assets.js';
import { clamp, tapTempo, matchScore, estimateTempo, STAR, createStar, stepDrift, stepScore, starStats, starResult } from './training.js';
import { applySkin, applyRenderedKit, importSkin, importSkinFromUrl, downloadTemplate, skinPicture, validKit, prepareBuiltinSkins, builtinKit, SELECTABLE_SKINS, DEFAULT_SKIN } from './skins.js';
import { SessionLibrary, DeckSelections } from './library.js';
import { pickFolder, AUDIO_EXTENSIONS } from './folder-browser.js';
import { adjustedPitch, wheelPitchDelta, keyPitchDelta, pitchSensitivity } from './pitch-control.js';
import { validateLayout } from './layout.js';
import { createWinampLive } from './winamp-live.js';
import { enhanceKit, RENDER_MODES } from './skin-enhance.js';

// Apply the saved skin before Elm mounts, so the first app frame has its final theme.
// Skins that are no longer offered fall back to the default.
// Millennium Chrome is drawn as a Winamp skin; build it before the first frame when it's quick,
// otherwise start on the classic CSS look and dress the app as soon as it's ready.
const builtinReady = prepareBuiltinSkins();
const builtinInTime = await Promise.race([builtinReady, new Promise(resolve => setTimeout(() => resolve(false), 2500))]);
const savedSkin = restore('bit-cheer-skin');
const startupSkin = savedSkin?.id === 'custom' || SELECTABLE_SKINS.includes(savedSkin?.id) ? savedSkin : null;
let startupSkinName;
try { startupSkinName = applySkin(startupSkin?.id || DEFAULT_SKIN, startupSkin?.custom); }
catch { startupSkinName = applySkin(DEFAULT_SKIN); }

// The look: the skin's original pixels, "comfort" (gentler colors and textures) or "hd" (comfort plus
// 4× pixel art and smooth lettering). Prepared from the stored kit each time a skin is shown.
let renderMode = 'hd';
{ const stored = restore('bit-cheer-render'); if (RENDER_MODES.includes(stored)) renderMode = stored; }
// With Comfort or HD chosen, the first frame waits for that look (a fraction of a second) instead of
// showing the original pixels and then changing color; after 1.5 s it shows the original anyway.
if (renderMode !== 'original' && document.documentElement.dataset.layout === 'kit') {
  document.documentElement.dataset.render = 'preparing';
  setTimeout(() => { if (document.documentElement.dataset.render === 'preparing') document.documentElement.dataset.render = 'original'; }, 1500);
}
const app = Elm.Main.init({ node: document.getElementById('app'), flags: { basePath: BASE_PATH, kit: document.documentElement.dataset.layout === 'kit', render: renderMode } });
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
const loops = [true, true];
let skinEpoch = 0;
// The skin's Playlist (PL) button shows or hides that deck's console, like Winamp's own.
function toggleConsole(deck) {
  const root = document.documentElement, hidden = new Set((root.dataset.consoleHidden || '').split(' ').filter(Boolean));
  const key = deck ? 'b' : 'a';
  if (hidden.has(key)) hidden.delete(key); else hidden.add(key);
  root.dataset.consoleHidden = [...hidden].join(' ');
  store('bit-cheer-console-hidden', root.dataset.consoleHidden);
}
document.addEventListener('click',event=>{const button=event.target.closest?.('.console-shade');if(button)toggleConsole(button.dataset.deck==='1'?1:0);});
const deckState = deck => {
  const scope = deck ? 'deck-b' : 'deck-a';
  return {
    loop: loops[deck],
    eq: !!document.querySelector(`.player-module[data-module="eq"][data-scope="${scope}"]:not(.is-collapsed)`),
    pl: !(document.documentElement.dataset.consoleHidden || '').includes(deck ? 'b' : 'a'),
    hideBpm: !!document.querySelector(`[data-testid="bpm-${deck ? 'b' : 'a'}"][aria-label="BPM hidden"]`),
  };
};
const live = createWinampLive({ engine, deckState, seek: (deck, fraction) => seekWave(deck, fraction), remote: (deck, action, value) => action === 'pl' ? toggleConsole(deck) : action === 'balance' ? engine.balance(deck, value).catch(fail) : send({ type: 'remote', deck, action, value }) });
const library = new SessionLibrary(), selections = new DeckSelections();
let sensitivities = [.05,.05], pendingProCatalog = false;
let folder=null;
async function showFolder(deck,path){
  if(!folder){send({type:'folderListing',deck,root:'',path:[],folders:[],files:[]});return;}
  const source=folder,listing=await source.list(path);
  if(source===folder)send({type:'folderListing',deck,root:source.name,...listing});
}
async function chooseFolder(deck){
  const chosen=await pickFolder();
  if(!chosen)return;
  folder=chosen;await showFolder(deck,[]);
}
function publishLibrary(){catalog.tracks=library.list();send({type:'catalog',tracks:catalog.tracks});}
function beginSelection(deck){engine.loadVersions[deck]++;return selections.begin(deck);}
const notice=message=>send({type:'notice',message});
let skinStamp=0;
let renderEpoch=0,renderDispose=null,shownSkin=null;
// Shows the current skin in the chosen look. The original kit is already on screen; the prepared one
// replaces it when ready, and the images of the previous look are freed only after that.
async function refineSkin(dressed){
  const epoch=++renderEpoch;shownSkin=dressed;
  const done=dispose=>{renderDispose?.();renderDispose=dispose;};
  const shown=()=>{if(document.documentElement.dataset.render==='preparing')document.documentElement.dataset.render='original';};
  if(renderMode==='original'||!dressed?.kit||document.documentElement.dataset.layout!=='kit'){done(null);shown();return;}
  try{
    const {kit,dispose}=await enhanceKit(dressed.kit,{hd:renderMode==='hd'});
    if(epoch!==renderEpoch){dispose();return;}
    applyRenderedKit(kit,renderMode);live.setSkin({...dressed,kit},kit.scale);skinStamp++;done(dispose);
  }catch(error){if(epoch===renderEpoch){done(null);shown();}console.warn('The skin look could not be prepared; showing the original pixels.',error);}
}
const skinChanged=(id,name,custom)=>{skinStamp++;const dressed=id==='custom'?custom:builtinKit(id);live.setSkin(dressed);refineSkin(dressed);send({type:'skin',id,name,kit:document.documentElement.dataset.layout==='kit',preview:skinPicture(id,custom),source:custom?.source&&/^https:\/\/skins\.webamp\.org\//.test(custom.source)?custom.source:''});};
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
  if(drill!=='phase'&&drill!=='phrase'&&mode!=='star')return;
  const bpm=engine.state[0].bpm;
  await engine.set(1,'bpm',bpm);
  if(mode!=='star')await engine.set(1,'seek',(drill==='phase'?.28:4)*60/bpm);
  send({type:'randomized',bpms:[bpm,bpm],names:engine.state.map(d=>d.name)});
}
async function configure(command) {
  const version=++configVersion;selections.invalidate();engine.loadVersions=engine.loadVersions.map(value=>value+1);pendingProCatalog=false;
  const requestedMode=command.mode||'foundation';mode=requestedMode;recent=[];lastStart=performance.now();zoom=[1,1];
  await engine.ensure();
  if(version!==configVersion)return;
  for(let i=0;i<2;i++){loops[i]=true;await engine.set(i,'play',0);await engine.set(i,'pitch',0);await engine.set(i,'loop',1);await engine.set(i,'bend',0);await engine.set(i,'drift',0);if(requestedMode==='foundation'){for(const band of ['low','mid','high'])await engine.set(i,band,0);await engine.setVoice(i,0,'gain',1);await engine.setVoice(i,0,'pan',0);}}
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
// Star mode: the run clock and the drift only advance while both decks play.
let star=null,starTimer=null,starLast=0;
function startStar(){
  stopStar();star=createStar();starLast=performance.now();
  starTimer=setInterval(tickStar,100);send(starStats(star));
}
function stopStar(){
  clearInterval(starTimer);starTimer=null;star=null;
  if(engine.node)for(let i=0;i<2;i++)engine.set(i,'drift',0).catch(()=>{});
}
function tickStar(){
  const now=performance.now(),dt=Math.min(.25,(now-starLast)/1000);starLast=now;
  if(!star||star.done||telemetry.length!==2||!telemetry.every(d=>d.playing))return;
  const drift=stepDrift(star,dt);
  for(let i=0;i<2;i++)engine.set(i,'drift',drift[i]).catch(()=>{});
  stepScore(star,telemetry,dt);
  if(star.elapsed>=STAR.length)finishStar();else send(starStats(star));
}
function finishStar(){
  star.done=true;clearInterval(starTimer);starTimer=null;
  for(let i=0;i<2;i++)engine.set(i,'drift',0).catch(()=>{});
  send(starStats(star));send(starResult(star));
}
async function handle(command) {
  const {type,deck,param,value}=command;
  switch(type) {
    case 'set': if(param==='loop'&&(deck===0||deck===1))loops[deck]=!!value; await engine.set(deck,param,param==='elements'&&mode==='foundation'?1:value); if(param==='bpm'&&engine.state[deck].trackId){library.update(engine.state[deck].trackId,{bpm:engine.state[deck].bpm});publishLibrary();}if(['bpm','pitch','elements'].includes(param)){recent=[];lastStart=performance.now();} break;
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
      if(drill==='phase'||drill==='phrase'||mode==='star'){notice('This drill keeps tempos equal. Use New challenge for a fresh offset.');break;}
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
    case 'newChallenge': stopStar();await configure(command);if(mode==='star')startStar();break;
    case 'mode': activeLesson=null;transition=null;drill='';stopStar();await configure(command);if(mode==='star')startStar();break;
    case 'lesson': activeLesson=command.lesson;transition=null;drill='';stopStar();await configure(command);break;
    case 'drill': activeLesson=null;transition=null;drill=command.drill;stopStar();await configure(command);break;
    case 'starRun': if(command.active)startStar();else stopStar();break;
    case 'check': {
      if(star){
        if(star.done){notice(mode==='star'?'Run\'s over. Take a bow, then hit New run for the encore.':'Run\'s over. Take a bow, then hit New star run for the encore.');break;}
        if(star.elapsed<10){notice('Easy, superstar. Keep both decks playing for at least 10 seconds before you bow out.');break;}
        finishStar();break;
      }
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
      chooseFile(['audio/*',...AUDIO_EXTENSIONS.map(ext=>`.${ext}`)].join(','),async file=>{
        if(file.size>100*1024*1024)throw new Error('Import accepts files up to 100 MB. For larger files such as hi-res FLAC, use 📁 Browse folder (up to 300 MB).');
        notice(`Adding ${file.name} to this session…`);
        const bytes=await file.arrayBuffer();if(!selections.valid(token))return;
        const track=library.addLocal(file,bytes);publishLibrary();
        await loadTrack(deck,track.id,false,'Local files');
      });break;
    }
    case 'loadTrack': pendingProCatalog=false;await loadTrack(deck,command.track);break;
    case 'chooseFolder': await chooseFolder(deck);break;
    case 'browseFolder': if(folder)await showFolder(deck,command.path);else await chooseFolder(deck);break;
    case 'loadFolderFile': {
      if(!folder)throw new Error('Choose a music folder first.');
      pendingProCatalog=false;
      const source=folder,path=command.path,name=String(command.name||'');
      const track=library.addLinked(source.key(path,name),name,()=>source.file(path,name));
      publishLibrary();await loadTrack(deck,track.id,false,'Local files');break;
    }
    case 'skin': {if(!SELECTABLE_SKINS.includes(command.id))break;skinEpoch++;const name=applySkin(command.id);store('bit-cheer-skin',{id:command.id});skinChanged(command.id,name);break;}
    case 'importSkin': chooseFile('.toml,.zip,.wsz',async file=>{const epoch=++skinEpoch;const custom=await importSkin(file);if(epoch!==skinEpoch)return;const name=applySkin('custom',custom);store('bit-cheer-skin',{id:'custom',custom});skinChanged('custom',name,custom);notice(`Skin loaded: ${name}`);});break;
    case 'loadSkinUrl': {
      const epoch=++skinEpoch;
      try {
        const custom=await importSkinFromUrl(command.url);
        // A newer choice made while this one downloaded wins.
        if(epoch!==skinEpoch){send({type:'skinUrlResult',ok:false,message:'Another skin was chosen while this one was loading.'});break;}
        const name=applySkin('custom',custom);
        store('bit-cheer-skin',{id:'custom',custom});skinChanged('custom',name,custom);
        send({type:'skinUrlResult',ok:true,message:`Loaded “${name}”. Enjoy the view!`});
      } catch(error) { send({type:'skinUrlResult',ok:false,message:error instanceof Error?error.message:String(error)}); }
      break;
    }
    case 'render': {
      if(!RENDER_MODES.includes(command.mode)||command.mode===renderMode)break;
      renderMode=command.mode;store('bit-cheer-render',renderMode);
      // Back to the stored kit first, then (for comfort or HD) its prepared look.
      const id=document.documentElement.dataset.skin;
      applySkin(id,id==='custom'?shownSkin:undefined);skinStamp++;live.setSkin(shownSkin);refineSkin(shownSkin);
      send({type:'render',mode:renderMode});break;
    }
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
      // The jog marker turns with the music, 33⅓ times a minute, and follows scrubbing.
      const jog=document.getElementById(deck?'jog-b':'jog-a');
      if(jog)jog.style.setProperty('--jog-angle',`${((engine.state[deck].position||0)%1.8/1.8*360).toFixed(1)}deg`);
      const canvas=document.getElementById(deck?'waveform-b':'waveform-a');if(!canvas)continue;
      const rect=canvas.getBoundingClientRect(),ratio=window.devicePixelRatio||1;
      const w=Math.round(rect.width*ratio),h=Math.round(rect.height*ratio);if(!w||!h)continue;
      if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
      const ctx=canvas.getContext('2d');ctx.clearRect(0,0,w,h);
      if(document.documentElement.dataset.layout==='kit'){drawKitWave(ctx,canvas,deck,w,h,style);continue;}
      ctx.fillStyle=style.getPropertyValue('--screen').trim()||'#080b08';ctx.fillRect(0,0,w,h);
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

// Skinned waveform: chunky 2px pixels in the skin's own visualizer colors. The background grid
// and a color column are drawn once per size and skin; each frame only stamps slices of them.
let waveCache=null;
function waveAssets(style,w,h,px){
  const key=`${w}x${h}:${px}:${skinStamp}`;
  if(waveCache?.key===key)return waveCache;
  const vis=i=>style.getPropertyValue(`--k-vis-${i}`).trim()||'#0f0';
  const back=document.createElement('canvas');back.width=w;back.height=h;
  const b=back.getContext('2d');b.fillStyle=vis(0);b.fillRect(0,0,w,h);b.fillStyle=vis(1);
  for(let y=px;y<h;y+=px*2)for(let x=px;x<w;x+=px*2)b.fillRect(x,y,px/2,px/2);
  for(let k=1;k<8;k++)b.fillRect(Math.round(k*w/8/px)*px,0,Math.max(1,px/2),h);
  const rows=Math.floor(h/px),mid=Math.floor(rows/2),column=document.createElement('canvas');column.width=1;column.height=h;
  const c=column.getContext('2d');
  for(let r=0;r<mid;r++){c.fillStyle=vis(17-Math.min(15,Math.floor(r/Math.max(1,mid)*16)));c.fillRect(0,(mid-1-r)*px,1,px);c.fillRect(0,(mid+r)*px,1,px);}
  return waveCache={key,back,column,mid,peak:vis(23)};
}
function drawKitWave(ctx,canvas,deck,w,h,style){
  const px=Math.max(2,Math.round(2*(window.devicePixelRatio||1))),{back,column,mid,peak}=waveAssets(style,w,h,px);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(back,0,0);
  const peaks=engine.waveforms[deck],state=engine.state[deck],duration=Math.max(1,state.duration),visibleDuration=duration/zoom[deck],start=zoom[deck]>1?clamp(state.position-visibleDuration/2,0,duration-visibleDuration):0;
  for(let x=0;x<w;x+=px*2){
    const index=Math.min(peaks.length-1,Math.floor((start+x/w*visibleDuration)/duration*peaks.length));
    const amp=Math.max(1,Math.round((peaks[index]||0)*mid*.92)),top=(mid-amp)*px,height=amp*2*px;
    ctx.drawImage(column,0,top,1,height,x,top,px*1.5,height);
  }
  const playhead=Math.round(clamp((state.position-start)/visibleDuration,0,1)*w/px)*px;
  ctx.fillStyle=peak;ctx.fillRect(playhead,0,px,h);ctx.fillRect(playhead-px,0,px*3,px);ctx.fillRect(playhead-px,h-px,px*3,px);
}

queueMicrotask(async()=>{
  const layout=validateLayout(restore('bit-cheer-layout'));if(layout){sensitivities=layout.sensitivity;send({type:'restoreLayout',layout});}
  const saved=restore('bit-cheer-progress');if(saved&&Array.isArray(saved.progress)&&Array.isArray(saved.history))send({type:'restore',...saved});
  skinChanged(document.documentElement.dataset.skin,startupSkinName,startupSkin?.custom);
  // Winamp skins saved by an older version: fetch them again from the museum for the full look.
  const savedCustom=startupSkin?.id==='custom'?startupSkin.custom:null;
  if(savedCustom&&(savedCustom.originals||savedCustom.kit)&&!validKit(savedCustom.kit)){
    const epoch=skinEpoch;
    if(savedCustom.source)importSkinFromUrl(savedCustom.source).then(custom=>{
      if(epoch!==skinEpoch)return;
      if(typeof savedCustom.theme?.name==='string'&&savedCustom.theme.name.trim())custom.theme.name=savedCustom.theme.name.trim().slice(0,60);
      const name=applySkin('custom',custom);store('bit-cheer-skin',{id:'custom',custom});skinChanged('custom',name,custom);notice(`Skin refreshed: ${name} now dresses every part of your decks.`);
    }).catch(()=>{});
    else notice('Import your Winamp skin again to see its full look on every control.');
  }
  if(!builtinInTime){const epoch=skinEpoch;builtinReady.then(ok=>{if(ok&&epoch===skinEpoch&&document.documentElement.dataset.skin===DEFAULT_SKIN){const name=applySkin(DEFAULT_SKIN);skinChanged(DEFAULT_SKIN,name);}});}
  try{const hidden=restore('bit-cheer-console-hidden');if(typeof hidden==='string'&&/^[ab ]*$/.test(hidden))document.documentElement.dataset.consoleHidden=hidden;}catch{}
  try{const response=await fetch(assetUrl('/catalog.json'));if(!response.ok)throw new Error('Library catalog unavailable. Local imports still work.');catalog=await response.json();library.setBundled(catalog.tracks);publishLibrary();send({type:'skins',skins:(catalog.skins||[]).map(skin=>({...skin,preview:skin.preview?assetUrl(skin.preview):'',archive:skin.archive?assetUrl(skin.archive):''}))});send({type:'referenceCatalog',tracks:(catalog.referenceTracks||[]).map(t=>({id:String(t.id),name:t.title,source:t.source,genre:primaryGenre(t.tags||[]),bpm:Number(t.bpm)||0}))});if(pendingProCatalog&&mode==='pro'&&catalog.tracks.length>=2){pendingProCatalog=false;const version=configVersion;await loadTrack(0,catalog.tracks[0].id);if(version===configVersion&&mode==='pro')await loadTrack(1,catalog.tracks[1].id);}}catch(error){fail(error);}
});
// Small diagnostics surface for automated browser/audio verification.
window.bitCheer={get audio(){return engine;},get telemetry(){return telemetry;},get mode(){return mode;},get library(){return library.list();},get focus(){return focusActive;}};
