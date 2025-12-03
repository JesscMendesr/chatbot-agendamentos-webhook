**Repository Overview**
- **Purpose**: This repo implements an AWS Lambda webhook that receives Twilio messages, parses user intents to create salon bookings, and saves completed bookings to DynamoDB.
- **Runtime**: `Node.js 20+` using ES Modules (files end in `.mjs`). The Lambda entry point is `export const handler` in `index.mjs`.

**High-level Data Flow**
- **Incoming**: Twilio POST -> Lambda `event.body` (form-encoded). `parseTwilioData(event)` decodes `Body`, `From`, `ProfileName`.
- **Processing**: `processMessage(message, telefone, nomeCliente, estadoAtual)` implements a small state machine and normalization rules.
 - **Name capture**: when a user chooses to book, the bot first asks for the user's *full name* (state `aguardando_nome`) and stores it in an in-memory `userData` map. The name is then used as `nome_cliente` when the booking is saved.
- **Persistence**: Only fully parsed bookings are saved via `salvarAgendamento(...)` using `@aws-sdk/lib-dynamodb` `PutCommand` into the hard-coded table `agendamentos-esmalteria`.
- **Response**: `generateTwimlResponse(...)` returns a TwiML XML body (`Content-Type: text/xml`) expected by Twilio.

**Key Files & Functions**
- **`index.mjs`**: single-file Lambda implementation. Important exported symbol: `handler`.
- **`parseTwilioData`**: decodes form-encoded Twilio payload from `event.body`.
- **`processMessage`**: central routing/state logic (states: `menu_principal`, `aguardando_agendamento`, etc.).
- **`processarDadosAgendamento` / `processarMenuPrincipal`**: generate messages and structured booking object.
- **`salvarAgendamento`**: builds DynamoDB `Item` (fields: `id`, `telefone`, `nome_cliente`, `data`, `horario`, `servico`, `status`, timestamps).

**Project-specific Conventions & Patterns**
- **ESM only**: keep files as `.mjs`; do not convert to CommonJS. Use `import`/`export` syntax.
- **In-memory session cache**: `userStates` is a `Map()` in module scope and is intentionally used to avoid unnecessary DB reads. Treat it as ephemeral (container reuse only).
- **Single-file lambda**: business logic and helpers are colocated in `index.mjs` (no framework). Small, explicit helpers for date parsing and normalization are preferred.
- **Parsing approach**: message text is normalized with `.normalize('NFD')` and accent removal; regexes detect dates (`\d{1,2}/\d{1,2}` or keywords like "amanha") and times (`\d{1,2}h`). Follow the same regexes when extending parsing.
- **Only save complete bookings**: the code explicitly only calls DynamoDB when an object `agendamentoParaSalvar` is produced.

**Integration & External Dependencies**
- **AWS SDK v3**: imports `DynamoDBClient` and `DynamoDBDocumentClient` from `@aws-sdk/*` and uses `PutCommand` from `@aws-sdk/lib-dynamodb`.
- **Twilio**: expects Twilio webhook format (form-encoded `Body`, `From`, `ProfileName`). Keep response in TwiML XML.
- **Hard-coded values**: table name `agendamentos-esmalteria` and year `2024` in `extrairData` are present in code. Be careful when changing—prefer introducing environment variables if intended.

**Local testing & debugging**
- There are no npm start/test scripts. Quick local test pattern:

```javascript
// test-run.mjs (simple harness)
import { handler } from './index.mjs';

const event = { body: 'Body=oi&From=%2B5511999999999&ProfileName=Maria' };

handler(event).then(res => console.log(res.body)).catch(console.error);
```

- Run with: `node test-run.mjs` (Node 20+). Logs are printed via `console.log` and are useful for debugging parsing flow.

**What to watch for when editing**
- Preserve ESM module boundaries and the exported `handler` signature used by Lambda.
- Maintain the `userStates` Map behavior unless intentionally changing session persistence semantics.
- When modifying persistence, note the `Item` schema in `salvarAgendamento` (the code expects `nome_cliente`, `telefone`, `data`, `horario`, `servico`).
- Avoid removing existing `console.log` lines; they are relied on for observability during debugging.

**Missing / Notable repo-level items**
- No test suite or CI configuration is present. `package.json` contains only a placeholder `test` script.
- Deployment and environment configuration (AWS region, credentials, table creation) are out of repo scope and should be managed by infra tooling (CloudFormation/SAM/CDK) or provided as env vars.

**Examples to reference when editing**
- Message normalization: `message.normalize("NFD").replace(/[…]` in `processMessage`.
- Date extraction regex: `/\d{1,2}\/\d{1,2}/` in `extrairData`.
- DynamoDB save: `await dynamodb.send(new PutCommand(params));` in `salvarAgendamento`.

If any section is unclear or you'd like the document expanded (for example adding a recommended env var pattern or a local SAM testing recipe), tell me which parts and I will iterate.
