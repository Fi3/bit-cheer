import { parse } from 'smol-toml';
import { unzipSync, strFromU8, zipSync, strToU8 } from 'fflate';
const COLORS = ['background','panel','panelLight','text','muted','accent','secondary','screen','border'];
export const themes = {
  classic: { name:'base-2.91', background:'#151719',panel:'#292c32',panelLight:'#41464f',text:'#e4e6e3',muted:'#969c9c',accent:'#b8ee75',secondary:'#e3aa60',screen:'#10160f',border:'#555a62' },
  classified3: { name:'Winamp3_Classified_v5.5',background:'#242624',panel:'#5d625b',panelLight:'#a5ad9c',text:'#f3f3e4',muted:'#ced1bc',accent:'#b9ffd4',secondary:'#ffcf88',screen:'#151e19',border:'#c0c3ad' },
  classified5: { name:'Winamp5_Classified_v5.5',background:'#1b2029',panel:'#69747f',panelLight:'#a6b1ba',text:'#ffffff',muted:'#e0e6eb',accent:'#a4d7ff',secondary:'#f6d98a',screen:'#101b31',border:'#cad3df' },
  bento: { name:'Bento_Classified',background:'#10151b',panel:'#252f39',panelLight:'#3c4d5e',text:'#e3eef6',muted:'#a3b7c7',accent:'#9bc7ee',secondary:'#d4a8eb',screen:'#111c29',border:'#59738b' },
  alien: { name:'Headspace · Alien Lime',background:'#10170c',panel:'#29551b',panelLight:'#6c9f27',text:'#f1ffdb',muted:'#bed49a',accent:'#aeef29',secondary:'#ce9aef',screen:'#081204',border:'#7fa53a' }
};
export function validateSkin(parsed) {
  if (parsed.version !== 1) throw new Error('skin.toml needs version = 1.');
  if (typeof parsed.name !== 'string' || !parsed.name.trim() || parsed.name.length > 60) throw new Error('Choose a skin name from 1 to 60 characters.');
  const colors = parsed.colors || {}, clean = {name:parsed.name.trim()};
  for(const key of COLORS) {
    if (colors[key] !== undefined && !/^#[a-f0-9]{6}$/i.test(colors[key])) throw new Error(`Color ${key} must be a six-digit hex color, such as #b8ee75.`);
    clean[key] = colors[key] || themes.classic[key];
  }
  const assets = {};
  for (const key of ['panel','titlebar','background']) {
    const value=parsed.assets?.[key];
    if (value !== undefined) {
      if(typeof value!=='string'||! /^(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(png|jpg|jpeg|webp|bmp)$/i.test(value)||value.includes('..')) throw new Error(`Asset ${key} must be a relative image path inside the ZIP.`);
      assets[key]=value;
    }
  }
  return {theme:clean,assets};
}
export function readArchive(bytes) {
  let expanded = 0, count = 0;
  return unzipSync(bytes, { filter: entry => {
    expanded += entry.originalSize; count++;
    if(expanded>24*1024*1024||count>120) throw new Error('Skin archive is too large (24 MB expanded, 120 files maximum).');
    return true;
  }});
}
const dataUrl=(bytes,path)=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(new Blob([bytes],{type:/\.bmp$/i.test(path)?'image/bmp':/\.jpe?g$/i.test(path)?'image/jpeg':/\.webp$/i.test(path)?'image/webp':'image/png'}));});
async function fromWsz(files,filename) {
  const paths=Object.keys(files), main=paths.find(p=>/(^|\/)main.bmp$/i.test(p));
  if(!main) throw new Error('This WSZ is missing main.bmp. Only classic Winamp 2 skins are supported.');
  const source=await dataUrl(files[main],main), bitmap=await createImageBitmap(new Blob([files[main]],{type:'image/bmp'}));
  const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
  const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
  const rgb=ctx.getImageData(0,0,canvas.width,canvas.height).data;
  let r=0,g=0,b=0,n=0;
  for(let i=0;i<rgb.length;i+=16) {const lum=(rgb[i]+rgb[i+1]+rgb[i+2])/3;if(lum>25&&lum<200){r+=rgb[i];g+=rgb[i+1];b+=rgb[i+2];n++;}}
  const hex=(r,g,b)=>'#'+[r,g,b].map(v=>Math.round(Math.min(255,v)).toString(16).padStart(2,'0')).join('');
  const color=n?hex(r/n,g/n,b/n):themes.classic.panel;
  const title=document.createElement('canvas');title.width=Math.min(275,canvas.width);title.height=14;title.getContext('2d').drawImage(canvas,0,0,title.width,14,0,0,title.width,14);
  const theme={...themes.classic,name:filename.replace(/\.wsz$/i,''),panel:color,panelLight:n?hex(r/n*1.3,g/n*1.3,b/n*1.3):themes.classic.panelLight};
  const vis=paths.find(p=>/(^|\/)viscolor.txt$/i.test(p));
  if(vis){const matches=strFromU8(files[vis]).split(/\r?\n/).map(l=>l.match(/^\s*(\d+),\s*(\d+),\s*(\d+)/)).filter(Boolean);if(matches.length>2)theme.accent=hex(+matches[2][1],+matches[2][2],+matches[2][3]);}
  return {theme,images:{titlebar:title.toDataURL()},preview:source};
}
export async function importSkin(file) {
  if(file.size>10*1024*1024)throw new Error('Skins must be smaller than 10 MB.');
  if(/\.toml$/i.test(file.name)){const result=validateSkin(parse(await file.text()));if(Object.keys(result.assets).length)throw new Error('This skin includes images. Put skin.toml and its images together in a ZIP.');return{...result,images:{}};}
  if(!/\.(zip|wsz)$/i.test(file.name))throw new Error('Choose a .toml, .zip, or classic Winamp .wsz file.');
  const files=readArchive(new Uint8Array(await file.arrayBuffer()));
  const path=Object.keys(files).find(p=>/(^|\/)skin.toml$/i.test(p));
  if(!path) return fromWsz(files,file.name);
  const root=path.slice(0,-'skin.toml'.length),result=validateSkin(parse(strFromU8(files[path]))),images={};
  for(const [key,path] of Object.entries(result.assets)){const data=files[root+path];if(!data)throw new Error(`Missing skin asset: ${path}`);if(data.length>2*1024*1024)throw new Error('Each skin image must be smaller than 2 MB.');images[key]=await dataUrl(data,path);}
  return{...result,images};
}
export function applySkin(id, custom=null) {
  const theme=custom?.theme || themes[id] || themes.classic;
  document.documentElement.dataset.skin=custom?'custom':id;
  for(const key of COLORS)document.documentElement.style.setProperty(`--${key.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())}`,theme[key]);
  for(const key of ['panel','titlebar','background'])document.documentElement.style.setProperty(`--skin-${key}`,custom?.images?.[key]?`url("${custom.images[key]}")`:(!custom && key==='titlebar' && id!=='alien'?`url("/skins/${themes[id]?id:'classic'}-titlebar.png")`:'none'));
  return theme.name;
}
export function skinTemplate() {
  return `# Bit Cheer skin v1\n# Zip this file with optional PNG/JPG/WebP/BMP assets.\nversion = 1\nname = "My midnight session"\n\n[colors]\n${COLORS.map(key=>`${key} = "${themes.classic[key]}"`).join('\n')}\n\n# [assets]\n# panel = "panel.png"\n# titlebar = "titlebar.png"\n# background = "background.png"\n`;
}
export function downloadTemplate() {
  const bytes=zipSync({'skin.toml':strToU8(skinTemplate()),'README.txt':strToU8('Edit skin.toml. All nine colors accept #rrggbb. Optional assets use relative paths inside this ZIP. Import the ZIP in Skin studio. Classic Winamp 2 .wsz files are also supported: Bit Cheer adapts their palette and titlebar to the two-deck layout. No scripts or remote URLs are allowed.')});
  const url=URL.createObjectURL(new Blob([bytes],{type:'application/zip'})),a=document.createElement('a');a.href=url;a.download='bit-cheer-skin-template.zip';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
