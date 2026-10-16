/**
 * world-view.ts — pure view-model logic for the world tab (no React): matrix view, bar geometry,
 * formatting, and the light/dark design tokens with a WCAG contrast helper.
 */
import { fmtNum } from './macro-filter';
import type { EvidenceTier } from './world-types';

// ───────────────────────────── Tokens ─────────────────────────────

export type ThemeName = 'light' | 'dark';

export const WORLD_THEME: Record<ThemeName, Record<string, string>> = {
  light: { ground: '#E8ECF0', panel: '#FBFCFD', surface: '#FFFFFF', track: '#E8ECF0', ink: '#16202B', ink2: '#4A5663', ink3: '#5F6B77', rule: '#D5DBE1', accent: '#12345B', accentHover: '#0A2240', onAccent: '#FFFFFF', accentSoft: '#9DB0C7', dot: '#9DA7B1', ramp2: '#3E618F', ramp3: '#6F8FB8', ramp4: '#A9BDD6', warnbg: '#FFF4DC', warnborder: '#D9B86A', warntext: '#6B4710', warnmark: '#B7791F', up3: '#0B7A44', up3fg: '#FFFFFF', up2: '#5FB98A', up2fg: '#16202B', up1: '#CBEBD9', up1fg: '#16202B', down3: '#B83227', down3fg: '#FFFFFF', down2: '#E58A80', down2fg: '#16202B', down1: '#F6D3CF', down1fg: '#16202B', upci: '#9ED2B6', downci: '#EDADA6', uptext: '#0B6B3B', downtext: '#A32A20' },
  dark: { ground: '#0F1620', panel: '#151E2B', surface: '#1B2636', track: '#243245', ink: '#E6ECF2', ink2: '#B3BEC9', ink3: '#8E9AA7', rule: '#2A3646', accent: '#8DB4F0', accentHover: '#B5CFF7', onAccent: '#0F1620', accentSoft: '#4F6A8F', dot: '#6C7A8A', ramp2: '#6F97D3', ramp3: '#4F76B0', ramp4: '#38577F', warnbg: '#3A2D10', warnborder: '#8A6A25', warntext: '#F0D8A0', warnmark: '#E0B04A', up3: '#3DBE82', up3fg: '#06241A', up2: '#23704F', up2fg: '#E6ECF2', up1: '#1A4D38', up1fg: '#E6ECF2', down3: '#EF6A5E', down3fg: '#2A0A07', down2: '#8F3A33', down2fg: '#E6ECF2', down1: '#5A2A27', down1fg: '#E6ECF2', upci: '#2C7A56', downci: '#9A4A43', uptext: '#5BD79E', downtext: '#FF9A90' },
};

/** CSS custom-property declarations for a theme, e.g. "--ground:#E8ECF0;--panel:...". */
export const themeCssVars = (t: ThemeName): string => Object.entries(WORLD_THEME[t]).map(([k, v]) => `--${k}:${v};`).join('');

const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
export function luminance(hex: string): number {
  const h = hex.replace('#', '');
  return 0.2126 * lin(parseInt(h.slice(0, 2), 16)) + 0.7152 * lin(parseInt(h.slice(2, 4), 16)) + 0.0722 * lin(parseInt(h.slice(4, 6), 16));
}
/** WCAG 2.x contrast ratio between two #RRGGBB colours. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// ───────────────────────────── Matrix view ─────────────────────────────

export interface WorldCell {
  factor: string;
  sector: string;
  direction: '+' | '-' | '0';
  beta: number;
  t: number;
  q: number;
  lag: number;
  tier: EvidenceTier;
  stable: boolean | null;
  reasonVi?: string;
}

export interface WorldMatrixPayload {
  factors: { id: string; nameVi: string; region?: string; channel?: string; channelVi?: string }[];
  sectors: { id: string; nameVi: string }[];
  cells: WorldCell[];
}

export interface WorldFilter {
  factors: string[];
  sectors: string[];
  channel: string | 'all';
  direction: 'all' | '+' | '-';
  tiers: EvidenceTier[];
}

export const DEFAULT_WORLD_FILTER: WorldFilter = { factors: [], sectors: [], channel: 'all', direction: 'all', tiers: [] };

export interface WorldViewCell extends WorldCell {
  /** 0 = insufficient evidence (hatched), 1..3 = strength */
  level: 0 | 1 | 2 | 3;
  unstable: boolean;
}

export interface WorldMatrixView {
  factors: WorldMatrixPayload['factors'];
  sectors: WorldMatrixPayload['sectors'];
  cells: Record<string, WorldViewCell>;
  counts: Record<EvidenceTier, number>;
  hidden: number;
}

export const worldCellKey = (factor: string, sector: string): string => `${factor}|${sector}`;

