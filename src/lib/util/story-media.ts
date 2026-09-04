import {
  PUBLIC_BUNNY_STREAM_CDN_HOSTNAME,
  PUBLIC_BUNNY_STREAM_LIBRARY_ID
} from '$env/static/public';
import { publicStorageUrl } from '$lib/api/supabase';
import {
  STORY_IMAGE_WIDTHS,
  type StoryImageDerivativeSize,
  type StoryMedia
} from '$lib/types/Story';

/**
 * The Supabase Storage bucket that holds story image derivatives, laid out as
 * `stories-media/{storyId}/{mediaId}/{thumb,medium,large,xlarge}.{avif,jpg}`.
 */
const STORIES_MEDIA_BUCKET = 'stories-media';

/**
 * Image derivative formats, best first: browsers pick the first `<source>` they
 * support, and every browser we target falls back to the JPEG.
 */
const IMAGE_FORMATS = [
  { extension: 'avif', type: 'image/avif' },
  { extension: 'jpg', type: 'image/jpeg' }
] as const;

export type StoryImageFormat = (typeof IMAGE_FORMATS)[number];

export const isVideo = (media: StoryMedia) => media.is_video === true;

const imageUrl = (
  storyId: string,
  media: StoryMedia,
  size: keyof typeof STORY_IMAGE_WIDTHS,
  extension: string
) => publicStorageUrl(STORIES_MEDIA_BUCKET, `${storyId}/${media.media_id}/${size}.${extension}`);

/**
 * The sizes available for an image, smallest first.
 *
 * `thumb` is always generated, and hence never reported in `media.sizes`.
 */
const availableSizes = (media: StoryMedia): (keyof typeof STORY_IMAGE_WIDTHS)[] => {
  const derivatives: StoryImageDerivativeSize[] = ['medium', 'large', 'xlarge'];
  return ['thumb', ...derivatives.filter((size) => media.sizes?.includes(size))];
};

/**
 * A `srcset` for one image format, using the longest-edge width of each
 * available derivative as its width descriptor.
 */
export const imageSrcset = (storyId: string, media: StoryMedia, extension: string) =>
  availableSizes(media)
    .map((size) => `${imageUrl(storyId, media, size, extension)} ${STORY_IMAGE_WIDTHS[size]}w`)
    .join(', ');

/**
 * The `<source>` elements to render for a responsive story image.
 */
export const imageSources = (storyId: string, media: StoryMedia) =>
  IMAGE_FORMATS.map(({ extension, type }) => ({
    type,
    srcset: imageSrcset(storyId, media, extension)
  }));

/**
 * The fallback `src` for a responsive story image: the largest available JPEG.
 */
export const imageFallbackUrl = (storyId: string, media: StoryMedia) => {
  const sizes = availableSizes(media);
  return imageUrl(storyId, media, sizes[sizes.length - 1], 'jpg');
};

/**
 * The always-available 48px thumbnail, used as a low-quality placeholder.
 */
export const imageThumbUrl = (storyId: string, media: StoryMedia) =>
  imageUrl(storyId, media, 'thumb', 'jpg');

//
// Bunny Stream
// URL layout: https://bunny.net/docs/stream/storage-structure
//

const bunnyCdnUrl = (videoId: string, file: string) =>
  `https://${PUBLIC_BUNNY_STREAM_CDN_HOSTNAME}/${videoId}/${file}`;

/**
 * The static poster frame of a video.
 */
export const videoThumbnailUrl = (media: StoryMedia) =>
  bunnyCdnUrl(media.media_id, 'thumbnail.jpg');

/**
 * The high quality animated preview (a looping, silent WebP).
 *
 * This is a heavy file (~1 MB), so only ever request it on user intent.
 */
export const videoPreviewUrl = (media: StoryMedia) => bunnyCdnUrl(media.media_id, 'preview.webp');

/**
 * The embed URL of the Bunny Stream player.
 */
export const videoEmbedUrl = (media: StoryMedia) => {
  const params = new URLSearchParams({
    autoplay: 'true',
    loop: 'false',
    muted: 'true',
    preload: 'true',
    responsive: 'true'
  });
  return `https://player.mediadelivery.net/embed/${PUBLIC_BUNNY_STREAM_LIBRARY_ID}/${media.media_id}?${params}`;
};
