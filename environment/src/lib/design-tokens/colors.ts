/**
 * Design-system color tokens -- single source of truth for the dev-mode
 * inspector (per v3artboard-may-14 P9).
 *
 * Adding a token = add to the right group below. The flat HEX_TO_TOKEN map
 * is generated from the groups so dev-mode hover/click resolves any literal
 * to a token path like "primary.primary1_600" automatically.
 */

export const greys = {
  white:  '#FFFFFF',
  grey03: '#F8F8FB',
  grey12: '#D7D6DA',
  grey20: '#C7C7CC',
  grey50: '#73727C',
  black:  '#000000',
} as const

export const primary = {
  primary1_600: '#1200B8',
  primary1:     '#402AFF',
  primary1_200: '#B6ADFF',
  primary1_100: '#DAD6FF',
  primary1_50:  '#EDEBFF',
  primary2:     '#03072D',
  primary2_200: '#9094AD',
  primary2_100: '#BCBECE',
  primary2_50:  '#DEDFE7',
} as const

export const secondary = {
  secondary1:     '#188C7C',
  secondary1_200: '#3FDEC9',
  secondary1_100: '#85EADD',
  secondary1_50:  '#CBF6F0',
  secondary2:     '#FF495C',
  secondary2_200: '#FFADB6',
  secondary2_100: '#FFD6DA',
  secondary2_50:  '#FFEBED',
} as const

export const tertiary = {
  g_600:  '#15837F',
  g_400:  '#00BD9D',
  g_200:  '#73D3C4',
  b_400:  '#1F59D5',
  b_300:  '#5787F5',
  b_200:  '#88A7E5',
  b_50:   '#D4E1F6',
  r_400:  '#DE3434',
  r_200:  '#E89495',
  y_400:  '#F9BC14',
  y_200:  '#F6D885',
  o_400:  '#F97814',
  o_200:  '#F6B685',
  o_50:   '#FEF8F3',
  p_400:  '#FF4270',
  p_200:  '#F99BB3',
  v_400:  '#41AECF',
  v_200:  '#8FCEE0',
  j_400:  '#52489C',
  j_200:  '#AAA6CE',
  i_400:  '#8352E1',
  i_200:  '#BBA3EC',
  i_50:   '#E8E1F6',
  f_400:  '#C140AF',
  f_200:  '#D99AD2',
  f_50:   '#F5E6F4',
  s2_50:  '#D9ECEF',
  s2_400: '#028090',
} as const

export const utility = {
  white:     greys.white,
  ink:       greys.black,
  subdued:   greys.grey20,
  contrast:  greys.black,
  highlight: greys.grey03,
  promo:     '#BDF168',
  success:   '#006400',
  bgSuccess: '#DBEFDC',
  warning:   '#B84600',
  bgWarning: '#FFF2CD',
  error:     '#B00008',
  bgError:   '#F8D7D9',
  bgInfo:    primary.primary1_50,
  gold:      '#E3AE5D',
  silver:    '#CAC7C3',
  bronze:    '#AE956F',
} as const

export const products = {
  medical:     '#1EBCB2',
  perks:       primary.primary1,
  recognition: '#EE6352',
  wellness:    '#8352E1',
  rewards:     '#E4A700',
} as const

// -----------------------------------------------------------------------------
// Flat HEX -> token-path lookup. Built once at module load.
// First-write-wins so aliases (utility.white -> greys.white) point at the
// canonical group entry, not the alias.
// -----------------------------------------------------------------------------

type Group = Record<string, string>

const GROUPS: { name: string; group: Group }[] = [
  { name: 'greys',     group: greys },
  { name: 'primary',   group: primary },
  { name: 'secondary', group: secondary },
  { name: 'tertiary',  group: tertiary },
  { name: 'utility',   group: utility },
  { name: 'products',  group: products },
]

const HEX_TO_TOKEN: Record<string, string> = (() => {
  const map: Record<string, string> = {}
  for (const { name, group } of GROUPS) {
    for (const [key, hex] of Object.entries(group)) {
      const normalized = hex.toUpperCase()
      if (!map[normalized]) map[normalized] = `${name}.${key}`
    }
  }
  return map
})()

/**
 * Resolve a hex (any case, with or without #) to a token path.
 * Returns null if the hex isn't in the design system.
 */
export function tokenForHex(hex: string): string | null {
  const normalized = (hex.startsWith('#') ? hex : '#' + hex).toUpperCase()
  return HEX_TO_TOKEN[normalized] ?? null
}

/** Read-only view of the full HEX -> token map. */
export function allColorTokens(): Readonly<Record<string, string>> {
  return HEX_TO_TOKEN
}
