import test from 'node:test';
import assert from 'node:assert/strict';
import {ledger} from './ledger.js';
const members=['a','b','c'].map(id=>({id,name:id}));
test('gastos diferentes geram acertos exatos e baixas parciais e totais',()=>{
 const trip={members,expenses:[{amount:12000,payer:'a',people:['a','b','c']},{amount:6000,payer:'b',people:['a','b','c']}],payments:[]};
 assert.deepEqual(ledger(trip).transfers,[{from:'c',to:'a',amount:6000}]);
 trip.payments.push({from:'c',to:'a',amount:2000});
 assert.deepEqual(ledger(trip).transfers,[{from:'c',to:'a',amount:4000}]);
 trip.payments.push({from:'c',to:'a',amount:4000});
 assert.deepEqual(ledger(trip).balances,{a:0,b:0,c:0});
});
test('centavos e gastos com participantes selecionados mantêm soma zero',()=>{
 const result=ledger({members,expenses:[{amount:100,payer:'a',people:['a','b','c']},{amount:999,payer:'b',people:['b','c']}],payments:[]});
 assert.equal(result.total,1099);
 assert.equal(Object.values(result.balances).reduce((a,b)=>a+b,0),0);
 assert.deepEqual(result.balances,{a:66,b:466,c:-532});
});
test('adicionar participante não redistribui os gastos anteriores',()=>{
 const result=ledger({members,expenses:[{amount:1000,payer:'a',people:['a','b']}],payments:[]});
 assert.equal(result.balances.c,0);
 assert.deepEqual(result.transfers,[{from:'b',to:'a',amount:500}]);
});
