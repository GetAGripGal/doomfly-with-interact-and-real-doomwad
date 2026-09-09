'use client';
import {useEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {createSpectator,type SpectatorScene,type CameraMode} from '@/lib/spectator-scene';
import type {Live} from '@/lib/live';

type Clip={url:string;name:string};
export default function FlySpectator({data,live}:{data:Live|null;live:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),scene=useRef<SpectatorScene|null>(null);
 const latest=useRef({data,live});latest.current={data,live};
 const recorder=useRef<MediaRecorder|null>(null),media=useRef<MediaStream|null>(null),clipRef=useRef<Clip|null>(null);
 const [error,setError]=useState(''),[mode,setMode]=useState<CameraMode>('follow'),[expanded,setExpanded]=useState(false);
 const [recording,setRecording]=useState(false),[elapsed,setElapsed]=useState(0),[clip,setClip]=useState<Clip|null>(null);
 const [canRecord,setCanRecord]=useState(false);
 const mounted=useRef(false),began=useRef(0);
 const stop=()=>{if(recorder.current?.state==='recording')recorder.current.stop();};
 useEffect(()=>{
  mounted.current=true;
  setCanRecord(typeof MediaRecorder!=='undefined'&&!!HTMLCanvasElement.prototype.captureStream);
  try{scene.current=createSpectator(canvas.current!,message=>{setError(message);stop();});}catch{setError('This browser could not start 3D graphics. The normal Doom view is still available.');}
  const visibility=()=>{if(document.hidden)stop();};
  const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')setExpanded(false);};
  document.addEventListener('visibilitychange',visibility);window.addEventListener('keydown',escape);
  return ()=>{mounted.current=false;stop();scene.current?.dispose();scene.current=null;media.current?.getTracks().forEach(t=>t.stop());
   if(clipRef.current)URL.revokeObjectURL(clipRef.current.url);
   document.removeEventListener('visibilitychange',visibility);window.removeEventListener('keydown',escape);
  };
 },[]);
 useEffect(()=>{
  if(data?.spectator)scene.current?.update(data.spectator,data.run_id,data.generated_at_ms,live);
  scene.current?.setLive(live&&!!data?.spectator);if(!live||!data?.spectator)stop();
 },[data,live]);
 useEffect(()=>{if(!recording)return;const t=setInterval(()=>{const seconds=Math.floor((Date.now()-began.current)/1000);setElapsed(seconds);if(seconds>=180)stop();},500);return()=>clearInterval(t);},[recording]);
 useEffect(()=>{if(!expanded)return;const old=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=old;};},[expanded]);
 function changeMode(value:CameraMode){setMode(value);scene.current?.setMode(value);}
 function record(){
  if(!scene.current||!live||!data?.spectator||!canRecord)return;
  setError('');
  if(clipRef.current)URL.revokeObjectURL(clipRef.current.url);clipRef.current=null;setClip(null);
  const output=document.createElement('canvas');output.width=1280;output.height=720;const ctx=output.getContext('2d')!;
  const chunks:Blob[]=[];let bytes=0;
  try{
   const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/mp4','video/webm'].find(m=>MediaRecorder.isTypeSupported(m));
   if(!mime)throw new Error('No supported recording format');
   scene.current.renderHook(source=>{
    ctx.fillStyle='#080b0d';ctx.fillRect(0,0,1280,720);
    const fit=Math.min(1280/source.width,720/source.height),w=source.width*fit,h=source.height*fit;
    ctx.drawImage(source,(1280-w)/2,(720-h)/2,w,h);
    const d=latest.current.data;
    ctx.fillStyle='#000b';ctx.fillRect(0,0,1280,46);ctx.fillRect(0,688,1280,32);
    ctx.fillStyle='#fff';ctx.font='bold 19px monospace';ctx.fillText('DOOMFLY / 3D SPECTATOR',22,30);
    ctx.textAlign='right';ctx.font='16px monospace';ctx.fillText(`ROUND ${d?.spectator?.episode??'—'}   HEALTH ${d?.game.health??'—'}   KILLS ${d?.game.kills??'—'}`,1258,29);
    ctx.textAlign='left';ctx.font='14px monospace';ctx.fillStyle='#d1d5d7';ctx.fillText('REAL GAME POSITIONS · ILLUSTRATED FLY + ARENA · DECORATIVE WINGS',22,709);
   });
   const stream=output.captureStream(30);media.current=stream;
   const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6_000_000});recorder.current=rec;
   rec.ondataavailable=e=>{if(e.data.size){chunks.push(e.data);bytes+=e.data.size;if(bytes>100_000_000&&rec.state==='recording')rec.stop();}};
   rec.onerror=()=>{if(mounted.current)setError('Recording stopped unexpectedly. Any captured video is available below.');if(rec.state!=='inactive')rec.stop();};
   rec.onstop=()=>{
    scene.current?.renderHook(null);stream.getTracks().forEach(t=>t.stop());media.current=null;recorder.current=null;
    const blob=new Blob(chunks,{type:rec.mimeType});
    if(blob.size){
     const saved={url:URL.createObjectURL(blob),name:`doomfly-spectator-${new Date().toISOString().replace(/[:.]/g,'-')}.${rec.mimeType.includes('mp4')?'mp4':'webm'}`};
     if(mounted.current){clipRef.current=saved;setClip(saved);}else{const a=document.createElement('a');a.href=saved.url;a.download=saved.name;a.click();setTimeout(()=>URL.revokeObjectURL(saved.url),10000);}
    }
    if(mounted.current)setRecording(false);
   };
   rec.start(1000);began.current=Date.now();setElapsed(0);setRecording(true);
  }catch{scene.current.renderHook(null);media.current?.getTracks().forEach(t=>t.stop());media.current=null;setError('Recording is unavailable in this browser. You can still use your device’s screen recorder.');}
 }
 const steer=(code:string)=>({onPointerDown:(e:React.PointerEvent<HTMLButtonElement>)=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);scene.current?.key(code,true);},onPointerUp:()=>scene.current?.key(code,false),onPointerCancel:()=>scene.current?.key(code,false),onLostPointerCapture:()=>scene.current?.key(code,false)});
 return <div className={`spectator ${expanded?'spectator-expanded':''}`}>
  <div className="spectator-toolbar" aria-label="Spectator camera controls">
   <div className="spectator-modes"><Button className="spectator-button" variant="outline" aria-pressed={mode==='follow'} onClick={()=>changeMode('follow')}>ORBIT FLY</Button><Button className="spectator-button" variant="outline" aria-pressed={mode==='free'} onClick={()=>changeMode('free')}>FREE CAM</Button><Button className="spectator-button" variant="outline" onClick={()=>scene.current?.reset()} aria-label="Recenter camera on the fly">RECENTER</Button></div>
   <div className="spectator-modes"><Button className="spectator-button record-button" variant="outline" disabled={!recording&&(!live||!data?.spectator||!canRecord||!!error)} onClick={recording?stop:record}>{recording?`■ STOP ${String(Math.floor(elapsed/60)).padStart(2,'0')}:${String(elapsed%60).padStart(2,'0')}`:'● RECORD'}</Button><Button className="spectator-button" variant="outline" onClick={()=>setExpanded(v=>!v)} aria-pressed={expanded}>{expanded?'SHRINK':'EXPAND'}</Button></div>
  </div>
  <div className="spectator-stage">
   <canvas ref={canvas} aria-label="3D spectator arena. Orbit by dragging. In free camera mode, drag to look, WASD to move, Q and E to move down and up."/>
   <div className="spectator-stamp"><strong>DOOMFLY</strong><span>3D SPECTATOR / VISUAL AVATAR</span></div>
   {!data?.spectator?<div className="spectator-message">WAITING FOR 3D TELEMETRY<span>The first-person feed is still available.</span></div>:!live?<div className="spectator-frozen">SIGNAL LOST · LAST RECEIVED POSITION</div>:null}
   {mode==='free'?<div className="spectator-touch" aria-label="Move spectator camera"><Button className="spectator-button" {...steer('KeyQ')} aria-label="Camera down">Q ↓</Button><Button className="spectator-button" {...steer('KeyW')} aria-label="Camera forward">W ↑</Button><Button className="spectator-button" {...steer('KeyE')} aria-label="Camera up">E ↑</Button><Button className="spectator-button" {...steer('KeyA')} aria-label="Camera left">A ←</Button><Button className="spectator-button" {...steer('KeyS')} aria-label="Camera backward">S ↓</Button><Button className="spectator-button" {...steer('KeyD')} aria-label="Camera right">D →</Button></div>:null}
  </div>
  <div className="spectator-caption"><span>{mode==='follow'?'DRAG TO ORBIT · SCROLL / PINCH TO ZOOM':'DRAG TO LOOK · WASD TO FLY · Q/E DOWN/UP · SHIFT BOOST'}</span><span>CAMERA ONLY</span></div>
  {error?<p className="spectator-notice" role="alert">{error}</p>:null}
  {clip?<a className="spectator-download" href={clip.url} download={clip.name}>↓ SAVE YOUR CLIP <span>720p · video only</span></a>:null}
  {!canRecord?<p className="spectator-notice">Use your device’s screen recorder to capture this view.</p>:null}
  <p className="spectator-note">Actual game positions. Illustrated fly, gun and arena; animated wings are decorative. The brain still sees Doom’s first-person pixels. Recording stops at 3 minutes, on signal loss, or when you leave this tab.</p>
 </div>;
}
