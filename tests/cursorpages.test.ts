import { describe, expect, it, vi } from 'vitest'
import type { Page } from '../src'
import { useCursorPages } from '../src/vue/useCursorPages'

type Row = { id: number }
describe('useCursorPages', () => {
  it('drops an older page that lands after reset()', async () => {
    let filter = 'a'
    let release!: (p: Page<Row>) => void
    const load = (cursor: string | null): Promise<Page<Row>> => {
      if (cursor === null) return Promise.resolve(filter === 'a' ? { items: [{ id: 20 }], next_cursor: 'a2' } : { items: [{ id: 10 }], next_cursor: 'b2' })
      return new Promise((r) => (release = r))
    }
    const pages = useCursorPages(load)
    await pages.refresh()
    const older = pages.loadOlder()
    filter = 'b'
    await pages.reset()
    release({ items: [{ id: 19 }], next_cursor: 'a3' })
    await older
    expect(pages.items.value.map((r) => r.id)).toEqual([10])
    expect(pages.hasOlder.value).toBe(true)
    expect(pages.loadingOlder.value).toBe(false)
  })

  it('reads the rows a new arrival pushed off page 1 after older pages were loaded', async () => {
    // Newest first; the cursor is the id of the last row on the page before it.
    let rows = [5, 4, 3, 2, 1].map((id) => ({ id }))
    const load = async (cursor: string | null): Promise<Page<Row>> => {
      const from = cursor === null ? 0 : rows.findIndex((r) => r.id === Number(cursor)) + 1
      const items = rows.slice(from, from + 2)
      const more = from + 2 < rows.length
      return { items, next_cursor: more ? String(items.at(-1)!.id) : null }
    }
    const pages = useCursorPages(load)
    await pages.refresh() // 5, 4
    await pages.loadOlder() // 3, 2
    rows = [{ id: 6 }, ...rows]
    await pages.refresh() // 6, 5; row 4 left page 1
    await vi.waitFor(() => expect(pages.items.value.map((r) => r.id)).toEqual([6, 5, 4, 3, 2]))
    await pages.loadOlder()
    expect(pages.items.value.map((r) => r.id)).toEqual([6, 5, 4, 3, 2, 1])
  })
})
