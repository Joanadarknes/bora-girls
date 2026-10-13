export function ledger(trip) {
  const balances = Object.fromEntries(trip.members.map(m => [m.id, 0]));
  let total = 0;
  for (const e of trip.expenses) {
    total += e.amount;
    balances[e.payer] += e.amount;
    const share = Math.floor(e.amount / e.people.length);
    e.people.forEach((id, i) => balances[id] -= share + (i < e.amount % e.people.length ? 1 : 0));
  }
  for (const p of trip.payments) { balances[p.from] += p.amount; balances[p.to] -= p.amount; }
  const debtors = trip.members.filter(m => balances[m.id] < 0).map(m => ({id:m.id, amount:-balances[m.id]}));
  const creditors = trip.members.filter(m => balances[m.id] > 0).map(m => ({id:m.id, amount:balances[m.id]}));
  const transfers = [];
  for (const d of debtors) for (const c of creditors) {
    const amount = Math.min(d.amount, c.amount);
    if (amount) { transfers.push({from:d.id,to:c.id,amount}); d.amount -= amount; c.amount -= amount; }
  }
  return {total, balances, transfers};
}
