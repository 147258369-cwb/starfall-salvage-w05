import { launch } from './cdp.mjs';
const api=await launch({width:1280,height:720});
try {
  await api.goto('http://127.0.0.1:8123/?debug=1',2500);
  await api.waitFor("window.__mfp && window.__mfp.state === 'menu'",{timeout:150000});
  const out=await api.evaluate(()=>{
    const g=window.__mfp,a=g.audio,b=a.buffers.get('frog_voice_1'),f=a.frogs[0];
    if(!b) return {loaded:false,manifest:a.manifest?.tracks?.frog_voice_1};
    const x=b.getChannelData(0); let peak=0,sum=0,blocks=[];
    for(let i=0;i<x.length;i++) { const v=Math.abs(x[i]); if(v>peak)peak=v; sum+=x[i]*x[i]; }
    const block=Math.floor(b.sampleRate*.05);
    for(let i=0;i<x.length;i+=block){let s=0,n=Math.min(block,x.length-i);for(let j=i;j<i+n;j++)s+=x[j]*x[j];blocks.push(Math.sqrt(s/n));}
    blocks.sort((a,b)=>a-b);
    return {loaded:true,manifest:a.manifest.tracks.frog_voice_1,duration:+b.duration.toFixed(3),sampleRate:b.sampleRate,channels:b.numberOfChannels,peak:+peak.toFixed(3),rms:+Math.sqrt(sum/x.length).toFixed(4),rmsP95:+blocks[Math.floor(blocks.length*.95)].toFixed(4),loop:f?.src?.loop,activeFrogSources:a.frogs.filter(Boolean).length};
  });
  console.log(JSON.stringify(out,null,1));
  console.log('ERRORS',JSON.stringify(api.errors.slice(0,8)));
} finally { await api.close(); }
