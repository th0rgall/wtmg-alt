<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { getContext, onMount, onDestroy } from 'svelte';
  import mapboxgl from 'mapbox-gl';
  import key from './mapbox-context.js';
  import type { ContextType } from './Map.svelte';
  import type { Garden, GardenPhoto } from '$lib/types/Garden';
  import { getGardenPhotoSmall } from '$lib/api/garden';
  import { getPublicUserProfile } from '$lib/api/user';
  import { Image } from '../UI';
  import Icon from '$lib/components/UI/Icon.svelte';
  import { chevronRightIcon, crossIcon, tentPhosphor } from '$lib/images/icons';
  import { clickOutside } from '$lib/attachments';
  import logger from '$lib/util/logger';

  interface Props {
    /** The overlapping gardens that were hit by a single click. */
    gardens: Garden[];
    /** Geographic anchor (the clicked location), so the menu tracks the map when it pans. */
    lngLat: [number, number];
    /** Opens the GardenDrawer for a garden. Does NOT close this menu. */
    onSelectGarden: (garden: Garden) => void;
    /** Closes this menu. */
    onClose: () => void;
  }

  let { gardens, lngLat, onSelectGarden, onClose }: Props = $props();

  const { getMap } = getContext<ContextType>(key);
  const map = getMap();

  let menuElement = $state<HTMLElement>();
  let marker: mapboxgl.Marker | undefined;

  onMount(() => {
    // Bind our Svelte-rendered DOM node to the map. The marker keeps the menu anchored to the
    // clicked location while the map pans/zooms. We anchor its bottom just above the icons.
    marker = new mapboxgl.Marker({
      element: menuElement,
      anchor: 'bottom',
      offset: [0, -22]
    })
      .setLngLat(lngLat)
      .addTo(map);
  });

  onDestroy(() => {
    marker?.remove();
  });

  // Keep the anchor in sync if the click location changes while the menu stays open.
  $effect(() => {
    if (marker) marker.setLngLat(lngLat);
  });

  /**
   * Loads the details needed for one row: the host's first name and a small photo thumbnail.
   * Mirrors how the GardenDrawer resolves these (public profile + small storage photo).
   */
  async function loadRow(garden: Garden): Promise<{ firstName: string; photoUrl: string | null }> {
    let firstName = '';
    let photoUrl: string | null = null;
    try {
      const profile = await getPublicUserProfile(garden.id);
      firstName = profile.firstName;
    } catch (ex) {
      logger.warn('Could not load garden host profile for context menu', ex);
    }
    try {
      if (garden.localPhotoData) {
        photoUrl = garden.localPhotoData;
      } else if (garden.photo) {
        photoUrl = await getGardenPhotoSmall({ ...garden, id: garden.id } as GardenPhoto);
      }
    } catch (ex) {
      logger.warn('Could not load garden photo for context menu', ex);
    }
    return { firstName, photoUrl };
  }

  // Compute the (stable-while-open) per-row promises. Recomputes only when `gardens` changes.
  let rows = $derived(gardens.map((garden) => ({ garden, data: loadRow(garden) })));
</script>

<!-- clickOutside dispatches in the capture phase, before Mapbox's own (bubble-phase) click
     handler, so an outside click closes this menu first; if it also lands on overlapping gardens,
     the garden click handler then reopens a fresh menu. Clicks on the menu itself don't fire it. -->
<div
  class="garden-context-menu"
  bind:this={menuElement}
  {@attach clickOutside}
  onclickoutside={onClose}
>
  <button class="close" type="button" aria-label={$_('generics.close')} onclick={onClose}>
    <Icon icon={crossIcon} />
  </button>
  <ul>
    {#each rows as { garden, data } (garden.id)}
      <li>
        <button class="row" type="button" onclick={() => onSelectGarden(garden)}>
          {#await data}
            <span class="thumb"></span>
            <span class="name"></span>
          {:then { firstName, photoUrl }}
            <span class="thumb">
              {#if photoUrl}
                <Image src={photoUrl} alt={$_('generics.garden')} />
              {:else}
                <span class="thumb-placeholder">
                  <Icon icon={tentPhosphor} />
                </span>
              {/if}
            </span>
            <span class="name notranslate">{firstName}</span>
          {/await}
          <span class="chevron">
            <Icon icon={chevronRightIcon} />
          </span>
        </button>
      </li>
    {/each}
  </ul>
</div>

<style>
  .garden-context-menu {
    position: relative;
    background-color: white;
    border-radius: 0.8rem;
    box-shadow: 0px 4px 14px rgba(0, 0, 0, 0.18);
    font-family: var(--fonts-copy);
    min-width: 20rem;
    max-width: 26rem;
    padding: 0.6rem 0;
    /* The marker element is centered on the anchor point by mapbox; make sure clicks land on us. */
    cursor: default;
  }

  .close {
    position: absolute;
    top: -1rem;
    right: -1rem;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.4rem;
    height: 2.4rem;
    padding: 0.4rem;
    border: none;
    border-radius: 50%;
    background-color: var(--color-gray-bg);
    box-shadow: 0px 2px 6px rgba(0, 0, 0, 0.15);
    cursor: pointer;
  }
  .close:hover {
    background-color: var(--color-gray);
  }
  .close :global(i) {
    width: 1.6rem;
    height: 1.6rem;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: 26rem;
    overflow-y: auto;
  }

  li:not(:last-child) {
    border-bottom: 1px solid var(--color-gray-bg);
  }

  .row {
    display: flex;
    align-items: center;
    gap: 1rem;
    width: 100%;
    padding: 0.8rem 1.2rem;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font-family: var(--fonts-copy);
  }
  .row:hover {
    background-color: var(--color-gray-bg);
  }

  .thumb {
    flex: 0 0 auto;
    width: 4rem;
    height: 4rem;
    border-radius: 0.6rem;
    overflow: hidden;
    background-color: var(--color-beige);
  }

  .thumb-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
  }
  .thumb-placeholder :global(i) {
    width: 2rem;
    height: 2rem;
  }

  .name {
    flex: 1 1 auto;
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--color-black);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .chevron {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.8rem;
    height: 1.8rem;
  }
  .chevron :global(i path) {
    stroke: var(--color-darker-gray);
  }
</style>
