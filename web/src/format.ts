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
  const body = decimals != null ? n.toFixed(decimals) : String(n);
  return { text: toUnit ? `${body} ${toUnit}` : body, numeric: n };
}
