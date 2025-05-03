const mongoose = require('mongoose');

const configSchema = new mongoose.Schema({
  chave: {
    type: String,
    required: true,
    unique: true
  },
  valor: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  atualizadoEm: {
    type: Date,
    default: Date.now
  }
});

// Adicionar índice para melhorar performance de busca
configSchema.index({ chave: 1 });

module.exports = mongoose.model('Config', configSchema); 