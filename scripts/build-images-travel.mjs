import { build } from 'esbuild';

await build({
  entryPoints: ['transition/images/travel/travel.js'],
  outfile: 'transition/images/assets/travel-globe.bundle.js',
  bundle: true, format: 'esm', target: 'es2022', minify: true
});
console.log('Local travel globe renderer updated.');
