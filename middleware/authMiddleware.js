const jwt = require('jsonwebtoken');

// Middleware para verificar que sea Administrador
const verificarAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Formato: Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Acceso no autorizado. Se requiere iniciar sesión.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'clave_secreta_kroma');
    
    // RESTRICCIÓN DE SEGURIDAD: Solo el rol 'Administrador' puede pasar
    if (decoded.rol !== 'Administrador') {
      return res.status(403).json({ 
        error: 'Acceso denegado. No tienes permisos de Administrador para acceder a este recurso.' 
      });
    }

    req.usuario = decoded; // Adjuntar datos del token a la petición
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Token inválido o expirado.' });
  }
};

module.exports = { verificarAdmin };