import { build } from 'esbuild';
await build({
  entryPoints: ['transition/images/companions-3d.js'],
  outfile: 'transition/images/assets/companions-3d.bundle.js',
  bundle: true, format: 'esm', target: 'es2022', minify: true
});
console.log('Local hologram renderer updated.');
