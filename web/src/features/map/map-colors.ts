import type { Metric } from '../../shared/api/types';
import { useTheme } from '../../shared/theme/use-theme';

export interface MapColors {
  metric: Record<Metric, string>;
  countryFill: string;
  countryStroke: string;
  countrySelected: string;
  markerOutline: string;
  markerOutlineSelected: string;
  // Choropleth: one color per class (low to high), the fill without data and the fixed dots.
  ramp: Record<Metric, readonly string[]>;
  noData: string;
  dot: string;
}

export const LIGHT_MAP_COLORS: MapColors = {
  metric: { cases: '#dc2626', deaths: '#7c3aed' },
  countryFill: '#e5e7eb',
  countryStroke: '#9ca3af',
  countrySelected: '#1f2937',
  markerOutline: '#ffffff',
  markerOutlineSelected: '#111827',
  ramp: {
    cases: ['#fee2e2', '#fca5a5', '#f87171', '#dc2626', '#991b1b'],
    deaths: ['#ede9fe', '#c4b5fd', '#a78bfa', '#7c3aed', '#5b21b6'],
  },
  noData: '#d1d5db',
  dot: '#1f2937',
};

// Lighter marks on the darkened tiles; outlines swap so markers still stand apart.
export const DARK_MAP_COLORS: MapColors = {
  metric: { cases: '#f87171', deaths: '#a78bfa' },
  countryFill: '#4b5563',
  countryStroke: '#6b7280',
  countrySelected: '#f3f4f6',
  markerOutline: '#111827',
  markerOutlineSelected: '#f9fafb',
  // On the dark page the high classes are the bright ones.
  ramp: {
    cases: ['#450a0a', '#7f1d1d', '#b91c1c', '#ef4444', '#fca5a5'],
    deaths: ['#2e1065', '#4c1d95', '#6d28d9', '#8b5cf6', '#c4b5fd'],
  },
  // Lighter than the darkest classes, so "Sem dados" never reads as "few".
  noData: '#6b7280',
  dot: '#f3f4f6',
};

export function useMapColors(): MapColors {
  return useTheme().theme === 'dark' ? DARK_MAP_COLORS : LIGHT_MAP_COLORS;
}
