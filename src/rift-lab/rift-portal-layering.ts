/**
 * Portal/menu layer orders. UI panels are transparent and write no depth, so
 * render order decides who paints last. In an XR session the portal and its
 * elements draw under the panel (depth-correct against a panel floating in
 * the room); on flat screens the portal draws over the menu.
 */
export type PortalLayerOrders = {
  note: number;
  spark: number;
  fragment: number;
  fracture: number;
};

export function portalLayerOrders(xr: boolean): PortalLayerOrders {
  return xr
    ? { note: -1, spark: -1, fragment: -1, fracture: -1 }
    : { note: 3, spark: 4, fragment: 3, fracture: 0 };
}
