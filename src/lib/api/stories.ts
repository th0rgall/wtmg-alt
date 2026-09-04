import { getPublicSupabase } from './supabase';
import { DEFAULT_LANGUAGE } from '$lib/types/general';
import type { Story } from '$lib/types/Story';
import logger from '$lib/util/logger';

/**
 * How many stories are fetched per page on the stories timeline.
 */
export const STORIES_PAGE_SIZE = 12;

export type StoriesPage = {
  stories: Story[];
  /** Whether the backend may still have older stories after this page. */
  hasMore: boolean;
};

/**
 * Fetches a page of stories from the public `get_stories` Postgres function.
 *
 * Stories are world-readable, so this deliberately uses the credential-less
 * public Supabase client, and works for logged-out visitors too.
 *
 * Note: story text is always requested in the default language for now. This is
 * intentionally *not* tied to the app locale, because story translations don't
 * exist yet.
 *
 * @throws when Supabase returns an error, so the caller can show a retry affordance.
 */
export const getStories = async ({
  limit = STORIES_PAGE_SIZE,
  offset = 0
}: {
  limit?: number;
  offset?: number;
} = {}): Promise<StoriesPage> => {
  const supabase = getPublicSupabase();
  if (!supabase) {
    logger.warn('Supabase is not configured, can not load stories');
    return { stories: [], hasMore: false };
  }

  const { data, error } = await supabase.rpc('get_stories', {
    p_limit: limit,
    p_offset: offset,
    p_lang: DEFAULT_LANGUAGE
  });

  if (error) {
    logger.error('Failed to load stories', error);
    throw error;
  }

  // There are no generated Supabase types for this project, so the RPC result
  // is untyped: assert the shape the `get_stories` function documents.
  const rows = (data ?? []) as Story[];
  return {
    // A story with neither text (in the requested language) nor media has
    // nothing to show, so don't render an empty card for it.
    stories: rows.filter((story) => !!story.story_text || story.media?.length > 0),
    // A short page means we reached the end. `hasMore` is based on the raw row
    // count, since the offset the backend paginates on counts unfiltered rows.
    hasMore: rows.length === limit
  };
};
