const Campanha = require('../models/Campanha');
const Template = require('../models/Template');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const csv = require('csvtojson');

// Configuração do Multer para upload de arquivos CSV
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    const dir = path.join(__dirname, '../uploads/contatos');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
  },
  filename: function(req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + file.originalname;
    cb(null, uniqueSuffix);
  }
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'text/csv' || 
      file.originalname.endsWith('.csv')) {
    cb(null, true);
  } else {
    cb(new Error('Tipo de arquivo não suportado. Por favor, envie um arquivo CSV.'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Renderizar página de campanhas
exports.renderCampanhas = async (req, res) => {
  try {
    const campanhas = await Campanha.find()
      .populate('template')
      .sort({ dataCriacao: -1 });
    
    const templates = await Template.find().sort({ nome: 1 });
    
    res.render('campanhas', { 
      campanhas, 
      templates,
      title: 'Gerenciar Campanhas',
      messages: req.flash()
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Erro ao carregar campanhas');
    res.redirect('/');
  }
};

// Renderizar página de detalhes da campanha
exports.renderDetalhes = async (req, res) => {
  try {
    const campanha = await Campanha.findById(req.params.id)
      .populate('template');
    
    if (!campanha) {
      req.flash('error', 'Campanha não encontrada');
      return res.redirect('/campanhas');
    }
    
    res.render('detalhes-campanha', { 
      campanha, 
      title: `Campanha: ${campanha.nome}`,
      messages: req.flash()
    });
  } catch (err) {
    console.error(err);
    req.flash('error', 'Erro ao carregar detalhes da campanha');
    res.redirect('/campanhas');
  }
};

// Obter todas as campanhas (API)
exports.getCampanhas = async (req, res) => {
  try {
    const campanhas = await Campanha.find()
      .populate('template', 'nome tipo')
      .sort({ dataCriacao: -1 });
    
    res.json(campanhas);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Erro no servidor');
  }
};

// Obter uma campanha pelo ID (API)
exports.getCampanhaById = async (req, res) => {
  try {
    const campanha = await Campanha.findById(req.params.id)
      .populate('template');
    
    if (!campanha) {
      return res.status(404).json({ msg: 'Campanha não encontrada' });
    }
    
    res.json(campanha);
  } catch (err) {
    console.error(err.message);
    if (err.kind === 'ObjectId') {
      return res.status(404).json({ msg: 'Campanha não encontrada' });
    }
    res.status(500).send('Erro no servidor');
  }
};

// Criar uma nova campanha (API)
exports.createCampanha = async (req, res) => {
  try {
    const { nome, templateId } = req.body;
    
    // Verificar se o template existe
    const template = await Template.findById(templateId);
    if (!template) {
      return res.status(404).json({ msg: 'Template não encontrado' });
    }
    
    const novaCampanha = new Campanha({
      nome,
      template: templateId,
      listaContatos: {
        contatos: []
      }
    });
    
    const campanha = await novaCampanha.save();
    
    req.flash('success', 'Campanha criada com sucesso');
    
    // Verificar se a requisição espera JSON ou HTML
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.json(campanha);
    } else {
      res.redirect(`/campanhas/${campanha._id}`);
    }
  } catch (err) {
    console.error(err.message);
    req.flash('error', 'Erro ao criar campanha');
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.status(500).json({ msg: 'Erro no servidor' });
    } else {
      res.redirect('/campanhas');
    }
  }
};

// Atualizar uma campanha (API)
exports.updateCampanha = async (req, res) => {
  try {
    const { nome, templateId, status } = req.body;
    
    // Verificar se a campanha existe
    let campanha = await Campanha.findById(req.params.id);
    
    if (!campanha) {
      return res.status(404).json({ msg: 'Campanha não encontrada' });
    }
    
    // Verificar se o template existe, se for fornecido
    if (templateId) {
      const template = await Template.findById(templateId);
      if (!template) {
        return res.status(404).json({ msg: 'Template não encontrado' });
      }
      campanha.template = templateId;
    }
    
    // Atualizar os campos
    if (nome) campanha.nome = nome;
    if (status) campanha.status = status;
    
    // Atualizar datas com base no status
    if (status === 'processando' && !campanha.dataInicio) {
      campanha.dataInicio = Date.now();
    } else if (status === 'concluida' && !campanha.dataConclusao) {
      campanha.dataConclusao = Date.now();
    }
    
    await campanha.save();
    
    req.flash('success', 'Campanha atualizada com sucesso');
    
    // Verificar se a requisição espera JSON ou HTML
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.json(campanha);
    } else {
      res.redirect(`/campanhas/${campanha._id}`);
    }
  } catch (err) {
    console.error(err.message);
    req.flash('error', 'Erro ao atualizar campanha');
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.status(500).json({ msg: 'Erro no servidor' });
    } else {
      res.redirect('/campanhas');
    }
  }
};

// Excluir uma campanha (API)
exports.deleteCampanha = async (req, res) => {
  try {
    const campanha = await Campanha.findById(req.params.id);
    
    if (!campanha) {
      return res.status(404).json({ msg: 'Campanha não encontrada' });
    }
    
    // Excluir arquivo CSV da campanha, se existir
    if (campanha.listaContatos && campanha.listaContatos.nomeArquivo) {
      const caminhoCsv = path.join(__dirname, '../uploads/contatos', campanha.listaContatos.nomeArquivo);
      if (fs.existsSync(caminhoCsv)) {
        fs.unlinkSync(caminhoCsv);
      }
    }
    
    await campanha.deleteOne();
    
    req.flash('success', 'Campanha removida com sucesso');
    
    // Verificar se a requisição espera JSON ou HTML
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.json({ msg: 'Campanha removida' });
    } else {
      res.redirect('/campanhas');
    }
  } catch (err) {
    console.error(err.message);
    req.flash('error', 'Erro ao excluir campanha');
    
    if (req.xhr || req.headers.accept.indexOf('json') > -1) {
      res.status(500).json({ msg: 'Erro no servidor' });
    } else {
      res.redirect('/campanhas');
    }
  }
};

