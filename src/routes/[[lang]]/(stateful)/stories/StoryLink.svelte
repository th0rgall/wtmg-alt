<script lang="ts">
  import type { Snippet } from 'svelte';
  import { isRelativeURL } from '$lib/util/navigate';
  import { PUBLIC_WTMG_HOST } from '$env/static/public';

  /**
   * The renderer svelte-exmarkdown uses for Markdown links. It receives the hast
   * element properties, so `href` may be missing or non-string.
   */
  interface Props {
    href?: unknown;
    children?: Snippet;
  }

  let { href, children }: Props = $props();

  let url = $derived(typeof href === 'string' ? href : undefined);

  // Links to WTMG itself keep navigating in place; anything else opens in a new tab,
  // so readers don't lose the story they were reading.
  let isInternal = $derived(
    !!url && (isRelativeURL(url) || url.startsWith(PUBLIC_WTMG_HOST) || url.startsWith('#'))
  );
</script>

<a
  href={url}
  target={isInternal ? undefined : '_blank'}
  rel={isInternal ? undefined : 'noopener noreferrer'}>{@render children?.()}</a
>

<style>
  a {
    color: var(--color-orange);
    font-weight: 600;
    text-decoration: underline;
    overflow-wrap: anywhere;
  }
</style>
