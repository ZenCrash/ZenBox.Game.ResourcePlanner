import { test } from "node:test";
import assert from "node:assert/strict";
import { groupHierarchy, GroupHierarchyCache, reorderSiblingGroups } from "../lib/group-hierarchy";
const group = (id:string,x:number,y:number,width:number,height:number) => ({id,position:{x,y},width,height});

test("nested groups choose the closest parent and paint parents behind children", () => {
 const tree=groupHierarchy([group('leaf',20,20,20,20),group('outer',0,0,100,100),group('inner',10,10,60,60)]);
 assert.deepEqual(tree.roots,['outer']);
 assert.equal(tree.parent.get('leaf'),'inner');
 assert.deepEqual(tree.children.get('outer'),['inner']);
 assert.deepEqual(tree.children.get('inner'),['leaf']);
 assert.deepEqual(tree.children.get('leaf'),[]);
 assert(tree.depth.get('outer')! < tree.depth.get('inner')!);
 assert(tree.depth.get('inner')! < tree.depth.get('leaf')!);
});
test("partial overlaps and equal rectangles remain peers without cycles", () => {
 const tree=groupHierarchy([group('a',0,0,100,100),group('b',0,0,100,100),group('c',90,90,30,30)]);
 assert.deepEqual(tree.roots,['a','b','c']);
});
test("moving a child out restores the former parent to a leaf", () => {
 const parent=group('parent',0,0,100,100),child=group('child',10,10,20,20);
 assert.equal(groupHierarchy([parent,child]).children.get('parent')!.length,1);
 assert.deepEqual(groupHierarchy([parent,{...child,position:{x:200,y:0}}]).children.get('parent'),[]);
});
test("multiple children appear only under their immediate parent", () => {
 const tree=groupHierarchy([group('parent',0,0,100,100),group('a',10,10,20,20),group('b',40,40,20,20)]);
 assert.deepEqual(tree.children.get('parent'),['a','b']);
 assert.equal(tree.parent.size,2);
});


test("hierarchy freezes during resize and move, then updates on release", () => {
 const cache=new GroupHierarchyCache();
 const initial=[group('outer',0,0,100,100),group('child',150,10,20,20)];
 const before=cache.get(initial);
 const resized=[{...initial[0],width:200},initial[1]];
 assert.equal(cache.get(resized,true),before);
 assert.deepEqual(before.roots,['outer','child']);
 const after=cache.get(resized,false);
 assert.deepEqual(after.roots,['outer']);
 const moved=[{...resized[0],position:{x:400,y:0}},initial[1]];
 assert.equal(cache.get(moved,true),after);
 assert.deepEqual(cache.get(moved,false).roots,['outer','child']);
 assert.equal(cache.get(moved),cache.get(moved));
});


test("reordering groups stays within siblings and preserves other node slots", () => {
 const nodes=[{...group('parent',0,0,100,100),type:'summary'},
 {...group('a',10,10,20,20),type:'summary'},
 {...group('recipe',0,0,1,1),type:'recipe'},
 {...group('b',40,40,20,20),type:'summary'},
 {...group('root',200,0,100,100),type:'summary'}];
 const reordered=reorderSiblingGroups(nodes,'b','a');
 assert.deepEqual(reordered.map(n=>n.id),['parent','b','recipe','a','root']);
 assert.equal(reorderSiblingGroups(nodes,'b','root'),nodes);
 assert.equal(reorderSiblingGroups(nodes,'parent','a'),nodes);
 assert.deepEqual(reorderSiblingGroups(nodes,'parent','root',true).map(n=>n.id),['root','a','recipe','b','parent']);
 assert.equal(reorderSiblingGroups(nodes,'a','a'),nodes);
});
