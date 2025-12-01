// Para Node.js 20.x com ES Modules
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";

// Configura o cliente DynamoDB
const client = new DynamoDBClient({});
const dynamodb = DynamoDBDocumentClient.from(client);

// ⚡ ESTADO EM MEMÓRIA (cache simples) - EVITA DYNAMODB DESNECESSÁRIO
const userStates = new Map();

export const handler = async (event) => {
    console.log('Event received:', JSON.stringify(event));
    
    try {
        // Parse dos dados do Twilio
        const twilioData = parseTwilioData(event);
        const incomingMsg = twilioData.Body ? twilioData.Body.toLowerCase().trim() : '';
        const fromNumber = twilioData.From || '';
        const nomeCliente = twilioData.ProfileName || 'Cliente';
        
        console.log(`Mensagem de ${fromNumber}: ${incomingMsg}`);
        
        // Busca estado da memória (NÃO do DynamoDB)
        const estadoUsuario = userStates.get(fromNumber) || 'menu_principal';
        
        // Processa a mensagem considerando o estado
        const resultado = await processMessage(incomingMsg, fromNumber, nomeCliente, estadoUsuario);
        
        // Atualiza estado na memória
        if (resultado.novoEstado) {
            userStates.set(fromNumber, resultado.novoEstado);
            console.log(`✅ Estado atualizado para: ${resultado.novoEstado}`);
        }
        
        // Salva APENAS agendamentos completos no DynamoDB
        if (resultado.agendamentoParaSalvar) {
            await salvarAgendamento(resultado.agendamentoParaSalvar);
        }
        
        // Retorna resposta para Twilio
        return generateTwimlResponse(resultado.response);
        
    } catch (error) {
        console.error('Erro na Lambda:', error);
        return generateTwimlResponse('Erro no processamento. Tente novamente.');
    }
};

// ⚡ SALVA APENAS AGENDAMENTOS COMPLETOS no DynamoDB
async function salvarAgendamento(dadosAgendamento) {
    const params = {
        TableName: 'agendamentos-esmalteria',
        Item: {
            id: Date.now(),
            telefone: dadosAgendamento.telefone,
            nome_cliente: dadosAgendamento.nome_cliente,
            data: dadosAgendamento.data,
            horario: dadosAgendamento.horario,
            servico: dadosAgendamento.servico,
            status: 'pendente_confirmacao',
            timestamp: new Date().toISOString(),
            timestamp_brasil: new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        }
    };
    
    try {
        await dynamodb.send(new PutCommand(params));
        console.log('✅ AGENDAMENTO salvo no DynamoDB:', params.Item.id);
        return true;
    } catch (error) {
        console.error('❌ Erro ao salvar agendamento:', error);
        return false;
    }
}

// Processa a mensagem e retorna resultado
async function processMessage(message, telefone, nomeCliente, estadoAtual) {
    let response = '';
    let novoEstado = estadoAtual;
    let agendamentoParaSalvar = null;

    const mensagemNormalizada = message.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

    // ⚡ LÓGICA SIMPLIFICADA - MENOS ESTADOS
    if (estadoAtual === 'aguardando_agendamento' && contemDadosAgendamento(mensagemNormalizada)) {
        // Usuário enviou dados de agendamento
        const resultado = processarDadosAgendamento(message, telefone, nomeCliente);
        response = resultado.response;
        agendamentoParaSalvar = resultado.dados;
        novoEstado = 'menu_principal'; // Volta ao menu
        
    } else if (mensagemNormalizada.includes('1') || mensagemNormalizada.includes('agendar')) {
        // Usuário quer agendar
        response = `*AGENDAMENTO* 📅

Por favor, me envie os dados do agendamento no formato:

*Data* + *Horario* + *Servico*

*Exemplos:*
"25/03 14h - Manicure completa"
"amanha 15h - Pedicure"`;
        novoEstado = 'aguardando_agendamento';
        
    } else {
        // Menu principal ou comandos simples
        response = await processarMenuPrincipal(mensagemNormalizada, nomeCliente);
        novoEstado = 'menu_principal';
    }
    
    return {
        response: response,
        novoEstado: novoEstado,
        agendamentoParaSalvar: agendamentoParaSalvar
    };
}

// Verifica se a mensagem contém dados de agendamento
function contemDadosAgendamento(mensagem) {
    return /(\d{1,2}\/\d{1,2})|(amanha|hoje|segunda|terca|quarta|quinta|sexta|sabado)/.test(mensagem) && 
           /(manicure|pedicure|alongamento|spa|\d{1,2}h)/.test(mensagem);
}

