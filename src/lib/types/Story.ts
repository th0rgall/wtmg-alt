/**
 * Image derivative sizes generated for story media, in pixels at the longest edge.
 *
 * Derivatives are never upscaled, so only the sizes that make sense for the
 * original are generated. `thumb` is the exception: it is always generated
 * (images smaller than it are rejected on ingest), and is therefore not listed
 * in the `sizes` array of `StoryMedia`.
 */
export const STORY_IMAGE_WIDTHS = {
  thumb: 48,
  medium: 480,
  large: 960,
  xlarge: 1920
} as const;

export type StoryImageSize = keyof typeof STORY_IMAGE_WIDTHS;

/**
 * The derivative sizes that are reported by the backend
 * (all of them except the always-present `thumb`).
 */
export type StoryImageDerivativeSize = Exclude<StoryImageSize, 'thumb'>;

export type StoryMedia = {
  /**
   * For images: the media ID part of the Supabase Storage path.
   * For videos: the Bunny Stream video ID (GUID).
   */
  media_id: string;
  /**
   * Only present, and then always `true`, for Bunny Stream videos.
   * The backend strips nulls, so images simply omit this key.
   */
  is_video?: boolean;
  /**
   * Available image derivatives, omitted for videos.
   */
  sizes?: StoryImageDerivativeSize[];
};

/**
 * One row of the `get_stories(p_limit, p_offset, p_lang)` Postgres function.
 */
export type Story = {
  id: string;
  /** A naive (timezone-less) timestamp, or null when unknown. */
  date: string | null;
  /** Markdown. Null when no translation exists for the requested language. */
  story_text: string | null;
  media: StoryMedia[];
};
