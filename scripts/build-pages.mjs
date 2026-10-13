import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
const origin = process.env.API_BASE;
if (!origin || new URL(origin).protocol !== 'https:') throw Error('API_BASE deve conter o endereço HTTPS do servidor.');
mkdirSync('dist', {recursive:true});
for(const file of ['index.html','app.js','style.css']) copyFileSync('public/'+file,'dist/'+file);
writeFileSync('dist/config.js',`export const API_BASE = ${JSON.stringify(new URL(origin).origin)};\n`);
writeFileSync('dist/.nojekyll','');
