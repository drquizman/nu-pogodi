import './style.css';
if(location.pathname.startsWith('/controller') || new URLSearchParams(location.search).has('controller')){void import('./phone').then(m=>m.mountPhone());}else{void import('./host').then(m=>m.mountHost());}
