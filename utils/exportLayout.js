/**
 * Layout of the exported Calendar / Journal image (all values in points).
 *
 * The canvas capture keeps its original width and aspect ratio — no side padding, no scaling,
 * no cropping. Space is added above it (and a little below). The W2W signature sits inside
 * the bottom page-colour strip (`footerH` tall), vertically centred in it.
 */
export function exportLayout({ shotW, shotH, viewW, topPad, bottomPad = 0, footerH = 0, logoW = 0, logoAspect = 1 }) {
  const contentW = viewW;
  const contentH = shotW > 0 ? (viewW * shotH) / shotW : 0;   // same aspect as the capture
  const frameW = viewW;
  const frameH = topPad + contentH + bottomPad;
  const logoH = logoAspect > 0 ? logoW / logoAspect : 0;
  const logoBottom = Math.max(0, (footerH - logoH) / 2);       // centred in the bottom strip
  const logoTop = frameH - logoBottom - logoH;
  return { frameW, frameH, contentW, contentH, logoW, logoH, logoBottom, logoTop };
}

/**
 * Show only `crop` (source pixels) of an image at `width` points:
 * returns the window size and how the full image is placed inside it.
 */
export function cropWindow(crop, width) {
  const scale = width / crop.width;
  return {
    windowW: width,
    windowH: crop.height * scale,
    imageW: crop.sourceWidth * scale,
    imageH: crop.sourceHeight * scale,
    left: -crop.x * scale,
    top: -crop.y * scale,
  };
}
