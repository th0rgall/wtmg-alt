<script lang="ts">
  import { LabeledCheckbox } from '$lib/components/UI';
  import Icon from '$lib/components/UI/Icon.svelte';
  import { crossIcon } from '$lib/images/icons';

  interface Props {
    name: string;
    icon?: null | string;
    label: string;
    checked?: boolean;
    disabled?: boolean;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
    onsecondary: (e: MouseEvent) => void;
    /** Optional content rendered between the checkbox and the label. */
    leading?: import('svelte').Snippet;
  }

  let {
    name,
    icon = null,
    label,
    checked = $bindable(false),
    disabled = false,
    oninput,
    onchange,
    onsecondary,
    leading
  }: Props = $props();
</script>

<!-- The checkbox is nested in its label (see LabeledCheckbox), so the label toggles it
     natively — no click handlers here. The label fills the row up to the secondary button (see
     styles), making the whole row — except that button — one native click target. -->
<div class="multi-action-label">
  <LabeledCheckbox ellipsis {name} {label} {disabled} {oninput} bind:checked {onchange} {leading} />
  <button
    class="button-unstyle secondary"
    onclick={(e) => {
      e.preventDefault();
      onsecondary(e);
    }}
  >
    <Icon icon={crossIcon} />
  </button>
</div>

<style>
  .multi-action-label {
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  /* Give the label (not the row) the vertical padding and let it fill the row width, so a click
     anywhere left of the secondary button lands on the label and toggles the checkbox natively.
     Same total row height as the previous `padding: 0.5rem 0` on the row. */
  .multi-action-label :global(.checkbox-container label) {
    padding: 0.2rem 0;
    /* TODO: otherwise a g might get cut off below
    maybe this should be also applied to other instances */
    line-height: normal;
  }

  .secondary {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2rem;
    height: 2rem;
    color: var(--color-text);
  }
</style>
