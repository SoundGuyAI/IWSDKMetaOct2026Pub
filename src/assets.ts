import { createArmbandHousing } from './scene-assets/armband.scene-asset.js';
/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * THIRD_PARTY_NOTICES file in the root directory of this source tree.
 */

import { AssetType, defineAssets } from '@iwsdk/core';
import {
  createGallerySet,
  createSideboardSet,
} from './scene-assets/decor.scene-asset.js';
import {
  createGraphiteCube,
  createGraphiteGem,
  createGraphiteKnot,
  createGraphiteRing,
  createPlinth,
  createStage,
  createStudioFloor,
} from './scene-assets/studio.scene-asset.js';

const publicAssetUrl = (filePath: string): string =>
  `${import.meta.env.BASE_URL}${filePath.replace(/^\/+/u, '')}`;
const DEFAULT_STOCK_ASSET_BASE =
  'https://cdn.jsdelivr.net/npm/@iwsdk/example-assets@0.4.2/assets';
const configuredStockAssetBase =
  import.meta.env.VITE_IWSDK_EXAMPLE_ASSET_BASE_URL?.trim();
const stockAssetBase = (
  configuredStockAssetBase || DEFAULT_STOCK_ASSET_BASE
).replace(/\/+$/u, '');

function stockAssetUrl(assetId: string, fileName: string): string {
  return `${stockAssetBase}/${assetId}/${fileName}`;
}

const uikitml = (fileName: string, name: string) => ({
  url: publicAssetUrl(`ui/${fileName}`),
  type: AssetType.UIKitML,
  name,
});

export default defineAssets({
  'studio-floor': createStudioFloor(),
  stage: createStage(),
  plinth: createPlinth(),
  'graphite-cube': createGraphiteCube(),
  'graphite-gem': createGraphiteGem(),
  'graphite-knot': createGraphiteKnot(),
  'graphite-ring': createGraphiteRing(),
  'gallery-set': createGallerySet(),
  'sideboard-set': createSideboardSet(),
  robot: {
    url: stockAssetUrl('robot', 'robot.gltf'),
    type: AssetType.GLTF,
    name: 'Robot',
    priority: 'lazy',
  },
  'main-menu-panel': uikitml('main-menu.uikitml', 'Main Menu'),
  'welcome-panel': uikitml('welcome.uikitml', 'Welcome Panel'),
  'gaze-debug-panel': uikitml('gaze-debug.uikitml', 'Gaze Debug Panel'),
  'wall-tones-panel': uikitml(
    'wall-tones-placeholder.uikitml',
    'Wall Tones Placeholder',
  ),
  'wall-tones-head-caption': uikitml(
    'wall-tones-head-caption.uikitml',
    'Wall Tones Head Caption',
  ),
  'wall-tones-armband-housing': createArmbandHousing(),
  'wall-tones-armband': uikitml('wall-tones-armband.uikitml', 'Wall Tones Armband'),
  'demo-nav-panel': uikitml('demo-nav.uikitml', 'Demo Nav'),
  'label-grab': uikitml('label-grab.uikitml', 'Grab Label'),
  'label-select': uikitml('label-select.uikitml', 'Select Label'),
  'label-spin': uikitml('label-spin.uikitml', 'Spin Label'),
});
