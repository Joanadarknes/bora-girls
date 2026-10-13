import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker from './worker.js';
test('Worker: CORS, gastos, baixas e alterações simultâneas',async()=>{
 const db=new DatabaseSync(':memory:');
 db.exec('CREATE TABLE trips (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
 const origin='https://joanadarknes.github.io';
 const env={ALLOWED_ORIGIN:origin,DB:{prepare(sql){return {bind(...args){return {async first(){return db.prepare(sql).get(...args);},async run(){return {meta:db.prepare(sql).run(...args)};}};}};}}};
 const call=async(path,method='GET',body,site=origin)=>worker.fetch(new Request('https://example.test'+path,{method,headers:{Origin:site,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})}),env);
 try{
  const preflight=await call('/api/trips','OPTIONS');assert.equal(preflight.status,204);assert.equal(preflight.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await call('/api/trips','GET',null,'https://other.test')).status,403);
  let res=await call('/api/trips','POST',{name:'Viagem teste',members:['Ana','Bia','Carla']});assert.equal(res.status,201);
  let trip=await res.json();const path='/api/trips/'+trip.id;const [a,b,c]=trip.members.map(m=>m.id);
  const expense={revision:0,description:'Jantar',amount:12000,payer:a,people:[a,b,c],date:'2026-10-12'};
  const concurrent=await Promise.all([call(path+'/expenses','POST',expense),call(path+'/expenses','POST',expense)]);
  assert.deepEqual(concurrent.map(r=>r.status).sort(),[200,409]);
  res=await call(path+'/expenses','POST',{...expense,revision:1,description:'Cinema',amount:6000,payer:b});assert.equal(res.status,200);
  trip=await res.json();assert.equal(trip.total,18000);assert.deepEqual(trip.transfers,[{from:c,to:a,amount:6000}]);
  assert.equal((await call(path+'/payments','POST',{revision:2,from:c,to:a,amount:6001})).status,400);
  res=await call(path+'/payments','POST',{revision:2,from:c,to:a,amount:2000});trip=await res.json();assert.equal(trip.transfers[0].amount,4000);
  res=await call(path+'/payments','POST',{revision:3,from:c,to:a,amount:4000});trip=await res.json();assert.deepEqual(trip.transfers,[]);
  res=await call(path+'/payments/'+trip.payments[0].id,'DELETE',{revision:4});assert.equal((await res.json()).transfers[0].amount,4000);
  assert.equal((await (await call(path)).json()).revision,5);
 }finally{db.close();}
});
