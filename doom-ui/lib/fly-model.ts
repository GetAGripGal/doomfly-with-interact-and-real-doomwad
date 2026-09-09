import * as T from 'three';

// Original procedural avatar. Anatomy-inspired illustration, not a body simulation.
export function createFly(){
 const root=new T.Group();
 const shell=new T.MeshStandardMaterial({color:0x858c8e,roughness:.7,metalness:.22,flatShading:true});
 const dark=new T.MeshStandardMaterial({color:0x202629,roughness:.65});
 const eye=new T.MeshStandardMaterial({color:0xb41e2d,roughness:.34,metalness:.3,flatShading:true});
 const silver=new T.MeshStandardMaterial({color:0xc4c9c4,metalness:.65,roughness:.4});
 const wingMat=new T.MeshStandardMaterial({color:0xe4f6fa,transparent:true,opacity:.35,side:T.DoubleSide,roughness:.25,depthWrite:false});
 function ellipsoid(parent:T.Object3D,mat:T.Material,p:number[],s:number[],detail=2){
  const m=new T.Mesh(new T.IcosahedronGeometry(1,detail),mat);m.position.set(p[0],p[1],p[2]);m.scale.set(s[0],s[1],s[2]);parent.add(m);return m;
 }
 function rod(parent:T.Object3D,a:number[],b:number[],radius:number,mat:T.Material){
  const p=new T.Vector3(...a as [number,number,number]),q=new T.Vector3(...b as [number,number,number]);
  const m=new T.Mesh(new T.CylinderGeometry(radius,radius*.8,p.distanceTo(q),5),mat);
  m.position.copy(p).add(q).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.sub(p).normalize());parent.add(m);
 }
 ellipsoid(root,shell,[0,0,0],[6,5.5,5]);
 ellipsoid(root,dark,[-8,-.7,0],[8,4.4,4.3]);
 for(let i=0;i<5;i++)ellipsoid(root,i%2?shell:dark,[-5-i*2.4,-.8,0],[1.5,4.4-i*.55,4.4-i*.55]);
 ellipsoid(root,shell,[7,.3,0],[3.8,4.5,4.6]);
 for(const side of [-1,1]){
  const e=ellipsoid(root,eye,[8.1,1,side*3.7],[3,3.7,1.8]);e.rotation.y=side*-.23;
  // Small repeated facets make the compound eyes readable in close-ups.
  for(let row=-2;row<=2;row++)for(let col=-2;col<=2;col++){
   if(row*row+col*col>7)continue;
   ellipsoid(root,eye,[8.4+row*.8,1+col,side*(5.2-.12*(row*row+col*col))],[.4,.43,.3],0);
  }
  rod(root,[9.3,2,side*1.3],[12.4,3.3,side*2.2],.18,dark);
  rod(root,[12.4,3.3,side*2.2],[14,4.5,side*2.6],.12,silver);
  for(let i=0;i<3;i++){
   const x=3-i*4;const knee=[x+(i===0?4:-2),-6,side*8];
   const foot=i===0?[10,-7,side*2.2]:[x-6,-11,side*10];
   rod(root,[x,-2,side*3],knee,.42,dark);rod(root,knee,foot,.27,silver);
   rod(root,foot,[foot[0]+2,foot[1]-.5,foot[2]],.17,dark);
  }
  // Haltere and a few thoracic bristles.
  rod(root,[-4,1,side*4],[-5,2,side*7],.2,dark);ellipsoid(root,silver,[-5,2,side*7],[.9,.9,.9],1);
  for(let i=0;i<8;i++){const x=-3+i*1.1;rod(root,[x,4,side*2],[x-1,6,side*3],.075,dark);}
 }
 const wings:T.Group[]=[];
 for(const side of [-1,1]){
  const pivot=new T.Group();pivot.position.set(-1,4,side*2);root.add(pivot);wings.push(pivot);
  const outline=[[0,0],[-3,8],[-9,17],[-16,21],[-22,18],[-22,13],[-16,6],[-7,1]];
  const shape=new T.Shape();outline.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
  const geo=new T.ShapeGeometry(shape);geo.rotateX(Math.PI/2);geo.scale(1,1,side);
  pivot.add(new T.Mesh(geo,wingMat));
  for(const end of [[-16,20],[-21,17],[-20,13],[-15,7]]){
   rod(pivot,[0,0,0],[end[0],0,side*end[1]],.065,silver);
  }
  const points=outline.concat([outline[0]]).map(([x,z])=>new T.Vector3(x,.02,side*z));
  pivot.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:0xafc0c4,transparent:true,opacity:.65})));
 }
 const gun=new T.Group();gun.position.set(11,-6,0);root.add(gun);
 function box(w:number,h:number,d:number,x:number,y:number,mat:T.Material){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,0);gun.add(m);return m;}
 box(12,3.8,4,2,0,dark);box(8,1.2,3.5,1,2.5,silver);box(3,5,2.5,-2,-3,dark);
 rod(gun,[6,0,0],[13,0,0],1.2,silver);rod(gun,[12,0,0],[13.2,0,0],.8,dark);
 box(1,1,1,6,3,silver);
 const trigger=new T.Mesh(new T.TorusGeometry(1.3,.18,4,8),silver);trigger.position.set(0,-3,0);gun.add(trigger);
 return {root,animate:(seconds:number,moving:boolean)=>{
  // Pure decoration, measured in wall time; never a neural/muscle readout.
  wings.forEach((w,i)=>w.rotation.x=(i?1:-1)*(.08+(moving?Math.sin(seconds*2*Math.PI*23)*.36:0)));
 }};
}
