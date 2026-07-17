<script lang="ts">
  import { Icon } from '.';
  // Intended for hover states when ellipsis is enabled.

  interface Props {
    icon?: undefined | string;
    /**
     * Content rendered before the label as an alternative to `icon`, sharing the
     * same horizontal margin. When set, it takes precedence over `icon`.
     */
    leading?: import('svelte').Snippet;
    /**
     * A form control (e.g. a checkbox/radio `<input>`) rendered *inside* the `<label>`, so
     * clicking anywhere in the label natively toggles it — no click handlers needed. When set,
     * `labelFor` is dropped: nesting already associates the two, and pairing it with a `for` to
     * the same control would be redundant.
     */
    input?: import('svelte').Snippet;
    labelFor?: undefined | string;
    ellipsis?: boolean;
    compact?: boolean;
    // TODO: This could be made more accessible.
    title?: undefined | string;
    children?: import('svelte').Snippet;
  }

  let {
    icon = undefined,
    leading = undefined,
    input = undefined,
    labelFor = undefined,
    ellipsis = false,
    compact = false,
    title = undefined,
    children
  }: Props = $props();
</script>

<label for={input ? undefined : labelFor} class:compact>
  {@render input?.()}
  {#if leading}
    <div class="leading">{@render leading()}</div>
  {:else if icon}
    <div class="icon">
      <Icon {icon} />
    </div>
  {/if}
  <span class="label" title={ellipsis ? title : undefined} class:ellipsis
    >{@render children?.()}</span
  >
</label>

<style>
  label {
    background-image: var(--icon);
    background-position: left center;
    background-repeat: no-repeat;
    display: flex;
    align-items: center;
    cursor: pointer;
    min-width: 0;
    /* Fill the available width in the flex row so the whole label area (not just the
       text) is a click target for the checkbox it points at. Only grows into space the
       container actually has, so content-width containers are unaffected. */
    flex: 1;
  }

  .label {
    width: 100%;
  }

  /* Horizontal margin shared by the icon and its `leading` alternative, so both
     provide the same (clickable) separation between preceding content and the label. */
  .icon,
  .leading {
    margin: 0 0.5rem;
  }

  .icon {
    height: 2rem;
    width: 2rem;
    padding-right: 0.2rem;
    display: inline-block;
  }

  .leading {
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .icon :global(svg path.cls-1) {
    fill: var(--color-green);
  }

  .ellipsis {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .compact .icon {
    width: 2.6rem;
    height: 2.6rem;
  }

  @media screen and (max-width: 700px) {
    .icon {
      height: 3rem;
      width: 3rem;
    }
    .icon,
    .leading {
      margin-right: 0.4rem;
    }
  }
</style>