export function strengthLevel(tier: EvidenceTier, t: number): 0 | 1 | 2 | 3 {
  if (tier === 'C') return 0;
  const a = Math.abs(t);
  return a >= 5 ? 3 : a >= 3.5 ? 2 : 1;
}

export function buildWorldMatrixView(p: WorldMatrixPayload, f: WorldFilter): WorldMatrixView {
  const wantF = p.factors.filter((x) => (!f.factors.length || f.factors.includes(x.id)) && (f.channel === 'all' || x.channel === f.channel));
  const wantS = p.sectors.filter((s) => !f.sectors.length || f.sectors.includes(s.id));
  const fIds = new Set(wantF.map((x) => x.id));
  const sIds = new Set(wantS.map((x) => x.id));
  const cells: Record<string, WorldViewCell> = {};
  const counts: Record<EvidenceTier, number> = { A: 0, B: 0, C: 0 };
  let hidden = 0;
  for (const c of p.cells) {
    if (!fIds.has(c.factor) || !sIds.has(c.sector)) continue;
    const show = (f.direction === 'all' || c.direction === f.direction) && (!f.tiers.length || f.tiers.includes(c.tier));
    if (!show) {
      hidden++;
      continue;
    }
    counts[c.tier]++;
    cells[worldCellKey(c.factor, c.sector)] = { ...c, level: strengthLevel(c.tier, c.t), unstable: c.tier !== 'C' && c.stable === false };
  }
  const strength = (get: (c: WorldViewCell) => boolean) => Math.max(0, ...Object.values(cells).filter(get).map((c) => Math.abs(c.t) * (c.tier === 'C' ? 0.2 : 1)));
  const factors = [...wantF].filter((x) => Object.values(cells).some((c) => c.factor === x.id)).sort((a, b) => strength((c) => c.factor === b.id) - strength((c) => c.factor === a.id));
  const sectors = [...wantS].filter((s) => Object.values(cells).some((c) => c.sector === s.id)).sort((a, b) => strength((c) => c.sector === b.id) - strength((c) => c.sector === a.id));
  return { factors, sectors, cells, counts, hidden };
}

export function cellAria(c: WorldViewCell | undefined, factorName: string, sectorName: string): string {
  if (!c) return `${sectorName} và ${factorName}: không có dữ liệu`;
  if (c.tier === 'C') return `${sectorName} và ${factorName}: chưa đủ bằng chứng`;
  return `${sectorName} và ${factorName}: ${c.direction === '+' ? 'tăng' : 'giảm'}, bậc ${c.tier}, độ trễ ${c.lag} tháng${c.unstable ? ', không ổn định theo thời gian' : ''}`;
}

// ───────────────────────────── Bar geometry ─────────────────────────────

export interface CiBar {
  pos: number;
  lo: number;
  w: number;
  conclusive: boolean;
  sign: '+' | '-';
}

/** Percent positions on a track centred at 0 and spanning ±range. */
export function ciBar(est: number, lo: number, hi: number, range: number): CiBar {
  const pos = (v: number) => Math.min(98, Math.max(2, 50 + (v / range) * 48));
  return { pos: pos(est), lo: pos(lo), w: Math.max(pos(hi) - pos(lo), 1), conclusive: lo > 0 || hi < 0, sign: est >= 0 ? '+' : '-' };
}

export interface ColumnBar {
  top: number;
  h: number;
  sign: '+' | '-';
  ciTop?: number;
  ciH?: number;
}

/** Signed column bars around a centre line of `half` px; scale = px per unit. */
export function columnBars(values: number[], half: number, scale: number, ci?: { lo: number; hi: number }[]): ColumnBar[] {
  return values.map((v, i) => {
    const h = Math.max(Math.min(Math.abs(v) * scale, half), 1);
    const bar: ColumnBar = { top: v >= 0 ? half - h : half, h, sign: v >= 0 ? '+' : '-' };
    if (ci?.[i]) {
      const top = half - Math.min(Math.max(ci[i].hi * scale, -half), half);
      const bot = half - Math.min(Math.max(ci[i].lo * scale, -half), half);
      bar.ciTop = Math.min(top, bot);
      bar.ciH = Math.max(Math.abs(bot - top), 2);
    }
    return bar;
  });
}

export function spillShade(v: number, diagonal: boolean): { alpha: number; strong: boolean } {
  if (diagonal) return { alpha: 0, strong: false };
  const alpha = Math.min(0.1 + (v / 100) * 1.4, 0.95);
  return { alpha, strong: alpha > 0.5 };
}

export const fmtSigned = (v: number, d = 1, suffix = ''): string => (Number.isFinite(v) ? `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), d)}${suffix}` : '–');
export const tierLabelVi = (t: EvidenceTier | 'pending'): string => (t === 'pending' ? 'Chờ' : `Bậc ${t}`);
