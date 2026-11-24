const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { verificarToken } = require('../middleware/authMiddleware');

// Carpeta para guardar fotografías (public/uploads/trabajos)
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'trabajos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, `trabajo_${req.usuario.id}_${Date.now()}${extension}`);
  }
});

// Validación MIME: JPG, PNG, WEBP (RF-6 / CA-12)
const fileFilter = (req, file, cb) => {
  const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (tiposPermitidos.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Formato no válido. Solo se permiten imágenes JPG, PNG o WEBP.'), false);
  }
};

// Límite de 5 MB (RNF Integridad / CA-12)
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

const manejarSubidaImagen = (campo) => (req, res, next) => {
  upload.single(campo)(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'La imagen supera el tamaño máximo permitido de 5 MB.' });
      }
      return res.status(400).json({ error: `Error al subir imagen: ${err.message}` });
    } else if (err) {
      return res.status(400).json({ error: err.message });
    }
    next();
  });
};

async function obtenerPerfilPorUsuario(usuarioId) {
  const res = await db.query(
    `SELECT p.*, u.nombre_completo, u.correo, u.telefono
     FROM perfiles_profesionales p
     JOIN usuarios u ON p.usuario_id = u.id
     WHERE p.usuario_id = $1`,
    [usuarioId]
  );
  return res.rows[0] || null;
}

// ============================================================================
// HU-04: CREAR / COMPLETAR PERFIL PROFESIONAL
// ============================================================================

// Obtener datos actuales del perfil profesional
router.get('/perfil', verificarToken, async (req, res) => {
  try {
    const perfil = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }
    res.json(perfil);
  } catch (error) {
    console.error('Error al obtener perfil:', error);
    res.status(500).json({ error: 'Error interno al consultar el perfil.' });
  }
});

// Actualizar / completar perfil profesional (nombre comercial, categoría, barrio, descripción, teléfono y foto)
router.put('/perfil', verificarToken, manejarSubidaImagen('foto_perfil'), async (req, res) => {
  const { nombre_comercial, categoria_id, barrio, descripcion, telefono } = req.body;

  if (!nombre_comercial || !barrio) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return res.status(400).json({ error: 'El nombre comercial y el barrio son obligatorios.' });
  }

  try {
    const perfilActual = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfilActual) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    const nuevaFoto = req.file ? `/uploads/trabajos/${req.file.filename}` : perfilActual.foto_perfil;

    const perfilRes = await db.query(
      `UPDATE perfiles_profesionales
       SET nombre_comercial = $1,
           categoria_id = $2,
           barrio = $3,
           descripcion = $4,
           foto_perfil = $5
       WHERE usuario_id = $6
       RETURNING *`,
      [
        nombre_comercial.trim(),
        categoria_id || null,
        barrio.trim(),
        descripcion ? descripcion.trim() : '',
        nuevaFoto,
        req.usuario.id
      ]
    );

    if (telefono !== undefined) {
      await db.query('UPDATE usuarios SET telefono = $1 WHERE id = $2', [telefono.trim(), req.usuario.id]);
    }

    res.json({
      mensaje: 'Perfil profesional guardado exitosamente.',
      perfil: perfilRes.rows[0]
    });
  } catch (error) {
    console.error('Error al actualizar perfil:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Error interno al guardar el perfil profesional.' });
  }
});

// ============================================================================
// HU-05: PUBLICAR Y ADMINISTRAR SERVICIOS ESTÉTICOS
// ============================================================================

