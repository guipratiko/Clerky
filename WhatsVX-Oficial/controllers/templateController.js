const Template = require('../models/Template');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Configuração do Multer para upload de arquivos
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const fileFilter = (req, file, cb) => {
  // Aceitar imagens, áudios e documentos comuns
  const tiposPermitidos = [
    'image/jpeg', 'image/png', 'image/gif',
    'audio/mp3', 'audio/mpeg', 'audio/ogg', 'audio/wav',
    'application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (tiposPermitidos.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Renderizar página de templates
exports.renderTemplates = async (req, res) => {
  try {
    const templates = await Template.find().sort({ dataCriacao: -1 });
    res.render('templates', { 
      templates, 
      title: 'Gerenciar Templates',
      messages: req.flash()
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Erro ao carregar templates');
    res.redirect('/');
  }
};

// Obter todos os templates (API)
exports.getTemplates = async (req, res) => {
  try {
    const templates = await Template.find().sort({ dataCriacao: -1 });
    res.json(templates);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
};

// Obter um template pelo ID (API)
exports.getTemplateById = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ msg: 'Template não encontrado' });
    }
    
    res.json(template);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Template não encontrado' });
    }
    res.status(500).send('Erro no servidor');
  }
};

// Criar um novo template (API)
exports.createTemplate = async (req, res) => {
  try {
    let { nome, tipo, texto } = req.body;
    let tipoAudio = req.body.tipoAudio || 'normal';
    
    if (!nome || !tipo) {
      req.flash('error', 'Nome e tipo são obrigatórios');
      return res.redirect('/templates');
    }
    
    // Validar tipo
    const tiposValidos = ['texto', 'imagem', 'audio', 'arquivo', 'misto'];
    if (!tiposValidos.includes(tipo)) {
      req.flash('error', 'Tipo de template inválido');
      return res.redirect('/templates');
    }
    
    // Estrutura básica do template
    const templateData = {
      nome,
      tipo,
      conteudo: {
        texto: texto || '',
        tipoAudio: tipo === 'audio' ? tipoAudio : 'normal'
      }
    };
    
    // Processar arquivo se existir
    if (req.file) {
      // Upload ocorre através do middleware Multer
      const arquivo = req.file;
      
      // Definir tipo de arquivo com base no tipo do template
      let tipoArquivo;
      if (tipo === 'imagem') tipoArquivo = 'imagem';
      else if (tipo === 'audio') tipoArquivo = 'audio';
      else tipoArquivo = 'arquivo';
      
      // Adicionar informações do arquivo
      templateData.conteudo.arquivos = [{
        tipo: tipoArquivo,
        caminhoArquivo: arquivo.filename,
        nomeOriginal: arquivo.originalname
      }];
    } else if (tipo !== 'texto' && (!req.body.arquivosExistentes || req.body.arquivosExistentes.length === 0)) {
      // Para tipos diferentes de texto, exigir pelo menos um arquivo, exceto se estiver editando
      req.flash('error', 'É necessário enviar um arquivo para este tipo de template');
      return res.redirect('/templates');
    }
    
    // Criar e salvar o novo template
    const template = new Template(templateData);
    await template.save();
    
    req.flash('success', 'Template criado com sucesso');
    res.redirect('/templates');
    
  } catch (err) {
    console.error('Erro ao criar template:', err);
    req.flash('error', 'Erro ao criar template: ' + err.message);
    res.redirect('/templates');
  }
};

// Atualizar um template (API)
exports.updateTemplate = async (req, res) => {
  try {
    const { id, nome, texto, tipoAudio } = req.body;
    
    // Localizar o template
    const template = await Template.findById(id);
    
    if (!template) {
      req.flash('error', 'Template não encontrado');
      return res.redirect('/templates');
    }
    
    // Atualizar os campos básicos
    template.nome = nome;
    template.conteudo.texto = texto || '';
    
    // Atualizar tipoAudio se for um template de áudio
    if (template.tipo === 'audio') {
      template.conteudo.tipoAudio = tipoAudio || 'normal';
    }
    
    // Processar novo arquivo se enviado
    if (req.file) {
      // Upload ocorre através do middleware Multer
      const arquivo = req.file;
      
      // Definir tipo de arquivo com base no tipo do template
      let tipoArquivo;
      if (template.tipo === 'imagem') tipoArquivo = 'imagem';
      else if (template.tipo === 'audio') tipoArquivo = 'audio';
      else tipoArquivo = 'arquivo';
      
      // Adicionar informações do arquivo
      const novoArquivo = {
        tipo: tipoArquivo,
        caminhoArquivo: arquivo.filename,
        nomeOriginal: arquivo.originalname
      };
      
      // Verificar se já existem arquivos ou se é o primeiro
      if (!template.conteudo.arquivos) {
        template.conteudo.arquivos = [novoArquivo];
      } else {
        // No caso de edição, podemos substituir ou adicionar
        if (template.tipo === 'misto') {
          // Para tipo misto, adicionar ao array existente
          template.conteudo.arquivos.push(novoArquivo);
        } else {
          // Para tipos simples, substituir o arquivo
          template.conteudo.arquivos = [novoArquivo];
        }
      }
    }
    
    // Salvar as alterações
    await template.save();
    
    req.flash('success', 'Template atualizado com sucesso');
    res.redirect('/templates');
    
  } catch (err) {
    console.error('Erro ao atualizar template:', err);
    req.flash('error', 'Erro ao atualizar template: ' + err.message);
    res.redirect('/templates');
  }
};

