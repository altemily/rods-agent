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

Ainda não implementado:

- Persistência no Notion.
- Registro permanente de despesas, entradas e caixinhas.
- Imagem, cupom, OCR ou multimodalidade.
- Roast contextual completo baseado em IA.

Nesta branch, as classificações são apenas prévias e ainda não são registradas no Notion.

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

Quando a classificação é válida, o bot mostra uma prévia com tipo, valor, descrição, categoria e nível de necessidade. O status sempre informa que ainda não foi registrado no Notion.
