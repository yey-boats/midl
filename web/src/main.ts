import { validateDocument } from "@yey-boats/midl";
// Smoke import to confirm the alias resolves; real wiring lands in Task 4.
export const ready = typeof validateDocument === "function";
