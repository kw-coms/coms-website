import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const adminSource = readFileSync('src/pages/Admin.jsx', 'utf8')
const deletedPostModalSource = readFileSync('src/pages/admin/DeletedPostDetailModal.jsx', 'utf8')

assert.match(adminSource, /role="tablist"\s+aria-label="관리자 패널 섹션"/)
assert.match(adminSource, /role="tab"[\s\S]*?aria-selected=\{activeTab === tab\.id\}[\s\S]*?aria-controls=\{`admin-panel-\$\{tab\.id\}`\}/)
assert.match(adminSource, /role="tabpanel"[\s\S]*?aria-labelledby=\{`admin-tab-\$\{activeTab\}`\}/)

assert.match(deletedPostModalSource, /aria-modal="true"[\s\S]*?aria-labelledby="deleted-post-detail-title"/)
assert.match(deletedPostModalSource, /const closeButtonRef = useRef\(null\)/)
assert.match(deletedPostModalSource, /previousActiveElement\?\.focus\?\.\(\)/)
assert.match(deletedPostModalSource, /ref=\{closeButtonRef\}/)

console.log('admin accessibility contract passed')
