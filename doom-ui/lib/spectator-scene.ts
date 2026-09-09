import * as T from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {createFly} from './fly-model';
import {createNativeWeapon} from './native-weapon';
import type {SpectatorFrame,Pose} from './spectator';
export type CameraMode='follow'|'free';
type NativeFrame={version:1;nonce:number;width:640;height:480;camera:number[];projection:number[];image:string;depth:string;generated_at_ms:number;verified_ticks:number;player:Pose&{pitch:number};game:{episode:number;tick:number;health:number;kills:number;ammo:number};weapon:{layer:number;width:number;height:number;left:number;top:number;sx:number;sy:number;flip:number;image:string}[]};
const scale=1/32;
const place=(o:T.Object3D,p:Pose)=>{o.position.set(p.x*scale,p.z*scale+1.25,-p.y*scale);o.rotation.y=p.angle*Math.PI/180;};
function imageAsset(url:string){return new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url;});}
function validFrame(v:NativeFrame){
 return v?.version===1&&v.width===640&&v.height===480&&v.camera?.length===5&&v.projection?.length===4&&
 [...v.camera,...v.projection,v.player?.x,v.player?.y,v.player?.z,v.player?.angle,v.player?.pitch,v.generated_at_ms].every(Number.isFinite)&&
 v.image?.startsWith('data:image/jpeg;base64,')&&v.depth?.startsWith('data:image/png;base64,')&&Array.isArray(v.weapon)&&v.weapon.length<=2&&
 v.weapon.every(w=>[w.layer,w.width,w.height,w.left,w.top,w.sx,w.sy].every(Number.isFinite)&&w.width>0&&w.height>0&&w.width<=512&&w.height<=512&&w.image.startsWith('data:image/png;base64,'));
}
export function createSpectator(canvas:HTMLCanvasElement,onFailure:(message:string)=>void){
 const output=canvas.getContext('2d')!;canvas.width=960;canvas.height=720;
 const overlay=document.createElement('canvas');
 const renderer=new T.WebGLRenderer({canvas:overlay,antialias:true,alpha:true});renderer.setSize(960,720);renderer.setClearColor(0,0);renderer.outputColorSpace=T.SRGBColorSpace;
 const scene=new T.Scene();scene.add(new T.HemisphereLight(0xe1ecff,0x39302a,2));
 const light=new T.DirectionalLight(0xfff1d9,3.4);light.position.set(5,14,7);scene.add(light);
 const rim=new T.DirectionalLight(0xb9d8ff,2.7);rim.position.set(-7,5,-9);scene.add(rim);
 const virtual=new T.PerspectiveCamera(48,4/3,.03,180),camera=new T.PerspectiveCamera();
 const controls=new OrbitControls(virtual,canvas);controls.enableDamping=true;controls.minDistance=1.1;controls.maxDistance=16;controls.enablePan=false;
 controls.minPolarAngle=Math.PI/6;controls.maxPolarAngle=Math.PI*5/6;
 const fly=createFly();scene.add(fly.root);fly.root.scale.setScalar(scale);fly.root.visible=false;
 let native:NativeFrame|null=null,background:HTMLImageElement|null=null,depthTexture:T.Texture|null=null;
 const depthUniform={value:null as T.Texture|null},sizeUniform={value:new T.Vector2(960,720)};
 // ViZDoom's 8-bit depth is approximate. The tolerance avoids clipping the
 // avatar on quantized edges; the native environment itself is never rebuilt.
 function occlusion(material:T.Material){material.onBeforeCompile=shader=>{
  shader.uniforms.nativeDepth=depthUniform;shader.uniforms.nativeSize=sizeUniform;
  shader.vertexShader='varying float spectatorDistance;\n'+shader.vertexShader;
  shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>','#include <project_vertex>\nspectatorDistance = -mvPosition.z;');
  shader.fragmentShader='uniform sampler2D nativeDepth; uniform vec2 nativeSize; varying float spectatorDistance;\n'+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('void main() {','void main() {\nfloat nativeD = texture2D(nativeDepth, gl_FragCoord.xy / nativeSize).r * 255.0;\nif(nativeD > 0.5 && spectatorDistance * 32.0 > nativeD * 7.4 + 18.0) discard;');
 };material.customProgramCacheKey=()=>`native-occlusion-${material.type}`;}
 fly.root.traverse(o=>{const m=(o as T.Mesh).material;if(m)(Array.isArray(m)?m:[m]).forEach(m=>occlusion(m));});
 const weapon=createNativeWeapon(occlusion);fly.root.add(weapon.root);
 let packet:SpectatorFrame|null=null,run='',running=false,mode:CameraMode='follow',disposed=false,raf=0;
 let initialized=false,focused=false,dragging=false,yaw=0,pitch=0,pointerX=0,pointerY=0,pointerId=-1,wingTime=0,previousTime=performance.now();
 let requestAt=0,busy=false,abort:AbortController|null=null,lastGood=0,reported=false;
 const keys=new Set<string>(),direction=new T.Vector3(),right=new T.Vector3(),lastTarget=new T.Vector3(),target=new T.Vector3();
 function resetView(){if(!packet)return;place(fly.root,packet.player);lastTarget.copy(fly.root.position);
  const a=packet.player.angle*Math.PI/180;virtual.position.set(fly.root.position.x-1.6*Math.cos(a)+1.8*Math.sin(a),fly.root.position.y+.7,fly.root.position.z+1.6*Math.sin(a)+1.8*Math.cos(a));
  controls.target.copy(fly.root.position);virtual.lookAt(controls.target);controls.update();const e=new T.Euler().setFromQuaternion(virtual.quaternion,'YXZ');yaw=e.y;pitch=e.x;
 }
 async function requestView(now:number){
  if(busy||!running||!packet||now-requestAt<75||document.hidden||disposed)return;
  requestAt=now;busy=true;abort=new AbortController();const timeout=setTimeout(()=>abort?.abort(),2500);
  virtual.getWorldDirection(direction);
  const p=[virtual.position.x/scale,-virtual.position.z/scale,Math.max(4,virtual.position.y/scale),((Math.atan2(-direction.z,direction.x)*180/Math.PI)%360+360)%360,-Math.asin(T.MathUtils.clamp(direction.y,-1,1))*180/Math.PI];
  const query=new URLSearchParams(['x','y','z','yaw','pitch'].map((k,i)=>[k,p[i].toFixed(4)]));
  try{
   const response=await fetch('/api/observer?'+query,{cache:'no-store',signal:abort.signal});
   if(response.status===429){requestAt=performance.now()+100;return;}
   if(!response.ok)throw new Error('Native observer unavailable');
   const f=await response.json() as NativeFrame;if(!validFrame(f)||Date.now()-f.generated_at_ms>4000)throw new Error('Invalid native frame');
   const [bg,depth,...art]=await Promise.all([imageAsset(f.image),imageAsset(f.depth),...f.weapon.map(w=>imageAsset(w.image))]);
   if(disposed)return;
   native=f;background=bg;lastGood=performance.now();reported=false;onFailure('');
   depthTexture?.dispose();depthTexture=new T.Texture(depth);depthTexture.minFilter=T.NearestFilter;depthTexture.magFilter=T.NearestFilter;depthTexture.needsUpdate=true;depthUniform.value=depthTexture;
   weapon.update(f.weapon,art,f.player.pitch);
  }catch{
   if(!disposed&&performance.now()-lastGood>4000&&!reported){reported=true;onFailure('Native camera is reconnecting. The original Doom view remains available.');}
  }finally{clearTimeout(timeout);busy=false;abort=null;}
 }
 canvas.tabIndex=0;
 const down=(e:PointerEvent)=>{focused=true;canvas.focus({preventScroll:true});if(mode==='free'&&!dragging){dragging=true;pointerId=e.pointerId;pointerX=e.clientX;pointerY=e.clientY;canvas.setPointerCapture(e.pointerId);}};
 const move=(e:PointerEvent)=>{if(mode!=='free'||!dragging||e.pointerId!==pointerId)return;yaw-=(e.clientX-pointerX)*.004;pitch=T.MathUtils.clamp(pitch-(e.clientY-pointerY)*.004,-Math.PI/3,Math.PI/3);pointerX=e.clientX;pointerY=e.clientY;};
 const up=()=>{dragging=false;};const clear=()=>{keys.clear();dragging=false;focused=false;};
 const keydown=(e:KeyboardEvent)=>{if(!focused||mode!=='free'||e.target!==canvas)return;if(['KeyW','KeyA','KeyS','KeyD','KeyQ','KeyE','ShiftLeft','ShiftRight','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);}};
 const keyup=(e:KeyboardEvent)=>keys.delete(e.code);const context=(e:Event)=>e.preventDefault();
 canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);canvas.addEventListener('blur',clear);canvas.addEventListener('contextmenu',context);
 window.addEventListener('keydown',keydown);window.addEventListener('keyup',keyup);window.addEventListener('blur',clear);
 const visibility=()=>{clear();if(document.hidden){cancelAnimationFrame(raf);abort?.abort();}else if(!disposed){previousTime=performance.now();raf=requestAnimationFrame(draw);}};document.addEventListener('visibilitychange',visibility);
 let onRender:((c:HTMLCanvasElement)=>void)|null=null;
 function draw(now:number){
  if(disposed)return;const dt=Math.min(.05,(now-previousTime)/1000);previousTime=now;
  if(packet){
   if(!initialized){initialized=true;resetView();}
   const p=native?.player??packet.player;target.set(p.x*scale,p.z*scale+1.25,-p.y*scale);
   if(mode==='follow'){virtual.position.add(target.clone().sub(lastTarget));controls.target.copy(target);controls.update(dt);}lastTarget.copy(target);
   if(mode==='free'){
    virtual.quaternion.setFromEuler(new T.Euler(pitch,yaw,0,'YXZ'));virtual.getWorldDirection(direction);right.crossVectors(direction,virtual.up).normalize();
    const forward=Number(keys.has('KeyW')||keys.has('ArrowUp'))-Number(keys.has('KeyS')||keys.has('ArrowDown'));
    const sideways=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
    const speed=dt*(keys.has('ShiftLeft')||keys.has('ShiftRight')?8:2);
    virtual.position.addScaledVector(direction,forward*speed).addScaledVector(right,sideways*speed);virtual.position.y+=(Number(keys.has('KeyE'))-Number(keys.has('KeyQ')))*speed;virtual.position.y=T.MathUtils.clamp(virtual.position.y,.15,12);
   }
   void requestView(now);
  }
  output.fillStyle='#08090b';output.fillRect(0,0,960,720);
  if(native&&background){
   output.imageSmoothingEnabled=false;output.drawImage(background,0,0,960,720);
   place(fly.root,native.player);fly.root.visible=true;
   if(running&&now-lastGood<4000)wingTime+=dt;fly.animate(wingTime,running&&now-lastGood<4000);
   const [x,y,z,a]=native.camera,r=a*Math.PI/180;
   camera.position.set(x*scale,z*scale,-y*scale);camera.lookAt(camera.position.x+Math.cos(r),camera.position.y,camera.position.z-Math.sin(r));
   const [fx,fy,cx,cy]=native.projection,n=.03,f=180;
   camera.projectionMatrix.set(2*fx/640,0,1-2*cx/640,0,0,2*fy/480,2*cy/480-1,0,0,0,-(f+n)/(f-n),-2*f*n/(f-n),0,0,-1,0);camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
   renderer.render(scene,camera);output.drawImage(overlay,0,0);
  }
  onRender?.(canvas);raf=requestAnimationFrame(draw);
 }
 raf=requestAnimationFrame(draw);
 return {
  update(s:SpectatorFrame,runId:string,_timestamp:number,live:boolean){running=live;if(run!==runId||packet?.episode!==s.episode){initialized=false;native=null;background=null;}packet=s;run=runId;},
  setLive(value:boolean){running=value;},setMode(value:CameraMode){keys.clear();dragging=false;mode=value;controls.enabled=value==='follow';if(value==='free'){const e=new T.Euler().setFromQuaternion(virtual.quaternion,'YXZ');yaw=e.y;pitch=e.x;canvas.focus({preventScroll:true});focused=true;}else{controls.target.copy(target);controls.update();lastTarget.copy(target);}},
  reset:resetView,key(code:string,pressed:boolean){pressed?keys.add(code):keys.delete(code);},renderHook(fn:typeof onRender){onRender=fn;},
  telemetry(){return native?.game??null;},
  dispose(){disposed=true;cancelAnimationFrame(raf);abort?.abort();controls.dispose();onRender=null;depthTexture?.dispose();weapon.dispose();
   const materials=new Set<T.Material>(),geometries=new Set<T.BufferGeometry>();scene.traverse(o=>{const m=o as T.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)(Array.isArray(m.material)?m.material:[m.material]).forEach(x=>materials.add(x));});materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());renderer.dispose();renderer.forceContextLoss();
   canvas.removeEventListener('pointerdown',down);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',up);canvas.removeEventListener('pointercancel',up);canvas.removeEventListener('blur',clear);canvas.removeEventListener('contextmenu',context);window.removeEventListener('keydown',keydown);window.removeEventListener('keyup',keyup);window.removeEventListener('blur',clear);document.removeEventListener('visibilitychange',visibility);
  }
 };
}
export type SpectatorScene=ReturnType<typeof createSpectator>;
