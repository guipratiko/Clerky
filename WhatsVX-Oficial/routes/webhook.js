const express = require('express');
const router = express.Router();
const Config = require('../models/Config');

// Middleware para logar o corpo da requisição
router.use((req, res, next) => {
  console.log('📥 Requisição recebida:', {
    method: req.method,
    url: req.url,
    headers: req.headers,
    body: req.body
  });
  next();
});

// Endpoint para receber webhook do n8n
router.post('/n8n', async (req, res) => {
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
    if (!req.body) {
      console.log('❌ Corpo da requisição vazio');
      return res.status(400).json({ 
        success: false, 
        message: 'Corpo da requisição vazio' 
      });
    }

    if (!req.body.output || !req.body.wa_id) {
      console.log('❌ Mensagem inválida recebida:', req.body);
      return res.status(400).json({ 
        success: false, 
        message: 'Mensagem inválida - necessário output e wa_id' 
      });
    }

    // Extrair dados da mensagem
    const message = req.body.output.replace(/^=/, ''); // Remove o = do início se existir
    const wa_id = req.body.wa_id.replace(/^=/, ''); // Remove o = do início se existir

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

    // Enviar mensagem via WhatsApp
    try {
      await whatsappClient.sendMessage(`${wa_id}@c.us`, message);
      console.log('✅ Mensagem enviada com sucesso');
      
      // Emitir evento via Socket.IO
      if (global.io) {
        global.io.emit('whatsapp:mensagem_enviada', {
          numero: wa_id,
          mensagem: message,
          timestamp: Date.now()
        });
      }

      res.json({ success: true, message: 'Mensagem enviada com sucesso' });
    } catch (error) {
      console.error('❌ Erro ao enviar mensagem:', error);
      res.status(500).json({ success: false, message: 'Erro ao enviar mensagem: ' + error.message });
    }
  } catch (error) {
    console.error('❌ Erro ao processar webhook:', error);
    res.status(500).json({ success: false, message: 'Erro ao processar webhook: ' + error.message });
  }
});

module.exports = router; 