<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { Icon } from '$lib/components/UI';
  import { playIcon } from '$lib/images/icons';
  import type { StoryMedia } from '$lib/types/Story';
  import { isVideo, videoPreviewUrl, videoThumbnailUrl } from '$lib/util/story-media';
  import StoryImage from './StoryImage.svelte';

  interface Props {
    storyId: string;
    media: StoryMedia;
    /**
     * Whether the containing card is hovered or focused. Videos only start
     * downloading their (~1 MB) animated preview once this becomes true.
     */
    active?: boolean;
    /** How many media items the story has in total. */
    total?: number;
  }

  let { storyId, media, active = false, total = 1 }: Props = $props();

  // Two cards wide inside the 1200px-max, 6rem-padded timeline, single column
  // below the 700px breakpoint.
  const SIZES = '(max-width: 700px) 100vw, (max-width: 1200px) 45vw, 530px';

  // Latches on first hover: once requested, keep the preview mounted so a second
  // hover is instant instead of re-downloading it.
  let previewRequested = $state(false);
  let previewLoaded = $state(false);

  $effect(() => {
    if (active) previewRequested = true;
  });
</script>

<div class="media">
  {#if isVideo(media)}
    <img class="poster" src={videoThumbnailUrl(media)} alt="" loading="lazy" decoding="async" />
    {#if previewRequested}
      <!-- An animated WebP: it loops by itself and has no audio track. -->
      <img
        class="preview"
        class:visible={active && previewLoaded}
        src={videoPreviewUrl(media)}
        alt=""
        decoding="async"
        onload={() => (previewLoaded = true)}
      />
    {/if}
    <span class="play" aria-hidden="true">
      <Icon icon={playIcon} />
    </span>
  {:else}
    <StoryImage {storyId} {media} sizes={SIZES} />
  {/if}

  {#if total > 1}
    <span class="count">{$_('stories.media-count', { values: { count: total - 1 } })}</span>
  {/if}
</div>

<style>
  .media {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    overflow: hidden;
    background-color: var(--color-beige-light);
  }

  .poster,
  .preview {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .preview {
    position: absolute;
    inset: 0;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .preview.visible {
    opacity: 1;
  }

  .play {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 5.4rem;
    height: 5.4rem;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.9);
    box-shadow: 0 0.2rem 1.2rem rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
  }

  .play :global(i) {
    width: 2.2rem;
    height: 2.2rem;
    /* Optically center the triangle inside the circle */
    margin-left: 0.3rem;
  }

  .play :global(svg) {
    fill: var(--color-green);
  }

  .count {
    position: absolute;
    right: 1.2rem;
    bottom: 1.2rem;
    padding: 0.4rem 1rem;
    border-radius: 10rem;
    background-color: rgba(28, 40, 28, 0.75);
    color: var(--color-white);
    font-size: 1.3rem;
    font-weight: 600;
    line-height: 1.4;
  }
</style>
