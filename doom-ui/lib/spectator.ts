/** Read-only engine geometry. It is never a neural input or a control channel. */
export type Pose={x:number;y:number;z:number;angle:number};
export type SpectatorFrame={version:1;timing:'pre-action';episode:number;tick:number;
 player:Pose&{pitch:number};objects:(Pose&{id:number;name:string})[];
 sectors:{floor:number;ceiling:number;lines:number[][]}[]};
export function validateSpectator(value:unknown):asserts value is SpectatorFrame{
 const d=value as SpectatorFrame;
 const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<1e7;
 const count=(n:unknown)=>finite(n)&&Number.isInteger(n)&&Number(n)>=0;
 const pose=(p:Pose)=>p&&[p.x,p.y,p.z,p.angle].every(finite);
 if(!d||d.version!==1||d.timing!=='pre-action'||!count(d.episode)||!count(d.tick)||!pose(d.player)||!finite(d.player.pitch)||
 !Array.isArray(d.objects)||d.objects.length>256||!d.objects.every(o=>pose(o)&&count(o.id)&&typeof o.name==='string'&&o.name.length<=80)||new Set(d.objects.map(o=>o.id)).size!==d.objects.length||
 !Array.isArray(d.sectors)||!d.sectors.length||d.sectors.length>32||!d.sectors.every(s=>finite(s.floor)&&finite(s.ceiling)&&s.ceiling>s.floor&&Array.isArray(s.lines)&&s.lines.length<=128&&s.lines.every(l=>Array.isArray(l)&&l.length===4&&l.every(finite))))throw new Error('Invalid spectator geometry');
}
export function interpolatePose(a:Pose,b:Pose,t:number):Pose{
 const u=Math.max(0,Math.min(1,t));
 const delta=((b.angle-a.angle)%360+540)%360-180;
 return {x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u,angle:a.angle+delta*u};
}
