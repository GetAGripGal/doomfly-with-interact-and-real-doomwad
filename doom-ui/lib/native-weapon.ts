import * as T from 'three';

export type WeaponPatch={layer:number;width:number;height:number;image:string;flip:number};
export type Pixels={width:number;height:number;data:Uint8ClampedArray};
const pixelSize=.23;

// The grip is in fly-local coordinates, between the forelegs. All geometry,
// including the flash, inherits this transform, never the observer camera.
export function createWeaponMount(){
 const root=new T.Group();root.name='fly-weapon-grip';root.position.set(11,-7,0);
 const muzzle=new T.Group();muzzle.name='fly-weapon-muzzle';root.add(muzzle);
 return {root,muzzle,setPitch(degrees:number){root.rotation.z=-degrees*Math.PI/180;}};
}

// Doom supplies rear-view pistol pixels, not a 3D weapon model. Retain those
// pixels and their frame changes; the short barrel/grip extrusion is illustrative.
// The HUD's sx/sy offsets belong to first-person screen space, not this socket.
export function buildWeaponGeometry({width,height,data}:Pixels){
 const mask=new Uint8Array(width*height);let x0=width,x1=-1,y0=height,y1=-1;
 for(let y=0;y<height*.51;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,[r,g,b,a]=data.subarray(i,i+4);
  if(a<128||(r>b*1.7&&g>b*1.4&&r>11))continue;
  mask[y*width+x]=1;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
 }
 const positions:number[]=[],colors:number[]=[],color=new T.Color();
 const on=(x:number,y:number)=>x>=0&&x<width&&y>=0&&y<height&&!!mask[y*width+x];
 const length=(y:number)=>(y-y0)/(y1-y0+1)<.58?12:3.4;
 function quad(points:number[][],shade:number){
  for(const i of [0,1,2,0,2,3]){positions.push(...points[i]);colors.push(color.r*shade,color.g*shade,color.b*shade);}
 }
 for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++)if(on(x,y)){
  const i=(y*width+x)*4;color.setRGB(data[i]/255,data[i+1]/255,data[i+2]/255,T.SRGBColorSpace);
  const z0=(x-(x0+x1+1)/2)*pixelSize,z1=z0+pixelSize;
  const top=(y1-y+1)*pixelSize,bottom=top-pixelSize,end=length(y);
  quad([[0,bottom,z0],[0,bottom,z1],[0,top,z1],[0,top,z0]],1);
  quad([[end,bottom,z1],[end,bottom,z0],[end,top,z0],[end,top,z1]],.85);
  if(!on(x-1,y))quad([[0,bottom,z0],[0,top,z0],[end,top,z0],[end,bottom,z0]],.8);
  if(!on(x+1,y))quad([[0,bottom,z1],[end,bottom,z1],[end,top,z1],[0,top,z1]],.8);
  const above=on(x,y-1)?Math.min(end,length(y-1)):0;
  const below=on(x,y+1)?Math.min(end,length(y+1)):0;
  if(above<end)quad([[above,top,z0],[above,top,z1],[end,top,z1],[end,top,z0]],1.1);
  if(below<end)quad([[below,bottom,z1],[below,bottom,z0],[end,bottom,z0],[end,bottom,z1]],.6);
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
 geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 geometry.computeBoundingSphere();
 return {geometry,muzzle:new T.Vector3(12.1,Math.max(0,(y1-y0+1)*pixelSize-1.2),0)};
}

export function createNativeWeapon(occlusion:(material:T.Material)=>void){
 const mount=createWeaponMount(),cache=new Map<string,ReturnType<typeof buildWeaponGeometry>>(),textures=new Map<string,T.Texture>();
 const bodyMaterial=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide});occlusion(bodyMaterial);
 const empty=new T.BufferGeometry(),body=new T.Mesh(empty,bodyMaterial);body.name='native-pistol-volume';mount.root.add(body);
 const flashMaterial=new T.MeshBasicMaterial({transparent:true,alphaTest:.05,depthWrite:false,side:T.DoubleSide});occlusion(flashMaterial);
 const frontal=new T.PlaneGeometry(1,1);frontal.rotateY(Math.PI/2);
 const lateral=new T.PlaneGeometry(1,1);lateral.translate(.5,0,0);
 const front=new T.Mesh(frontal,flashMaterial),side=new T.Mesh(lateral,flashMaterial);
 mount.muzzle.add(front,side);mount.muzzle.visible=false;body.visible=false;
 function update(patches:WeaponPatch[],images:HTMLImageElement[],pitch:number){
  mount.setPitch(pitch);body.visible=false;mount.muzzle.visible=false;
  const base=patches.findIndex(p=>p.layer===0);
  if(base>=0){
   const p=patches[base];let frame=cache.get(p.image);
   if(!frame){
    const c=document.createElement('canvas');c.width=p.width;c.height=p.height;
    const ctx=c.getContext('2d',{willReadFrequently:true})!;ctx.drawImage(images[base],0,0);
    frame=buildWeaponGeometry(ctx.getImageData(0,0,p.width,p.height));
    if(cache.size>=16){for(const f of cache.values())f.geometry.dispose();cache.clear();}
    cache.set(p.image,frame);
   }
   body.geometry=frame.geometry;body.visible=true;mount.muzzle.position.copy(frame.muzzle);
   // Mirrored native art remains mirrored about the barrel, never the camera.
   body.scale.z=p.flip?-1:1;
  }
  const flash=patches.findIndex(p=>p.layer===1);
  if(base>=0&&flash>=0){
   const p=patches[flash];let texture=textures.get(p.image);
   if(!texture){
    if(textures.size>=16){textures.forEach(t=>t.dispose());textures.clear();}
    texture=new T.Texture(images[flash]);texture.colorSpace=T.SRGBColorSpace;
    texture.minFilter=T.NearestFilter;texture.magFilter=T.NearestFilter;texture.needsUpdate=true;textures.set(p.image,texture);
   }
   flashMaterial.map=texture;flashMaterial.needsUpdate=true;
   front.scale.set(1,p.height*pixelSize,p.width*pixelSize);
   side.scale.set(p.width*pixelSize,p.height*pixelSize,1);
   mount.muzzle.visible=true; // Only an actual engine flash frame can enable it.
  }
 }
 return {...mount,update,dispose(){
  cache.forEach(f=>f.geometry.dispose());textures.forEach(t=>t.dispose());
  empty.dispose();bodyMaterial.dispose();frontal.dispose();lateral.dispose();flashMaterial.dispose();mount.root.clear();
 }};
}
