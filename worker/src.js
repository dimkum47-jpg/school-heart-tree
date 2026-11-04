import { studentKey, validPin, validName, validateEntry, limitAwardCount, weekStart, toPublicFruit } from './domain.mjs';

// Sensitive Firestore operations are ONLY available through this Worker. The web app
// never receives service-account credentials, password hashes, or Firestore write access.
const encoder = new TextEncoder();
const LIMIT_BODY = 6000;
const SESSION_TTL = 12 * 60 * 60 * 1000;
const ATTEMPT_TTL = 15 * 60 * 1000;
const failMessage = '로그인 정보를 확인해 주세요.';
const validRecordId = value => typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
let googleTokenCache = null;

class ApiError extends Error { constructor(message, status=400) { super(message); this.status=status; } }
const now = () => Date.now();
const hex = bytes => [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
const b64url = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const makeToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));
async function sha(text) { return hex(await crypto.subtle.digest('SHA-256',encoder.encode(text))); }
async function signHash(env, scope, key, password) {
  if (!env.PIN_PEPPER || env.PIN_PEPPER.length < 32) throw new ApiError('서버 보안 설정이 완료되지 않았습니다.',503);
  const cryptoKey = await crypto.subtle.importKey('raw',encoder.encode(env.PIN_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return hex(await crypto.subtle.sign('HMAC',cryptoKey,encoder.encode(`${scope}:${key}:${password}`)));
}
function sameHash(a,b) {
  if (typeof a!=='string'||typeof b!=='string'||a.length!==b.length) return false;
  let diff=0;for(let i=0;i<a.length;i++) diff|=a.charCodeAt(i)^b.charCodeAt(i);
  return diff===0;
}
function valueToFs(value) {
  if (value === null || value === undefined) return { nullValue:null };
  if (typeof value==='string') return {stringValue:value};
  if (typeof value==='boolean') return {booleanValue:value};
  if (typeof value==='number') return Number.isInteger(value)?{integerValue:String(value)}:{doubleValue:value};
  if (Array.isArray(value)) return {arrayValue:{values:value.map(valueToFs)}};
  if (typeof value==='object') return {mapValue:{fields:Object.fromEntries(Object.entries(value).map(([k,v])=>[k,valueToFs(v)]))}};
  throw Error('Unsupported Firestore value');
}
function valueFromFs(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('arrayValue' in value) return (value.arrayValue.values||[]).map(valueFromFs);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields||{}).map(([k,v])=>[k,valueFromFs(v)]));
  return null;
}
const encodeFields = data => Object.fromEntries(Object.entries(data).map(([k,v])=>[k,valueToFs(v)]));
function parseDoc(doc) {
  if(!doc)return null;
  return {...Object.fromEntries(Object.entries(doc.fields||{}).map(([k,v])=>[k,valueFromFs(v)])), id:decodeURIComponent(doc.name.split('/').pop()), _updatedAt:doc.updateTime};
}
function pemBytes(pem) {
  const b64=pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g,'');
  return Uint8Array.from(atob(b64),c=>c.charCodeAt(0));
}
async function googleAccess(env) {
  if (googleTokenCache && googleTokenCache.expires > now()+60_000) return googleTokenCache.token;
  if (!env.FIREBASE_SERVICE_ACCOUNT_JSON || !env.FIREBASE_PROJECT_ID) throw new ApiError('Firebase 서버 설정이 필요합니다.',503);
  const service=JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
  if (!service.client_email || !service.private_key) throw new ApiError('Firebase 서비스 계정 설정 오류',503);
  const iat=Math.floor(now()/1000);
  const jwtHead=b64url(encoder.encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
  const jwtBody=b64url(encoder.encode(JSON.stringify({iss:service.client_email,scope:'https://www.googleapis.com/auth/datastore',aud:'https://oauth2.googleapis.com/token',iat,exp:iat+3600})));
  const key=await crypto.subtle.importKey('pkcs8',pemBytes(service.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature=b64url(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,encoder.encode(`${jwtHead}.${jwtBody}`)));
  const res=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${jwtHead}.${jwtBody}.${signature}`})});
  if (!res.ok) throw new ApiError('Firebase 서버 인증 오류',503);
  const token=await res.json();googleTokenCache={token:token.access_token,expires:now()+Math.min(token.expires_in||3600,3600)*1000};
  return googleTokenCache.token;
}
const firestoreRoot = env => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
async function firestore(env,suffix,opts={}) {
  const res=await fetch(firestoreRoot(env)+suffix,{...opts,headers:{Authorization:`Bearer ${await googleAccess(env)}`,'Content-Type':'application/json',...(opts.headers||{})}});
  const raw=await res.text();let data;
  try{data=JSON.parse(raw);}catch{data=raw;}
  if (res.status===404 && opts.allowMissing) return null;
  if (!res.ok) { if (res.status===409||res.status===412) throw new ApiError('다른 요청과 충돌했어요. 다시 시도해 주세요.',409);throw new ApiError('데이터 처리에 실패했습니다.',res.status===403?503:500); }
  return data;
}
const docPath = path => `/${path.split('/').map(encodeURIComponent).join('/')}`;
async function getDoc(env,path) { return parseDoc(await firestore(env,docPath(path),{allowMissing:true})); }
async function putDoc(env,path,data,{create=false,updateTime=null}={}) {
  const params=new URLSearchParams(); if(create)params.set('currentDocument.exists','false');
  if(updateTime)params.set('currentDocument.updateTime',updateTime);
  const suffix=docPath(path)+(params.size?'?'+params:'');
  return firestore(env,suffix,{method:'PATCH',body:JSON.stringify({fields:encodeFields(data)})});
}
async function deleteDoc(env,path) { return firestore(env,docPath(path),{method:'DELETE',allowMissing:true}); }
async function listCollection(env,path) {
  const all=[];let pageToken='';
  do {
    const params=new URLSearchParams({pageSize:'500'});if(pageToken)params.set('pageToken',pageToken);
    const data=await firestore(env,docPath(path)+'?'+params,{allowMissing:true});
    for(const item of data?.documents||[])all.push(parseDoc(item));pageToken=data?.nextPageToken||'';
    if(all.length>=10000)throw new ApiError('조회량 제한을 초과했습니다.',413);
  }while(pageToken);
  return all;
}
async function queryRecords(env,field,value) {
  const body={structuredQuery:{from:[{collectionId:'records'}],where:{fieldFilter:{field:{fieldPath:field},op:'EQUAL',value:valueToFs(value)}},limit:5000}};
  const data=await firestore(env,':runQuery',{method:'POST',body:JSON.stringify(body)});
  const rows=Array.isArray(data)?data:(typeof data==='string'?data.split('\n').filter(Boolean).map(x=>JSON.parse(x)):(data?.document?[data]:[]));
  return rows.filter(x=>x.document).map(x=>parseDoc(x.document));
}
function publicStudent(s){return {id:s.id,grade:s.grade,number:s.number,name:s.name,active:s.active!==false};}
function publicRecord(r){const {_updatedAt, ...safe}=r;return safe;}
async function readBody(req) {
  const ct=req.headers.get('content-type')||'';
  if(!ct.toLowerCase().includes('application/json'))throw new ApiError('JSON 형식의 요청만 받습니다.',415);
  if(Number(req.headers.get('content-length')||0)>LIMIT_BODY)throw new ApiError('입력 내용이 너무 깁니다.',413);
  const content=await req.text();if(content.length>LIMIT_BODY)throw new ApiError('입력 내용이 너무 깁니다.',413);
  try{return JSON.parse(content);}catch{throw new ApiError('입력 형식을 확인해 주세요.');}
}
async function attemptGate(env,kind,key,failed=false,clear=false) {
  const id=await sha(`${kind}:${key}`);
  const doc=await getDoc(env,`attempts/${id}`);
  const recent=doc && doc.until > now();
  if(!failed&&!clear) {if(recent&&doc.count>=5)throw new ApiError('로그인 시도가 많습니다. 15분 뒤 다시 시도해 주세요.',429);return;}
  const count=clear?0:(recent?(doc.count||0)+1:1);
  const data={count,until:now()+ATTEMPT_TTL};
  try{await putDoc(env,`attempts/${id}`,data,{create:!doc,updateTime:doc?doc._updatedAt:null});}
  catch(e){if(e.status!==409)throw e;throw new ApiError('로그인을 다시 시도해 주세요.',429);}
}
async function createSession(env,role,identity,authVersion=0) {
  const token=makeToken(),id=await sha(token);
  await putDoc(env,`sessions/${id}`,{role,identity,authVersion,createdAt:now(),expiresAt:now()+SESSION_TTL},{create:true});
  return {token,role,identity,expiresAt:now()+SESSION_TTL};
}
async function authorize(req,env,roles=[]) {
  const match=(req.headers.get('authorization')||'').match(/^Bearer ([a-zA-Z0-9_-]{35,100})$/);
  if(!match)throw new ApiError('다시 로그인해 주세요.',401);
  const doc=await getDoc(env,`sessions/${await sha(match[1])}`);
  if(!doc||doc.expiresAt<=now())throw new ApiError('로그인 시간이 만료됐어요.',401);
  if(!roles.includes(doc.role))throw new ApiError('접근 권한이 없습니다.',403);
  if(doc.role==='student') {
    const student=await getDoc(env,`students/${doc.identity}`);
    if(!student||student.active===false)throw new ApiError('사용할 수 없는 학생 계정입니다.',403);
    if((student.authVersion||1)!==(doc.authVersion||1))throw new ApiError('비밀번호가 변경됐어요. 다시 로그인해 주세요.',401);
  }
  if(doc.role==='officer') {
    const setting=await getDoc(env,`officers/${doc.identity}`);
    if((setting?.authVersion||0)!==(doc.authVersion||0))throw new ApiError('임원 비밀번호가 변경됐어요. 다시 로그인해 주세요.',401);
  }
  if(doc.role==='admin') {
    const setting=await getDoc(env,'settings/security');
    if((setting?.authVersion||0)!==(doc.authVersion||0))throw new ApiError('관리자 비밀번호가 변경됐어요. 다시 로그인해 주세요.',401);
  }
  return {...doc,sessionId:await sha(match[1])};
}
async function login(env,body) {
  if(body.role==='student') {
    const id=studentKey(body.grade,body.number);
    await attemptGate(env,'student',id);
    if(!validPin(body.pin)){await attemptGate(env,'student',id,true);throw new ApiError(failMessage,401);}
    const student=await getDoc(env,`students/${id}`);
    const hash=await signHash(env,'student',id,body.pin);
    if(!student||student.active===false||!sameHash(student.pinHash,hash)) {await attemptGate(env,'student',id,true);throw new ApiError(failMessage,401);}
    await attemptGate(env,'student',id,false,true);
    const session=await createSession(env,'student',id,student.authVersion||1);
    return {...session,student:publicStudent(student)};
  }
  if(body.role==='officer') {
    const grade=Number(body.grade);if(!Number.isInteger(grade)||grade<1||grade>6)throw new ApiError('학년을 선택해 주세요.');
    const id=String(grade);await attemptGate(env,'officer',id);
    const setting=await getDoc(env,`officers/${id}`);
    const raw=setting?.passwordHash || (env.OFFICER_INITIAL_PASSWORD?await signHash(env,'officer',id,env.OFFICER_INITIAL_PASSWORD):'');
    const hashed=await signHash(env,'officer',id,String(body.password||''));
    if(!raw||!sameHash(hashed,raw)){await attemptGate(env,'officer',id,true);throw new ApiError(failMessage,401);}
    await attemptGate(env,'officer',id,false,true);
    return createSession(env,'officer',id,setting?.authVersion||0);
  }
  if(body.role==='admin') {
    await attemptGate(env,'admin','master');
    const setting=await getDoc(env,'settings/security');
    const raw=setting?.adminHash || (env.ADMIN_INITIAL_PASSWORD?await signHash(env,'admin','master',env.ADMIN_INITIAL_PASSWORD):'');
    const hash=await signHash(env,'admin','master',String(body.password||''));
    if(!raw||!sameHash(raw,hash)){await attemptGate(env,'admin','master',true);throw new ApiError(failMessage,401);}
    await attemptGate(env,'admin','master',false,true);
    return createSession(env,'admin','master',setting?.authVersion||0);
  }
  throw new ApiError('로그인 유형을 선택해 주세요.');
}
async function register(env,body) {
  const id=studentKey(body.grade,body.number);
  if(!validName(body.name)||!validPin(body.pin))throw new ApiError('이름과 숫자 4자리 비밀번호를 확인해 주세요.');
  const hash=await signHash(env,'student',id,body.pin);
  try {
    await putDoc(env,`students/${id}`,{grade:Number(body.grade),number:Number(body.number),name:body.name.trim(),pinHash:hash,authVersion:1,createdAt:now(),active:true},{create:true});
  }catch(e){if(e.status===409)throw new ApiError('이미 등록된 학년·번호예요. 선생님께 확인해 주세요.',409);throw e;}
  const session=await createSession(env,'student',id,1);
  return {...session,student:{id,grade:Number(body.grade),number:Number(body.number),name:body.name.trim(),active:true}};
}
function verifyRole(actor,role,grade=null) {
  if(actor.role==='admin')return;
  if(actor.role!==role)throw new ApiError('관리 권한이 없습니다.',403);
  if(grade!==null&&String(actor.identity)!==String(grade))throw new ApiError('다른 학년 기록은 열람할 수 없습니다.',403);
}
async function saveEntry(env,actor,body) {
  if(actor.role!=='student')throw new ApiError('학생만 기록을 작성할 수 있어요.',403);
  const student=await getDoc(env,`students/${actor.identity}`);
  const entry=validateEntry(body,student.grade);
  if(body.id && !validRecordId(body.id))throw new ApiError('기록 번호를 확인해 주세요.');
  const existing=body.id ? await getDoc(env,`records/${body.id}`):null;
  if(body.id && (!existing || existing.studentKey!==actor.identity))throw new ApiError('수정할 수 없는 기록입니다.',403);
  if(existing?.status==='approved' && existing.rewardedAt) {
    // Keep award history while requiring re-review of the edited content.
  }
  // Duplicate exact texts should be reviewed rather than credited repeatedly.
  const mine=await queryRecords(env,'studentKey',actor.identity);
  const duplicate=mine.some(r=>r.id!==existing?.id && r.type===entry.type &&
    (entry.type==='reading'?r.title===entry.title&&r.content===entry.content:r.deed===entry.deed&&r.reason===entry.reason));
  if(duplicate)throw new ApiError('이미 제출한 내용과 같아요. 새로운 경험을 적어 주세요.');
  const id=existing?.id||crypto.randomUUID();
  const row={...entry,grade:student.grade,studentKey:actor.identity,studentNumber:student.number,status:'pending',createdAt:existing?.createdAt||now(),updatedAt:now(),approvedAt:null,reviewedAt:null,feedback:'',rewardedAt:existing?.rewardedAt||null,rewardWeek:existing?.rewardWeek||null};
  await putDoc(env,`records/${id}`,row,{create:!existing,updateTime:existing?existing._updatedAt:null});
  return {id,status:'pending'};
}
async function reviewEntry(env,actor,body) {
  if(!['admin','officer'].includes(actor.role))throw new ApiError('임원 권한이 필요합니다.',403);
  if(!validRecordId(body.id))throw new ApiError('기록 번호를 확인해 주세요.');
  const record=await getDoc(env,`records/${body.id}`);
  if(!record)throw new ApiError('기록을 찾을 수 없어요.',404);
  verifyRole(actor,'officer',record.grade);
  if(!['approved','changes_requested'].includes(body.decision))throw new ApiError('처리 방식을 선택해 주세요.');
  const feedback=String(body.feedback||'').trim().slice(0,180);
  if(body.decision==='changes_requested'&&!feedback)throw new ApiError('보완할 내용을 입력해 주세요.');
  const updated={...record,status:body.decision,feedback,reviewedAt:now(),approvedAt:body.decision==='approved'?now():null,updatedAt:now()};
  delete updated.id;delete updated._updatedAt;
  await putDoc(env,`records/${record.id}`,updated,{updateTime:record._updatedAt});
  return {id:record.id,status:updated.status};
}
async function beginTransaction(env) {
  const res=await firestore(env,':beginTransaction',{method:'POST',body:JSON.stringify({options:{readWrite:{}}})});
  return res.transaction;
}
async function transactionGet(env,transaction,paths) {
  const documents=paths.map(path=>`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${path}`);
  const data=await firestore(env,':batchGet',{method:'POST',body:JSON.stringify({documents,transaction})});
  const rows=Array.isArray(data)?data:String(data||'').split('\n').filter(Boolean).map(x=>JSON.parse(x));
  const values=new Map();for(const row of rows)values.set((row.found?.name||row.missing||'').split('/').pop(),parseDoc(row.found||null));
  return paths.map(p=>values.get(p.split('/').pop())||null);
}
async function awardEntry(env,actor,body) {
  if(!['officer','admin'].includes(actor.role))throw new ApiError('임원 권한이 필요합니다.',403);
  const id=String(body.id||'');if(!validRecordId(id))throw new ApiError('기록 번호를 확인해 주세요.');
  for(let attempt=0;attempt<3;attempt++) {
    const tx=await beginTransaction(env);
    // The first read is safe; the record is re-read inside the transaction for atomicity.
    const initial=await getDoc(env,`records/${id}`);
    if(!initial)throw new ApiError('기록을 찾을 수 없어요.',404);
    verifyRole(actor,'officer',initial.grade);
    const week=weekStart();const ledgerId=`${initial.studentKey}_${week}`;
    const [record,ledger]=await transactionGet(env,tx,[`records/${id}`,`rewardWeeks/${ledgerId}`]);
    if(!record || record.studentKey!==initial.studentKey)throw new ApiError('기록이 변경되었습니다. 다시 시도해 주세요.',409);
    let count;
    try { count=limitAwardCount(ledger?.count||0,!!record.rewardedAt,record.status==='approved'); }
    catch(error) { throw new ApiError(error.message,400); }
    const recordData={...record,rewardedAt:now(),rewardWeek:week};delete recordData.id;delete recordData._updatedAt;
    const ledgerData={studentKey:record.studentKey,week,count,updatedAt:now()};
    const path=p=>`projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${p}`;
    try {
      await firestore(env,':commit',{method:'POST',body:JSON.stringify({transaction:tx,writes:[
        {update:{name:path(`records/${id}`),fields:encodeFields(recordData)}},
        {update:{name:path(`rewardWeeks/${ledgerId}`),fields:encodeFields(ledgerData)}}
      ]})});
      return {id,week,count,rewardedAt:recordData.rewardedAt};
    }catch(e){if(attempt===2 || e.status!==409)throw e;}
  }
  throw new ApiError('다시 시도해 주세요.',409);
}
async function treeData(env) {
  const records=await queryRecords(env,'status','approved');
  const studentNames=(await listCollection(env,'students')).map(x=>x.name);
  const fruits=records.map(x=>toPublicFruit(x,studentNames)).filter(Boolean).sort((a,b)=>b.approvedAt-a.approvedAt);
  const summary={reading:fruits.filter(x=>x.type==='reading').length,praise:fruits.filter(x=>x.type==='praise').length,total:fruits.length};
  return {summary,fruits:fruits.slice(0,250)};
}
async function adminChangePassword(env,body) {
  if(typeof body.password!=='string'||body.password.length<10||body.password.length>90)throw new ApiError('관리자 비밀번호는 10~90자로 설정해 주세요.');
  const previous=await getDoc(env,'settings/security');
  await putDoc(env,'settings/security',{adminHash:await signHash(env,'admin','master',body.password),authVersion:(previous?.authVersion||0)+1,changedAt:now()},{create:!previous,updateTime:previous?previous._updatedAt:null});
  return {changed:true};
}
async function officerChangePassword(env,grade,password) {
  if(typeof password!=='string'||password.length<4||password.length>90)throw new ApiError('임원 비밀번호는 4~90자로 입력해 주세요.');
  const previous=await getDoc(env,`officers/${grade}`);
  await putDoc(env,`officers/${grade}`,{passwordHash:await signHash(env,'officer',String(grade),password),authVersion:(previous?.authVersion||0)+1,changedAt:now()},{create:!previous,updateTime:previous?previous._updatedAt:null});
  return {changed:true};
}
async function deleteStudent(env,key) {
  const student=await getDoc(env,`students/${key}`);if(!student)throw new ApiError('등록된 학생이 없습니다.',404);
  const records=await queryRecords(env,'studentKey',key);
  for(const record of records)await deleteDoc(env,`records/${record.id}`);
  const ledgers=await listCollection(env,'rewardWeeks');
  for(const ledger of ledgers.filter(r=>r.studentKey===key))await deleteDoc(env,`rewardWeeks/${ledger.id}`);
  await deleteDoc(env,`students/${key}`);
  return {deletedRecords:records.length};
}
async function route(req,env,pathname) {
  if(req.method==='GET'&&pathname==='/api/health')return {status:'ok',connected:!!env.FIREBASE_SERVICE_ACCOUNT_JSON};
  if(!env.FIREBASE_PROJECT_ID||!env.FIREBASE_SERVICE_ACCOUNT_JSON||!env.PIN_PEPPER||!env.ADMIN_INITIAL_PASSWORD||!env.OFFICER_INITIAL_PASSWORD)throw new ApiError('서비스가 아직 설정되지 않았습니다.',503);
  if(req.method==='GET'&&pathname==='/api/tree')return treeData(env);
  if(req.method==='POST'&&pathname==='/api/register')return register(env,await readBody(req));
  if(req.method==='POST'&&pathname==='/api/login')return login(env,await readBody(req));
  if(req.method==='POST'&&pathname==='/api/logout'){
    const actor=await authorize(req,env,['student','officer','admin']);await deleteDoc(env,`sessions/${actor.sessionId}`);return {ok:true};
  }
  if(req.method==='GET'&&pathname==='/api/me'){
    const actor=await authorize(req,env,['student','officer','admin']);
    if(actor.role==='student')return {role:actor.role,student:publicStudent(await getDoc(env,`students/${actor.identity}`)),week:weekStart()};
    return {role:actor.role,grade:actor.role==='officer'?Number(actor.identity):null,week:weekStart()};
  }
  if(req.method==='GET'&&pathname==='/api/my-records'){
    const actor=await authorize(req,env,['student']);
    const records=await queryRecords(env,'studentKey',actor.identity);
    const ledger=await getDoc(env,`rewardWeeks/${actor.identity}_${weekStart()}`);
    return {records:records.map(publicRecord).sort((a,b)=>b.createdAt-a.createdAt),weekCount:ledger?.count||0};
  }
  if(req.method==='POST'&&pathname==='/api/record/save')return saveEntry(env,await authorize(req,env,['student']),await readBody(req));
  if(req.method==='GET'&&pathname==='/api/officer/overview'){
    const actor=await authorize(req,env,['officer','admin']);
    const grade=actor.role==='officer'?Number(actor.identity):Number(new URL(req.url).searchParams.get('grade')||1);
    if(!Number.isInteger(grade)||grade<1||grade>6)throw new ApiError('학년을 선택해 주세요.');
    const [students,records]=await Promise.all([listCollection(env,'students'),queryRecords(env,'grade',grade)]);
    const ro=records.map(r=>({...publicRecord(r),studentName:students.find(x=>x.id===r.studentKey)?.name||'알 수 없음'}));
    return {grade,students:students.filter(x=>x.grade===grade).map(publicStudent).sort((a,b)=>a.number-b.number),records:ro.sort((a,b)=>b.createdAt-a.createdAt)};
  }
  if(req.method==='POST'&&pathname==='/api/review')return reviewEntry(env,await authorize(req,env,['officer','admin']),await readBody(req));
  if(req.method==='POST'&&pathname==='/api/award')return awardEntry(env,await authorize(req,env,['officer','admin']),await readBody(req));
  if(req.method==='POST'&&pathname==='/api/officer/password'){
    const actor=await authorize(req,env,['officer','admin']);const body=await readBody(req);
    const grade=actor.role==='officer'?Number(actor.identity):Number(body.grade);
    if(!Number.isInteger(grade)||grade<1||grade>6)throw new ApiError('학년을 확인해 주세요.');
    return officerChangePassword(env,grade,body.password);
  }
  if(req.method==='GET'&&pathname==='/api/admin/overview'){
    await authorize(req,env,['admin']);
    const [students,records]=await Promise.all([listCollection(env,'students'),listCollection(env,'records')]);
    return {students:students.map(publicStudent).sort((a,b)=>a.grade-b.grade||a.number-b.number),records:records.map(publicRecord).sort((a,b)=>b.createdAt-a.createdAt)};
  }
  if(req.method==='POST'&&pathname==='/api/admin/change-password'){
    await authorize(req,env,['admin']);return adminChangePassword(env,await readBody(req));
  }
  if(req.method==='POST'&&pathname==='/api/admin/reset-pin'){
    await authorize(req,env,['admin']);const body=await readBody(req);const id=studentKey(body.grade,body.number);
    const student=await getDoc(env,`students/${id}`);if(!student)throw new ApiError('학생을 찾을 수 없어요.',404);
    // unbiased 4-digit generation using rejection sampling
    const numbers=crypto.getRandomValues(new Uint16Array(1));while(numbers[0]>=60000)crypto.getRandomValues(numbers);
    const pin=String(numbers[0]%10000).padStart(4,'0');
    const {_updatedAt, id:docId, ...update}=student;
    update.pinHash=await signHash(env,'student',id,pin);
    update.authVersion=(student.authVersion||1)+1;
    await putDoc(env,`students/${id}`,update,{updateTime:student._updatedAt});
    return {pin,studentKey:id};
  }
  if(req.method==='POST'&&pathname==='/api/admin/lock-student'){
    await authorize(req,env,['admin']);const body=await readBody(req);const key=studentKey(body.grade,body.number);
    const student=await getDoc(env,`students/${key}`);if(!student)throw new ApiError('학생을 찾을 수 없어요.',404);
    const {id,_updatedAt,...data}=student;data.active=!!body.active;
    await putDoc(env,`students/${key}`,data,{updateTime:student._updatedAt});return {active:data.active};
  }
  if(req.method==='POST'&&pathname==='/api/admin/delete-record'){
    await authorize(req,env,['admin']);const body=await readBody(req);if(!validRecordId(body.id))throw new ApiError('기록 번호를 확인해 주세요.');const record=await getDoc(env,`records/${body.id}`);
    if(!record)throw new ApiError('기록이 없습니다.',404);await deleteDoc(env,`records/${record.id}`);return {deleted:true};
  }
  if(req.method==='POST'&&pathname==='/api/admin/delete-student'){
    await authorize(req,env,['admin']);const body=await readBody(req);const key=studentKey(body.grade,body.number);
    if(body.confirm!==key)throw new ApiError(`삭제 확인란에 ${key}를 입력해 주세요.`);
    return deleteStudent(env,key);
  }
  if(req.method==='POST'&&pathname==='/api/admin/delete-grade-records'){
    await authorize(req,env,['admin']);const body=await readBody(req);const grade=Number(body.grade);
    if(!Number.isInteger(grade)||grade<1||grade>6||body.confirm!==`${grade}학년 삭제`)throw new ApiError('학년별 삭제 확인 문구를 입력해 주세요.');
    const records=await queryRecords(env,'grade',grade);
    for(const rec of records)await deleteDoc(env,`records/${rec.id}`);
    return {deletedRecords:records.length};
  }
  throw new ApiError('요청한 기능을 찾을 수 없어요.',404);
}
export default {
  async fetch(req,env) {
    const origin=req.headers.get('Origin');const allowed=(env.ALLOWED_ORIGIN||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(!origin||!allowed.includes(origin))return new Response(JSON.stringify({error:'허용되지 않은 접속입니다.'}),{status:403,headers:{'content-type':'application/json'}});
    const headers={'Content-Type':'application/json; charset=utf-8','Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization','Cache-Control':'no-store','Vary':'Origin'};
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(!['GET','POST'].includes(req.method))return new Response(JSON.stringify({error:'지원하지 않는 요청입니다.'}),{status:405,headers});
    try {
      const result=await route(req,env,new URL(req.url).pathname);
      return new Response(JSON.stringify(result),{status:200,headers});
    }catch(err){
      const status=err instanceof ApiError?err.status:500;
      if(status>=500)console.error('Heart tree API error:',err?.message||err);
      return new Response(JSON.stringify({error:status>=500?'서버 처리 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.':err.message}),{status,headers});
    }
  }
};
