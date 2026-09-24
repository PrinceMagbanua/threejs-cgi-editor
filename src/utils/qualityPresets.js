// PCFSoftShadowMap=2, PCFShadowMap=1 (raw Three.js constants, no import needed)
// resolutionScale multiplies the effective pixel ratio to render at a fraction
// of the renderer's normal resolution (canvas CSS size is unaffected).
export const QUALITY_PRESETS = {
  High: {
    pixelRatio: () => window.devicePixelRatio,
    resolutionScale: 1,
    shadowEnabled: true,
    shadowType: 2,
    shadowMapSize: 2048,
  },
  Medium: {
    pixelRatio: () => Math.min(window.devicePixelRatio, 1.5),
    resolutionScale: 0.8,
    shadowEnabled: true,
    shadowType: 1,
    shadowMapSize: 512,
  },
  Low: {
    pixelRatio: () => 1,
    resolutionScale: 0.6,
    shadowEnabled: false,
    shadowType: 1,
    shadowMapSize: 512,
  },
}
