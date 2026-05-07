# rods-agent

Sistema agentic de responsabilizacao financeira via Telegram, Gemini API e Notion API.

## Status

Este repositorio esta no scaffold inicial. O endpoint do Telegram ja recebe updates e responde uma mensagem fixa, mas a logica agentic, o onboarding completo e a persistencia no Notion ainda nao foram implementados.

## Requisitos

- Node.js
- npm
- Vercel CLI
- Uma conta/bot do Telegram

## Configuracao

Crie um arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env
```

Preencha as variaveis locais no `.env`. Nao coloque chaves reais no `.env.example`.

## Rodando localmente

Instale as dependencias:

```bash
npm install
```

Suba o ambiente serverless local:

```bash
npx vercel dev
```

O webhook local ficara disponivel em:

```text
/api/telegram
```

## Endpoint inicial

`POST /api/telegram`

O endpoint extrai `chatId` e `text` do update do Telegram e envia a resposta fixa:

```text
RODS online. Agora vamos calibrar seu radar financeiro.
```
