const express = require('express');
const router = express.Router();
const webhookRouter = express.Router();
const { fetch } = require('undici');
const Config = require('../models/Config');
const whatsappController = require('../controllers/whatsappController');

// Configuração do n8n
const N8N_WEBHOOK_URL_TEST = 'https://guipratiko.app.n8n.cloud/webhook-test/28e86e9d-faba-4eff-94b8-d9d710acfe79';
const N8N_WEBHOOK_URL_PROD = 'https://guipratiko.app.n8n.cloud/webhook/28e86e9d-faba-4eff-94b8-d9d710acfe79';

// Função para obter a URL atual do webhook
async function getWebhookUrl() {
  const config = await Config.findOne({ chave: 'webhook_url' });
  return config ? config.valor : N8N_WEBHOOK_URL_TEST;
}

// Endpoint para obter a URL atual do webhook
router.get('/webhook/url', async (req, res) => {
  try {
    const url = await getWebhookUrl();
    res.json({ url, isTest: url === N8N_WEBHOOK_URL_TEST });
  } catch (error) {
    console.error('Erro ao obter URL do webhook:', error);
    res.status(500).json({ error: 'Erro ao obter URL do webhook' });
  }
});

// Endpoint para alternar a URL do webhook
router.post('/webhook/toggle', async (req, res) => {
  try {
    const currentUrl = await getWebhookUrl();
    const newUrl = currentUrl === N8N_WEBHOOK_URL_TEST ? N8N_WEBHOOK_URL_PROD : N8N_WEBHOOK_URL_TEST;
    
    await Config.findOneAndUpdate(
      { chave: 'webhook_url' },
      { 
        chave: 'webhook_url',
        valor: newUrl,
        atualizadoEm: new Date()
      },
      { upsert: true }
    );

    res.json({
      success: true,
      url: newUrl,
      isTest: newUrl === N8N_WEBHOOK_URL_TEST,
      message: `Webhook alternado para ${newUrl === N8N_WEBHOOK_URL_TEST ? 'teste' : 'produção'}`
    });
  } catch (error) {
    console.error('Erro ao alternar URL do webhook:', error);
    res.status(500).json({ error: 'Erro ao alternar URL do webhook' });
  }
});

// Endpoint para verificar status da IA
router.get('/ia/status', async (req, res) => {
  try {
    const config = await Config.findOne({ chave: 'ia_ativa' });
    res.json({
      ativo: config ? config.valor : false,
      mensagem: config && config.valor ? 'IA está ativa e respondendo mensagens' : 'IA está desativada'
    });
  } catch (error) {
    console.error('Erro ao verificar status da IA:', error);
    res.status(500).json({ error: 'Erro ao verificar status da IA' });
  }
});

// Endpoint para ativar/desativar integração com IA
router.post('/ia/toggle', async (req, res) => {
  try {
    const { ativo } = req.body;
    
    // Salvar no banco de dados
    await Config.findOneAndUpdate(
      { chave: 'ia_ativa' },
      { 
        chave: 'ia_ativa',
        valor: ativo,
        atualizadoEm: new Date()
      },
      { upsert: true }
    );

    // Emitir evento via Socket.IO
    global.io.emit('whatsapp:ia_status', {
      ativo,
      mensagem: ativo ? 'IA ativada com sucesso' : 'IA desativada com sucesso',
      timestamp: Date.now()
    });
    
    res.json({
      ativo,
      mensagem: ativo ? 'Integração com IA ativada' : 'Integração com IA desativada'
    });
  } catch (error) {
    console.error('Erro ao alterar status da IA:', error);
    res.status(500).json({ error: 'Erro ao alterar status da IA' });
  }
});

// Endpoint para enviar mensagens para IA
router.post('/ia', async (req, res) => {
  try {
    // Verificar se IA está ativa
    const config = await Config.findOne({ chave: 'ia_ativa' });
    if (!config || !config.valor) {
      return res.status(400).json({ 
        error: 'IA desativada',
        message: 'A integração com IA está desativada' 
      });
    }

    const { mensagem, numero } = req.body;
    const webhookUrl = await getWebhookUrl();

    // Enviar mensagem para o n8n
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: [{
          text: {
            body: mensagem
          }
        }],
        contacts: [{
          wa_id: numero,
          profile: {
            name: 'Cliente'
          }
        }]
      })
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Erro ao processar mensagem com IA:', error);
    res.status(500).json({ error: 'Erro ao processar mensagem com IA' });
  }
});

