import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUiStore = defineStore('ui', () => {
  const composerOpen = ref(false);
  const profileEditorOpen = ref(false);

  function openComposer() {
    composerOpen.value = true;
  }

  function closeComposer() {
    composerOpen.value = false;
  }

  function openProfileEditor() {
    profileEditorOpen.value = true;
  }

  function closeProfileEditor() {
    profileEditorOpen.value = false;
  }

  return {
    composerOpen,
    profileEditorOpen,
    openComposer,
    closeComposer,
    openProfileEditor,
    closeProfileEditor,
  };
});
