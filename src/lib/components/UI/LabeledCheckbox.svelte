<script lang="ts">
  import LabelWithIcon from './LabelWithIcon.svelte';
  interface Props {
    name: string;
    icon?: undefined | string;
    /**
     * Choose a label or a slot
     */
    label?: string | undefined;
    checked?: boolean;
    disabled?: boolean;
    ellipsis?: boolean;
    compact?: boolean;
    title?: undefined | string;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    /** Optional content rendered between the checkbox and the label. */
    leading?: import('svelte').Snippet;
    children?: import('svelte').Snippet;
  }

  let {
    name,
    icon = undefined,
    label = undefined,
    // Can't have a default value because some component users
    // initialize it with undefined
    checked = $bindable(),
    disabled = false,
    ellipsis = false,
    compact = false,
    title = undefined,
    onchange,
    oninput,
    leading,
    children
  }: Props = $props();
</script>

<!-- The checkbox lives *inside* the label (via LabelWithIcon's `input` snippet), so clicking
     anywhere in the label natively toggles it — no click handlers or propagation hacks needed. -->
<div class="checkbox-container" class:compact>
  <LabelWithIcon {ellipsis} {compact} title={label} {icon} {leading}>
    {#snippet input()}
      <input id={name} type="checkbox" {disabled} {name} {oninput} bind:checked {onchange} />
    {/snippet}
    {label ?? ''}{@render children?.()}
  </LabelWithIcon>
</div>

<style>
  .checkbox-container {
    display: flex;
    align-items: center;
    margin: 0.1rem 0;
    font-size: var(--controls-font-size);
    /* Make sure that titles that are too long can get collapsed */
    min-width: 0;
    flex-grow: 1;
  }

  input {
    margin-right: 1rem;
    cursor: pointer;
  }

  @media screen and (max-width: 700px) {
    .checkbox-container {
      margin: var(--controls-vert-margin) 0;
      padding: var(--controls-vert-padding) 0;
    }

    .checkbox-container.compact {
      margin: calc(0.5 * var(--controls-vert-margin)) 0;
      padding: calc(0.25 * var(--controls-vert-padding)) 0;
    }

    input {
      width: 2.1rem;
      height: 2.1rem;
    }
  }
</style>
