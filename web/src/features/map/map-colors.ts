import type { Metric } from '../../shared/api/types';
import { useTheme } from '../../shared/theme/use-theme';

export interface MapColors {
  metric: Record<Metric, string>;
  countryFill: string;
  countryStroke: string;
  countrySelected: string;
  markerOutline: string;
  markerOutlineSelected: string;
}

export const LIGHT_MAP_COLORS: MapColors = {
  metric: { cases: '#dc2626', deaths: '#7c3aed' },
  countryFill: '#e5e7eb',
  countryStroke: '#9ca3af',
  countrySelected: '#1f2937',
  markerOutline: '#ffffff',
  markerOutlineSelected: '#111827',
};

// Lighter marks on the darkened tiles; outlines swap so markers still stand apart.
export const DARK_MAP_COLORS: MapColors = {
  metric: { cases: '#f87171', deaths: '#a78bfa' },
  countryFill: '#4b5563',
  countryStroke: '#6b7280',
  countrySelected: '#f3f4f6',
  markerOutline: '#111827',
  markerOutlineSelected: '#f9fafb',
};

export function useMapColors(): MapColors {
  return useTheme().theme === 'dark' ? DARK_MAP_COLORS : LIGHT_MAP_COLORS;
}
