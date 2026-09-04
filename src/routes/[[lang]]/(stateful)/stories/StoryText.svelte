<script lang="ts">
  import Markdown from 'svelte-exmarkdown';
  import { gfmPlugin } from 'svelte-exmarkdown/gfm';
  import type { Plugin } from 'svelte-exmarkdown';
  import StoryLink from './StoryLink.svelte';

  interface Props {
    /** The raw Markdown of a story. */
    md: string;
  }

  let { md }: Props = $props();

  // No rehype-raw here on purpose: raw HTML in the source stays inert.
  const plugins: Plugin[] = [gfmPlugin(), { renderer: { a: StoryLink } }];
</script>

<div class="story-text">
  <Markdown {md} {plugins} />
</div>

<style>
  .story-text {
    font-size: var(--paragraph-font-size);
    line-height: 1.75;
    color: var(--color-green);
    overflow-wrap: break-word;
  }

  .story-text :global(> *:first-child) {
    margin-top: 0;
  }

  .story-text :global(> *:last-child) {
    margin-bottom: 0;
  }

  .story-text :global(p) {
    margin: 0 0 1.6rem;
    line-height: 1.75;
  }

  .story-text :global(h1),
  .story-text :global(h2),
  .story-text :global(h3),
  .story-text :global(h4) {
    font-family: var(--fonts-copy);
    font-weight: 700;
    font-size: 1.8rem;
    line-height: 1.5;
    margin: 2.4rem 0 1.2rem;
  }

  .story-text :global(ul),
  .story-text :global(ol) {
    margin: 0 0 1.6rem;
    padding-left: 2.4rem;
    list-style: revert;
  }

  .story-text :global(li) {
    margin-bottom: 0.6rem;
  }

  .story-text :global(blockquote) {
    margin: 0 0 1.6rem;
    padding-left: 1.6rem;
    border-left: 3px solid var(--color-green-light);
    color: var(--color-green-2);
  }

  .story-text :global(code) {
    font-size: 0.9em;
    background-color: var(--color-beige-light);
    border-radius: 4px;
    padding: 0.1em 0.4em;
  }

  .story-text :global(pre) {
    overflow-x: auto;
    margin: 0 0 1.6rem;
    padding: 1.2rem 1.6rem;
    background-color: var(--color-beige-light);
    border-radius: 8px;
  }

  .story-text :global(pre code) {
    padding: 0;
    background: none;
  }

  .story-text :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
  }

  .story-text :global(hr) {
    border: none;
    border-top: 1px solid var(--color-gray);
    margin: 2.4rem 0;
  }

  .story-text :global(table) {
    border-collapse: collapse;
    margin-bottom: 1.6rem;
  }

  .story-text :global(th),
  .story-text :global(td) {
    border: 1px solid var(--color-gray);
    padding: 0.6rem 1rem;
    text-align: left;
  }
</style>
