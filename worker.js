import { ledger } from './ledger.js';

const fail = (message, status=400) => { throw Object.assign(new Error(message), {status}); };
const label = v => typeof v==='string' && v.trim().length>0 && v.trim().length<=100 ? v.trim() : fail('Preencha um nome de até 100 caracteres.');
const money = v => Number.isSafeInteger(v) && v>0 && v<=100000000 ? v : fail('Informe um valor válido, maior que zero.');

export default {
 async fetch(req, env) {
  const origin=req.headers.get('Origin');
  const allowed=env.ALLOWED_ORIGIN;
  const headers={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(origin===allowed) headers['Access-Control-Allow-Origin']=origin;
  const send=(data,status=200)=>new Response(JSON.stringify(data),{status,headers});
  if(origin && origin!==allowed) return send({error:'Origem não permitida.'},403);
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'GET, POST, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400'}});
  try {
   const url=new URL(req.url);
   if(req.method==='GET' && url.pathname==='/health') return send({ok:true});
   let b={};
   if(['POST','DELETE'].includes(req.method)) {
    if(!req.headers.get('Content-Type')?.startsWith('application/json')) fail('Envie os dados em JSON.',415);
    const reader=req.body?.getReader();
    if(!reader) fail('Dados inválidos.');
    const chunks=[];let size=0;
    while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>30000){await reader.cancel();fail('Dados muito grandes.',413);}chunks.push(value);}
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    try {b=JSON.parse(new TextDecoder().decode(bytes));}catch{fail('Dados inválidos.');}
    if(!b || typeof b!=='object' || Array.isArray(b)) fail('Dados inválidos.');
   }
   if(req.method==='POST' && url.pathname==='/api/trips') {
    if(!Array.isArray(b.members)||b.members.length<2||b.members.length>30) fail('Adicione de 2 a 30 pessoas.');
    const names=b.members.map(label);
    if(new Set(names.map(n=>n.toLocaleLowerCase())).size!==names.length) fail('Use nomes diferentes para cada pessoa.');
    const id=Array.from(crypto.getRandomValues(new Uint8Array(24)),v=>v.toString(16).padStart(2,'0')).join('');
    const trip={id,name:label(b.name),destination:typeof b.destination==='string'?b.destination.trim().slice(0,100):'',members:names.map(name=>({id:crypto.randomUUID(),name})),expenses:[],payments:[],revision:0};
    await env.DB.prepare('INSERT INTO trips (id,data) VALUES (?,?)').bind(id,JSON.stringify(trip)).run();
    return send({...trip,...ledger(trip)},201);
   }
   const match=url.pathname.match(/^\/api\/trips\/([a-f0-9]{48})(?:\/(expenses|payments|members)(?:\/([a-f0-9-]+))?)?$/);
   if(!match) fail('Página não encontrada.',404);
   const [,id,kind,itemId]=match;
   const row=await env.DB.prepare('SELECT data FROM trips WHERE id=?').bind(id).first();
   if(!row) fail('Viagem não encontrada. Confira o link.',404);
   const trip=JSON.parse(row.data);
   if(req.method==='GET' && !kind) return send({...trip,...ledger(trip)});
   if(!['POST','DELETE'].includes(req.method)||!kind) fail('Operação não encontrada.',404);
   if(b.revision!==trip.revision) fail('A viagem foi atualizada por outra pessoa. Confira os dados e tente novamente.',409);
   const member=id=>trip.members.some(m=>m.id===id)?id:fail('Participante inválido.');
   if(req.method==='DELETE') {
    if(!['expenses','payments'].includes(kind)||!trip[kind].some(i=>i.id===itemId)) fail('Registro não encontrado.',404);
    trip[kind]=trip[kind].filter(i=>i.id!==itemId);
   } else if(kind==='members') {
    const name=label(b.name);
    if(trip.members.length>=30||trip.members.some(m=>m.name.toLocaleLowerCase()===name.toLocaleLowerCase())) fail('Nome repetido ou limite de 30 pessoas atingido.');
    trip.members.push({id:crypto.randomUUID(),name});
   } else if(kind==='expenses') {
    if(!Array.isArray(b.people)||!b.people.length||new Set(b.people).size!==b.people.length) fail('Selecione quem divide este gasto.');
    const category=['Alimentação','Transporte','Hospedagem','Passeios','Compras','Outros'].includes(b.category)?b.category:'Outros';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(b.date)||!Number.isFinite(Date.parse(b.date))||new Date(b.date).toISOString().slice(0,10)!==b.date) fail('Informe uma data válida.');
    trip.expenses.unshift({id:crypto.randomUUID(),description:label(b.description),amount:money(b.amount),payer:member(b.payer),people:b.people.map(member),date:b.date,category});
   } else {
    const from=member(b.from),to=member(b.to),amount=money(b.amount);
    if(from===to) fail('Escolha pessoas diferentes.');
    const suggestion=ledger(trip).transfers.find(t=>t.from===from&&t.to===to);
    if(!suggestion||amount>suggestion.amount) fail('O pagamento ultrapassa o valor pendente. Atualize a divisão.');
    trip.payments.unshift({id:crypto.randomUUID(),from,to,amount,date:new Date().toISOString()});
   }
   trip.revision++;
   const saved=await env.DB.prepare("UPDATE trips SET data=? WHERE id=? AND json_extract(data,'$.revision')=?").bind(JSON.stringify(trip),id,b.revision).run();
   if(saved.meta.changes!==1) fail('A viagem foi atualizada por outra pessoa. Confira os dados e tente novamente.',409);
   return send({...trip,...ledger(trip)});
  } catch(e) {return send({error:e.status?e.message:'Não foi possível salvar. Tente novamente.'},e.status||500);}
 }
};
