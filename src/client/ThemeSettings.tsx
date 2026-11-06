import { Sun, Moon, Monitor, Check } from "lucide-react";
import { PALETTES, type Appearance } from "./theme.js";
export function ThemeSettings({
  value,
  change,
}: {
  value: Appearance;
  change: (value: Appearance) => void;
}) {
  return (
    <section
      className="settings-panel appearance-panel"
      aria-label="主题与配色"
    >
      <div className="section-heading">
        <span className="document-icon">
          <Sun size={20} />
        </span>
        <div>
          <h2>主题与配色</h2>
          <p>选择明暗模式和主题色，设置自动保存在当前浏览器。</p>
        </div>
      </div>
      <div className="appearance-options">
        <div>
          <h3>显示模式</h3>
          <div className="theme-mode-options">
            {(
              [
                ["light", "浅色", Sun],
                ["dark", "深色", Moon],
                ["system", "跟随系统", Monitor],
              ] as const
            ).map(([mode, label, Icon]) => (
              <button
                type="button"
                key={mode}
                aria-pressed={value.mode === mode}
                className={
                  value.mode === mode ? "theme-choice selected" : "theme-choice"
                }
                onClick={() => change({ ...value, mode })}
              >
                <Icon size={17} />
                {label}
                {value.mode === mode && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <h3>主题配色</h3>
          <div className="theme-palette-options">
            {PALETTES.map((palette) => (
              <button
                type="button"
                key={palette.id}
                className={
                  value.palette === palette.id
                    ? "theme-choice selected"
                    : "theme-choice"
                }
                aria-pressed={value.palette === palette.id}
                onClick={() => change({ ...value, palette: palette.id })}
              >
                <span
                  className="theme-swatch"
                  style={{ background: palette.light }}
                />
                {palette.label}
                {value.palette === palette.id && <Check size={14} />}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
