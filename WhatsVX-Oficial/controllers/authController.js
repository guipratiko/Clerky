const User = require('../models/User');
const bcrypt = require('bcryptjs');

// Criar usuário inicial se não existir
const createInitialUser = async () => {
  try {
    const userExists = await User.findOne({ username: { $regex: '^guilherme$', $options: 'i' } });
    if (!userExists) {
      const hashedPassword = await bcrypt.hash('Home1366!', 10);
      await User.create({
        username: 'guilherme',
        password: hashedPassword
      });
      console.log('Usuário inicial criado com sucesso');
    }
  } catch (err) {
    console.error('Erro ao criar usuário inicial:', err);
  }
};

// Middleware para verificar autenticação
const isAuthenticated = (req, res, next) => {
  if (req.session && req.session.user) {
    return next();
  }
  res.redirect('/login');
};

// Login
const login = async (req, res) => {
  const { username, password } = req.body;
  
  try {
    // Buscar usuário ignorando maiúsculas/minúsculas
    const user = await User.findOne({ username: { $regex: `^${username}$`, $options: 'i' } });
    if (!user) {
      req.flash('error', 'Usuário não encontrado');
      return res.redirect('/login');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      req.flash('error', 'Senha incorreta');
      return res.redirect('/login');
    }

    req.session.user = user;
    req.flash('success', 'Login realizado com sucesso');
    res.redirect('/');
  } catch (err) {
    console.error('Erro no login:', err);
    req.flash('error', 'Erro ao realizar login');
    res.redirect('/login');
  }
};

// Logout
const logout = (req, res) => {
  req.session.destroy();
  res.redirect('/login');
};

module.exports = {
  createInitialUser,
  isAuthenticated,
  login,
  logout
}; 