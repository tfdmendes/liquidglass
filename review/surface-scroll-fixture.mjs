const json = (value) => JSON.stringify(value).replaceAll('<', '\\u003c');

export function fixture(core, components, count, { beforeScript = '', beforeReady = '' } = {}) {
  const wallpaper = encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960"><rect width="720" height="960" fill="#183e56"/><path d="M0 0H340L720 380V700L0 90Z" fill="#b75b45"/><path d="M0 460L720 110V300L0 660Z" fill="#327d8b"/><path d="M0 780L720 430V620L0 960Z" fill="#dbb778"/><path d="M60 0V960M180 0V960M300 0V960M420 0V960M540 0V960M660 0V960M0 60H720M0 180H720M0 300H720M0 420H720M0 540H720M0 660H720M0 780H720M0 900H720" stroke="#fff" stroke-opacity=".4" fill="none"/></svg>');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><style>
*{box-sizing:border-box}html{scroll-behavior:auto}body{margin:0;font:15px system-ui;color:white;background:#17364b}
#scene{position:relative;height:${1100 + count * 180}px;overflow:clip}.wallpaper{position:absolute;inset:0;background:#183e56 url("data:image/svg+xml,${wallpaper}") repeat;background-size:720px 960px}
lg-panel{padding:20px;width:220px;height:94px}lg-panel b{display:block;font-size:19px;margin-bottom:4px}.item{position:absolute;left:28px}
#fixed{position:fixed;right:20px;top:20px;width:180px;z-index:4}#sticky-wrap{position:absolute;left:260px;top:170px;height:1500px;width:190px}#sticky{position:sticky;top:120px;width:180px}
#press{position:absolute;top:300px;left:28px}#nested{position:absolute;left:28px;top:420px;width:300px;height:180px;overflow:auto;border:1px solid #fff6}#nested-content{position:relative;height:900px}#nested-source{position:absolute;inset:0;background:repeating-linear-gradient(30deg,#732b6e 0 35px,#f5d09d 35px 70px)}#inside{position:absolute;top:80px;left:20px;width:210px}
#unrelated{position:absolute;top:640px;left:28px;width:100px;height:70px;overflow:auto;background:#fff3}#unrelated>div{height:600px}#source-scroller{position:absolute;top:430px;right:20px;width:90px;height:160px;overflow:auto}#moving-source{width:90px;height:800px;background:repeating-linear-gradient(#e65d43 0 40px,#f8e0ac 40px 80px)}#remote{position:absolute;top:300px;right:20px;width:180px}#plain{position:absolute;top:650px;right:20px;width:180px}
@media(max-width:500px){#sticky-wrap{left:185px;width:170px}#sticky{width:165px}#fixed{width:155px;right:15px}#remote{top:735px;right:15px;width:160px}#plain{top:930px;right:15px;width:160px}#source-scroller{top:735px;left:20px}#press{top:300px}}
</style><div id="scene" data-lg-backdrop=".wallpaper"><div id="wallpaper" class="wallpaper"></div>
<lg-panel id="flow" class="item" style="top:28px"><b>Same motion</b>Document backdrop</lg-panel>
<lg-panel id="fixed" backdrop="#wallpaper"><b>Fixed</b>Independent motion</lg-panel>
<div id="sticky-wrap"><lg-panel id="sticky" backdrop="#wallpaper"><b>Sticky</b>Crosses its threshold</lg-panel></div>
<lg-button id="press">Press and scroll</lg-button>
<div id="nested"><div id="nested-content"><div id="nested-source"></div><lg-panel id="inside" backdrop="#nested-source"><b>Nested</b>Local scrolling</lg-panel></div></div>
<div id="unrelated"><div>Unrelated scroll</div></div>
<div id="source-scroller"><div id="moving-source"></div></div><lg-panel id="remote" backdrop="#moving-source"><b>Remote source</b>Source scrolls alone</lg-panel>
<lg-panel id="plain" backdrop="none"><b>No source</b>Native backdrop / blur</lg-panel>
${Array.from({ length: count }, (_, i) => `<lg-panel class="item sparse" id="sparse-${i}" style="top:${1100 + i * 180}px"><b>Surface ${i + 1}</b>Same backdrop fixture</lg-panel>`).join('')}
</div>${beforeScript}<script type="module">
const core = URL.createObjectURL(new Blob([${json(core)}],{type:'text/javascript'}));
const componentCode = ${json(components)}.replaceAll("'./liquid-glass.js'",JSON.stringify(core));
const componentURL = URL.createObjectURL(new Blob([componentCode],{type:'text/javascript'}));
const runtime = await import(componentURL);
URL.revokeObjectURL(componentURL); URL.revokeObjectURL(core);
const metrics = {enabled:false,updates:0,aligns:0,offsets:0,rects:0};
for(const name of ['offsetWidth','offsetHeight']){
  const d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,name);
  Object.defineProperty(HTMLElement.prototype,name,{...d,get(){if(metrics.enabled)metrics.offsets++;return d.get.call(this)}});
}
const rect=Element.prototype.getBoundingClientRect;
Element.prototype.getBoundingClientRect=function(){if(metrics.enabled)metrics.rects++;return rect.call(this)};
const watch=(element)=>{
  const surface=element.surface;
  for(const method of ['update','align']){
    const original=surface[method];
    surface[method]=function(...args){if(metrics.enabled)metrics[method==='update'?'updates':'aligns']++;return original.apply(this,args)};
  }
};
document.querySelectorAll('lg-panel,lg-button').forEach(watch);
const frame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
const frames=async(n=3)=>{while(n-->0)await frame()};
window.fixture={
  engine:runtime.engine,metrics,frames,
  measure(on=true){Object.assign(metrics,{enabled:on,updates:0,aligns:0,offsets:0,rects:0})},
  sample(){metrics.enabled=false;return {...metrics,reads:metrics.offsets+metrics.rects}},
  scroll(y){scrollTo(0,y)},
  nested(y){document.querySelector('#nested').scrollTop=y},
  unrelated(y){document.querySelector('#unrelated').scrollTop=y},
  source(y){document.querySelector('#source-scroller').scrollTop=y},
  state(p=0){document.querySelector('#press').surface.setDelta({x:-5*p,y:2*p,w:10*p,h:-4*p})},
  geometry(visibleOnly=false){
    return [...document.querySelectorAll('lg-panel,lg-button')].filter(n=>n.surface?.mode==='copy').flatMap(n=>{
      const s=n.surface,lr=s.layer.getBoundingClientRect(),sr=s.source.getBoundingClientRect();
      if(visibleOnly&&(lr.bottom<0||lr.top>innerHeight||lr.right<0||lr.left>innerWidth))return [];
      const matrix=new DOMMatrix(getComputedStyle(s.copy).transform);
      return [{id:n.id,dx:matrix.m41-(sr.left-lr.left),dy:matrix.m42-(sr.top-lr.top),dw:parseFloat(s.copy.style.width)-sr.width,dh:parseFloat(s.copy.style.height)-sr.height,key:s.lastKey}];
    });
  },
  async image(){
    const image=document.createElement('img'); image.id='late-source';image.style.cssText='position:absolute;top:5px;left:5px';
    image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="110"><rect width="240" height="110" fill="#d07842"/><circle cx="120" cy="55" r="40" fill="#213c68"/></svg>');
    document.querySelector('#scene').append(image);
    const panel=document.createElement('lg-panel');panel.id='late';panel.setAttribute('backdrop','#late-source');panel.style.cssText='position:fixed;left:20px;top:200px;width:170px;height:80px';panel.textContent='Delayed image';document.querySelector('#scene').append(panel);watch(panel);
    await image.decode();await frames();return this.geometry().find(g=>g.id==='late');
  },
  async layoutShiftImage(){
    const image=document.createElement('img');image.id='flow-image';image.style.display='block';
    document.body.prepend(image);
    const sourceTop=document.querySelector('#wallpaper').getBoundingClientRect().top;
    image.src='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="240" height="110"><rect width="240" height="110" fill="#b26b48"/></svg>');
    const panel=document.createElement('lg-panel');panel.id='flow-image-panel';panel.setAttribute('backdrop','#flow-image');panel.style.cssText='position:fixed;left:20px;top:220px;width:170px;height:80px';panel.textContent='Image in document flow';document.querySelector('#scene').append(panel);watch(panel);
    const detached=panel.cloneNode(false);detached.id='detached-image-panel';document.querySelector('#scene').append(detached);detached.remove();
    await image.decode();await frames(4);
    return {shift:document.querySelector('#wallpaper').getBoundingClientRect().top-sourceTop,geometry:this.geometry(true)};
  }
};
await frames(6);
${beforeReady}
window.fixtureReady=true;
</script></html>`;
}
