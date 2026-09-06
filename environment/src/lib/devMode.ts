import { create } from 'zustand';

export interface DevRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface DevIconInfo {
  /** MUI icon name if detected (e.g. "HealthAndSafetyOutlinedIcon"), else null */
  muiName: string | null;
  /** True if the element is an inline SVG that isn't MUI (per may-14 P9 = warn) */
  isInlineNonMuiSvg: boolean;
  /** True if the element is an <img> sourced from a known assets dir (OK per P9) */
  isAssetImg: boolean;
  /** Raw asset src if isAssetImg */
  imgSrc: string | null;
}

export interface DevSelection {
  rect: DevRect;
  styles: Record<string, string>;
  source: string | null;
  html: string;
  path: string;
  tag: string;
  /** P9 may-14: icon inspection metadata */
  icon: DevIconInfo;
}

interface DevModeState {
  devMode: boolean;
  hover: DevRect | null;
  selected: DevSelection | null;
  setDevMode: (on: boolean) => void;
  setHover: (r: DevRect | null) => void;
  setSelected: (s: DevSelection | null) => void;
}

const initialDev =
  typeof window !== 'undefined' &&
  new URLSearchParams(window.location.search).get('dev') === '1';

export const useDevMode = create<DevModeState>((set) => ({
  devMode: initialDev,
  hover: null,
  selected: null,
  setDevMode: (on) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (on) url.searchParams.set('dev', '1');
      else url.searchParams.delete('dev');
      window.history.replaceState({}, '', url.toString());
    }
    set({ devMode: on, hover: on ? null : null, selected: on ? null : null });
  },
  setHover: (r) => set({ hover: r }),
  setSelected: (s) => set({ selected: s }),
}));
