<!-- @component
  One-off circular icon button used by `InfoBox.svelte` to expand the collapsed
  info box (a chevron-up in a circle). Mirrors the outlined, round look of the
  modal close button.
-->
<script lang="ts">
  import { Icon } from '$lib/components/UI';

  interface Props {
    icon: object[] | string;
    ariaLabel: string;
    onclick?: (e: MouseEvent) => void;
  }

  let { icon, ariaLabel, onclick }: Props = $props();
</script>

<button type="button" class="circle-button" aria-label={ariaLabel} {onclick}>
  <Icon {icon} />
</button>

<style>
  .circle-button {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 3.4rem;
    height: 3.4rem;
    padding: 0;
    border: 1.5px solid var(--color-green);
    border-radius: 50%;
    background-color: var(--color-white);
    color: var(--color-green);
    cursor: pointer;
    transition: background-color 200ms ease;
  }

  .circle-button :global(i) {
    width: 1.4rem;
    height: 1.4rem;
  }

  .circle-button:hover,
  .circle-button:focus {
    background-color: var(--color-green);
    color: var(--color-white);
    outline: 0;
  }
</style>
