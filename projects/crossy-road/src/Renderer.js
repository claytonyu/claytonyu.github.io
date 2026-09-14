import * as THREE from "three";
import { CAMERA } from "./config.js";

// Owns the Three.js scene, isometric orthographic camera, lights,
// resize handling, and camera-follow of the player.
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x9fd8ff);
    this.scene.fog = new THREE.Fog(0x9fd8ff, 30, 60);

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this._setCameraFrustum();

    // Fixed isometric orientation; position updated to follow the player.
    this.cameraTarget = new THREE.Vector3(0, 0, 0);

    this._addLights();
    this._onResize = this._onResize.bind(this);
    window.addEventListener("resize", this._onResize);
    this._onResize();
  }

  _addLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.75);
    this.scene.add(ambient);

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(12, 20, 8);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    const d = 20;
    dir.shadow.camera.left = -d;
    dir.shadow.camera.right = d;
    dir.shadow.camera.top = d;
    dir.shadow.camera.bottom = -d;
    dir.shadow.camera.near = 1;
    dir.shadow.camera.far = 80;
    this.dirLight = dir;
    this.scene.add(dir);
    this.scene.add(dir.target);
  }

  _setCameraFrustum() {
    const aspect = window.innerWidth / window.innerHeight || 1;
    const v = CAMERA.viewSize;
    this.camera.left = -v * aspect;
    this.camera.right = v * aspect;
    this.camera.top = v;
    this.camera.bottom = -v;
    this.camera.updateProjectionMatrix();
  }

  _onResize() {
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this._setCameraFrustum();
  }

  add(obj) {
    this.scene.add(obj);
  }

  remove(obj) {
    this.scene.remove(obj);
  }

  // Follow the player in Z only. The camera is horizontally fixed at the
  // playfield center (X = 0) so we don't have to simulate/draw far off to the
  // sides; the player moves left/right within the frame while the world scrolls
  // forward under them.
  follow(targetPos, immediate = false) {
    const lerp = immediate ? 1 : CAMERA.followLerp;
    // Only the Z component tracks the player; X is pinned to the field center.
    this.cameraTarget.x = 0;
    this.cameraTarget.z = THREE.MathUtils.lerp(
      this.cameraTarget.z,
      targetPos.z,
      lerp
    );
    const off = CAMERA.offset;
    this.camera.position.set(
      this.cameraTarget.x + off.x,
      off.y,
      this.cameraTarget.z + off.z
    );
    this.camera.lookAt(this.cameraTarget.x, 0, this.cameraTarget.z);

    // Keep the shadow light following in Z too (X stays centered).
    this.dirLight.position.set(
      this.cameraTarget.x + 12,
      20,
      this.cameraTarget.z + 8
    );
    this.dirLight.target.position.set(
      this.cameraTarget.x,
      0,
      this.cameraTarget.z
    );
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener("resize", this._onResize);
  }
}
