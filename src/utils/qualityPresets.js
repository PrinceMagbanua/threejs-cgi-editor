// PCFSoftShadowMap=2, PCFShadowMap=1 (raw Three.js constants, no import needed)
export const QUALITY_PRESETS = {
  High: {
    pixelRatio: () => window.devicePixelRatio,
    shadowEnabled: true,
    shadowType: 2,
    shadowMapSize: 2048,
  },
  Medium: {
    pixelRatio: () => Math.min(window.devicePixelRatio, 1.5),
    shadowEnabled: true,
    shadowType: 1,
    shadowMapSize: 512,
  },
  Low: {
    pixelRatio: () => 1,
    shadowEnabled: false,
    shadowType: 1,
    shadowMapSize: 512,
  },
}
