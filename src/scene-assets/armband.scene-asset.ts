import { Group, Mesh, MeshStandardMaterial, CylinderGeometry } from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface.js';
/** Concept A cuff. Meters, screen-normal +Z, wrist along local X.
 * Screen opening 0.22 x 0.24 m; housing outer envelope 0.25 x 0.25 x 0.025 m.
 * Straps encircle the forearm, not the screen; the display is a separate UI asset.
 */
export function createArmbandHousing(): Group {
  const root = new Group(); root.name = 'Retro Armband Housing';
  const graphite = new MeshStandardMaterial({ color: 0x23282c, roughness: 0.58, metalness: 0.4 });
  const copper = new MeshStandardMaterial({ color: 0x8d6140, roughness: 0.4, metalness: 0.75 });
  const rubber = new MeshStandardMaterial({ color: 0x101415, roughness: 0.95 });
  const mount = (name: string, w: number, h: number, d: number, x: number, y: number, z: number, material = graphite) => {
    const mesh = new Mesh(bevelBox(w, h, d, 0.004, 0.01, 3), material);
    mesh.name = name; mesh.position.set(x, y, z); root.add(mesh);
  };
  mount('Backplate', 0.25, 0.25, 0.022, 0, 0, -0.018);
  mount('Left Bezel', 0.018, 0.25, 0.028, -0.119, 0, -0.002);
  mount('Right Bezel', 0.018, 0.25, 0.028, 0.119, 0, -0.002);
  mount('Upper Bezel', 0.25, 0.018, 0.028, 0, 0.116, -0.002);
  mount('Lower Bezel', 0.25, 0.018, 0.028, 0, -0.116, -0.002);
  mount('Upper Copper Trim', 0.22, 0.005, 0.007, 0, 0.12, 0.014, copper);
  mount('Lower Copper Trim', 0.22, 0.005, 0.007, 0, -0.12, 0.014, copper);
  for (const x of [-0.09, 0.09]) {
    // Open tube has a wrist-sized hollow instead of a solid cylinder through skin.
    const strap = new Mesh(new CylinderGeometry(0.047, 0.047, 0.026, 24, 1, true), rubber);
    strap.name = x < 0 ? 'Wrist Strap' : 'Forearm Strap';
    strap.rotation.z = Math.PI / 2;
    strap.position.set(x, 0, -0.062); root.add(strap);
    mount('Copper Strap Fastener', 0.022, 0.022, 0.008, x, -0.049, -0.04, copper);
  }
  return root;
}
