# RODS Agent

**RODS** significa **Radar de Orçamento, Despesas e Supérfluos**.

Este projeto é uma implementação inicial de um agente financeiro conversacional, criado para ajudar usuários a registrar movimentações financeiras, refletir sobre gastos e manter mais consciência sobre decisões de consumo.

A proposta do RODS é funcionar como um agente de responsabilização financeira, analisando mensagens enviadas pelo usuário, classificando movimentações e gerando respostas contextualizadas com humor, provocação e sarcasmo controlado.

> Este repositório representa a versão prática inicial do projeto, desenvolvida a partir do design do sistema agentic documentado previamente.

---

## Objetivo do projeto

O objetivo do RODS é apoiar pessoas que possuem metas financeiras, mas têm dificuldade em manter constância no controle de gastos, principalmente diante de compras impulsivas, despesas supérfluas e decisões emocionais de consumo.

Nesta versão, o sistema funciona como um bot integrado ao Telegram, capaz de:

- iniciar um fluxo de onboarding;
- interpretar mensagens financeiras em texto;
- classificar movimentações com apoio de LLM;
- registrar movimentações no Notion;
- responder ao usuário com um tom crítico, educativo e sarcástico controlado.

---

## Status da versão

Esta é uma versão inicial funcional do agente.

### Implementado nesta V1

- Integração com Telegram.
- Endpoint serverless para receber mensagens do Telegram.
- Agente principal responsável por coordenar o fluxo da conversa.
- Onboarding conversacional.
- Classificação de mensagens financeiras com Gemini.
- Validação estrutural dos dados classificados.
- Registro de movimentações financeiras no Notion.
- Ferramentas separadas para registro de:
  - despesas;
  - receitas;
  - contribuições para caixinhas.
- Geração de respostas contextualizadas com tom crítico e humor controlado.
- Comandos auxiliares para desenvolvimento e testes.

### Fora do escopo da V1

Algumas ideias fazem parte da proposta conceitual do sistema, mas não foram tratadas como entrega principal nesta versão do repositório:

- leitura automática de cupons fiscais por imagem;
- RAG avançado;
- integração via MCP;
- dashboard financeiro completo;
- persistência definitiva de todo o perfil financeiro;
- aplicativo mobile próprio;
- integração com WhatsApp.

---

## Tecnologias utilizadas

- **TypeScript**
- **Node.js**
- **Vercel Serverless Functions**
- **Telegram Bot API**
- **Gemini API**
- **Notion API**
- **Zod**

---

## Estrutura do projeto

```txt
RODS-AGENT
├── api
│   └── telegram.ts
│
├── src
│   ├── agent
│   │   ├── contextualRoastGenerator.ts
│   │   ├── financialTextClassifier.ts
│   │   ├── onboardingAgent.ts
│   │   ├── prompts.ts
│   │   ├── rodsAgent.ts
│   │   └── schemas.ts
│   │
│   ├── services
│   │   ├── gemini.service.ts
│   │   ├── notion.service.ts
│   │   └── telegram.service.ts
│   │
│   ├── tools
│   │   ├── registerBoxContribution.tool.ts
│   │   ├── registerExpense.tool.ts
│   │   └── registerIncome.tool.ts
│   │
│   └── types
│
├── .env.example
├── .gitignore
├── package.json
├── package-lock.json
├── README.md
└── tsconfig.json
```

---

## Visão geral da arquitetura

```txt
Usuário
  ↓
Telegram
  ↓
api/telegram.ts
  ↓
RodsAgent
  ├── OnboardingAgent
  ├── FinancialTextClassifier
  │      ↓
  │   GeminiService
  ├── ContextualRoastGenerator
  └── Tools
         ↓
      NotionService
         ↓
       Notion
```

---

## Componentes principais

### `api/telegram.ts`

Endpoint responsável por receber as atualizações enviadas pelo Telegram e encaminhar as mensagens para o agente principal.

---

### `src/agent/rodsAgent.ts`

