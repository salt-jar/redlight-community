<script setup lang="ts">
import zhCN from 'ant-design-vue/es/locale/zh_CN';

const themeConfig = {
  token: {
    colorPrimary: '#C8102E',
    colorInfo: '#C8102E',
    colorLink: '#C8102E',
    colorSuccess: '#52A350',
    colorWarning: '#D4AF37',
    colorError: '#C8102E',
    colorTextBase: '#2C2C2C',
    colorBgBase: '#FAF8F5',
    borderRadius: 6,
    fontFamily:
      '"Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", "Helvetica Neue", Arial, sans-serif',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
  },
  components: {
    Button: { borderRadius: 6, controlHeight: 36 },
    Card: { borderRadiusLG: 8 },
    Modal: { borderRadiusLG: 8 },
    Input: { borderRadius: 6 },
    Select: { borderRadius: 6 },
    Tabs: { itemSelectedColor: '#C8102E', inkBarColor: '#C8102E' },
  },
};
</script>

<template>
  <a-config-provider :locale="zhCN" :theme="themeConfig">
    <router-view />
  </a-config-provider>
</template>
