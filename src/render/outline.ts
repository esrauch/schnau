/**
 * The cel look's line art: a post pass that draws a line wherever the depth
 * jumps (silhouettes) or the surface turns sharply (creases). Lines aren't
 * black ink: each is a darker, richer shade of the nearer surface's colour,
 * so a green bush gets a deep green edge (the Wind Waker way).
 *
 * The scene is drawn twice per frame: once in color (with its depth), once
 * with every material swapped for view-space normals. A full-screen quad then
 * finds edges in both and draws them over the color.
 *
 * Depth edges use the Laplacian of 1/viewZ, which is zero across any flat
 * surface at any angle, so the ground doesn't sprout lines toward the horizon.
 *
 * The contour is separate: a thick line around only the *outside* of chosen
 * objects (the hero), to pop them off the scene. Objects opt in with
 * `layers.enable(CONTOUR_LAYER)`; a third pass draws just them, flat white,
 * into a mask, and the quad rings each masked shape. Hidden parts still count,
 * so the contour shows through whatever stands in front.
 */
import * as THREE from 'three';

/** Objects on this layer get the contour. */
export const CONTOUR_LAYER = 1;

export interface OutlineOptions {
  /** Line half-width in CSS pixels (scaled by the pixel ratio). */
  readonly width?: number;
  /** How dark a line is next to its surface (0 = black, 1 = invisible). */
  readonly shade?: number;
  /** The contour's colour, or null for none. */
  readonly contour?: number | null;
  /** The contour's width in CSS pixels. */
  readonly contourWidth?: number;
}

export class Outline {
  private readonly color: THREE.WebGLRenderTarget;
  private readonly normals: THREE.WebGLRenderTarget;
  private readonly mask: THREE.WebGLRenderTarget;
  private readonly normalMaterial = new THREE.MeshNormalMaterial();
  private readonly maskMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
  private readonly quadScene = new THREE.Scene();
  private readonly quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly uniforms: {
    tColor: THREE.IUniform<THREE.Texture>;
    tNormal: THREE.IUniform<THREE.Texture>;
    tDepth: THREE.IUniform<THREE.Texture | null>;
    texel: THREE.IUniform<THREE.Vector2>;
    near: THREE.IUniform<number>;
    far: THREE.IUniform<number>;
    shade: THREE.IUniform<number>;
    tMask: THREE.IUniform<THREE.Texture>;
    contourColor: THREE.IUniform<THREE.Color>;
    contourOn: THREE.IUniform<boolean>;
    contourTexel: THREE.IUniform<THREE.Vector2>;
  };
  private readonly width: number;
  private readonly contourWidth: number;

  constructor(options: OutlineOptions = {}) {
    this.width = options.width ?? 1;
    this.color = new THREE.WebGLRenderTarget(1, 1, {
      samples: 4,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.normals = new THREE.WebGLRenderTarget(1, 1);
    this.mask = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    this.contourWidth = options.contourWidth ?? 3;
    this.uniforms = {
      tColor: { value: this.color.texture },
      tNormal: { value: this.normals.texture },
      tDepth: { value: this.color.depthTexture },
      texel: { value: new THREE.Vector2() },
      near: { value: 0.1 },
      far: { value: 100 },
      shade: { value: options.shade ?? 0.45 },
      tMask: { value: this.mask.texture },
      contourColor: { value: new THREE.Color(options.contour ?? 0xffffff) },
      contourOn: { value: options.contour != null },
      contourTexel: { value: new THREE.Vector2() },
    };
    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      depthTest: false,
      depthWrite: false,
    });
    this.quadScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  }

  /** Change the contour's colour, or turn it off (null). */
  setContour(color: number | null): void {
    this.uniforms.contourOn.value = color !== null;
    if (color !== null) this.uniforms.contourColor.value.set(color);
  }

