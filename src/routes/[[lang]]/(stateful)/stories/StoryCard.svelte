<script lang="ts">
  import type { Story } from '$lib/types/Story';
  import { markdownExcerpt } from '$lib/util/markdown-excerpt';
  import StoryCardMedia from './StoryCardMedia.svelte';

  interface Props {
    story: Story;
    href: string;
    onselect: (event: MouseEvent) => void;
  }

  let { story, href, onselect }: Props = $props();

  // In a timeline, only the first medium is shown — the rest live in the modal gallery.
  let firstMedium = $derived(story.media?.[0]);
  let excerpt = $derived(story.story_text ? markdownExcerpt(story.story_text) : '');

  let active = $state(false);
</script>

<a
  class="card"
  {href}
  onclick={onselect}
  onmouseenter={() => (active = true)}
  onmouseleave={() => (active = false)}
  onfocus={() => (active = true)}
  onblur={() => (active = false)}
>
  {#if firstMedium}
    <StoryCardMedia
      storyId={story.id}
      media={firstMedium}
      {active}
      total={story.media?.length ?? 1}
    />
  {/if}
  {#if excerpt}
    <p class="excerpt">{excerpt}</p>
  {/if}
</a>

<style>
  .card {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border-radius: var(--tile-border-radius);
    background-color: var(--color-white);
    box-shadow: 0 0 2.2rem rgba(0, 0, 0, 0.1);
    color: var(--color-green);
    text-decoration: none;
    transition:
      transform 0.3s ease,
      box-shadow 0.3s ease;
  }

  .card:hover,
  .card:focus-visible {
    transform: translateY(-0.4rem);
    box-shadow: 0 0.6rem 2.6rem rgba(0, 0, 0, 0.16);
  }

  .excerpt {
    margin: 0;
    padding: 2.4rem;
    font-size: var(--paragraph-font-size);
    line-height: 1.7;
  }

  @media screen and (max-width: 700px) {
    .excerpt {
      padding: 2rem;
    }
  }
</style>
