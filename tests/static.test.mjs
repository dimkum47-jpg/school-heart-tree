import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');
test('PWA shell and installation metadata exist and point to real files',()=>{
  const html=read('web/index.html');const manifest=JSON.parse(read('web/manifest.webmanifest'));
  assert.match(html,/rel="manifest"/);assert.match(html,/name="viewport"/);
  assert.match(html,/id="fruitDialog"/);assert.match(html,/data-nav="officer"/);
  assert.equal(manifest.display,'standalone');assert.equal(manifest.lang,'ko');
  for(const icon of manifest.icons){
    const file=fs.readFileSync(path.join(root,'web',icon.src));
    assert.equal(file.subarray(1,4).toString(),'PNG');
    const size=Number(icon.sizes.split('x')[0]);
    assert.equal(file.readUInt32BE(16),size);assert.equal(file.readUInt32BE(20),size);
  }
  assert.ok(fs.statSync(path.join(root,'web/assets/heart-tree.webp')).size>30000);
});
test('PWA avoids caching API or private login data',()=>{
  const sw=read('web/sw.js');
  assert.match(sw,/method\s*!==\s*'GET'/);assert.match(sw,/u.origin!==self.location.origin/);
  assert.match(sw,/pathname.includes\('\/api\/'\)/);
});
test('worker secrets are not hard-coded in frontend or runtime worker files',()=>{
  const sources=['web/app.js','web/config.js','worker/src.js','worker/domain.mjs'].map(read).join('\n');
  assert.ok(!/ADMIN_INITIAL_PASSWORD\s*[:=]\s*['"]/.test(sources));
  assert.ok(!sources.includes('AIzaSy'));
  assert.ok(!/-----BEGIN PRIVATE KEY-----\s+[A-Za-z0-9+/]{50,}/.test(sources));
  assert.ok(!read('firestore.rules').includes('allow read, write: if true'));
});
