import fs from 'fs';
const path = 'src/admin/public/index.html';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/\\\$\{/g, '${');
content = content.replace(/\\\`/g, '`');
fs.writeFileSync(path, content);
console.log('Fixed backslashes in index.html');
