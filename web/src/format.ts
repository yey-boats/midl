// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Copyright (c) 2026 Yey Boats Project. See LICENSE and COMMERCIAL.md.

// SI -> display factor (multiply SI by factor). Keyed "from->to".
const FACTORS: Record<string, number> = {
  "m/s->kn": 1.943844492,
  "m/s->km/h": 3.6,
  "rad->deg": 180 / Math.PI,
  "K->C": Number.NaN,     // offset, handled below
  "K->degC": Number.NaN,  // alias, handled below
  "ratio->%": 100,
  "m->ft": 3.280839895,
  "m->nm": 1 / 1852,
  "m->km": 1 / 1000,
  "s->h": 1 / 3600,
  "s->min": 1 / 60,
  "Hz->rpm": 60,        // engine revolutions: rev/s -> rev/min
  "Pa->bar": 1e-5,      // pressure: pascals -> bar
  "Pa->kPa": 1e-3,
  "Pa->hPa": 1e-2,      // pressure: pascals -> hectopascals (standard weather display)
};

/**
 * Normalize a temperature unit string so that "°C", "degC", "C" all map to
 * the canonical "C", and "°F", "degF", "F" all map to "F".
 * Other units are returned unchanged.
 */
function normTempUnit(u: string): string {
  // Strip leading degree sign (° U+00B0 or ˚ U+02DA) then lower-case "deg" prefix.
  const stripped = u.replace(/^[°˚]/, "").replace(/^deg/i, "");
  if (stripped === "C" || stripped === "c") return "C";
  if (stripped === "F" || stripped === "f") return "F";
  return u; // not a temperature unit — leave as-is
}

// Display symbols for unit *tokens* that a MIDL document authors as words.
// Conversion keys (see FACTORS) keep the word form (e.g. "rad->deg"); only the
// human-facing label is mapped, so "deg" shows as "°" instead of the text "deg".
const UNIT_SYMBOL: Record<string, string> = {
  deg: "°",
  degC: "°C",
  degF: "°F",
};

/**
 * Map a unit token to the symbol shown to the user. Angular/temperature word
 * tokens ("deg", "degC", "degF") become their glyphs; every other unit —
 * including units already written as glyphs ("°C") — is returned unchanged.
 */
export function unitLabel(u: string | undefined): string {
  if (!u) return "";
  return UNIT_SYMBOL[u] ?? u;
}

/** Separator between number and unit, as the firmware prints it
 *  (ui_layouts.cpp): "%" and "°"-led units are glued ("241°", "82%", "21°C"),
 *  word units get a space ("6.2 kn"). */
export function unitSep(label: string): string {
  return /^[%°]/.test(label) ? "" : " ";
}

export function convert(value: number, fromUnit: string | undefined, toUnit: string | undefined): number {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return value;
  // Normalize temperature units before building the lookup key so that
  // "°C", "degC", "C" all resolve to the same conversion, and likewise "°F".
  const normTo = normTempUnit(toUnit);
  const key = `${fromUnit}->${normTo}`;
  if (key === "K->C") return value - 273.15;
  if (key === "K->F") return (value - 273.15) * 9 / 5 + 32;
  const f = FACTORS[key];
  return Number.isFinite(f) ? value * f : value;
}

export function formatValue(
  value: unknown,
  format: Record<string, unknown> | undefined,
  sourceUnit?: string,
): { text: string; numeric?: number } {
  // Position-like object: {latitude, longitude} or {lat, lng}
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const v = value as Record<string, unknown>;
    const lat = typeof v["latitude"] === "number" ? v["latitude"] :
                typeof v["lat"] === "number" ? v["lat"] : undefined;
    const lng = typeof v["longitude"] === "number" ? v["longitude"] :
                typeof v["lng"] === "number" ? v["lng"] : undefined;
    if (lat !== undefined && lng !== undefined) {
      const decimals = typeof format?.decimals === "number" ? (format.decimals as number) : 6;
      return { text: `${lat.toFixed(decimals)}, ${lng.toFixed(decimals)}` };
    }
  }

  if (typeof value !== "number" || !Number.isFinite(value)) return { text: "--" };
  const toUnit = format?.unit as string | undefined;
  const decimals = typeof format?.decimals === "number" ? (format.decimals as number) : undefined;
  const n = convert(value, sourceUnit, toUnit);
  // No format.decimals: whole numbers print as they are; anything else gets one
  // decimal, the firmware's default for path bindings (ui_layouts.cpp "%.1f").
  // String(n) printed the raw float of a unit conversion, e.g. VMG 3.3 m/s as
  // "6.414686823599999 kn" and coolant 350 K as "76.85000000000002 °C".
  const body = decimals != null ? n.toFixed(decimals) : Number.isInteger(n) ? String(n) : n.toFixed(1);
  return { text: toUnit ? `${body}${unitSep(unitLabel(toUnit))}${unitLabel(toUnit)}` : body, numeric: n };
}
