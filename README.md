# rods-agent

Sistema agentic de responsabilização financeira via Telegram, Gemini API e Notion API.

O RODS é um agente financeiro comportamental que usa entrevista inicial, contexto financeiro, metas pessoais e roast controlado para interpretar decisões de consumo.

## Status

Implementado:

- Scaffold inicial do projeto em TypeScript.
- Endpoint serverless para receber updates do Telegram.
- Serviço para envio de mensagens pelo Telegram.
- Fluxo de onboarding financeiro e comportamental em memória com `Map`.
- Comandos `/start`, `/status` e `/reset`.
- Resumo final template-based após a calibração.
- Classificação textual com Gemini para despesas, rendas e contribuições em caixinhas.
- Validação da resposta estruturada da IA com Zod.
- Registro de movimentações financeiras válidas no Notion.
- Roast contextual com Gemini usando o perfil do onboarding, classificação financeira e status do Notion.
- Fallback template-based para o roast quando a IA não estiver configurada, falhar ou retornar JSON inválido.

Ainda não implementado:

- Persistência do onboarding no Notion.
- Imagem, cupom, OCR ou multimodalidade.
- Outras databases além de movimentações.
- Histórico financeiro avançado ou RAG real.

Nesta branch, apenas movimentações textuais válidas são registradas no Notion. O onboarding continua em memória.

## Requisitos

- Node.js
- npm
- Vercel CLI
- Uma conta/bot do Telegram

## Configuração

Crie um arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Preencha as variáveis locais no `.env`. Não coloque chaves reais no `.env.example`.

Para habilitar a classificação textual, configure:

```text
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
```

Se `GEMINI_API_KEY` não estiver configurada, o bot continua funcionando, mas avisa que a classificação por IA ainda não está ativa.

Para habilitar o registro de movimentações no Notion, configure:

```text
NOTION_TOKEN=
NOTION_MOVEMENTS_DATABASE_ID=
```

Se o Notion não estiver configurado ou falhar, o bot informa que a classificação funcionou, mas o registro não foi concluído.

## Rodando localmente

Instale as dependências:

```bash
npm install
```

Suba o ambiente serverless local:

```bash
npx vercel dev
```

O webhook local fica disponível em:

```text
/api/telegram
```

## Onboarding

O RODS mantém o estado do onboarding em memória, identificado pelo `chatId` do Telegram. Esse estado é temporário e será substituído por persistência depois.

Comandos disponíveis:

- `/start`: inicia a calibração se ela ainda não começou.
- `/status`: informa a etapa atual da calibração.
- `/reset`: apaga o estado em memória e reinicia a calibração.

Durante a entrevista, qualquer mensagem comum responde à pergunta atual e avança para a próxima etapa. Ao final, o RODS gera um resumo simples baseado nas respostas coletadas.

## Classificação Textual

Depois que o onboarding está concluído, mensagens comuns são enviadas ao Gemini para classificação textual.

O RODS tenta identificar:

- despesa
- renda
- contribuição para caixinha, reserva, investimento ou meta
- mensagem sem intenção financeira clara

Quando a classificação é válida, o bot mostra tipo, valor, categoria e nível de necessidade. Se a movimentação atender aos critérios de registro, o RODS também tenta registrar no Notion e complementa a resposta com um roast contextual seguro.

## Registro no Notion

O RODS registra no Notion apenas quando a classificação textual atende todos os critérios:

- `intent` diferente de `UNKNOWN`
- `confidence >= 0.7`
- `needsConfirmation === false`
- `amount` informado

As páginas são criadas na database configurada em `NOTION_MOVEMENTS_DATABASE_ID`, usando a origem `TEXT` e status `Registrado`.

## Roast Contextual

Depois do onboarding concluído e de uma classificação válida, o RODS gera um comentário contextual considerando:

- perfil coletado no onboarding;
- renda, frequência de recebimento, despesas fixas e dívidas;
- meta principal, valor e prazo;
- rotina semanal, gatilhos de consumo e categorias de risco;
- caixinhas/investimentos;
- nível de roast permitido e limites sensíveis;
- classificação da movimentação;
- status do registro no Notion.

O roast só é gerado quando:

- onboarding está concluído;
- `intent !== UNKNOWN`;
- `confidence >= 0.7`;
- `needsConfirmation === false`;
- `amount !== null`.

A resposta final mantém uma estrutura previsível:

```text
Movimentação registrada no Notion.

Tipo: despesa
Valor: R$ 42,90
Categoria: alimentação
Nível: opcional

RODS:
...
```

O Gemini deve retornar JSON validado com Zod. Se `GEMINI_API_KEY` estiver ausente, a chamada falhar, a resposta vier vazia ou o JSON não bater com o schema esperado, o RODS usa um fallback local baseado em templates.
