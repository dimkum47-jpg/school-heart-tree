import test from 'node:test';
import assert from 'node:assert/strict';
import {studentKey, validPin, validName, validateEntry, limitAwardCount, weekStart, hideNames, toPublicFruit} from '../worker/domain.mjs';

test('student identity is normalized and invalid grade/number is rejected',()=>{
  assert.equal(studentKey(1,5),'1-05');assert.equal(studentKey('6','50'),'6-50');
  assert.throws(()=>studentKey(7,1));assert.throws(()=>studentKey(1,0));assert.throws(()=>studentKey(2,51));
});
test('student PIN is exactly four decimal digits',()=>{
  for(const s of ['0000','5629','9812'])assert.equal(validPin(s),true);
  for(const s of ['123','12345','12a4',1234,' 1234','１２３４'])assert.equal(validPin(s),false);
});
test('names and reading input are validated by grade',()=>{
  assert.ok(validName('김하늘'));assert.ok(!validName('김'));assert.ok(!validName('<img>'));
  assert.equal(validateEntry({type:'reading',title:'강아지똥',content:'아주 재미있어요.'},1).type,'reading');
  assert.throws(()=>validateEntry({type:'reading',title:'책',content:'좋아요.'},6));
});
test('meaningless praise and exact repetition are rejected',()=>{
  assert.throws(()=>validateEntry({type:'praise',peerName:'김하늘',deed:'착하다',reason:'좋다'},1));
  assert.throws(()=>validateEntry({type:'praise',peerName:'김하늘',deed:'쉬는 시간에 도와주었어요.',reason:'쉬는 시간에 도와주었어요.'},5));
  assert.equal(validateEntry({type:'praise',peerName:'김하늘',deed:'책을 잃어버렸을 때 같이 찾아주었어요.',reason:'혼자보다 금방 찾아서 고마웠어요.'},6).type,'praise');
});
test('weekly candy cannot exceed 2, approved only and no duplicate payout',()=>{
  assert.equal(limitAwardCount(0,false,true),1);assert.equal(limitAwardCount(1,false,true),2);
  assert.throws(()=>limitAwardCount(2,false,true));
  assert.throws(()=>limitAwardCount(0,true,true));
  assert.throws(()=>limitAwardCount(0,false,false));
});
test('week is Monday in Seoul, including Sunday/Monday boundary',()=>{
  assert.equal(weekStart(new Date('2026-11-01T14:59:00Z')),'2026-10-26');
  assert.equal(weekStart(new Date('2026-11-01T15:00:00Z')),'2026-11-02');
  assert.equal(weekStart(new Date('2026-11-04T01:00:00Z')),'2026-11-02');
});
test('public fruit never contains author identity metadata and masks names',()=>{
  const row={id:'abc',type:'praise',status:'approved',grade:6,studentKey:'6-01',studentNumber:1,peerName:'김하늘',deed:'김하늘이 나를 도와주었어요.',reason:'김하늘 덕분에 고마웠어요.',approvedAt:1};
  const publicFruit=toPublicFruit(row,['정하늘']);
  assert.deepEqual(Object.keys(publicFruit).sort(),['approvedAt','grade','id','text','type']);
  assert.equal(publicFruit.text.includes('김하늘'),false);
  assert.equal(toPublicFruit({...row,status:'pending'},['김하늘']),null);
  assert.equal(hideNames('김하늘과 김이 함께',['김하늘']),'친구과 김이 함께');
});
