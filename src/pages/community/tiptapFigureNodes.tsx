import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import TiptapFileBlockView from './TiptapFileBlockView'
import TiptapEmbedBlockView from './TiptapEmbedBlockView'
import TiptapMediaBlockView from './TiptapMediaBlockView'
import TiptapPollBlockView from './TiptapPollBlockView'

export const FileBlock = Node.create({
  name: 'fileBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      fileId: { default: null },
      presentFields: { default: [], rendered: false },
      status: { default: 'saved' },
      file: { default: null },
      name: { default: null },
      url: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="file"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'file' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TiptapFileBlockView)
  },
})

function mediaBlock(name: 'imageBlock' | 'videoBlock', dataType: 'image' | 'video') {
  return Node.create({
    name,
    group: 'block',
    atom: true,
    selectable: true,
    draggable: true,

    addAttributes() {
      return {
        blockId: { default: null },
        mediaId: { default: null },
        presentFields: { default: [], rendered: false },
        status: { default: 'saved' },
        file: { default: null },
        name: { default: null },
        url: { default: null },
        preview: { default: null },
        width: { default: 75 },
        align: { default: 'center' },
        legacy: { default: null },
      }
    },

    parseHTML() {
      return [{ tag: `figure[data-type="${dataType}"]` }]
    },

    renderHTML({ HTMLAttributes }) {
      return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': dataType })]
    },

    addNodeView() {
      return ReactNodeViewRenderer(TiptapMediaBlockView)
    },
  })
}

export const ImageBlock = mediaBlock('imageBlock', 'image')
export const VideoBlock = mediaBlock('videoBlock', 'video')

export const EmbedBlock = Node.create({
  name: 'embedBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      presentFields: { default: [], rendered: false },
      provider: { default: 'external' },
      kind: { default: 'link' },
      url: { default: null },
      embedUrl: { default: null },
      title: { default: null },
      thumbnailUrl: { default: null },
      description: { default: null },
      image: { default: null },
      siteName: { default: null },
      width: { default: 75 },
      align: { default: 'center' },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="externalEmbed"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'externalEmbed' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TiptapEmbedBlockView)
  },
})

export const PollBlock = Node.create({
  name: 'pollBlock',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      blockId: { default: null },
      presentFields: { default: [], rendered: false },
      pollId: { default: null },
      question: { default: '투표' },
      options: { default: [] },
      closesAt: { default: null },
      closedAt: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="poll"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-type': 'poll' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TiptapPollBlockView)
  },
})
