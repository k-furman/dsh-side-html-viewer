import { defineConfig } from 'tsdown'

const id = 'dsh-side-html-viewer'

export default defineConfig({
  entry: { client: 'src/client/tab.tsx' },
  format: ['cjs'],
  outDir: 'lib',
  outExtensions: () => ({ js: '.js' }),
  dts: false,
  clean: false,
  external: ['react', 'react-dom', 'react/jsx-runtime', '@deepseek-ai/cordis'],
  banner: `window.__ModuleLoader__.load({\n\tid: "${id}",\n\tfactory: (require) => {\n\tvar module = { exports: {} };\n\tvar exports = module.exports;`,
  footer: 'return module.exports; }\n});',
})
