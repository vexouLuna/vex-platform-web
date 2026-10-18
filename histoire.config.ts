import { HstVue } from '@histoire/plugin-vue'
import { defineConfig } from 'histoire'

export default defineConfig({
  plugins: [HstVue()],
  setupFile: 'stories/setup.ts',
  storyMatch: ['stories/**/*.story.vue'],
  theme: { title: '@vex/platform-web' },
  vite: { server: { port: 6007 } },
})
