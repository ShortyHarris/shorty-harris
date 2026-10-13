// Supabase Storage image transforms: rewrites a public object URL
// (/storage/v1/object/public/...) to the render endpoint
// (/storage/v1/render/image/public/...) so the browser gets a resized,
// compressed WebP instead of the original upload (blog covers are ~900KB PNGs;
// the 640w WebP is ~50KB). URLs from anywhere else pass through untouched.

const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

export const CARD_IMAGE_WIDTHS = [400, 640, 960] as const;

export function isSupabaseStorageUrl(url: string): boolean {
  return url.includes(OBJECT_PATH);
}

export function supabaseImageUrl(url: string, width: number, quality = 70): string {
  if (!isSupabaseStorageUrl(url)) return url;
  const out = new URL(url.replace(OBJECT_PATH, RENDER_PATH));
  out.searchParams.set('width', String(width));
  out.searchParams.set('quality', String(quality));
  out.searchParams.set('format', 'webp');
  return out.toString();
}

// src + srcSet props for an <img>. srcSet is omitted for non-Storage URLs,
// since there's nothing to resize.
export function responsiveImage(
  url: string,
  defaultWidth: number,
  widths: readonly number[] = CARD_IMAGE_WIDTHS,
): { src: string; srcSet?: string } {
  if (!isSupabaseStorageUrl(url)) return { src: url };
  return {
    src: supabaseImageUrl(url, defaultWidth),
    srcSet: widths.map((w) => `${supabaseImageUrl(url, w)} ${w}w`).join(', '),
  };
}
