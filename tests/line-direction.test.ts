import { test } from "node:test";
import assert from "node:assert/strict";
import { lineDirectionMarkers as staticMarkers, animatedDirectionMarkers, synchronizedArrowPhases, ARROW_SPACING } from "../lib/line-direction";

test("arrows carry remaining spacing through every turn direction and clock wrap", () => {
  for (const sx of [-1,1]) for (const sy of [-1,1]) {
    const points = [{x:0,y:0},{x:sx*112,y:0},{x:sx*112,y:sy*300},{x:sx*112,y:sy*300},{x:sx*612,y:sy*300}];
    const first = animatedDirectionMarkers(points,0);
    assert.equal(Math.abs(first[0].x),80);
    assert.equal(Math.abs(first[1].y),128); // 32 before the corner, 128 after it.
    for (const time of [0,1,3.32,3.34,6.66,7,1000]) {
      const markers=animatedDirectionMarkers(points,time);
      const distances=markers.map(m=>m.y===0?Math.abs(m.x):m.x===sx*112?112+Math.abs(m.y):412+Math.abs(m.x-sx*112));
      for(let i=1;i<distances.length;i++) assert(Math.abs(distances[i]-distances[i-1]-ARROW_SPACING)<1e-7);
    }
    assert.deepEqual(first.map(({opacity,...m})=>m),staticMarkers(points));
  }
});
test("arrows move toward their target and only fade at route endpoints", () => {
  for(const sign of [-1,1]) for(const vertical of [false,true]) {
    const points=[{x:0,y:0},vertical?{x:0,y:sign*700}:{x:sign*700,y:0}];
    const a=animatedDirectionMarkers(points,1),b=animatedDirectionMarkers(points,1.1);
    const axis=vertical?'y':'x';
    assert(Math.abs(b[0][axis]-a[0][axis]-sign*2.4)<1e-8);
    assert(a.every(m=>m.opacity>=0&&m.opacity<=1));
  }
  assert.deepEqual(animatedDirectionMarkers([],0),[]);
  assert.deepEqual(animatedDirectionMarkers([{x:0,y:0},{x:0,y:0}],0),[]);
});

test("static arrows restore centered short routes and continuous spacing around corners", () => {
  assert.deepEqual(staticMarkers([{x:0,y:0},{x:400,y:0}]), [{x:80,y:0,angle:0},{x:240,y:0,angle:0}]);
  assert.deepEqual(staticMarkers([{x:100,y:0},{x:0,y:0}]), [{x:50,y:0,angle:180}]);
  assert.deepEqual(staticMarkers([{x:0,y:0},{x:155,y:0},{x:155,y:-250}]), [{x:80,y:0,angle:0},{x:155,y:-85,angle:-90},{x:155,y:-245,angle:-90}]);
});


test("overlapping routes synchronize through a chain while retaining corner spacing", () => {
  const routes = [
    { id: 'a', points: [{x:0,y:0},{x:400,y:0},{x:400,y:600}] },
    { id: 'b', points: [{x:100,y:-110},{x:100,y:0},{x:400,y:0},{x:400,y:600}] },
    { id: 'c', points: [{x:200,y:200},{x:400,y:200},{x:400,y:600}] },
  ];
  const phases = synchronizedArrowPhases(routes, () => routes.map(r=>r.id));
  for (const time of [0, 0.2, 4, 7, 100]) {
    const markers = routes.map(r => animatedDirectionMarkers(r.points, time, phases.get(r.id)));
    const shared = markers.map(ms=>ms.filter(m=>m.x===400 && m.y>220 && m.y<580).map(m=>Math.round(m.y*1e6)));
    assert.deepEqual(shared[0],shared[1]);
    assert.deepEqual(shared[1],shared[2]);
    const distances = markers[1].map(m=>m.y<0?m.y+110:m.y===0?110+m.x-100:410+m.y);
    for(let i=1;i<distances.length;i++) assert(Math.abs(distances[i]-distances[i-1]-ARROW_SPACING)<1e-7);
  }
  for (const route of routes) assert.deepEqual(staticMarkers(route.points, phases.get(route.id)), animatedDirectionMarkers(route.points,0,phases.get(route.id)).map(({opacity,...marker})=>marker));
});

test("crossings and opposite directions do not shift isolated arrow phases", () => {
  const routes = [
    {id:'a',points:[{x:0,y:0},{x:400,y:0}]},
    {id:'b',points:[{x:100,y:-200},{x:100,y:200}]},
    {id:'c',points:[{x:300,y:0},{x:0,y:0}]},
  ];
  const phases=synchronizedArrowPhases(routes,()=>routes.map(r=>r.id));
  assert.deepEqual([...phases.values()],[80,80,80]);
});

test("custom item spacing stays continuous around bends and synchronized on shared segments", () => {
  const routes = [
    { id: "a", points: [{ x: 0, y: 0 }, { x: 115, y: 0 }, { x: 115, y: 1200 }] },
    { id: "b", points: [{ x: 115, y: -100 }, { x: 115, y: 1200 }] },
  ];
  for (const spacing of [40, 100, 240, 480]) {
    const phases = synchronizedArrowPhases(routes, () => routes.map(r => r.id), spacing);
    for (const seconds of [0, 1, 10]) {
      const markers = routes.map(r => animatedDirectionMarkers(r.points, seconds, phases.get(r.id), spacing));
      const distances = markers[0].map(m => m.y === 0 ? m.x : 115 + m.y);
      for (let i = 1; i < distances.length; i++) assert.ok(Math.abs(distances[i] - distances[i - 1] - spacing) < 1e-7);
      const shared = markers.map(ms => ms.filter(m => m.y > 10 && m.y < 1190).map(m => Math.round(m.y * 1e6)));
      assert.deepEqual(shared[0], shared[1]);
    }
  }
});
