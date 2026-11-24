const token = localStorage.getItem('kroma_token');
const rol = localStorage.getItem('kroma_rol');
const nombreUsuario = localStorage.getItem('kroma_nombre');

if (!token || rol !== 'Profesional') {
  localStorage.clear();
  window.location.replace('login.html');
}

if (nombreUsuario) {
  document.getElementById('saludoProfesional').textContent = `Hola, ${nombreUsuario}`;
}

function cerrarSesion() {
  if (confirm('¿Deseas cerrar sesión en Kroma?')) {
    localStorage.clear();
    window.location.replace('login.html');
  }
}

function mostrarAlerta(idElemento, mensaje, tipoBootstrap) {
  const el = document.getElementById(idElemento);
  el.innerHTML = `<div class="alert alert-${tipoBootstrap} alert-dismissible fade show" role="alert">
    ${mensaje}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
  </div>`;
}

// ============================================================================
// HU-04: PERFIL PROFESIONAL
// ============================================================================

async function cargarCategoriasYPerfil() {
  try {
    // 1. Cargar categorías creadas por el admin
    const resCat = await fetch('/api/admin/categorias');
    const categorias = await resCat.json();
    const selectCat = document.getElementById('prof-categoria');
    selectCat.innerHTML = '<option value="">Selecciona una categoría...</option>';
    categorias.forEach(c => {
      selectCat.innerHTML += `<option value="${c.id}">${c.nombre_categoria}</option>`;
    });

    // 2. Cargar datos actuales del perfil del trabajador
    const resProf = await fetch('/api/profesional/perfil', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (resProf.ok) {
      const p = await resProf.json();
      document.getElementById('prof-nombre').value = p.nombre_comercial || '';
      document.getElementById('prof-categoria').value = p.categoria_id || '';
      document.getElementById('prof-barrio').value = p.barrio || 'Calatrava';
      document.getElementById('prof-telefono').value = p.telefono || '';
      document.getElementById('prof-descripcion').value = p.descripcion || '';

      if (p.foto_perfil) {
        const img = document.getElementById('preview-foto-perfil');
        img.src = p.foto_perfil;
        img.classList.remove('d-none');
      }
    }
  } catch (err) {
    console.error('Error cargando perfil:', err);
  }
}

document.getElementById('form-perfil').addEventListener('submit', async (e) => {
  e.preventDefault();

  const formData = new FormData();
  formData.append('nombre_comercial', document.getElementById('prof-nombre').value);
  formData.append('categoria_id', document.getElementById('prof-categoria').value);
  formData.append('barrio', document.getElementById('prof-barrio').value);
  formData.append('telefono', document.getElementById('prof-telefono').value);
  formData.append('descripcion', document.getElementById('prof-descripcion').value);

  const fotoInput = document.getElementById('prof-foto');
  if (fotoInput.files[0]) {
    formData.append('foto_perfil', fotoInput.files[0]);
  }

  try {
    const res = await fetch('/api/profesional/perfil', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();

    if (res.ok) {
      mostrarAlerta('alerta-perfil', data.mensaje, 'success');
      cargarCategoriasYPerfil();
    } else {
      mostrarAlerta('alerta-perfil', data.error, 'danger');
    }
  } catch (err) {
    mostrarAlerta('alerta-perfil', 'Error de conexión al guardar el perfil.', 'danger');
  }
});

// ============================================================================
// HU-05: SERVICIOS
// ============================================================================

async function cargarServicios() {
  const contenedor = document.getElementById('lista-servicios');
  try {
    const res = await fetch('/api/profesional/servicios', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const datos = await res.json();

    if (!res.ok) {
      contenedor.innerHTML = `<p class="text-danger">${datos.error}</p>`;
      return;
    }

    if (datos.length === 0) {
      contenedor.innerHTML = '<p class="text-muted">Aún no has publicado servicios en tu catálogo.</p>';
      return;
    }

    contenedor.innerHTML = datos.map(s => `
      <div class="border rounded p-3 d-flex justify-content-between align-items-center">
        <div>
          <h6 class="fw-bold mb-1">${s.nombre} — <span class="text-success">$${Number(s.precio).toLocaleString('es-CO')} COP</span></h6>
          <small class="text-muted d-block"><i class="bi bi-clock me-1"></i>${s.tiempo_estimado}</small>
          <p class="mb-0 mt-1 small">${s.descripcion}</p>
        </div>
        <button class="btn btn-sm btn-outline-danger" onclick="eliminarServicio(${s.id})">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `).join('');
  } catch (err) {
    contenedor.innerHTML = '<p class="text-danger">Error de conexión al cargar servicios.</p>';
  }
}

document.getElementById('form-servicio').addEventListener('submit', async (e) => {
  e.preventDefault();

  const payload = {
    nombre: document.getElementById('srv-nombre').value,
    tiempo_estimado: document.getElementById('srv-tiempo').value,
    precio: document.getElementById('srv-precio').value,
    descripcion: document.getElementById('srv-descripcion').value
  };

  try {
    const res = await fetch('/api/profesional/servicios', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok) {
      mostrarAlerta('alerta-servicios', data.mensaje, 'success');
      e.target.reset();
      cargarServicios();
    } else {
      mostrarAlerta('alerta-servicios', data.error, 'danger');
    }
  } catch (err) {
    mostrarAlerta('alerta-servicios', 'Error de red al publicar el servicio.', 'danger');
  }
});

async function eliminarServicio(id) {
  if (!confirm('¿Seguro que deseas eliminar este servicio?')) return;

  const res = await fetch(`/api/profesional/servicios/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();

  if (res.ok) {
    mostrarAlerta('alerta-servicios', data.mensaje, 'success');
    cargarServicios();
  } else {
    mostrarAlerta('alerta-servicios', data.error, 'danger');
  }
}

// ============================================================================
// HU-06: GALERÍA DE TRABAJOS REALIZADOS
// ============================================================================

async function cargarTrabajos() {
  const galeria = document.getElementById('galeria-trabajos');
  try {
    const res = await fetch('/api/profesional/trabajos', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const datos = await res.json();

    if (!res.ok) {
      galeria.innerHTML = `<p class="text-danger">${datos.error}</p>`;
      return;
    }

    if (datos.length === 0) {
      galeria.innerHTML = '<div class="col-12"><p class="text-muted">Aún no has subido fotografías de tus trabajos.</p></div>';
      return;
    }

    galeria.innerHTML = datos.map(t => `
      <div class="col-sm-6 col-md-4 col-lg-3">
        <div class="card h-100">
          <img src="${t.url_imagen}" class="galeria-img" alt="${t.titulo || 'Trabajo realizado'}">
          <div class="card-body d-flex flex-column justify-content-between">
            <div>
              <h6 class="fw-bold mb-1">${t.titulo || 'Trabajo realizado'}</h6>
              <p class="small text-muted mb-2">${t.descripcion || ''}</p>
            </div>
            <button class="btn btn-sm btn-outline-danger w-100" onclick="eliminarTrabajo(${t.id})">
              <i class="bi bi-trash me-1"></i> Eliminar
            </button>
          </div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    galeria.innerHTML = '<p class="text-danger">Error de conexión al cargar la galería.</p>';
  }
}

document.getElementById('form-trabajo').addEventListener('submit', async (e) => {
  e.preventDefault();

  const archivo = document.getElementById('trab-imagen').files[0];
  if (!archivo) {
    mostrarAlerta('alerta-trabajos', 'Selecciona una imagen primero.', 'danger');
    return;
  }

  const tiposValidos = ['image/jpeg', 'image/png', 'image/webp'];
  if (!tiposValidos.includes(archivo.type)) {
    mostrarAlerta('alerta-trabajos', 'Formato inválido. Usa JPG, PNG o WEBP.', 'danger');
    return;
  }
  if (archivo.size > 5 * 1024 * 1024) {
    mostrarAlerta('alerta-trabajos', 'La imagen supera el máximo permitido de 5 MB.', 'danger');
    return;
  }

  const formData = new FormData();
  formData.append('titulo', document.getElementById('trab-titulo').value);
  formData.append('descripcion', document.getElementById('trab-descripcion').value);
  formData.append('imagen', archivo);

  try {
    const res = await fetch('/api/profesional/trabajos', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();

    if (res.ok) {
      mostrarAlerta('alerta-trabajos', data.mensaje, 'success');
      e.target.reset();
      cargarTrabajos();
    } else {
      mostrarAlerta('alerta-trabajos', data.error, 'danger');
    }
  } catch (err) {
    mostrarAlerta('alerta-trabajos', 'Error de red al subir la fotografía.', 'danger');
  }
});

async function eliminarTrabajo(id) {
  if (!confirm('¿Eliminar esta fotografía de tu galería?')) return;

  const res = await fetch(`/api/profesional/trabajos/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();

  if (res.ok) {
    mostrarAlerta('alerta-trabajos', data.mensaje, 'success');
    cargarTrabajos();
  } else {
    mostrarAlerta('alerta-trabajos', data.error, 'danger');
  }
}

// Carga inicial
cargarCategoriasYPerfil();
cargarServicios();
cargarTrabajos();