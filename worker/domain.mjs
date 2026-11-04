// Pure rules shared with the test suite. No browser or network dependencies.
export const GRADES = [1, 2, 3, 4, 5, 6];
export const STUDENT_NUMBER_MAX = 50;
export function studentKey(grade, number) {
  const g = Number(grade), n = Number(number);
  if (!Number.isInteger(g) || g < 1 || g > 6 || !Number.isInteger(n) || n < 1 || n > STUDENT_NUMBER_MAX) throw new Error('학년과 번호를 확인해 주세요.');
  return `${g}-${String(n).padStart(2, '0')}`;
}
export function validPin(pin) { return typeof pin === 'string' && /^\d{4}$/.test(pin); }
export function validName(name) { return typeof name === 'string' && /^[가-힣a-zA-Z\s]{2,20}$/.test(name.trim()); }
export function weekStart(time = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(time);
  const parts = Object.fromEntries(ymd.map(x => [x.type, x.value]));
  const date = new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day));
  const distance = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - distance);
  return date.toISOString().slice(0, 10);
}
export function validateEntry(input, grade) {
  const type = input?.type;
  if (!['reading','praise'].includes(type)) throw new Error('기록 종류를 선택해 주세요.');
  const clean = x => String(x ?? '').trim().replace(/\s+/g, ' ');
  if (type === 'reading') {
    const title = clean(input.title), content = clean(input.content);
    const min = Number(grade) <= 2 ? 8 : 15;
    if (title.length < 1 || title.length > 80) throw new Error('책 제목은 1~80자로 입력해 주세요.');
    if (content.length < min || content.length > 400) throw new Error(`독서 기록을 ${min}~400자로 작성해 주세요.`);
    return { type, title, content, peerName:'', deed:'', reason:'' };
  }
  const peerName = clean(input.peerName), deed = clean(input.deed), reason = clean(input.reason);
  const minimum = Number(grade) <= 2 ? 6 : 12;
  if (!validName(peerName)) throw new Error('칭찬할 친구 이름을 입력해 주세요.');
  if (deed.length < minimum || deed.length > 300) throw new Error(`친구가 한 행동을 ${minimum}~300자로 구체적으로 써 주세요.`);
  if (reason.length < (Number(grade) <= 2 ? 4 : 8) || reason.length > 300) throw new Error('칭찬하는 이유를 조금 더 구체적으로 적어 주세요.');
  const emptyPhrases = /^(착하다|친절하다|도와줬다|고맙다|칭찬한다|좋은 친구다|좋다|멋지다|최고다)[.!\s]*$/;
  if (emptyPhrases.test(deed) || emptyPhrases.test(reason)) throw new Error('어떤 일이 있었는지 실제 행동과 이유를 적어 주세요.');
  if (deed === reason) throw new Error('친구의 행동과 칭찬하는 이유를 다르게 적어 주세요.');
  return { type, title:'', content:'', peerName, deed, reason };
}
export function limitAwardCount(currentCount, alreadyAwarded, approved) {
  if (!approved) throw new Error('승인된 기록만 제티를 지급할 수 있어요.');
  if (alreadyAwarded) throw new Error('이미 제티를 지급한 기록이에요.');
  if (currentCount >= 2) throw new Error('이번 주에는 이미 제티 2개를 지급했어요.');
  return currentCount + 1;
}
export function hideNames(text, names = []) {
  let result = String(text ?? '');
  const sorted = [...new Set(names.map(n=>String(n??'').trim()).filter(n=>n.length>=2))].sort((a,b)=>b.length-a.length);
  for (const name of sorted) result = result.split(name).join('친구');
  return result;
}
export function toPublicFruit(record, studentNames = []) {
  if (record.status !== 'approved') return null;
  const names = [...studentNames, record.peerName].filter(Boolean);
  const text = record.type === 'reading'
    ? `「${hideNames(record.title,names)}」 — ${hideNames(record.content,names)}`
    : `${hideNames(record.deed,names)} ${hideNames(record.reason,names)}`;
  return { id: record.id, type:record.type, grade:record.grade, text, approvedAt: record.approvedAt };
}
