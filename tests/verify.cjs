const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..')+'/';
const c=vm.createContext({console,self:{navigator:{userAgent:'vector-test'}},setTimeout,clearTimeout,setInterval:()=>0,clearInterval:()=>{}});
for(const f of ['vendor/paper-full.min.js','vendor/matter.min.js']) vm.runInContext(fs.readFileSync(root+f,'utf8'),c);
vm.runInContext(`
window=globalThis;
paper.setup(new paper.Size(1000,600));
const elements=Object.fromEntries(['canvas','workspace','status','cancel','stage','prev','next','reset'].map(id=>[id,{style:{},textContent:'',disabled:false,value:'0',clientWidth:1000,clientHeight:600,add(){}}]));
const buttons=['move','pencil','saw'].map(mode=>({dataset:{tool:mode},setAttribute(){}}));
const keyHandlers=[];
document={getElementById:id=>elements[id], querySelectorAll:()=>buttons, addEventListener:(type,fn)=>keyHandlers.push(fn)};
Option=function(){};
ResizeObserver=class{constructor(fn){this.fn=fn}observe(){this.fn()}};
const originalSetup=paper.setup.bind(paper);
paper.setup=()=>originalSetup(new paper.Size(1000,600));
`,c);
for(const f of ['stages.js','wood.js','collision.js'])vm.runInContext(fs.readFileSync(root+f,'utf8'),c);
const app=fs.readFileSync(root+'app.js','utf8').replace('  choose(0);','  window.inspect = () => ({states, state:state(), draft, mode, stageIndex, dragging});\n  choose(0);');
vm.runInContext(app,c);
const result=vm.runInContext(`(()=>{
const check=(bool,msg)=>{if(!bool)throw Error(msg)};
const b=Wood.create(0,0,400,300), results={};
const cases={vertical:[[200,0],[200,300]], horizontal:[[0,150],[400,150]],
 diagonal:[[0,0],[400,300]], bent:[[90,0],[90,180],[220,180],[220,300]],
 sameEdge:[[90,0],[90,180],[220,180],[220,0]], reversed:[[220,0],[220,180],[90,180],[90,0]],
 crossing:[[0,100],[400,200],[0,200],[400,100]], boundary:[[0,0],[0,300]],outside:[[90,0],[500,150],[220,300]]};
for(const [k,mark]of Object.entries(cases)){
 const pieces=Wood.cut(b,mark);results[k]={valid:Wood.validMark(b,mark),pieces:pieces?.length,areas:pieces?.map(p=>Wood.area(p))};
 if(['crossing','boundary','outside'].includes(k))check(!results[k].valid,k+' should fail');
 else {check(pieces?.length===2,k+' should cut');check(Math.abs(pieces.reduce((a,p)=>a+Wood.area(p),0)-120000)<0.1,k+' area');}
}
const guide=Wood.create(300,200,160,120),collisions={};
const cc={left:[[200,250],[500,250]],right:[[550,250],[200,250]],top:[[370,100],[370,400]],bottom:[[370,420],[370,100]],slide:[[200,220],[310,290]],fast:[[0,250],[1000,250]]};
for(const [k,[a,b]] of Object.entries(cc)){
 const collision=new PencilCollision([guide]);
 const r=collision.advance(new paper.Point(a),new paper.Point(b),()=>true);
 collisions[k]={x:r.point.x,y:r.point.y,touched:r.touched};
 check(!r.trail.some(p=>Wood.contains(guide,p)),k+' should not enter guide');
}
check(collisions.left.x<300,'left');check(collisions.right.x>460,'right');check(collisions.top.y<200,'top');check(collisions.bottom.y>320,'bottom');
check(collisions.slide.x<300 && collisions.slide.y>280,'sliding');check(collisions.fast.x<300,'fast movement');
// A ruler must stay straight even when the pointer jitters on either side of its face.
const rulerCases={
 left:{start:[298,215],targets:[[303,240],[294,265],[315,290]],axis:'x',value:298},
 right:{start:[462,215],targets:[[455,240],[470,265],[440,290]],axis:'x',value:462},
 top:{start:[320,198],targets:[[350,205],[380,190],[420,215]],axis:'y',value:198},
 bottom:{start:[320,322],targets:[[350,315],[380,330],[420,302]],axis:'y',value:322}
};
for(const [name,test] of Object.entries(rulerCases)){
 const solver=new PencilCollision([guide]);
 let tip=solver.startAt(new paper.Point(test.start),()=>true);
 check(!!solver.lock,name+' initial ruler attachment');
 for(const target of test.targets){
  const r=solver.advance(tip,new paper.Point(target),()=>true);
  check(!!solver.lock,name+' attachment survives pointer jitter');
  check(r.trail.every(p=>Math.abs(p[test.axis]-test.value)<0.0001),name+' perfectly straight ruler line');
  check(r.trail.every(p=>!Wood.contains(guide,p)),name+' ruler trail stays outside');
  tip=r.point;
 }
}
const releaseSolver=new PencilCollision([guide]);
let releaseTip=releaseSolver.startAt(new paper.Point(298,240),()=>true);
releaseTip=releaseSolver.advance(releaseTip,new paper.Point(270,250),()=>true).point;
check(!releaseSolver.lock && Math.abs(releaseTip.x-270)<0.01,'pulling away releases ruler');
const P=(x,y)=>new paper.Point(x,y);
const down=(x,y)=>paper.tool.emit('mousedown',{point:P(x,y)});
const move=(x,y)=>paper.tool.emit('mousemove',{point:P(x,y)});
const drag=(x,y)=>paper.tool.emit('mousedrag',{point:P(x,y)});
const up=()=>paper.tool.emit('mouseup',{});
const mode=name=>buttons.find(b=>b.dataset.tool===name).onclick();
// User screenshot regression: the ruler crosses the stock's top edge.
down(500,170);drag(500,327);up();
mode('pencil');down(450,320);
check(inspect().draft?.board.role==='stock','overlapping corner selects stock, never ruler');
check(Math.abs(inspect().draft.points[0][0]+140-448)<0.001,'start beside ruler, on stock boundary');
for(const [x,y] of [[454,340],[445,360],[452,350],[460,380]])move(x,y);
check(inspect().draft.points.every(p=>Math.abs(p[0]+140-448)<0.0001),'screenshot path is vertical despite jitter');
check(inspect().draft.points.length===2,'retracing the ruler leaves a single clean segment');
check(inspect().state.boards.find(b=>b.role==='guide').marks.length===0,'no drawing on ruler');
elements.cancel.onclick();
// Clicking a ruler-only boundary must not start a path on the ruler.
down(500,287);check(!inspect().draft,'ruler-only boundary cannot start a stroke');
// A click slightly inside a full-height ruler must finish at the constrained tip on stock.
elements.reset.onclick();
const tallGuide=inspect().state.boards.find(b=>b.role==='guide');
tallGuide.x=450;tallGuide.y=280;tallGuide.points=[[0,0],[80,0],[80,300],[0,300]];
down(450,320);move(456,380);move(453,370);move(453,450);down(458,500);
const straightMark=inspect().state.boards.find(b=>b.role==='stock').marks[0];
check(straightMark?.length===2 && straightMark.every(p=>Math.abs(p[0]+140-448)<0.0001),'finish uses constrained straight endpoint');
check(Math.abs(straightMark[1][1]-180)<0.01,'ruler path reaches stock bottom edge');
mode('saw');down(448,400);check(inspect().state.boards.length===3,'straight ruler mark can be sawn');
elements.reset.onclick();mode('move');
down(200,400);drag(220,400);up();check(inspect().state.boards[0].x===160,'large board draggable');
down(500,170);drag(390,340);up();check(inspect().state.boards[1].x===340 && inspect().state.boards[1].y===300,'guide draggable');
check(Wood.sorted(inspect().state.boards)[0].role==='stock','area stacking');
mode('pencil');down(200,400);check(!inspect().draft,'interior cannot start');
down(330,320);check(!!inspect().draft,'edge start');
move(350,390);check(inspect().draft.touched,'colliding with guide');check(inspect().draft.points.at(-1)[0]+160<340,'clamped tip');
move(350,425);move(590,425);move(610,500);down(610,500);
check(inspect().state.boards[0].marks.length===1,'commit traced line: '+elements.status.textContent);
const mark=inspect().state.boards[0].marks[0];check(mark.length>3,'bent polyline saved');
for(const [x,y] of mark)check(!Wood.contains(inspect().state.boards[1],new paper.Point(x+160,y+320)),'trace never enters guide');
mode('saw');down(470,412);check(inspect().state.boards.length===3,'saw produces pieces: '+elements.status.textContent);
check(Math.abs(inspect().state.boards.reduce((sum,b)=>sum+Wood.area(b),0)-127200)<0.1,'UI area conservation');
mode('move');const piece=inspect().state.boards.find(b=>b.name.includes('조각'));
const bb=Wood.bounds(piece);const pos=Wood.shape(piece).getInteriorPoint();down(pos.x,pos.y);drag(pos.x+15,pos.y+5);up();
elements.next.onclick();check(inspect().stageIndex===1,'next');elements.prev.onclick();check(inspect().state.boards.length===3,'stage state preserved');
elements.reset.onclick();check(inspect().state.boards.length===2,'reset');
mode('pencil');down(200,320);move(200,360);keyHandlers[0]({key:'Escape'});check(!inspect().draft && elements.cancel.disabled,'escape cancellation');
// Marks stay attached when a board moves.
down(200,320);move(220,380);down(240,500);check(inspect().state.boards[0].marks.length===1,'second mark');
const original=JSON.stringify(inspect().state.boards[0].marks);mode('move');down(300,400);drag(350,400);up();check(JSON.stringify(inspect().state.boards[0].marks)===original,'local mark preserved');
return {geometry:results,collisions,ruler:'PASS: all four faces, pointer jitter, release, overlapping-edge stock selection, no ruler drawing',ui:'PASS: drag both, stacking, boundary start, constrained preview, bent cut, area, stage state, reset, escape, local marks'};
})()`,c);
console.log(JSON.stringify(result,null,2));