// Processa menu principal
async function processarMenuPrincipal(mensagem, nomeCliente) {
    if (mensagem.includes('oi') || mensagem.includes('ola') || mensagem.includes('menu')) {
        return `Ola ${nomeCliente}! Sou o assistente da Esmalteria! 💅

*Como posso ajudar?*

1️⃣ - AGENDAR horario
2️⃣ - VER servicos  
3️⃣ - CONSULTAR precos
4️⃣ - LOCALIZACAO

Digite o numero da opcao desejada!`;
    }
    else if (mensagem.includes('2') || mensagemNormalizada.includes('servico')) {
        return `*NOSSOS SERVICOS* 💅

• *Manicure simples* - R$ 25
• *Manicure com esmaltacao* - R$ 35  
• *Pedicure* - R$ 30
• *Alongamento de gel* - R$ 80
• *Spa dos pes* - R$ 40

Digite "1" para AGENDAR!`;
    }
    else if (mensagem.includes('3') || mensagem.includes('preco')) {
        return `*TABELA DE PRECOS* 💰

*MANICURE:*
• Simples - R$ 25
• Com esmaltacao - R$ 35

*PEDICURE:*
• Basico - R$ 30
• Com spa dos pes - R$ 40

*ALONGAMENTOS:*
• Gel - R$ 80
• Manutencao - R$ 50

Digite "1" para AGENDAR!`;
    }
    else if (mensagem.includes('4') || mensagem.includes('local')) {
        return `*LOCALIZACAO* 📍

*Esmalteria Beauty*
Rua das Flores, 123 - Centro
Diadema - SP

*Horario:* Seg a Sab - 9h as 19h

Digite "1" para AGENDAR!`;
    }
    else {
        return `Desculpe, nao entendi! 😊

Digite:
*1* ou *AGENDAR* 📅 - Reservar horario  
*2* ou *SERVICOS* 💅 - Ver servicos
*3* ou *PRECOS* 💰 - Consultar valores
*4* ou *LOCAL* 📍 - Nossa localizacao

Ou *OI* para o menu principal!`;
    }
}

// Processa dados completos do agendamento
function processarDadosAgendamento(message, telefone, nomeCliente) {
    // Extrai dados da mensagem
    const dataExtraida = extrairData(message);
    const horarioExtraido = extrairHorario(message);
    const servicoExtraido = extrairServico(message);
    
    const dadosAgendamento = {
        telefone: telefone,
        nome_cliente: nomeCliente,
        data: dataExtraida,
        horario: horarioExtraido,
        servico: servicoExtraido,
        mensagem_original: message,
        status: 'pendente_confirmacao'
    };
    
    const response = `✅ *AGENDAMENTO CONFIRMADO!*

📆 Data: ${dataExtraida}
🕒 Horario: ${horarioExtraido}
💅 Servico: ${servicoExtraido}

📋 Status: Aguardando confirmacao final

💬 Entraremos em contato em breve para confirmacao!

Obrigada por agendar conosco! ✨`;
    
    return {
        response: response,
        dados: dadosAgendamento
    };
}


// Funções auxiliares para extrair dados (mantidas)
function extrairData(mensagem) {
    const dataMatch = mensagem.match(/(\d{1,2})\/(\d{1,2})/);
    if (dataMatch) {
        return `${dataMatch[1]}/${dataMatch[2]}/2024`;
    }
    
    const dias = {
        'amanha': obterDataAmanha(),
        'hoje': obterDataHoje(),
        'segunda': obterProximaSegunda(),
        'terca': obterProximaTerca(),
        'quarta': obterProximaQuarta(),
        'quinta': obterProximaQuinta(),
        'sexta': obterProximaSexta(),
        'sabado': obterProximaSabado()
    };
    
    for (const [dia, data] of Object.entries(dias)) {
        if (mensagem.toLowerCase().includes(dia)) {
            return data;
        }
    }
    
    return 'Data a confirmar';
}

function extrairHorario(mensagem) {
    const horarioMatch = mensagem.match(/(\d{1,2})[h:]/);
    return horarioMatch ? `${horarioMatch[1]}:00` : 'Horario a confirmar';
}

function extrairServico(mensagem) {
    const servicos = {
        'manicure': 'Manicure',
        'pedicure': 'Pedicure',
        'alongamento': 'Alongamento',
        'spa': 'Spa dos pes'
    };
    
    for (const [key, servico] of Object.entries(servicos)) {
        if (mensagem.toLowerCase().includes(key)) {
            return servico;
        }
    }
    
    const afterDash = mensagem.match(/-\s*(.+)$/);
    return afterDash ? afterDash[1].trim() : 'Servico a confirmar';
}

// Funções de data
function obterDataHoje() {
    return new Date().toLocaleDateString('pt-BR');
}

function obterDataAmanha() {
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    return amanha.toLocaleDateString('pt-BR');
}

// ... (outras funções de data que você já tinha)

function parseTwilioData(event) {
    console.log('Raw event body:', event.body);
    
    if (event.body) {
        const parsed = {};
        const pairs = event.body.split('&');
        
        pairs.forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value) {
                parsed[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
            }
        });
        
        console.log('Parsed Twilio data:', parsed);
        return parsed;
    }
    
    return {};
}

function generateTwimlResponse(message) {
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${message}</Message>
</Response>`;
    
    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/xml',
        },
        body: twiml
    };
}