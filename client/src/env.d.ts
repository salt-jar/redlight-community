/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>;
  export default component;
}

declare module 'epubjs' {
  const ePub: (url: string, options?: Record<string, unknown>) => any;
  export default ePub;
}

declare module '*?url' {
  const src: string;
  export default src;
}
