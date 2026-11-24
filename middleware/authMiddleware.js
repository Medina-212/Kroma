const jwt = require('jsonwebtoken');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'clave_secreta_kroma';

function verificarToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Acceso denegado. Token no proporcionado.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuario = decoded; // { id, correo, rol }
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
}

function verificarAdmin(req, res, next) {
  verificarToken(req, res, () => {
    if (req.usuario.rol !== 'Administrador') {
      return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de Administrador.' });
    }
    next();
  });
}

module.exports = { verificarToken, verificarAdmin };