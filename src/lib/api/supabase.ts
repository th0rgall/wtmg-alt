import {
  createClient,
  type SupabaseClient,
  type SupabaseClientOptions
} from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_ANON_KEY, PUBLIC_SUPABASE_API_URL } from '$env/static/public';
import logger from '$lib/util/logger';

/**
 * Whether the Supabase environment variables are configured.
 *
 * Supabase is an optional part of the local dev environment: features that
 * depend on it (garden response rates, stories) should degrade gracefully
 * rather than throw when it isn't configured.
 */
export const isSupabaseConfigured = () =>
  typeof PUBLIC_SUPABASE_API_URL === 'string' && PUBLIC_SUPABASE_API_URL.length > 0;

/**
 * Creates a new Supabase client from the configured environment variables.
 *
 * @returns null if Supabase is not configured in this environment.
 */
export const createSupabaseClient = (
  options?: SupabaseClientOptions<'public'>
): SupabaseClient | null => {
  if (!isSupabaseConfigured()) {
    logger.warn('PUBLIC_SUPABASE_API_URL not set, skip Supabase init');
    return null;
  }
  return createClient(PUBLIC_SUPABASE_API_URL, PUBLIC_SUPABASE_ANON_KEY, options);
};

let publicClient: SupabaseClient | null | undefined;

/**
 * A lazily created, memoized Supabase client that carries no user credentials.
 *
 * Use this for data that is world-readable (like stories), which should also load
 * for logged-out visitors. The authenticated client — which only exists for members
 * and hosts, and which is reset on logout — lives in the `supabase` store instead
 * (see `$lib/stores/auth` and `signInToSupabaseIfNeeded` in `$lib/api/auth`).
 *
 * @returns null if Supabase is not configured in this environment.
 */
export const getPublicSupabase = (): SupabaseClient | null => {
  if (publicClient === undefined) {
    publicClient = createSupabaseClient();
  }
  return publicClient;
};

/**
 * The public base URL of a file in a public Supabase Storage bucket.
 */
export const publicStorageUrl = (bucket: string, path: string) =>
  `${PUBLIC_SUPABASE_API_URL}/storage/v1/object/public/${bucket}/${path}`;
