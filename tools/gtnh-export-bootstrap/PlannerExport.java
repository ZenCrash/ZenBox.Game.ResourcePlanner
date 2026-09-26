package plannerexport;

import cpw.mods.fml.common.Mod;
import cpw.mods.fml.common.Mod.EventHandler;
import cpw.mods.fml.common.event.FMLInitializationEvent;
import cpw.mods.fml.common.FMLCommonHandler;
import cpw.mods.fml.common.eventhandler.SubscribeEvent;
import cpw.mods.fml.common.gameevent.TickEvent;
import java.io.*;
import java.lang.reflect.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;

/** Development-only exporter. It refuses to run outside the explicitly marked extraction copy. */
@Mod(modid="plannerexport", name="Resource Planner Export Bootstrap", version="1.0", dependencies="after:gtnhdumper")
public class PlannerExport {
    private int ticks, phase;
    private boolean disabled;
    private boolean fluidsOnly;
    private boolean repairsOnly;
    private File output;
    private final Map<String,Object> stacks = new LinkedHashMap<String,Object>();
    private final List<String> errors = new ArrayList<String>();
    private final Set<String> visible = new LinkedHashSet<String>();

    @EventHandler public void init(FMLInitializationEvent event) { FMLCommonHandler.instance().bus().register(this); }
    @SubscribeEvent public void tick(TickEvent.ClientTickEvent event) {
        if (event.phase != TickEvent.Phase.END || disabled || ++ticks < 200) return;
        try {
            Object mc = call(Class.forName("net.minecraft.client.Minecraft"), "func_71410_x|getMinecraft");
            File game = (File)field(mc,"field_71412_D|mcDataDir");
            String canonical = game.getCanonicalPath().replace('\\','/');
            if (!canonical.endsWith("/data/extraction/instance/minecraft") || !new File(game,"planner-export.enabled").isFile()) { disabled=true; return; }
            output = new File(game,"dumps/planner"); output.mkdirs();
            Object world = field(mc,"field_71441_e|theWorld");
            Object player = field(mc,"field_71439_g|thePlayer");
            if (phase == 0) {
                status("creating isolated export world");
                phase=1; ticks=0;
                if (world == null) {
                    Class<?> settings = Class.forName("net.minecraft.world.WorldSettings");
                    Class<?> gameType = Class.forName("net.minecraft.world.WorldSettings$GameType");
                    Class<?> worldType = Class.forName("net.minecraft.world.WorldType");
                    Object creative = null;
                    for (Object e : gameType.getEnumConstants()) if (e.toString().equals("CREATIVE")) creative=e;
                    Object flat = field(worldType,"field_77138_c|FLAT");
                    Object setup = settings.getConstructor(long.class,gameType,boolean.class,boolean.class,worldType).newInstance(12345L,creative,false,false,flat);
                    call(setup,"func_77159_a|enableCommands");
                    call(mc,"func_71371_a|launchIntegratedServer","PlannerExport","Planner export",setup);
                }
                return;
            }
            if (world == null || player == null) return;
            if (phase == 1) {
                File repairFile=new File(game,"planner-export.image-repairs.json");
                if(repairFile.isFile()) {
                    repairsOnly=true;status("loading specific missing image variants");
                    Object gson=Class.forName("com.google.gson.Gson").newInstance();
                    List<?> requests=(List<?>)call(gson,"fromJson",new String(Files.readAllBytes(repairFile.toPath()),StandardCharsets.UTF_8),List.class);
                    for(Object request:requests) {
                        Map<?,?> row=(Map<?,?>)request;String id=String.valueOf(row.get("id"));
                        try {
                            Object registry=field(Class.forName("net.minecraft.item.Item"),"field_150901_e|itemRegistry");
                            Object item=call(registry,"func_82594_a|getObject",row.get("registryId"));
                            int metadata=((Number)row.get("metadata")).intValue();
                            // Wildcards have no unique appearance; render the specified representative.
                            if(metadata==32767)metadata=((Number)row.get("representativeMetadata")).intValue();
                            Object stack=Class.forName("net.minecraft.item.ItemStack").getConstructor(Class.forName("net.minecraft.item.Item"),int.class,int.class).newInstance(item,1,metadata);
                            String nbt=String.valueOf(row.get("nbt"));
                            if(!nbt.isEmpty())call(stack,"func_77982_d|setTagCompound",call(Class.forName("net.minecraft.nbt.JsonToNBT"),"func_150315_a|getTagFromJson",nbt));
                            stacks.put(id,stack);
                        }catch(Throwable error){errors.add("Repair "+id+": "+error);}
                    }
                    phase=4;ticks=0;return;
                }
                if(new File(game,"planner-export.fluids-only").isFile()) {
                    fluidsOnly=true;status("capturing registered fluid display stacks");
                    List<Object> fluidRows=new ArrayList<Object>();
                    Map<?,?> registry=(Map<?,?>)call(Class.forName("net.minecraftforge.fluids.FluidRegistry"),"getRegisteredFluids");
                    for(Object fluid:registry.values()) {
                        String id="fluid:"+call(fluid,"getName");
                        try {
                            Object stack=call(Class.forName("gregtech.api.util.GTUtility"),"getFluidDisplayStack",fluid);
                            if(stack==null)continue;stacks.put(id,stack);
                            Map<String,Object> row=new LinkedHashMap<String,Object>();row.put("id",id);
                            row.put("name",call(stack,"func_82833_r|getDisplayName"));
                            row.put("tooltip",call(Class.forName("com.iouter.gtnhdumper.common.utils.Utils"),"getTooltip",stack));
                            row.put("temperature",call(fluid,"getTemperature"));row.put("density",call(fluid,"getDensity"));
                            row.put("gaseous",call(fluid,"isGaseous"));fluidRows.add(row);
                        }catch(Throwable error){errors.add(id+": "+error);}
                    }
                    write("fluids.json",fluidRows);phase=4;ticks=0;return;
                }
                status("loading NEI item panel"); phase=2; ticks=0;
                Object screen = construct("net.minecraft.client.gui.inventory.GuiInventory",player);
                call(mc,"func_147108_a|displayGuiScreen",screen);
                call(Class.forName("codechicken.nei.ItemList"),"loadItems"); return;
            }
            if (phase == 2) {
                if (!Boolean.TRUE.equals(field(Class.forName("codechicken.nei.ItemList"),"loadFinished"))) return;
                Object panel=field(Class.forName("codechicken.nei.ItemPanels"),"itemPanel");
                Collection<?> panelItems=(Collection<?>)call(panel,"getItems");
                if(panelItems.isEmpty()) return;
                status("capturing NEI visibility and recipe handlers"); phase=3;
                // ItemList already excludes ItemInfo.isHidden stacks. The panel list
                // additionally applies collapsed groups and the current search, so it
                // cannot define which items belong in a searchable offline catalog.
                for(Object stack : (Iterable<?>)field(Class.forName("codechicken.nei.ItemList"),"items")) visible.add(addStack(stack));
                write("visible-items.json",visible);
                Map<Integer,Map<String,Object>> groups=new LinkedHashMap<Integer,Map<String,Object>>();
                Class<?> grouping=Class.forName("codechicken.nei.CollapsibleItems");
                for(Map.Entry<String,Object> entry:stacks.entrySet()) {
                    int index=((Number)call(grouping,"getGroupIndex",entry.getValue())).intValue();
                    if(index<0)continue;
                    Map<String,Object> group=groups.get(index);
                    if(group==null){group=new LinkedHashMap<String,Object>();group.put("id",String.valueOf(index));group.put("name",call(grouping,"getDisplayName",index));group.put("items",new ArrayList<String>());groups.put(index,group);}
                    ((List<String>)group.get("items")).add(entry.getKey());
                }
                Map<String,Object> groupExport=new LinkedHashMap<String,Object>();groupExport.put("groups",groups.values());
                for(String state:Arrays.asList("collapsed","expanded"))groupExport.put(state+"Color",call(call(Class.forName("codechicken.nei.NEIClientConfig"),"getSetting","inventory.collapsibleItems."+state+"Color"),"getHexValue"));
                write("item-groups.json",groupExport);
                if(new File(game,"planner-export.visibility-only").isFile()) {
                    status("visibility export complete: "+visible.size()+" searchable items");
                    disabled=true;call(mc,"func_71400_g|shutdown");return;
                }
                dumpRecipes(); ticks=0; return;
            }
            if (phase == 3) {
                status("exporting item names, NBT and tooltips"); phase=4;
                List<Map<String,Object>> items = new ArrayList<Map<String,Object>>();
                Class<?> utils=Class.forName("com.iouter.gtnhdumper.common.utils.Utils");
                for(Map.Entry<String,Object> entry: stacks.entrySet()) {
                    try {
                        Object stack=entry.getValue(); Map<String,Object> row=new LinkedHashMap<String,Object>();
                        row.put("id",entry.getKey()); row.put("key",call(utils,"getItemKey",stack)); row.put("nbt",call(utils,"getItemNBT",stack));
                        row.put("name",call(stack,"func_82833_r|getDisplayName"));
                        row.put("tooltip",call(utils,"getTooltip",stack)); row.put("hidden",!visible.contains(entry.getKey()));
                        row.put("icon",call(Class.forName("com.iouter.gtnhdumper.common.dumper.ItemIconDumper"),"getIconFileName",stack));
                        items.add(row);
                    } catch(Throwable error) { errors.add("Item "+entry.getKey()+": "+error); }
                }
                write("items.json",items);
                // Limit the icon renderer to precisely the visible panel and recipe-referenced stacks.
                Field all=Class.forName("com.iouter.gtnhdumper.common.utils.AllItemStacks").getDeclaredField("allItemStacks");all.setAccessible(true);all.set(null,new ArrayList<Object>(stacks.values()));
                ticks=0;return;
            }
            if (phase == 4) {
                status("rendering original item icons");phase=5;
                Class<?> dumper=Class.forName("com.iouter.gtnhdumper.common.dumper.ItemIconDumper");
                Object fbo=Class.forName("com.iouter.gtnhdumper.common.utils.FBOHelper").getConstructor(int.class).newInstance(32);
                Object renderer=call(Class.forName("net.minecraft.client.renderer.entity.RenderItem"),"getInstance");
                File icons=new File(game,"dumps/icons");icons.mkdirs();int done=0;
                List<Object> rendered=new ArrayList<Object>();
                for(Map.Entry<String,Object> entry:stacks.entrySet()) {
                    try {
                        String filename=(String)call(dumper,"getIconFileName",entry.getValue());
                        java.awt.image.BufferedImage img=(java.awt.image.BufferedImage)call(dumper,"renderItem",entry.getValue(),fbo,renderer,1f,null);
                        javax.imageio.ImageIO.write(img,"png",new File(icons,filename));
                        call(fbo,"restoreTexture");rendered.add(Arrays.asList(entry.getKey(),filename,32,1));
                    } catch(Throwable error){errors.add("Icon "+entry.getKey()+": "+error);}
                    if(++done%1000==0) { status("rendered "+done+" / "+stacks.size()+" item icons");write(repairsOnly?"repair-errors.json":fluidsOnly?"fluid-errors.json":"errors.json",errors); }
                }
                write(repairsOnly?"repair-icons.json":fluidsOnly?"fluid-icons.json":"icons.json",rendered);ticks=0;return;
            }
            if (phase == 5) {
                write(repairsOnly?"repair-errors.json":fluidsOnly?"fluid-errors.json":"errors.json",errors);status("finished; validation required");disabled=true;
                call(mc,"func_71400_g|shutdown");
            }
        } catch(Throwable error) {
            errors.add(error.toString());error.printStackTrace(); disabled=true;
            try { write(repairsOnly?"repair-errors.json":fluidsOnly?"fluid-errors.json":"errors.json",errors);status("failed: "+error); } catch(Throwable ignored) {}
        }
    }

