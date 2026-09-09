const {test}=require('node:test');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const {interpolatePose,validateSpectator}=require(join(process.env.DOOMFLY_TEST_BUILD,'spectator.js'));
const pose={x:0,y:0,z:0,angle:359};
const packet=()=>({version:1,timing:'pre-action',episode:1,tick:0,player:{...pose,pitch:0},objects:[{...pose,id:0,name:'DoomFlyImp'}],sectors:[{floor:0,ceiling:192,lines:[[-384,-384,384,-384]]}]});
test('received poses interpolate through the short heading arc and never extrapolate',()=>{
 const a=pose,b={x:10,y:-10,z:2,angle:1};
 assert.deepEqual(interpolatePose(a,b,.5),{x:5,y:-5,z:1,angle:360});
 assert.equal(interpolatePose(a,b,4).x,10);assert.equal(interpolatePose(a,b,-1).x,0);
 assert.deepEqual(a,pose);
});
test('malformed or unbounded observer packets are rejected',()=>{
 assert.doesNotThrow(()=>validateSpectator(packet()));
 for(const mutate of [p=>p.player.x=NaN,p=>p.timing='post-action',p=>p.objects.push(p.objects[0]),p=>p.objects[0].name='a'.repeat(81),p=>p.sectors[0].lines[0][2]=Infinity,p=>p.sectors[0].ceiling=-1,p=>p.tick=-1,p=>p.objects=Array(257).fill(p.objects[0])]){
  const p=packet();mutate(p);assert.throws(()=>validateSpectator(p));
 }
});
