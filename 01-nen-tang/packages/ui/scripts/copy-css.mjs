// tsc không chép tệp .css; dist/mascot/CuTit.js có `import './cutit.css'` nên phải có CSS cạnh nó.
// Ghi đè bằng writeFileSync (cpSync gặp EPERM khi unlink bản cũ trên Windows).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
mkdirSync(new URL('../dist/mascot/', import.meta.url), { recursive: true });
writeFileSync(new URL('../dist/mascot/cutit.css', import.meta.url), readFileSync(new URL('../src/mascot/cutit.css', import.meta.url)));
