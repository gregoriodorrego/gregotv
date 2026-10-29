
/* La carga personal se gestiona exclusivamente desde la ventana nueva.
   Televisión mantiene su lista original y su reproductor. */
(function(){
  var tv=document.getElementById('inicio-tab-tv');
  var original=document.getElementById('btn-cargar-url');
  if(!tv||!original)return;
  tv.addEventListener('click',function(e){
    if(!e.isTrusted)return;
    original.click();
  });
})();

(function comprobarVersionPublicada() {
  if (location.protocol !== 'https:' || !window.fetch) return;
  const actual = '2026.10.29.60';
  function partes(v) {
    if (typeof v !== 'string' || !/^v?\d{4}\.\d{2}\.\d{2}\.\d+$/.test(v)) return null;
    return v.replace(/^v/, '').split('.').map(Number);
  }
  window.addEventListener('load', function () {
    fetch('version.json?comprobar=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (dato) {
        if (!dato) return;
        const publicada = partes(dato.version), local = partes(actual);
        if (!publicada || !local) return;
        const nueva = publicada.some(function (n, i) {
          return n > local[i] && publicada.slice(0, i).every(function (v, j) { return v === local[j]; });
        });
        if (!nueva) return;
        const url = new URL(location.href);
        const marca = publicada.join('');
        if (url.searchParams.get('v') === marca) return;
        url.searchParams.set('v', marca);
        location.replace(url.toString());
      }).catch(function () { /* Sin Internet: mantener versión disponible. */ });
  }, { once: true });
})();
