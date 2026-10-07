import sharp from "sharp";

// Every server-side image path imports sharp from here, never from "sharp" directly.
//
// sharp detects the input format from the bytes, not from the declared Content-Type or file type, so
// an SVG renamed to photo.jpg is decoded by librsvg. librsvg has had memory-safety bugs that can lead
// to remote code execution (GHSA-wq5f-xc86-pv6w, fixed in sharp 0.35.5). We only ever accept JPEG,
// PNG and WebP, so SVG decoding is switched off for good: a disguised SVG now fails to decode
// instead of reaching librsvg, whatever the sharp version.
sharp.block({ operation: ["VipsForeignLoadSvg"] });

export default sharp;
