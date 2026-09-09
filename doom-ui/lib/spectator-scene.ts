import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createFly} from './fly-model';
import {interpolatePose,type Pose,type SpectatorFrame} from './spectator';
export type CameraMode='follow'|'free';
const scale=1/32;
const place=(o:T.Object3D,p:Pose,lift=0)=>{o.position.set(p.x*scale,p.z*scale+lift,-p.y*scale);o.rotation.y=p.angle*Math.PI/180;};
function disposeTree(root:T.Object3D){
 const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
 root.traverse(o=>{const m=o as T.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>materials.add(x));});
 geometries.forEach(g=>g.dispose());materials.forEach(m=>{const map=(m as T.MeshStandardMaterial).map;map?.dispose();m.dispose();});
}
export function createSpectator(canvas:HTMLCanvasElement,onFailure:(message:string)=>void){
 const renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false});
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x111518);renderer.outputColorSpace=T.SRGBColorSpace;
 const scene=new T.Scene();scene.fog=new T.Fog(0x111518,30,90);
 scene.add(new T.HemisphereLight(0xe1ecff,0x39302a,2));
 const key=new T.DirectionalLight(0xfff1d9,3.4);key.position.set(5,14,7);scene.add(key);
 const rim=new T.DirectionalLight(0xb9d8ff,2.7);rim.position.set(-7,5,-9);scene.add(rim);
 const camera=new T.PerspectiveCamera(48,1,.03,180);camera.position.set(3,2.7,4);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.minDistance=.85;controls.maxDistance=65;controls.enablePan=false;
 const fly=createFly();fly.root.scale.setScalar(scale);scene.add(fly.root);fly.root.visible=false;
 const arena=new T.Group(),actors=new T.Group();scene.add(arena,actors);
 const objectMap=new Map<number,{name:string;mesh:T.Object3D}>();
 let packet:SpectatorFrame|null=null,previous:SpectatorFrame|null=null,run='',received=0,duration=250,lastTimestamp=0;
 let running=false,mode:CameraMode='follow',disposed=false,raf=0,previousTime=performance.now(),wingTime=0,geometryKey='';
 let initialized=false,focused=false,dragging=false,yaw=0,pitch=0,pointerX=0,pointerY=0,pointerId=-1;
 const keys=new Set<string>(),direction=new T.Vector3(),right=new T.Vector3(),delta=new T.Vector3(),lastTarget=new T.Vector3();
 const floorTexture=()=>{
  const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;
  ctx.fillStyle='#30383b';ctx.fillRect(0,0,128,128);ctx.strokeStyle='#434b4d';ctx.lineWidth=1;ctx.strokeRect(.5,.5,127,127);
  ctx.fillStyle='#495051';for(const x of [5,122])for(const y of [5,122])ctx.fillRect(x,y,2,2);
  const texture=new T.CanvasTexture(c);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(12,12);texture.colorSpace=T.SRGBColorSpace;return texture;
 };
 function buildArena(s:SpectatorFrame){
  const id=JSON.stringify(s.sectors);if(id===geometryKey)return;geometryKey=id;
  disposeTree(arena);arena.clear();
  for(const sector of s.sectors){
   // Lines come directly from the engine. The arena's finishes are illustrative.
   const points=sector.lines.flatMap(l=>[[l[0]*scale,-l[1]*scale],[l[2]*scale,-l[3]*scale]]);
   const xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
   const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
   const floor=new T.Mesh(new T.PlaneGeometry(maxX-minX,maxZ-minZ),new T.MeshStandardMaterial({map:floorTexture(),roughness:.9}));
   floor.rotation.x=-Math.PI/2;floor.position.set((minX+maxX)/2,sector.floor*scale,(minZ+maxZ)/2);arena.add(floor);
   // Interior-facing walls become a cutaway when the observer flies outside.
   const wallMat=new T.MeshStandardMaterial({color:0x78766f,roughness:.93,side:T.FrontSide});
   const trimMat=new T.MeshStandardMaterial({color:0x272d2d,metalness:.35,roughness:.7});
   for(const [x1,y1,x2,y2] of sector.lines){
    const length=Math.hypot(x2-x1,y2-y1)*scale,height=(sector.ceiling-sector.floor)*scale;
    const wall=new T.Mesh(new T.PlaneGeometry(length,height),wallMat);
    wall.position.set((x1+x2)*scale/2,(sector.ceiling+sector.floor)*scale/2,-(y1+y2)*scale/2);wall.rotation.y=Math.atan2(y2-y1,x2-x1);arena.add(wall);
    for(const h of [.1,height-.12]){const trim=new T.Mesh(new T.BoxGeometry(length,.12,.18),trimMat);trim.position.copy(wall.position);trim.position.y=sector.floor*scale+h;trim.rotation.copy(wall.rotation);arena.add(trim);}
   }
  }
 }
 function actor(name:string){
  const g=new T.Group();
  const cube=(w:number,h:number,d:number,y:number,color:number)=>{const m=new T.Mesh(new T.BoxGeometry(w,h,d),new T.MeshStandardMaterial({color,roughness:.9}));m.position.y=y;g.add(m);return m;};
  if(/Imp|Zombie|DoomPlayer/i.test(name)){
   const color=/Imp/i.test(name)?0x975a40:0x7d8760;
   cube(.6,.8,.38,1.03,color);cube(.35,.35,.35,1.59,0xb29d7c);
   for(const z of [-.18,.18]){const leg=cube(.24,.62,.22,.33,0x3b4240);leg.position.z=z;}
   for(const z of [-.32,.32]){const arm=cube(.45,.23,.2,1.02,color);arm.position.set(.3,1.02,z);}
  }else if(/Clip|Ammo/i.test(name)){
   cube(.52,.35,.44,.18,0x8e925d);cube(.55,.06,.47,.36,0x353d2a);
  }else if(/Ball|Shot|Rocket|Plasma/i.test(name)){
   const m=new T.Mesh(new T.IcosahedronGeometry(.16,1),new T.MeshBasicMaterial({color:0xffa347}));g.add(m);
  }else{cube(.15,.15,.15,.1,0x929b9d);}
  return g;
 }
 function resetView(){
  if(!packet)return;
  place(fly.root,packet.player,1.25);lastTarget.copy(fly.root.position);
  const a=packet.player.angle*Math.PI/180;
  camera.position.set(fly.root.position.x-2*Math.cos(a)+2.2*Math.sin(a),fly.root.position.y+.9,fly.root.position.z+2*Math.sin(a)+2.2*Math.cos(a));
  controls.target.copy(fly.root.position);camera.lookAt(controls.target);controls.update();
  const e=new T.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=e.y;pitch=e.x;
 }
 const resize=new ResizeObserver(()=>{
  const {width,height}=canvas.getBoundingClientRect();if(!width||!height)return;
  renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();
 });resize.observe(canvas);
 canvas.tabIndex=0;
 const down=(e:PointerEvent)=>{focused=true;canvas.focus({preventScroll:true});if(mode==='free'&&!dragging){dragging=true;pointerId=e.pointerId;pointerX=e.clientX;pointerY=e.clientY;canvas.setPointerCapture(e.pointerId);}};
 const move=(e:PointerEvent)=>{if(mode!=='free'||!dragging||e.pointerId!==pointerId)return;yaw-=(e.clientX-pointerX)*.004;pitch=T.MathUtils.clamp(pitch-(e.clientY-pointerY)*.004,-1.5,1.5);pointerX=e.clientX;pointerY=e.clientY;};
 const up=()=>{dragging=false;};
 const clear=()=>{keys.clear();dragging=false;focused=false;};
 const keydown=(e:KeyboardEvent)=>{if(!focused||mode!=='free'||e.target!==canvas)return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}};
 const keyup=(e:KeyboardEvent)=>keys.delete(e.code);
 const context=(e:Event)=>e.preventDefault();
 const lost=(e:Event)=>{e.preventDefault();onFailure('3D graphics paused. Switch back to Doom, then reopen 3D to reconnect.');};
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('blur',clear);canvas.addEventListener('contextmenu',context);canvas.addEventListener('webglcontextlost',lost);
 window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);
 const visibility=()=>{clear();if(document.hidden)cancelAnimationFrame(raf);else if(!disposed){previousTime=performance.now();raf=requestAnimationFrame(draw);}};
 document.addEventListener('visibilitychange',visibility);
 function draw(now:number){
  if(disposed)return;
  const dt=Math.min(.05,(now-previousTime)/1000);previousTime=now;
  if(packet){
   const t=running?Math.min(1,(now-received)/duration):1;
   const p=previous?interpolatePose(previous.player,packet.player,t):packet.player;
   place(fly.root,p,1.25);fly.root.visible=true;
   if(running)wingTime+=dt;
   fly.animate(wingTime,running);
   for(const o of packet.objects){
    const entry=objectMap.get(o.id);if(!entry)continue;
    const old=previous?.objects.find(v=>v.id===o.id&&v.name===o.name);
    place(entry.mesh,old?interpolatePose(old,o,t):o);
   }
   if(!initialized){initialized=true;if(mode==='follow')resetView();}
   if(mode==='follow'){
    delta.copy(fly.root.position).sub(lastTarget);camera.position.add(delta);controls.target.copy(fly.root.position);controls.update(dt);
   }
   lastTarget.copy(fly.root.position);
  }
  if(mode==='free'){
   camera.quaternion.setFromEuler(new T.Euler(pitch,yaw,0,'YXZ'));
   camera.getWorldDirection(direction);right.crossVectors(direction,camera.up).normalize();
   const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
   const sideways=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
   const vertical=Number(keys.has('KeyE'))-Number(keys.has('KeyQ'));
   const speed=dt*(keys.has('ShiftLeft')||keys.has('ShiftRight')?10:3.5);
   camera.position.addScaledVector(direction,forward*speed).addScaledVector(right,sideways*speed);camera.position.y+=vertical*speed;
   camera.position.clamp(new T.Vector3(-60,.1,-60),new T.Vector3(60,50,60));
  }
  renderer.render(scene,camera);
  onRender?.(canvas);
  raf=requestAnimationFrame(draw);
 }
 let onRender:((c:HTMLCanvasElement)=>void)|null=null;
 raf=requestAnimationFrame(draw);
 return {
  update(s:SpectatorFrame,runId:string,timestamp:number,live:boolean){
   running=live;
   if(packet===s)return;
   const continuous=run===runId&&packet?.episode===s.episode&&timestamp>lastTimestamp&&timestamp-lastTimestamp<2000&&Math.hypot(s.player.x-packet.player.x,s.player.y-packet.player.y)<256;
   previous=continuous?packet:null;duration=continuous?Math.max(80,Math.min(1000,timestamp-lastTimestamp)):1;
   packet=s;run=runId;lastTimestamp=timestamp;received=performance.now();
   if(!continuous)initialized=false;
   buildArena(s);
   const ids=new Set(s.objects.filter(o=>o.name!=='DoomPlayer').map(o=>o.id));
   for(const [id,entry] of objectMap)if(!ids.has(id)){actors.remove(entry.mesh);disposeTree(entry.mesh);objectMap.delete(id);}
   for(const o of s.objects){
    if(o.name==='DoomPlayer')continue;
    const entry=objectMap.get(o.id);
    if(entry&&entry.name!==o.name){actors.remove(entry.mesh);disposeTree(entry.mesh);objectMap.delete(o.id);}
    if(!objectMap.has(o.id)){const mesh=actor(o.name);actors.add(mesh);objectMap.set(o.id,{mesh,name:o.name});}
   }
  },
  setLive(value:boolean){running=value;},
  setMode(value:CameraMode){
   keys.clear();dragging=false;mode=value;controls.enabled=value==='follow';
   if(value==='free'){const e=new T.Euler().setFromQuaternion(camera.quaternion,'YXZ');yaw=e.y;pitch=e.x;canvas.focus({preventScroll:true});focused=true;}
   else{controls.target.copy(fly.root.position);controls.update();lastTarget.copy(fly.root.position);}
  },
  reset:resetView,
  key(code:string,pressed:boolean){pressed?keys.add(code):keys.delete(code);},
  renderHook(fn:typeof onRender){onRender=fn;},
  dispose(){disposed=true;cancelAnimationFrame(raf);resize.disconnect();controls.dispose();onRender=null;disposeTree(scene);renderer.dispose();renderer.forceContextLoss();
   canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('blur',clear);canvas.removeEventListener('contextmenu',context);canvas.removeEventListener('webglcontextlost',lost);
   window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);
  }
 };
}
export type SpectatorScene=ReturnType<typeof createSpectator>;
