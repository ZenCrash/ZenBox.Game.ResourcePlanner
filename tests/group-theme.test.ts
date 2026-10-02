import { resolvedGroupTheme } from "../lib/group-theme";
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupThemes, groupTheme, groupThemeStyle } from "../lib/group-theme";
import { blankDiagram, diagramSchema } from "../lib/model";

test("sixteen unique group themes retain the existing blue default", () => {
  assert.equal(groupThemes.length,16);
  assert.equal(new Set(groupThemes.map(theme => theme.id)).size,16);
  assert.equal(groupTheme().header,"#153959");
  assert.equal(groupTheme().border,"#488bc3");
  assert.equal(groupTheme().sidebar,"#121b29");
  for(const theme of groupThemes) {
    assert.match(groupTheme(theme.id).border,/^#[0-9a-f]{6}$/i);
    assert.equal((groupThemeStyle(theme.id) as Record<string,string>)["--area-border"],groupTheme(theme.id).border);
  }
});

test("each group's theme survives save/load independently; older groups remain blue", () => {
  const area={id:'20b7107f-48de-4d35-b9c2-e2b7733aed67',position:{x:0,y:0},width:640,height:480};
  const doc=diagramSchema.parse({...blankDiagram(),areas:[{...area,theme:'red'},{...area,id:'075b5e6a-a965-4e0a-af63-b5a561f5807c'}]});
  const loaded=diagramSchema.parse(JSON.parse(JSON.stringify(doc)));
  assert.equal(loaded.areas?.[0].theme,'red');
  assert.equal(groupTheme(loaded.areas?.[1].theme).id,'blue');
  assert.throws(()=>diagramSchema.parse({...blankDiagram(),areas:[{...area,theme:'invalid'}]}));
});


test("transparent replaces dark gray and removes group fills", () => {
  assert.equal(groupThemes[0].id,"transparent");
  assert(!groupThemes.some(theme => String(theme.id) === "dark-gray"));
  const style=groupThemeStyle("transparent") as Record<string,string>;
  assert.equal(style["--area-header"],"transparent");
  assert.equal(style["--area-body"],"transparent");
  assert.equal(style["--group-body"],"transparent");
});

test("default groups follow the interface while custom colors stay independent", () => {
  assert.equal(resolvedGroupTheme(undefined, "red"), "blue");
  assert.equal(resolvedGroupTheme("blue", "dark-green"), "blue");
  assert.equal(resolvedGroupTheme("default", "red"), "red");
  assert.equal(resolvedGroupTheme("gold", "red"), "gold");
  assert.equal(resolvedGroupTheme("transparent", "red"), "transparent");
});

test("explicit group default persists separately from blue", () => {
  const area = { id: "20b7107f-48de-4d35-b9c2-e2b7733aed67", position: { x: 0, y: 0 }, width: 640, height: 480, theme: "default" };
  const doc = diagramSchema.parse({ ...blankDiagram(), areas: [area] });
  assert.equal(diagramSchema.parse(JSON.parse(JSON.stringify(doc))).areas?.[0].theme, "default");
  assert.equal(resolvedGroupTheme("blue", "red"), "blue");
  assert.equal(resolvedGroupTheme("blue", "blue"), "blue");
});
