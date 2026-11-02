import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

(() => {
  const root = document.querySelector('[data-ps-3d-creator]');
  if (!root || root.dataset.ps3dReady === '1') return;
  root.dataset.ps3dReady = '1';

  let initialized = false, renderer, scene, camera, orbit, raycaster, pointer, selectionHelper;
  let selected = null, mode = 'translate', serial = 0, drag = null;
  const objects = [];

  const q = s => root.querySelector(s);
  const qa = s => [...root.querySelectorAll(s)];
  const fmt = n => (Math.abs(n) < .0005 ? 0 : Number(n)).toFixed(2).replace(/\.00$/, '');
  const status = m => { const el=q('[data-ps-3d-status]'); if(el) el.textContent=m; };

  function ensureInit() {
    if (initialized) return;
    initialized = true;
    const viewport = q('[data-ps-3d-viewport]');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x080d16);
    camera = new THREE.PerspectiveCamera(50,1,.1,500);
    camera.position.set(7,5,8);

    renderer = new THREE.WebGLRenderer({antialias:true,alpha:false});
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    viewport.replaceChildren(renderer.domElement);

    orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = .08;
    orbit.target.set(0,.75,0);
    orbit.update();

    scene.add(new THREE.HemisphereLight(0xcce4ff,0x202632,2));
    const key = new THREE.DirectionalLight(0xffffff,2.1);
    key.position.set(5,8,4); scene.add(key);
    const grid = new THREE.GridHelper(20,20,0x3e526d,0x1d2a3a);
    grid.material.transparent=true; grid.material.opacity=.72; scene.add(grid);
    const axes = new THREE.AxesHelper(2.2); axes.position.y=.01; scene.add(axes);

    raycaster = new THREE.Raycaster();
    pointer = new THREE.Vector2();

    renderer.domElement.addEventListener('pointerdown', onPointerDown, {capture:true});
    renderer.domElement.addEventListener('pointermove', onPointerMove, {capture:true});
    renderer.domElement.addEventListener('pointerup', onPointerUp, {capture:true});
    renderer.domElement.addEventListener('pointercancel', onPointerUp, {capture:true});
    window.addEventListener('resize', resize);
    resize();
    requestAnimationFrame(renderLoop);
  }

  function resize() {
    if(!renderer) return;
    const viewport=q('[data-ps-3d-viewport]');
    if(!viewport) return;
    const r=viewport.getBoundingClientRect();
    if(!r.width || !r.height) return;
    renderer.setSize(r.width,r.height,false);
    camera.aspect=r.width/r.height; camera.updateProjectionMatrix();
  }

  function renderLoop() {
    orbit?.update();
    renderer?.render(scene,camera);
    requestAnimationFrame(renderLoop);
  }

  function geometry(type) {
    if(type==='sphere') return new THREE.SphereGeometry(.85,32,20);
    if(type==='cylinder') return new THREE.CylinderGeometry(.75,.75,1.7,32);
    if(type==='plane') return new THREE.BoxGeometry(2,.08,2);
    return new THREE.BoxGeometry(1.5,1.5,1.5);
  }

  function material() {
    const p=[0xe7445c,0x3f8cff,0x23b26d,0xffb347,0x9b6cff,0x26b9c8];
    return new THREE.MeshStandardMaterial({color:p[objects.length%p.length],roughness:.65,metalness:.05});
  }

  const label = t => ({box:'Cube',sphere:'Sphere',cylinder:'Cylinder',plane:'Plane'}[t] || 'Object');

  function add(type, source=null) {
    ensureInit();
    const mesh = source ? source.clone() : new THREE.Mesh(geometry(type),material());
    if(source){
      mesh.geometry=source.geometry.clone();
      mesh.material=source.material.clone();
      mesh.position.copy(source.position).add(new THREE.Vector3(.65,0,.65));
      mesh.rotation.copy(source.rotation);
      mesh.scale.copy(source.scale);
    } else {
      mesh.position.set((objects.length%3)*.35,type==='plane'?.04:.85,Math.floor(objects.length/3)*.35);
    }
    mesh.userData.psEditable=true;
    mesh.userData.psType=source?.userData?.psType || type;
    mesh.name=`${label(mesh.userData.psType)} ${++serial}`;
    scene.add(mesh); objects.push(mesh); select(mesh);
    status(`${mesh.name} added. ${modeHelp()}`);
  }

  function select(obj) {
    selected = objects.includes(obj) ? obj : null;
    if(selectionHelper){ scene.remove(selectionHelper); selectionHelper.geometry?.dispose?.(); selectionHelper.material?.dispose?.(); selectionHelper=null; }
    if(selected){
      selectionHelper = new THREE.BoxHelper(selected,0xff3153);
      scene.add(selectionHelper);
    }
    syncUI();
  }

  function syncUI() {
    const count=q('[data-ps-3d-object-count]');
    const list=q('[data-ps-3d-object-list]');
    if(count) count.textContent=String(objects.length);
    if(list){
      list.replaceChildren();
      if(!objects.length){
        const e=document.createElement('p'); e.className='ps-3d-creator-object-empty'; e.textContent='No objects yet.'; list.appendChild(e);
      } else {
        objects.forEach(obj=>{
          const b=document.createElement('button'); b.type='button'; b.className='ps-3d-creator-object';
          if(obj===selected) b.classList.add('is-selected');
          b.textContent=obj.name; b.dataset.ps3dSelect=obj.uuid; list.appendChild(b);
        });
      }
    }
    const empty=q('[data-ps-3d-selection-empty]'), box=q('[data-ps-3d-selection]');
    if(!selected){
      if(empty) empty.hidden=false; if(box) box.hidden=true;
    } else {
      if(empty) empty.hidden=true; if(box) box.hidden=false;
      const name=q('[data-ps-3d-selection-name]'), pos=q('[data-ps-3d-position]'), rot=q('[data-ps-3d-rotation]'), scale=q('[data-ps-3d-scale]');
      if(name) name.textContent=selected.name;
      if(pos) pos.textContent=[selected.position.x,selected.position.y,selected.position.z].map(fmt).join(', ');
      if(rot) rot.textContent=[selected.rotation.x,selected.rotation.y,selected.rotation.z].map(v=>fmt(THREE.MathUtils.radToDeg(v))+'°').join(', ');
      if(scale) scale.textContent=[selected.scale.x,selected.scale.y,selected.scale.z].map(fmt).join(', ');
    }
    const dup=q('[data-ps-3d-duplicate]'), del=q('[data-ps-3d-delete]');
    if(dup) dup.disabled=!selected; if(del) del.disabled=!selected;
    qa('[data-ps-3d-transform]').forEach(b=>b.classList.toggle('is-active',b.dataset.ps3dTransform===mode));
  }

  function modeHelp(){
    return mode==='translate' ? 'Move mode: drag the selected object.' :
           mode==='rotate' ? 'Rotate mode: drag the selected object.' :
           'Scale mode: drag the selected object.';
  }

  function pointerXY(ev){
    const r=renderer.domElement.getBoundingClientRect();
    pointer.x=((ev.clientX-r.left)/r.width)*2-1;
    pointer.y=-((ev.clientY-r.top)/r.height)*2+1;
  }

  function hitObject(ev){
    pointerXY(ev); raycaster.setFromCamera(pointer,camera);
    return raycaster.intersectObjects(objects,false)[0]?.object || null;
  }

  function onPointerDown(ev){
    if(ev.button!==0 || !renderer) return;
    const hit=hitObject(ev);
    if(!hit) return;
    select(hit);
    orbit.enabled=false;
    renderer.domElement.setPointerCapture?.(ev.pointerId);
    drag={x:ev.clientX,y:ev.clientY,pos:selected.position.clone(),rot:selected.rotation.clone(),scale:selected.scale.clone()};
    if(mode==='translate'){
      const normal=new THREE.Vector3(); camera.getWorldDirection(normal);
      drag.plane=new THREE.Plane().setFromNormalAndCoplanarPoint(normal,selected.position);
      pointerXY(ev); raycaster.setFromCamera(pointer,camera);
      const p=new THREE.Vector3();
      if(raycaster.ray.intersectPlane(drag.plane,p)) drag.offset=p.clone().sub(selected.position);
      else drag.offset=new THREE.Vector3();
    }
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
    status(`${selected.name}: ${modeHelp()}`);
  }

  function onPointerMove(ev){
    if(!drag || !selected) return;
    const dx=ev.clientX-drag.x, dy=ev.clientY-drag.y;
    if(mode==='translate'){
      pointerXY(ev); raycaster.setFromCamera(pointer,camera);
      const p=new THREE.Vector3();
      if(raycaster.ray.intersectPlane(drag.plane,p)) selected.position.copy(p.sub(drag.offset));
    } else if(mode==='rotate'){
      selected.rotation.set(drag.rot.x + dy*.01, drag.rot.y + dx*.01, drag.rot.z);
    } else {
      const f=Math.max(.05,Math.exp((dx-dy)*.01));
      selected.scale.copy(drag.scale).multiplyScalar(f);
    }
    selected.updateMatrixWorld(true);
    selectionHelper?.update();
    syncUI();
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
  }

  function onPointerUp(ev){
    if(!drag) return;
    drag=null; if(orbit) orbit.enabled=true;
    try{ renderer.domElement.releasePointerCapture?.(ev.pointerId); }catch(_){}
    syncUI();
    ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation();
  }

  function removeSelected(){
    if(!selected) return;
    const victim=selected; select(null);
    scene.remove(victim);
    const i=objects.indexOf(victim); if(i>=0) objects.splice(i,1);
    victim.geometry?.dispose?.(); victim.material?.dispose?.();
    syncUI(); status(`${victim.name} deleted.`);
  }

  function reset(){
    select(null);
    objects.splice(0).forEach(o=>{scene.remove(o);o.geometry?.dispose?.();o.material?.dispose?.();});
    serial=0; camera.position.set(7,5,8); orbit.target.set(0,.75,0); orbit.update();
    syncUI(); status('Scene reset. Add a primitive to begin.');
  }

  root.addEventListener('click', ev=>{
    const b=ev.target.closest('button'); if(!b || !root.contains(b)) return;
    if(b.matches('[data-ps-3d-creator-toggle]')){
      const workspace=q('[data-ps-3d-creator-workspace]'), opening=workspace.hidden;
      workspace.hidden=!opening; b.setAttribute('aria-expanded',opening?'true':'false');
      b.textContent=opening?'Close 3D Creator':'Open 3D Creator';
      if(opening){ensureInit();requestAnimationFrame(resize);syncUI();status(objects.length?'Workspace reopened.':'Workspace ready. Add a primitive to begin.');}
      return;
    }
    if(b.dataset.ps3dAdd){ add(b.dataset.ps3dAdd); return; }
    if(b.dataset.ps3dTransform){
      mode=b.dataset.ps3dTransform; syncUI(); status(selected?`${selected.name}: ${modeHelp()}`:'Choose an object, then drag it in the viewport.'); return;
    }
    if(b.hasAttribute('data-ps-3d-duplicate')){ if(selected) add(selected.userData.psType||'box',selected); return; }
    if(b.hasAttribute('data-ps-3d-delete')){ removeSelected(); return; }
    if(b.hasAttribute('data-ps-3d-reset')){ ensureInit(); reset(); return; }
    if(b.dataset.ps3dSelect){ select(objects.find(o=>o.uuid===b.dataset.ps3dSelect)||null); status(selected?`${selected.name} selected. ${modeHelp()}`:''); }
  });

  syncUI();
})();