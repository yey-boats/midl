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
};

export function convert(value: number, fromUnit: string | undefined, toUnit: string | undefined): number {
  if (!fromUnit || !toUnit || fromUnit === toUnit) return value;
  const key = `${fromUnit}->${toUnit}`;
  if (key === "K->C" || key === "K->degC") return value - 273.15;
  const f = FACTORS[key];
  return Number.isFinite(f) ? value * f : value;
}

export function formatValue(
  value: unknown,
  format: Record<string, unknown> | undefined,
  sourceUnit?: string,
): { text: string; numeric?: number } {
  if (typeof value !== "number" || !Number.isFinite(value)) return { text: "--" };
  const toUnit = format?.unit as string | undefined;
  const decimals = typeof format?.decimals === "number" ? (format.decimals as number) : undefined;
  const n = convert(value, sourceUnit, toUnit);
  const body = decimals != null ? n.toFixed(decimals) : String(n);
  return { text: toUnit ? `${body} ${toUnit}` : body, numeric: n };
}