// Upload de lista de contatos (API)
exports.uploadContatos = async (req, res) => {
  const uploadMiddleware = upload.single('arquivo');
  
  uploadMiddleware(req, res, async function(err) {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ msg: `Erro de upload: ${err.message}` });
    } else if (err) {
      return res.status(500).json({ msg: `Erro: ${err.message}` });
    }
    
    try {
      if (!req.file) {
        return res.status(400).json({ msg: 'Nenhum arquivo enviado' });
      }
      
      const campanhaId = req.params.id;
      
      // Verificar se a campanha existe
      const campanha = await Campanha.findById(campanhaId);
      if (!campanha) {
        // Remover o arquivo se a campanha não existir
        fs.unlinkSync(req.file.path);
        return res.status(404).json({ msg: 'Campanha não encontrada' });
      }
      
      // Processar arquivo CSV
      const contatos = await csv().fromFile(req.file.path);
      
      // Verificar se tem a coluna de telefone ou numero
      if (contatos.length > 0 && !contatos[0].telefone && !contatos[0].numero) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({ msg: 'O arquivo CSV deve conter uma coluna "telefone" ou "numero"' });
      }
      
      // Formatar contatos para o formato do banco de dados
      const contatosFormatados = contatos.map(c => ({
        numero: c.telefone || c.numero,
        nome: c.nome || '',
        status: 'pendente'
      }));
      
      // Atualizar a campanha com os novos contatos
      campanha.listaContatos = {
        nomeArquivo: req.file.filename,
        dataImportacao: Date.now(),
        contatos: contatosFormatados
      };
      
      await campanha.save();
      
      req.flash('success', `${contatosFormatados.length} contatos importados com sucesso`);
      
      // Verificar se a requisição espera JSON ou HTML
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        res.json({
          msg: `${contatosFormatados.length} contatos importados com sucesso`,
          campanha
        });
      } else {
        res.redirect(`/campanhas/${campanha._id}`);
      }
    } catch (err) {
      console.error('Erro ao processar arquivo de contatos:', err);
      req.flash('error', 'Erro ao processar arquivo de contatos');
      
      if (req.xhr || req.headers.accept.indexOf('json') > -1) {
        res.status(500).json({ msg: 'Erro no servidor: ' + err.message });
      } else {
        res.redirect(`/campanhas/${req.params.id}`);
      }
    }
  });
}; 