router.get('/servicios', verificarToken, async (req, res) => {
  try {
    const perfil = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    const resultado = await db.query(
      `SELECT id, nombre, descripcion, tiempo_estimado, precio, activo, creado_en
       FROM servicios
       WHERE perfil_id = $1
       ORDER BY creado_en DESC`,
      [perfil.id]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al listar servicios:', error);
    res.status(500).json({ error: 'Error interno al obtener los servicios.' });
  }
});

router.post('/servicios', verificarToken, async (req, res) => {
  const { nombre, descripcion, tiempo_estimado, precio } = req.body;

  if (!nombre || !descripcion || !tiempo_estimado || precio === undefined) {
    return res.status(400).json({
      error: 'Todos los campos son obligatorios: nombre, descripción, tiempo estimado y precio.'
    });
  }

  if (isNaN(Number(precio)) || Number(precio) < 0) {
    return res.status(400).json({ error: 'El precio en COP debe ser un número mayor o igual a 0.' });
  }

  try {
    const perfil = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    const nuevoServicio = await db.query(
      `INSERT INTO servicios (perfil_id, nombre, descripcion, tiempo_estimado, precio, activo)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [perfil.id, nombre.trim(), descripcion.trim(), tiempo_estimado.trim(), Number(precio)]
    );

    res.status(201).json({
      mensaje: 'Servicio publicado exitosamente.',
      servicio: nuevoServicio.rows[0]
    });
  } catch (error) {
    console.error('Error al publicar servicio:', error);
    res.status(500).json({ error: 'Error interno al publicar el servicio.' });
  }
});

router.delete('/servicios/:id', verificarToken, async (req, res) => {
  const { id } = req.params;

  try {
    const perfil = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    const resultado = await db.query(
      'DELETE FROM servicios WHERE id = $1 AND perfil_id = $2 RETURNING id',
      [id, perfil.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Servicio no encontrado.' });
    }

    res.json({ mensaje: 'Servicio eliminado correctamente.' });
  } catch (error) {
    console.error('Error al eliminar servicio:', error);
    res.status(500).json({ error: 'Error interno al eliminar el servicio.' });
  }
});

// ============================================================================
// HU-06: MOSTRAR TRABAJOS REALIZADOS (GALERÍA FOTOGRÁFICA)
// ============================================================================

router.get('/trabajos', verificarToken, async (req, res) => {
  try {
    const perfil = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    const resultado = await db.query(
      `SELECT id, titulo, descripcion, url_imagen, creado_en
       FROM trabajos_realizados
       WHERE perfil_id = $1
       ORDER BY creado_en DESC`,
      [perfil.id]
    );

    res.json(resultado.rows);
  } catch (error) {
    console.error('Error al listar trabajos:', error);
    res.status(500).json({ error: 'Error interno al cargar la galería.' });
  }
});

router.post('/trabajos', verificarToken, manejarSubidaImagen('imagen'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Debes seleccionar una fotografía válida (JPG, PNG o WEBP).' });
  }

  const { titulo, descripcion } = req.body;

  try {
    const perfil = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfil) {
      fs.unlinkSync(req.file.path);
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    const urlImagen = `/uploads/trabajos/${req.file.filename}`;

    const resultado = await db.query(
      `INSERT INTO trabajos_realizados (perfil_id, titulo, descripcion, url_imagen)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [perfil.id, titulo ? titulo.trim() : 'Trabajo realizado', descripcion ? descripcion.trim() : '', urlImagen]
    );

    res.status(201).json({
      mensaje: 'Fotografía agregada a tu galería exitosamente.',
      trabajo: resultado.rows[0]
    });
  } catch (error) {
    console.error('Error al guardar trabajo:', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: 'Error interno al guardar la fotografía.' });
  }
});

router.delete('/trabajos/:id', verificarToken, async (req, res) => {
  const { id } = req.params;

  try {
    const perfil = await obtenerPerfilPorUsuario(req.usuario.id);
    if (!perfil) {
      return res.status(404).json({ error: 'Perfil profesional no encontrado.' });
    }

    const resultado = await db.query(
      'DELETE FROM trabajos_realizados WHERE id = $1 AND perfil_id = $2 RETURNING url_imagen',
      [id, perfil.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ error: 'Fotografía no encontrada.' });
    }

    const rutaFisica = path.join(__dirname, '..', 'public', resultado.rows[0].url_imagen);
    if (fs.existsSync(rutaFisica)) {
      fs.unlinkSync(rutaFisica);
    }

    res.json({ mensaje: 'Fotografía eliminada de la galería.' });
  } catch (error) {
    console.error('Error al eliminar trabajo:', error);
    res.status(500).json({ error: 'Error interno al eliminar la fotografía.' });
  }
});

module.exports = router;