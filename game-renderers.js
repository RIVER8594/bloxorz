(function (root) {
  'use strict';
  const C = root.RollCore;
  const PALETTE = { '#': '#33414c', S: '#425b64', I: '#789da7', P: '#987748', D: '#b18d4e', N: '#726ba4', T: '#306d7c', E: '#13434d' };
  const LABELS = { P: '▣', D: '☀', N: '☾', T: '◇', S: '·' };
  const endColor = state => C.downEnd(state) === 'head' ? '#f4cc72' : '#a9a4f4';
  const now = () => performance.now();
  const ease = t => 1 - (1 - t) * (1 - t);

  class BaseRenderer {
    constructor(container, settings) {
      this.container = container; this.settings = settings; this.generation = 0; this.transition = null; this.floorOpacity = 1;
      this.background = new EscapeRoomBackground(container);
    }
    build(level, state) {
      this.level = level; this.state = C.clone(state); this.generation++; this.transition = null; this.floorOpacity = 1; this.hintCells = null;
      this.center = { c: (level.width - 1) / 2, r: (level.height - 1) / 2 };
      this.background.setLevel(level.chapter, !this.settings.reduced);
    }
    sync(state) { this.state = C.clone(state); this.transition = null; this.floorOpacity = 1; this.hintCells = null; }
    highlight(direction) { this.hintCells = C.cells(C.rolled(this.state, direction)); }
    safeCells() {
      if(this.hintCells) return this.hintCells;
      if(this.state.echo?.remaining!==1 || this.state.status!=='playing') return [];
      const cells=new Map();
      for(const dir of C.DIRECTIONS){const next=C.step(this.level,this.state,dir);if(next.status!=='failed')for(const cell of C.cells(next))cells.set(cell.r+','+cell.c,cell);}
      return [...cells.values()];
    }
    position(state) { return { x: (state.c + (state.pose === 'COL' ? .5 : 0) - this.center.c) * 2, z: (state.r + (state.pose === 'ROW' ? .5 : 0) - this.center.r) * 2, y: state.pose === 'V' ? 2 : 1 }; }
    move(before, after, dir, duration) {
      const token = this.generation;
      this.transition = { kind: 'roll', before: C.clone(before), after: C.clone(after), dir, start: now(), duration };
      return new Promise(resolve => {
        const wait = () => {
          if (token !== this.generation) return resolve(false);
          if (now() - this.transition.start < duration) requestAnimationFrame(wait);
          else { this.sync(after); resolve(true); }
        };
        requestAnimationFrame(wait);
      });
    }
    effect(kind, duration) {
      const token = this.generation;
      this.transition = { kind, before: C.clone(this.state), start: now(), duration };
      return new Promise(resolve => {
        const wait = () => {
          if (token !== this.generation) return resolve(false);
          if (now() - this.transition.start < duration) requestAnimationFrame(wait);
          else { this.floorOpacity = kind === 'win' ? 0 : 1; this.transition = null; resolve(true); }
        };
        requestAnimationFrame(wait);
      });
    }
    frame(timestamp) {
      this.background.draw(timestamp);
      let position = this.position(this.state), rotation = this.state.rotation;
      const tr = this.transition;
      if (tr) {
        const t = Math.max(0, Math.min((timestamp - tr.start) / tr.duration, 1));
        position = this.position(tr.before); rotation = tr.before.rotation;
        if (tr.kind === 'roll') {
          const progress = ease(t), sine=Math.sin(progress*Math.PI/2), cosine=Math.cos(progress*Math.PI/2);
          const horizontal=tr.dir==='LEFT'||tr.dir==='RIGHT',sign=tr.dir==='DOWN'||tr.dir==='RIGHT'?1:-1;
          const half=horizontal?(tr.before.pose==='COL'?2:1):(tr.before.pose==='ROW'?2:1);
          const px=position.x+(horizontal?sign*half:0),pz=position.z+(horizontal?0:sign*half);
          const transform=([x,y,z])=>tr.dir==='DOWN'?[x,cosine*y-sine*z,sine*y+cosine*z]:tr.dir==='UP'?[x,cosine*y+sine*z,-sine*y+cosine*z]:tr.dir==='RIGHT'?[cosine*x+sine*y,-sine*x+cosine*y,z]:[cosine*x-sine*y,sine*x+cosine*y,z];
          const p=transform([position.x-px,position.y,position.z-pz]);position={x:p[0]+px,y:p[1],z:p[2]+pz};
          rotation=[];for(let i=0;i<9;i+=3)rotation.push(...transform(tr.before.rotation.slice(i,i+3)));
        } else if (tr.kind === 'win') { position.y += t * t * 26; this.floorOpacity = 1 - t; }
        else if (tr.kind === 'fall') position.y -= t * t * 26;
      }
      return { position, rotation, transition: tr };
    }
    stop() { this.generation++; this.transition = null; }
  }

  class CanvasRenderer extends BaseRenderer {
    constructor(container, settings) {
      super(container, settings);
      this.canvas = document.createElement('canvas'); this.canvas.id = 'game-canvas'; container.prepend(this.canvas);
      this.ctx = this.canvas.getContext('2d'); this.hiddenPlayer = false;
      this.loop = t => { this.draw(t); requestAnimationFrame(this.loop); }; requestAnimationFrame(this.loop);
    }
    build(level, state) { super.build(level, state); this.hiddenPlayer = false; }
    sync(state) { super.sync(state); this.hiddenPlayer = false; }
    project(x, z, y = 0) { return { x: this.w / 2 + (-.94 * x - .342 * z) * this.scale, y: this.h * .57 + (.197 * x - .543 * z - .816 * y) * this.scale }; }
    polygon(points, color, stroke) {
      const ctx = this.ctx; ctx.beginPath(); points.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
      ctx.fillStyle = color; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
    }
    tile(r, c, symbol, timestamp) {
      const ctx = this.ctx, x = (c - this.center.c) * 2, z = (r - this.center.r) * 2;
      const bridge = /^[a-z]$/.test(symbol), open = !bridge || C.bridgeOpen(this.level, this.state, symbol);
      if (this.state.broken.includes(r + ',' + c)) return;
      ctx.save(); ctx.globalAlpha = this.floorOpacity * (open ? 1 : .22);
      const corners = [[x- .96,z-.96],[x+.96,z-.96],[x+.96,z+.96],[x-.96,z+.96]];
      const top = corners.map(p => this.project(...p)), bottom = corners.map(p => this.project(...p,-.3));
      this.polygon([top[1],top[2],bottom[2],bottom[1]], '#15212c'); this.polygon([top[2],top[3],bottom[3],bottom[2]],'#1b2b37');
      const mechanism = this.level.bySymbol[symbol], active = mechanism && (this.state.activated & (1 << mechanism.index));
      this.polygon(top, bridge ? (this.level.mechanisms.find(m=>m.bridge===symbol)?.kind==='echo' ? '#3b8690' : '#64795e') : (PALETTE[symbol] || PALETTE['#']), active ? '#f4cc72' : '#66809566');
      const point = this.project(x,z,.02); ctx.fillStyle = active ? '#ffdc75' : '#eff6ff'; ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.font=`${Math.max(12,this.scale*.68)}px sans-serif`;
      if (LABELS[symbol]) ctx.fillText(LABELS[symbol],point.x,point.y);
      if (symbol==='I') {ctx.strokeStyle='#d5effe99';ctx.beginPath();ctx.moveTo(top[0].x+5,top[0].y+2);ctx.lineTo(point.x,point.y);ctx.lineTo(top[2].x-4,top[2].y-2);ctx.stroke();}
      if (symbol==='E') {
        const unlocked=(this.state.activated & this.level.requiredMask)===this.level.requiredMask;
        ctx.strokeStyle=unlocked?'#74ecf5':'#8492a0';ctx.lineWidth=2;ctx.beginPath();top.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.closePath();ctx.stroke();
        if(unlocked){const upper=this.project(x,z,5);const gradient=ctx.createLinearGradient(point.x,point.y,upper.x,upper.y);gradient.addColorStop(0,'#3ce7ef32');gradient.addColorStop(1,'#3ce7ef00');ctx.fillStyle=gradient;ctx.fillRect(point.x-18,upper.y,36,point.y-upper.y);}
      }
      ctx.restore();
    }
    body(state, position, rotation, alpha=1) {
      const ctx=this.ctx; const corners=[];
      for(const [x,y,z] of [[- .88,-1.9,- .88],[.88,-1.9,- .88],[.88,-1.9,.88],[- .88,-1.9,.88],[- .88,1.9,- .88],[.88,1.9,- .88],[.88,1.9,.88],[- .88,1.9,.88]]) {
        const wx=rotation[0]*x+rotation[3]*y+rotation[6]*z+position.x,wy=rotation[1]*x+rotation[4]*y+rotation[7]*z+position.y,wz=rotation[2]*x+rotation[5]*y+rotation[8]*z+position.z;
        corners.push({p:this.project(wx,wz,wy),depth:.342*wx-.94*wz});
      }
      const faces=[{v:[0,1,2,3],color:'#826cac',label:'☾'},{v:[4,7,6,5],color:'#f4be68',label:'☀'},{v:[0,4,5,1],color:'#ca7435'},{v:[1,5,6,2],color:'#e28a43'},{v:[2,6,7,3],color:'#df8844'},{v:[3,7,4,0],color:'#b66a39'}];
      faces.sort((a,b)=>a.v.reduce((s,i)=>s+corners[i].depth,0)-b.v.reduce((s,i)=>s+corners[i].depth,0));
      ctx.save();ctx.globalAlpha=alpha;for(const face of faces){const pts=face.v.map(i=>corners[i].p);this.polygon(pts,face.color,'#402b2999');if(face.label){const x=pts.reduce((s,p)=>s+p.x,0)/4,y=pts.reduce((s,p)=>s+p.y,0)/4;ctx.fillStyle='#fff';ctx.textAlign='center';ctx.font=`${this.scale*.7}px sans-serif`;ctx.fillText(face.label,x,y+4);}}ctx.restore();
    }
    draw(timestamp) {
      if(!this.level)return;
      const bounds=this.container.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,2);this.w=bounds.width;this.h=bounds.height;
      if(this.canvas.width!==Math.round(this.w*ratio)||this.canvas.height!==Math.round(this.h*ratio)){this.canvas.width=Math.round(this.w*ratio);this.canvas.height=Math.round(this.h*ratio);}
      this.ctx.setTransform(ratio,0,0,ratio,0,0);this.ctx.clearRect(0,0,this.w,this.h);
      this.scale=Math.min(this.w/(this.level.width*1.88+this.level.height*.684+2),this.h/(this.level.width*.394+this.level.height*1.086+9));
      const frame=this.frame(timestamp),tiles=[];
      this.level.tiles.forEach((row,r)=>row.forEach((s,c)=>{if(s!=='.')tiles.push({r,c,s,depth:.342*c-.94*r});}));tiles.sort((a,b)=>a.depth-b.depth);
      for(const tile of tiles)this.tile(tile.r,tile.c,tile.s,timestamp);
      if(this.state.echo){const e={...this.state.echo,pose:'V'};this.body(e,this.position(e),e.rotation,.27);}
      if(!this.hiddenPlayer)this.body(this.state,frame.position,frame.rotation);
      if(!this.transition&&this.state.status==='playing'){
        for(const cell of this.safeCells()){const x=(cell.c-this.center.c)*2,z=(cell.r-this.center.r)*2;this.ctx.save();this.ctx.globalAlpha=.35;this.polygon([[x-.8,z-.8],[x+.8,z-.8],[x+.8,z+.8],[x-.8,z+.8]].map(p=>this.project(...p,.04)),'#6de8a1','#bbffce');this.ctx.restore();}
        this.ctx.save();this.ctx.strokeStyle=endColor(this.state);this.ctx.lineWidth=2;for(const cell of C.cells(this.state)){const x=(cell.c-this.center.c)*2,z=(cell.r-this.center.r)*2;this.ctx.beginPath();for(const [i,p]of[[x-.9,z-.9],[x+.9,z-.9],[x+.9,z+.9],[x-.9,z+.9]].entries()){const point=this.project(...p,.03);i?this.ctx.lineTo(point.x,point.y):this.ctx.moveTo(point.x,point.y);}this.ctx.closePath();this.ctx.stroke();}this.ctx.restore();
      }
    }
  }

  class ThreeRenderer extends BaseRenderer {
    constructor(container,settings) {
      super(container,settings);this.scene=new THREE.Scene();this.camera=new THREE.OrthographicCamera(-20,20,16,-16,.1,180);
      this.camera.position.set(15.4,31.8,-42.3);this.camera.lookAt(0,0,0);
      this.renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});this.renderer.domElement.id='game-canvas';this.renderer.setClearColor(0,0);this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));container.prepend(this.renderer.domElement);
      this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;
      this.scene.add(new THREE.AmbientLight(0xcfd8dc,.85));const sun=new THREE.DirectionalLight(0xfffbeb,1.3);sun.position.set(20,35,-15);sun.castShadow=true;sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-30;sun.shadow.camera.right=30;sun.shadow.camera.top=30;sun.shadow.camera.bottom=-30;this.scene.add(sun);
      const rim=new THREE.DirectionalLight(0x56daeb,.5);rim.position.set(-20,15,25);this.scene.add(rim);
      this.board=new THREE.Group();this.scene.add(this.board);this.footprint=new THREE.Group();this.scene.add(this.footprint);this.preview=new THREE.Group();this.scene.add(this.preview);this.player=new THREE.Group();this.scene.add(this.player);this.echo=new THREE.Group();this.scene.add(this.echo);
      this.placeholder();this.loadCharacter();this.loop=t=>{this.draw(t);requestAnimationFrame(this.loop);};requestAnimationFrame(this.loop);
    }
    dispose(group){group.traverse(o=>{o.geometry?.dispose();if(o.material){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.map?.dispose();m.dispose();}}});group.clear();}
    texture(label,color='#fff',background=null){const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');if(background){ctx.fillStyle=background;ctx.fillRect(0,0,128,128);}ctx.fillStyle=color;ctx.font='74px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,64,67);return new THREE.CanvasTexture(canvas);}
    badges(group){for(const[y,label,color]of[[2.18,'☀','#f4cc72'],[-2.18,'☾','#c1bafa']]){const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:this.texture(label,color),transparent:true,depthWrite:false}));sprite.scale.set(.85,.85,.85);sprite.position.y=y;group.add(sprite);}}
    placeholder(){this.dispose(this.player);const material=new THREE.MeshStandardMaterial({color:0xe69b57,roughness:.55});const body=new THREE.Mesh(new THREE.BoxGeometry(1.85,3.8,1.85),material);body.castShadow=true;this.player.add(body);this.badges(this.player);}
    loadCharacter(){
      if(!THREE.GLTFLoader)return;
      // The character remains on the author's public CDN; only the rendering library is bundled locally.
      new THREE.GLTFLoader().load('https://polyfork.dev/cdn/kid-in-a-skeleton-6bb49d.glb',gltf=>{
        const model=gltf.scene;model.rotation.y=Math.PI;
        const bag=model.getObjectByName('attach-righthand-mesh');if(bag){bag.parent.remove(bag);bag.geometry.dispose();}
        const left=model.getObjectByName('LeftArm'),right=model.getObjectByName('RightArm');if(left)left.rotation.z=-Math.PI*.43;if(right)right.rotation.z=Math.PI*.43;
        model.updateMatrixWorld(true);
        // Measure the lowered-arm pose after removing the bag rather than the exported T-pose.
        const box=new THREE.Box3(),point=new THREE.Vector3();
        model.traverse(o=>{
          if(!o.isMesh)return;o.castShadow=true;o.receiveShadow=true;
          const positions=o.geometry.getAttribute('position');
          for(let i=0;i<positions.count;i++){
            point.fromBufferAttribute(positions,i);if(o.isSkinnedMesh)o.boneTransform(i,point);
            box.expandByPoint(point.applyMatrix4(o.matrixWorld));
          }
        });
        const height=box.getSize(new THREE.Vector3()).y;if(!height||!Number.isFinite(height))return;
        const scale=3.8/height,center=box.getCenter(new THREE.Vector3());model.scale.setScalar(scale);model.position.copy(center).multiplyScalar(-scale);
        this.dispose(this.player);this.player.add(model);this.badges(this.player);
      },undefined,()=>{document.getElementById('edition').textContent='3D · 端点方块';});
    }
    quaternion(rotation){const m=new THREE.Matrix4();m.set(rotation[0],rotation[3],rotation[6],0,rotation[1],rotation[4],rotation[7],0,rotation[2],rotation[5],rotation[8],0,0,0,0,1);return new THREE.Quaternion().setFromRotationMatrix(m);}
    createExitGlow(x,z){
      const group=new THREE.Group();group.position.set(x,0,z);
      const half=.96,border=new THREE.Shape();
      border.moveTo(-half,-half);border.lineTo(half,-half);border.lineTo(half,half);border.lineTo(-half,half);border.closePath();
      const inset=half-.09,inner=new THREE.Path();
      inner.moveTo(-inset,-inset);inner.lineTo(-inset,inset);inner.lineTo(inset,inset);inner.lineTo(inset,-inset);inner.closePath();border.holes.push(inner);
      const rim=new THREE.Mesh(new THREE.ShapeGeometry(border),new THREE.MeshBasicMaterial({
        color:0x84f4ff,transparent:true,opacity:.95,toneMapped:false,blending:THREE.AdditiveBlending,depthWrite:false
      }));
      rim.rotation.x=-Math.PI/2;rim.position.y=.035;group.add(rim);
      const uniforms={pulse:{value:1},opacity:{value:1}};
      const vertexShader=`
        varying vec2 vUv;
        void main(){
          vUv=uv;
          gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
        }
      `;
      const options={uniforms,vertexShader,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,side:THREE.DoubleSide};
      const halo=new THREE.Mesh(new THREE.PlaneGeometry(4.8,4.8),new THREE.ShaderMaterial({...options,fragmentShader:`
        uniform float pulse;
        uniform float opacity;
        varying vec2 vUv;
        void main(){
          vec2 offset=abs(vUv-.5);
          float edge=max(offset.x,offset.y);
          float glow=exp(-abs(edge-.2)*30.0);
          float opening=smoothstep(.165,.2,edge);
          gl_FragColor=vec4(.12,.78,1.0,glow*opening*.55*pulse*opacity);
        }
      `}));
      halo.rotation.x=-Math.PI/2;halo.position.y=.025;group.add(halo);
      const beamHeight=2.7;
      const beam=new THREE.Mesh(new THREE.CylinderGeometry(half*Math.SQRT2,half*Math.SQRT2,beamHeight,4,1,true),new THREE.ShaderMaterial({...options,fragmentShader:`
        uniform float pulse;
        uniform float opacity;
        varying vec2 vUv;
        void main(){
          float fade=pow(1.0-vUv.y,2.0);
          gl_FragColor=vec4(.12,.78,1.0,fade*.14*pulse*opacity);
        }
      `}));
      beam.rotation.y=Math.PI/4;beam.position.y=beamHeight/2+.04;group.add(beam);
      const count=12,positions=new Float32Array(count*3),phases=new Float32Array(count);
      for(let i=0;i<count;i++){
        const angle=i*2.39996,radius=half*(.45+(i%3)*.18);
        positions[i*3]=Math.cos(angle)*radius;positions[i*3+2]=Math.sin(angle)*radius;phases[i]=i/count;
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.BufferAttribute(positions,3));geometry.setAttribute('phase',new THREE.BufferAttribute(phases,1));
      const particles=new THREE.Points(geometry,new THREE.ShaderMaterial({
        uniforms:{time:{value:0},height:{value:beamHeight},opacity:{value:1}},transparent:true,depthWrite:false,toneMapped:false,blending:THREE.AdditiveBlending,
        vertexShader:`
          uniform float time;
          uniform float height;
          attribute float phase;
          varying float visibility;
          void main(){
            float rise=fract(time*.24+phase);
            vec3 point=position;
            point.y=.08+rise*height;
            visibility=sin(rise*3.14159);
            gl_Position=projectionMatrix*modelViewMatrix*vec4(point,1.0);
            gl_PointSize=3.0+visibility*2.0;
          }
        `,
        fragmentShader:`
          uniform float opacity;
          varying float visibility;
          void main(){
            float radius=length(gl_PointCoord-.5);
            float alpha=(1.0-smoothstep(.08,.5,radius))*visibility*opacity;
            gl_FragColor=vec4(.55,.95,1.0,alpha);
          }
        `
      }));
      particles.frustumCulled=false;group.add(particles);
      const light=new THREE.PointLight(0x38dfff,2.4,6);light.position.y=.45;group.add(light);
      this.board.add(group);return {group,rim,halo,beam,particles,light,uniforms};
    }
    updateExitGlow(timestamp){
      if(!this.exitGlow)return;
      const glow=this.exitGlow,unlocked=(this.state.activated&this.level.requiredMask)===this.level.requiredMask;
      const time=this.settings.reduced?0:timestamp/1000,pulse=this.settings.reduced?1:.82+Math.sin(time*2)*.18;
      glow.group.visible=this.floorOpacity>0;
      glow.rim.material.color.set(unlocked?0x84f4ff:0x74808b);
      glow.rim.material.opacity=(unlocked?.75+pulse*.25:.6)*this.floorOpacity;
      glow.halo.visible=glow.beam.visible=glow.particles.visible=glow.light.visible=unlocked;
      glow.uniforms.pulse.value=pulse;glow.uniforms.opacity.value=this.floorOpacity;
      glow.particles.material.uniforms.time.value=time;glow.particles.material.uniforms.opacity.value=this.floorOpacity;
      glow.light.intensity=2.4*pulse*this.floorOpacity;
    }
    build(level,state){
      super.build(level,state);this.dispose(this.board);this.exitGlow=null;this.tiles=[];this.player.visible=true;
      for(let r=0;r<level.height;r++)for(let c=0;c<level.width;c++){
        const symbol=level.tiles[r][c];if(symbol==='.')continue;
        if(symbol==='E'){
          const x=(c-this.center.c)*2,z=(r-this.center.r)*2;
          const material=new THREE.MeshBasicMaterial({color:0x020408,side:THREE.DoubleSide,transparent:true});
          const floor=new THREE.Mesh(new THREE.PlaneGeometry(1.92,1.92),material);floor.rotation.x=-Math.PI/2;floor.position.set(x,-.3,z);this.board.add(floor);
          for(const [dx,dz,rotation]of[[0,-.96,0],[0,.96,Math.PI],[.96,0,-Math.PI/2],[-.96,0,Math.PI/2]]){
            const wall=new THREE.Mesh(new THREE.PlaneGeometry(1.92,.3),material);wall.position.set(x+dx,-.15,z+dz);wall.rotation.y=rotation;this.board.add(wall);
          }
          const edges=new THREE.LineSegments(new THREE.EdgesGeometry(floor.geometry),new THREE.LineBasicMaterial({color:0x020408,transparent:true,opacity:.24}));floor.add(edges);
          this.tiles.push({r,c,symbol,mesh:floor,edges,label:null});this.exitGlow=this.createExitGlow(x,z);continue;
        }
        const bridge=/^[a-z]$/.test(symbol);const color=bridge?(level.mechanisms.find(m=>m.bridge===symbol)?.kind==='echo'?'#3b8690':'#64795e'):(PALETTE[symbol]||PALETTE['#']);
        const material=new THREE.MeshStandardMaterial({color,roughness:.86,transparent:true});const tile=new THREE.Mesh(new THREE.BoxGeometry(1.91,.3,1.91),material);tile.position.set((c-this.center.c)*2,-.15,(r-this.center.r)*2);tile.receiveShadow=true;this.board.add(tile);
        const edges=new THREE.LineSegments(new THREE.EdgesGeometry(tile.geometry),new THREE.LineBasicMaterial({color:bridge?0x82bbc4:0x687e8a,transparent:true,opacity:.24}));tile.add(edges);
        const data={r,c,symbol,mesh:tile,edges,label:null};
        if(LABELS[symbol]||symbol==='I'){
          const tex=this.texture(symbol==='I'?'╱':LABELS[symbol],symbol==='I'?'#d5effe':'#f4eee1');const label=new THREE.Mesh(new THREE.PlaneGeometry(1.35,1.35),new THREE.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,side:THREE.DoubleSide}));label.rotation.x=-Math.PI/2;label.position.y=.165;tile.add(label);data.label=label;
        }
        this.tiles.push(data);
      }
      // Visible connections share the mechanism's symbol and avoid relying on color alone.
      for(const mechanism of level.mechanisms){if(!mechanism.bridge)continue;const trigger=this.tiles.find(t=>t.symbol===mechanism.symbol),target=this.tiles.find(t=>t.symbol===mechanism.bridge);if(!trigger||!target)continue;const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(trigger.mesh.position.x,.05,trigger.mesh.position.z),new THREE.Vector3(target.mesh.position.x,.05,target.mesh.position.z)]),new THREE.LineBasicMaterial({color:0xb9dfe1,transparent:true,opacity:.15}));this.board.add(line);}
      this.sync(state);this.resize();
    }
    sync(state){super.sync(state);this.player.visible=true;this.updateFootprint();this.dispose(this.echo);if(state.echo){const body=new THREE.Mesh(new THREE.BoxGeometry(1.8,3.8,1.8),new THREE.MeshBasicMaterial({color:0x6cecf2,transparent:true,opacity:.2,depthWrite:false}));this.echo.add(body);this.badges(this.echo);const p=this.position({...state.echo,pose:'V'});this.echo.position.set(p.x,p.y,p.z);this.echo.quaternion.copy(this.quaternion(state.echo.rotation));}this.echo.visible=Boolean(state.echo);}
    highlight(direction){super.highlight(direction);this.updateFootprint();}
    updateFootprint(){this.dispose(this.footprint);this.dispose(this.preview);if(this.state.status!=='playing')return;for(const cell of C.cells(this.state)){const geo=new THREE.EdgesGeometry(new THREE.BoxGeometry(1.96,.02,1.96));const ring=new THREE.LineSegments(geo,new THREE.LineBasicMaterial({color:endColor(this.state),transparent:true,opacity:.8}));ring.position.set((cell.c-this.center.c)*2,.025,(cell.r-this.center.r)*2);this.footprint.add(ring);}for(const cell of this.safeCells()){const plane=new THREE.Mesh(new THREE.PlaneGeometry(1.65,1.65),new THREE.MeshBasicMaterial({color:0x7affe1,transparent:true,opacity:.27,depthWrite:false,side:THREE.DoubleSide}));plane.rotation.x=-Math.PI/2;plane.position.set((cell.c-this.center.c)*2,.04,(cell.r-this.center.r)*2);this.preview.add(plane);}}
    resize(){const w=this.container.clientWidth,h=this.container.clientHeight;this.renderer.setSize(w,h,false);const aspect=w/h;const projectedWidth=this.level?(this.level.width*1.88+this.level.height*.684+4):28,projectedHeight=this.level?(this.level.width*.394+this.level.height*1.086+10):25;const height=Math.max(projectedHeight,projectedWidth/aspect);this.camera.left=-height*aspect/2;this.camera.right=height*aspect/2;this.camera.top=height/2;this.camera.bottom=-height/2;this.camera.updateProjectionMatrix();}
    draw(timestamp){
      if(!this.level)return;if(this.lastWidth!==this.container.clientWidth||this.lastHeight!==this.container.clientHeight){this.resize();this.lastWidth=this.container.clientWidth;this.lastHeight=this.container.clientHeight;}
      const f=this.frame(timestamp);this.player.position.set(f.position.x,f.position.y,f.position.z);this.player.quaternion.copy(this.quaternion(f.rotation));
      if(f.transition?.kind==='roll'){
        const tr=f.transition,t=ease(Math.min((timestamp-tr.start)/tr.duration,1));const p=this.position(tr.before);const horizontal=tr.dir==='LEFT'||tr.dir==='RIGHT',sign=(tr.dir==='DOWN'||tr.dir==='RIGHT')?1:-1;
        const half=horizontal?(tr.before.pose==='COL'?2:1):(tr.before.pose==='ROW'?2:1);const pivot=new THREE.Vector3(p.x+(horizontal?sign*half:0),0,p.z+(horizontal?0:sign*half));
        const axis=horizontal?new THREE.Vector3(0,0,-sign):new THREE.Vector3(sign,0,0),q=new THREE.Quaternion().setFromAxisAngle(axis,t*Math.PI/2);
        this.player.position.copy(new THREE.Vector3(p.x,p.y,p.z).sub(pivot).applyQuaternion(q).add(pivot));this.player.quaternion.copy(q.multiply(this.quaternion(tr.before.rotation)));
      }
      this.footprint.visible=!this.transition;for(const tile of this.tiles){const broken=this.state.broken.includes(tile.r+','+tile.c),bridge=/^[a-z]$/.test(tile.symbol),open=!bridge||C.bridgeOpen(this.level,this.state,tile.symbol);tile.mesh.visible=!broken;tile.mesh.material.opacity=this.floorOpacity*(open?1:.13);tile.mesh.material.depthWrite=open&&this.floorOpacity>.99;tile.edges.material.opacity=this.floorOpacity*(open?.24:.48);if(tile.label)tile.label.material.opacity=this.floorOpacity;const m=this.level.bySymbol[tile.symbol];if(tile.label&&m)tile.label.material.color.set(this.state.activated&(1<<m.index)?'#ffe495':'#fff');}
      this.preview.visible=!this.transition;
      this.updateExitGlow(timestamp);
      this.renderer.render(this.scene,this.camera);
    }
  }
  root.RollRenderers={CanvasRenderer,ThreeRenderer};
})(globalThis);
