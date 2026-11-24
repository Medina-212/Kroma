const bcrypt = require('bcryptjs');
const db = require('./db');

async function crearOActualizarAdmin() {
  const correo = 'admin@kroma.com';
  const passwordPlana = 'admin123';
  const nombre = 'Administrador Kroma';
  const telefono = '3000000000';

  try {
    // 1. Obtener el ID del rol Administrador
    const rolRes = await db.query("SELECT id FROM roles WHERE nombre = 'Administrador'");
    if (rolRes.rows.length === 0) {
      console.error("Error: El rol 'Administrador' no existe en la tabla roles.");
      process.exit(1);
    }
    const rol_id = rolRes.rows[0].id;

    // 2. Encriptar la contraseña 'admin123' usando el bcrypt del servidor
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(passwordPlana, salt);

    // 3. Insertar o actualizar si el correo ya existe
    const query = `
      INSERT INTO usuarios (nombre_completo, correo, password_hash, telefono, rol_id, activo)
      VALUES ($1, $2, $3, $4, $5, TRUE)
      ON CONFLICT (correo) 
      DO UPDATE SET password_hash = EXCLUDED.password_hash, rol_id = EXCLUDED.rol_id, activo = TRUE
      RETURNING id, correo;
    `;

    const res = await db.query(query, [nombre, correo, password_hash, telefono, rol_id]);
    console.log("Administrador configurado exitosamente:");
    console.log("   Correo:", res.rows[0].correo);
    console.log("   Contraseña:", passwordPlana);
    process.exit(0);
  } catch (error) {
    console.error("Error actualizando administrador:", error);
    process.exit(1);
  }
}

crearOActualizarAdmin();