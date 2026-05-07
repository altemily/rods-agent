# rods-agent

Sistema agentic de responsabilização financeira via Telegram, Gemini API e Notion API.

O RODS é um agente financeiro comportamental que usa entrevista inicial, contexto financeiro, metas pessoais e roast controlado para registrar, analisar e confrontar decisões de consumo.

## Status

Projeto em desenvolvimento.

Implementado nesta etapa:

- Scaffold inicial do projeto em TypeScript.
- Endpoint serverless para receber updates do Telegram.
- Serviço base para envio de mensagens pelo Telegram.
- Fluxo de onboarding financeiro e comportamental em memória.
- Comandos `/start`, `/status` e `/reset`.
- Resumo final template-based após a calibração.

Ainda não implementado:

- Classificação de mensagens com Gemini.
- Análise multimodal de comprovantes e cupons.
- Persistência no Notion.
- Roast contextual baseado em IA.
- Registro automático de despesas, entradas e caixinhas.

## Requisitos

- Node.js
- npm
- Vercel CLI
- Uma conta/bot do Telegram

## Configuração

Crie um arquivo `.env` a partir do exemplo:

```bash
cp .env.example .env