/**
 * The cel shading every lit surface shares (TECHNICAL.md §4). Each surface is
 * one of two flat tones: lit, where the sun reaches it, or shade, where it
 * doesn't (turned away, or in a shadow). The terminator between them is hard.
 *
 * The tones aren't physical light. Lit is the surface's own colour, warmed a
 * touch. Shade darkens the colour with a power curve, which deepens its
 * saturation as it darkens (cream → biscuit, beige → caramel), then cools it a
 * little: multiplying by blue sky light instead turns warm colours to grey mud.
 * Both come from `cel` in palettes.ts, so the mood can be retuned in one place.
 *
 * Built on MeshToonMaterial, so shadows, fog and vertex colours work as usual:
 * its direct light (already stepped by the ramp, and shadowed) only decides
 * how lit a pixel is, then the tones are mixed in its place.
 */
import * as THREE from 'three';
import { cel } from '../content/palettes';

/** Where the terminator sits, as the sun's angle cosine (0 = side-on). */
const TERMINATOR = 0.12;
const STEPS = 32;

function ramp(): THREE.DataTexture {
  // MeshToonMaterial looks the ramp up at N·L × 0.5 + 0.5.
  const data = new Uint8Array(STEPS);
  for (let i = 0; i < STEPS; i++) data[i] = (i + 0.5) / STEPS >= 0.5 + TERMINATOR / 2 ? 255 : 0;
  const texture = new THREE.DataTexture(data, STEPS, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const TOON_RAMP = ramp();

/** Shared by every cel material; the view sets the sun's colour and strength. */
export const celUniforms = {
  /** The sun's colour × intensity (linear), to tell how lit a pixel is. */
  celSun: { value: new THREE.Color(1, 1, 1) },
  celLitTint: { value: new THREE.Color(cel.litTint) },
  celShadeTint: { value: new THREE.Color(cel.shadeTint) },
  celShadeGamma: { value: cel.shadeGamma },
};

const DECLARATIONS = /* glsl */ `
uniform vec3 celSun;
uniform vec3 celLitTint;
uniform vec3 celShadeTint;
uniform float celShadeGamma;
`;

const SHADING = /* glsl */ `
  // How much sun reached this pixel: 0 in shade, 1 fully lit.
  vec3 fullSun = diffuseColor.rgb * celSun * RECIPROCAL_PI;
  float lit = clamp(dot(reflectedLight.directDiffuse, vec3(1.0)) / max(dot(fullSun, vec3(1.0)), 1e-5), 0.0, 1.0);
  // Snap shadow edges too (the shadow map filters them soft), keeping a pixel of antialiasing.
  float edge = max(fwidth(lit) * 0.5, 1e-3);
  lit = smoothstep(0.5 - edge, 0.5 + edge, lit);
  vec3 shade = pow(max(diffuseColor.rgb, 0.0), vec3(celShadeGamma)) * celShadeTint;
  vec3 outgoingLight = mix(shade, diffuseColor.rgb * celLitTint, lit) + totalEmissiveRadiance;
`;

export function toonMaterial(
  params: THREE.MeshToonMaterialParameters = {},
): THREE.MeshToonMaterial {
  const material = new THREE.MeshToonMaterial({ gradientMap: TOON_RAMP, ...params });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, celUniforms);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${DECLARATIONS}`)
      .replace(
        'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
        SHADING,
      );
  };
  return material;
}

/** Tell the cel materials how strong the sun is (call after changing it). */
export function syncCelSun(sun: THREE.DirectionalLight): void {
  celUniforms.celSun.value.copy(sun.color).multiplyScalar(sun.intensity);
}
