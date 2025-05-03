const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Rota de login
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  res.render('login', { layout: 'layouts/auth' });
});

// Processar login
router.post('/login', authController.login);

// Logout
router.get('/logout', authController.logout);

module.exports = router; 