  /** Match the drawing buffer (device pixels). */
  setSize(width: number, height: number, pixelRatio: number): void {
    this.color.setSize(width, height);
    this.normals.setSize(width, height);
    this.mask.setSize(width, height);
    this.uniforms.texel.value.set(
      (this.width * pixelRatio) / width,
      (this.width * pixelRatio) / height,
    );
    this.uniforms.contourTexel.value.set(
      (this.contourWidth * pixelRatio) / width,
      (this.contourWidth * pixelRatio) / height,
    );
  }

  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera): void {
    this.uniforms.near.value = camera.near;
    this.uniforms.far.value = camera.far;

    renderer.setRenderTarget(this.color);
    renderer.render(scene, camera);

    // The normals pass reuses this frame's shadow map, and needs no background.
    const { autoUpdate } = renderer.shadowMap;
    const background = scene.background;
    renderer.shadowMap.autoUpdate = false;
    scene.background = null;
    scene.overrideMaterial = this.normalMaterial;
    renderer.setRenderTarget(this.normals);
    renderer.render(scene, camera);

    if (this.uniforms.contourOn.value) {
      // Just the contoured objects, flat white on black, no depth test against the rest.
      const layers = camera.layers.mask;
      camera.layers.set(CONTOUR_LAYER);
      scene.overrideMaterial = this.maskMaterial;
      renderer.setRenderTarget(this.mask);
      renderer.render(scene, camera);
      camera.layers.mask = layers;
    }
    scene.overrideMaterial = null;
    scene.background = background;
    renderer.shadowMap.autoUpdate = autoUpdate;

    renderer.setRenderTarget(null);
    renderer.render(this.quadScene, this.quadCamera);
  }
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform sampler2D tDepth;
uniform vec2 texel;
uniform float near;
uniform float far;
uniform float shade;
uniform sampler2D tMask;
uniform vec3 contourColor;
uniform bool contourOn;
uniform vec2 contourTexel;
varying vec2 vUv;

/** 1 / distance: linear in screen space across any plane. */
float invDepth(vec2 uv) {
  return 1.0 / -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far);
}

vec3 normalAt(vec2 uv) {
  return texture2D(tNormal, uv).xyz * 2.0 - 1.0;
}

void main() {
  vec2 dx = vec2(texel.x, 0.0);
  vec2 dy = vec2(0.0, texel.y);

  float c = invDepth(vUv);
  float lapX = abs(invDepth(vUv - dx) + invDepth(vUv + dx) - 2.0 * c);
  float lapY = abs(invDepth(vUv - dy) + invDepth(vUv + dy) - 2.0 * c);
  float depthEdge = smoothstep(0.02, 0.06, max(lapX, lapY) / c);

  vec3 n = normalAt(vUv);
  float turn = max(
    max(1.0 - dot(n, normalAt(vUv + dx)), 1.0 - dot(n, normalAt(vUv - dx))),
    max(1.0 - dot(n, normalAt(vUv + dy)), 1.0 - dot(n, normalAt(vUv - dy)))
  );
  float normalEdge = smoothstep(0.3, 0.6, turn);

  // The line takes the colour of whichever neighbour is nearest the camera.
  // (Written out, not as an array: some Android drivers reject array constructors.)
  vec2 nearest = vUv;
  float best = c;
  float w = invDepth(vUv + dx);
  if (w > best) { best = w; nearest = vUv + dx; }
  w = invDepth(vUv - dx);
  if (w > best) { best = w; nearest = vUv - dx; }
  w = invDepth(vUv + dy);
  if (w > best) { best = w; nearest = vUv + dy; }
  w = invDepth(vUv - dy);
  if (w > best) { nearest = vUv - dy; }
  vec3 nearColor = texture2D(tColor, nearest).rgb;
  // Darker and a touch more saturated, like an inked line in the same hue.
  float grey = dot(nearColor, vec3(0.299, 0.587, 0.114));
  vec3 line = max(mix(vec3(grey), nearColor, 1.4), 0.0) * shade;

  vec3 color = mix(texture2D(tColor, vUv).rgb, line, max(depthEdge, normalEdge));

  if (contourOn) {
    // Outside a masked shape but within the contour's width of it: two rings of 12 samples.
    float inside = texture2D(tMask, vUv).r;
    float reach = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 0.5235988;
      vec2 dir = vec2(cos(a), sin(a)) * contourTexel;
      reach = max(reach, texture2D(tMask, vUv + dir).r);
      reach = max(reach, texture2D(tMask, vUv + dir * 0.5).r);
    }
    color = mix(color, contourColor, reach * (1.0 - inside));
  }

  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}
`;
