import { Group, Mesh, MeshStandardMaterial, CylinderGeometry } from '@iwsdk/core';
import { bevelBox } from './lib/hardsurface.js';
/** Concept A cuff. Meters, screen-normal +Z, wrist along local X.
 * Roughly square broad face: screen opening ~0.21 x 0.19 m; outer 0.27 x 0.25 x 0.025 m.
 * Bold housing with angular copper trim per the concept. Straps encircle the
 * forearm, not the screen; the display is a separate UI asset.
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
  mount('Backplate', 0.27, 0.25, 0.022, 0, 0, -0.018);
  mount('Left Bezel', 0.03, 0.25, 0.028, -0.12, 0, -0.002);
  mount('Right Bezel', 0.03, 0.25, 0.028, 0.12, 0, -0.002);
  mount('Upper Bezel', 0.27, 0.03, 0.028, 0, 0.11, -0.002);
  mount('Lower Bezel', 0.27, 0.03, 0.028, 0, -0.11, -0.002);
  mount('Upper Copper Trim', 0.22, 0.006, 0.007, 0, 0.117, 0.014, copper);
  mount('Lower Copper Trim', 0.22, 0.006, 0.007, 0, -0.117, 0.014, copper);
  mount('Left Copper Trim', 0.006, 0.2, 0.007, -0.127, 0, 0.014, copper);
  mount('Right Copper Trim', 0.006, 0.2, 0.007, 0.127, 0, 0.014, copper);
  // Angular copper corner accents, a concept-A signature.
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const corner = new Mesh(bevelBox(0.034, 0.034, 0.012, 0.003, 0.006, 2), copper);
    corner.name = 'Copper Corner Accent';
    corner.position.set(sx * 0.118, sy * 0.108, 0.01);
    corner.rotation.z = Math.PI / 4;
    root.add(corner);
  }
  for (const x of [-0.1, 0.1]) {
    // Open tube has a wrist-sized hollow instead of a solid cylinder through skin.
    const strap = new Mesh(new CylinderGeometry(0.047, 0.047, 0.05, 24, 1, true), rubber);
    strap.name = x < 0 ? 'Wrist Strap' : 'Forearm Strap';
    strap.rotation.z = Math.PI / 2;
    strap.position.set(x, 0, -0.062); root.add(strap);
    mount('Copper Strap Fastener', 0.022, 0.022, 0.008, x, -0.049, -0.04, copper);
  }
  return root;
}
