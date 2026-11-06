import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseAppearance,
  resolveAppearance,
  saveAppearance,
  readAppearance,
  PALETTES,
} from "../src/client/theme.js";
test("appearance accepts light dark and system modes and all provided palettes", () => {
  for (const palette of PALETTES)
    for (const mode of ["light", "dark", "system"]) {
      assert.deepEqual(
        parseAppearance(JSON.stringify({ mode, palette: palette.id })),
        { mode, palette: palette.id },
      );
    }
  assert.equal(
    resolveAppearance({ mode: "system", palette: "ocean" }, true).mode,
    "dark",
  );
  assert.equal(
    resolveAppearance({ mode: "system", palette: "ocean" }, false).mode,
    "light",
  );
  assert.equal(
    resolveAppearance({ mode: "light", palette: "ocean" }, true).mode,
    "light",
  );
});
test("appearance survives reload and invalid browser data safely falls back", () => {
  let value: string | null = null;
  const storage = {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
  const preference = { mode: "dark", palette: "iris" } as const;
  saveAppearance(preference, storage);
  assert.deepEqual(readAppearance(storage), preference);
  for (const raw of ["{", "null", '{"mode":"bad","palette":"bad"}'])
    assert.deepEqual(parseAppearance(raw), {
      mode: "light",
      palette: "forest",
    });
  assert.doesNotThrow(() =>
    saveAppearance(preference, {
      setItem: () => {
        throw new Error("disabled");
      },
    }),
  );
});
