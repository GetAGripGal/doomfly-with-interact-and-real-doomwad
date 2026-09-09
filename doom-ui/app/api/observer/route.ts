import {env} from 'cloudflare:workers';
export async function GET(request:Request){
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const fail=(status:number)=>Response.json({status:'unavailable'},{status,headers});
 const params=new URL(request.url).searchParams,keys=['x','y','z','yaw','pitch'];
 if([...params.keys()].some(k=>!keys.includes(k))||keys.some(k=>params.getAll(k).length!==1))return fail(400);
 const v=keys.map(k=>Number(params.get(k)));
 if(!v.every(Number.isFinite)||Math.abs(v[0])>8192||Math.abs(v[1])>8192||v[2]<4||v[2]>2048||v[3]<0||v[3]>=360||Math.abs(v[4])>60)return fail(400);
 const origin=(env as {DOOM_STREAM_ORIGIN?:string}).DOOM_STREAM_ORIGIN;if(!origin)return fail(503);
 try{
  const url=new URL('/observer',origin);
  if(url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname)))return fail(503);
  keys.forEach((k,i)=>url.searchParams.set(k,v[i].toFixed(5)));
  const response=await fetch(url,{signal:AbortSignal.timeout(2500)});
  if(!response.ok)return fail(response.status===429?429:503);
  const body=await response.text();if(body.length>2_000_000)return fail(503);
  return new Response(body,{headers:{...headers,'Content-Type':'application/json'}});
 }catch{return fail(503);}
}