// Endpoint para receber webhook do n8n - sem autenticação
webhookRouter.post('/', async (req, res) => {
  console.log('🔄 Webhook recebido do n8n:', JSON.stringify(req.body, null, 2));
  
  try {
    // Verificar se IA está ativa
    const config = await Config.findOne({ chave: 'ia_ativa' });
    if (!config || !config.valor) {
      console.log('❌ IA está desativada');
      return res.status(400).json({ 
        success: false, 
        message: 'IA está desativada' 
      });
    }

    // Verificar se é uma mensagem válida
    if (!req.body || !req.body.output || !req.body.wa_id) {
      console.log('❌ Mensagem inválida recebida:', req.body);
      return res.status(400).json({ success: false, message: 'Mensagem inválida - necessário output e wa_id' });
    }

    // Extrair dados da mensagem
    const message = req.body.output.replace(/^=/, ''); // Remove o = do início se existir
    let wa_id = req.body.wa_id.replace(/^=/, ''); // Remove o = do início se existir

    console.log('✉️ Mensagem a ser enviada:', message);
    console.log('👤 Para:', wa_id);

    // Verificar se o cliente está disponível
    const whatsappClient = require('../controllers/whatsappController').getClient();
    
    if (!whatsappClient) {
      console.log('❌ Cliente WhatsApp não está disponível');
      return res.status(500).json({ 
        success: false, 
        message: 'Cliente WhatsApp não está disponível'
      });
    }

    // Formatar o ID do chat para o formato esperado pelo WhatsApp Web.js
    if (!wa_id.includes('@')) {
      wa_id = `${wa_id}@c.us`;
    }
    console.log('👤 ID formatado:', wa_id);

    // Enviar mensagem
    try {
      await whatsappClient.sendMessage(wa_id, message);
      
      console.log('✅ Mensagem enviada com sucesso');
      res.json({ 
        success: true, 
        message: 'Mensagem enviada com sucesso' 
      });
    } catch (sendError) {
      console.error('❌ Erro ao enviar mensagem:', sendError);
      res.status(500).json({ 
        success: false, 
        message: 'Erro ao enviar mensagem: ' + sendError.message 
      });
    }
  } catch (error) {
    console.error('❌ Erro ao processar webhook:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Erro ao processar webhook: ' + error.message 
    });
  }
});

// Endpoint para testar webhook do n8n
router.get('/ia/test-webhook', async (req, res) => {
  try {
    const testData = {
      body: {
        messages: [{
          text: {
            body: "Olá, esta é uma mensagem de teste!"
          }
        }],
        contacts: [{
          wa_id: "5511999999999",
          profile: {
            name: "Teste"
          }
        }]
      }
    };

    // Enviar mensagem de teste para o n8n
    const response = await fetch(N8N_WEBHOOK_URL_TEST, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(testData)
    });

    const data = await response.json();
    console.log('Resposta do webhook:', data);
    
    res.json({
      success: true,
      message: 'Teste enviado com sucesso',
      response: data
    });
  } catch (error) {
    console.error('Erro ao testar webhook:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao testar webhook',
      message: error.message 
    });
  }
});

// Rota para obter as URLs do webhook
router.get('/webhook-urls', async (req, res) => {
  try {
    const urls = await whatsappController.getWebhookUrls();
    res.json(urls);
  } catch (error) {
    console.error('Erro ao obter URLs do webhook:', error);
    res.status(500).json({ error: 'Erro ao obter URLs do webhook' });
  }
});

// Rota para salvar as URLs do webhook
router.post('/webhook-urls', async (req, res) => {
  try {
    const { testUrl, prodUrl } = req.body;
    const success = await whatsappController.saveWebhookUrls(testUrl, prodUrl);
    if (success) {
      res.json({ message: 'URLs do webhook atualizadas com sucesso' });
    } else {
      res.status(500).json({ error: 'Erro ao salvar URLs do webhook' });
    }
  } catch (error) {
    console.error('Erro ao salvar URLs do webhook:', error);
    res.status(500).json({ error: 'Erro ao salvar URLs do webhook' });
  }
});

module.exports = { 
  router: router, 
  webhookRouter: webhookRouter 
}; 