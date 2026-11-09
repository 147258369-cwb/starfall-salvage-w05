
const C=3.2, WH=3.45;
const cc=(cx,cz)=>[(cx+0.5)*C,(cz+0.5)*C];
const round=(v,n=1)=>Math.round(v*10**n)/10**n;
const out=[];
const P=(...a)=>out.push(a.join(' '));

// 房间世界边界
const rooms={entry:[1,6,1,6],classroom:[11,16,1,6],office:[21,25,1,6],nap:[1,6,11,18],canteen:[11,16,11,18],exit:[21,25,11,18]};
for(const [k,[x0,x1,z0,z1]] of Object.entries(rooms)){
  P(k,'world x',round(x0*C),'..',round((x1+1)*C),' z',round(z0*C),'..',round((z1+1)*C));
}

P('\n--- 桌子：腿顶 vs 台面底 ---');
for(const h of [0.66,0.92,0.8,0.78,0.94]){
  const legH=h-0.09, legTop=legH, slabBottom=h-0.045;
  P('h='+h,'腿长',round(legH,3),'腿顶 y',round(legTop,3),'台面底 y',round(slabBottom,3),'缝隙',round(slabBottom-legTop,3));
}

P('\n--- 椅子与桌的间距 ---');
// [chairCx,chairCz,ry,tableCx,tableCz,w,d]
const chairCalls=[
 ['entry 接待',3.3,1.35,'PI',3.3,1.95,2.5,1.0],
 ['office',23.3,1.4,'PI',23.3,2.1,2.4,1.0],
 ['class A1',12.3,3.0,'PI',12.3,3.7,1.5,0.8],
 ['class A2',12.3,4.45,'PI',12.3,3.7,1.5,0.8],
 ['class B1',15.0,3.1,'PI',15.0,3.8,1.5,0.8],
 ['class B2',15.0,4.55,'PI',15.0,3.8,1.5,0.8],
 ['class C1',13.6,4.65,'PI',13.6,5.35,1.5,0.8],
 ['class C2',13.6,6.05,'PI',13.6,5.35,1.5,0.8],
 ['class D',14.4,5.35,'PI',13.6,5.35,1.5,0.8],
];
for(const [name,chx,chz,ry,tx,tz,w,d] of chairCalls){
  const [x,z]=cc(chx,chz),[ax,az]=cc(tx,tz);
  // 桌四边
  const x0=ax-w/2,x1=ax+w/2,z0=az-d/2,z1=az+d/2;
  // 椅座 0.55 外接（ry=PI 时不旋转）
  const halfseat=0.275;
  // 最近桌边距离
  const dx=Math.max(x0-(x+halfseat),(x-halfseat)-x1,0);
  const dz=Math.max(z0-(z+halfseat),(z-halfseat)-z1,0);
  const gap=Math.hypot(dx,dz);
  P(name,'椅 world',round(x),round(z),'桌中心',round(ax),round(az),'桌 AABB x',round(x0),round(x1),'z',round(z0),round(z1),'椅到桌最近空隙',round(gap));
}
P('\n--- 食堂 6 椅 ---');
for(const [chx,chz] of [[12.0,13.3],[13.5,13.3],[15.0,13.3],[12.0,15.3],[13.5,15.3],[15.0,15.3]]){
  const [x,z]=cc(chx,chz); const [ax,az]=cc(13.5,14.3);
  const x0=ax-2.1,x1=ax+2.1,z0=az-0.75,z1=az+0.75;
  const dx=Math.max(x0-(x+0.275),(x-0.275)-x1,0);
  const dz=Math.max(z0-(z+0.275),(z-0.275)-z1,0);
  P('canteen chair',chx,chz,'world',round(x),round(z),'gap',round(Math.hypot(dx,dz)));
}
console.log(out.join('\n'));
