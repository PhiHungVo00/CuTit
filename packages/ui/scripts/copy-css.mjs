// tsc không chép tệp .css; dist/mascot/CuTit.js có `import './cutit.css'` nên phải có CSS cạnh nó.
import { cpSync } from 'node:fs';
cpSync(new URL('../src/mascot/cutit.css', import.meta.url), new URL('../dist/mascot/cutit.css', import.meta.url));
