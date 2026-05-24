const logoModules = import.meta.glob('../assets/logos/*.{png,jpg,jpeg,svg,webp}', {
  eager: true,
  import: 'default',
})

const logoAssetMap = Object.fromEntries(
  Object.entries(logoModules).map(([filePath, url]) => {
    const fileName = filePath.split('/').pop()?.replace(/\.[^.]+$/, '')
    return [fileName, url]
  }),
)

export function getLogoAsset(name, fallback = '/coms-logo.png') {
  return logoAssetMap[name] ?? fallback
}
