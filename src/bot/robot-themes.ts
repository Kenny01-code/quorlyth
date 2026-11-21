export const THEMES = {
  // Match the site's pure Quorlyth orange (#F97316) with a deep orange shadow (#C2410C).
  // The faceplate stays dark for contrast; all visible shell, joints and body trim stay orange.
  terracotta: {
    n: 'Quorlyth Deep Orange',
    p: 0xf97316,
    b: 0x17120f,
    c: 0xc2410c,
    g: 0xffcf86,
    e: 0xc2410c,
    ei: 0.22,
    g1: '#F97316',
    g2: '#C2410C',
    cr: '249,115,22',
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
