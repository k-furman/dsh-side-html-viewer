import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { index: 'src/index.ts' },
  format: ['es'],
  outDir: 'lib',
  outExtensions: () => ({ js: '.js' }),
  dts: false,
  clean: false,
})
