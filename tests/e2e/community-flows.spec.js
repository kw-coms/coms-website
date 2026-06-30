import { expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { mockAdminApis } from './visualSupport.js'

const onePixelGif = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',
  'base64',
)

test('community composer uploads an inline image and deletes the saved post', async ({ page }) => {
  await mockAdminApis(page)
  await page.addInitScript(() => {
    window.confirm = () => true
    window.prompt = () => '작성자 요청 정리'
  })

  let posts = []
  let createPayload = null
  let imageUploadFields = 0
  let updatePayload = null
  let deletePayload = null
  let savedPost = null

  await page.route('**/api/community/posts/91/images/501', (route) => route.fulfill({
    status: 200,
    contentType: 'image/gif',
    body: onePixelGif,
  }))
  await page.route('**/api/community/posts/91/images', async (route) => {
    const body = route.request().postDataBuffer()?.toString('latin1') || ''
    imageUploadFields = (body.match(/name="images"/g) || []).length
    await route.fulfill({ status: 200, json: [501] })
  })
  await page.route('**/api/community/posts/91/comments', (route) => route.fulfill({ status: 200, json: [] }))
  await page.route('**/api/community/posts/91', async (route) => {
    if (route.request().method() === 'PATCH') {
      updatePayload = route.request().postDataJSON()
      savedPost = {
        id: 91,
        title: updatePayload.title,
        content: updatePayload.content,
        category: updatePayload.category,
        authorName: '관리자',
        authorDisplayName: '관리자',
        authorStudentId: '2020123456',
        editable: true,
        createdAt: '2026-06-22T01:00:00',
        updatedAt: '2026-06-22T01:01:00',
        viewCount: 0,
        upvotes: 0,
        downvotes: 0,
        myVote: 0,
        commentCount: 0,
        imageInfos: [{ id: 501, originalName: 'inline.gif', url: '/api/community/posts/91/images/501' }],
      }
      posts = [savedPost]
      await route.fulfill({ status: 200, json: savedPost })
      return
    }
    if (route.request().method() === 'DELETE') {
      deletePayload = route.request().postDataJSON()
      posts = posts.filter((post) => post.id !== 91)
      await route.fulfill({ status: 204 })
      return
    }
    await route.fulfill({ status: 200, json: savedPost })
  })
  await page.route('**/api/community/posts', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, json: posts })
      return
    }
    createPayload = route.request().postDataJSON()
    await route.fulfill({
      status: 200,
      json: {
        id: 91,
        title: createPayload.title,
        content: createPayload.content,
        category: createPayload.category,
        authorName: '관리자',
        authorDisplayName: '관리자',
        authorStudentId: '2020123456',
        editable: true,
        createdAt: '2026-06-22T01:00:00',
        viewCount: 0,
        upvotes: 0,
        downvotes: 0,
        myVote: 0,
        commentCount: 0,
      },
    })
  })

  await page.goto('/community')
  await page.getByRole('button', { name: '글쓰기' }).click()
  await page.locator('.community-compose-title').fill('이미지 업로드 삭제 테스트')
  await page.locator('.community-compose-editor [contenteditable="true"]').fill('이미지 포함 본문')
  await page.locator('.community-compose-editor input[type="file"][accept*="image"]').setInputFiles({
    name: 'inline.gif',
    mimeType: 'image/gif',
    buffer: onePixelGif,
  })
  await expect(page.locator('.community-editor-figure[data-type="image"]')).toHaveCount(1)
  await page.getByRole('button', { name: '글 등록' }).click()

  await expect.poll(() => createPayload).toMatchObject({
    title: '이미지 업로드 삭제 테스트',
    content: '이미지 포함 본문',
    category: 'GENERAL',
  })
  await expect.poll(() => imageUploadFields).toBe(1)
  await expect.poll(() => Boolean(updatePayload)).toBe(true)
  expect(JSON.parse(updatePayload.content)).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'text', content: '이미지 포함 본문' }),
    expect.objectContaining({ type: 'image', mediaId: 501, name: 'inline.gif' }),
  ]))
  await expect(page.getByRole('heading', { name: '이미지 업로드 삭제 테스트' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'inline.gif' })).toBeVisible()

  await page.getByRole('button', { name: '삭제' }).click()

  await expect.poll(() => deletePayload).toEqual({ reason: '작성자 요청 정리' })
  await expect(page).toHaveURL(/\/community$/)
  await expect(page.getByText('이미지 업로드 삭제 테스트')).toHaveCount(0)
})

test('admin member management updates member roles in place', async ({ page }) => {
  await mockAdminApis(page)
  let members = [
    {
      id: 1,
      name: '관리자',
      studentId: '2020123456',
      email: 'admin@example.com',
      emailVerified: true,
      role: 'ADMIN',
    },
    {
      id: 2,
      name: '일반회원',
      studentId: '2025123456',
      email: 'member@example.com',
      emailVerified: true,
      role: 'USER',
    },
  ]
  const rolePayloads = []

  await page.route('**/api/admin/members', (route) => route.fulfill({ status: 200, json: members }))
  await page.route('**/api/admin/members/2/role', async (route) => {
    const payload = route.request().postDataJSON()
    rolePayloads.push(payload)
    const updated = { ...members.find((member) => member.id === 2), role: payload.role }
    members = members.map((member) => (member.id === 2 ? updated : member))
    await route.fulfill({ status: 200, json: updated })
  })

  await page.goto('/admin')
  await page.getByRole('tab', { name: '회원 관리' }).click()

  const memberRow = page.locator('.shape-cut-sm').filter({ hasText: '일반회원' })
  await expect(memberRow).toBeVisible()
  await memberRow.getByRole('button', { name: '관리자 지정' }).click()

  await expect.poll(() => rolePayloads.at(-1)).toEqual({ role: 'ADMIN' })
  await expect(memberRow.getByText('관리자')).toBeVisible()
  await memberRow.getByRole('button', { name: '일반 회원으로' }).click()

  await expect.poll(() => rolePayloads.at(-1)).toEqual({ role: 'USER' })
  await expect(memberRow.getByRole('button', { name: '관리자 지정' })).toBeVisible()
})

test('community composer inserts a poll block that survives re-render', async ({ page }) => {
  await mockAdminApis(page)
  await page.route('**/api/community/posts', (route) => route.fulfill({ status: 200, json: [] }))

  await page.goto('/community')
  await page.getByRole('button', { name: '글쓰기' }).click()
  await page.getByRole('button', { name: '투표' }).click()
  await page.getByRole('textbox', { name: '투표 제목 입력' }).fill('점심 메뉴 투표')
  await page.getByRole('textbox', { name: '보기 1' }).fill('김밥')
  await page.getByRole('textbox', { name: '보기 2' }).fill('라면')
  await page.getByRole('button', { name: '본문에 추가' }).click()

  const pollFigure = page.locator('.community-editor-figure[data-type="poll"]')
  await expect(pollFigure).toHaveCount(1)
  await expect(pollFigure).toContainText('점심 메뉴 투표')

  // A later re-render (typing a title) must NOT recreate the editor and wipe the block.
  await page.locator('.community-compose-title').fill('투표 글')
  await expect(pollFigure).toHaveCount(1)
})
