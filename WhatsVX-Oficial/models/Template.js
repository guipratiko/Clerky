const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  tipo: {
    type: String,
    required: true,
    enum: ['texto', 'imagem', 'audio', 'arquivo', 'misto'],
    default: 'texto'
  },
  conteudo: {
    texto: {
      type: String,
      default: ''
    },
    arquivos: [
      {
        tipo: {
          type: String,
          enum: ['imagem', 'audio', 'arquivo'],
          required: true
        },
        caminhoArquivo: {
          type: String,
          required: true
        },
        nomeOriginal: {
          type: String,
          required: true
        }
      }
    ],
    // Campo para controlar se o áudio deve ser enviado como mensagem de voz
    tipoAudio: {
      type: String,
      enum: ['normal', 'voz'],
      default: 'normal'
    }
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  ultimaModificacao: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Template', TemplateSchema); 