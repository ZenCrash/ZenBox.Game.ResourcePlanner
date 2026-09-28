"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { defaultDisplaySettings, displaySettingsKey, parseDisplaySettings, type DisplaySettings } from "@/lib/display-settings";

const SettingsContext = createContext({
  settings: defaultDisplaySettings,
  update: (_patch: Partial<DisplaySettings>) => {},
});
export const useDisplaySettings = () => useContext(SettingsContext);

export function DisplaySettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(defaultDisplaySettings);
  useEffect(() => {
    try { setSettings(parseDisplaySettings(JSON.parse(sessionStorage.getItem(displaySettingsKey) ?? "null"))); } catch {}
  }, []);
  const update = (patch: Partial<DisplaySettings>) => {
    const next = parseDisplaySettings({ ...settings, ...patch });
    setSettings(next);
    try { sessionStorage.setItem(displaySettingsKey, JSON.stringify(next)); } catch {}
  };
  return <SettingsContext.Provider value={{ settings, update }}>{children}</SettingsContext.Provider>;
}

export function DisplaySettingsPanel() {
  const { settings, update } = useDisplaySettings();
  return <section className="display-settings" aria-label="Display settings">
    <h2>Settings</h2>
    <label className="settings-range">
      <span>Zoomed-out view below <output>{Math.round(settings.overviewZoom * 100)}%</output></span>
      <input type="range" min="0" max="100" step="5" value={Math.round(settings.overviewZoom * 100)} onChange={(event) => update({ overviewZoom: Number(event.target.value) / 100 })} />
    </label>
    {([
      ["showItemIds", "Show item IDs in tooltips"],
      ["overviewLineItems", "Show line items when zoomed out"],
      ["detailLineItems", "Show line item cards when zoomed in"],
      ["crossingBridges", "Show shadows where lines cross"],
      ["disableArrows", "Disable arrows"],
      ["animatedArrows", "Animated arrows"],
    ] as const).map(([key, label]) => <label className="settings-switch-row" key={key}>
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={settings[key]} disabled={key === "animatedArrows" && settings.disableArrows} onChange={(event) => update({ [key]: event.target.checked })} />
    </label>)}
    <label className="settings-range">
      <span>Line thickness <output>{settings.lineThickness}</output></span>
      <input type="range" min="2" max="12" step="1" value={settings.lineThickness} onChange={(event) => update({ lineThickness: Number(event.target.value) })} />
    </label>
    <label className="settings-range">
      <span>GUI size <output>{Math.round(settings.guiScale * 100)}%</output></span>
      <input type="range" min="80" max="150" step="10" value={Math.round(settings.guiScale * 100)} onChange={(event) => update({ guiScale: Number(event.target.value) / 100 })} />
    </label>
    <button type="button" onClick={() => update(defaultDisplaySettings)}>
      <RotateCcw size={16} aria-hidden="true" /> Reset settings
    </button>
  </section>;
}
