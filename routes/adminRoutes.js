const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware simulado para validar rol Administrador
const esAdmin = (req, res, next) => {
  const { rol } = req.headers;
  if (rol !== 'Administrador') {
    return res.status(403).json({ error: 'Acceso denegado. Se requieren permisos de Administrador.' });
  }
  next();
};

// ==========================================
// HU-01: CONFIGURAR PERFILES Y CATEGORÍAS
// ==========================================

// CA-01 y CA-02: Crear categoría de servicio (Con validación de campos obligatorios y duplicados)
router.post('/categorias', esAdmin, async (req, res) => {
  const { nombre_categoria, descripcion } = req.body;

  // CA-02: Validación de datos obligatorios
  if (!nombre_categoria || nombre_categoria.trim() === '') {
    return res.status(400).json({ error: 'El nombre de la categoría es obligatorio.' });
  }

  try {
    // CA-02: Verificar si ya existe
    const existe = await db.query(
      'SELECT id FROM categorias_servicios WHERE LOWER(nombre_categoria) = LOWER($1)',
      [nombre_categoria.trim()]
    );

    if (existe.rows.length > 0) {
      return res.status(400).json({ error: 'La categoría ya existe en la plataforma.' });
    }

    // CA-01: Guardado exitoso
    const resultado = await db.query(
      'INSERT INTO categorias_servicios (nombre_categoria, descripcion) VALUES ($1, $2) RETURNING *',
      [nombre_categoria.trim(), descripcion]
    );

    return res.status(201).json({
      mensaje: 'Categoría guardada exitosamente.',
      categoria: resultado.rows[0]
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error interno al guardar la categoría.' });
  }
});

// Listar todas las categorías
router.get('/categorias', async (req, res) => {
  try {
    const resultado = await db.query('SELECT * FROM categorias_servicios ORDER BY id DESC');
    return res.status(200).json(resultado.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error al obtener las categorías.' });
  }
});

// ==========================================
// HU-02: ADMINISTRAR USUARIOS Y PERFILES
// ==========================================

// Listar usuarios registrados
router.get('/usuarios', esAdmin, async (req, res) => {
  try {
    const queryText = `
      SELECT u.id, u.nombre_completo, u.correo, u.telefono, r.nombre AS rol, u.activo, u.creado_en
      FROM usuarios u
      JOIN roles r ON u.rol_id = r.id
      ORDER BY u.id DESC
    `;
    const resultado = await db.query(queryText);
    return res.status(200).json(resultado.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error al consultar los usuarios.' });
  }
});

// CA-01 & CA-02 (HU-02): Cambiar estado del usuario (Activo / Inactivo)
router.patch('/usuarios/:id/estado', esAdmin, async (req, res) => {
  const { id } = req.params;
  const { activo } = req.body;

  if (typeof activo !== 'boolean') {
    return res.status(400).json({ error: 'El campo "activo" debe ser un valor booleano.' });
  }

  try {
    const resultado = await db.query(
      'UPDATE usuarios SET activo = $1 WHERE id = $2 RETURNING id, nombre_completo, activo',
      [activo, id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    return res.status(200).json({
      mensaje: `El usuario ha sido ${activo ? 'activado' : 'suspendido'} exitosamente.`,
      usuario: resultado.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ error: 'Error al cambiar el estado del usuario.' });
  }
});

// ==========================================
// HU-03: SUPERVISAR Y OCULTAR PERFILES
// ==========================================

// Listar perfiles para supervisión
router.get('/perfiles', esAdmin, async (req, res) => {
  try {
    const queryText = `
      SELECT p.id, u.nombre_completo, p.nombre_comercial, p.barrio, p.descripcion, p.visibilidad
      FROM perfiles_profesionales p
      JOIN usuarios u ON p.usuario_id = u.id
      ORDER BY p.id DESC
    `;
    const resultado = await db.query(queryText);
    return res.status(200).json(resultado.rows);
  } catch (error) {
    return res.status(500).json({ error: 'Error al listar los perfiles.' });
  }
});

// CA-01 & CA-02 (HU-03): Ocultar / Cambiar visibilidad de perfiles e insertar auditoría
router.patch('/perfiles/:id/visibilidad', esAdmin, async (req, res) => {
  const { id } = req.params;
  const { visibilidad, motivo, admin_id } = req.body;

  if (typeof visibilidad !== 'boolean') {
    return res.status(400).json({ error: 'El campo visibilidad es obligatorio.' });
  }

  try {
    // Actualizar visibilidad del perfil
    const perfilRes = await db.query(
      'UPDATE perfiles_profesionales SET visibilidad = $1 WHERE id = $2 RETURNING *',
      [visibilidad, id]
    );

    if (perfilRes.rows.length === 0) {
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    // Registrar acción en la tabla de historial de moderación (CA-02 HU-03)
    const accion = visibilidad ? 'MOSTRAR' : 'OCULTAR';
    await db.query(
      'INSERT INTO historial_moderacion (perfil_id, admin_id, accion, motivo) VALUES ($1, $2, $3, $4)',
      [id, admin_id || null, accion, motivo || 'Moderación preventiva por administración']
    );

    return res.status(200).json({
      mensaje: visibilidad ? 'Perfil restaurado a visible.' : 'Perfil ocultado correctamente por moderación.',
      perfil: perfilRes.rows[0]
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al cambiar la visibilidad del perfil.' });
  }
});

module.exports = router;