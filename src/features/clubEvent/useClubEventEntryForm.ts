import { useCallback, useMemo, useState } from 'react'
import { EMPTY_CLUB_EVENT_ENTRY_FORM, isEventImageFile, mergeFileList } from './clubEventUtils'

export function useClubEventEntryForm() {
  const [entryForm, setEntryForm] = useState(() => ({ ...EMPTY_CLUB_EVENT_ENTRY_FORM }))
  const [entryFiles, setEntryFiles] = useState([])
  const [entryDragActive, setEntryDragActive] = useState(false)

  const resetEntryForm = () => {
    setEntryForm({ ...EMPTY_CLUB_EVENT_ENTRY_FORM })
    setEntryFiles([])
    setEntryDragActive(false)
  }

  const entryFileSizeTotal = useMemo(
    () => entryFiles.reduce((total, file) => total + (Number(file.size) || 0), 0),
    [entryFiles],
  )
  const entryImageFiles = useMemo(() => entryFiles.filter(isEventImageFile), [entryFiles])
  const entryDocumentFiles = useMemo(() => entryFiles.filter((file) => !isEventImageFile(file)), [entryFiles])

  const replaceEntryFileGroup = useCallback((group, nextFiles) => {
    setEntryFiles((current) => {
      const normalizedNext = Array.from(nextFiles || [])
      const kept = current.filter((file) => (group === 'image' ? !isEventImageFile(file) : isEventImageFile(file)))
      return group === 'image' ? [...normalizedNext, ...kept] : [...kept, ...normalizedNext]
    })
  }, [])

  const addEntryFiles = (files) => {
    const nextFiles = Array.from(files || [])
    if (nextFiles.length === 0) return
    setEntryFiles((current) => mergeFileList(current, nextFiles))
  }

  const removeEntryFileAt = (index) => {
    setEntryFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleEntryDrop = (event) => {
    event.preventDefault()
    setEntryDragActive(false)
    addEntryFiles(event.dataTransfer.files)
  }

  return {
    entryForm,
    setEntryForm,
    entryFiles,
    setEntryFiles,
    entryDragActive,
    setEntryDragActive,
    resetEntryForm,
    entryFileSizeTotal,
    entryImageFiles,
    entryDocumentFiles,
    replaceEntryFileGroup,
    addEntryFiles,
    removeEntryFileAt,
    handleEntryDrop,
  }
}
