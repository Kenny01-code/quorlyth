export const THEMES = {
  // The robot shell uses the exact uploaded Quorlyth orange swatch (#D06A40).
  // Its highlights and shadows stay in the same orange family; the deep-ink faceplate is unchanged.
  terracotta: {
    n: 'Quorlyth Orange',
    p: 0xc9562e,
    b: 0x211a17,
    c: 0xa64829,
    g: 0xffa16f,
    e: 0x6f2b1a,
    ei: 0.14,
    g1: '#C9562E',
    g2: '#6F2B1A',
    cr: '201,86,46',
  },
  pearl: {
    n: 'Cobalt Pearl',
    p: 0xeaf0ff,
    b: 0x101a32,
    c: 0xffffff,
    g: 0x91b7ff,
    e: 0x254dbb,
    ei: 0.11,
    g1: '#91B7FF',
    g2: '#285BD8',
    cr: '145,183,255',
  },
} as const
