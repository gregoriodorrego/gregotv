/* GregoTV Pruebas - listas personales, aisladas de la lista original.
   Solo datos locales. No se envian listas ni credenciales a ningun servicio. */
(function () {
  'use strict';
  var DB = 'gregotv-listas-personales-1', STORE = 'listas';
  var modal = null, tipoActual = 'url', editando = null, ocupado = false, focoAnterior = null, paginaActual = 0;
  window.__gregotvListaPersonalActiva = false;
  function el(id) { return document.getElementById(id); }

  // Iconos SVG compartidos por las ventanas de URL y archivo, incluidas sus listas guardadas.
  var iconosArchivo = {
    carpeta: '<path d="M3 20V6a2 2 0 0 1 2-2h5l2.5 2.5H19a2 2 0 0 1 2 2V20H3Z"/><path d="M12 20v-9m-4 4 4-4 4 4"/>',
    lista: '<path d="M9 6h12M9 12h12M9 18h12"/><circle cx="4" cy="6" r="1"/><circle cx="4" cy="12" r="1"/><circle cx="4" cy="18" r="1"/>',
    agregar: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
    editar: '<path d="m15 5 4 4"/><path d="M4 20l4.5-1 11-11a2.12 2.12 0 0 0-3-3l-11 11L4 20Z"/>',
    archivo: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/>',
    nube: '<path d="M7 18H6a4 4 0 0 1-1-7.9 7 7 0 0 1 13.6-1.4A4.6 4.6 0 0 1 18 18h-1"/><path d="M12 21V11m-4 4 4-4 4 4"/>',
    enlace: '<path d="M10 13a5 5 0 0 0 7.1 0l3-3A5 5 0 0 0 13 2.9l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3A5 5 0 0 0 11 21.1l1.7-1.7"/>',
    nubeBajar: '<path d="M7 18H6a4 4 0 0 1-1-7.9 7 7 0 0 1 13.6-1.4A4.6 4.6 0 0 1 18 18h-1"/><path d="M12 10v11m-4-4 4 4 4-4"/>',
    reproducir: '<path d="m8 5 12 7-12 7V5Z"/>',
    papelera: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 10v7M14 10v7"/>'
  };
  function iconoArchivo(tipo) {
    return '<svg class="gt-listas-archivo-icono gt-listas-icono-' + tipo + '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">' + iconosArchivo[tipo] + '</svg>';
  }

  function abrirBase() {
    return new Promise(function (ok, bad) {
      if (!window.indexedDB) { bad(new Error('Este navegador no permite guardar listas en el dispositivo.')); return; }
      var req = indexedDB.open(DB, 1);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { bad(new Error('No se pudo abrir el almacenamiento del dispositivo.')); };
      req.onblocked = function () { bad(new Error('El almacenamiento está ocupado por otra pestaña.')); };
    });
  }
  async function todos() {
    var db = await abrirBase();
    return new Promise(function (ok, bad) {
      var tx = db.transaction(STORE, 'readonly'), req = tx.objectStore(STORE).openCursor(), filas = [];
      req.onsuccess = function () {
        var cur = req.result;
        if (cur) { filas.push(cur.value); cur.continue(); }
        else { db.close(); ok(filas); }
      };
      req.onerror = function () { db.close(); bad(new Error('No se pudieron recuperar las listas.')); };
    });
  }
  async function guardar(lista) {
    var db = await abrirBase();
    return new Promise(function (ok, bad) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(lista);
      tx.oncomplete = function () { db.close(); ok(); };
      tx.onerror = function () { db.close(); bad(new Error('No se pudo guardar. Comprobá el espacio disponible.')); };
      tx.onabort = function () { db.close(); bad(new Error('El dispositivo rechazó el guardado.')); };
    });
  }
  async function borrar(id) {
    var db = await abrirBase();
    return new Promise(function (ok, bad) {
      var tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = function () { db.close(); ok(); };
      tx.onerror = function () { db.close(); bad(new Error('No se pudo eliminar la lista.')); };
    });
  }
  function nuevoId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 11);
  }
  function normalizarURL(valor) {
    var url = new URL(valor);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('La dirección debe comenzar con http:// o https://.');
    if (url.hostname === 'github.com' && url.pathname.indexOf('/blob/') !== -1) {
      url.hostname = 'raw.githubusercontent.com';
      url.pathname = url.pathname.replace('/blob/', '/');
    }
    return url.href;
  }
  function validarContenido(contenido) {
    if (typeof contenido !== 'string' || !contenido.trim()) throw new Error('La lista está vacía.');
    var extraer = window.extraerCanalesDeM3U;
    if (typeof extraer !== 'function') throw new Error('El reproductor original no está disponible.');
    var canales = extraer(contenido);
    if (!canales || !canales.length) throw new Error('No se encontraron canales compatibles. Revisá que sea una lista M3U válida.');
    return canales.length;
  }
  async function traerURL(url) {
    var respuesta;
    try {
      respuesta = await fetch(url, { cache: 'no-store', redirect: 'follow' });
    } catch (_) {
      throw new Error('No se pudo acceder a la dirección. Revisá Internet o un posible bloqueo CORS del servidor.');
    }
    if (!respuesta.ok) throw new Error('El servidor rechazó la lista (HTTP ' + respuesta.status + ').');
    var texto = await respuesta.text();
    validarContenido(texto);
    return texto;
  }
  function leerArchivo(archivo) {
    return new Promise(function (ok, bad) {
      if (!archivo) { bad(new Error('Seleccioná un archivo.')); return; }
      if (!/\.(m3u|m3u8|txt)$/i.test(archivo.name)) { bad(new Error('Seleccioná un archivo .m3u, .m3u8 o .txt.')); return; }
      var reader = new FileReader();
      reader.onload = function () { ok(String(reader.result || '')); };
      reader.onerror = function () { bad(new Error('No se pudo leer el archivo seleccionado.')); };
      reader.readAsText(archivo);
    });
  }
  function crearModal() {
    if (modal) return;
    // Estilos en listas-personales.css para todas las pantallas.
    modal = document.createElement('div');
    modal.id = 'gregotv-listas-modal'; modal.hidden = true;
    modal.innerHTML =
      '<section id="gregotv-listas-caja" role="dialog" aria-modal="true" aria-labelledby="gregotv-listas-titulo">' +
      '<header id="gregotv-listas-cabecera">' + iconoArchivo('carpeta') + iconoArchivo('enlace') + '<h2 id="gregotv-listas-titulo"></h2><button type="button" data-accion="cerrar" aria-label="Cerrar">✕</button></header>' +
      '<div id="gregotv-listas-cuerpo">' +
        '<section id="gregotv-listas-guardadas" aria-labelledby="gregotv-guardadas-titulo">' +
          '<div class="gregotv-listas-subcabecera"><h3 id="gregotv-guardadas-titulo">' + iconoArchivo('lista') + 'Mis listas guardadas</h3><button type="button" class="gregotv-vista-corta" data-accion="ver-formulario">Agregar nueva</button></div>' +
          '<div id="gregotv-listas-filas" aria-live="polite"></div>' +
          '<div id="gregotv-listas-paginador" hidden><button type="button" data-accion="anterior" aria-label="Página anterior">‹ Anterior</button><span id="gregotv-listas-pagina"></span><button type="button" data-accion="siguiente" aria-label="Página siguiente">Siguiente ›</button></div>' +
        '</section>' +
        '<form id="gregotv-listas-formulario">' +
          '<div class="gregotv-listas-subcabecera">' + iconoArchivo('agregar') + '<h3 id="gregotv-listas-subtitulo">Agregar nueva lista</h3><button type="button" class="gregotv-vista-corta" data-accion="ver-listas">← Mis listas</button></div>' +
          '<div class="gregotv-campos">' +
            '<div class="gt-listas-nombre-wrapper"><label for="gregotv-lista-nombre">Nombre de la lista</label>' + iconoArchivo('editar') + '<input id="gregotv-lista-nombre" maxlength="100" required autocomplete="off" placeholder="Mi lista IPTV"></div>' +
            '<div id="gregotv-listas-campo-url"><label for="gregotv-lista-url">Dirección URL</label>' + iconoArchivo('enlace') + '<input id="gregotv-lista-url" type="url" inputmode="url" placeholder="https://ejemplo.com/lista.m3u" autocomplete="off"></div>' +
            '<div id="gregotv-listas-campo-archivo"><label for="gregotv-lista-archivo">Archivo M3U</label>' + iconoArchivo('archivo') + '<input id="gregotv-lista-archivo" type="file" accept=".m3u,.m3u8,.txt"></div>' +
          '</div>' +
          '<div id="gregotv-listas-accion-formulario"><button type="submit" id="gregotv-listas-guardar">Guardar lista</button><button type="button" data-accion="cancelar-edicion" hidden>Cancelar</button></div>' +
        '</form>' +
      '</div>' +
      '<p id="gregotv-listas-estado" role="status" aria-live="polite"></p>' +
      '</section>';
    document.body.appendChild(modal);
    modal.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-accion]');
      if (!b) return;
      var accion = b.getAttribute('data-accion'), id = b.getAttribute('data-id');
      if (accion === 'cerrar') cerrarModal();
      else if (accion === 'cancelar-edicion') limpiarFormulario();
      else if (accion === 'abrir') abrirGuardada(id);
      else if (accion === 'editar') editarGuardada(id);
      else if (accion === 'borrar') eliminarGuardada(id);
      else if (accion === 'anterior') { paginaActual--; verListas(); }
      else if (accion === 'siguiente') { paginaActual++; verListas(); }
      else if (accion === 'ver-formulario') { modal.classList.add('gt-mostrar-formulario'); el('gregotv-lista-nombre').focus(); }
      else if (accion === 'ver-listas') { modal.classList.remove('gt-mostrar-formulario'); modal.querySelector('[data-accion="ver-formulario"]').focus(); }
    });
    el('gregotv-listas-formulario').addEventListener('submit', agregar);
    el('gregotv-lista-archivo').addEventListener('change', function () {
      if (tipoActual === 'archivo' && !el('gregotv-lista-nombre').value.trim() && this.files && this.files[0])
        el('gregotv-lista-nombre').value = this.files[0].name.replace(/\.(m3u|m3u8|txt)$/i, '');
    });
    modal.addEventListener('keydown', function (e) {
      var k = e.key || e.keyCode;
      if (k === 'Escape' || k === 'Backspace' && e.target.tagName !== 'INPUT' || e.keyCode === 10009 || k === 27) {
        e.preventDefault(); e.stopPropagation(); cerrarModal(); return;
      }
      if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== 'button' && e.target.type !== 'file') return;
      var elementos = Array.prototype.slice.call(modal.querySelectorAll('button:not([disabled]),input:not([disabled])'))
        .filter(function (x) { var r=x.getBoundingClientRect(); return r.width>0 && r.height>0; });
      var actual=e.target, r=actual.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2, mejor=null, puntuacion=Infinity;
      for (var n=0;n<elementos.length;n++){
        var c=elementos[n]; if(c===actual)continue;
        var t=c.getBoundingClientRect(), dx=t.left+t.width/2-cx, dy=t.top+t.height/2-cy;
        if (!((k==='ArrowDown'&&dy>5)||(k==='ArrowUp'&&dy< -5)||(k==='ArrowRight'&&dx>5)||(k==='ArrowLeft'&&dx< -5)))continue;
        var horizontal=(k==='ArrowLeft'||k==='ArrowRight'), p=(horizontal?Math.abs(dx):Math.abs(dy))+(horizontal?Math.abs(dy):Math.abs(dx))*2.5;
        if(p<puntuacion){puntuacion=p;mejor=c;}
      }
      if(mejor){e.preventDefault();e.stopPropagation();mejor.focus();}
    });
  }
  function estado(texto) { el('gregotv-listas-estado').textContent = texto || ''; }
  function limpiarFormulario() {
    editando = null;
    el('gregotv-listas-formulario').reset();
    el('gregotv-listas-subtitulo').textContent = 'Agregar nueva lista';
    el('gregotv-listas-guardar').textContent = tipoActual === 'url' ? 'Guardar lista' : 'Guardar archivo';
    el('gregotv-listas-guardar').insertAdjacentHTML('afterbegin', iconoArchivo(tipoActual === 'url' ? 'nubeBajar' : 'nube'));
    modal.querySelector('[data-accion="cancelar-edicion"]').hidden = true;
    el('gregotv-listas-campo-url').hidden = tipoActual !== 'url';
    el('gregotv-listas-campo-archivo').hidden = tipoActual !== 'archivo';
    el('gregotv-lista-url').required = tipoActual === 'url';
    el('gregotv-lista-archivo').required = tipoActual === 'archivo';
    estado('');
  }
  function cerrarModal() {
    if (!modal || ocupado) return;
    modal.hidden = true;
    modal.classList.remove('gt-mostrar-formulario');
    document.body.classList.remove('gregotv-listas-abiertas');
    if (focoAnterior && document.contains(focoAnterior)) focoAnterior.focus();
  }
  async function verListas() {
    var destino = el('gregotv-listas-filas'); destino.textContent = 'Cargando listas guardadas…';
    try {
      var listas = (await todos()).filter(function (x) { return x.tipo === tipoActual; });
      listas.sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
      var totalPaginas = Math.max(1, Math.ceil(listas.length / 2));
      paginaActual = Math.max(0, Math.min(paginaActual, totalPaginas-1));
      destino.textContent = '';
      if (!listas.length) {
        var vacio = document.createElement('p');
        vacio.className='gregotv-lista-vacia';
        vacio.textContent = 'Todavía no tenés listas guardadas de este tipo.';
        destino.appendChild(vacio);
      }
      listas.slice(paginaActual * 2, paginaActual * 2 + 2).forEach(function (lista) {
        var fila = document.createElement('div'); fila.className = 'gregotv-lista-fila';
        var datos = document.createElement('div'); datos.className = 'gregotv-lista-datos';
        var titulo = document.createElement('strong'); titulo.textContent = lista.nombre;
        var detalle = document.createElement('small');
        var servidor = '';
        try { if (lista.url) servidor = new URL(lista.url).hostname; } catch (_) {}
        detalle.textContent = (lista.tipo === 'url' ? (servidor || 'URL guardada') : 'Archivo guardado') + ' · ' + (lista.canales || 0) + ' canales';
        var acciones = document.createElement('div'); acciones.className = 'gregotv-lista-acciones';
        [['abrir','Abrir','gregotv-abrir','reproducir'],['editar','Renombrar','gregotv-editar','editar'],['borrar','Eliminar','gregotv-borrar','papelera']].forEach(function (op) {
          var boton = document.createElement('button');
          boton.type = 'button'; boton.setAttribute('data-accion',op[0]); boton.setAttribute('data-id',lista.id);
          boton.className=op[2]; boton.textContent = op[1];
          boton.insertAdjacentHTML('afterbegin', iconoArchivo(op[3]));
          acciones.appendChild(boton);
        });
        datos.appendChild(titulo); datos.appendChild(detalle);
        fila.appendChild(datos); fila.appendChild(acciones); destino.appendChild(fila);
      });
      var nav=el('gregotv-listas-paginador'); nav.hidden=totalPaginas<=1;
      el('gregotv-listas-pagina').textContent = 'Página '+(paginaActual+1)+' de '+totalPaginas;
      nav.querySelector('[data-accion="anterior"]').disabled = paginaActual===0;
      nav.querySelector('[data-accion="siguiente"]').disabled = paginaActual>=totalPaginas-1;
    } catch (e) {
      destino.textContent = e.message || 'No se pudieron recuperar las listas.';
      el('gregotv-listas-paginador').hidden = true;
    }
  }
  function abrirModal(tipo) {
    crearModal(); focoAnterior = document.activeElement; tipoActual = tipo; paginaActual = 0;
    el('gregotv-listas-titulo').textContent = tipo === 'url' ? 'Cargar desde URL' : 'Cargar archivo';
    modal.classList.toggle('gt-archivo-activo', tipo === 'archivo');
    modal.classList.toggle('gt-url-activo', tipo === 'url');
    var nueva = modal.querySelector('[data-accion="ver-formulario"]');
    nueva.textContent = 'Agregar nueva';
    nueva.insertAdjacentHTML('afterbegin', iconoArchivo('agregar'));
    limpiarFormulario();
    modal.classList.remove('gt-mostrar-formulario');
    modal.hidden = false;
    document.body.classList.add('gregotv-listas-abiertas');
    verListas();
    modal.querySelector('[data-accion="cerrar"]').focus();
  }
  async function agregar(e) {
    e.preventDefault();
    if (ocupado) return;
    var nombre = el('gregotv-lista-nombre').value.trim();
    if (!nombre) { estado('Escribí un nombre para la lista.'); return; }
    ocupado = true; el('gregotv-listas-guardar').disabled = true;
    estado('Verificando y guardando la lista…');
    try {
      if (editando) {
        var vigentes = await todos(), actual = vigentes.find(function (x) { return x.id === editando && x.tipo === tipoActual; });
        if (!actual) throw new Error('La lista ya no está disponible.');
        actual.nombre = nombre; await guardar(actual);
      } else {
        var contenido = '', url = '', canales = 0;
        if (tipoActual === 'url') {
          url = normalizarURL(el('gregotv-lista-url').value.trim());
          var anteriores = await todos();
          if (anteriores.some(function (x) { return x.tipo === 'url' && x.url === url; }))
            throw new Error('Esta dirección ya está guardada. Podés abrirla desde la lista.');
          contenido = await traerURL(url);
        } else {
          var archivo = el('gregotv-lista-archivo').files[0];
          contenido = await leerArchivo(archivo);
        }
        canales = validarContenido(contenido);
        await guardar({ id: nuevoId(), tipo: tipoActual, nombre: nombre, url: url,
          contenido: tipoActual === 'archivo' ? contenido : null, canales: canales, creado: Date.now() });
      }
      limpiarFormulario(); await verListas();
      estado('Lista guardada correctamente en este dispositivo.');
    } catch (error) {
      estado(error && error.message ? error.message : 'No se pudo guardar la lista.');
    } finally {
      ocupado = false; el('gregotv-listas-guardar').disabled = false;
    }
  }
  async function editarGuardada(id) {
    try {
      var lista = (await todos()).find(function (x) { return x.id === id && x.tipo === tipoActual; });
      if (!lista) throw new Error('La lista ya no está disponible.');
      editando = id; el('gregotv-lista-nombre').value = lista.nombre;
      el('gregotv-listas-subtitulo').textContent = 'Cambiar nombre';
      modal.classList.add('gt-mostrar-formulario');
      modal.querySelector('[data-accion="cancelar-edicion"]').hidden = false;
      el('gregotv-listas-guardar').textContent = 'Guardar nuevo nombre';
      el('gregotv-listas-guardar').insertAdjacentHTML('afterbegin', iconoArchivo('editar'));
      el('gregotv-listas-campo-url').hidden = true;
      el('gregotv-listas-campo-archivo').hidden = true;
      // Los campos ocultos no deben bloquear el guardado de un cambio de nombre.
      el('gregotv-lista-url').required = false;
      el('gregotv-lista-archivo').required = false;
      estado(''); el('gregotv-lista-nombre').focus();
    } catch (e) { estado(e.message); }
  }
  async function eliminarGuardada(id) {
    if (ocupado) return;
    var lista = (await todos()).find(function (x) { return x.id === id && x.tipo === tipoActual; });
    if (!lista) { estado('La lista ya no está disponible.'); return; }
    if (!window.confirm('¿Eliminar "' + lista.nombre + '" de este dispositivo?')) return;
    try { await borrar(id); if (editando === id) limpiarFormulario(); await verListas(); estado('Lista eliminada del dispositivo.'); }
    catch (e) { estado(e.message); }
  }
  async function abrirGuardada(id) {
    if (ocupado) return;
    ocupado = true; estado('Abriendo la lista…');
    try {
      var lista = (await todos()).find(function (x) { return x.id === id && x.tipo === tipoActual; });
      if (!lista) throw new Error('La lista ya no está disponible.');
      var contenido = lista.tipo === 'url' ? await traerURL(lista.url) : lista.contenido;
      validarContenido(contenido);
      if (typeof window.procesarListaM3U !== 'function') throw new Error('El reproductor no está disponible.');
      if (!window.procesarListaM3U(contenido)) throw new Error('No se pudo abrir la lista en el reproductor.');
      window.__gregotvListaPersonalActiva = true;
      modal.hidden = true;
      document.body.classList.remove('gregotv-listas-abiertas');
    } catch (e) {
      estado(e && e.message ? e.message : 'No se pudo abrir la lista.');
    } finally { ocupado = false; }
  }
  /* Captura solo dos botones de portada; deja intactas las funciones existentes. */
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('button');
    if (!b) return;
    if (b.id === 'inicio-tab-tv') window.__gregotvListaPersonalActiva = false;
    if (b.id === 'prueba-abrir-url' || b.id === 'prueba-abrir-archivo') {
      e.preventDefault(); e.stopImmediatePropagation();
      abrirModal(b.id === 'prueba-abrir-url' ? 'url' : 'archivo');
    }
  }, true);
})();
