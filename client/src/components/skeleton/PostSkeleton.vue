<template>
  <div class="post-skeleton">
    <div class="skeleton-head">
      <span class="skeleton-block avatar"></span>
      <span class="skeleton-lines">
        <span class="skeleton-block line short"></span>
        <span class="skeleton-block line tiny"></span>
      </span>
    </div>
    <span class="skeleton-block line"></span>
    <span class="skeleton-block line"></span>
    <span class="skeleton-block line medium"></span>
  </div>
</template>

<style scoped>
.post-skeleton {
  margin-bottom: 12px;
  padding: 16px;
  background: #fff;
  border-radius: var(--rl-radius-card);
  box-shadow: var(--rl-shadow);
}

.skeleton-head {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
}

.skeleton-lines {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.skeleton-block {
  display: block;
  height: 12px;
  border-radius: 4px;
  background: linear-gradient(90deg, #f1ece4 25%, #faf7f2 37%, #f1ece4 63%);
  background-size: 400% 100%;
  animation: skeleton-loading 1.4s ease infinite;
}

.skeleton-block.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.skeleton-block.line {
  width: 100%;
  margin-bottom: 8px;
}

.skeleton-block.short {
  width: 32%;
}

.skeleton-block.tiny {
  width: 18%;
  height: 10px;
}

.skeleton-block.medium {
  width: 66%;
}

@keyframes skeleton-loading {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
