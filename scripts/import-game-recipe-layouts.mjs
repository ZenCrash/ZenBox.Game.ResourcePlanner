import fs from 'node:fs';
// Input is javap -c -p / -v -p output from the installed GTNH GregTech jar.
// Only known UIHelper-based frontends are imported; bespoke frontends stay explicit.
const handlers = JSON.parse(fs.readFileSync('lib/nei-handler-order.json', 'utf8')).handlers;
const layouts = {};
const skipped = [];
const integer = line => { const m = line?.match(/iconst_(\d)|(?:bipush|sipush)\s+(\d+)/); return m ? Number(m[1] ?? m[2]) : null; };
function overlayAt(body, args) {
  const ops = [...body.matchAll(/^\s*(\d+): (\w+)([^\r\n]*)/gm)].map(m => ({ pc: +m[1], op: m[2], rest: m[3] }));
  const addresses = new Map(ops.map((op, i) => [op.pc, i]));
  const stack = [];
  for (let i = 0, steps = 0; i < ops.length && steps++ < 100; i++) {
    const { op, rest } = ops[i];
    if (/^iload_\d$/.test(op)) stack.push(args[+op.at(-1)]);
    else if (/^iconst_\d$/.test(op)) stack.push(+op.at(-1));
    else if (op === 'bipush' || op === 'sipush') stack.push(parseInt(rest));
    else if (op === 'aconst_null') stack.push(null);
    else if (op === 'getstatic') {
      const name = rest.match(/GTUITextures.OVERLAY_SLOT_([A-Z_0-9]+):/)?.[1];
      if (!name) throw Error('Unknown overlay field');
      stack.push(name.toLowerCase());
    } else if (op === 'areturn') return stack.pop();
    else if (op === 'goto') i = addresses.get(parseInt(rest)) - 1;
    else if (['ifeq','ifne','if_icmpeq','if_icmpne'].includes(op)) {
      const rhs = stack.pop(), lhs = op.startsWith('if_icmp') ? stack.pop() : 0;
      const equal = lhs === rhs;
      if (op.endsWith('eq') ? equal : !equal) i = addresses.get(parseInt(rest)) - 1;
    } else throw Error('Unsupported overlay instruction: ' + op);
  }
  throw Error('Incomplete overlay');
}
for (const prefix of ['recipe-maps', 'gtpp-recipe-maps']) {
  const code = fs.readFileSync(`data/research/${prefix}-bytecode.txt`, 'utf8');
  const verbose = fs.readFileSync(`data/research/${prefix}-verbose.txt`, 'utf8');
  const boots = {};
  for (const block of verbose.split('BootstrapMethods:')[1].split(/(?=\n  \d+: #)/)) {
    const id = block.match(/^\s*(\d+):/)?.[1];
    boots[id] = { frontend: block.match(/REF_newInvokeSpecial (\S*Frontend)\./)?.[1]?.split('/').at(-1), method: block.match(/REF_invokeStatic [\w/]+\.(lambda\$static\$\d+):/)?.[1] };
  }
  const methods = {};
  for (const block of code.split(/(?=\n  private static )/)) {
    const name = block.match(/ (lambda\$static\$\d+)\(/)?.[1];
    if (name) methods[name] = block.split('  static {};')[0];
  }
  for (const block of code.split('  static {};')[1].split(/(?=\s+\d+: ldc_w?\s+#[0-9]+\s+\/\/ String \S*recipe\.)/)) {
    const id = block.match(/\/\/ String (\S*recipe\.[^\r\n]+)/)?.[1];
    if (!id) continue;
    const lines = block.split(/\r?\n/);
    const ioIndex = lines.findIndex(l => l.includes('.maxIO:'));
    const counts = lines.slice(ioIndex - 4, ioIndex).map(integer);
    const frontendCall = block.match(/InvokeDynamic #(\d+):[^\n]+\n[^\n]*\.frontend:/)?.[1];
    const frontend = frontendCall ? boots[frontendCall]?.frontend : 'RecipeMapFrontend';
    if (counts.length !== 4 || counts.includes(null) || !['RecipeMapFrontend','LargeNEIFrontend','FluidOnlyFrontend'].includes(frontend) || block.includes('.disableRegisterNEI:') || block.includes('.useSpecialSlot:') || block.includes('.useProgressBar:')) {
      skipped.push({id, frontend}); continue;
    }
    const texture = (block.match(/GTUITextures.PROGRESSBAR_([A-Z_]+):.*UITexture/)?.[1] ?? 'ARROW').toLowerCase();
    const definition = { id, frontend, counts: Object.fromEntries(['itemInputs','itemOutputs','fluidInputs','fluidOutputs'].map((k,i)=>[k,counts[i]])), texture, decorations: [], overlays: {} };
    const decoration = lines.findIndex(l => l.includes('.addSpecialTexture:'));
    if (decoration >= 0) {
      const [x,y,width,height] = lines.slice(decoration - 5, decoration - 1).map(integer);
      const symbol = lines[decoration-1].match(/GTUITextures.PROGRESSBAR_([A-Z_]+):/)?.[1]?.toLowerCase();
      if (!symbol || [x,y,width,height].includes(null)) throw Error('Unknown decoration: '+id);
      definition.decorations.push({x,y,width,height,texture:symbol});
    }
    const overlayCall = block.match(/InvokeDynamic #(\d+):[^\n]+\n[^\n]*\.slotOverlays:/)?.[1];
    if (overlayCall) {
      const body = methods[boots[overlayCall]?.method];
      for (const [key,count] of Object.entries(definition.counts)) {
        try { definition.overlays[key] = Array.from({length:count},(_,i)=>overlayAt(body,[i,+key.startsWith('fluid'),+key.endsWith('Outputs'),0])); }
        catch { delete definition.overlays[key]; }
      }
    }
    for (const [name, handler] of Object.entries(handlers)) if (handler === id) layouts[name] = definition;
  }
}
fs.writeFileSync('lib/game-recipe-layouts.json',JSON.stringify({source:'gregtech-5.09.51.482.jar: RecipeMaps, GTPPRecipeMaps, UIHelper, RecipeMapFrontend, LargeNEIFrontend, FluidOnlyFrontend', layouts, skipped},null,2)+'\n');
console.log(`${Object.keys(layouts).length} verified layouts imported`);
console.log(Object.keys(layouts).join(', '));
