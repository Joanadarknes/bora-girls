# Bora, Girls!

Aplicativo de despesas compartilhadas de viagens, em português e reais. Requer Node.js 22.13 ou superior. Sem dependências externas.

## Publicação

A interface é publicada pelo workflow `.github/workflows/pages.yml` no GitHub Pages. A variável de repositório `API_BASE` aponta para `https://bora-girls-api.joana-d.workers.dev`. Apenas os arquivos estáticos de `public/` vão para o Pages; dados locais, testes e servidor não fazem parte do artefato.

O backend usa Cloudflare Workers e D1, definidos em `wrangler.jsonc`. O banco de produção é independente do SQLite local. Para atualizar o backend, execute `npx wrangler deploy` com a conta Cloudflare autenticada. O schema inicial é `schema.sql`. A atualização do frontend acontece em cada push para `main`.

O repositório deve ter o Pages habilitado com GitHub Actions e um plano/visibilidade compatível. Após habilitar, defina a variável de repositório `PAGES_ENABLED=true` e execute o workflow. A origem autorizada pelo backend é `https://joanadarknes.github.io`. Não coloque credenciais no frontend nem dados de viagens no Git.

## Executar

```sh
npm start
```

Abra http://localhost:3000. Crie uma viagem, cadastre os nomes e compartilhe seu link. Para celulares na mesma rede, abra primeiro `http://IP-DO-COMPUTADOR:3000` e compartilhe o link por esse endereço. O computador deve permanecer ligado e a rede/firewall precisa permitir a conexão. Para acesso fora da rede é necessário hospedar o servidor com HTTPS e disco persistente.

## Funcionamento

- Cada viagem recebe um link aleatório. Quem tem o link pode ver e alterar todos os seus registros; não há autenticação individual.
- Os dados ficam no banco SQLite `data/trips.sqlite`, no servidor, e são atualizados nas telas a cada 5 segundos.
- Cada gasto registra quem pagou e quem participa da divisão. Valores são calculados em centavos; eventuais centavos excedentes são atribuídos na ordem dos participantes selecionados.
- A média por pessoa é informativa. Os saldos individuais respeitam a participação em cada gasto.
- Os acertos sugerem transferências para quitar os saldos. A baixa admite pagamento total ou parcial, mantém histórico e pode ser desfeita. Registrar pagamento não realiza transferência bancária.
- Novos gastos ou exclusões recalculam os acertos sem apagar pagamentos anteriores. Novas pessoas não entram retroativamente em gastos antigos.
- Alterações concorrentes são rejeitadas com aviso para revisão; o servidor não sobrescreve silenciosamente um estado antigo.

## Verificar

```sh
npm test
```

`PORT` define a porta, e `DB_PATH` permite mudar o caminho do banco. Faça backup consistente do SQLite (incluindo WAL, se copiar com servidor ativo) antes de migrar a hospedagem. A aplicação precisa de servidor Node e armazenamento persistente, não apenas hospedagem estática.
