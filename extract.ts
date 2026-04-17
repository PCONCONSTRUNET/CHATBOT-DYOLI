import * as fs from 'fs';

const t = fs.readFileSync('docs.html', 'utf8');
const match = t.match(/<script id="__NEXT_DATA__" type="application\/json">(.+?)<\/script>/);
if (match) {
    fs.writeFileSync('nextdata.json', match[1]);
    console.log('Wrote nextdata.json');
} else {
    console.log('No next data');
}
