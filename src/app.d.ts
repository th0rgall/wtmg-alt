// See https://svelte.dev/docs/kit/types#app.d.ts
//
declare namespace App {
  interface PageState {
    showMembershipModal?: boolean;
    /**
     * The story shown in the shallow-routed story modal on /stories.
     */
    story?: import('$lib/types/Story').Story;
  }
}
