import localFont from 'next/font/local'

// Self-hosted SF Pro (licensed). Files are Latin-subset WOFF2 made from the SF Pro Display
// OTFs. Both calls declare the family 'sfPro' (must equal the exported const name, which is what
// the generated --font-sf-pro variable points at) so they form one family; only the upright
// cuts are preloaded, since nothing in the UI is italic yet.
//
// Only Light (300) and Regular (400) uprights exist so far. Weights 600/700/800 used across the
// UI are faux-bolded by the browser from Regular until Semibold/Bold files are added here.

export const sfPro = localFont({
  src: [
    { path: './sf-pro/sf-pro-display-light.woff2', weight: '300', style: 'normal' },
    { path: './sf-pro/sf-pro-display-regular.woff2', weight: '400', style: 'normal' },
  ],
  variable: '--font-sf-pro',
  display: 'swap',
  declarations: [{ prop: 'font-family', value: 'sfPro' }],
})

export const sfProItalic = localFont({
  src: [
    { path: './sf-pro/sf-pro-display-lightitalic.woff2', weight: '300', style: 'italic' },
    { path: './sf-pro/sf-pro-display-mediumitalic.woff2', weight: '500', style: 'italic' },
  ],
  // Unused variable: adding its class to <html> is what pulls these @font-face rules in.
  variable: '--font-sf-pro-italic',
  display: 'swap',
  preload: false,
  adjustFontFallback: false,
  declarations: [{ prop: 'font-family', value: 'sfPro' }],
})
