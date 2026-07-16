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
    /**
     * Fires only on *keyboard* toggles (Space on the focused checkbox). Pointer clicks toggle
     * through `checked` (see the row handler below), so prefer `bind:checked` to observe state.
     */
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

<!-- The whole row (except the secondary button) is one toggle target: the checkbox subtree is
     pointer-events:none (see styles), so every pointer click lands here and flips `checked`
     exactly once — no native checkbox/label toggle to double up with. Keyboard toggling is
     unaffected: the checkbox stays focusable and Space fires its native change through the
     LabeledCheckbox `bind:checked` below. -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="multi-action-label"
  onclick={(e) => {
    if (!disabled) checked = !checked;
    // Prevent the toggle header from closing
    e.stopPropagation();
  }}
>
  <LabeledCheckbox ellipsis {name} {label} {disabled} {oninput} bind:checked {onchange} {leading} />
  <button
    class="button-unstyle secondary"
    onclick={(e) => {
      e.preventDefault();
      e.stopPropagation();
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
    padding: 0.5rem 0;
    cursor: pointer;
  }

  /* The checkbox + label are display-only for pointer input: clicks pass through to the row
     handler, so a single click never both toggles natively and via the handler. Keyboard
     focus/activation is unaffected — `pointer-events` doesn't touch it. The secondary button
     sits outside this container, so it keeps its own pointer handling. */
  .multi-action-label :global(.checkbox-container) {
    pointer-events: none;
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
