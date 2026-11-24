/**
 * The town's reactions to the pointer, in its shaders (town.ts `reactive`, 2026-11-24): three's standard shaders with
 * a few lines added at its include markers. Each returns null when a marker is missing (another three version), and
 * the material then simply doesn't react, rather than half its code going in.
 *
 * Uniforms: `uReact` (where the pointer touches the ground: x, z, and how present it is, 0–1), `uReach` (full
 * strength within x, nothing past y, in world units), `uGlow` (houses: how much they light up near it).
 */

const UNIFORMS = 'uniform vec3 uReact;\nuniform vec2 uReach;\n';

/** How much taller a building stands with the pointer right by it (a fraction of its height). */
export const HOUSE_RISE = 0.07;

/**
 * Trees (instanced at the scene's root, so the instance's matrix places them in the world): the vertex stage with the
 * tree leaning away from where the pointer touches the ground, more the higher up (its foot, at `ground`, stays put).
 */
export function treeVertex(vertexShader: string, ground: number): string | null {
  const marker = '#include <project_vertex>';
  if (!vertexShader.includes(marker)) return null;
  const project = `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
	{
		vec2 away = instanceMatrix[3].xz - uReact.xy;
		float dist = length(away);
		float near = uReact.z * (1.0 - smoothstep(uReach.x, uReach.y, dist));
		vec2 dir = dist > 0.5 ? away / dist : vec2(0.0, 1.0);
		float rise = max(0.0, mvPosition.y - ${ground.toFixed(1)});
		mvPosition.xz += dir * near * rise * 0.2;
		mvPosition.y -= near * rise * 0.03;
	}
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`;
  return UNIFORMS + vertexShader.replace(marker, project);
}

/**
 * Buildings (merged, a `reactAnchor` per vertex: the building's middle on the ground): near the pointer a building
 * stands a touch taller (from the ground up, at `ground`) and glows a little in its own color (`uGlow`).
 */
export function houseShaders(vertexShader: string, fragmentShader: string, ground: number): { vertex: string; fragment: string } | null {
  const markers = [
    [vertexShader, '#include <common>'],
    [vertexShader, '#include <begin_vertex>'],
    [fragmentShader, '#include <common>'],
    [fragmentShader, '#include <emissivemap_fragment>'],
  ] as const;
  if (markers.some(([source, marker]) => !source.includes(marker))) return null;
  const level = ground.toFixed(1);
  const vertex =
    UNIFORMS +
    vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 reactAnchor;\nvarying float vReact;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>\nvReact = uReact.z * (1.0 - smoothstep(uReach.x, uReach.y, distance(reactAnchor, uReact.xy)));\ntransformed.y = ${level} + (transformed.y - ${level}) * (1.0 + vReact * ${HOUSE_RISE.toFixed(3)});`,
      );
  const fragment = fragmentShader
    .replace('#include <common>', '#include <common>\nuniform float uGlow;\nvarying float vReact;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * vReact * uGlow;');
  return { vertex, fragment };
}
