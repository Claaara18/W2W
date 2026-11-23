/**
 * W2W brand signature used on exported Calendar / Journal images:
 * the script "W2W" with its swash and stars from the W2W poster, deep wine red,
 * transparent background (assets/brand/w2w-logo.png, 375 × 666 px).
 */
export const BRAND_LOGO = require('../assets/brand/w2w-logo.png');

// The artwork only fills part of the file (the rest is transparent). Only this region is
// shown — measured from the file's alpha channel, in source pixels — so the logo keeps
// its original proportions without editing the asset.
export const BRAND_LOGO_CROP = { x: 16, y: 68, width: 320, height: 165, sourceWidth: 375, sourceHeight: 666 };
