<script setup lang="ts">
import AppHeader from '@/components/layout/AppHeader.vue';
import SideNav from '@/components/layout/SideNav.vue';
import RightSidebar from '@/components/layout/RightSidebar.vue';
import MobileTabBar from '@/components/layout/MobileTabBar.vue';

withDefaults(defineProps<{ showRight?: boolean }>(), { showRight: true });
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <div class="app-body" :class="{ 'no-right': !showRight }">
      <SideNav />
      <main class="app-main">
        <slot />
      </main>
      <RightSidebar v-if="showRight" />
    </div>
    <MobileTabBar />
  </div>
</template>