// Excluir um template (API)
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    
    if (!template) {
      return res.status(404).json({ msg: 'Template não encontrado' });
    }
    
    // Excluir arquivos associados ao template
    if (template.conteudo && template.conteudo.arquivos) {
      template.conteudo.arquivos.forEach(arquivo => {
        try {
          // Se for apenas um nome de arquivo, construir o caminho completo
          let caminhoArquivo = arquivo.caminhoArquivo;
          if (!caminhoArquivo.includes('/') && !caminhoArquivo.includes('\\')) {
            caminhoArquivo = path.join(__dirname, '..', 'uploads', caminhoArquivo);
          } else {
            caminhoArquivo = path.join(__dirname, '..', arquivo.caminhoArquivo);
          }
          
          if (fs.existsSync(caminhoArquivo)) {
            fs.unlinkSync(caminhoArquivo);
            console.log(`Arquivo removido: ${caminhoArquivo}`);
          }
        } catch (err) {
          console.error(`Erro ao excluir arquivo:`, err);
        }
      });
    }
    
    await template.deleteOne();
    
    req.flash('success', 'Template removido com sucesso');
    
    // Verificar se a requisição espera JSON ou HTML
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.json({ msg: 'Template removido' });
    } else {
      res.redirect('/templates');
    }
  } catch (err) {
    console.error(err.message);
    req.flash('error', 'Erro ao excluir template');
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.status(500).json({ msg: 'Erro no servidor' });
    } else {
      res.redirect('/templates');
    }
  }
};

// Middleware para upload de arquivos
exports.uploadMiddleware = upload.single('arquivo');

// Upload de arquivo
exports.uploadFile = async (req, res) => {
  try {
    // Verificar se há arquivo
    if (!req.file) {
      console.error('Nenhum arquivo recebido');
      return res.status(400).json({ erro: 'Nenhum arquivo recebido' });
    }

    const arquivo = req.file;
    console.log('Arquivo recebido:', arquivo.filename);

    // Verificar o caminho completo para debugging
    const caminhoCompleto = path.join(__dirname, '../uploads', arquivo.filename);
    console.log('Caminho completo (verificado):', caminhoCompleto);

    // Determinar o tipo de arquivo
    let tipo = 'arquivo';
    if (arquivo.mimetype.startsWith('image/')) {
      tipo = 'imagem';
    } else if (arquivo.mimetype.startsWith('audio/')) {
      tipo = 'audio';
    } else if (arquivo.mimetype.startsWith('application/')) {
      tipo = 'documento';
    }

    // Informações do arquivo para retornar
    const infoArquivo = {
      tipo,
      caminhoArquivo: arquivo.filename,
      nomeOriginal: arquivo.originalname
    };

    console.log('Retornando informações do arquivo:', infoArquivo);
    
    // Se o template ID for fornecido, associar o arquivo ao template
    if (req.params.id) {
      const template = await Template.findById(req.params.id);
      
      if (!template) {
        return res.status(404).json({ erro: 'Template não encontrado' });
      }
      
      // Verificar se já tem arquivos ou criar a propriedade
      if (!template.conteudo.arquivos) {
        template.conteudo.arquivos = [];
      }
      
      // Adicionar arquivo
      template.conteudo.arquivos.push(infoArquivo);
      await template.save();
      
      return res.json({ 
        mensagem: 'Arquivo associado com sucesso',
        arquivo: infoArquivo,
        template
      });
    }

    // Retornar informações do arquivo
    res.json(infoArquivo);
  } catch (error) {
    console.error('Erro no upload de arquivo:', error);
    res.status(500).json({ erro: 'Erro no upload de arquivo' });
  }
}; 