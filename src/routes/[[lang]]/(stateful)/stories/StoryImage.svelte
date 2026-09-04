<script lang="ts">
  import type { StoryMedia } from '$lib/types/Story';
  import { imageFallbackUrl, imageSources, imageThumbUrl } from '$lib/util/story-media';

  interface Props {
    storyId: string;
    media: StoryMedia;
    /**
     * The `sizes` attribute: how wide this image renders, per breakpoint.
     * Needed for the browser to pick the right derivative from the srcset.
     */
    sizes: string;
    alt?: string;
    loading?: 'lazy' | 'eager';
    /**
     * `cover` crops to fill the frame (timeline cards), `contain` fits the whole
     * image inside it (the modal gallery).
     */
    fit?: 'cover' | 'contain';
  }

  let { storyId, media, sizes, alt = '', loading = 'lazy', fit = 'cover' }: Props = $props();

  let sources = $derived(imageSources(storyId, media));
  // The 48px thumbnail is always generated, so it makes a cheap blurred placeholder
  // while the full-size derivative is still loading.
  let placeholder = $derived(imageThumbUrl(storyId, media));
  let loaded = $state(false);
</script>

<div class="frame">
  <div class="placeholder" class:loaded style:background-image="url({placeholder})"></div>
  <picture>
    {#each sources as source (source.type)}
      <source type={source.type} srcset={source.srcset} {sizes} />
    {/each}
    <img
      src={imageFallbackUrl(storyId, media)}
      {sizes}
      {alt}
      {loading}
      decoding="async"
      class:loaded
      style:object-fit={fit}
      onload={() => (loaded = true)}
    />
  </picture>
</div>

<style>
  .frame {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: var(--color-beige-light);
  }

  .placeholder {
    position: absolute;
    inset: 0;
    background-size: cover;
    background-position: center;
    /* Smooth over the 48px thumbnail being upscaled. The scale hides the
       transparent edges the blur would otherwise leave behind. */
    filter: blur(1.2rem);
    transform: scale(1.15);
    transition: opacity 0.3s ease;
  }

  .placeholder.loaded {
    opacity: 0;
  }

  picture {
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  img.loaded {
    opacity: 1;
  }
</style>