Coordena o fluxo principal do agente.

É responsável por lidar com comandos, controlar o estado da conversa, acionar onboarding, chamar o classificador financeiro e direcionar o registro da movimentação.

---

### `src/agent/onboardingAgent.ts`

Gerencia o fluxo inicial de onboarding do usuário.

Nesta etapa, o agente coleta informações básicas para montar um contexto inicial de uso.

---

### `src/agent/financialTextClassifier.ts`

Responsável por interpretar mensagens financeiras enviadas pelo usuário.

Ele utiliza o Gemini para transformar uma mensagem em uma estrutura de dados classificada, indicando o tipo de movimentação, valor, descrição, categoria, nível de necessidade e outros campos relevantes.

---

### `src/agent/contextualRoastGenerator.ts`

Responsável por gerar respostas com tom crítico, provocativo e sarcástico controlado.

O objetivo não é humilhar o usuário, mas reforçar a consciência sobre o comportamento financeiro.

---

### `src/agent/prompts.ts`

Centraliza os prompts utilizados pelo agente e pelo classificador.

---

### `src/agent/schemas.ts`

Define os schemas de validação usados para garantir que as respostas estruturadas estejam no formato esperado.

---

### `src/services/gemini.service.ts`

Serviço responsável pela comunicação com a API do Gemini.

---

### `src/services/notion.service.ts`

Serviço responsável pela comunicação com o Notion.

Nesta versão, o Notion é utilizado para registrar as movimentações financeiras processadas pelo agente.

---

### `src/services/telegram.service.ts`

Serviço responsável pelo envio de mensagens de resposta ao usuário via Telegram.

---

### `src/tools/registerExpense.tool.ts`

Ferramenta responsável por registrar despesas.

---

### `src/tools/registerIncome.tool.ts`

Ferramenta responsável por registrar receitas.

---

### `src/tools/registerBoxContribution.tool.ts`

Ferramenta responsável por registrar contribuições para caixinhas ou objetivos financeiros.

---

## Fluxo principal da aplicação

```txt
1. O usuário envia uma mensagem para o bot no Telegram.

2. O endpoint api/telegram.ts recebe a atualização.

3. A mensagem é encaminhada para o RodsAgent.

4. O agente verifica se a mensagem é um comando ou uma entrada financeira.

5. Se necessário, o agente conduz o onboarding.

6. Quando o usuário envia uma movimentação financeira em texto, o agente chama o classificador.

7. O FinancialTextClassifier envia a mensagem para o Gemini.

8. A resposta do modelo é validada com schemas.

9. Com base na intenção identificada, o agente chama a ferramenta adequada:
   - registrar despesa;
   - registrar receita;
   - registrar contribuição para caixinha.

10. A movimentação é registrada no Notion.

11. O agente retorna uma resposta contextualizada ao usuário.
```

---

## Tipos de movimentação suportados

Nesta versão, o sistema trabalha com três intenções principais:

```ts
REGISTER_EXPENSE
REGISTER_INCOME
REGISTER_BOX_CONTRIBUTION
```

### Exemplos de mensagens

```txt
gastei 35 reais com lanche
```

```txt
recebi 500 reais de pagamento
```

```txt
guardei 100 reais para a viagem
```

---

## Níveis de necessidade

As despesas podem ser classificadas conforme o nível de necessidade:

```ts
ESSENTIAL
NECESSARY
OPTIONAL
IMPULSIVE
```

Esses níveis ajudam o agente a ajustar o tom da resposta e identificar quando um gasto pode estar desalinhado com os objetivos do usuário.

---

## Comandos disponíveis

| Comando | Descrição |
|---|---|
| `/start` | Inicia o fluxo do bot. |
| `/reset` | Reinicia o estado local da conversa. |
| `/status` | Mostra o status atual do usuário no fluxo. |
| `/devseed` | Carrega um perfil de teste para facilitar validações durante o desenvolvimento. |

### Observação sobre `/devseed`

