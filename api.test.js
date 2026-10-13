import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

test('API compartilhada: persistência, validação, concorrência e baixa',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'juntas-test-'));
 const proc=spawn(process.execPath,['server.js'],{env:{...process.env,PORT:'3097',DB_PATH:join(dir,'test.sqlite')},stdio:['ignore','pipe','pipe']});
 try {
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Servidor não iniciou')),10000);proc.stdout.once('data',()=>{clearTimeout(timer);resolve();});proc.once('error',reject);proc.once('exit',code=>{clearTimeout(timer);reject(Error('Servidor terminou: '+code));});});
  const call=async(path='',method='GET',body)=>{const res=await fetch('http://localhost:3097/api/trips'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});return {status:res.status,data:await res.json()};};
  let result=await call('','POST',{name:'Teste de viagem',members:['Ana','Bia','Carla']});
  assert.equal(result.status,201);
  let trip=result.data;const route='/'+trip.id;const [a,b,c]=trip.members.map(m=>m.id);
  result=await call(route+'/expenses','POST',{revision:0,description:'Carne',amount:12000,payer:a,people:[a,b,c],category:'Alimentação',date:'2026-10-12'});
  assert.equal(result.status,200);trip=result.data;
  assert.equal((await call(route+'/expenses','POST',{revision:0})).status,409);
  assert.equal((await call(route+'/expenses','POST',{revision:1,description:'Inválido',amount:100,payer:a,people:[],date:'2026-10-12'})).status,400);
  result=await call(route+'/expenses','POST',{revision:1,description:'Cinema',amount:6000,payer:b,people:[a,b,c],category:'Passeios',date:'2026-10-12'});
  trip=result.data;assert.deepEqual(trip.transfers,[{from:c,to:a,amount:6000}]);
  assert.equal((await call(route+'/payments','POST',{revision:2,from:c,to:a,amount:6001})).status,400);
  result=await call(route+'/payments','POST',{revision:2,from:c,to:a,amount:2000});
  assert.equal(result.status,200);trip=result.data;assert.equal(trip.transfers[0].amount,4000);
  result=await call(route+'/payments','POST',{revision:3,from:c,to:a,amount:4000});
  trip=result.data;assert.deepEqual(trip.transfers,[]);
  const shared=(await call(route)).data;assert.deepEqual(shared.payments,trip.payments);assert.equal(shared.total,18000);
  result=await call(route+'/payments/'+trip.payments[0].id,'DELETE',{revision:4});
  assert.equal(result.data.transfers[0].amount,4000);
  assert.equal((await call('/'+'0'.repeat(48))).status,404);
 } finally {proc.kill();}
});
