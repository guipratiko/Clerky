const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ContatoSchema = new Schema({
  numero: {
    type: String,
    required: true
  },
  nome: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['pendente', 'enviado', 'erro'],
    default: 'pendente'
  },
  dataEnvio: {
    type: Date
  },
  mensagemErro: {
    type: String
  },
  infoContato: {
    nome: String,
    status: String
  }
});

const ListaContatosSchema = new Schema({
  nomeArquivo: String,
  dataImportacao: {
    type: Date,
    default: Date.now
  },
  contatos: [ContatoSchema]
});

const CampanhaSchema = new Schema({
  nome: {
    type: String,
    required: true,
    trim: true
  },
  template: {
    type: Schema.Types.ObjectId,
    ref: 'Template',
    required: true
  },
  status: {
    type: String,
    enum: ['criada', 'agendada', 'processando', 'pausada', 'concluida', 'cancelada'],
    default: 'criada'
  },
  dataAgendamento: {
    type: Date
  },
  dataCriacao: {
    type: Date,
    default: Date.now
  },
  dataInicio: {
    type: Date
  },
  dataConclusao: {
    type: Date
  },
  listaContatos: ListaContatosSchema,
  estatisticas: {
    total: {
      type: Number,
      default: 0
    },
    enviados: {
      type: Number,
      default: 0
    },
    erros: {
      type: Number,
      default: 0
    },
    pendentes: {
      type: Number,
      default: 0
    }
  },
  intervaloDisparo: {
    min: {
      type: Number,
      default: 110000 // 110 segundos
    },
    max: {
      type: Number,
      default: 135000 // 135 segundos
    }
  }
});

// Middleware para atualizar as estatísticas antes de salvar
CampanhaSchema.pre('save', function(next) {
  if (this.listaContatos && this.listaContatos.contatos) {
    const contatos = this.listaContatos.contatos;
    const total = contatos.length;
    const enviados = contatos.filter(c => c.status === 'enviado').length;
    const erros = contatos.filter(c => c.status === 'erro').length;
    const pendentes = contatos.filter(c => c.status === 'pendente').length;
    
    this.estatisticas = {
      total,
      enviados,
      erros,
      pendentes
    };
  }
  next();
});

module.exports = mongoose.model('Campanha', CampanhaSchema); 