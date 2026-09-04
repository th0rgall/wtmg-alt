<script lang="ts">
  import { _ } from 'svelte-i18n';
  import { onMount, tick } from 'svelte';
  import { page } from '$app/state';
  import { pushState, replaceState } from '$app/navigation';
  import { Button } from '$lib/components/UI';
  import Spinner from '$lib/components/UI/Spinner.svelte';
  import MarketingStyleWrapper from '$lib/components/Marketing/MarketingStyleWrapper.svelte';
  import PaddedSection from '$lib/components/Marketing/PaddedSection.svelte';
  import routes from '$lib/routes';
  import { lr } from '$lib/util/translation-helpers';
  import createUrl from '$lib/util/create-url';
  import { getStories, STORIES_PAGE_SIZE } from '$lib/api/stories';
  import type { Story } from '$lib/types/Story';
  import StoryCard from './StoryCard.svelte';
  import StoryModal from './StoryModal.svelte';

  /**
   * The query parameter that identifies the open story.
   *
   * The modal is shallow-routed: opening a story pushes a history entry with the
   * story in `page.state`, so Back closes it. Keeping the story ID in the URL
   * (rather than in a `/stories/{id}` sub-route) means a shared or reloaded link
   * still lands on a real, prerendered page.
   */
  const STORY_PARAM = 'story';

  let stories = $state<Story[]>([]);
  let hasMore = $state(true);
  let isLoading = $state(false);
  let hasError = $state(false);

  // The offset counts backend rows, which is not the same as `stories.length`:
  // empty stories are filtered out client-side.
  let offset = 0;
  let openedViaPush = false;

  let openStory = $derived(page.state.story);
  let storyUrl = $derived((story: Story) =>
    createUrl($lr(routes.STORIES), { [STORY_PARAM]: story.id })
  );

  const loadNextPage = async () => {
    if (isLoading || !hasMore) return;
    isLoading = true;
    hasError = false;
    try {
      const result = await getStories({ limit: STORIES_PAGE_SIZE, offset });
      stories = [...stories, ...result.stories];
      offset += STORIES_PAGE_SIZE;
      hasMore = result.hasMore;
    } catch {
      hasError = true;
      // Don't keep hammering a failing backend; the retry button resets this.
      hasMore = false;
    } finally {
      isLoading = false;
    }
  };

  const retry = () => {
    hasMore = true;
    loadNextPage();
  };

  /**
   * Restores the modal for a `?story=<id>` link on a fresh page load, paging
   * through the timeline until that story shows up.
   */
  const restoreOpenStory = async (id: string) => {
    let story = stories.find((candidate) => candidate.id === id);
    while (!story && hasMore && !hasError) {
      await loadNextPage();
      story = stories.find((candidate) => candidate.id === id);
    }
    // The router isn't ready during mount itself.
    await tick();
    if (story) {
      replaceState(createUrl($lr(routes.STORIES), { [STORY_PARAM]: id }), {
        story: $state.snapshot(story)
      });
    } else {
      // Unknown or removed story: drop the dangling parameter
      replaceState($lr(routes.STORIES), {});
    }
  };

  const selectStory = (story: Story) => (event: MouseEvent) => {
    // Leave modified and non-primary clicks to the browser, so "open in new tab"
    // keeps working on the shareable URL.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    // A snapshot, not the reactive proxy: page state has to survive structuredClone.
    pushState(storyUrl(story), { story: $state.snapshot(story) });
    openedViaPush = true;
  };

  const closeStory = () => {
    if (openedViaPush) {
      openedViaPush = false;
      // Keeps the Back button and the close button in sync
      history.back();
    } else {
      replaceState($lr(routes.STORIES), {});
    }
  };

  $effect(() => {
    if (!page.state.story) openedViaPush = false;
  });

  onMount(async () => {
    await loadNextPage();
    const deepLinkedId = page.url.searchParams.get(STORY_PARAM);
    if (deepLinkedId) {
      await restoreOpenStory(deepLinkedId);
    }
  });
</script>

<svelte:head>
  <title>{$_('stories.title')} | {$_('generics.wtmg.explicit')}</title>
  <meta name="description" content={$_('stories.description')} />
</svelte:head>

<MarketingStyleWrapper>
  <PaddedSection>
    <header class="intro">
      <h1>{$_('stories.title')}</h1>
      <p>{$_('stories.description')}</p>
    </header>

    {#if stories.length > 0}
      <ul class="timeline">
        {#each stories as story (story.id)}
          <li>
            <StoryCard {story} href={storyUrl(story)} onselect={selectStory(story)} />
          </li>
        {/each}
      </ul>
    {/if}

    <div class="status">
      {#if isLoading}
        <Spinner />
      {:else if hasError}
        <p>{$_('stories.error')}</p>
        <Button uppercase orange onclick={retry}>{$_('stories.retry')}</Button>
      {:else if stories.length === 0}
        <p>{$_('stories.empty')}</p>
      {:else if hasMore}
        <Button uppercase orange arrow onclick={loadNextPage}>{$_('stories.load-more')}</Button>
      {/if}
    </div>
  </PaddedSection>
</MarketingStyleWrapper>

{#if openStory}
  <StoryModal story={openStory} onclose={closeStory} />
{/if}

<style>
  .intro {
    max-width: 70rem;
    margin-bottom: 4rem;
  }

  .intro p {
    margin-bottom: 0;
  }

  .timeline {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 3rem;
    /* Cards keep their natural height instead of stretching to the tallest
       card in their row */
    align-items: start;
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1.5rem;
    margin-top: 4rem;
    min-height: 4rem;
  }

  .status p {
    margin-bottom: 0;
    text-align: center;
  }

  @media screen and (max-width: 700px) {
    .timeline {
      grid-template-columns: minmax(0, 1fr);
      gap: 2rem;
    }

    .intro {
      margin-bottom: 3rem;
    }
  }
</style>
