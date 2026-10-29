
        let canales = [];
        let canalesFiltrados = [];
        let elementosCanal = new Map();
        let ultimaSeleccionTV = 0;
        let categoriaActual = "";
        let canalSeleccionado = null;
        let modoLimpieza = false;
        let hls = null;
        let promesaBibliotecaHLS = null;
        function asegurarBibliotecaHLS() {
            if (typeof window.Hls !== 'undefined') return Promise.resolve(true);
            if (!promesaBibliotecaHLS) {
                promesaBibliotecaHLS = new Promise(resolve => {
                    const script = document.createElement('script');
                    script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.13';
                    script.async = true;
                    script.onload = () => resolve(typeof window.Hls !== 'undefined');
                    script.onerror = () => resolve(false);
                    document.head.appendChild(script);
                });
            }
            return promesaBibliotecaHLS;
        }

        let audioCtx = null;
        let compressorNode = null;
        let sourceNode = null;
        let gainNode = null, analyserNode = null, audioInterval = null;
        let vozNode = null, gravesNode = null;
        let audioSeguroParaCanal = false;
        let videoActivo = null;
        let temporizadorVigilancia = null;
        let ultimoProgresoMedios = 0;
        let momentoCargaSesion = 0;
        let ultimaPosicionVideo = -1;
        let reintentoPorBloqueo = false;
        let nivelSuavizado = 0.12;
        let reproduccionId = 0, reintentosHls = 0, temporizadorReintento = null;

        let timerInactividad = null;
        let estaEnModoCine = false;
        const TIEMPO_MODO_CINE = 10000;

        let canalEditandoIndex = -1;
        let canalesSeleccionados = [];
        let canalAncla = null;

        let timerContadorCarga = null;
        let inicioCarga = 0;
        let segundosCarga = 0;
        // Vigilancia separada del contador inicial de carga (solo HLS/MP4).
        const DEMORA_AVISO_INTERRUPCION = 10000;
        const DEMORA_REINTENTO_INTERRUPCION = 30000;
        const DEMORA_ERROR_INTERRUPCION = 75000;
        let temporizadorAvanceVideo = null;
        let videoVigilado = null;
        let callbackFotogramaVideo = null;
        let detectadoFotograma = false;
        let ultimoAvanceImagen = 0;
        let ultimaPosicionVigilada = NaN;
        let estadoReproduccion = 'sin_canal'; // sin_canal | cargando | reproduciendo | youtube | error

        // Solo controla la pausa/reanudación de YouTube. Si la API no está
        // disponible, el video sigue usando el iframe y el menú sigue funcionando.
        let reproductorYouTube = null;
        let youtubeApiLista = false;
        let promesaAPIYouTube = null;

        const pantallaBienvenida = document.getElementById('pantalla-bienvenida');
        const pantallaPrincipal = document.getElementById('pantalla-principal');
        const btnCargarUrl = document.getElementById('btn-cargar-url');
        const inputUrlLista = document.getElementById('input-url-lista');
        const fileInputLocal = document.getElementById('file-input-local');
        const fileInputCombinar = document.getElementById('file-input-combinar');
        const mensajeError = document.getElementById('mensaje-error');

        const btnAgregarCanal = document.getElementById('btn-agregar-canal');
        const btnGuardar = document.getElementById('btn-guardar');
        const btnVolver = document.getElementById('btn-volver');

        const btnCombinarLista = document.getElementById('btn-combinar-lista');
        const btnBorrarSeleccionados = document.getElementById('btn-borrar-seleccionados');
        const contadorSeleccionados = document.getElementById('contador-seleccionados');

        const selectCategoria = document.getElementById('select-categoria');
        const inputBuscar = document.getElementById('input-buscar');
        const listaCanales = document.getElementById('lista-canales');
        const totalCanales = document.getElementById('total-canales');

        const mensajeSinVideo = document.getElementById('mensaje-sin-video');
        const avisoRecuperacion = document.getElementById('gt-aviso-recuperacion');
        const videoNativo = document.getElementById('video-nativo');
        const videoProcesado = document.getElementById('video-procesado');
        videoActivo = videoNativo;
        const contenedorYoutube = document.getElementById('contenedor-youtube');
        // En algunos navegadores el inicio automático puede ser bloqueado.
        // No se añade un segundo botón: se conservan los controles nativos
        // y la cuenta progresiva, ambos en su sitio habitual.
        function pedirInicioManual() {
            if (estadoReproduccion !== 'cargando') return;
            videoActivo.style.display = 'block';
            mensajeSinVideo.style.display = 'flex';
        }


        const barraSuperior = document.getElementById('barra-superior');
        const contenedorPrincipal = document.getElementById('contenedor-principal');

        const modalCanal = document.getElementById('modal-canal');
        const tituloModalCanal = document.getElementById('titulo-modal-canal');
        const inputNombreCanal = document.getElementById('input-nombre-canal');
        const inputCategoriaCanal = document.getElementById('input-categoria-canal');
        const inputUrlCanal = document.getElementById('input-url-canal');
        const btnGuardarCanal = document.getElementById('btn-guardar-canal');
        const btnCancelarCanal = document.getElementById('btn-cancelar-canal');

        function switchTab(tab) {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.input-area').forEach(a => a.classList.remove('active'));

            if (tab === 'local') {
                document.querySelector('.tab-btn:nth-child(1)').classList.add('active');
                document.getElementById('tab-local').classList.add('active');
            } else {
                document.querySelector('.tab-btn:nth-child(2)').classList.add('active');
                document.getElementById('tab-url').classList.add('active');
            }
        }

        function mostrarError(msg) {
            mensajeError.textContent = '⚠️ ' + msg;
            mensajeError.style.display = 'block';
            setTimeout(() => { mensajeError.style.display = 'none'; }, 8000);
        }

        // Un único panel de estado para todas las fases: carga, error y espera.
        function mostrarEstadoVideo(texto, estado = 'error') {
            detenerContadorCarga();
            cancelarVigilanciaAvanceVideo();
            establecerEstadoReproduccion(estado);
            mensajeSinVideo.textContent = texto;
            mensajeSinVideo.style.display = 'flex';
        }

        function iniciarContadorCarga() {
            detenerContadorCarga();
            establecerEstadoReproduccion('cargando');
            inicioCarga = performance.now();
            segundosCarga = 0;
            mensajeSinVideo.innerHTML =
                '<div class="fila-carga"><span class="spinner-carga" aria-hidden="true"></span>' +
                '<span id="segundos-carga">0 s</span></div>' +
                '<div class="aviso-espera" id="aviso-espera">' +
                'El canal tarda más de lo normal. Podés seguir esperando o elegir otro de la lista.</div>';
            mensajeSinVideo.style.display = 'flex';
            function actualizar() {
                if (estadoReproduccion !== 'cargando') return;
                const transcurridos = Math.max(0, Math.floor((performance.now() - inicioCarga) / 1000));
                if (transcurridos === segundosCarga) return;
                segundosCarga = transcurridos;
                const contador = document.getElementById('segundos-carga');
                if (contador) contador.textContent = `${segundosCarga} s`;
                if (segundosCarga >= 15) {
                    const aviso = document.getElementById('aviso-espera');
                    if (aviso) aviso.style.display = 'block';
                }
            }
            // El tiempo se calcula con reloj monotónico para evitar desvíos si
            // el navegador limita los intervalos al estar en segundo plano.
            timerContadorCarga = setInterval(actualizar, 250);
        }

        function detenerContadorCarga() {
            if (timerContadorCarga !== null) {
                clearInterval(timerContadorCarga);
                timerContadorCarga = null;
            }
        }

        // Se comprueba el avance de imágenes, no solo los avisos de red.
        // En navegadores nuevos se observan fotogramas reales; en TV Box
        // antiguos se usa el progreso temporal del video como alternativa.
        function ocultarAvisoRecuperacion() {
            if (!avisoRecuperacion.hidden) {
                avisoRecuperacion.hidden = true;
                if (estadoReproduccion === 'reproduciendo') iniciarTimerModoCine();
            }
        }

        function cancelarVigilanciaAvanceVideo() {
            if (temporizadorAvanceVideo !== null) {
                clearInterval(temporizadorAvanceVideo);
                temporizadorAvanceVideo = null;
            }
            if (videoVigilado && callbackFotogramaVideo !== null &&
                typeof videoVigilado.cancelVideoFrameCallback === 'function') {
                try { videoVigilado.cancelVideoFrameCallback(callbackFotogramaVideo); }
                catch (_) { /* Dispositivos sin cancelación compatible. */ }
            }
            videoVigilado = null;
            callbackFotogramaVideo = null;
            detectadoFotograma = false;
            ultimaPosicionVigilada = NaN;
            avisoRecuperacion.hidden = true;
        }

        function marcarAvanceImagen() {
            ultimoAvanceImagen = performance.now();
            reintentoPorBloqueo = false;
            ocultarAvisoRecuperacion();
        }

        function comprobarAvanceImagen() {
            const video = videoVigilado;
            if (!video || video !== videoActivo || !canalSeleccionado ||
                canalSeleccionado.tipo === 'youtube' ||
                estadoReproduccion !== 'reproduciendo') {
                ocultarAvisoRecuperacion();
                return;
            }

            // Pausa manual, fin del video o pestaña en segundo plano: no
            // interpretar la detención como fallo del servidor.
            if (video.paused || video.ended || document.hidden) {
                ultimoAvanceImagen = performance.now();
                ultimaPosicionVigilada = Number(video.currentTime);
                ocultarAvisoRecuperacion();
                return;
            }

            // Si no existe seguimiento de fotogramas, comprobar currentTime.
            // Con fotogramas disponibles se prioriza su avance real.
            if (!detectadoFotograma) {
                const posicion = Number(video.currentTime);
                if (Number.isFinite(posicion) &&
                    (!Number.isFinite(ultimaPosicionVigilada) ||
                     Math.abs(posicion - ultimaPosicionVigilada) > 0.08)) {
                    marcarAvanceImagen();
                }
                ultimaPosicionVigilada = posicion;
            }

            if (performance.now() - ultimoAvanceImagen >= DEMORA_AVISO_INTERRUPCION) {
                if (avisoRecuperacion.hidden) {
                    avisoRecuperacion.hidden = false;
                    if (timerInactividad) { clearTimeout(timerInactividad); timerInactividad = null; }
                    if (estaEnModoCine) {
                        estaEnModoCine = false;
                        contenedorPrincipal.classList.remove('modo-cine');
                        barraSuperior.classList.remove('oculto');
                    }
                }
            } else {
                ocultarAvisoRecuperacion();
            }
        }

        function iniciarVigilanciaAvanceVideo(video) {
            cancelarVigilanciaAvanceVideo();
            videoVigilado = video;
            ultimoAvanceImagen = performance.now();
            ultimaPosicionVigilada = Number(video.currentTime);
            detectadoFotograma = false;

            if (typeof video.requestVideoFrameCallback === 'function') {
                const sesion = reproduccionId;
                const alMostrarFotograma = () => {
                    if (sesion !== reproduccionId || videoVigilado !== video ||
                        videoActivo !== video || estadoReproduccion !== 'reproduciendo') return;
                    detectadoFotograma = true;
                    if (!video.paused) marcarAvanceImagen();
                    try { callbackFotogramaVideo = video.requestVideoFrameCallback(alMostrarFotograma); }
                    catch (_) { callbackFotogramaVideo = null; }
                };
                try { callbackFotogramaVideo = video.requestVideoFrameCallback(alMostrarFotograma); }
                catch (_) { callbackFotogramaVideo = null; }
            }
            temporizadorAvanceVideo = setInterval(comprobarAvanceImagen, 1000);
        }

        // Volver desde otra aplicación o pestaña no constituye por sí mismo
        // una interrupción del servidor: reiniciar la comprobación al regresar.
        document.addEventListener('visibilitychange', () => {
            if (videoVigilado && estadoReproduccion === 'reproduciendo') {
                ultimoAvanceImagen = performance.now();
                ultimaPosicionVigilada = Number(videoVigilado.currentTime);
                ocultarAvisoRecuperacion();
            }
        });

        // Una sola regla para importación y edición de canales.
        function separarNombreYPais(nombreBruto) {
            const nombre = nombreBruto.trim();
            const separador = nombre.indexOf(' - ');
            const pais = separador > 0 ? nombre.slice(0, separador).trim() : 'Desconocido';
            return { nombre, pais: pais || 'Desconocido' };
        }

        // Logotipos en listas M3U. Se admiten solamente imágenes HTTPS públicas;
        // una dirección con credenciales nunca se utiliza para cargar imágenes.
        function urlSeguraLogo(valor) {
            if (!valor || typeof valor !== 'string') return '';
            try {
                const u = new URL(valor.trim(), location.href);
                if (u.protocol !== 'https:' || u.username || u.password) return '';
                const claves = Array.from(u.searchParams.keys());
                if (claves.some(k => /^(?:token|access_token|auth|authorization|api_?key|password|passwd|user(?:name)?|secret|signature|sig|key|session|jwt)$/i.test(k))) return '';
                return u.href;
            } catch (_) { return ''; }
        }

        function extraerCanalesDeM3U(contenido) {
            if (typeof contenido !== 'string' || !contenido.trim()) return [];
            const lineas = contenido.split('\n');
            const nuevos = [];
            for (let i = 0; i < lineas.length; i++) {
                const linea = lineas[i].trim();
                if (linea.startsWith('#EXTINF:')) {
                    let grupo = "Sin categoría";
                    const matchGrupo = linea.match(/group-title="([^"]*)"/);
                    if (matchGrupo && matchGrupo[1]) grupo = matchGrupo[1];
                    const matchLogo = linea.match(/\btvg-logo\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s,]+))/i);
                    const logo = matchLogo ? urlSeguraLogo(matchLogo[1] || matchLogo[2] || matchLogo[3] || '') : '';

                    const nombreBruto = linea.slice(linea.lastIndexOf(',') + 1).trim();

                    const { nombre, pais } = separarNombreYPais(nombreBruto);

                    let url = '';
                    for (let j = i + 1; j < lineas.length; j++) {
                        const siguiente = lineas[j].trim();
                        if (siguiente.startsWith('#EXTINF:')) break;
                        if (siguiente && !siguiente.startsWith('#')) { url = siguiente; i = j; break; }
                    }
                    // Los enlaces que el navegador no puede abrir no se incorporan.
                    if (nombre && /^https?:\/\//i.test(url)) {
                        nuevos.push({ nombre, url, tipo: detectarTipo(url), categoria: grupo, pais, logo });
                    }
                }
            }
            return nuevos;
        }

        // FASE 4: perfil conservador, idéntico al utilizado en las fases 1-3.
        const perfilCineMovilHorizontal = window.matchMedia(
            'screen and (orientation: landscape) and (max-width: 1000px) and (max-height: 520px) and (pointer: coarse) and (hover: none)'
        );
        function esCineMovilHorizontal() { return perfilCineMovilHorizontal.matches; }
        function fullscreenRealActivo() {
            return Boolean(document.fullscreenElement || document.webkitFullscreenElement);
        }
        // Modo cine: 10 segundos de inactividad tanto en móvil fullscreen
        // como en PC y TV Box (TIEMPO_MODO_CINE).
        function demoraModoCine() {
            return esCineMovilHorizontal() && fullscreenRealActivo() ? 10000 : TIEMPO_MODO_CINE;
        }
        function restaurarCineMovilAlSalirFullscreen() {
            if (!esCineMovilHorizontal()) return;
            if (timerInactividad) clearTimeout(timerInactividad);
            timerInactividad = null;
            estaEnModoCine = false;
            contenedorPrincipal.classList.remove('modo-cine');
            barraSuperior.classList.remove('oculto');
            iniciarTimerModoCine();
        }

        function iniciarTimerModoCine() {
            if (timerInactividad) clearTimeout(timerInactividad);
            if (canalSeleccionado && !modoLimpieza &&
                (estadoReproduccion === 'reproduciendo' || estadoReproduccion === 'youtube')) {
                timerInactividad = setTimeout(() => { activarModoCine(); }, demoraModoCine());
            }
        }

        function activarModoCine() {
            if (modoLimpieza || (estadoReproduccion !== 'reproduciendo' && estadoReproduccion !== 'youtube')) return;
            estaEnModoCine = true;
            contenedorPrincipal.classList.add('modo-cine');
            barraSuperior.classList.add('oculto');
        }

        function desactivarModoCine() {
            if (!estaEnModoCine) return;
            estaEnModoCine = false;
            contenedorPrincipal.classList.remove('modo-cine');
            barraSuperior.classList.remove('oculto');
            iniciarTimerModoCine();
        }

        function resetearActividad() {
            if (modoLimpieza) return;
            if (estaEnModoCine) desactivarModoCine();
            else iniciarTimerModoCine();
        }

        document.addEventListener('mousemove', resetearActividad);
        document.addEventListener('touchstart', resetearActividad, { passive: true });

        // YouTube se reproduce en un iframe de otro dominio. La capa
        // transparente mantiene la navegación de GregoTV. La API oficial
        // únicamente permite pausar/reanudar sin tocar el interior del iframe.
        function cargarAPIYouTube() {
            if (window.YT && typeof window.YT.Player === 'function') return Promise.resolve(window.YT);
            if (promesaAPIYouTube) return promesaAPIYouTube;
            promesaAPIYouTube = new Promise((resolver, rechazar) => {
                // La API llama a esta función cuando está lista.
                window.onYouTubeIframeAPIReady = () => {
                    if (window.YT && typeof window.YT.Player === 'function') resolver(window.YT);
                    else rechazar(new Error('API de YouTube no disponible'));
                };
                const script = document.createElement('script');
                script.src = 'https://www.youtube.com/iframe_api';
                script.async = true;
                script.onerror = () => rechazar(new Error('No se pudo cargar la API de YouTube'));
                document.head.appendChild(script);
            }).catch(error => {
                promesaAPIYouTube = null;
                throw error;
            });
            return promesaAPIYouTube;
        }

        function alternarPausaYouTube() {
            // Importante: los clics no deben impedir abrir el menú lateral.
            resetearActividad();
            if (!canalSeleccionado || canalSeleccionado.tipo !== 'youtube' ||
                !youtubeApiLista || !reproductorYouTube) return;
            try {
                const estado = reproductorYouTube.getPlayerState();
                // 1 = reproduciendo, 3 = almacenando en búfer.
                if (estado === 1 || estado === 3) reproductorYouTube.pauseVideo();
                else reproductorYouTube.playVideo();
            } catch (error) {
                console.warn('No se pudo alternar pausa de YouTube:', error);
            }
        }

        function desvincularYouTube() {
            youtubeApiLista = false;
            if (!reproductorYouTube) return;
            const anterior = reproductorYouTube;
            reproductorYouTube = null;
            try { anterior.destroy(); } catch (error) {
                console.warn('No se pudo liberar el reproductor YouTube:', error);
            }
        }

        document.addEventListener('keydown', (e) => {
            // Escape/Atrás termina la edición incluso si hay botones enfocados.
            const esCampoTexto = /^(INPUT|TEXTAREA)$/.test(e.target.tagName);
            const volverControl = (e.key === 'Backspace' || e.keyCode === 8 || e.keyCode === 4) && !esCampoTexto;
            if (e.key === 'Escape' || e.keyCode === 27 || e.keyCode === 10009 || volverControl) {
                if (modalCanal.style.display === 'flex') { e.preventDefault(); cerrarModalCanal(); return; }
                if (modoLimpieza) { e.preventDefault(); alternarModoLimpieza(); return; }
            }
            const tagName = e.target.tagName.toLowerCase();
            if (['input','textarea','select','button'].includes(tagName) || e.target.isContentEditable) return;

            if (e.code === 'Space' || e.key === ' ') {
                e.preventDefault();
                resetearActividad();
                if (canalSeleccionado && (canalSeleccionado.tipo === 'hls' || canalSeleccionado.tipo === 'mp4')) {
                    if (videoActivo.paused) videoActivo.play().catch(() => {});
                    else videoActivo.pause();
                } else if (canalSeleccionado && canalSeleccionado.tipo === 'youtube') {
                    alternarPausaYouTube();
                }
            } else {
                resetearActividad();
            }
        });

        function manejarCambioFullscreen() {
            if (esCineMovilHorizontal()) {
                if (fullscreenRealActivo()) {
                    if (timerInactividad) clearTimeout(timerInactividad);
                    timerInactividad = null;
                    estaEnModoCine = false;
                    contenedorPrincipal.classList.remove('modo-cine');
                    barraSuperior.classList.remove('oculto');
                    iniciarTimerModoCine();
                } else restaurarCineMovilAlSalirFullscreen();
                return;
            }
            if (!modoLimpieza && !estaEnModoCine) iniciarTimerModoCine();
        }
        document.addEventListener('fullscreenchange', manejarCambioFullscreen);
        document.addEventListener('webkitfullscreenchange', manejarCambioFullscreen);

        let numeroSolicitudLista = 0;
        async function cargarListaDesdeURL(url) {
            if (!url || !url.trim()) { mostrarError('Por favor ingresa una URL válida.'); return; }
            url = url.trim();
            const numeroSolicitud = ++numeroSolicitudLista;
            if (url.includes('github.com') && url.includes('/blob/')) {
                url = url.replace('github.com', 'raw.githubusercontent.com').replace('/blob/', '/');
            }
            try {
                const response = await fetch(url, { cache: 'no-cache' });
                if (!response.ok) throw new Error(`Error HTTP: ${response.status}`);
                const contenido = await response.text();
                if (numeroSolicitud !== numeroSolicitudLista) return false;
                if (!contenido.includes('#EXTINF') && !contenido.includes('.m3u8') && !contenido.includes('youtube')) {
                    throw new Error('El contenido descargado no parece ser una lista M3U válida.');
                }
                return procesarListaM3U(contenido);
            } catch (err) {
                if (numeroSolicitud !== numeroSolicitudLista) return false;
                console.error(err);
                let msg = 'No se pudo cargar la lista. ';
                if (err.message.includes('Failed to fetch') || err.message.includes('NetworkError')) {
                    msg += 'Posible bloqueo CORS. Asegúrate de usar la URL "Raw" (raw.githubusercontent.com).';
                } else { msg += err.message; }
                mostrarError(msg);
                return false;
            }
        }

        btnCargarUrl.addEventListener('click', () => cargarListaDesdeURL(inputUrlLista.value));
        inputUrlLista.addEventListener('keypress', (e) => { if (e.key === 'Enter') cargarListaDesdeURL(inputUrlLista.value); });

        fileInputLocal.addEventListener('change', (e) => {
            const archivo = e.target.files[0];
            if (!archivo) return;
            const lector = new FileReader();
            lector.onload = (evento) => {
                procesarListaM3U(evento.target.result);
            };
            lector.onerror = () => mostrarError('Error al leer el archivo.');
            try { lector.readAsText(archivo); } catch (e) { mostrarError('Error al leer el archivo.'); }
        });

        btnCombinarLista.addEventListener('click', () => {
            fileInputCombinar.click();
        });

        fileInputCombinar.addEventListener('change', (e) => {
            const archivo = e.target.files[0];
            if (!archivo) return;
            const lector = new FileReader();
            lector.onload = (evento) => {
                const nuevosCanales = extraerCanalesDeM3U(evento.target.result);
                if (nuevosCanales.length === 0) {
                    mostrarError('No se encontraron canales válidos en la lista a combinar.');
                    return;
                }
                const existentes = new Set(canales.map(c => c.url));
                canales = canales.concat(nuevosCanales.filter(c => {
                    if (existentes.has(c.url)) return false;
                    existentes.add(c.url);
                    return true;
                }));
                actualizarSelectCategorias();
                aplicarFiltros();
            };
            lector.onerror = () => mostrarError('Error al leer el archivo para combinar.');
            try { lector.readAsText(archivo); } catch (e) { mostrarError('Error al leer el archivo para combinar.'); }
            fileInputCombinar.value = '';
        });

        function procesarListaM3U(contenido) {
            numeroSolicitudLista++;
            const candidatos = extraerCanalesDeM3U(contenido);
            if (!candidatos.length) {
                mostrarError('No se encontraron canales válidos. Conservamos la lista anterior.');
                return false;
            }
            detenerReproduccion();
            canales = candidatos;
            actualizarSelectCategorias();

            canalesSeleccionados = [];
            canalAncla = null;
            categoriaActual = "";
            selectCategoria.value = "";

            aplicarFiltros();
            mostrarPantallaPrincipal();
            return true;
        }

        function actualizarSelectCategorias() {
            const categorias = [...new Set(canales.map(c => c.categoria))].filter(cat => cat !== "Sin categoría").sort();
            const paises = [...new Set(canales.map(c => c.pais))].filter(p => p && p !== "Desconocido").sort();

            selectCategoria.innerHTML = '<option value="">Todos los canales</option>';

            if (paises.length > 0) {
                const grupoPaises = document.createElement('optgroup');
                grupoPaises.label = 'Países';
                paises.forEach(pais => {
                    const opt = document.createElement('option');
                    opt.value = 'PAIS:' + pais;
                    opt.textContent = pais;
                    grupoPaises.appendChild(opt);
                });
                selectCategoria.appendChild(grupoPaises);
            }

            if (categorias.length > 0) {
                const grupoCat = document.createElement('optgroup');
                grupoCat.label = 'Categorías';
                categorias.forEach(cat => {
                    const opt = document.createElement('option');
                    opt.value = cat;
                    opt.textContent = cat;
                    grupoCat.appendChild(opt);
                });
                selectCategoria.appendChild(grupoCat);
            }
        }

        function aplicarFiltros() {
            let resultado = canales;

            if (categoriaActual) {
                if (categoriaActual.startsWith('PAIS:')) {
                    const paisBuscado = categoriaActual.replace('PAIS:', '');
                    resultado = resultado.filter(c => c.pais === paisBuscado);
                } else {
                    resultado = resultado.filter(c => c.categoria === categoriaActual);
                }
            }

            const texto = inputBuscar.value.toLowerCase();
            if (texto) {
                resultado = resultado.filter(c => c.nombre.toLowerCase().includes(texto));
            }

            canalesFiltrados = resultado;
            renderizarLista();
        }

        selectCategoria.addEventListener('change', (e) => {
            categoriaActual = e.target.value;
            aplicarFiltros();
        });

        // Evitar reconstruir la lista completa al pulsar cada tecla.
        let temporizadorBusqueda = null;
        inputBuscar.addEventListener('input', () => {
            if (temporizadorBusqueda !== null) clearTimeout(temporizadorBusqueda);
            temporizadorBusqueda = setTimeout(() => {
                temporizadorBusqueda = null;
                aplicarFiltros();
            }, 140);
        });

        function detectarTipo(url) {
            if (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('youtube-nocookie.com')) return 'youtube';
            if (url.includes('.mp4')) return 'mp4';
            return 'hls';
        }

        function mostrarPantallaPrincipal() {
            pantallaBienvenida.style.display = 'none';
            pantallaPrincipal.style.display = 'flex';
        }

        function mostrarPantallaBienvenida() {
            detenerReproduccion();
            const saliaDeAdministracion = modoLimpieza;
            if (modoLimpieza) alternarModoLimpieza();
            pantallaPrincipal.style.display = 'none';
            pantallaBienvenida.style.display = 'flex';
            if (timerInactividad) clearTimeout(timerInactividad);
            if (saliaDeAdministracion) document.getElementById('gregotv-boton-configuracion').focus();
        }

        btnVolver.addEventListener('click', mostrarPantallaBienvenida);
        // El panel conserva solo acciones propias de administración.
        document.getElementById('gt-admin-nav-home').addEventListener('click', function(){ btnVolver.click(); });

        // La ruedita abre el modo de administración sobre la lista original.
        const botonConfiguracion = document.getElementById('gregotv-boton-configuracion');
        const direccionListaOriginal = inputUrlLista.defaultValue;
        let administracionAbriendose = false;
        async function abrirAdministracionDesdeInicio() {
            if (administracionAbriendose) return;
            administracionAbriendose = true;
            botonConfiguracion.disabled = true;
            try {
                const cargada = await cargarListaDesdeURL(direccionListaOriginal);
                if (!cargada) {
                    alert('No se pudo abrir la administración. Revisá la conexión y volvé a intentarlo.');
                    return;
                }
                window.__gregotvListaPersonalActiva = false;
                if (!modoLimpieza) alternarModoLimpieza();
                btnAgregarCanal.focus();
            } catch (_) {
                alert('No se pudo abrir la administración. Probá nuevamente.');
            } finally {
                botonConfiguracion.disabled = false;
                administracionAbriendose = false;
                if (pantallaBienvenida.style.display !== 'none') botonConfiguracion.focus();
            }
        }
        botonConfiguracion.addEventListener('click', abrirAdministracionDesdeInicio);
        botonConfiguracion.addEventListener('keydown', function (e) {
            // OK en controles Android TV/TV Box sin evento click nativo.
            if ((e.keyCode === 23 || e.keyCode === 66 ||
                (e.keyCode === 13 && e.key !== 'Enter')) &&
                e.key !== 'Enter' && e.key !== ' ') {
                e.preventDefault(); botonConfiguracion.click();
            }
        });
        // Flechas del control remoto para alcanzar la ruedita desde el inicio.
        document.addEventListener('keydown', function (e) {
            const cine = document.getElementById('inicio-contenido-cine');
            if (pantallaBienvenida.style.display === 'none' || cine.style.display !== 'none') return;
            if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
            const k=e.keyCode;
            const direccion = (e.key==='ArrowDown'||k===40||k===20)?'down':
                              (e.key==='ArrowUp'||k===38||k===19)?'up':
                              (e.key==='ArrowLeft'||k===37||k===21)?'left':
                              (e.key==='ArrowRight'||k===39||k===22)?'right':null;
            if (!direccion) return;
            const botones=Array.from(document.querySelectorAll(
              '#inicio-tab-tv, #inicio-tab-cine, #prueba-abrir-url, #prueba-abrir-archivo, #gregotv-boton-configuracion'
            )).filter(b=>{const t=b.getBoundingClientRect();return t.width>0&&t.height>0&&!b.disabled});
            if(!botones.length) return;
            if(!botones.includes(document.activeElement)){
                e.preventDefault();botones[0].focus();return;
            }
            const r=document.activeElement.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
            let siguiente=null,mejor=Infinity;
            botones.forEach(b=>{
                if(b===document.activeElement)return;
                const t=b.getBoundingClientRect(),dx=t.left+t.width/2-cx,dy=t.top+t.height/2-cy;
                if(!((direccion==='down'&&dy>7)||(direccion==='up'&&dy< -7)||
                     (direccion==='right'&&dx>7)||(direccion==='left'&&dx< -7)))return;
                const horizontal=direccion==='right'||direccion==='left';
                const distancia=(horizontal?Math.abs(dx):Math.abs(dy))+2.6*(horizontal?Math.abs(dy):Math.abs(dx));
                if(distancia<mejor){mejor=distancia;siguiente=b}
            });
            if(siguiente){e.preventDefault();siguiente.focus()}
        });
        // Navegación compartida: no se crea otro reproductor ni otro catálogo.
        document.getElementById('gt-tv-tab-television').addEventListener('click', function () {
            if (modoLimpieza) alternarModoLimpieza();
            if (window.GregoTVCategorias) window.GregoTVCategorias.enfocar();
            else selectCategoria.focus();
        });
        document.getElementById('gt-tv-tab-cine').addEventListener('click', function () {
            btnVolver.click();
            document.getElementById('inicio-tab-cine').click();
        });


        function handleDragStart(e) {
            e.target.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', e.target.dataset.index);
        }
        function handleDragEnd(e) {
            e.target.classList.remove('dragging');
            document.querySelectorAll('.canal-item').forEach(item => item.classList.remove('drag-over'));
        }
        function handleDragOver(e) { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }
        function handleDragLeave(e) { e.currentTarget.classList.remove('drag-over'); }
        function handleDrop(e) {
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over');
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(e.currentTarget.dataset.index);
            if (fromIndex !== toIndex && fromIndex >= 0 && toIndex >= 0) {
                if (categoriaActual || inputBuscar.value.trim()) {
                    mostrarError('Para reordenar, desactiva primero los filtros de categoría o búsqueda.');
                    return;
                }

                const item = canales.splice(fromIndex, 1)[0];
                canales.splice(toIndex, 0, item);

                aplicarFiltros();
            }
        }

        function actualizarContadorSeleccion() {
            contadorSeleccionados.textContent = canalesSeleccionados.length;
            btnBorrarSeleccionados.style.display = canalesSeleccionados.length > 0 ? 'inline-block' : 'none';
        }

        function actualizarCanalSeleccionadoVisualmente() {
            for (const item of listaCanales.querySelectorAll('.canal-item.seleccionado')) {
                item.classList.remove('seleccionado');
            }
            const actual = elementosCanal.get(canalSeleccionado);
            if (actual) actual.classList.add('seleccionado');
        }

        // Iconos reutilizados para Editar y Quitar en todas las plataformas.
        const ICONO_EDITAR_CANAL = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="m15 5 4 4"/><path d="M4 20l4.5-1 11-11a2.12 2.12 0 0 0-3-3l-11 11L4 20Z"/></svg>';
        const ICONO_QUITAR_CANAL = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false"><path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/><path d="M10 10v7M14 10v7"/></svg>';
        // Listas extensas por tandas. Administración conserva todos los canales.
        const TAMANO_LOTE_CANALES = 120;
        let siguienteCanalPorMostrar = 0;
        let indicePorCanal = null;
        function agregarLoteCanales() {
            if (siguienteCanalPorMostrar >= canalesFiltrados.length) return;
            const fragmento = document.createDocumentFragment();
            const hasta = modoLimpieza
                ? canalesFiltrados.length
                : Math.min(siguienteCanalPorMostrar + TAMANO_LOTE_CANALES, canalesFiltrados.length);
            for (let indice = siguienteCanalPorMostrar; indice < hasta; indice++) {
                const canal = canalesFiltrados[indice];
                const item = document.createElement('div');
                item.className = 'canal-item';
                if (canal.tipo === 'youtube') item.classList.add('gt-es-youtube');
                item.tabIndex = 0;
                item.setAttribute('role', 'button');
                item.setAttribute('aria-label', 'Reproducir ' + canal.nombre);
                item.addEventListener('keydown', e => {
                    if (e.target !== item) return;
                    if ((e.key === 'ArrowDown' || e.keyCode === 40 || e.keyCode === 20)
                        && indice >= siguienteCanalPorMostrar - 6) agregarLoteCanales();
                    // En televisores el control remoto suele informar keyCode 13,
                    // aunque e.key no sea "Enter". Mantener también el mouse.
                    if (e.key === 'Enter' || e.keyCode === 13 || e.which === 13) {
                        e.preventDefault();
                        // Evitar que ciertos controles generen selección doble
                        // (keydown seguido por un click sintético).
                        if (Date.now() - ultimaSeleccionTV < 300) return;
                        ultimaSeleccionTV = Date.now();
                        item.click();
                    }
                });
                if (canalSeleccionado === canal) item.classList.add('seleccionado');
                if (canalesSeleccionados.includes(canal)) item.classList.add('seleccion-borrado');

                if (modoLimpieza && !categoriaActual && !inputBuscar.value.trim()) {
                    item.classList.add('draggable');
                    item.draggable = true;
                    item.dataset.index = indicePorCanal.get(canal);
                    item.addEventListener('dragstart', handleDragStart);
                    item.addEventListener('dragend', handleDragEnd);
                    item.addEventListener('dragover', handleDragOver);
                    item.addEventListener('dragleave', handleDragLeave);
                    item.addEventListener('drop', handleDrop);
                    item.addEventListener('mousedown', (e) => { if (e.shiftKey) e.preventDefault(); });
                }

                const dragHandle = document.createElement('span');
                dragHandle.className = 'drag-handle';
                dragHandle.textContent = '⠿';
                dragHandle.title = 'Arrastrar para reordenar';

                const nombreSpan = document.createElement('span');
                nombreSpan.className = 'canal-nombre';
                nombreSpan.textContent = canal.nombre;

                // Si hay una imagen válida, reemplaza el icono GregoTV del canal.
                // Al fallar la imagen, vuelve al icono de respaldo sin afectar nada más.
                const direccionLogo = urlSeguraLogo(canal.logo);
                if (direccionLogo) {
                    const imagenLogo = document.createElement('img');
                    imagenLogo.className = 'gt-logo-canal';
                    imagenLogo.alt = '';
                    imagenLogo.setAttribute('aria-hidden', 'true');
                    imagenLogo.loading = 'lazy';
                    imagenLogo.decoding = 'async';
                    imagenLogo.referrerPolicy = 'no-referrer';
                    imagenLogo.addEventListener('error', function () {
                        item.classList.remove('gt-con-logo');
                        imagenLogo.remove();
                    }, {once:true});
                    imagenLogo.src = direccionLogo;
                    item.classList.add('gt-con-logo');
                    item.appendChild(imagenLogo);
                }

                const btnEditar = document.createElement('button');
                btnEditar.className = 'boton-editar';
                btnEditar.innerHTML = ICONO_EDITAR_CANAL;
                btnEditar.setAttribute('aria-label', 'Editar canal ' + canal.nombre);
                btnEditar.title = 'Editar canal';
                btnEditar.addEventListener('click', (e) => { e.stopPropagation(); abrirModalEditar(canal); });

                const btnQuitar = document.createElement('button');
                btnQuitar.className = 'boton-quitar';
                btnQuitar.innerHTML = ICONO_QUITAR_CANAL;
                btnQuitar.setAttribute('aria-label', 'Quitar canal ' + canal.nombre);
                btnQuitar.title = 'Quitar canal';
                btnQuitar.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = canales.indexOf(canal);
                    if (idx >= 0) {
                        canales.splice(idx, 1);
                    }
                    canalesSeleccionados = canalesSeleccionados.filter(c => c !== canal);
                    if (canalAncla === canal) canalAncla = null;
                    actualizarContadorSeleccion();
                    if (canalSeleccionado === canal) { canalSeleccionado = null; detenerReproduccion(); }
                    actualizarSelectCategorias();
                    aplicarFiltros();
                });

                item.appendChild(dragHandle);
                item.appendChild(nombreSpan);
                item.appendChild(btnEditar);
                item.appendChild(btnQuitar);

                item.addEventListener('click', (e) => {
                    if (modoLimpieza && e.shiftKey) {
                        e.preventDefault();
                        const indiceAncla = canalAncla ? canalesFiltrados.indexOf(canalAncla) : -1;
                        if (indiceAncla === -1) {
                            canalAncla = canal;
                            canalesSeleccionados = [canal];
                        } else {
                            const indiceActual = canalesFiltrados.indexOf(canal);
                            const desde = Math.min(indiceAncla, indiceActual);
                            const hasta = Math.max(indiceAncla, indiceActual);
                            canalesSeleccionados = canalesFiltrados.slice(desde, hasta + 1);
                        }
                        actualizarContadorSeleccion();
                        renderizarLista();
                        return;
                    }
                    if (modoLimpieza) {
                        canalAncla = canal;
                        canalesSeleccionados = [];
                        actualizarContadorSeleccion();
                    }
                    reproducirCanal(canal);
                });

                elementosCanal.set(canal, item);
                fragmento.appendChild(item);
            }
            siguienteCanalPorMostrar = hasta;
            listaCanales.appendChild(fragmento);
        }
        function renderizarLista() {
            listaCanales.innerHTML = '';
            elementosCanal = new Map();
            indicePorCanal = modoLimpieza
                ? new Map(canales.map((canal, indice) => [canal, indice]))
                : null;
            siguienteCanalPorMostrar = 0;
            totalCanales.textContent = canalesFiltrados.length;
            agregarLoteCanales();
        }
        listaCanales.addEventListener('scroll', () => {
            if (!modoLimpieza && siguienteCanalPorMostrar < canalesFiltrados.length &&
                listaCanales.scrollTop + listaCanales.clientHeight >= listaCanales.scrollHeight - 450) {
                agregarLoteCanales();
            }
        }, { passive: true });

        // Los mismos cuatro botones se muestran arriba en PC/TV Box y
        // regresan a su panel original en celulares, sin duplicarlos.
        const barraAccionesAdmin = document.getElementById('gt-admin-toolbar');
        const panelAdministracion = document.getElementById('gt-admin-panel');
        const botonesAdministracion = panelAdministracion.querySelector('.gt-admin-buttons');
        const vistaAdminAmplia = window.matchMedia('(min-width: 701px)');
        function ubicarAccionesAdministracion() {
            const destino = modoLimpieza && vistaAdminAmplia.matches
                ? barraAccionesAdmin : panelAdministracion;
            if (botonesAdministracion.parentNode !== destino) {
                destino.appendChild(botonesAdministracion);
            }
        }
        window.addEventListener('resize', ubicarAccionesAdministracion);

        function alternarModoLimpieza() {
            modoLimpieza = !modoLimpieza;
            pantallaPrincipal.classList.toggle('gt-modo-administracion', modoLimpieza);
            ubicarAccionesAdministracion();
            if (modoLimpieza) {
                if (estaEnModoCine) desactivarModoCine();
                listaCanales.classList.add('modo-limpieza');
                btnAgregarCanal.style.display = 'inline-block';
                btnCombinarLista.style.display = 'inline-block';
                btnGuardar.style.display = 'inline-block';
                if (timerInactividad) clearTimeout(timerInactividad);
            } else {
                listaCanales.classList.remove('modo-limpieza');
                btnAgregarCanal.style.display = 'none';
                btnCombinarLista.style.display = 'none';
                btnGuardar.style.display = 'none';
                canalesSeleccionados = [];
                canalAncla = null;
                actualizarContadorSeleccion();
                iniciarTimerModoCine();
            }
            renderizarLista();
        }

        btnBorrarSeleccionados.addEventListener('click', () => {
            if (canalesSeleccionados.length === 0) return;
            if (canalesSeleccionados.includes(canalSeleccionado)) { canalSeleccionado = null; detenerReproduccion(); }
            canales = canales.filter(c => !canalesSeleccionados.includes(c));
            canalesSeleccionados = [];
            canalAncla = null;
            actualizarSelectCategorias();
            aplicarFiltros();
        });

        function abrirModalAgregar() {
            canalEditandoIndex = -1;
            tituloModalCanal.textContent = '➕ Agregar canal';
            inputNombreCanal.value = '';
            inputCategoriaCanal.value = categoriaActual || '';
            inputUrlCanal.value = '';
            modalCanal.style.display = 'flex';
            inputNombreCanal.focus();
        }

        function abrirModalEditar(canal) {
            canalEditandoIndex = canales.indexOf(canal);
            tituloModalCanal.textContent = '✏️ Editar canal';
            inputNombreCanal.value = canal.nombre;
            inputCategoriaCanal.value = canal.categoria;
            inputUrlCanal.value = canal.url;
            modalCanal.style.display = 'flex';
            inputNombreCanal.focus();
        }

        function cerrarModalCanal() {
            modalCanal.style.display = 'none';
            canalEditandoIndex = -1;
        }

        function guardarCanal() {
            const nombreBruto = inputNombreCanal.value.trim();
            const categoria = inputCategoriaCanal.value.trim() || "Sin categoría";
            const url = inputUrlCanal.value.trim();
            if (!nombreBruto || !url) { alert('Completá nombre y URL.'); return; }

            const { nombre, pais } = separarNombreYPais(nombreBruto);

            const tipo = detectarTipo(url);
            if (canalEditandoIndex >= 0) {
                canales[canalEditandoIndex].nombre = nombre;
                canales[canalEditandoIndex].categoria = categoria;
                if (canales[canalEditandoIndex].url !== url) canales[canalEditandoIndex].logo = '';
                canales[canalEditandoIndex].url = url;
                canales[canalEditandoIndex].tipo = tipo;
                canales[canalEditandoIndex].pais = pais;
            } else {
                canales.push({ nombre, url, tipo, categoria, pais });
            }

            actualizarSelectCategorias();
            aplicarFiltros();
            cerrarModalCanal();
        }

        btnAgregarCanal.addEventListener('click', abrirModalAgregar);
        btnGuardarCanal.addEventListener('click', guardarCanal);
        btnCancelarCanal.addEventListener('click', cerrarModalCanal);
        modalCanal.addEventListener('click', (e) => { if (e.target === modalCanal) cerrarModalCanal(); });

        function exportarM3U(lista, nombreArchivo) {
            const contenido = '#EXTM3U\n' + lista.map(canal => {
                const categoria = (canal.categoria || 'Sin categoría').replace(/["\r\n]/g, '');
                const nombre = canal.nombre.replace(/[\r\n]/g, ' ');
                const logo = urlSeguraLogo(canal.logo);
                const atributoLogo = logo ? ' tvg-logo="' + logo.replace(/"/g, '') + '"' : '';
                return `#EXTINF:-1 group-title="${categoria}"${atributoLogo},${nombre}\n${canal.url}\n`;
            }).join('');
            const url = URL.createObjectURL(new Blob([contenido], { type: 'text/plain;charset=utf-8' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = nombreArchivo;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        btnGuardar.addEventListener('click', () => {
            if (!canales.length) return;
            exportarM3U(canales, 'mi_lista_limpia.m3u');
        });

        // AUDIO. WebAudio queda unido solamente a un video separado. Para canales
        // incompatibles, GregoTV utiliza #video-nativo sin procesamiento.
        // Esto evita que un cambio de canal convierta el audio normal en silencio.
        function inicializarControlAudio() {
            try {
                const AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return false;
                if (!audioCtx) {
                    audioCtx = new AC();
                    sourceNode = audioCtx.createMediaElementSource(videoProcesado);
                    analyserNode = audioCtx.createAnalyser();
                    analyserNode.fftSize = 2048;
                    gainNode = audioCtx.createGain();
                    vozNode = audioCtx.createBiquadFilter();
                    vozNode.type = 'peaking';
                    vozNode.frequency.value = 2200;
                    vozNode.Q.value = 0.9;
                    vozNode.gain.value = 2.2;
                    gravesNode = audioCtx.createBiquadFilter();
                    gravesNode.type = 'lowshelf';
                    gravesNode.frequency.value = 140;
                    gravesNode.gain.value = -1;
                    compressorNode = audioCtx.createDynamicsCompressor();
                    compressorNode.threshold.value = -16;
                    compressorNode.knee.value = 16;
                    compressorNode.ratio.value = 5;
                    compressorNode.attack.value = 0.008;
                    compressorNode.release.value = 0.3;
                    sourceNode.connect(analyserNode);
                    analyserNode.connect(gainNode);
                    gainNode.connect(gravesNode);
                    gravesNode.connect(vozNode);
                    vozNode.connect(compressorNode);
                    compressorNode.connect(audioCtx.destination);
                }
                if (audioCtx.state === 'closed') return false;
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume().catch(error => console.warn('Audio mejorado suspendido:', error));
                    // En este canal usamos reproducción directa. En el próximo
                    // clic, si el contexto ya está activo, se usará el mejorado.
                    return false;
                }
                if (audioCtx.state !== 'running') return false;
                if (!audioInterval) {
                    const muestras = new Float32Array(analyserNode.fftSize);
                    audioInterval = setInterval(() => {
                        if (!audioSeguroParaCanal || videoActivo !== videoProcesado ||
                            videoProcesado.paused || videoProcesado.readyState < 2 ||
                            !gainNode || !audioCtx || audioCtx.state !== 'running') return;
                        analyserNode.getFloatTimeDomainData(muestras);
                        let suma = 0;
                        for (let i = 0; i < muestras.length; i++) suma += muestras[i] * muestras[i];
                        const rms = Math.sqrt(suma / muestras.length);
                        if (rms < 0.006) return;
                        nivelSuavizado = nivelSuavizado * 0.9 + rms * 0.1;
                        const objetivo = 0.12;
                        const ganancia = Math.max(0.7, Math.min(1.8, objetivo / Math.max(0.02, nivelSuavizado)));
                        gainNode.gain.setTargetAtTime(ganancia, audioCtx.currentTime, 1.2);
                    }, 350);
                }
                return true;
            } catch (error) {
                console.warn('Se conserva el audio original porque el procesamiento no está disponible:', error);
                return false;
            }
        }

        // ESTADOS DEL ORQUESTADOR. La prioridad es mostrar el menú ante errores.
        function establecerEstadoReproduccion(estado) {
            estadoReproduccion = estado;
            pantallaPrincipal.setAttribute('data-gt-estado', estado);
            if (estado === 'error' || estado === 'sin_canal' || estado === 'cargando') {
                if (timerInactividad) { clearTimeout(timerInactividad); timerInactividad = null; }
                if (estaEnModoCine) desactivarModoCine();
            }
            if (estado === 'reproduciendo') iniciarTimerModoCine();
        }

        function registrarProgresoReproduccion() {
            ultimoProgresoMedios = performance.now();
        }

        function iniciarVigilanciaCanal(id) {
            if (temporizadorVigilancia) clearInterval(temporizadorVigilancia);
            registrarProgresoReproduccion();
            momentoCargaSesion = performance.now();
            ultimaPosicionVideo = -1;
            reintentoPorBloqueo = false;
            temporizadorVigilancia = setInterval(() => {
                if (id !== reproduccionId || !canalSeleccionado ||
                    canalSeleccionado.tipo === 'youtube' || estadoReproduccion === 'error') return;
                const ahora = performance.now();
                if (estadoReproduccion === 'cargando') {
                    // Carga inicial: conservar los plazos y la recuperación originales.
                    if (ahora - momentoCargaSesion > 75000) {
                        errorEnReproduccion('❌ Este canal no responde. Podés elegir otro de la lista.', id);
                    } else if (hls && !reintentoPorBloqueo &&
                               ahora - ultimoProgresoMedios > 30000) {
                        reintentoPorBloqueo = true;
                        try { hls.stopLoad(); hls.startLoad(); } catch (error) {
                            console.warn('No se pudo reintentar la carga:', error);
                        }
                    }
                } else if (estadoReproduccion === 'reproduciendo' &&
                           videoVigilado === videoActivo && !videoActivo.paused &&
                           !videoActivo.ended && !document.hidden) {
                    // Interrupción posterior al inicio: no volver a mostrar el
                    // contador grande; conservar reintento y error final.
                    const sinImagen = ahora - ultimoAvanceImagen;
                    if (sinImagen >= DEMORA_ERROR_INTERRUPCION) {
                        errorEnReproduccion('❌ Este canal no responde. Podés elegir otro de la lista.', id);
                    } else if (hls && !reintentoPorBloqueo &&
                               sinImagen >= DEMORA_REINTENTO_INTERRUPCION) {
                        reintentoPorBloqueo = true;
                        try { hls.stopLoad(); hls.startLoad(); } catch (error) {
                            console.warn('No se pudo reintentar la carga:', error);
                        }
                    }
                }
            }, 2000);
        }

        // En Smart TV se prioriza el reproductor HTML5 que ya funcionaba.
        // Algunos navegadores de televisor no admiten de forma fiable dos
        // elementos de video y un grafo WebAudio sobre la misma reproducción.
        // En Android/TV Box también se prioriza el audio original para evitar
        // distorsión por ecualización/ganancia de WebAudio en ciertos equipos.
        // La PC conserva la mejora de audio si el navegador la permite.
        function esNavegadorTelevisor() {
            return /Tizen|SMART[-_ ]?TV|SmartTV|Web0S|webOS|NetCast|HbbTV|BRAVIA|Viera|AFT[B-UV]|Hisense|VIDAA|Android|GoogleTV|MiBOX|Shield Android TV|Amlogic|TV[ -]?Box/i.test(navigator.userAgent || '') ||
                // Navegadores antiguos sin APIs DOM modernas: usar ruta directa.
                typeof Element.prototype.replaceChildren !== 'function';
        }

        async function reproducirCanal(canal) {
            detenerReproduccion();
            canalSeleccionado = canal;
            actualizarCanalSeleccionadoVisualmente();
            if (canal.tipo === 'youtube') {
                reproducirYouTube(canal.url);
                iniciarTimerModoCine();
            } else if (canal.tipo === 'mp4') {
                // MP4 externo sin CORS: conservar audio de origen, sin riesgos.
                let delMismoOrigen = false;
                try { delMismoOrigen = new URL(canal.url, location.href).origin === location.origin; }
                catch (error) {}
                audioSeguroParaCanal = !esNavegadorTelevisor() && delMismoOrigen && inicializarControlAudio();
                videoActivo = audioSeguroParaCanal ? videoProcesado : videoNativo;
                reproducirMP4(canal.url);
            } else {
                const sesion = reproduccionId;
                iniciarContadorCarga();
                await asegurarBibliotecaHLS();
                if (sesion !== reproduccionId || canalSeleccionado !== canal) return;
                // Prioridad HLS y procesado de audio originales.
                const usandoHlsJs = typeof Hls !== 'undefined' && Hls.isSupported();
                audioSeguroParaCanal = !esNavegadorTelevisor() && usandoHlsJs && inicializarControlAudio();
                videoActivo = audioSeguroParaCanal ? videoProcesado : videoNativo;
                reproducirHLS(canal.url);
            }
        }

        function comenzarVideoNativo() {
            const id = reproduccionId;
            videoActivo.play().catch(error => {
                if (id !== reproduccionId || estadoReproduccion !== 'cargando') return;
                if (error.name === 'NotAllowedError') pedirInicioManual();
                else if (error.name !== 'AbortError') {
                    console.warn('No se pudo iniciar este canal:', error);
                    errorEnReproduccion('❌ No se pudo iniciar este canal. Probá con otro.', id);
                }
            });
        }

        // Reportes voluntarios: solo se ofrecen después de un error definitivo.
        const GREGO_REPORTE_URL = 'https://script.google.com/macros/s/AKfycbzWdAohLvyL9BsJnSryRWDiO3elkrp3mj3xtIU18osKNbjTg50aFZHI7fNEWPpbYrHaaQ/exec';
        let avisoReporte = null;
        let secuenciaAvisoReporte = 0;

        function cerrarAvisoReporte() {
            secuenciaAvisoReporte++;
            if (avisoReporte) { avisoReporte.remove(); avisoReporte = null; }
        }

        async function comprobarInternetReporte() {
            if (navigator.onLine === false) return false;
            const controlador = typeof AbortController !== 'undefined' ? new AbortController() : null;
            const temporizador = setTimeout(() => { if (controlador) controlador.abort(); }, 6000);
            try {
                // Un recurso externo, independiente del servidor IPTV.
                const respuesta = await fetch('https://www.google.com/generate_204?gregotv=' + Date.now(), {
                    mode: 'no-cors', cache: 'no-store',
                    ...(controlador ? { signal: controlador.signal } : {})
                });
                return !!respuesta;
            } catch (_) {
                return false;
            } finally {
                clearTimeout(temporizador);
            }
        }

        function tipoReporteGrego(canal) {
            const categoria = String(canal.categoria || '').toLowerCase();
            if (/serie|temporada|episodio|cap[ií]tulo/.test(categoria)) return 'Serie';
            if (/pel[ií]cula|cine|movie|vod/.test(categoria)) return 'Película';
            return 'Televisión';
        }

        async function ofrecerReporteGrego(canal, motivo, id) {
            // Las listas personales pueden contener credenciales: no compartirlas mediante reportes originales.
            if (window.__gregotvListaPersonalActiva) return;
            if (!canal || !canal.url || !/^https?:\/\//i.test(canal.url)) return;
            const secuencia = ++secuenciaAvisoReporte;
            if (!(await comprobarInternetReporte())) return;
            if (secuencia !== secuenciaAvisoReporte || id !== reproduccionId ||
                canalSeleccionado !== canal || estadoReproduccion !== 'error') return;

            cerrarAvisoReporte();
            const panel = document.createElement('div');
            panel.setAttribute('role', 'dialog');
            panel.setAttribute('aria-modal', 'true');
            panel.setAttribute('aria-label', 'Informar problema de reproducción');
            panel.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.82);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;';
            const caja = document.createElement('div');
            caja.style.cssText = 'max-width:420px;width:100%;background:#172433;color:white;border:1px solid #52657b;border-radius:12px;padding:24px;box-sizing:border-box;text-align:center;font:16px Arial,sans-serif;';
            const titulo = document.createElement('div');
            titulo.textContent = '⚠️ No se pudo reproducir este contenido.';
            titulo.style.cssText = 'font-weight:bold;margin-bottom:16px;';
            const pregunta = document.createElement('p');
            pregunta.textContent = '¿Querés informar de este problema al soporte técnico?';
            const acciones = document.createElement('div');
            acciones.style.cssText = 'display:flex;gap:14px;justify-content:center;margin-top:22px;';
            const si = document.createElement('button');
            si.type = 'button'; si.textContent = 'SÍ';
            const no = document.createElement('button');
            no.type = 'button'; no.textContent = 'NO';
            [si, no].forEach(b => { b.style.cssText = 'min-width:100px;padding:12px 20px;border-radius:8px;border:0;font:bold 16px Arial;cursor:pointer;'; });
            si.style.background = '#54c985'; no.style.background = '#e3e7ed';
            acciones.append(si, no); caja.append(titulo, pregunta, acciones); panel.append(caja);
            document.body.append(panel); avisoReporte = panel;
            no.onclick = () => cerrarAvisoReporte();
            si.onclick = () => {
                // Cerrar inmediatamente para no interrumpir el uso de GregoTV.
                // El envío continúa en segundo plano, sin mensajes adicionales.
                cerrarAvisoReporte();
                const datos = {
                    contenido: String(canal.nombre || 'Sin nombre'),
                    tipo: tipoReporteGrego(canal),
                    enlace: canal.url,
                    problema: motivo
                };
                (async () => {
                    if (!(await comprobarInternetReporte())) return;
                    try {
                        // Apps Script recibe JSON como texto sin cabeceras CORS especiales.
                        await fetch(GREGO_REPORTE_URL, {
                            method: 'POST', mode: 'no-cors',
                            headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
                            body: JSON.stringify(datos)
                        });
                    } catch (error) {
                        console.warn('No se pudo enviar el reporte de GregoTV:', error);
                    }
                })();
            };
            no.focus();
        }

        function errorEnReproduccion(mensaje, id = reproduccionId) {
            if (id !== reproduccionId) return;
            const canalFallido = canalSeleccionado;
            const causaReporte = String(mensaje || 'Error de reproducción').replace(/^❌\s*/, '');
            if (temporizadorReintento !== null) {
                clearTimeout(temporizadorReintento);
                temporizadorReintento = null;
            }
            if (temporizadorVigilancia) { clearInterval(temporizadorVigilancia); temporizadorVigilancia = null; }
            if (hls) { const instancia = hls; hls = null; instancia.destroy(); }
            for (const video of [videoNativo, videoProcesado]) {
                video.pause();
                video.style.display = 'none';
            }
            contenedorYoutube.style.display = 'none';
            mostrarEstadoVideo(mensaje, 'error');
            actualizarCanalSeleccionadoVisualmente();
            if (canalFallido && !/navegador no soporta/i.test(causaReporte)) {
                ofrecerReporteGrego(canalFallido, causaReporte, id);
            }
        }

        function reproducirHLS(url) {
            videoNativo.style.display = 'none';
            videoProcesado.style.display = 'none';
            contenedorYoutube.style.display = 'none';
            // El contador comenzó antes de la descarga opcional de HLS.js.
            const id = reproduccionId;
            iniciarVigilanciaCanal(id);
            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                reintentosHls = 0;
                const instancia = new Hls({ enableWorker: true });
                hls = instancia;
                instancia.on(Hls.Events.MEDIA_ATTACHED, () => {
                    if (id === reproduccionId && hls === instancia) instancia.loadSource(url);
                });
                instancia.on(Hls.Events.MANIFEST_PARSED, () => {
                    if (id === reproduccionId && hls === instancia) comenzarVideoNativo();
                });
                instancia.on(Hls.Events.FRAG_LOADED, () => {
                    if (id === reproduccionId) registrarProgresoReproduccion();
                });
                instancia.on(Hls.Events.ERROR, (_evento, data) => {
                    if (id !== reproduccionId || hls !== instancia || !data.fatal) return;
                    if (reintentosHls < 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        reintentosHls++;
                        temporizadorReintento = setTimeout(() => {
                            temporizadorReintento = null;
                            if (id === reproduccionId && hls === instancia) {
                                // Error al obtener manifiesto: startLoad no basta.
                                if (data.details === Hls.ErrorDetails.MANIFEST_LOAD_ERROR ||
                                    data.details === Hls.ErrorDetails.MANIFEST_LOAD_TIMEOUT) {
                                    instancia.loadSource(url);
                                } else instancia.startLoad();
                            }
                        }, 1000 * reintentosHls);
                    } else if (reintentosHls < 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        reintentosHls++;
                        instancia.recoverMediaError();
                    } else {
                        errorEnReproduccion('❌ No se pudo cargar este canal. Probá con otro.', id);
                    }
                });
                instancia.attachMedia(videoActivo);
            } else if (videoActivo.canPlayType('application/vnd.apple.mpegurl')) {
                videoActivo.src = url;
                comenzarVideoNativo();
            } else {
                errorEnReproduccion('❌ Tu navegador no soporta reproducción HLS.', id);
            }
        }

        function reproducirMP4(url) {
            videoNativo.style.display = 'none';
            videoProcesado.style.display = 'none';
            contenedorYoutube.style.display = 'none';
            iniciarContadorCarga();
            iniciarVigilanciaCanal(reproduccionId);
            videoActivo.src = url;
            comenzarVideoNativo();
        }

        function reproducirYouTube(url) {
            detenerContadorCarga();
            estadoReproduccion = 'youtube';
            videoNativo.style.display = 'none';
            videoProcesado.style.display = 'none';
            contenedorYoutube.style.display = 'block';
            mensajeSinVideo.style.display = 'none';
            let videoId = '';
            try {
                const u = new URL(url);
                const host = u.hostname.toLowerCase();
                if (host === 'youtu.be') videoId = u.pathname.split('/')[1] || '';
                else if (['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com'].includes(host)) {
                    if (u.pathname === '/watch') videoId = u.searchParams.get('v') || '';
                    else if (u.pathname.startsWith('/embed/') || u.pathname.startsWith('/shorts/') || u.pathname.startsWith('/live/')) videoId = u.pathname.split('/')[2] || '';
                }
            } catch (e) {}
            contenedorYoutube.innerHTML = '';
            if (/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
                const iframe = document.createElement('iframe');
                iframe.title = 'Video de YouTube';
                iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
                iframe.setAttribute('allowfullscreen','');
                iframe.tabIndex = -1; // El teclado/control remoto navega por GregoTV.
                iframe.referrerPolicy = 'strict-origin-when-cross-origin';
                // enablejsapi habilita playVideo/pauseVideo; origin protege
                // el reproductor cuando se publica en GitHub Pages o por HTTPS.
                const origen = (location.protocol === 'https:' || location.protocol === 'http:')
                    ? `&origin=${encodeURIComponent(location.origin)}` : '';
                iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&controls=0&disablekb=1&rel=0&playsinline=1&enablejsapi=1${origen}`;
                // Un movimiento en la zona libre también recupera el menú
                // cuando el puntero entra al iframe desde fuera.
                iframe.addEventListener('pointerenter', resetearActividad);
                contenedorYoutube.appendChild(iframe);

                // Nueva capa por reproducción: evita referencias a elementos
                // eliminados cuando se cambia de canal.
                const capa = document.createElement('div');
                capa.id = 'capa-youtube-overlay';
                capa.setAttribute('aria-hidden', 'true');
                const superior = document.createElement('div');
                superior.className = 'zona-interaccion zona-superior';
                const inferior = document.createElement('div');
                inferior.className = 'zona-interaccion zona-inferior';
                capa.appendChild(superior);
                capa.appendChild(inferior);
                capa.addEventListener('pointermove', resetearActividad);
                capa.addEventListener('pointerdown', resetearActividad);
                capa.addEventListener('touchstart', resetearActividad, { passive: true });
                // El clic en la zona central del video alterna pausa/reanudar.
                // La zona inferior derecha sigue libre para «Saltar anuncio».
                capa.addEventListener('click', alternarPausaYouTube);
                contenedorYoutube.appendChild(capa);

                const esPantallaMovilYT = window.innerWidth <= 600;

                // Nunca retrasar la imagen por la carga de la API. Si falla,
                // YouTube continúa reproduciéndose y el menú sigue accesible.
                const idSesion = reproduccionId;
                cargarAPIYouTube().then(YTDisponible => {
                    if (idSesion !== reproduccionId || !document.documentElement.contains(iframe) ||
                        !canalSeleccionado || canalSeleccionado.tipo !== 'youtube') return;
                    try {
                        reproductorYouTube = new YTDisponible.Player(iframe, {
                            events: {
                                onReady: (evento) => {
                                    if (idSesion === reproduccionId &&
                                        canalSeleccionado && canalSeleccionado.tipo === 'youtube') {
                                        youtubeApiLista = true;
                                        // Autoplay ya se solicita con autoplay=1. En móvil
                                        // también se pide al quedar lista la API (sin silenciar).
                                        if (esPantallaMovilYT) {
                                            try { evento.target.playVideo(); } catch (error) {
                                                console.warn('YouTube no pudo iniciarse automáticamente en el celular:', error);
                                            }
                                        }
                                    }
                                },
                                onError: (evento) => {
                                    if (idSesion !== reproduccionId || canalSeleccionado?.tipo !== 'youtube') return;
                                    console.warn('YouTube informó un error de reproducción:', evento.data);
                                    // Solo códigos oficiales de video inexistente, privado o no reproducible.
                                    // No convertir errores de API ni de conectividad en reportes.
                                    const codigo = Number(evento.data);
                                    if ([100, 101, 150].includes(codigo)) {
                                        errorEnReproduccion('❌ YouTube no permite reproducir este video (error ' + codigo + ').', idSesion);
                                    }
                                }
                            }
                        });
                    } catch (error) {
                        console.warn('Control de pausa de YouTube no disponible:', error);
                    }
                }).catch(error => {
                    console.warn('API de pausa de YouTube no disponible:', error);
                    // Si la API falla en celular, permitir tocar directamente
                    // el reproductor de YouTube en lugar de bloquear el video.
                    if (esPantallaMovilYT && idSesion === reproduccionId) {
                        superior.style.pointerEvents = 'none';
                        inferior.style.pointerEvents = 'none';
                    }
                });
            } else {
                contenedorYoutube.style.display = 'none';
                mostrarEstadoVideo('No se pudo identificar el video de YouTube.', 'error');
            }
        }

        // Eventos de HLS/MP4 en ambos elementos; el inactivo nunca manda.
        for (const video of [videoNativo, videoProcesado]) {
            video.addEventListener('playing', () => {
                if (video !== videoActivo || !canalSeleccionado ||
                    canalSeleccionado.tipo === 'youtube' || estadoReproduccion === 'sin_canal') return;
                detenerContadorCarga();
                establecerEstadoReproduccion('reproduciendo');
                mensajeSinVideo.style.display = 'none';
                video.style.display = 'block';
                iniciarVigilanciaAvanceVideo(video);
                registrarProgresoReproduccion();
                if (temporizadorReintento !== null) {
                    clearTimeout(temporizadorReintento);
                    temporizadorReintento = null;
                }
            });
            video.addEventListener('timeupdate', () => {
                if (video !== videoActivo || estadoReproduccion === 'sin_canal') return;
                if (Math.abs(video.currentTime - ultimaPosicionVideo) > 0.15) {
                    ultimaPosicionVideo = video.currentTime;
                    registrarProgresoReproduccion();
                }
            });
            const registrarEspera = () => {
                if (video !== videoActivo || video.paused ||
                    estadoReproduccion !== 'reproduciendo') return;
                // No volver a iniciar la cuenta progresiva: solo mostrar aviso
                // si la imagen lleva 10 segundos realmente sin avanzar.
                comprobarAvanceImagen();
            };
            video.addEventListener('waiting', registrarEspera);
            video.addEventListener('stalled', registrarEspera);
            video.addEventListener('error', () => {
                if (video !== videoActivo || !canalSeleccionado ||
                    canalSeleccionado.tipo === 'youtube' ||
                    estadoReproduccion === 'sin_canal' || estadoReproduccion === 'error') return;
                if (!video.currentSrc && !hls) return;
                errorEnReproduccion('❌ No se pudo cargar este canal. Probá con otro.');
            });
        }

        function detenerReproduccion() {
            cerrarAvisoReporte();
            // Invalidar la sesión ANTES de interrumpir los medios; ningún evento
            // posterior puede reactivar la reproducción anterior.
            reproduccionId++;
            if (temporizadorReintento !== null) {
                clearTimeout(temporizadorReintento);
                temporizadorReintento = null;
            }
            if (temporizadorVigilancia) {
                clearInterval(temporizadorVigilancia);
                temporizadorVigilancia = null;
            }
            detenerContadorCarga();
            cancelarVigilanciaAvanceVideo();
            establecerEstadoReproduccion('sin_canal');
            audioSeguroParaCanal = false;
            if (gainNode && audioCtx) gainNode.gain.setTargetAtTime(1, audioCtx.currentTime, 0.05);
            nivelSuavizado = 0.12;
            if (hls) { const instancia = hls; hls = null; instancia.destroy(); }
            for (const video of [videoNativo, videoProcesado]) {
                // Hay televisores que fallan si se invoca load() sobre un
                // segundo video sin fuente; no debe impedir cambiar de canal.
                try {
                    video.pause();
                    if (video.hasAttribute('src') || video.currentSrc) {
                        video.removeAttribute('src');
                        video.load();
                    }
                } catch (error) {
                    console.warn('Limpieza de video ignorada:', error);
                }
                video.style.display = 'none';
            }
            videoActivo = videoNativo;
            desvincularYouTube();
            contenedorYoutube.innerHTML = '';
            contenedorYoutube.style.display = 'none';
            mensajeSinVideo.textContent = 'Seleccioná un canal de la lista para reproducir';
            mensajeSinVideo.style.display = 'flex';
            if (timerInactividad) { clearTimeout(timerInactividad); timerInactividad = null; }
            canalSeleccionado = null;
            if (estaEnModoCine) desactivarModoCine();
            actualizarCanalSeleccionadoVisualmente();
        }
    