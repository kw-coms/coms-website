/**
 * Drift guard for enum-keyed label maps.
 *
 * `enumLabels(enumObject, labelMap)` returns `labelMap` unchanged, but first
 * asserts that every value of the canonical enum (from the vendored
 * coms-shared-contract) has a corresponding label. If the backend renames or
 * removes an enum value, the vendored `enums.js` changes, and any label map
 * that no longer covers the enum throws here at module-evaluation time —
 * which Vite runs during `npm run build`, the test suite runs on import, and
 * the app runs at startup. That turns silent enum drift into a loud failure.
 */
export function enumLabels(enumObject, labelMap) {
  const missing = Object.values(enumObject).filter((value) => !(value in labelMap))
  if (missing.length > 0) {
    throw new Error(
      `enum label drift: missing labels for [${missing.join(', ')}]. ` +
        `Update the label map to match coms-shared-contract enums.`,
    )
  }
  return labelMap
}
