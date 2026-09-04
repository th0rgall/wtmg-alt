<script lang="ts">
  import { _, locale } from 'svelte-i18n';
  import { Modal } from '$lib/components/UI';
  import { DEFAULT_LANGUAGE } from '$lib/types/general';
  import type { Story } from '$lib/types/Story';
  import { formatLongDate } from '$lib/util/format-date';
  import StoryGallery from './StoryGallery.svelte';
  import StoryText from './StoryText.svelte';

  interface Props {
    story: Story;
    onclose: () => void;
  }

  let { story, onclose }: Props = $props();

  // `date` is a naive timestamp (no zone), which JS parses as local time.
  let formattedDate = $derived(
    story.date ? formatLongDate(new Date(story.date), $locale ?? DEFAULT_LANGUAGE) : null
  );
</script>

<Modal
  {onclose}
  maxWidth="800px"
  maxHeight="calc(var(--vh, 1vh) * 100 - 8rem)"
  center
  shrinkableBody
  ariaLabel={$_('stories.modal-label')}
>
  {#snippet title()}
    {#if formattedDate}
      <span class="date">{formattedDate}</span>
    {/if}
  {/snippet}
  {#snippet body()}
    <div class="scroll-area">
      {#if story.media?.length}
        <StoryGallery storyId={story.id} media={story.media} />
      {/if}
      {#if story.story_text}
        <div class="text">
          <StoryText md={story.story_text} />
        </div>
      {/if}
    </div>
  {/snippet}
</Modal>

<style>
  .date {
    font-family: var(--fonts-copy);
    font-size: 1.3rem;
    font-weight: 600;
    letter-spacing: 0.1rem;
    line-height: 3rem;
    text-transform: uppercase;
    color: var(--color-orange);
  }

  .scroll-area {
    height: 100%;
    overflow-y: auto;
    /* Room for the scrollbar, so text doesn't sit right against it */
    padding-right: 0.4rem;
  }

  .text {
    margin-top: 2.4rem;
  }
</style>
