
    /* Orquestador de Cine: navegación, categoría, búsqueda y estado.
       Independiente del orquestador de TV; preparado para ampliar el catálogo. */
    (function () {
        var bTV=document.getElementById('inicio-tab-tv');
        var bCine=document.getElementById('inicio-tab-cine');
        var pTV=document.getElementById('inicio-contenido-tv');
        var pCine=document.getElementById('inicio-contenido-cine');
        var fichas=document.querySelectorAll('#cine-catalogo .cine-ficha');
        var contador=document.getElementById('cine-contar');
        var estadoCine={seccion:'tv'};
        function cambiarSeccion(seccion) {
            estadoCine.seccion=seccion;
            var cine=seccion==='cine';
            pTV.style.display=cine?'none':'block';
            pCine.style.display=cine?'block':'none';
            bTV.className=cine?'inicio-opcion':'inicio-opcion activa';
            bCine.className=cine?'inicio-opcion activa':'inicio-opcion';
            bTV.setAttribute('aria-pressed',cine?'false':'true');
            bCine.setAttribute('aria-pressed',cine?'true':'false');
            var inicio=document.getElementById('pantalla-bienvenida');
            if(inicio) {
                // Solo cambia el estilo del catálogo móvil; TV conserva su diseño.
                if(cine) inicio.classList.add('inicio-cine-activo');
                else inicio.classList.remove('inicio-cine-activo');
                inicio.scrollTop=0;
                if(cine) pCine.scrollTop=0;
            }
        }
        // El catálogo permanece íntegro. El contador refleja las fichas existentes.
        contador.textContent=fichas.length+' título'+(fichas.length===1?'':'s')+' disponible'+(fichas.length===1?'':'s');
        bTV.addEventListener('click',function(){cambiarSeccion('tv');});
        bCine.addEventListener('click',function(){cambiarSeccion('cine');});
        // Regresar a la portada sin activar la carga de la lista original.
        document.getElementById('cine-volver-inicio').addEventListener('click',function(){
            cambiarSeccion('tv');
            bTV.focus();
        });
        document.addEventListener('keydown',function(e) {
            var bienvenida=document.getElementById('pantalla-bienvenida');
            if(bienvenida.style.display==='none'||pCine.style.display==='none')return;
            var k=e.key||e.keyCode;
            // Escape / Return del control de Samsung: volver a Televisión.
            if(k==='Escape'||k===27||e.keyCode===10009) {
                e.preventDefault(); cambiarSeccion('tv'); bTV.focus(); return;
            }
            var dirs={'ArrowLeft':1,'ArrowUp':1,'ArrowRight':1,'ArrowDown':1};
            var esFlecha=dirs[k]||k===37||k===38||k===39||k===40||e.keyCode===19||e.keyCode===20||e.keyCode===21||e.keyCode===22;
            if(!esFlecha)return;
            var elems=document.querySelectorAll('#pantalla-bienvenida .inicio-opcion, #cine-catalogo .cine-ficha, #cine-volver-inicio, #gregotv-boton-configuracion');
            var candidatos=[];
            for(var n=0;n<elems.length;n++) {
                var el=elems[n];
                if(el.offsetWidth>0&&el.offsetHeight>0)candidatos.push(el);
            }
            if(!candidatos.length)return;
            var actual=document.activeElement;
            if(candidatos.indexOf(actual)===-1){e.preventDefault();candidatos[0].focus();return;}
            var r=actual.getBoundingClientRect(), cx=r.left+r.width/2, cy=r.top+r.height/2;
            var mejor=null, puntaje=Infinity;
            var derecha=k==='ArrowRight'||k===39||e.keyCode===22, izquierda=k==='ArrowLeft'||k===37||e.keyCode===21;
            var abajo=k==='ArrowDown'||k===40||e.keyCode===20, arriba=k==='ArrowUp'||k===38||e.keyCode===19;
            for(var a=0;a<candidatos.length;a++) {
                var c=candidatos[a]; if(c===actual)continue;
                var t=c.getBoundingClientRect(),dx=t.left+t.width/2-cx,dy=t.top+t.height/2-cy;
                if(!(derecha&&dx>8||izquierda&&dx< -8||abajo&&dy>8||arriba&&dy< -8))continue;
                var horizontal=derecha||izquierda;
                var p=(horizontal?Math.abs(dx):Math.abs(dy))+(horizontal?Math.abs(dy):Math.abs(dx))*2.8;
                if(p<puntaje){puntaje=p;mejor=c;}
            }
            if(mejor){e.preventDefault();mejor.focus();}
        });
    })();
    