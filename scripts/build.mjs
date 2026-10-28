import { build as viteBuild } from 'vite';
import { build as esbuild } from 'esbuild';

async function runBuild() {
  console.log('1/3 Building HTML pages & static assets with Vite...');
  await viteBuild();

  console.log('2/3 Bundling Background Service Worker (dist/background.js)...');
  await esbuild({
    entryPoints: ['src/background/main.ts'],
    bundle: true,
    outfile: 'dist/background.js',
    format: 'esm',
    target: 'es2022',
    minify: false,
  });

  console.log('3/3 Bundling Content Script (dist/content.js)...');
  await esbuild({
    entryPoints: ['src/content/main.ts'],
    bundle: true,
    outfile: 'dist/content.js',
    format: 'iife',
    target: 'es2022',
    minify: false,
  });

  console.log('Bark extension build complete in dist/');
}

runBuild().catch((err) => {
  console.error(err);
  process.exit(1);
});
