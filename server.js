const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const adminRoutes = require('./routes/adminRoutes');
const authRoutes = require('./routes/authRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares principales
app.use(cors());
app.use(express.json());

// DESACTIVAR CACHÉ DEL NAVEGADOR (Evita volver al panel con las flechas atrás/adelante)
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  next();
});

// 1. RUTA RAÍZ PRIMERO: Redirigir de inmediato al Login al entrar a http://localhost:3000
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// 2. Archivos estáticos de la carpeta public
app.use(express.static('public'));

// 3. Rutas API de Kroma
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto http://localhost:${PORT}`);
});