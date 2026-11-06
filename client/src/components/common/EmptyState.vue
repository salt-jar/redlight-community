<script setup lang="ts">
withDefaults(
  defineProps<{
    icon?: 'wheat' | 'book' | 'chat' | 'search' | 'bell';
    title?: string;
    desc?: string;
  }>(),
  { icon: 'wheat', title: '这里还空着', desc: '' },
);
</script>

<template>
  <div class="empty-state">
    <svg v-if="icon === 'wheat'" width="88" height="88" viewBox="0 0 88 88" fill="none" aria-hidden="true">
      <path d="M44 78V30" stroke="#D4AF37" stroke-width="2.5" stroke-linecap="round" />
      <path
        d="M44 48c-9 0-16-6-17-15 9-1 16 5 17 15Zm0 0c9 0 16-6 17-15-9-1-16 5-17 15Z"
        fill="#F4E7C1"
        stroke="#C8102E"
        stroke-width="1.6"
      />
      <path
        d="M44 35c-8 0-14-5-15-13 8-1 14 4 15 13Zm0 0c8 0 14-5 15-13-8-1-14 4-15 13Z"
        fill="#FFF1F0"
        stroke="#C8102E"
        stroke-width="1.6"
      />
      <circle cx="44" cy="22" r="3.5" fill="#C8102E" />
    </svg>
    <svg v-else-if="icon === 'book'" width="84" height="84" viewBox="0 0 84 84" fill="none" aria-hidden="true">
      <rect x="16" y="14" width="52" height="58" rx="4" fill="#FFF1F0" stroke="#C8102E" stroke-width="2" />
      <path d="M42 14v58" stroke="#C8102E" stroke-width="2" />
      <path d="M24 28h12M24 36h12M48 28h12M48 36h12" stroke="#D4AF37" stroke-width="2" stroke-linecap="round" />
    </svg>
    <svg v-else-if="icon === 'chat'" width="84" height="84" viewBox="0 0 84 84" fill="none" aria-hidden="true">
      <path
        d="M16 22a6 6 0 0 1 6-6h40a6 6 0 0 1 6 6v27a6 6 0 0 1-6 6H38L24 67V55h-2a6 6 0 0 1-6-6V22Z"
        fill="#FFF1F0"
        stroke="#C8102E"
        stroke-width="2"
      />
      <path d="M30 32h24M30 41h17" stroke="#D4AF37" stroke-width="2.4" stroke-linecap="round" />
    </svg>
    <svg v-else width="84" height="84" viewBox="0 0 84 84" fill="none" aria-hidden="true">
      <circle cx="38" cy="38" r="20" fill="#FFF1F0" stroke="#C8102E" stroke-width="2" />
      <path d="M53 53l14 14" stroke="#C8102E" stroke-width="2.6" stroke-linecap="round" />
      <path d="M30 38h16M38 30v16" stroke="#D4AF37" stroke-width="2.2" stroke-linecap="round" />
    </svg>
    <p class="empty-title">{{ title }}</p>
    <p v-if="desc" class="empty-desc">{{ desc }}</p>
    <slot />
  </div>
</template>
