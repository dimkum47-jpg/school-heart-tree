import { config } from './config.js';

const main = document.querySelector('#main');
const $ = s => document.querySelector(s);
const escapeHtml = value => String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pad = value => String(value).padStart(2,'0');
const dateLabel = value => value ? new Date(value).toLocaleString('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const statusLabel = status => ({pending:'확인 대기',approved:'승인 완료',changes_requested:'보완 요청'})[status] || '확인 대기';
const statusClass = status => ({pending:'gold',approved:'',changes_requested:'pink'})[status]||'gray';
const apiReady = /^https:\/\/[^\s]+/.test(config.apiBase||'') && !config.apiBase.includes('REPLACE_ME');
const apiBase = (config.apiBase||'').replace(/\/$/,'');
const DEMO_FRUITS = [
  {id:'example1',type:'reading',grade:3,text:'「마당을 나온 암탉」 — 잎싹이 끝까지 용기 내는 모습이 기억에 남았어요.'},
  {id:'example2',type:'praise',grade:6,text:'체육 시간에 넘어진 친구를 일으켜 주고 함께 보건실에 갔어요. 도와주는 마음이 고마웠어요.'},
  {id:'example3',type:'reading',grade:2,text:'「강아지똥」 — 작은 것도 소중하다는 것을 알았어요.'},
  {id:'example4',type:'praise',grade:4,text:'발표가 어려울 때 옆에서 연습을 도와줬어요. 덕분에 용기가 났어요.'}
];
const state = {
  page:'home', token:sessionStorage.getItem('heart_tree_session')||'',
  role:sessionStorage.getItem('heart_tree_role')||'', identity:sessionStorage.getItem('heart_tree_identity')||'',
  student:null, tree:null, mine:null, officer:null, admin:null,
  studentAuthTab:'login', writingType:'reading', editingId:'', officerGrade:1, adminGrade:1,
  studentStatus:'all', officerStatus:'pending', adminStatus:'all', adminTab:'records', officerTab:'records', busy:false
};
let toastTimer;
function toast(message) {
  const el=$('#toast');el.textContent=message;el.classList.add('show');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),4200);
}
const numberOptions = (start,end,selected=0) => Array.from({length:end-start+1},(_,index)=>{
  const n=start+index;return `<option value="${n}" ${Number(selected)===n?'selected':''}>${n}${start===1&&end===6?'학년':'번'}</option>`;
}).join('');
function setBusy(flag){state.busy=flag;document.querySelectorAll('button').forEach(btn=>{if(btn.dataset.action==='submit')btn.disabled=flag;});}
async function api(path,{method='GET',body=null}={}) {
  if(!apiReady)throw Error('아직 서버 연결이 설정되지 않았습니다. 교사에게 알려 주세요.');
  const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),16000);
  try {
    const res=await fetch(apiBase+path,{
      method,signal:controller.signal,cache:'no-store',
      headers:{...(body?{'Content-Type':'application/json'}:{}),...(state.token?{'Authorization':'Bearer '+state.token}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const data=await res.json();
    if(!res.ok){if(res.status===401&&state.token){clearSession();}throw Error(data.error||'요청을 처리하지 못했어요.');}
    return data;
  }catch(error){if(error.name==='AbortError')throw Error('연결이 지연되고 있어요. 인터넷을 확인해 주세요.');throw error;}
  finally{clearTimeout(timer);}
}
function clearSession(){state.token='';state.role='';state.identity='';state.student=null;state.mine=null;state.officer=null;state.admin=null;sessionStorage.removeItem('heart_tree_session');sessionStorage.removeItem('heart_tree_role');sessionStorage.removeItem('heart_tree_identity');}
function saveSession(data){state.token=data.token;state.role=data.role;state.identity=data.identity;state.student=data.student||null;sessionStorage.setItem('heart_tree_session',data.token);sessionStorage.setItem('heart_tree_role',data.role);sessionStorage.setItem('heart_tree_identity',data.identity);}
function updateHeader(){document.querySelectorAll('[data-nav]').forEach(btn=>btn.classList.toggle('active',btn.dataset.nav===state.page));$('#logoutButton').classList.toggle('hidden',!state.token);}
async function navigate(page){
  state.page=page;window.scrollTo({top:0,behavior:'smooth'});
  if(page==='student'&&state.role==='student')await refreshMine();
  if(page==='officer'&&state.role==='officer')await refreshOfficer();
  if(page==='admin'&&state.role==='admin')await refreshAdmin();
  render();
}
async function refreshTree(){
  if(!apiReady)return;
  try{state.tree=await api('/api/tree'); if(state.page==='home')render();}
  catch(err){$('#serviceBanner').textContent='마음나무 정보를 불러오지 못했습니다. '+err.message;$('#serviceBanner').classList.remove('hidden');}
}
async function refreshMine(){if(state.token&&state.role==='student')try{state.mine=await api('/api/my-records');}catch(err){toast(err.message);}}
async function refreshOfficer(){if(state.token&&state.role==='officer')try{state.officer=await api('/api/officer/overview');state.officerGrade=state.officer.grade;}catch(err){toast(err.message);}}
async function refreshAdmin(){if(state.token&&state.role==='admin')try{state.admin=await api('/api/admin/overview');}catch(err){toast(err.message);}}
function render(){
  updateHeader();
  main.innerHTML = state.page==='home'?homePage():state.page==='student'?studentPage():state.page==='officer'?officerPage():adminPage();
}
function heroFruits(fruits){
  return fruits.slice(0,65).map((fruit,i)=>{
    const x=17+((i*37.7+Math.sin(i*3.1)*7+17)%67);
    const y=10+((i*19.7+Math.cos(i*2.2)*5+55)%47);
    return `<button class="fruit-button" type="button" data-fruit="${escapeHtml(fruit.id)}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%" aria-label="${fruit.type==='reading'?'독서':'칭찬'} 열매 내용 읽기">${fruit.type==='reading'?'🍎':'🍑'}</button>`;
  }).join('');
}
function homePage(){
  const demo=!apiReady;const fruits=demo?DEMO_FRUITS:(state.tree?.fruits||[]);
  const stats=demo?{reading:0,praise:0,total:0}:(state.tree?.summary||{reading:0,praise:0,total:0});
  return `<section class="hero">
    <div class="hero-words"><div class="eyebrow">STUDENT COUNCIL CAMPAIGN</div>
      <h1>오늘의 따뜻한 마음이<br><span>내일의 열매</span>가 돼요.</h1>
      <p>책 속에서 발견한 생각 한 가지, 친구에게 전하는 고마움 한 마디.<br>우리 학교 마음나무에 예쁜 열매를 맺어 보세요.</p>
      ${demo?'<span class="pill gold">예시 화면 · 실제 기록 저장 불가</span>':'<span class="pill">우리 학교가 함께 키우는 나무</span>'}
      <div class="hero-stats">
        <div class="stat"><span>📖 독서 열매</span><strong>${stats.reading}</strong></div>
        <div class="stat"><span>💗 칭찬 열매</span><strong>${stats.praise}</strong></div>
        <div class="stat"><span>🌱 전체 열매</span><strong>${stats.total}</strong></div>
      </div>
      <button type="button" class="button" data-nav="student">나도 마음 기록하기 →</button>
      <p class="field-help" style="margin-top:14px">독서 또는 칭찬 기록 한 개당 상품 한 개! <b>매주 최대 2개</b>를 받을 수 있어요.</p>
    </div>
    <div class="tree-area"><img class="tree-image" src="./assets/heart-tree.webp" alt="햇살이 비치는 언덕 위, 책과 알록달록한 열매가 가득한 커다란 마음나무" />
      <div class="fruit-layer">${heroFruits(fruits)}</div>
      <div class="tree-note">🍎 독서 · 🍑 칭찬 &nbsp;|&nbsp; 열매를 눌러 내용을 읽어 보세요!</div>
    </div>
  </section><section class="two-cols" style="margin-top:29px">
    <article class="card"><h2>📚 책에서 자라는 마음</h2><p class="muted">읽은 책과 기억에 남는 장면, 느낀 점을 한두 문장으로 기록해요.</p><button class="button secondary" data-nav="student">독서 기록하기</button></article>
    <article class="card"><h2>💌 칭찬에서 자라는 마음</h2><p class="muted">친구가 해 준 구체적인 행동과 고마운 이유를 적어요.</p><button class="button secondary" data-nav="student">친구 칭찬하기</button></article>
  </section><section class="card" style="text-align:center"><h2>마음나무는 어떻게 자랄까요?</h2><p class="muted">① 기록을 남겨요 &nbsp; → &nbsp; ② 반장·부반장이 확인해요 &nbsp; → &nbsp; ③ 열매가 맺히고 상품를 받아요!</p><p class="small muted">승인된 기록만 공개하며, 작성자 이름과 칭찬받은 친구 이름은 보여 주지 않습니다. 이름이나 개인정보가 포함된 내용은 작성하지 마세요.</p></section>`;
}
function studentAuth(){
  const isRegister=state.studentAuthTab==='register';
  return `<div class="login-container"><div class="auth-header"><div class="icon">📖</div><h1 class="page-title">${isRegister?'마음나무에 처음 왔나요?':'내 마음 기록장'}</h1><p class="subheading">${isRegister?'학년·번호·이름과 숫자 4자리 비밀번호를 등록해요.':'어느 기기에서든 내 기록을 만나 보세요.'}</p></div>
  <div class="card"><div class="tabs"><button type="button" data-auth-tab="login" class="${!isRegister?'selected':''}">로그인</button><button type="button" data-auth-tab="register" class="${isRegister?'selected':''}">처음 가입</button></div>
  <form id="studentAuthForm" autocomplete="off"><div class="form-grid">
    <div class="field"><label for="studentGrade">학년</label><select id="studentGrade" name="grade" required>${numberOptions(1,6,1)}</select></div>
    <div class="field"><label for="studentNumber">번호</label><select id="studentNumber" name="number" required>${numberOptions(1,50,1)}</select></div>
  </div>
  ${isRegister?'<div class="field"><label for="studentName">이름</label><input id="studentName" name="name" maxlength="20" placeholder="예: 김하늘" required autocomplete="off" /></div>':''}
  <div class="field"><label for="studentPin">${isRegister?'비밀번호 만들기':'숫자 4자리 비밀번호'}</label><input id="studentPin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" minlength="4" maxlength="4" autocomplete="off" required placeholder="● ● ● ●" /><p class="field-help">비밀번호는 친구에게 알려주지 마세요. 잊어버리면 선생님께 말씀드려요.</p></div>
  ${isRegister?'<div class="hint">학생이 직접 가입하면 바로 사용할 수 있어요. 이미 등록된 학년·번호는 중복 가입할 수 없어요.</div>':''}
  <button class="button full" data-action="submit" ${!apiReady?'disabled':''} type="submit">${isRegister?'가입하고 기록 시작':'내 기록장 들어가기'}</button></form>
  ${!apiReady?'<p class="field-help">현재 예시 화면입니다. 교사가 서버를 연결하면 가입과 로그인이 활성화됩니다.</p>':''}</div></div>`;
}
function writeForm(){
  const type=state.writingType;
  const rec=(state.mine?.records||[]).find(x=>x.id===state.editingId)||null;
  const data=rec&&rec.type===type?rec:{};
  return `<section class="card" id="writePanel"><div class="title-row"><h2>${state.editingId?'✏️ 기록 수정하기':'✨ 새로운 마음 기록'}</h2>${state.editingId?'<button class="button small outline" type="button" data-action="cancel-edit">수정 취소</button>':''}</div>
  <div class="record-type"><button type="button" data-write-type="reading" class="type-picker ${type==='reading'?'active':''}"><span>📖</span>독서 기록</button><button type="button" data-write-type="praise" class="type-picker ${type==='praise'?'active':''}"><span>💗</span>친구 칭찬</button></div>
  <form id="recordForm" autocomplete="off">
    ${type==='reading'?`<div class="field"><label for="recordTitle">읽은 책 제목</label><input id="recordTitle" name="title" maxlength="80" value="${escapeHtml(data.title||'')}" placeholder="예: 마당을 나온 암탉" required /></div>
      <div class="field"><label for="recordContent">기억에 남는 장면이나 느낀 점</label><textarea id="recordContent" name="content" maxlength="400" placeholder="책에서 가장 기억에 남은 장면은... / 이 책을 읽고 나는..." required>${escapeHtml(data.content||'')}</textarea><p class="field-help">한두 문장으로 진짜 생각을 써 주세요. 1~2학년은 8자 이상, 3~6학년은 15자 이상이에요.</p></div>`
     :`<div class="field"><label for="recordPeer">칭찬할 친구 이름</label><input id="recordPeer" name="peerName" maxlength="20" value="${escapeHtml(data.peerName||'')}" placeholder="친구 이름" required /></div>
       <div class="field"><label for="recordDeed">친구가 실제로 어떤 행동을 했나요?</label><textarea id="recordDeed" name="deed" maxlength="300" placeholder="쉬는 시간에 준비물을 잃어버렸을 때 같이 찾아주었어요." required>${escapeHtml(data.deed||'')}</textarea></div>
       <div class="field"><label for="recordReason">그 행동이 왜 고마웠나요?</label><textarea id="recordReason" name="reason" maxlength="300" placeholder="혼자였으면 힘들었을 텐데 함께해 줘서 든든했어요." required>${escapeHtml(data.reason||'')}</textarea><p class="field-help">그냥 '착하다', '칭찬한다'라고만 쓰면 보완 요청을 받을 수 있어요. 공개할 때 친구 이름은 숨겨집니다.</p></div>`}
    <button class="button full" data-action="submit" type="submit">${state.editingId?'수정하고 다시 확인받기':'기록 제출하기'}</button>
  </form>${rec?.status==='approved'?'<p class="field-help">승인된 글을 수정하면 다시 확인 대기로 변경되며, 열매는 재승인 전까지 숨겨집니다. 기존 상품 지급 이력은 유지됩니다.</p>':''}</section>`;
}
function entryText(r){return r.type==='reading'?`<strong>「${escapeHtml(r.title)}」</strong><p>${escapeHtml(r.content)}</p>`:`<strong>칭찬받은 친구: ${escapeHtml(r.peerName)}</strong><p>${escapeHtml(r.deed)}</p><p>${escapeHtml(r.reason)}</p>`;}
function entryCard(r,mode='student'){
  const canReview=mode==='officer'||mode==='admin';
  return `<div class="entry-card"><div class="entry-head">
    <span class="pill ${r.type==='reading'?'':'pink'}">${r.type==='reading'?'📖 독서':'💗 칭찬'}</span>
    <span class="pill ${statusClass(r.status)}">${statusLabel(r.status)}</span>
    ${r.rewardedAt?'<span class="pill gold">🎁 상품 지급 완료</span>':''}
  </div>
  ${canReview?`<p class="entry-meta">${r.grade}학년 ${r.studentNumber}번 · ${escapeHtml(r.studentName||'')}</p>`:''}
  <div style="margin-top:10px">${entryText(r)}</div>
  <div class="entry-meta">작성: ${dateLabel(r.createdAt)} ${r.reviewedAt?'· 확인: '+dateLabel(r.reviewedAt):''} ${r.rewardedAt?'· 지급: '+dateLabel(r.rewardedAt):''}</div>
  ${r.feedback?`<p class="entry-feedback">💬 확인 의견: ${escapeHtml(r.feedback)}</p>`:''}
  ${mode==='student'?`<div class="panel-actions"><button type="button" class="button small secondary" data-edit="${escapeHtml(r.id)}">✏️ 내용 수정</button></div>`:''}
  ${canReview?`<div class="panel-actions">
    ${r.status!=='approved'?`<button type="button" class="button small" data-review="${escapeHtml(r.id)}" data-decision="approved">✓ 승인</button>`:''}
    <button type="button" class="button small outline" data-review="${escapeHtml(r.id)}" data-decision="changes_requested">보완 요청</button>
    ${r.status==='approved'&&!r.rewardedAt?`<button type="button" class="button small light" data-award="${escapeHtml(r.id)}">🎁 상품 지급 확인</button>`:''}
    ${mode==='admin'?`<button type="button" class="button small danger" data-delete-record="${escapeHtml(r.id)}">삭제</button>`:''}
  </div>`:''}
  </div>`;
}
function studentPage(){
  if(state.role!=='student')return studentAuth();
  const s=state.student, records=state.mine?.records||[];const week=state.mine?.weekCount||0;
  const list=records.filter(r=>state.studentStatus==='all'||r.status===state.studentStatus);
  return `<div class="title-row"><div><h1 class="page-title">${escapeHtml(s?.name||'학생')}의 마음 기록장 🌿</h1><p class="subheading">${s?.grade||''}학년 ${s?.number||''}번 · 기록을 남길 때마다 조금씩 자라요.</p></div><span class="count-dot">총 ${records.length}개의 기록</span></div>
  <div class="badge-banner"><strong>이번 주 상품 ${week} / 2개</strong><p>독서와 칭찬 중 마음에 드는 활동을 골라 기록해요. 주간 지급 한도는 2개입니다.</p><div class="progress"><i style="width:${Math.min(100,week/2*100)}%"></i></div></div>
  <div class="two-cols"><div>${writeForm()}</div><div><section class="card"><div class="title-row"><h2>🗂️ 나의 기록</h2><span class="pill">${records.length}개</span></div>
  <div class="filter-bar"><label class="sr-only" for="studentFilter">기록 상태</label><select id="studentFilter"><option value="all" ${state.studentStatus==='all'?'selected':''}>전체</option><option value="pending" ${state.studentStatus==='pending'?'selected':''}>확인 대기</option><option value="approved" ${state.studentStatus==='approved'?'selected':''}>승인 완료</option><option value="changes_requested" ${state.studentStatus==='changes_requested'?'selected':''}>보완 요청</option></select></div>
  <div class="record-list">${list.length?list.map(r=>entryCard(r)).join(''):'<div class="empty">아직 해당하는 기록이 없어요. 🌱</div>'}</div></section></div></div>`;
}
function officerAuth(){
  return `<div class="login-container"><div class="auth-header"><div class="icon">✅</div><h1 class="page-title">학급 임원 관리실</h1><p class="subheading">반장과 부반장은 학년별 공용 계정으로 확인해요.</p></div><div class="card">
  <form id="officerLoginForm"><div class="field"><label for="officerGrade">담당 학년</label><select name="grade" id="officerGrade">${numberOptions(1,6,1)}</select></div>
  <div class="field"><label for="officerPassword">임원 비밀번호</label><input id="officerPassword" name="password" type="password" minlength="4" maxlength="90" required autocomplete="off" placeholder="임원 비밀번호" /></div>
  <button type="submit" class="button full" data-action="submit" ${!apiReady?'disabled':''}>우리 학년 관리실 들어가기</button></form>
  <p class="field-help">임원은 자기 학년의 기록만 확인할 수 있어요. 확인한 날짜와 시간은 자동으로 저장됩니다.</p></div></div>`;
}
function officerPage(){
  if(state.role!=='officer')return officerAuth();
  const dataset=state.officer||{grade:state.officerGrade,students:[],records:[]};const filtered=dataset.records.filter(r=>state.officerStatus==='all'||r.status===state.officerStatus);
  const approved=dataset.records.filter(r=>r.status==='approved').length;
  return `<div class="title-row"><div><h1 class="page-title">${dataset.grade}학년 임원 관리실 ✅</h1><p class="subheading">반장·부반장이 함께 확인하는 기록장입니다.</p></div><span class="pill">공용 계정</span></div>
  <div class="three-cols" style="margin-bottom:17px"><div class="teacher-stat"><span>등록 학생</span><strong>${dataset.students.length}명</strong></div><div class="teacher-stat"><span>확인 대기</span><strong>${dataset.records.filter(r=>r.status==='pending').length}건</strong></div><div class="teacher-stat"><span>승인 완료</span><strong>${approved}건</strong></div></div>
  <div class="tabs"><button class="${state.officerTab==='records'?'selected':''}" data-officer-tab="records">기록 확인</button><button class="${state.officerTab==='students'?'selected':''}" data-officer-tab="students">학생 명단</button><button class="${state.officerTab==='settings'?'selected':''}" data-officer-tab="settings">비밀번호 변경</button></div>
  ${state.officerTab==='records'?`<section class="card"><h2>✍️ 제출된 기록</h2><div class="filter-bar"><select id="officerFilter" aria-label="확인 상태별 보기"><option value="pending" ${state.officerStatus==='pending'?'selected':''}>확인 대기</option><option value="all" ${state.officerStatus==='all'?'selected':''}>전체</option><option value="approved" ${state.officerStatus==='approved'?'selected':''}>승인 완료</option><option value="changes_requested" ${state.officerStatus==='changes_requested'?'selected':''}>보완 요청</option></select><span class="muted small">${filtered.length}건</span></div>
  <div class="record-list">${filtered.length?filtered.map(r=>entryCard(r,'officer')).join(''):'<div class="empty">확인할 기록이 없어요. 🎉</div>'}</div></section>`:''}
  ${state.officerTab==='students'?`<section class="card"><h2>👨‍🎓 ${dataset.grade}학년 학생 명단</h2><div class="scroll-x"><table class="student-table"><thead><tr><th>번호</th><th>이름</th><th>제출 기록</th><th>승인 완료</th></tr></thead><tbody>${dataset.students.map(s=>`<tr><td>${s.number}번</td><td>${escapeHtml(s.name)}</td><td>${dataset.records.filter(r=>r.studentKey===s.id).length}건</td><td>${dataset.records.filter(r=>r.studentKey===s.id&&r.status==='approved').length}건</td></tr>`).join('')}</tbody></table></div></section>`:''}
  ${state.officerTab==='settings'?`<section class="card"><h2>🔐 학년별 공용 비밀번호 변경</h2><form id="officerPasswordForm"><div class="field"><label for="newOfficerPass">새 임원 비밀번호</label><input id="newOfficerPass" name="password" type="password" minlength="4" maxlength="90" required autocomplete="new-password" /></div><button class="button" type="submit" data-action="submit">비밀번호 변경</button></form><p class="field-help">변경한 비밀번호는 담당 반장·부반장에게만 알려 주세요.</p></section>`:''}`;
}
function adminAuth(){return `<div class="login-container"><div class="auth-header"><div class="icon">🛡️</div><h1 class="page-title">교사 관리자</h1><p class="subheading">전교생 기록과 학년별 운영 현황을 관리합니다.</p></div><div class="card"><form id="adminLoginForm"><div class="field"><label for="adminPassword">교사 전용 비밀번호</label><input id="adminPassword" name="password" type="password" minlength="10" maxlength="90" required autocomplete="off" placeholder="관리자 비밀번호" /></div><button class="button full" data-action="submit" ${!apiReady?'disabled':''}>관리실 들어가기</button></form><p class="field-help">관리자 비밀번호는 서버에서만 확인합니다. 처음 접속한 후 변경해 주세요.</p></div></div>`;}
function adminPage(){
  if(state.role!=='admin')return adminAuth();
  const dataset=state.admin||{students:[],records:[]};const {students,records}=dataset;
  const filtered=records.filter(r=>(state.adminStatus==='all'||r.status===state.adminStatus)&&(state.adminGrade===0||r.grade===state.adminGrade));
  const summary=records.filter(r=>r.status==='approved').length;
  return `<div class="title-row"><div><h1 class="page-title">교사 통합 관리실 🛡️</h1><p class="subheading">1~6학년 전체 기록을 안전하게 관리해요.</p></div><span class="pill">관리자</span></div>
  <div class="three-cols" style="margin-bottom:18px"><div class="teacher-stat"><span>등록 학생</span><strong>${students.length}명</strong></div><div class="teacher-stat"><span>전체 기록</span><strong>${records.length}건</strong></div><div class="teacher-stat"><span>승인된 열매</span><strong>${summary}개</strong></div></div>
  <div class="tabs"><button class="${state.adminTab==='records'?'selected':''}" data-admin-tab="records">기록 관리</button><button class="${state.adminTab==='students'?'selected':''}" data-admin-tab="students">학생 관리</button><button class="${state.adminTab==='settings'?'selected':''}" data-admin-tab="settings">운영 설정</button></div>
  ${state.adminTab==='records'?`<section class="card"><div class="title-row"><h2>📚 전체 기록</h2><button class="button small secondary" type="button" data-action="export-csv">⬇ 엑셀용 CSV 내려받기</button></div>
    <div class="filter-bar"><select id="adminGradeFilter" aria-label="학년별 기록 보기"><option value="0" ${state.adminGrade===0?'selected':''}>전체 학년</option>${numberOptions(1,6,state.adminGrade)}</select><select id="adminFilter" aria-label="기록 상태별 보기"><option value="all" ${state.adminStatus==='all'?'selected':''}>모든 상태</option><option value="pending" ${state.adminStatus==='pending'?'selected':''}>확인 대기</option><option value="approved" ${state.adminStatus==='approved'?'selected':''}>승인 완료</option><option value="changes_requested" ${state.adminStatus==='changes_requested'?'selected':''}>보완 요청</option></select><span class="muted small">${filtered.length}건</span></div>
    <div class="record-list">${filtered.length?filtered.map(r=>entryCard({...r,studentName:students.find(s=>s.id===r.studentKey)?.name||''},'admin')).join(''):'<div class="empty">해당하는 기록이 없어요.</div>'}</div></section>`:''}
  ${state.adminTab==='students'?`<section class="card"><h2>👩‍🎓 학생 계정 관리</h2><p class="field-help">비밀번호 재설정 시 숫자 4자리가 새로 발급됩니다. 학생에게 직접 알려 주세요.</p><div class="scroll-x"><table class="student-table"><thead><tr><th>학년</th><th>번호</th><th>이름</th><th>상태</th><th>관리</th></tr></thead><tbody>${students.map(s=>`<tr><td>${s.grade}학년</td><td>${s.number}번</td><td>${escapeHtml(s.name)}</td><td>${s.active?'사용 중':'잠금'}</td><td><div class="panel-actions"><button class="button small secondary" data-reset-pin="${s.id}">비번 재설정</button><button class="button small outline" data-lock-student="${s.id}" data-active="${s.active?'false':'true'}">${s.active?'잠금':'잠금 해제'}</button><button class="button small danger" data-delete-student="${s.id}">계정 삭제</button></div></td></tr>`).join('')}</tbody></table></div></section>`:''}
  ${state.adminTab==='settings'?`<section class="two-cols"><div class="card"><h2>🔐 교사 비밀번호 변경</h2><form id="adminPasswordForm"><div class="field"><label for="newAdminPassword">새 비밀번호 (10자 이상)</label><input id="newAdminPassword" type="password" name="password" minlength="10" maxlength="90" autocomplete="new-password" required /></div><button class="button" type="submit" data-action="submit">관리자 비밀번호 변경</button></form></div>
  <div class="card"><h2>✅ 학급 임원 비밀번호 변경</h2><form id="adminOfficerPasswordForm"><div class="field"><label for="adminOfficerGrade">학년</label><select id="adminOfficerGrade" name="grade">${numberOptions(1,6,1)}</select></div><div class="field"><label for="adminOfficerPass">새 임원 비밀번호</label><input id="adminOfficerPass" name="password" type="password" minlength="4" maxlength="90" required /></div><button class="button" type="submit" data-action="submit">임원 비밀번호 변경</button></form></div>
  </section><section class="card danger-panel"><h3>⚠️ 학년별 기록 일괄 삭제</h3><p class="field-help">학생 계정은 그대로 두고 선택 학년의 독서·칭찬 기록만 영구 삭제합니다. 복구할 수 없습니다.</p><div class="button-row"><select id="deleteGradeSelect" aria-label="삭제할 학년">${numberOptions(1,6,1)}</select><button type="button" class="button small danger" data-action="delete-grade">선택 학년 기록 삭제</button></div></section>`:''}`;
}
async function submitted(form){
  const fields=Object.fromEntries(new FormData(form).entries());setBusy(true);
  try{
    if(form.id==='studentAuthForm'){
      const data=await api(state.studentAuthTab==='register'?'/api/register':'/api/login',{method:'POST',body:{...fields,role:'student'}});
      saveSession(data);await refreshMine();state.editingId='';state.writingType='reading';toast(`${escapeHtml(data.student.name)} 학생, 반가워요!`);render();
    }else if(form.id==='officerLoginForm'){
      const data=await api('/api/login',{method:'POST',body:{...fields,role:'officer'}});
      saveSession(data);await refreshOfficer();toast('학급 임원 관리실에 들어왔어요.');render();
    }else if(form.id==='adminLoginForm'){
      const data=await api('/api/login',{method:'POST',body:{...fields,role:'admin'}});
      saveSession(data);await refreshAdmin();toast('교사 관리실에 들어왔어요.');render();
    }else if(form.id==='recordForm'){
      const payload={type:state.writingType,...fields,...(state.editingId?{id:state.editingId}:{})};
      await api('/api/record/save',{method:'POST',body:payload});state.editingId='';await refreshMine();toast('기록이 제출되었어요! 임원의 확인을 기다려요.');render();
    }else if(form.id==='officerPasswordForm'){
      await api('/api/officer/password',{method:'POST',body:fields});clearSession();render();toast('임원 비밀번호를 변경했어요. 새 비밀번호로 다시 로그인해 주세요.');
    }else if(form.id==='adminPasswordForm'){
      await api('/api/admin/change-password',{method:'POST',body:fields});clearSession();render();toast('교사 비밀번호를 변경했어요. 새 비밀번호로 다시 로그인해 주세요.');
    }else if(form.id==='adminOfficerPasswordForm'){
      await api('/api/officer/password',{method:'POST',body:fields});toast('선택한 학년 임원 비밀번호를 변경했어요.');form.reset();
    }
  }catch(err){toast(err.message);}finally{setBusy(false);}
}
async function review(id,decision){
  let feedback='';
  if(decision==='changes_requested'){
    feedback=prompt('학생에게 알려줄 보완 내용을 입력해 주세요.\n예: 친구가 한 행동을 조금 더 구체적으로 적어 주세요.')||'';
    if(!feedback.trim())return;
  }else if(!confirm('이 글을 승인하면 작성자 이름 없이 내용이 마음나무에 공개됩니다. 친구 이름이나 개인정보가 포함되지 않았는지 확인하셨나요?'))return;
  try{await api('/api/review',{method:'POST',body:{id,decision,feedback}});await Promise.all([refreshTree(),state.role==='admin'?refreshAdmin():refreshOfficer()]);toast(decision==='approved'?'기록을 승인했어요. 열매가 맺혔어요!':'보완 요청을 보냈어요.');render();}
  catch(err){toast(err.message);}
}
async function award(id){if(!confirm('상품를 실제로 전달했나요? 확인하면 지급 완료로 기록됩니다.'))return;
  try{const data=await api('/api/award',{method:'POST',body:{id}});await(state.role==='admin'?refreshAdmin():refreshOfficer());toast(`지급 완료! 이번 주 ${data.count}/2개`);render();}
  catch(err){toast(err.message);}
}
function exportCsv(){
  const data=state.admin;if(!data)return;
  const safe=value=>{let s=String(value??'').replace(/\r?\n/g,' ');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
  const headings=['학년','번호','이름','종류','책 제목','칭찬 친구','내용/행동','칭찬 이유','상태','작성일시','승인일시','상품 지급일시','보완 의견'];
  const rows=data.records.map(r=>{const s=data.students.find(s=>s.id===r.studentKey);return [r.grade,r.studentNumber,s?.name||'',r.type==='reading'?'독서':'칭찬',r.title,r.peerName,r.type==='reading'?r.content:r.deed,r.reason,statusLabel(r.status),dateLabel(r.createdAt),dateLabel(r.approvedAt),dateLabel(r.rewardedAt),r.feedback];});
  const blob=new Blob(['\ufeff'+[headings,...rows].map(x=>x.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8;'});
  const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download='마음나무_기록_'+new Date().toISOString().slice(0,10)+'.csv';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1000);
  toast('엑셀에서 열 수 있는 CSV 파일을 저장했어요.');
}
async function handleAction(action){
  if(action==='cancel-edit'){state.editingId='';state.writingType='reading';render();return;}
  if(action==='export-csv'){exportCsv();return;}
  if(action==='delete-grade'){
    const grade=Number($('#deleteGradeSelect')?.value||1);const expected=`${grade}학년 삭제`;
    if(prompt(`${grade}학년의 모든 기록이 영구 삭제됩니다.\n계속하려면 '${expected}'를 정확히 입력해 주세요.`)!==expected)return;
    try{const data=await api('/api/admin/delete-grade-records',{method:'POST',body:{grade,confirm:expected}});await Promise.all([refreshAdmin(),refreshTree()]);toast(`${data.deletedRecords}개 기록을 삭제했어요.`);render();}catch(err){toast(err.message);}return;
  }
}
async function handleTeacherButton(button){
  const id=button.dataset.resetPin||button.dataset.lockStudent||button.dataset.deleteStudent;
  if(!id)return false;
  const [grade,number]=id.split('-').map(Number);
  try {
    if(button.dataset.resetPin){if(!confirm(`${grade}학년 ${number}번 학생의 4자리 비밀번호를 재설정할까요?`))return true;
      const data=await api('/api/admin/reset-pin',{method:'POST',body:{grade,number}});
      alert(`새로 발급된 임시 비밀번호: ${data.pin}\n학생에게 개별적으로 전달해 주세요. 이 창을 닫으면 다시 볼 수 없습니다.`);
    }else if(button.dataset.lockStudent){const active=button.dataset.active==='true';if(!confirm(`이 계정을 ${active?'사용 가능하게 변경':'잠금'}할까요?`))return true;
      await api('/api/admin/lock-student',{method:'POST',body:{grade,number,active}});toast('계정 상태를 변경했어요.');
    }else if(button.dataset.deleteStudent){if(prompt(`계정과 모든 기록을 삭제합니다. 복구할 수 없습니다. 계속하려면 ${id}를 입력하세요.`)!==id)return true;
      const res=await api('/api/admin/delete-student',{method:'POST',body:{grade,number,confirm:id}});toast(`학생과 기록 ${res.deletedRecords}개를 삭제했어요.`);
    }
    await Promise.all([refreshAdmin(),refreshTree()]);render();
  }catch(err){toast(err.message);}return true;
}
main.addEventListener('submit',event=>{event.preventDefault();if(!state.busy)submitted(event.target);});
main.addEventListener('change',event=>{
  if(event.target.id==='studentFilter'){state.studentStatus=event.target.value;render();}
  if(event.target.id==='officerFilter'){state.officerStatus=event.target.value;render();}
  if(event.target.id==='adminFilter'){state.adminStatus=event.target.value;render();}
  if(event.target.id==='adminGradeFilter'){state.adminGrade=Number(event.target.value);render();}
});
document.addEventListener('click',async event=>{
  const btn=event.target.closest('button');if(!btn)return;
  if(btn.id==='closeFruit'){$('#fruitDialog').close();return;}
  if(btn.id==='logoutButton'){
    try{if(state.token)await api('/api/logout',{method:'POST',body:{}});}catch{}
    clearSession();toast('로그아웃했어요.');render();return;
  }
  if(btn.dataset.nav){await navigate(btn.dataset.nav);return;}
  if(btn.dataset.fruit){const f=(apiReady?(state.tree?.fruits||[]):DEMO_FRUITS).find(f=>f.id===btn.dataset.fruit);if(!f)return;
    $('#fruitDialogType').textContent=`${f.grade}학년 · ${f.type==='reading'?'🍎 독서 기록':'🍑 친구 칭찬'}`;
    $('#fruitDialogContent').textContent=f.text;$('#fruitDialog').showModal();return;}
  if(btn.dataset.authTab){state.studentAuthTab=btn.dataset.authTab;render();return;}
  if(btn.dataset.writeType){state.writingType=btn.dataset.writeType;state.editingId='';render();return;}
  if(btn.dataset.edit){state.editingId=btn.dataset.edit;state.writingType=(state.mine?.records||[]).find(r=>r.id===btn.dataset.edit)?.type||'reading';render();document.querySelector('#writePanel')?.scrollIntoView({behavior:'smooth'});return;}
  if(btn.dataset.officerTab){state.officerTab=btn.dataset.officerTab;render();return;}
  if(btn.dataset.adminTab){state.adminTab=btn.dataset.adminTab;render();return;}
  if(btn.dataset.review){await review(btn.dataset.review,btn.dataset.decision);return;}
  if(btn.dataset.award){await award(btn.dataset.award);return;}
  if(btn.dataset.deleteRecord){if(!confirm('이 기록을 영구 삭제할까요?'))return;
    try{await api('/api/admin/delete-record',{method:'POST',body:{id:btn.dataset.deleteRecord}});await Promise.all([refreshAdmin(),refreshTree()]);toast('기록을 삭제했어요.');render();}catch(err){toast(err.message);}return;}
  if(await handleTeacherButton(btn))return;
  if(btn.dataset.action)await handleAction(btn.dataset.action);
});
$('#fruitDialog').addEventListener('click',event=>{if(event.target.id==='fruitDialog')event.target.close();});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
(async()=>{
  if(!apiReady){$('#serviceBanner').textContent='🔧 서버 연결 전 미리보기입니다. 열매는 예시이며, 학생 가입·저장·승인은 아직 동작하지 않습니다.';$('#serviceBanner').classList.remove('hidden');}
  if(state.token&&apiReady){
    try{const me=await api('/api/me');state.role=me.role;state.student=me.student||null;state.identity=me.student?.id||String(me.grade||'master');
      if(state.role==='student')await refreshMine();else if(state.role==='officer')await refreshOfficer();else if(state.role==='admin')await refreshAdmin();
    }catch{clearSession();}
  }else if(state.token&&!apiReady)clearSession();
  render();await refreshTree();
})();
