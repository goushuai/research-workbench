export const PALETTES = [
  { id: "forest", label: "森林绿", light: "#28634b", dark: "#7fcba8" },
  { id: "ocean", label: "海湾蓝", light: "#295fc2", dark: "#8bb8ff" },
  { id: "iris", label: "鸢尾紫", light: "#7043b8", dark: "#c2a3ff" },
  { id: "amber", label: "暖琥珀", light: "#965218", dark: "#efbd79" },
] as const;
export interface Appearance {
  mode: "light" | "dark" | "system";
  palette: (typeof PALETTES)[number]["id"];
}
const STORAGE_KEY = "research-appearance";
const DEFAULT_APPEARANCE: Appearance = { mode: "light", palette: "forest" };
export function parseAppearance(raw: string | null): Appearance {
  try {
    const value = JSON.parse(raw || "null");
    return {
      mode: ["light", "dark", "system"].includes(value?.mode)
        ? value.mode
        : "light",
      palette: PALETTES.some((palette) => palette.id === value?.palette)
        ? value.palette
        : "forest",
    };
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}
export function readAppearance(storage?: Pick<Storage, "getItem">): Appearance {
  try {
    return parseAppearance(
      (storage ?? window.localStorage).getItem(STORAGE_KEY),
    );
  } catch {
    return { ...DEFAULT_APPEARANCE };
  }
}
export function saveAppearance(
  value: Appearance,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    (storage ?? window.localStorage).setItem(
      STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    /* Theme changes still work when browser storage is unavailable. */
  }
}
export function resolveAppearance(value: Appearance, systemDark: boolean) {
  return {
    mode:
      value.mode === "system" ? (systemDark ? "dark" : "light") : value.mode,
    palette: value.palette,
  };
}
export function applyAppearance(value: Appearance, systemDark: boolean) {
  const resolved = resolveAppearance(value, systemDark);
  const root = document.documentElement;
  root.dataset.mode = resolved.mode;
  root.dataset.palette = resolved.palette;
  const palette = PALETTES.find((item) => item.id === resolved.palette)!;
  root.style.setProperty("--theme-accent", palette[resolved.mode]);
}
