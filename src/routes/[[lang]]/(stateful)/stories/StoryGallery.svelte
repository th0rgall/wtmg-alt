<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { Icon } from '$lib/components/UI';
  import { chevronRightIcon } from '$lib/images/icons';
  import type { StoryMedia } from '$lib/types/Story';
  import { isVideo, videoEmbedUrl, videoThumbnailUrl } from '$lib/util/story-media';
  import StoryImage from './StoryImage.svelte';

  interface Props {
    storyId: string;
    media: StoryMedia[];
  }

  let { storyId, media }: Props = $props();

  const SIZES = '(max-width: 700px) 100vw, 760px';

  let scroller: HTMLDivElement | undefined = $state();
  let activeIndex = $state(0);
  let hasMultiple = $derived(media.length > 1);

  /**
   * Tracks the slide that is (mostly) in view, so the arrows, the dots and the
   * lazily mounted video player all agree on what "current" means.
   */
  const trackActiveSlide = (node: HTMLDivElement) => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const index = Number((entry.target as HTMLElement).dataset.index);
            if (!Number.isNaN(index)) activeIndex = index;
          }
        }
      },
      { root: node, threshold: 0.6 }
    );
    for (const slide of node.querySelectorAll('.slide')) {
      observer.observe(slide);
    }
    return () => observer.disconnect();
  };

  const scrollTo = (index: number) => {
    const target = scroller?.querySelectorAll<HTMLElement>('.slide')[index];
    if (!target || !scroller) return;
    // Not scrollIntoView(): that would also scroll the modal body around it.
    scroller.scrollTo({ left: target.offsetLeft - scroller.offsetLeft, behavior: 'smooth' });
  };
</script>

<div class="gallery">
  <div class="scroller" bind:this={scroller} {@attach trackActiveSlide}>
    {#each media as medium, index (medium.media_id)}
      <div class="slide" data-index={index}>
        {#if isVideo(medium)}
          {#if index === activeIndex}
            <!-- Mounted only while in view, so off-screen players don't keep running -->
            <iframe
              src={videoEmbedUrl(medium)}
              loading="lazy"
              title={$_('stories.video-label')}
              allow="accelerometer;gyroscope;autoplay;encrypted-media;picture-in-picture;fullscreen;"
              allowfullscreen={true}
            ></iframe>
          {:else}
            <img class="poster" src={videoThumbnailUrl(medium)} alt="" loading="lazy" />
          {/if}
        {:else}
          <StoryImage
            {storyId}
            media={medium}
            sizes={SIZES}
            fit="contain"
            loading={index === 0 ? 'eager' : 'lazy'}
            alt={hasMultiple
              ? $_('stories.image-label-numbered', {
                  values: { index: index + 1, total: media.length }
                })
              : $_('stories.image-label')}
          />
        {/if}
      </div>
    {/each}
  </div>

  {#if hasMultiple}
    <button
      type="button"
      class="arrow prev"
      disabled={activeIndex === 0}
      aria-label={$_('stories.previous-media')}
      onclick={() => scrollTo(activeIndex - 1)}
    >
      <Icon icon={chevronRightIcon} />
    </button>
    <button
      type="button"
      class="arrow next"
      disabled={activeIndex === media.length - 1}
      aria-label={$_('stories.next-media')}
      onclick={() => scrollTo(activeIndex + 1)}
    >
      <Icon icon={chevronRightIcon} />
    </button>
    <div class="dots">
      {#each media as medium, index (medium.media_id)}
        <button
          type="button"
          class="dot"
          class:active={index === activeIndex}
          aria-label={$_('stories.go-to-media', { values: { index: index + 1 } })}
          aria-current={index === activeIndex}
          onclick={() => scrollTo(index)}
        ></button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .gallery {
    position: relative;
  }

  .scroller {
    display: flex;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    border-radius: var(--tile-border-radius);
    background-color: var(--color-green-dark);
    /* The dots sit below; the scrollbar itself would only add noise */
    scrollbar-width: none;
  }

  .scroller::-webkit-scrollbar {
    display: none;
  }

  .slide {
    position: relative;
    flex: 0 0 100%;
    scroll-snap-align: center;
    scroll-snap-stop: always;
    aspect-ratio: 16 / 10;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .slide :global(.frame) {
    background-color: transparent;
  }

  .slide iframe,
  .poster {
    display: block;
    width: 100%;
    height: 100%;
    border: 0;
  }

  .poster {
    object-fit: contain;
  }

  .arrow {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 4.4rem;
    height: 4.4rem;
    border: 0;
    border-radius: 50%;
    background-color: rgba(255, 255, 255, 0.92);
    box-shadow: 0 0.2rem 1rem rgba(0, 0, 0, 0.25);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      opacity 0.2s ease,
      background-color 0.2s ease;
  }

  .arrow:hover:not(:disabled) {
    background-color: var(--color-white);
  }

  .arrow:disabled {
    opacity: 0;
    pointer-events: none;
  }

  .arrow :global(i) {
    width: 1.2rem;
    height: 1.2rem;
  }

  .arrow :global(svg path) {
    stroke: var(--color-green);
  }

  .prev {
    left: 1.2rem;
  }

  .prev :global(i) {
    transform: rotate(180deg);
  }

  .next {
    right: 1.2rem;
  }

  .dots {
    display: flex;
    justify-content: center;
    gap: 0.7rem;
    margin-top: 1.4rem;
    flex-wrap: wrap;
  }

  .dot {
    width: 0.8rem;
    height: 0.8rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background-color: var(--color-gray);
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .dot.active {
    background-color: var(--color-orange);
  }
</style>
