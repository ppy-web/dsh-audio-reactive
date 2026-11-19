import { copyFile, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

const id = 'dsh-audio-reactive'
const upstream = new URL('../lib/upstream/', import.meta.url)
const analyzerSource = new URL(import.meta.resolve('audiomotion-analyzer'))

await build({
  entryPoints: ['src/client.jsx'],
  outfile: 'lib/client.js',
  platform: 'browser',
  format: 'cjs',
  target: 'es2022',
  bundle: true,
  minify: true,
  external: ['react', 'react-dom'],
  loader: { '.css': 'text' },
  banner: { js: `window.__ModuleLoader__.load({ id: '${id}', factory(require) { const module = { exports: {} };` },
  footer: { js: 'return module.exports; } });' },
})

await mkdir(upstream, { recursive: true })
await Promise.all([
  copyFile(analyzerSource, new URL('audioMotion-analyzer.js', upstream)),
  copyFile(new URL('../LICENSE', analyzerSource), new URL('audioMotion-LICENSE.txt', upstream)),
])
