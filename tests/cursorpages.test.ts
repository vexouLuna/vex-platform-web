import { describe, expect, it } from 'vitest'
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
})
