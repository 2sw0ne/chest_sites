// CHEST — fond animé du hero Welcome (shader de lumière + neige), extrait de welcome.js pour être
// réutilisé tel quel sur les pages de connexion/inscription (demande utilisateur 2026-09-23 : « je veux
// que ce soit le fond de la page welcome »). Copie fidèle du moteur de rendu (pas du texte qui s'écrit
// lettre à lettre ni de la mécanique de défilement, propres à la page Welcome) : NE PAS modifier ce
// fichier sans reporter le même changement dans welcome.js, et vice-versa — les deux sont volontairement
// tenus séparés pour ne jamais risquer de casser le hero déjà réglé (voir CLAUDE.md, section Welcome).
window.CHESTHeroBg = (() => {
  'use strict';

  function init(lightCv, stars, opts) {
    if (!lightCv && !stars) return { stop() {} };
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const root = (opts && opts.mouseTarget) || document.body;

    /* ---------- Rayons de lumière : shader qui bouge tout seul (copie exacte de welcome.js) ---------- */
    const VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
    const FRAG = [
      'precision highp float;',
      'uniform vec2 uRes;uniform float uTime;',
      'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
      'float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);',
      ' return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x),mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x),f.y);}',
      'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return s;}',
      'float pathY(float x,float t){float xc=max(x,0.);float base=.02+.34*(1.-exp(-1.5*xc));',
      ' float w=.075*sin((xc-.9)*3.-t*.12)*smoothstep(.45,1.,xc)-.14*smoothstep(1.35+.08*sin(t*.05),1.95,xc);return base+w;}',
      'void main(){',
      ' vec2 uv=gl_FragCoord.xy/uRes;uv.y=1.-uv.y;',
      ' float asp=uRes.x/uRes.y;vec2 p=vec2(uv.x*asp,uv.y);float t=uTime;',
      ' float n1=fbm(p*vec2(.85,1.05)+vec2(t*.034,-t*.021));',
      ' float n2=fbm(p*1.6+vec2(-t*.04,t*.028)+n1*.9);',
      ' float yc=pathY(p.x,t);float sl=(pathY(p.x+.02,t)-pathY(p.x-.02,t))/.04;',
      ' float q=(p.y-yc)/sqrt(1.+sl*sl)+(n1-.5)*.05;float al=max(p.x,0.);',
      ' float wd=mix(.31,.19,smoothstep(.5,1.4,al));',
      ' float v1=.55+.9*fbm(vec2(al*1.3-t*.03,q*1.4+t*.02));',
      ' float band=(exp(-pow(q/wd,2.))*.8+exp(-pow(q/(wd*.32),2.))*.55)*(.32+.68*exp(-al*.9))*smoothstep(-.1,.2,p.x)*(.75+.35*v1)*(.94+.06*sin(t*.09));',
      ' float prox=.28+.72*exp(-abs(q)*1.15)*exp(-al*.14);',
      ' vec2 dir2=normalize(vec2(1.,.95+.08*cos(t*.07)));vec2 nrm2=vec2(-dir2.y,dir2.x);',
      ' vec2 c2=vec2(.62*asp+.08*sin(t*.05),-.2);',
      ' float q2=dot(p-c2,nrm2)+(n2-.5)*.45;float al2=dot(p-c2,dir2);',
      ' float v2=.4+1.0*fbm(vec2(al2*1.1+t*.025,q2*1.2-t*.03));',
      ' float band2=exp(-pow(q2/.4,2.))*exp(-max(al2,0.)*.3)*smoothstep(-.5,.2,al2)*v2*(.7+.5*sin(t*.11+2.));',
      ' vec2 g1=vec2(asp*(.5+.38*sin(t*.083)),.24+.14*cos(t*.117));',
      ' vec2 g2=vec2(asp*(.5+.4*cos(t*.061+1.)),.38+.12*sin(t*.097+2.));',
      ' float glow=exp(-dot(p-g1,p-g1)/.11)*(.5+.5*sin(t*.29))+exp(-dot(p-g2,p-g2)/.15)*(.5+.5*sin(t*.23+2.5))*.6;',
      ' float wav=fbm(vec2(p.x*.85+t*.05,p.y*.7-t*.03))*1.7+sin(p.x*1.25+t*.11+n1*2.2)*.3;',
      ' float cur1=fbm(vec2(p.x*2.1+wav*1.5,p.y*.6+t*.05));',
      ' float cur2=fbm(vec2(p.x*3.4-wav*1.1+7.3,p.y*.7-t*.04));',
      ' float rib=smoothstep(.3,.74,cur1)*.8+smoothstep(.36,.8,cur2)*.5;',
      ' float ah=smoothstep(-.02,.18,uv.y)*(1.-smoothstep(.2,.78,uv.y));',
      ' float aw=1.-.75*exp(-dot(p-vec2(.05,.0),p-vec2(.05,.0))/.3);',
      ' float aur=rib*ah*aw*(.62+.38*sin(t*.11+p.x*1.6));',
      ' vec2 o=vec2(-.15,-.65);vec2 d=p-o;float len=length(d);float a=atan(d.y,d.x);',
      ' float rr=fbm(vec2(a*3.4+t*.045,len*.3-t*.03));',
      ' float ray=smoothstep(.3,.9,rr);',
      ' float along=smoothstep(.35+.3*sin(t*.07),1.9,p.x);',
      ' float fringe=smoothstep(-.02,.3,q)*exp(-max(q,0.)*3.2);',
      ' float gw=exp(-dot(p-g2,p-g2)/.2)*(.5+.5*sin(t*.23+2.5));',
      ' float warm=clamp((along*.8+fringe*.75)*exp(-abs(q)*1.8)+gw*.9,0.,1.);',
      ' float vio=smoothstep(.15,.95,1.-prox)*(.45+.55*n1)*(1.-.6*warm);',
      ' float rd=1.-.62*smoothstep(.3,.95,uv.x/asp);',
      ' float inten=band*1.95+band2*.42+(glow*.3+aur*1.65+n2*.34*exp(-len*.3)+ray*.12*exp(-len*.34))*rd*prox;',
      ' float mask=pow(1.-smoothstep(-.1,1.,uv.y),1.35);',
      ' float b=clamp(inten*mask*.72,0.,1.5);',
      ' vec3 deep=vec3(.15,.012,.085),wine=vec3(.37,.05,.225),mag=vec3(.56,.09,.37),rose=vec3(.75,.33,.55),soft=vec3(.83,.53,.68),wht=vec3(.9,.7,.8);',
      ' vec3 c1=mix(deep,wine,smoothstep(.03,.28,b));',
      ' c1=mix(c1,mag,smoothstep(.3,.66,b));',
      ' c1=mix(c1,rose,smoothstep(.58,.92,b));',
      ' c1=mix(c1,soft,smoothstep(.84,1.16,b));',
      ' c1=mix(c1,wht,smoothstep(1.1,1.5,b));',
      ' c1+=vec3(.18,.02,.3)*aur*.5*(1.-uv.x/asp)*mask+vec3(.3,.11,.04)*aur*.16*smoothstep(.5,1.,uv.x/asp)*mask;',
      ' float sunR=smoothstep(.5,.92,uv.x);float vioL=1.-smoothstep(.06,.44,uv.x);',
      ' vec3 gold=mix(vec3(.44,.2,.04),vec3(.98,.68,.16),smoothstep(.06,.5,b));gold=mix(gold,vec3(1.,.9,.45),smoothstep(.4,1.,b));',
      ' gold=mix(gold,vec3(1.,.94,.6),smoothstep(.8,1.3,b)*sunR);',
      ' c1=mix(c1,gold,clamp(sunR*1.05+warm*smoothstep(.4,.75,uv.x)*.3,0.,1.)*smoothstep(.02,.22,b)*.92);',
      ' vec3 vv=mix(vec3(.2,.04,.36),vec3(.52,.16,.82),smoothstep(.04,.5,b));vv=mix(vv,vec3(.84,.66,.99),smoothstep(.55,1.1,b));',
      ' c1=mix(c1,vv,clamp(vioL*1.05+vio*.3*(1.-sunR),0.,1.)*smoothstep(.02,.22,b)*.92);',
      ' c1*=smoothstep(0.,.16,b);',
      ' c1+=mix(vec3(.1,.008,.056),vec3(.075,.014,.11),smoothstep(.2,.8,n1))*(.55+.45*n2)*smoothstep(.16,.5,uv.y)*(1.-smoothstep(.5,.84,uv.y))*(1.-.5*smoothstep(.4,1.,uv.x/asp));',
      ' c1+=(h21(gl_FragCoord.xy+t)-.5)/255.;',
      ' gl_FragColor=vec4(c1,1.);',
      '}'
    ].join('\n');
    let gl = null, uRes = null, uTime = null, lightOK = false, t0 = 0;
    let lightScale = 0.5, dtAvg = 0, dtN = 0;

    function initLight() {
      if (lightOK || !lightCv) return lightOK;
      try { gl = lightCv.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
      if (!gl) return false;
      const mk = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); return gl.getShaderParameter(sh, gl.COMPILE_STATUS) ? sh : null; };
      const vs = mk(gl.VERTEX_SHADER, VERT), fs = mk(gl.FRAGMENT_SHADER, FRAG);
      const prog = vs && fs && gl.createProgram();
      if (!prog) { gl = null; return false; }
      gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false; }
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      uRes = gl.getUniformLocation(prog, 'uRes'); uTime = gl.getUniformLocation(prog, 'uTime');
      lightCv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); gl = null; lightOK = false; });
      lightOK = true; t0 = performance.now();
      return true;
    }
    function sizeLight() {
      if (!initLight()) return;
      const w = Math.max(2, Math.round(lightCv.clientWidth * lightScale)), h = Math.max(2, Math.round(lightCv.clientHeight * lightScale));
      lightCv.width = w; lightCv.height = h;
      gl.viewport(0, 0, w, h);
    }
    function drawLight(ts) {
      if (!lightOK) return;
      gl.uniform2f(uRes, lightCv.width, lightCv.height);
      gl.uniform1f(uTime, 18 + (ts - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* ---------- Neige (copie exacte de welcome.js) ---------- */
    const cur = { x: 0, y: 0, sx: 0, sy: 0, on: false };
    let flakes = [], sprite = null, cw = 0, ch = 0, dpr = 1, loop = 0, last = 0, tsPrev = 0, stopped = false;

    function makeSprite() {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
      return c;
    }
    function spawn(f, anywhere) {
      const z = Math.random();
      const near = z > 0.86;
      f.z = z;
      f.r = near ? 5 + Math.random() * 8 : 0.9 + z * 2.4;
      f.a = near ? 0.13 + Math.random() * 0.14 : 0.34 + z * 0.6;
      f.v = near ? 34 + Math.random() * 26 : 12 + z * 34;
      f.sw = 6 + Math.random() * 16;
      f.w = 0.4 + Math.random() * 0.9;
      f.p = Math.random() * Math.PI * 2;
      f.x = Math.random() * cw;
      f.y = anywhere ? Math.random() * ch : -12 - Math.random() * 60;
      f.push = 0;
      return f;
    }
    function sizeCanvas() {
      if (!stars) return;
      dpr = Math.min(2, window.devicePixelRatio || 1);
      cw = stars.offsetWidth; ch = stars.offsetHeight;
      stars.width = Math.round(cw * dpr); stars.height = Math.round(ch * dpr);
      const n = Math.min(320, Math.round((cw * ch) / 6200));
      flakes = Array.from({ length: n }, () => spawn({}, true));
      if (!sprite) sprite = makeSprite();
      sizeLight();
    }
    function visible() { return !stopped && !document.hidden; }

    function tick(ts) {
      loop = 0;
      if (!visible()) return;
      const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
      drawLight(ts);
      const raw = tsPrev ? (ts - tsPrev) / 1000 : 0; tsPrev = ts;
      if (raw > 0 && raw < 1) { dtAvg = dtAvg ? dtAvg * 0.9 + raw * 0.1 : raw; dtN++; }
      if (dtN >= 24 && dtAvg > 0.045 && lightScale > 0.2) { lightScale = Math.max(0.2, lightScale * 0.7); dtAvg = 0; dtN = 0; sizeLight(); }
      if (stars) {
        const ctx = stars.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        cur.sx = cur.x; cur.sy = cur.y;
        if (cur.on) {
          ctx.globalCompositeOperation = 'lighter';
          const R = Math.max(220, Math.min(cw, ch) * 0.34);
          const g = ctx.createRadialGradient(cur.sx, cur.sy, 0, cur.sx, cur.sy, R);
          g.addColorStop(0, 'rgba(255,225,240,.30)');
          g.addColorStop(0.18, 'rgba(255,140,205,.22)');
          g.addColorStop(0.55, 'rgba(252,18,131,.08)');
          g.addColorStop(1, 'rgba(252,18,131,0)');
          ctx.fillStyle = g; ctx.fillRect(cur.sx - R, cur.sy - R, R * 2, R * 2);
        }
        ctx.globalCompositeOperation = 'lighter';
        const t = ts / 1000;
        const RM = 130;
        for (let i = 0; i < flakes.length; i++) {
          const f = flakes[i];
          f.y += f.v * dt;
          f.x += Math.cos(t * f.w + f.p) * f.sw * dt;
          let boost = 0;
          if (cur.on) {
            const dx = f.x - cur.sx, dy = f.y - cur.sy, d = Math.hypot(dx, dy);
            if (d < RM && d > 0.01) {
              const k = 1 - d / RM;
              f.x += (dx / d) * k * k * 240 * dt * (0.4 + f.z);
              f.y += (dy / d) * k * k * 120 * dt;
              boost = k;
            }
          }
          if (f.y > ch + 14 || f.x < -30 || f.x > cw + 30) { spawn(f, false); continue; }
          const r = f.r * (1 + boost * 0.5);
          ctx.globalAlpha = Math.min(1, f.a + boost * 0.55);
          ctx.drawImage(sprite, f.x - r, f.y - r, r * 2, r * 2);
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'destination-out';
        const fg = ctx.createLinearGradient(0, ch * 0.5, 0, ch);
        fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(0.55, 'rgba(0,0,0,.7)'); fg.addColorStop(1, 'rgba(0,0,0,1)');
        ctx.fillStyle = fg; ctx.fillRect(0, ch * 0.5, cw, ch * 0.5);
        ctx.globalCompositeOperation = 'source-over';
      }
      loop = requestAnimationFrame(tick);
    }
    function startSnow() {
      if (reduce) {
        sizeCanvas();
        drawLight(performance.now());
        if (stars) {
          const ctx = stars.getContext('2d');
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          flakes.forEach((f) => { ctx.globalAlpha = f.a * 0.8; ctx.drawImage(sprite, f.x - f.r, f.y - f.r, f.r * 2, f.r * 2); });
        }
        return;
      }
      if (!loop && visible()) { last = performance.now(); loop = requestAnimationFrame(tick); }
    }
    function onMove(e) {
      if (stopped) return;
      const r = root.getBoundingClientRect();
      cur.x = e.clientX - r.left; cur.y = e.clientY - r.top;
      if (!cur.on) { cur.on = true; cur.sx = cur.x; cur.sy = cur.y; }
    }

    root.addEventListener('mousemove', onMove, { passive: true });
    root.addEventListener('mouseleave', () => { cur.on = false; });
    window.addEventListener('resize', () => { if (!stopped) { sizeCanvas(); startSnow(); } });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) startSnow(); });

    sizeCanvas();
    startSnow();

    return {
      stop() { stopped = true; cancelAnimationFrame(loop); loop = 0; },
    };
  }

  return { init };
})();
