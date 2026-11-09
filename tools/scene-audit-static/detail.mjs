
const C=3.2;
const R=(v)=>Math.round(v*1000)/1000;
const P=(...a)=>console.log(a.join(' '));
P('=== 门厅长椅 457-459 ===');
const seatX=1.75*C, seatZ=4.7*C;
P('座面 x',R(seatX),'z',R(seatZ),' -> x',R(seatX-0.3),R(seatX+0.3),'z',R(seatZ-1.0),R(seatZ+1.0));
P('腿 z',R(3.9*C),R(5.5*C),' 座面 z 端',R(4.7*C-1.0),R(4.7*C+1.0),' 外溢',R(3.9*C-(4.7*C-1.0)));
P('=== 出口厅长椅 636-638 ===');
const ex=23.0*C;
P('座面 x',R(ex),'span',R(ex-1.2),R(ex+1.2),'z',R(17.65*C),'span',R(17.65*C-0.25),R(17.65*C+0.25));
P('腿 x',R(22.0*C),R(24.0*C),'外溢',R(ex-1.2-22.0*C));
P('=== 走廊长椅 656-658 ===');
P('座面 x',R(22.4-0.275),R(22.4+0.275),'z',R(26.7-0.95),R(26.7+0.95));
P('腿 x',21.65,23.15,'外溢',R(22.4-0.275-21.65));
P('=== 园长室台灯 549-550 / 书桌 542 ===');
const deskX=(23.3+0.5)*C, deskZ=(2.1+0.5)*C;
const lampX=22.35*C, lampZ=2.0*C;
P('桌中心',R(deskX),R(deskZ),'台面 y',0.78,'+0.045=',R(0.825),' 桌 AABB x',R(deskX-1.2),R(deskX+1.2),'z',R(deskZ-0.5),R(deskZ+0.5));
P('灯罩中心',R(lampX),1.55,R(lampZ),' 灯杆 y',R(1.3-0.25),R(1.3+0.25),' 距桌中心',R(Math.hypot(lampX-deskX,lampZ-deskZ)));
P('=== 食堂桌面物 ===');
const tX=(13.5+0.5)*C, tZ=(14.3+0.5)*C;
P('桌中心',R(tX),R(tZ),'AABB x',R(tX-2.1),R(tX+2.1),'z',R(tZ-0.75),R(tZ+0.75),'台面顶 y',R(0.94+0.045));
for(const [cx,cz] of [[12.3,14.2],[14.7,14.4],[13.0,13.5],[15.1,14.9]]){
  P('纸杯 cx*C',R(cx*C),R(cz*C),' | (cx+0.5)*C',R((cx+0.5)*C),R((cz+0.5)*C));
}
for(let i=0;i<4;i++){const cx=11.8+i*1.1, cz=13.2+(i%2)*1.9;
  P('派对帽 i',i,'cell',R(cx),R(cz),'world',R((cx+0.5)*C),R((cz+0.5)*C),' y底',1.0);
}
P('=== 教室地球仪 509-513 vs 讲台 493 ===');
const podX=(15.4+0.5)*C, podZ=(1.85+0.5)*C;
P('讲台中心',R(podX),R(podZ),'AABB x',R(podX-1.0),R(podX+1.0),'z',R(podZ-0.425),R(podZ+0.425),'顶面',R(0.8+0.045));
P('地球仪底座 x',R(15.4*C),'z',R(1.85*C),'y',R(1.02-0.04),R(1.02+0.04));
P('=== 储物柜 ===');
for(const [cx,cz,ry,count] of [[8.12,5.2,0,2],[21.06,14.2,Math.PI/2,3]]){
  const x=(cx+0.5)*C,z=(cz+0.5)*C,w=0.55*count;
  const cw=Math.abs(Math.cos(ry))*0.5+Math.abs(Math.sin(ry))*w;
  const cd=Math.abs(Math.sin(ry))*0.5+Math.abs(Math.cos(ry))*w;
  P('lockers',cx,cz,'中心',R(x),R(z),'AABB x',R(x-cw/2),R(x+cw/2),'z',R(z-cd/2),R(z+cd/2),'| cx*C 本意',R(cx*C));
}
P('=== 黑板/粉笔 ===');
P('黑板 x',R(13.5*C-2.2),R(13.5*C+2.2),'z',R(1.04*C-0.04),R(1.04*C+0.04),'y',R(1.76-0.875),R(1.76+0.875));
P('粉笔 x',R(15.6*C-0.08),R(15.6*C+0.08),'z',R(1.08*C-0.03),R(1.08*C+0.03),'y',R(1.65-0.45),R(1.65+0.45));
P('=== 午睡室摇椅 565-566 ===');
const rs=0.4;
P('座面 z 半外接',R(Math.abs(Math.sin(rs))*0.3+Math.abs(Math.cos(rs))*0.45));
P('座面 z',R(11.8*C-(Math.abs(Math.sin(rs))*0.3+Math.abs(Math.cos(rs))*0.45)),R(11.8*C+(Math.abs(Math.sin(rs))*0.3+Math.abs(Math.cos(rs))*0.45)));
P('靠背 z',R(12.15*C-0.04*Math.cos(rs)),R(12.15*C+0.04*Math.cos(rs)),' 空隙',R(12.15*C-0.04-38.291));
P('=== 床 ===');
P('床架 y',R(0.24-0.09),R(0.24+0.09),' 床垫 y',R(0.4-0.08),R(0.4+0.08));
P('=== 接待台挡板 452 ===');
P('挡板 y',R(0.5-0.45),R(0.5+0.45),' z',R(7.84-0.45-0.05),R(7.84-0.45+0.05),'桌面 z',R(7.84-0.5));
