<script setup lang="ts">
import { computed, ref } from 'vue';
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue';

const props = defineProps<{ images: string[] }>();

const previewOpen = ref(false);
const activeIndex = ref(0);
const count = computed(() => props.images.length);

function openPreview(index: number) {
  activeIndex.value = index;
  previewOpen.value = true;
}

function prev() {
  activeIndex.value = (activeIndex.value - 1 + count.value) % count.value;
}

function next() {
  activeIndex.value = (activeIndex.value + 1) % count.value;
}
</script>

<template>
  <div v-if="images.length" class="image-grid" :class="`count-${Math.min(images.length, 9)}`" data-testid="post-images">
    <button
      v-for="(src, index) in images"
      :key="src"
      class="image-cell"
      type="button"
      :aria-label="`查看第 ${index + 1} 张图片`"
      @click="openPreview(index)"
    >
      <img :src="src" alt="" loading="lazy" />
      <span v-if="images.length > 3 && index === 8" class="image-more">+{{ images.length - 9 }}</span>
    </button>
  </div>

  <a-modal v-model:open="previewOpen" :footer="null" :width="880" centered wrap-class-name="image-preview-modal">
    <div class="preview-body">
      <img :src="images[activeIndex]" alt="" class="preview-image" />
      <button v-if="count > 1" class="preview-nav prev" type="button" aria-label="上一张" @click="prev">
        <LeftOutlined />
      </button>
      <button v-if="count > 1" class="preview-nav next" type="button" aria-label="下一张" @click="next">
        <RightOutlined />
      </button>
      <span class="preview-index">{{ activeIndex + 1 }} / {{ count }}</span>
    </div>
  </a-modal>
</template>

<style scoped>
.image-grid {
  display: grid;
  gap: 5px;
  margin-top: 10px;
  max-width: 520px;
}

.image-grid.count-1 {
  grid-template-columns: minmax(0, 260px);
}

.image-grid.count-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  max-width: 260px;
}

.image-grid.count-3,
.image-grid.count-4,
.image-grid.count-5,
.image-grid.count-6,
.image-grid.count-7,
.image-grid.count-8,
.image-grid.count-9 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
  max-width: 360px;
}

.image-cell {
  position: relative;
  overflow: hidden;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: #f6f1e9;
  cursor: zoom-in;
  aspect-ratio: 1 / 1;
}

.image-grid.count-1 .image-cell {
  aspect-ratio: 4 / 3;
}

.image-cell img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.25s ease;
}

.image-cell:hover img {
  transform: scale(1.03);
}

.image-more {
  position: absolute;
  right: 6px;
  bottom: 6px;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font-size: 12px;
}

.preview-body {
  position: relative;
  display: flex;
  min-height: 320px;
  align-items: center;
  justify-content: center;
  background: #1c1c1c;
  border-radius: 6px;
}

.preview-image {
  max-height: 78vh;
  max-width: 100%;
  object-fit: contain;
}

.preview-nav {
  position: absolute;
  top: 50%;
  display: flex;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  color: #fff;
  font-size: 16px;
  transform: translateY(-50%);
  cursor: pointer;
}

.preview-nav:hover {
  background: rgba(255, 255, 255, 0.3);
}

.preview-nav.prev {
  left: 12px;
}

.preview-nav.next {
  right: 12px;
}

.preview-index {
  position: absolute;
  bottom: 12px;
  left: 50%;
  padding: 2px 10px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.45);
  color: #fff;
  font-size: 12px;
  transform: translateX(-50%);
}

@media (max-width: 767px) {
  .image-grid,
  .image-grid.count-1 {
    max-width: none;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .image-grid.count-1 {
    grid-template-columns: minmax(0, 240px);
  }
}
</style>
