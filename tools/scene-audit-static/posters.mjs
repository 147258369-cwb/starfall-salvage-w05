
const C=3.2;
const R=(v)=>Math.round(v*1000)/1000;
const P=(...a)=>console.log(a.join(' '));
// addPoster: 平面 = P + n*0.045, 画框中心 = P - n*0.012 (半深0.0175)
const posters=[
 ['464 map',6.94*C,4.35*C,-Math.PI/2,'wall x=22.4 (entry east)',22.4,'x'],
 ['465 birthday',6.93*C,2.2*C,-Math.PI/2,'wall x=22.4',22.4,'x'],
 ['490 drawing',11.04*C,3.2*C,Math.PI/2,'wall x=35.2 (classroom west)',35.2,'x'],
 ['491 rules',12.0*C,6.94*C,Math.PI,'wall z=22.4 (classroom south)',22.4,'z'],
 ['546 missing',21.06*C,3.7*C,Math.PI/2,'wall x=67.2 (office west)',67.2,'x'],
 ['558 frog',6.94*C,13.4*C,-Math.PI/2,'wall x=22.4 (nap east)',22.4,'x'],
 ['559 drawing',1.06*C,16.0*C,Math.PI/2,'wall x=3.2 (nap west)',3.2,'x'],
 ['618 birthday',11.06*C,16.2*C,Math.PI/2,'wall x=35.2 (canteen west)',35.2,'x'],
 ['668 rules',5.4*C,6.97*C,0,'wall z=22.4 (entry south)',22.4,'z'],
 ['669 frog',11.6*C,6.96*C,0,'wall z=22.4 (classroom south)',22.4,'z'],
 ['670 birthday',16.0*C,6.96*C,0,'wall z=22.4 (classroom south)',22.4,'z'],
 ['671 drawing',4.2*C,9.96*C,Math.PI,'wall z=32.0 (main corridor south)',32.0,'z'],
 ['672 missing',12.3*C,9.96*C,Math.PI,'wall z=32.0',32.0,'z'],
 ['673 map',21.4*C,9.96*C,Math.PI,'wall z=32.0',32.0,'z'],
 ['676 rules',8.06*C,15.7*C,Math.PI/2,'wall x=25.6 (central corridor west)',25.6,'x'],
 ['677 frog',9.94*C,3.2*C,-Math.PI/2,'wall x=32.0 (central corridor east)',32.0,'x'],
];
for(const [name,px,pz,ry,desc,face,axis] of posters){
  const n=[Math.sin(ry),Math.cos(ry)];
  const pl=[px+n[0]*0.045,pz+n[1]*0.045];
  const fr=[px-n[0]*0.012,pz-n[1]*0.012];
  const pos = axis==='x'?px:pz, plane = axis==='x'?pl[0]:pl[1], frame=axis==='x'?fr[0]:fr[1];
  // 房间在哪一侧：朝房间的法线分量应当指向房间
  P(name,'| pos',R(pos),'| plane',R(plane),'| frame中心',R(frame),'| frame背面',R(axis==='x'?frame-Math.sign(n[0])*0.0175:frame-Math.sign(n[1])*0.0175),'| 墙',face,'|',desc,'| n=',n.map(R).join(','));
}
