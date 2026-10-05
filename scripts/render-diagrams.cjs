const fs=require('fs');const sharp=require('/Users/Darsh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp');
(async()=>{for(const name of fs.readdirSync('docs/diagrams').filter(f=>f.endsWith('.svg')))await sharp('docs/diagrams/'+name,{density:180}).png().toFile('docs/diagrams/'+name.replace('.svg','.png'));console.log('Diagram PNGs rendered');})();
