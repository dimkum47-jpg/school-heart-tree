import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import worker from '../worker/src.js';

function fakeFirestore(){
  const docs=new Map();let version=0;
  const prefix='projects/demo-heart-tree/databases/(default)/documents/';
  const encodeDoc=(key,fields)=>({name:prefix+key,fields,updateTime:`2026-11-04T00:00:${pad(++version)}Z`});
  function pad(n){return String(n%60).padStart(2,'0');}
  function response(data,status=200){return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});}
  const fsValue = f => f?.stringValue ?? (f?.integerValue!==undefined?Number(f.integerValue):f?.booleanValue);
  async function mockFetch(input,init={}){
    const url=new URL(input);
    if(url.hostname==='oauth2.googleapis.com')return response({access_token:'mocktoken',expires_in:3600});
    if(url.hostname!=='firestore.googleapis.com')throw Error(`Unexpected upstream: ${url}`);
    const marker='/documents';const idx=url.pathname.indexOf(marker);
    const suffix=url.pathname.slice(idx+marker.length);const method=init.method||'GET';const body=init.body?JSON.parse(init.body):{};
    if(suffix===':runQuery'){
      const f=body.structuredQuery.where.fieldFilter;const field=f.field.fieldPath,value=fsValue(f.value);
      const rows=[...docs.values()].filter(x=>x.name.includes('/records/')&&fsValue(x.fields[field])===value).map(document=>({document}));
      return response(rows);
    }
    if(suffix===':beginTransaction')return response({transaction:'dGVzdA=='});
    if(suffix===':batchGet')return response(body.documents.map(name=>({...(docs.has(name.slice(prefix.length))?{found:docs.get(name.slice(prefix.length))}:{missing:name})})));
    if(suffix===':commit'){
      for(const w of body.writes||[]){const id=w.update.name.slice(prefix.length);docs.set(id,encodeDoc(id,w.update.fields));}
      return response({writeResults:body.writes.map(()=>({}))});
    }
    const key=decodeURIComponent(suffix.replace(/^\//,''));
    if(method==='PATCH'){
      const precreate=url.searchParams.get('currentDocument.exists');const updated=url.searchParams.get('currentDocument.updateTime');
      if(precreate==='false'&&docs.has(key))return response({error:'already exists'},409);
      if(updated&&docs.get(key)?.updateTime!==updated)return response({error:'conflict'},409);
      const doc=encodeDoc(key,body.fields);docs.set(key,doc);return response(doc);
    }
    if(method==='DELETE'){if(!docs.has(key))return response({error:'not found'},404);docs.delete(key);return response({});}
    if(method==='GET'){
      if(docs.has(key))return response(docs.get(key));
      if([...docs.keys()].some(x=>x.startsWith(key+'/'))){return response({documents:[...docs.entries()].filter(([k])=>k.startsWith(key+'/')&&!k.slice(key.length+1).includes('/')).map(([,doc])=>doc)});}
      return response({error:'not found'},404);
    }
    throw Error(`Unknown mock request ${method} ${url}`);
  }
  return {fetch:mockFetch,docs};
}

const {privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const env={
  ALLOWED_ORIGIN:'https://dimkum47-jpg.github.io',FIREBASE_PROJECT_ID:'demo-heart-tree',
  FIREBASE_SERVICE_ACCOUNT_JSON:JSON.stringify({client_email:'mock@demo.iam.gserviceaccount.com',private_key:privateKey.export({type:'pkcs8',format:'pem'})}),
  PIN_PEPPER:'test-only-never-use-this-string-in-production-1234',
  ADMIN_INITIAL_PASSWORD:'local_test_admin_pass',OFFICER_INITIAL_PASSWORD:'test-officer-secret-only' 
};
const origin='https://dimkum47-jpg.github.io';
async function req(path,{method='GET',body=null,token='',sourceOrigin=origin,environment=env}={}){
  const response=await worker.fetch(new Request('https://worker.mock'+path,{method,headers:{Origin:sourceOrigin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),environment);
  return {status:response.status,data:await response.json(),headers:response.headers};
}

test('real Worker request flow: users, class boundaries, rewards, privacy, deletion',async()=>{
  const originalFetch=global.fetch;const db=fakeFirestore();global.fetch=db.fetch;
  try{
    const badOrigin=await req('/api/tree',{sourceOrigin:'https://evil.example'});
    assert.equal(badOrigin.status,403);
    const unconfigured=await req('/api/tree',{environment:{ALLOWED_ORIGIN:origin}});assert.equal(unconfigured.status,503);
    const empty=await req('/api/tree');assert.equal(empty.status,200);assert.equal(empty.data.summary.total,0);

    const a=await req('/api/register',{method:'POST',body:{grade:1,number:1,name:'김하늘',pin:'2468'}});
    assert.equal(a.status,200,JSON.stringify(a.data));assert.equal(a.data.student.id,'1-01');
    const another=await req('/api/register',{method:'POST',body:{grade:2,number:1,name:'박도윤',pin:'1111'}});
    assert.equal(another.status,200);
    const duplicate=await req('/api/register',{method:'POST',body:{grade:1,number:1,name:'김하늘',pin:'1234'}});
    assert.equal(duplicate.status,409);
    const login=await req('/api/login',{method:'POST',body:{role:'student',grade:1,number:1,pin:'2468'}});
    assert.equal(login.status,200);

    const denied=await req('/api/admin/overview',{token:a.data.token});assert.equal(denied.status,403);
    const badId=await req('/api/record/save',{method:'POST',token:a.data.token,body:{id:'../settings/security',type:'reading',title:'책',content:'충분히 길게 작성한 좋은 독후감이에요.'}});
    assert.equal(badId.status,400);
    const r1=await req('/api/record/save',{method:'POST',token:a.data.token,body:{type:'reading',title:'강아지똥',content:'김하늘이 책을 읽고 친구를 존중하기로 했어요.'}});
    assert.equal(r1.status,200,JSON.stringify(r1.data));
    const recordId=r1.data.id;
    const l2=await req('/api/login',{method:'POST',body:{role:'officer',grade:2,password:'test-officer-secret-only' }});assert.equal(l2.status,200);
    const cross=await req('/api/review',{method:'POST',token:l2.data.token,body:{id:recordId,decision:'approved'}});
    assert.equal(cross.status,403);
    const officer=await req('/api/login',{method:'POST',body:{role:'officer',grade:1,password:'test-officer-secret-only' }});assert.equal(officer.status,200);
    const before=await req('/api/tree');assert.equal(before.data.summary.total,0);
    const approve=await req('/api/review',{method:'POST',token:officer.data.token,body:{id:recordId,decision:'approved'}});assert.equal(approve.status,200);
    const publicFruit=await req('/api/tree');
    assert.equal(publicFruit.data.summary.total,1);
    assert.equal(publicFruit.data.fruits[0].text.includes('김하늘'),false);
    assert.equal(publicFruit.data.fruits[0].studentKey,undefined);

    const firstAward=await req('/api/award',{method:'POST',token:officer.data.token,body:{id:recordId}});
    assert.equal(firstAward.status,200,JSON.stringify(firstAward.data));assert.equal(firstAward.data.count,1);
    const secondAttempt=await req('/api/award',{method:'POST',token:officer.data.token,body:{id:recordId}});
    assert.equal(secondAttempt.status,400);
    for(let i=0;i<2;i++){
      const rec=await req('/api/record/save',{method:'POST',token:a.data.token,body:{type:'reading',title:'한글이야기'+i,content:`이 책에서는 새로운 생각을 배우고 나누어요. ${i}`}});
      assert.equal(rec.status,200,JSON.stringify(rec.data));
      await req('/api/review',{method:'POST',token:officer.data.token,body:{id:rec.data.id,decision:'approved'}});
      const paid=await req('/api/award',{method:'POST',token:officer.data.token,body:{id:rec.data.id}});
      assert.equal(paid.status,i===0?200:400);
    }
    const mine=await req('/api/my-records',{token:a.data.token});assert.equal(mine.data.weekCount,2);
    const edit=await req('/api/record/save',{method:'POST',token:a.data.token,body:{id:recordId,type:'reading',title:'강아지똥',content:'이 책을 통해 누구나 소중하다는 생각을 했어요.'}});
    assert.equal(edit.status,200);
    const afterEdit=await req('/api/tree');assert.equal(afterEdit.data.summary.total,2);
    const admin=await req('/api/login',{method:'POST',body:{role:'admin',password:'local_test_admin_pass'}});assert.equal(admin.status,200);
    const overview=await req('/api/admin/overview',{token:admin.data.token});assert.equal(overview.data.students.length,2);
    const reset=await req('/api/admin/reset-pin',{method:'POST',token:admin.data.token,body:{grade:1,number:1}});
    assert.match(reset.data.pin,/^\d{4}$/);
    const oldSession=await req('/api/my-records',{token:a.data.token});assert.equal(oldSession.status,401);
    const del=await req('/api/admin/delete-student',{method:'POST',token:admin.data.token,body:{grade:1,number:1,confirm:'1-01'}});
    assert.equal(del.status,200);assert.equal(del.data.deletedRecords,3);
    const removed=await req('/api/my-records',{token:a.data.token});assert.equal(removed.status,403);
  }finally{global.fetch=originalFetch;}
});
