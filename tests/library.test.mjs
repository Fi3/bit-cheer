import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionLibrary, DeckSelections } from '../src/library.js';
const audio = (...values) => new Uint8Array(values.length ? values : [1,2,3,4]).buffer;
const records = [
  { id:'house-a', title:'House A', genre:'House', bpm:120, url:'/a.mp3' },
  { id:'house-b', title:'House B', genre:'House', bpm:124, url:'/b.mp3' },
  { id:'techno-a', title:'Techno A', genre:'Techno', bpm:130, url:'/c.mp3' }
];

test('local files remain selectable on both decks without rereading or detached-buffer corruption', async () => {
  let counter=0, downloads=0;
  const library=new SessionLibrary({id:()=>String(++counter),fetcher:()=>{downloads++;throw new Error('Local files must not fetch');}});
  const first=library.addLocal({name:'my-track.mp3'},audio(10,20,30));
  const second=library.addLocal({name:'my-track.mp3'},audio(40,50,60));
  assert.notEqual(first.id,second.id);assert.equal(first.genre,'Local files');
  const a=await library.audioBytes(first.id),b=await library.audioBytes(first.id);
  assert.notEqual(a,b);assert.deepEqual([...new Uint8Array(a)],[10,20,30]);
  structuredClone(a,{transfer:[a]});assert.equal(a.byteLength,0);
  assert.deepEqual([...new Uint8Array(await library.audioBytes(first.id))],[10,20,30]);
  assert.deepEqual([...new Uint8Array(b)],[10,20,30]);assert.equal(downloads,0);
  library.update(first.id,{bpm:127.5,duration:45});
  assert.equal(library.list('Local files')[0].bpm,127.5);
});

test('bundled catalog refresh retains local files and excludes non-playable reference entries', () => {
  const library=new SessionLibrary({id:()=> 'one'});
  const local=library.addLocal({name:'own.wav'},audio());
  library.setBundled([...records,records[0],{id:'reference',name:'External discovery',source:'https://bandcamp.example/track'}]);
  assert.equal(library.list().length,4);assert.ok(library.find(local.id));assert.equal(library.find('reference'),undefined);
  library.setBundled(records.slice(0,1));assert.equal(library.list().length,2);assert.ok(library.find(local.id));
});

test('simultaneous deck requests share one download but receive independent decode buffers', async () => {
  let count=0,release;const gate=new Promise(resolve=>{release=resolve;});
  const library=new SessionLibrary({fetcher:async()=>{count++;await gate;return{ok:true,arrayBuffer:async()=>audio(7,8,9)};}});
  library.setBundled(records);
  const a=library.audioBytes('house-a'),b=library.audioBytes('house-a');release();
  const [first,second]=await Promise.all([a,b]);assert.equal(count,1);assert.notEqual(first,second);
  new Uint8Array(first)[0]=100;assert.equal(new Uint8Array(second)[0],7);
  assert.equal(new Uint8Array(await library.audioBytes('house-a'))[0],7);assert.equal(count,1);
});

test('next, previous and random choices respect genre and include native tempos outside the old pitch range', () => {
  const library=new SessionLibrary();library.setBundled([...records,{id:'slow',title:'Slow',genre:'House',bpm:55,url:'/slow.mp3'}]);
  assert.equal(library.choose('house-a','House',1).id,'house-b');
  assert.equal(library.choose('house-a','House',-1).id,'slow');
  assert.equal(library.choose('house-b','House',1).id,'slow');
  assert.equal(library.choose('slow','House',1).id,'house-a');
  assert.ok(['house-b','slow'].includes(library.choose('house-a','House','random').id));
  assert.equal(library.choose('techno-a','Techno',1),null);
  assert.equal(library.choose('house-a','Missing',1),null);
});

test('failed downloads can retry and session memory limits preserve existing files', async () => {
  let count=0;
  const library=new SessionLibrary({limit:8,id:()=>String(count),fetcher:async()=>({ok:++count>1,arrayBuffer:async()=>audio()})});
  library.setBundled(records);
  await assert.rejects(library.audioBytes('house-a'),/download failed/);
  assert.equal((await library.audioBytes('house-a')).byteLength,4);
  const local=library.addLocal({name:'retained.wav'},audio(5,6,7,8));
  assert.throws(()=>library.addLocal({name:'overflow.wav'},audio(9)),/session library is full/);
  assert.deepEqual([...new Uint8Array(await library.audioBytes(local.id))],[5,6,7,8]);
});

test('new selection cancels stale work only for its own deck; mode change cancels both', async () => {
  const selections=new DeckSelections(),committed=[];
  let release;const delay=new Promise(resolve=>{release=resolve;});
  const oldA=selections.begin(0),b=selections.begin(1);
  const slow=(async()=>{await delay;if(selections.valid(oldA))committed.push('old A');})();
  const newA=selections.begin(0);assert.equal(selections.valid(b),true);assert.equal(selections.valid(newA),true);
  release();await slow;assert.deepEqual(committed,[]);
  selections.invalidate();assert.equal(selections.valid(newA),false);assert.equal(selections.valid(b),false);
});
