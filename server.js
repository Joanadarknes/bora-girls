import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes, randomUUID} from 'node:crypto';
import {mkdirSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ledger} from './ledger.js';
mkdirSync(new URL('./data/', import.meta.url), {recursive:true});
const db = new DatabaseSync(process.env.DB_PATH || fileURLToPath(new URL('./data/trips.sqlite', import.meta.url)));
db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, data TEXT NOT NULL)');
const assets = {'/config.js':['config.js','text/javascript'], '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css']};
const fail = (message, status=400) => {throw Object.assign(new Error(message), {status});};
const label = (v) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= 100 ? v.trim() : fail('Preencha um nome de até 100 caracteres.');
const money = v => Number.isSafeInteger(v) && v > 0 && v <= 100000000 ? v : fail('Informe um valor válido, maior que zero.');
async function body(req) { let s=''; for await (const chunk of req) {s += chunk; if(s.length>30000) fail('Dados muito grandes.',413);} try {return JSON.parse(s);} catch {fail('Dados inválidos.');} }
const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const send = (value,status=200) => {res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
  try {
    const url = new URL(req.url,'http://localhost');
    if(req.method==='GET' && assets[url.pathname]) {const [file,type]=assets[url.pathname];res.writeHead(200, {'Content-Type':type+'; charset=utf-8'});return res.end(readFileSync(new URL('./public/'+file,import.meta.url)));}
    if(req.method==='POST' && url.pathname==='/api/trips') {
      const b = await body(req);
      if(!Array.isArray(b.members) || b.members.length < 2 || b.members.length > 30) fail('Adicione de 2 a 30 pessoas.');
      const names = b.members.map(label);
      if(new Set(names.map(n=>n.toLocaleLowerCase())).size!==names.length) fail('Use nomes diferentes para cada pessoa.');
      const trip = {id:randomBytes(24).toString('hex'),name:label(b.name),destination:typeof b.destination==='string'?b.destination.trim().slice(0,100):'',members:names.map(name=>({id:randomUUID(),name})),expenses:[],payments:[],revision:0};
      db.prepare('INSERT INTO trips VALUES (?,?)').run(trip.id,JSON.stringify(trip));
      return send({...trip,...ledger(trip)},201);
    }
    const match = url.pathname.match(/^\/api\/trips\/([a-f0-9]{48})(?:\/(expenses|payments|members)(?:\/([a-f0-9-]+))?)?$/);
    if(!match) fail('Página não encontrada.',404);
    const [,id,kind,itemId] = match;
    const b = ['POST','DELETE'].includes(req.method) ? await body(req) : {};
    const row = db.prepare('SELECT data FROM trips WHERE id=?').get(id);
    if(!row) fail('Viagem não encontrada. Confira o link.',404);
    const trip = JSON.parse(row.data);
    if(req.method==='GET' && !kind) return send({...trip,...ledger(trip)});
    if(!['POST','DELETE'].includes(req.method) || !kind) fail('Operação não encontrada.',404);
    if(b.revision !== trip.revision) fail('A viagem foi atualizada por outra pessoa. Confira os dados e tente novamente.',409);
    const member = id => trip.members.some(m=>m.id===id) ? id : fail('Participante inválido.');
    if(req.method==='DELETE') {
      if(!['expenses','payments'].includes(kind) || !trip[kind].some(i=>i.id===itemId)) fail('Registro não encontrado.',404);
      trip[kind] = trip[kind].filter(i=>i.id!==itemId);
    } else if(kind==='members') {
      const name = label(b.name);
      if(trip.members.length>=30 || trip.members.some(m=>m.name.toLocaleLowerCase()===name.toLocaleLowerCase())) fail('Nome repetido ou limite de 30 pessoas atingido.');
      trip.members.push({id:randomUUID(),name});
    } else if(kind==='expenses') {
      if(!Array.isArray(b.people) || !b.people.length || new Set(b.people).size!==b.people.length) fail('Selecione quem divide este gasto.');
      const category = ['Alimentação','Transporte','Hospedagem','Passeios','Compras','Outros'].includes(b.category)?b.category:'Outros';
      if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date) || !Number.isFinite(Date.parse(b.date)) || new Date(b.date).toISOString().slice(0,10)!==b.date) fail('Informe uma data válida.');
      trip.expenses.unshift({id:randomUUID(),description:label(b.description),amount:money(b.amount),payer:member(b.payer),people:b.people.map(member),date:b.date,category});
    } else {
      const from=member(b.from),to=member(b.to),amount=money(b.amount);
      if(from===to) fail('Escolha pessoas diferentes.');
      const suggestion=ledger(trip).transfers.find(t=>t.from===from && t.to===to);
      if(!suggestion || amount>suggestion.amount) fail('O pagamento ultrapassa o valor pendente. Atualize a divisão.');
      trip.payments.unshift({id:randomUUID(),from,to,amount,date:new Date().toISOString()});
    }
    trip.revision++;
    db.prepare('UPDATE trips SET data=? WHERE id=?').run(JSON.stringify(trip),id);
    send({...trip,...ledger(trip)});
  } catch(e) {if(!e.status) console.error(e);send({error:e.status?e.message:'Não foi possível salvar. Tente novamente.'},e.status||500);}
});
server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Juntas disponível em http://localhost:'+(process.env.PORT||3000)));
