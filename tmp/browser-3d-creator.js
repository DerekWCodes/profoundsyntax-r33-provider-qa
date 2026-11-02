import * as THREE from '../vendor/three-r187.module.min.js';
import { OrbitControls } from '../vendor/OrbitControls-r187.js';
import { TransformControls } from '../vendor/TransformControls-r187.js';

(() => {
    const root = document.querySelector('[data-ps-3d-creator]');
    if (!root || root.dataset.ps3dReady === '1') return;
    root.dataset.ps3dReady = '1';

    const toggle = root.querySelector('[data-ps-3d-creator-toggle]');
    const workspace = root.querySelector('[data-ps-3d-creator-workspace]');
    const viewport = root.querySelector('[data-ps-3d-viewport]');
    const list = root.querySelector('[data-ps-3d-object-list]');
    const count = root.querySelector('[data-ps-3d-object-count]');
    const status = root.querySelector('[data-ps-3d-status]');
    const selectedBox = root.querySelector('[data-ps-3d-selection]');
    const selectedEmpty = root.querySelector('[data-ps-3d-selection-empty]');
    const selectedName = root.querySelector('[data-ps-3d-selection-name]');
    const positionEl = root.querySelector('[data-ps-3d-position]');
    const rotationEl = root.querySelector('[data-ps-3d-rotation]');
    const scaleEl = root.querySelector('[data-ps-3d-scale]');
    const duplicateBtn = root.querySelector('[data-ps-3d-duplicate]');
    const deleteBtn = root.querySelector('[data-ps-3d-delete]');

    let initialized = false;
    let renderer, scene, camera, orbit, transform, raycaster, pointer, animationFrame;
    let selected = null;
    let objectNumber = 0;
    const editable = [];

    const fmt = n => {
        const v = Math.abs(n) < 0.0005 ? 0 : n;
        return Number(v).toFixed(2).replace(/\.00$/, '');
    };

    function setStatus(message) {
        if (status) status.textContent = message;
    }

    function ensureInit() {
        if (initialized) return;
        initialized = true;

        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x080d16);
        camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
        camera.position.set(7, 5, 8);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.shadowMap.enabled = false;
        viewport.appendChild(renderer.domElement);

        orbit = new OrbitControls(camera, renderer.domElement);
        orbit.enableDamping = true;
        orbit.dampingFactor = 0.08;
        orbit.target.set(0, 0.75, 0);
        orbit.update();

        transform = new TransformControls(camera, renderer.domElement);
        const helper = typeof transform.getHelper === 'function' ? transform.getHelper() : transform;
        scene.add(helper);
        transform.addEventListener('dragging-changed', event => { orbit.enabled = !event.value; });
        transform.addEventListener('objectChange', updateInspector);
        transform.addEventListener('change', updateInspector);

        scene.add(new THREE.HemisphereLight(0xcce4ff, 0x202632, 2.0));
        const key = new THREE.DirectionalLight(0xffffff, 2.1);
        key.position.set(5, 8, 4);
        scene.add(key);

        const grid = new THREE.GridHelper(20, 20, 0x3e526d, 0x1d2a3a);
        grid.material.transparent = true;
        grid.material.opacity = 0.72;
        scene.add(grid);

        const axes = new THREE.AxesHelper(2.2);
        axes.position.y = 0.01;
        scene.add(axes);

        raycaster = new THREE.Raycaster();
        pointer = new THREE.Vector2();
        renderer.domElement.addEventListener('pointerdown', selectFromPointer);
        window.addEventListener('resize', resize);
        resize();
        animate();
    }

    function resize() {
        if (!renderer || !viewport) return;
        const rect = viewport.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        renderer.setSize(rect.width, rect.height, false);
        camera.aspect = rect.width / rect.height;
        camera.updateProjectionMatrix();
    }

    function animate() {
        animationFrame = requestAnimationFrame(animate);
        orbit.update();
        renderer.render(scene, camera);
    }

    function makeMaterial() {
        const palette = [0xe7445c, 0x3f8cff, 0x23b26d, 0xffb347, 0x9b6cff, 0x26b9c8];
        return new THREE.MeshStandardMaterial({
            color: palette[editable.length % palette.length],
            roughness: 0.65,
            metalness: 0.05
        });
    }

    function geometryFor(type) {
        switch (type) {
            case 'sphere': return new THREE.SphereGeometry(0.85, 32, 20);
            case 'cylinder': return new THREE.CylinderGeometry(0.75, 0.75, 1.7, 32);
            case 'plane': return new THREE.BoxGeometry(2, 0.08, 2);
            default: return new THREE.BoxGeometry(1.5, 1.5, 1.5);
        }
    }

    function labelFor(type) {
        return ({ box: 'Cube', sphere: 'Sphere', cylinder: 'Cylinder', plane: 'Plane' })[type] || 'Object';
    }

    function addPrimitive(type, cloneSource = null) {
        ensureInit();
        const mesh = cloneSource ? cloneSource.clone() : new THREE.Mesh(geometryFor(type), makeMaterial());
        if (cloneSource) {
            mesh.geometry = cloneSource.geometry.clone();
            mesh.material = cloneSource.material.clone();
            mesh.position.copy(cloneSource.position).add(new THREE.Vector3(0.65, 0, 0.65));
            mesh.rotation.copy(cloneSource.rotation);
            mesh.scale.copy(cloneSource.scale);
        } else {
            mesh.position.set((editable.length % 3) * 0.35, type === 'plane' ? 0.04 : 0.85, Math.floor(editable.length / 3) * 0.35);
        }
        objectNumber += 1;
        mesh.userData.psEditable = true;
        mesh.userData.psType = cloneSource?.userData?.psType || type;
        mesh.name = `${labelFor(mesh.userData.psType)} ${objectNumber}`;
        scene.add(mesh);
        editable.push(mesh);
        selectObject(mesh);
        rebuildOutliner();
        setStatus(`${mesh.name} added. Use Move, Rotate or Scale to edit it.`);
    }

    function selectObject(object) {
        selected = object || null;
        if (selected) transform.attach(selected); else transform.detach();
        duplicateBtn.disabled = !selected;
        deleteBtn.disabled = !selected;
        rebuildOutliner();
        updateInspector();
    }

    function updateInspector() {
        if (!selected) {
            selectedBox.hidden = true;
            selectedEmpty.hidden = false;
            return;
        }
        selectedBox.hidden = false;
        selectedEmpty.hidden = true;
        selectedName.textContent = selected.name;
        positionEl.textContent = [selected.position.x, selected.position.y, selected.position.z].map(fmt).join(', ');
        rotationEl.textContent = [selected.rotation.x, selected.rotation.y, selected.rotation.z].map(v => `${fmt(THREE.MathUtils.radToDeg(v))}°`).join(', ');
        scaleEl.textContent = [selected.scale.x, selected.scale.y, selected.scale.z].map(fmt).join(', ');
    }

    function rebuildOutliner() {
        if (!list) return;
        list.innerHTML = '';
        count.textContent = String(editable.length);
        if (!editable.length) {
            const empty = document.createElement('p');
            empty.className = 'ps-3d-creator-object-empty';
            empty.textContent = 'No objects yet.';
            list.appendChild(empty);
            return;
        }
        editable.forEach(object => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ps-3d-creator-object';
            if (object === selected) button.classList.add('is-selected');
            button.textContent = object.name;
            button.addEventListener('click', () => selectObject(object));
            list.appendChild(button);
        });
    }

    function selectFromPointer(event) {
        if (!renderer || transform.dragging) return;
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        raycaster.setFromCamera(pointer, camera);
        const hit = raycaster.intersectObjects(editable, false)[0];
        if (hit) {
            event.preventDefault();
            selectObject(hit.object);
            setStatus(`${hit.object.name} selected.`);
        }
    }

    function deleteSelected() {
        if (!selected) return;
        const victim = selected;
        transform.detach();
        scene.remove(victim);
        const i = editable.indexOf(victim);
        if (i >= 0) editable.splice(i, 1);
        victim.geometry?.dispose?.();
        if (Array.isArray(victim.material)) victim.material.forEach(m => m.dispose?.()); else victim.material?.dispose?.();
        selected = null;
        rebuildOutliner();
        updateInspector();
        duplicateBtn.disabled = true;
        deleteBtn.disabled = true;
        setStatus(`${victim.name} deleted.`);
    }

    function resetScene() {
        transform?.detach();
        [...editable].forEach(object => {
            scene.remove(object);
            object.geometry?.dispose?.();
            if (Array.isArray(object.material)) object.material.forEach(m => m.dispose?.()); else object.material?.dispose?.();
        });
        editable.length = 0;
        selected = null;
        objectNumber = 0;
        camera.position.set(7, 5, 8);
        orbit.target.set(0, 0.75, 0);
        orbit.update();
        rebuildOutliner();
        updateInspector();
        duplicateBtn.disabled = true;
        deleteBtn.disabled = true;
        setStatus('Scene reset. Add a primitive to begin.');
    }

    toggle?.addEventListener('click', () => {
        const opening = workspace.hidden;
        workspace.hidden = !opening;
        toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
        toggle.textContent = opening ? 'Close 3D Creator' : 'Open 3D Creator';
        if (opening) {
            ensureInit();
            requestAnimationFrame(() => resize());
            setStatus(editable.length ? 'Workspace reopened.' : 'Workspace ready. Add a primitive to begin.');
        }
    });

    root.querySelectorAll('[data-ps-3d-add]').forEach(button => button.addEventListener('click', () => addPrimitive(button.dataset.ps3dAdd)));
    root.querySelectorAll('[data-ps-3d-transform]').forEach(button => button.addEventListener('click', () => {
        ensureInit();
        const mode = button.dataset.ps3dTransform;
        transform.setMode(mode);
        root.querySelectorAll('[data-ps-3d-transform]').forEach(x => x.classList.toggle('is-active', x === button));
        setStatus(selected ? `${mode === 'translate' ? 'Move' : mode === 'rotate' ? 'Rotate' : 'Scale'} tool active for ${selected.name}.` : 'Choose an object, then use the transform tool.');
    }));
    duplicateBtn?.addEventListener('click', () => selected && addPrimitive(selected.userData.psType || 'box', selected));
    deleteBtn?.addEventListener('click', deleteSelected);
    root.querySelector('[data-ps-3d-reset]')?.addEventListener('click', () => { ensureInit(); resetScene(); });

    rebuildOutliner();
})();