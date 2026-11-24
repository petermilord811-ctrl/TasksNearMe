import { ShaderLib } from 'three';
import { describe, expect, it } from 'vitest';
import { HOUSE_RISE, houseShaders, treeVertex } from './react-shaders';

// three's own MeshStandardMaterial shaders: the town's materials are all standard ones.
const { vertexShader, fragmentShader } = ShaderLib.standard;

describe("the town's pointer reactions in its shaders", () => {
  it('finds its places in this version of three for the trees', () => {
    const tree = treeVertex(vertexShader, 40);
    expect(tree).not.toBeNull();
    expect(tree).toContain('uniform vec3 uReact;');
    expect(tree).toContain('instanceMatrix[3].xz - uReact.xy');
    expect(tree).toContain('max(0.0, mvPosition.y - 40.0)');
    expect(tree).not.toContain('#include <project_vertex>');
    // After another change to the stage before it (the leaves' sway), still.
    expect(treeVertex(vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.x += 1.0;'), 40)).not.toBeNull();
  });

  it('finds its places for the houses, the glow a uniform', () => {
    const house = houseShaders(vertexShader, fragmentShader, 40);
    expect(house).not.toBeNull();
    expect(house!.vertex).toContain('attribute vec2 reactAnchor;');
    expect(house!.vertex).toContain('vReact = uReact.z');
    expect(house!.vertex).toContain(`transformed.y = 40.0 + (transformed.y - 40.0) * (1.0 + vReact * ${HOUSE_RISE.toFixed(3)});`);
    expect(house!.fragment).toContain('uniform float uGlow;');
    expect(house!.fragment).toContain('totalEmissiveRadiance += diffuseColor.rgb * vReact * uGlow;');
    // Declared before it's used, in both stages.
    expect(house!.vertex.indexOf('varying float vReact;')).toBeLessThan(house!.vertex.indexOf('vReact = '));
    expect(house!.fragment.indexOf('varying float vReact;')).toBeLessThan(house!.fragment.indexOf('* vReact *'));
  });

  it('leaves a shader alone when a place is missing (none of its code goes in)', () => {
    expect(treeVertex('void main() {}', 40)).toBeNull();
    expect(houseShaders(vertexShader, 'void main() {}', 40)).toBeNull();
    expect(houseShaders('void main() {}', fragmentShader, 40)).toBeNull();
  });
});
