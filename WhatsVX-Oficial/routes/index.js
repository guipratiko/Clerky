const express = require('express');
const router = express.Router();

// Controllers
const templateController = require('../controllers/templateController');
const campanhaController = require('../controllers/campanhaController');
const whatsappController = require('../controllers/whatsappController');

// Rota inicial - Dashboard
router.get('/', (req, res) => {
  res.render('index', { 
    title: 'Dashboard', 
    messages: req.flash() 
  });
});

// Rotas de Templates
router.get('/templates', templateController.renderTemplates);
router.get('/api/templates', templateController.getTemplates);
router.get('/api/templates/:id', templateController.getTemplateById);
router.post('/api/templates', templateController.uploadMiddleware, templateController.createTemplate);
router.put('/api/templates/:id', templateController.uploadMiddleware, templateController.updateTemplate);
router.delete('/api/templates/:id', templateController.deleteTemplate);
router.post('/api/templates/upload', templateController.uploadMiddleware, templateController.uploadFile);
router.post('/api/templates/:id/upload', templateController.uploadMiddleware, templateController.uploadFile);

// Rotas de Campanhas
router.get('/campanhas', campanhaController.renderCampanhas);
router.get('/campanhas/:id', campanhaController.renderDetalhes);
router.get('/api/campanhas', campanhaController.getCampanhas);
router.get('/api/campanhas/:id', campanhaController.getCampanhaById);
router.post('/api/campanhas', campanhaController.createCampanha);
router.put('/api/campanhas/:id', campanhaController.updateCampanha);
router.delete('/api/campanhas/:id', campanhaController.deleteCampanha);
router.post('/api/campanhas/:id/contatos', campanhaController.uploadContatos);

// Rotas de WhatsApp
router.get('/whatsapp', whatsappController.renderWhatsApp);
router.get('/api/whatsapp/status', whatsappController.getStatus);
router.get('/api/whatsapp/qrcode', whatsappController.getQRCode);
router.post('/api/whatsapp/desconectar', whatsappController.desconectar);
router.post('/api/campanhas/:id/processar', whatsappController.processarCampanha);
router.post('/api/campanhas/:id/iniciar', whatsappController.processarCampanha);
router.post('/api/campanhas/:id/pausar', whatsappController.pausarCampanha);
router.post('/api/campanhas/:id/cancelar', whatsappController.cancelarCampanha);

module.exports = router; 