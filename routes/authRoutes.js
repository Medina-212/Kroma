const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');

// ==========================================
// REGISTRO DE USUARIOS (Cliente o Profesional)
// ==========================================
router.post('/registro', async (req, res) => {
  const { nombre_completo, correo, password, telefono, rol_nombre } = req.body;

  if (!nombre_completo || !correo || !password || !rol_nombre) {
    return res.status(400).json({ error: 'Todos los campos obligatorios deben ser diligenciados.' });
  }

  try {
    // 1. Verificar si el correo ya existe
    const existe = await db.query('SELECT id FROM usuarios WHERE LOWER(correo) = LOWER($1)', [correo.trim()]);
    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'El correo electrónico ya se encuentra registrado.' });
    }

    // 2. Obtener id del rol
    const rolRes = await db.query('SELECT id FROM roles WHERE nombre = $1', [rol_nombre]);
    if (rolRes.rows.length === 0) {
      return res.status(400).json({ error: 'El rol especificado no es válido.' });
    }
    const rol_id = rolRes.rows[0].id;

    // 3. Encriptar contraseña
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);

    // 4. Insertar usuario
    const nuevoUsuario = await db.query(
      `INSERT INTO usuarios (nombre_completo, correo, password_hash, telefono, rol_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nombre_completo, correo, rol_id`,
      [nombre_completo.trim(), correo.trim().toLowerCase(), password_hash, telefono, rol_id]
    );

    const usuarioId = nuevoUsuario.rows[0].id;

    // 5. Si es Profesional, crear automáticamente su entrada en perfiles_profesionales
    if (rol_nombre === 'Profesional') {
      await db.query(
        'INSERT INTO perfiles_profesionales (usuario_id, nombre_comercial) VALUES ($1, $2)',
        [usuarioId, nombre_completo]
      );
    }

    return res.status(201).json({
      mensaje: 'Usuario registrado exitosamente.',
      usuario: nuevoUsuario.rows[0]
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno al registrar el usuario.' });
  }
});

// ==========================================
// INICIO DE SESIÓN (Login para todos los roles)
// ==========================================
router.post('/login', async (req, res) => {
  const { correo, password } = req.body;

  if (!correo || !password) {
    return res.status(400).json({ error: 'Por favor ingrese correo y contraseña.' });
  }

  try {
    // Buscar usuario y su rol
    const query = `
      SELECT u.id, u.nombre_completo, u.correo, u.password_hash, u.activo, r.nombre AS rol
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      WHERE LOWER(u.correo) = LOWER($1)
    `;
    const resultado = await db.query(query, [correo.trim()]);

    if (resultado.rows.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const usuario = resultado.rows[0];

    // Verificar si la cuenta está activa (HU-02)
    if (!usuario.activo) {
      return res.status(403).json({ error: 'Tu cuenta se encuentra suspendida. Contacta al administrador.' });
    }

    // Verificar contraseña
    const passwordValido = await bcrypt.compare(password, usuario.password_hash);
    if (!passwordValido) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    // Generar Token JWT codificando ID y Rol
    const token = jwt.sign(
      { id: usuario.id, correo: usuario.correo, rol: usuario.rol },
      process.env.JWT_SECRET || 'clave_secreta_kroma',
      { expiresIn: '8h' }
    );

    return res.status(200).json({
      mensaje: 'Inicio de sesión exitoso.',
      token,
      usuario: {
        id: usuario.id,
        nombre: usuario.nombre_completo,
        correo: usuario.correo,
        rol: usuario.rol
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno al iniciar sesión.' });
  }
});

module.exports = router;