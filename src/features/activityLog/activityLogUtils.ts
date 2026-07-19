// Shared pure helper for club-activity image handling: normalizes the modern
// imageInfos array and the legacy single imageUrl field into one shape.
export function activityImagesFor(item) {
  const infos = Array.isArray(item?.imageInfos) ? item.imageInfos.filter((image) => image?.url) : []
  if (infos.length > 0) return infos
  if (item?.imageUrl) {
    return [{
      id: `${item.id}-legacy-image`,
      url: item.imageUrl,
      originalName: item.imageOriginalName || '활동 사진',
    }]
  }
  return []
}
