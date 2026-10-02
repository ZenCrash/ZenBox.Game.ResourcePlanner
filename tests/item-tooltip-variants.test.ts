import { test } from 'node:test';
import assert from 'node:assert/strict';
import { itemTooltipLines, tooltipModifierMask } from '../lib/item-tooltip-variants';
test('tooltip modifiers preserve combinations and return to the normal tooltip on release',()=>{
 const normal=JSON.stringify(['Centrifuge','Hold Shift']);const variants={'1':['Centrifuge','   §fController: §7Front Center'],'3':['Centrifuge','Combined information']};
 assert.deepEqual(itemTooltipLines(normal,'Centrifuge',variants,1),['   §fController: §7Front Center']);
 assert.deepEqual(itemTooltipLines(normal,'Centrifuge',variants,3),['Combined information']);
 assert.deepEqual(itemTooltipLines(normal,'Centrifuge',variants,0),['Hold Shift']);
 assert.deepEqual(itemTooltipLines(normal,'Centrifuge',variants,4),['Hold Shift']);
 assert.equal(tooltipModifierMask({shiftKey:true,ctrlKey:true,altKey:true}),7);
 assert.equal(tooltipModifierMask({shiftKey:false,ctrlKey:false,altKey:false}),0);
});
test('old packs and malformed normal tooltips remain usable',()=>{
 assert.deepEqual(itemTooltipLines('broken','Item'),[]);
 assert.deepEqual(itemTooltipLines('["§aItem",12,"Information"]','Item'),['Information']);
});
