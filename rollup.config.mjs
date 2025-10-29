import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import typescript from '@rollup/plugin-typescript';

export default {
  input: 'src/index-web.ts',        // viz níže
  output: [
    { file: 'dist/brnoscript.browser.js', format: 'iife', name: 'BrnoSkript' }, // window.BrnoSkript
    { file: 'dist/brnoscript.browser.esm.js', format: 'esm' }                   // importable ESM
  ],
  plugins: [resolve({ browser: true }), commonjs(), typescript({ tsconfig: './tsconfig.json' })]
};