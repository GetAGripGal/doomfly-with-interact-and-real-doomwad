const {test}=require('node:test');
const assert=require('node:assert/strict');
const {join}=require('node:path');
const T=require('three');
const {createWeaponMount,buildWeaponGeometry,createNativeWeapon}=require(join(process.env.DOOMFLY_TEST_BUILD,'native-weapon.js'));
const near=(a,b)=>assert.ok(a.distanceTo(b)<1e-6,`${a.toArray()} != ${b.toArray()}`);
test('the grip and muzzle move and turn with the fly, independent of observer cameras',()=>{
 const fly=new T.Group(),w=createWeaponMount();fly.add(w.root);w.muzzle.position.set(12,8,0);
 fly.scale.setScalar(1/32);fly.position.set(10,4,-7);
 const pos=()=>{fly.updateMatrixWorld(true);return w.muzzle.getWorldPosition(new T.Vector3());};
 near(pos(),new T.Vector3(10+23/32,4+1/32,-7));
 fly.position.add(new T.Vector3(3,2,-4));fly.rotation.y=Math.PI/2;
 near(pos(),new T.Vector3(13,6+1/32,-11-23/32));
 const before=pos();const camera=new T.PerspectiveCamera();camera.position.set(-100,40,20);camera.lookAt(0,0,0);near(pos(),before);
 fly.rotation.y=Math.PI;near(pos(),new T.Vector3(13-23/32,6+1/32,-11));
});
test('native downward pitch rotates the mounted barrel downward',()=>{
 const w=createWeaponMount();w.setPitch(30);w.root.updateMatrixWorld(true);
 const forward=new T.Vector3(1,0,0).transformDirection(w.root.matrixWorld);
 assert.ok(Math.abs(forward.y+.5)<1e-6);assert.ok(forward.x>0);
});
const pixels=()=>{
 const width=6,height=10,data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<10;y++)for(let x=1;x<5;x++)data.set(y<5?[85,85,90,255]:[130,80,30,255],(y*width+x)*4);
 return {width,height,data};
};
test('native pistol pixels form a volume with an anchored grip and forward barrel',()=>{
 const f=buildWeaponGeometry(pixels());f.geometry.computeBoundingBox();const box=f.geometry.boundingBox;
 assert.equal(box.min.x,0);assert.equal(box.min.y,0);assert.equal(box.max.x,12);
 assert.ok(box.max.z>0&&box.min.z<0);assert.ok(f.muzzle.x>box.max.x);
 assert.ok(f.geometry.attributes.color.count>0);f.geometry.dispose();
});
test('HUD sway cannot detach the pistol; native flash presence controls both attached flash planes',()=>{
 const previous=global.document;
 global.document={createElement:()=>({getContext:()=>({drawImage(){},getImageData:pixels})})};
 const w=createNativeWeapon(()=>{}),p={layer:0,image:'native-pistol',width:6,height:10,flip:0,sx:0,sy:74};
 try{
  w.update([p],[{}],0);const grip=w.root.position.clone(),muzzle=w.muzzle.position.clone();
  w.update([{...p,sy:32.375,sx:8}],[{}],0);near(w.root.position,grip);near(w.muzzle.position,muzzle);
  assert.equal(w.muzzle.visible,false);
  w.update([p,{...p,layer:1,image:'native-flash'}],[{},{}],0);assert.equal(w.muzzle.visible,true);
  w.root.traverse(o=>assert.notEqual(o.isSprite,true,'weapon must not billboard'));
  assert.equal(w.muzzle.children.length,2);
  w.update([p],[{}],0);assert.equal(w.muzzle.visible,false);
  w.update([],[],0);assert.equal(w.muzzle.visible,false);assert.equal(w.root.getObjectByName('native-pistol-volume').visible,false);
 }finally{w.dispose();global.document=previous;}
});
