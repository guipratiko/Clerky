require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const expressLayouts = require('express-ejs-layouts');
const http = require('http');
const socketIO = require('socket.io');
const bcrypt = require('bcryptjs');

// Importar configuração do banco de dados
const connectDB = require('./config/db');

// Importar controlador de autenticação
const authController = require('./controllers/authController');

// Inicializar aplicação
const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Conectar ao banco de dados
connectDB();

// Configurar EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');

// Middleware para processar JSON e form data
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Servir arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Configurar sessão
app.use(session({
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: true,
  cookie: { maxAge: 604800000 } // 7 dias
}));

// Configurar flash messages
app.use(flash());

// Middleware para variáveis globais
app.use((req, res, next) => {
  res.locals.success_msg = req.flash('success');
  res.locals.error_msg = req.flash('error');
  res.locals.user = req.session.user;
  next();
});

// Criar usuário inicial
authController.createInitialUser();

// Definir rotas
app.use('/api/webhook', require('./routes/webhook'));
app.use('/', require('./routes/auth'));

// Rota específica para webhook do n8n sem autenticação
app.use('/api/whatsapp/webhook/n8n', require('./routes/whatsapp').webhookRouter);

// Rotas protegidas por autenticação
app.use('/', authController.isAuthenticated, require('./routes/index'));
app.use('/api/whatsapp', authController.isAuthenticated, require('./routes/whatsapp').router);

// WebSockets com Socket.io
io.on('connection', (socket) => {
  console.log('Novo cliente conectado:', socket.id);
  
  // Listener para desconexão
  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
  
  // Informar que o cliente está autenticado (para novos clientes)
  if (global.whatsappStatus) {
    socket.emit('whatsapp:status', global.whatsappStatus);
  }

  // Avisar quando campanha iniciar ou terminar
  socket.on('campanha:status', (dados) => {
    // Repassar para todos os clientes
    io.emit('campanha:status', dados);
  });

  // Validar tempo de conexão
  setTimeout(() => {
    if (socket.connected) {
      socket.emit('heartbeat');
    }
  }, 30000);
});

// Exportar objetos para uso global
global.io = io;

// Inicializar WhatsApp
const whatsappController = require('./controllers/whatsappController');
whatsappController.init(io);

// Iniciar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
}); 