O comando `/devseed` é um recurso auxiliar de desenvolvimento.

Ele existe para facilitar testes do fluxo de movimentações sem precisar refazer todo o onboarding manualmente.

Nesta versão:

- usa memória local;
- não persiste o onboarding completo no Notion;
- não substitui uma persistência real de perfil;
- pode ser removido ou alterado em versões futuras.

---

## Variáveis de ambiente

Crie um arquivo `.env` com base no arquivo `.env.example`.

Exemplo:

```env
TELEGRAM_BOT_TOKEN=
GEMINI_API_KEY=
GEMINI_MODEL=
NOTION_TOKEN=
NOTION_MOVEMENTS_DATABASE_ID=
```

> Nunca versionar tokens reais, chaves de API ou dados sensíveis.

---

## Instalação

Clone o repositório:

```bash
git clone <url-do-repositorio>
```

Acesse a pasta do projeto:

```bash
cd rods-agent
```

Instale as dependências:

```bash
npm install
```

---

## Execução local

Para rodar o projeto localmente com ambiente serverless da Vercel:

```bash
npx vercel dev
```

O endpoint principal do bot está em:

```txt
/api/telegram
```

---

## Validação do projeto

Execute:

```bash
npm run check
```

Esse comando deve ser utilizado antes de subir alterações para a branch principal.

---

## Teste manual sugerido

Depois de iniciar o projeto localmente, valide o fluxo principal:

```txt
1. Enviar /start no Telegram.
2. Passar pelo onboarding ou usar /devseed.
3. Enviar uma movimentação financeira em texto.
4. Verificar se o agente respondeu corretamente.
5. Conferir se a movimentação foi registrada no Notion.
6. Testar /status.
7. Testar /reset.
```

Exemplo de entrada:

```txt
gastei 32 reais com lanche
```

Resultado esperado:

```txt
O agente deve identificar a mensagem como despesa, classificar os dados principais, registrar a movimentação no Notion e responder ao usuário com feedback contextualizado.
```

---

## Guardrails de linguagem

O RODS utiliza humor, provocação e sarcasmo como parte da experiência, mas existem limites importantes:

- o alvo da crítica deve ser o comportamento financeiro, não a pessoa;
- o agente não deve usar linguagem discriminatória;
- o agente não deve humilhar o usuário;
- o feedback deve manter caráter educativo;
- quando houver pouca informação, o sistema deve evitar conclusões definitivas.

---

## Limitações atuais

Esta versão ainda possui limitações importantes:

- o onboarding funciona como etapa inicial, mas a persistência completa do perfil ainda pode evoluir;
- a entrada principal considerada nesta versão é textual;
- a leitura de imagem de cupom fiscal ainda não faz parte da entrega prática principal;
- o sistema depende da disponibilidade das APIs externas utilizadas;
- o Notion é usado como base operacional, não como dashboard financeiro final;
- o comando `/devseed` é apenas auxiliar de desenvolvimento.

---

## Próximos passos

Possíveis melhorias futuras:

- persistir o perfil financeiro completo do usuário;
- adicionar leitura de cupons fiscais por imagem;
- melhorar consulta de histórico financeiro;
- criar dashboards no Notion ou em uma interface própria;
- implementar RAG para recuperação contextual mais avançada;
- adicionar suporte a múltiplos usuários com persistência robusta;
- melhorar tratamento de erros e logs;
- preparar deploy definitivo em produção;
- evoluir o agente para outros canais de conversa.

---

## Segurança

Este projeto utiliza variáveis de ambiente para armazenar chaves e tokens.

Arquivos como `.env`, `.vercel` e `node_modules` não devem ser versionados.

Antes de subir o projeto para o GitHub, confirme se não existem tokens reais expostos no código ou no histórico de commits.

---

## Autora

Desenvolvido por **Ariane Carvalho**.

Projeto criado como parte dos estudos em sistemas agentic, LLMs e automação com agentes conversacionais.