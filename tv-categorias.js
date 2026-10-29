/* GregoTV Pruebas: menú de categorías legible y consistente.
   Complementa el select original, que sigue realizando todos los filtros.
   Si este script no se carga, el select nativo continúa disponible. */
(function () {
    'use strict';
    var original = document.getElementById('select-categoria');
    var contenedor = document.getElementById('filtro-categorias');
    if (!original || !contenedor || document.getElementById('gt-cat-trigger')) return;


    // Iconos SVG propios del selector. No se descargan fuentes ni bibliotecas.
    var iconosMenu = {
        lista: [['path',{d:'M9 6h12M9 12h12M9 18h12'}],['circle',{cx:4,cy:6,r:1}],['circle',{cx:4,cy:12,r:1}],['circle',{cx:4,cy:18,r:1}]],
        globo: [['circle',{cx:12,cy:12,r:9}],['path',{d:'M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18'}]],
        ubicacion: [['path',{d:'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z'}],['circle',{cx:12,cy:10,r:2.5}]],
        etiqueta: [['path',{d:'M3 11V4h7l11 11-7 7L3 11Z'}],['circle',{cx:7.5,cy:7.5,r:1}]],
        trofeo: [['path',{d:'M8 21h8M12 17v4M7 4h10v6a5 5 0 0 1-10 0V4ZM7 6H3v2a4 4 0 0 0 4 4M17 6h4v2a4 4 0 0 1-4 4'}]],
        pelicula: [['rect',{x:3,y:3,width:18,height:18,rx:2}],['path',{d:'M7 3v18M17 3v18M3 8h4M3 16h4M17 8h4M17 16h4'}]],
        infantil: [['circle',{cx:12,cy:12,r:9}],['circle',{cx:9,cy:10,r:.6}],['circle',{cx:15,cy:10,r:.6}],['path',{d:'M8 14a4.5 4.5 0 0 0 8 0'}]],
        libro: [['path',{d:'M12 6c-3-2-7-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V5c-3-1-7-1-10 1ZM12 6v15'}]],
        noticias: [['rect',{x:4,y:2,width:16,height:20,rx:2}],['path',{d:'M8 6h8M8 10h8M8 14h3M8 18h8M14 14h2'}]],
        radio: [['rect',{x:3,y:8,width:18,height:12,rx:2}],['path',{d:'M5 8 18 3M7 13h6M7 16h4'}],['circle',{cx:17,cy:15,r:2}]],
        flecha: [['path',{d:'m6 9 6 6 6-6'}]]
    };
    function crearIconoMenu(tipo) {
        var xmlns = 'http://www.w3.org/2000/svg';
        var svg = document.createElementNS(xmlns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', 'gt-cat-icon');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        (iconosMenu[tipo] || iconosMenu.etiqueta).forEach(function (def) {
            var nodo = document.createElementNS(xmlns, def[0]);
            Object.keys(def[1]).forEach(function (k) { nodo.setAttribute(k, String(def[1][k])); });
            svg.appendChild(nodo);
        });
        return svg;
    }
    // Los nombres de categorías M3U pueden comenzar con emojis.
    // Ocultarlos solo en este menú; el valor real del filtro no cambia.
    function nombreVisibleOpcion(texto) {
        return texto.replace(/^\s*(?:(?:[\u2600-\u27BF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|\uD83E[\uDD00-\uDFFF])[\uFE0E\uFE0F\u200D\u20E3]*\s*)+/, '').trim();
    }
    function tipoIconoOpcion(option) {
        if (!option.value) return 'lista';
        if (option.value.indexOf('PAIS:') === 0) return 'ubicacion';
        var nombre = nombreVisibleOpcion(option.textContent).toLocaleLowerCase();
        if (nombre === 'deportes') return 'trofeo';
        if (nombre === 'videoclips') return 'pelicula';
        if (nombre === 'infantil') return 'infantil';
        if (nombre === 'cultura y documentales') return 'libro';
        if (nombre === 'noticias') return 'noticias';
        if (nombre === 'radio con video') return 'radio';
        return 'etiqueta';
    }
    function colocarIconoYTexto(nodo, texto, tipo) {
        nodo.textContent = '';
        nodo.appendChild(crearIconoMenu(tipo));
        var etiqueta = document.createElement('span');
        etiqueta.textContent = texto;
        nodo.appendChild(etiqueta);
    }

    var boton = document.createElement('button');
    boton.type = 'button';
    boton.id = 'gt-cat-trigger';
    boton.className = 'gt-cat-trigger';
    boton.setAttribute('role', 'combobox');
    boton.setAttribute('aria-haspopup', 'listbox');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-controls', 'gt-cat-listbox');
    boton.setAttribute('aria-label', 'Filtrar canales por país o categoría');

    var titulo = document.createElement('span');
    titulo.className = 'gt-cat-trigger-label';
    var flecha = document.createElement('span');
    flecha.className = 'gt-cat-chevron';
    flecha.setAttribute('aria-hidden', 'true');
    flecha.appendChild(crearIconoMenu('flecha'));
    boton.appendChild(titulo);
    boton.appendChild(flecha);

    var popup = document.createElement('div');
    popup.id = 'gt-cat-listbox';
    popup.className = 'gt-cat-popup';
    popup.setAttribute('role', 'listbox');
    popup.setAttribute('aria-label', 'Países y categorías de canales');
    popup.hidden = true;

    var filas = [];
    var indiceActivo = -1;
    var busqueda = '';
    var ultimaTecla = 0;

    function seleccionado() {
        return original.selectedIndex >= 0 ? original.options[original.selectedIndex] : null;
    }

    function sincronizar() {
        var item = seleccionado();
        colocarIconoYTexto(titulo, item ? nombreVisibleOpcion(item.textContent) : 'Todos los canales', item ? tipoIconoOpcion(item) : 'lista');
        boton.setAttribute('aria-expanded', popup.hidden ? 'false' : 'true');
        filas.forEach(function (fila, i) {
            var esta = !!item && fila.valor === item.value;
            fila.nodo.setAttribute('aria-selected', esta ? 'true' : 'false');
            fila.nodo.classList.toggle('gt-cat-elegido', esta);
        });
    }

    function crearFila(option) {
        if (option.disabled) return;
        var n = document.createElement('div');
        n.className = 'gt-cat-opcion';
        n.id = 'gt-cat-opcion-' + filas.length;
        n.setAttribute('role', 'option');
        n.setAttribute('aria-selected', option.selected ? 'true' : 'false');
        var texto = nombreVisibleOpcion(option.textContent);
        colocarIconoYTexto(n, texto, tipoIconoOpcion(option));
        var f = {valor: option.value, texto: texto, nodo: n};
        filas.push(f);
        popup.appendChild(n);
    }

    function reconstruir() {
        var estabaAbierto = !popup.hidden;
        popup.replaceChildren ? popup.replaceChildren() : (popup.textContent = '');
        filas = [];
        Array.prototype.forEach.call(original.children, function (hijo) {
            if (hijo.tagName === 'OPTGROUP') {
                var grupo = document.createElement('div');
                grupo.className = 'gt-cat-grupo';
                grupo.setAttribute('role', 'presentation');
                colocarIconoYTexto(grupo, hijo.label || 'Categorías', hijo.label === 'Países' ? 'globo' : 'etiqueta');
                popup.appendChild(grupo);
                Array.prototype.forEach.call(hijo.children, function (option) {
                    if (option.tagName === 'OPTION') crearFila(option);
                });
            } else if (hijo.tagName === 'OPTION') {
                crearFila(hijo);
            }
        });
        var seleccionadoIndex = filas.findIndex(function (f) { return f.valor === original.value; });
        indiceActivo = seleccionadoIndex >= 0 ? seleccionadoIndex : 0;
        actualizarFoco(false);
        sincronizar();
        if (estabaAbierto) ubicarPopup();
    }

    function actualizarFoco(desplazar) {
        filas.forEach(function (f, i) {
            f.nodo.classList.toggle('gt-cat-activo', i === indiceActivo);
        });
        var activo = filas[indiceActivo];
        if (activo) {
            boton.setAttribute('aria-activedescendant', activo.nodo.id);
            if (desplazar && !popup.hidden) {
                var top = activo.nodo.offsetTop, bottom = top + activo.nodo.offsetHeight;
                if (top < popup.scrollTop) popup.scrollTop = top;
                else if (bottom > popup.scrollTop + popup.clientHeight) popup.scrollTop = bottom - popup.clientHeight;
            }
        } else boton.removeAttribute('aria-activedescendant');
    }

    function ubicarPopup() {
        if (popup.hidden) return;
        var r = boton.getBoundingClientRect();
        var vw = window.innerWidth, vh = window.innerHeight;
        var ancho = Math.max(170, Math.min(r.width, vw - 16));
        var izquierda = Math.max(8, Math.min(r.left, vw - ancho - 8));
        var abajo = vh - r.bottom - 9;
        var arriba = r.top - 9;
        // En móviles compactos puede desplegarse hacia arriba para mostrar
        // categorías legibles, sin desplazar ni ocultar el reproductor.
        var porDebajo = abajo >= 190 || abajo >= arriba;
        var disponible = porDebajo ? abajo : arriba;
        var alto = Math.min(470, Math.max(112, disponible - 3));
        var top = porDebajo ? r.bottom + 3 : r.top - alto - 3;
        if (disponible < 125) {
            alto = Math.max(100, vh - 16);
            top = 8;
        }
        popup.style.left = izquierda + 'px';
        popup.style.top = Math.max(8, Math.min(top, vh - alto - 8)) + 'px';
        popup.style.width = ancho + 'px';
        popup.style.maxHeight = alto + 'px';
    }

    function abrir() {
        if (!filas.length) reconstruir();
        if (!filas.length) return;
        popup.hidden = false;
        boton.classList.add('gt-cat-abierto');
        indiceActivo = Math.max(0, filas.findIndex(function (f) { return f.valor === original.value; }));
        sincronizar();
        ubicarPopup();
        actualizarFoco(true);
    }

    function cerrar(devolverFoco) {
        if (popup.hidden) return;
        popup.hidden = true;
        boton.classList.remove('gt-cat-abierto');
        boton.setAttribute('aria-expanded', 'false');
        boton.removeAttribute('aria-activedescendant');
        busqueda = '';
        if (devolverFoco) boton.focus();
    }

    function elegir(indice) {
        var f = filas[indice];
        if (!f) return;
        original.value = f.valor;
        // El listener original de GregoTV continúa actualizando los canales.
        var evento;
        try { evento = new Event('change', {bubbles: true}); }
        catch (_) {
            evento = document.createEvent('Event');
            evento.initEvent('change', true, false);
        }
        original.dispatchEvent(evento);
        sincronizar();
        cerrar(true);
    }

    boton.addEventListener('click', function () {
        if (popup.hidden) abrir(); else cerrar(false);
    });

    popup.addEventListener('click', function (e) {
        var fila = e.target.closest ? e.target.closest('.gt-cat-opcion') : null;
        if (!fila) return;
        var i = filas.findIndex(function (f) { return f.nodo === fila; });
        if (i >= 0) elegir(i);
    });
    popup.addEventListener('mousemove', function (e) {
        var fila = e.target.closest ? e.target.closest('.gt-cat-opcion') : null;
        if (!fila) return;
        var i = filas.findIndex(function (f) { return f.nodo === fila; });
        if (i >= 0 && i !== indiceActivo) {
            indiceActivo = i;
            actualizarFoco(false);
        }
    });

    boton.addEventListener('keydown', function (e) {
        var k = e.key, n = e.keyCode;
        var abajo = k === 'ArrowDown' || n === 40 || n === 20;
        var arriba = k === 'ArrowUp' || n === 38 || n === 19;
        var confirmar = k === 'Enter' || k === ' ' || n === 13 || n === 23 || n === 66 || n === 32;
        var salir = k === 'Escape' || k === 'Backspace' || n === 27 || n === 8 || n === 4 || n === 10009;
        if (salir && !popup.hidden) {
            e.preventDefault(); e.stopPropagation(); cerrar(true); return;
        }
        if (confirmar) {
            e.preventDefault(); e.stopPropagation();
            if (popup.hidden) abrir(); else elegir(indiceActivo);
            return;
        }
        if (abajo || arriba || k === 'Home' || k === 'End' || k === 'PageDown' || k === 'PageUp') {
            e.preventDefault(); e.stopPropagation();
            if (popup.hidden) abrir();
            else if (filas.length) {
                if (k === 'Home') indiceActivo = 0;
                else if (k === 'End') indiceActivo = filas.length - 1;
                else if (k === 'PageDown') indiceActivo = Math.min(filas.length - 1, indiceActivo + 8);
                else if (k === 'PageUp') indiceActivo = Math.max(0, indiceActivo - 8);
                else indiceActivo = Math.max(0, Math.min(filas.length - 1, indiceActivo + (abajo ? 1 : -1)));
                actualizarFoco(true);
            }
            return;
        }
        if (k === 'Tab' && !popup.hidden) {
            cerrar(false);
            return;
        }
        if (k && k.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
            var ahora = Date.now();
            busqueda = (ahora - ultimaTecla < 900 ? busqueda : '') + k.toLocaleLowerCase();
            ultimaTecla = ahora;
            if (popup.hidden) abrir();
            var i = filas.findIndex(function (f) {
                return f.texto.toLocaleLowerCase().replace(/^[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ]*/, '').indexOf(busqueda) === 0;
            });
            if (i >= 0) { indiceActivo = i; actualizarFoco(true); }
        }
    });

    document.addEventListener('click', function (e) {
        if (!popup.hidden && !popup.contains(e.target) && !boton.contains(e.target)) cerrar(false);
    }, true);
    window.addEventListener('resize', function () { if (!popup.hidden) ubicarPopup(); });
    window.addEventListener('blur', function () { cerrar(false); });
    original.addEventListener('change', sincronizar);

    // Se restaura automáticamente cuando se carga/cambia cualquier lista M3U,
    // sin cambiar el motor de filtrado ni requerir llamadas desde otros scripts.
    if (window.MutationObserver) {
        new MutationObserver(reconstruir).observe(original, {childList:true,subtree:true,characterData:true});
    }

    contenedor.appendChild(boton);
    document.body.appendChild(popup);
    reconstruir();
    original.setAttribute('aria-hidden', 'true');
    original.tabIndex = -1;
    contenedor.classList.add('gt-cat-mejorado');
    window.GregoTVCategorias = {enfocar: function () { boton.focus(); }, cerrar: function () { cerrar(false); }};
})();
