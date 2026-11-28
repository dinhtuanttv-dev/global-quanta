// Kiểu cho scripts/ui-lint.mjs (dùng trong kiểm thử vitest).
export interface UiRule { id: string; vi: string; re: RegExp }
export const UI_RULES: UiRule[];
export function lintText(text: string): Record<string, number>;
export function scanUi(srcDir?: string): { totals: Record<string, number>; files: { file: string; counts: Record<string, number>; total: number }[] };
export function overBudget(totals: Record<string, number>, budget: Record<string, number>): { id: string; vi: string; now: number; budget: number }[];
