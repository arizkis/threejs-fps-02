import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const root=fileURLToPath(new URL('.',import.meta.url));
const out=resolve(process.env.MAKEFUN_OUTPUT_DIR||join(root,'output'));
mkdirSync(out,{recursive:true});
cpSync(join(root,'game'),join(out,'game'),{recursive:true});
mkdirSync(join(out,'screenshots'),{recursive:true});
if(existsSync(join(root,'screenshots')))cpSync(join(root,'screenshots'),join(out,'screenshots'),{recursive:true});
writeFileSync(join(out,'dossier.json'),buildDossier(out,{
 text_max_bytes:163840,screenshots:{max:4,max_bytes:262144},game_max_files:993,game_max_bytes:50331648,
}));
