const fs=require('fs');const sharp=require('sharp');
(async()=>{for(const name of fs.readdirSync('docs/diagrams').filter(f=>f.endsWith('.svg')))await sharp('docs/diagrams/'+name,{density:180}).png().toFile('docs/diagrams/'+name.replace('.svg','.png'));console.log('Diagram PNGs rendered');})();
