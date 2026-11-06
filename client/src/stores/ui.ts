import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const composerOpen = ref(false);

  function openComposer() {
    composerOpen.value = true;
  }

  function closeComposer() {
    composerOpen.value = false;
  }

  return { composerOpen, openComposer, closeComposer };
});
