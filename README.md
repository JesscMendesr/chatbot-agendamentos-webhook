# chatbot-agendamentos-webhook

Descrição
---------
Este repositório contém uma AWS Lambda que funciona como webhook para mensagens do Twilio. O objetivo é permitir que clientes agendem serviços de uma esmalteria via WhatsApp — o bot recebe mensagens, executa um fluxo simples de captura de dados (incluindo captura do nome completo do cliente), valida/normaliza a mensagem e, quando o agendamento estiver completo, grava um item no DynamoDB.

Principais características
-------------------------
- Runtime: Node.js 20+ usando ES Modules (`.mjs`).
- Arquivo único da Lambda: `index.mjs` (lógica de parsing, estado em memória e persistência).
- Persistência: DynamoDB via AWS SDK v3 (`@aws-sdk/lib-dynamodb`).
- Entrada: webhook Twilio (form-encoded). Saída: TwiML XML (`Content-Type: text/xml`).

Fluxo de dados (alto nível)
---------------------------
1. Twilio envia POST com `Body`, `From`, `ProfileName` em `event.body`.
2. `parseTwilioData(event)` transforma o corpo form-encoded em um objeto legível.
3. `processMessage(message, telefone, nomeCliente, estadoAtual)` aplica a máquina de estados simplificada:
	 - `menu_principal` (padrão)
	 - `aguardando_nome` (captura do nome completo do cliente)
	 - `aguardando_agendamento` (captura data, horário e serviço)
4. Se as informações do agendamento estiverem completas, `salvarAgendamento(...)` persiste no DynamoDB.

Estado em memória
-----------------
- `userStates` (Map) — armazena o estado atual do usuário (por telefone). Uso intencional para evitar leituras desnecessárias no DynamoDB.
- `userData` (Map) — armazena dados temporários por usuário (ex.: `nomeCompleto`) antes do salvamento final.

Padrões importantes
-------------------
- Manter o arquivo `index.mjs` em ESM — não converter para CommonJS.
- Normalização de texto: `message.normalize('NFD').replace(/[...]` para remover acentos.
- Regexs padrão:
	- Data: `/\d{1,2}\/\d{1,2}/` ou palavras-chave (`amanha`, `hoje`, dias da semana).
	- Hora: `/\d{1,2}[h:]/`.
- Somente gravar no DynamoDB quando houver um objeto `agendamentoParaSalvar` completo.

Chaves / Funções a conhecer
---------------------------
- `handler(event)` — entrada da Lambda.
- `parseTwilioData(event)` — pega `event.body` form-encoded e devolve `{ Body, From, ProfileName, ... }`.
- `processMessage(message, telefone, nomeCliente, estadoAtual)` — orquestra o fluxo e retorna `{ response, novoEstado, agendamentoParaSalvar }`.
- `processarMenuPrincipal(...)` — monta respostas de menu e textos informativos.
- `processarDadosAgendamento(...)` — extrai `data`, `horario`, `servico` e monta o objeto a salvar.
- `salvarAgendamento(dadosAgendamento)` — faz `PutCommand` no DynamoDB (tabela `agendamentos-esmalteria`).

Execução local (rápido)
----------------------
Para testar localmente sem deploy, crie um arquivo `test-run.mjs` ao lado de `index.mjs` com o conteúdo abaixo e execute `node test-run.mjs` usando Node 20+:

```javascript
import { handler } from './index.mjs';

const event = {
	body: 'Body=oi&From=%2B5511999999999&ProfileName=Maria'
};

handler(event)
	.then(res => console.log(res.body))
	.catch(err => console.error(err));
```

Observações de configuração / produção
-------------------------------------
- A tabela DynamoDB usada está hard-coded como `agendamentos-esmalteria`. Em produção, recomenda-se expor isso via variável de ambiente.
- A função assume credenciais/region configuradas no ambiente (IAM/Role para a Lambda no deploy — localmente use `aws configure` ou variáveis de ambiente).
- Logs importantes são emitidos com `console.log` para facilitar debug em CloudWatch.

Boas práticas ao editar
-----------------------
- Preserve ESM e a assinatura exportada `handler`.
- Evite remover `console.log` existentes sem necessidade (são úteis para debugging no CloudWatch).
- Se ajustar parsing de data/hora, mantenha os mesmos padrões regex usados no projeto para consistência.

Roadmap / melhorias recomendadas
-------------------------------
- Tornar a tabela DynamoDB e o ano padrão configuráveis por variáveis de ambiente.
- Adicionar testes unitários para as funções de parsing (extrairData, extrairHorario, extrairServico).
- Adicionar validação mais robusta para entradas de usuários e confirmação via Twilio.

Contato
-------
Para dúvidas sobre o código, entre em contato com o mantenedor no repositório.

---
Gerado em: README atualizado para facilitar contribuições e operação.