    private String addStack(Object stack) throws Exception {
        if(stack==null)return null;
        String key=String.valueOf(call(Class.forName("com.iouter.gtnhdumper.common.utils.Utils"),"getItemStackShortKey",stack));
        if(!stacks.containsKey(key))stacks.put(key,stack);return key;
    }
    private Map<String,Object> item(Object stack) throws Exception {
        if(stack==null)return null;
        Map<String,Object> value=new LinkedHashMap<String,Object>();value.put("id",addStack(stack));
        value.put("amount",field(stack,"field_77994_a|stackSize"));return value;
    }
    private List<Object> itemArray(Object array, Object recipe, boolean outputSide) throws Exception {
        List<Object> values=new ArrayList<Object>();if(array==null)return values;
        for(int i=0;i<Array.getLength(array);i++){ Object stack=Array.get(array,i);if(stack==null)continue;
            Map<String,Object> value=item(stack); value.put("slot",i);
            if(outputSide)value.put("chance",call(recipe,"getOutputChance",i));values.add(value);
        }return values;
    }
    private List<Object> fluids(Object array) throws Exception {
        List<Object> values=new ArrayList<Object>();if(array==null)return values;
        for(int i=0;i<Array.getLength(array);i++) {Object fluidStack=Array.get(array,i);if(fluidStack==null)continue;
            Object fluid=call(fluidStack,"getFluid");Map<String,Object> value=new LinkedHashMap<String,Object>();
            value.put("id","fluid:"+call(fluid,"getName"));value.put("name",call(fluid,"getLocalizedName",fluidStack));value.put("amount",field(fluidStack,"amount"));value.put("slot",i);values.add(value);
        }return values;
    }
    private List<Object> positioned(Object raw) throws Exception {
        List<Object> result=new ArrayList<Object>(); if(raw==null)return result;
        Iterable<?> list=raw instanceof Iterable ? (Iterable<?>)raw : Collections.singletonList(raw);
        for(Object positioned:list){if(positioned==null)continue;Map<String,Object> value=item(field(positioned,"item")); if(value==null)continue;
            value.put("x",field(positioned,"relx"));value.put("y",field(positioned,"rely"));List<Object> alternatives=new ArrayList<Object>();
            Object a=field(positioned,"items");for(int j=0;j<Array.getLength(a);j++) alternatives.add(item(Array.get(a,j)));value.put("alternatives",alternatives);result.add(value);
        }return result;
    }
    private void dumpRecipes() throws Exception {
        List<Object> handlers=new ArrayList<Object>();Class<?> gt=Class.forName("gregtech.nei.GTNEIDefaultHandler");
        for(Object handler:(Iterable<?>)field(Class.forName("codechicken.nei.recipe.GuiUsageRecipe"),"usagehandlers")) {
            String name=String.valueOf(call(handler,"getRecipeName"));Map<String,Object> h=new LinkedHashMap<String,Object>();h.put("name",name);h.put("source",call(handler,"getHandlerId"));
            List<Object> recipes=new ArrayList<Object>();h.put("recipes",recipes);handlers.add(h);
            try {
                h.put("overlay",call(handler,"getOverlayIdentifier"));
                if(gt.isInstance(handler)) {
                    h.put("kind","gregtech");Object map=call(handler,"getRecipeMap"),backend=call(map,"getBackend");Object category=field(handler,"recipeCategory");
                    h.put("amperage",field(call(call(map,"getFrontend"),"getUIProperties"),"amperage"));
                    Object ui=call(call(map,"getFrontend"),"getUIProperties");Map<String,Object> slotCounts=new LinkedHashMap<String,Object>();
                    String[] slotKeys={"itemInputs","itemOutputs","fluidInputs","fluidOutputs"};String[] slotFields={"maxItemInputs","maxItemOutputs","maxFluidInputs","maxFluidOutputs"};
                    for(int s=0;s<slotKeys.length;s++)slotCounts.put(slotKeys[s],field(ui,slotFields[s]));h.put("slotCounts",slotCounts);
                    for(Object recipe:(Iterable<?>)call(backend,"getAllRecipes")) {
                        if(call(recipe,"getRecipeCategory")!=category)continue;
                        Map<String,Object> r=new LinkedHashMap<String,Object>();r.put("hidden",field(recipe,"mHidden"));r.put("enabled",field(recipe,"mEnabled"));
                        r.put("durationTicks",field(recipe,"mDuration"));r.put("euPerTick",field(recipe,"mEUt"));r.put("specialValue",field(recipe,"mSpecialValue"));
                        r.put("inputs",itemArray(field(recipe,"mInputs"),recipe,false));r.put("outputs",itemArray(field(recipe,"mOutputs"),recipe,true));
                        r.put("fluidInputs",fluids(field(recipe,"mFluidInputs")));r.put("fluidOutputs",fluids(field(recipe,"mFluidOutputs")));recipes.add(r);
                    }
                } else {
                    h.put("kind","nei");Object overlay=h.get("overlay");
                    if(overlay==null)throw new IllegalStateException("No general recipe enumeration interface");
                    call(handler,"loadCraftingRecipes",overlay,new Object[0]);
                    int count=((Number)call(handler,"numRecipes")).intValue();
                    for(int i=0;i<count;i++){Map<String,Object> r=new LinkedHashMap<String,Object>();r.put("inputs",positioned(call(handler,"getIngredientStacks",i)));r.put("outputs",positioned(call(handler,"getResultStack",i)));try{r.put("other",positioned(call(handler,"getOtherStacks",i)));}catch(Throwable error){r.put("otherError",error.toString());}recipes.add(r);}
                }
            } catch(Throwable error){h.put("error",error.toString());errors.add("Handler "+name+": "+error);}
        }
        write("recipes.json",handlers);
    }
    private void status(String message) throws Exception {System.out.println("[PLANNER EXPORT] "+message);Files.write(new File(output,"status.txt").toPath(),(new Date()+" "+message).getBytes(StandardCharsets.UTF_8));}
    private void write(String name,Object value) throws Exception {if(output==null)return;Object gson=field(Class.forName("com.iouter.gtnhdumper.GTNHDumper"),"GSON");try(Writer writer=new BufferedWriter(new OutputStreamWriter(new FileOutputStream(new File(output,name)),StandardCharsets.UTF_8))){call(gson,"toJson",value,writer);}}
    private static Object field(Object target,String aliases) throws Exception {
        Class<?> type=target instanceof Class ? (Class<?>)target : target.getClass();
        for(Class<?> c=type;c!=null;c=c.getSuperclass())for(String name:aliases.split("\\|")){try{Field f=c.getDeclaredField(name);f.setAccessible(true);return f.get(target instanceof Class ? null:target);}catch(NoSuchFieldException ignored){}}
        throw new NoSuchFieldException(type+"."+aliases);
    }
    private static Object construct(String name,Object argument) throws Exception {for(Constructor<?> c:Class.forName(name).getConstructors())if(c.getParameterTypes().length==1 && c.getParameterTypes()[0].isInstance(argument))return c.newInstance(argument);throw new NoSuchMethodException(name);}
    private static Object call(Object target,String aliases,Object...arguments) throws Exception {
        Class<?> type=target instanceof Class ? (Class<?>)target:target.getClass();
        for(String name:aliases.split("\\|"))for(Method m:type.getMethods()) {
            if(!m.getName().equals(name)||m.getParameterTypes().length!=arguments.length)continue;
            try{m.setAccessible(true);return m.invoke(target instanceof Class ? null:target,arguments);}catch(IllegalArgumentException ignored){}catch(InvocationTargetException e){throw new RuntimeException(type.getName()+"."+name,e.getCause());}
        }throw new NoSuchMethodException(type.getName()+"."+aliases);
    }
}
