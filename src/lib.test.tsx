import { afterAll, afterEach, describe, expect, mock, test } from 'bun:test'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'

import { fileURLToPath } from 'bun'
import debug from 'debug'
import type { Pool } from 'generic-pool'
import type { Browser } from 'puppeteer'
import type { ReactElement } from 'react'

import { name } from '../package.json' with { type: 'json' }
import { visualDiff } from './diff.test.ts'
import { env } from './env.ts'
import {
  __allPlatforms,
  __allStates,
  type Builder,
  type IOptions,
  screenshot,
} from './lib.ts'
import { newPool } from './pool.ts'

// import type { IOptions } from './types/lib.d.ts'

const log: debug.Debugger = debug(`${name}:test:lib`)

const __dirname: string = dirname(fileURLToPath(import.meta.url))
const tmpPath = '__tmp__'
const tmpDir: string = join(__dirname, tmpPath)
const __debug = '__debug__'

export const writeDebug = async (name: string, img: Buffer): Promise<void> => {
  const base = join(process.cwd(), __debug)

  await mkdir(base, { recursive: true })

  const imgPath = join(base, `${encodeURIComponent(name)}.png`)

  await writeFile(imgPath, img)
}

const getFile = async (filters: string[]): Promise<Buffer> => {
  const fname = (await readdir(tmpDir)).find(f =>
    ['.png', ...filters].every(o => f.includes(o)),
  )
  if (!fname) throw new Error(`Could not find file with ${filters}`)

  return await readFile(join(tmpDir, fname))
}

const diff = async (
  name: string,
  left: string[],
  right: string[],
): Promise<void> => {
  const leftBuf = await getFile(left)
  const rightBuf = await getFile(right)

  const diff = await visualDiff(leftBuf, rightBuf)

  await writeDebug(name, diff.img)

  expect(diff.identical).toBe(true)
}

const mtime = async (path: string): Promise<number> => {
  const { mtime } = await stat(path)
  return mtime.getTime()
}

const nameMtime = async (filters: string[], dir: string): Promise<number[]> =>
  await Promise.all(
    (await readdir(dir))
      .filter(n => filters.every(f => n.includes(f)))
      .map(async f => mtime(join(dir, f))),
  )

describe('screenshot', async () => {
  const pool = newPool({ preserveBrowser: env().SPOTCHECK_PRESERVE })
  const css = ['* { width: 75px; }']
  const builder = async (): Promise<string[]> => css

  const cssPaths = ['foobar', 'baz']
  const opts = {
    css: cssPaths,
    path: tmpPath,
    states: ['default'],
  }

  if (env().TEST_CLEAN)
    afterAll(async () => await rm(tmpDir, { recursive: true, force: true }))

  describe('changes', async () => {
    const testElementType = async (
      el: ReactElement | string,
      name: string,
    ): Promise<void> => {
      const args: [
        ReactElement | string,
        string,
        Builder,
        Pool<Browser>,
        IOptions,
      ] = [el, name, builder, pool, opts]

      const fresh = await screenshot(...args)

      expect(fresh.every(r => r.changed)).toBe(true)
      expect(fresh.some(r => r.updated)).toBe(true)
      expect(fresh.map(r => r.platform)).toEqual(
        expect.arrayContaining(__allPlatforms),
      )

      const existing = await screenshot(...args)
      log('testElementType', name, existing)

      const current = existing.find(r => r.platform === process.platform)
      const other = existing.filter(r => r.platform !== process.platform)

      expect(current?.changed).toBe(false)
      expect(current?.updated).toBe(false)

      expect(other.every(r => r.changed)).toBe(true)
      expect(other.every(r => r.updated === false)).toBe(true)
    }

    test('detects changes for JSX', async () => {
      await testElementType(<div>Hello</div>, 'jsx')
    })

    test('detects changes for strings', async () => {
      await testElementType('<div>Hello</div>', 'str')
    })

    test('includes css in changes', async () => {
      const el = <div>Hello</div>
      const name = 'css.changes'

      await screenshot(el, name, builder, pool, opts)

      const results = await screenshot(
        el,
        name,
        async () => ['* { width: 150px; }'],
        pool,
        opts,
      )
      const current = results.find(r => r.platform === process.platform)

      log('css.changes', results)

      expect(current?.changed).toBe(true)
    })
  })

  describe('updates', async () => {
    test('updates if nothing exists', async () => {
      const now = Date.now()

      const name = 'update.nothing'
      const results = await screenshot(
        <div>Hello</div>,
        name,
        builder,
        pool,
        opts,
      )

      const current = results.find(r => r.platform === process.platform)

      expect(current?.changed).toBe(true)
      expect(current?.updated).toBe(true)

      const files = await nameMtime([name, process.platform], tmpDir)

      expect(files.length).toBe(2)
      expect(files.every(t => t > now)).toBe(true)
    })

    test("doesn't update if something exists", async () => {
      const name = 'update.exists'
      const args: [string, Builder, Pool<Browser>, IOptions] = [
        name,
        builder,
        pool,
        opts,
      ]

      await screenshot(<div>Hello</div>, ...args)

      const newest = Math.max(...(await nameMtime([name], tmpDir)))

      const results = await screenshot(<div>Goodbye</div>, ...args)

      const current = results.find(r => r.platform === process.platform)

      expect(current?.changed).toBe(true)
      expect(current?.updated).toBe(false)

      const files = await nameMtime([name, process.platform], tmpDir)

      expect(files.length).toBe(2)
      expect(files.every(t => newest >= t)).toBe(true)
    })

    test.each([
      ['no.changes', <div>Hello</div>, <div>Hello</div>, false],
      ['with.changes', <div>Hello</div>, <div>Goodbye</div>, true],
    ])('updates if forced, %p', async (name, before, after, changed) => {
      const args: [string, Builder, Pool<Browser>, IOptions] = [
        name,
        builder,
        pool,
        { ...opts, update: true },
      ]

      await screenshot(before, ...args)
      const newest = Math.max(
        ...(await nameMtime([name, process.platform], tmpDir)),
      )

      const results = await screenshot(after, ...args)

      const current = results.find(r => r.platform === process.platform)

      expect(current?.changed).toBe(changed)
      expect(current?.updated).toBe(true)

      const files = await nameMtime([name, process.platform], tmpDir)

      expect(files.length).toBe(2)
      expect(files.every(t => newest <= t)).toBe(true)
    })

    test('only updates the current platform', async () => {
      const name = 'update.platform'
      const otherPlatform = __allPlatforms.find(p => p !== process.platform)
      const hash = join(tmpDir, `${name}.${otherPlatform}.hash`)
      await writeFile(hash, 'old')
      const old = await mtime(hash)

      const results = await screenshot(<div>Hello</div>, name, builder, pool, {
        ...opts,
        update: true,
      })

      const current = results.find(r => r.platform === process.platform)

      expect(current?.changed).toBe(true)
      expect(current?.updated).toBe(true)

      expect(old).toBe(await mtime(hash))

      const files = await nameMtime([name, process.platform], tmpDir)

      expect(files.length).toBe(2)
      expect(files.every(t => old < t)).toBe(true)
    })
  })

  describe('builder', async () => {
    const mockBuilder = mock(builder)
    afterEach(() => {
      mockBuilder.mockClear()
    })

    test("doesn't call when there's no css", async () => {
      await screenshot(<div>Hello</div>, 'nocss', mockBuilder, pool, {
        path: tmpPath,
      })

      expect(mockBuilder).not.toHaveBeenCalled()
    })

    test('called correctly', async () => {
      await screenshot(<div>Hello</div>, 'css', mockBuilder, pool, opts)

      expect(mockBuilder).toHaveBeenCalledTimes(1)
      const call = mockBuilder.mock.calls[0] as [string, string[]] | undefined
      if (!call) throw new Error('Builder was not called')

      expect(call[0]).toEqual(expect.stringContaining('<html'))

      expect(call[0]).not.toContain('<style>')
      expect(call[1]).toEqual(expect.arrayContaining(cssPaths))

      expect(mockBuilder.mock.results[0]?.value).resolves.toEqual(
        expect.arrayContaining(css),
      )
    })
  })

  test.serial('throws when nothing is rendered', async () => {
    expect(async () =>
      screenshot('', 'hello-empty', builder, pool),
    ).toThrowErrorMatchingSnapshot()
  })

  test('injects css', async () => {
    const name = 'inject.css'
    let css = ''

    const args: [
      ReactElement | string,
      string,
      Builder,
      Pool<Browser>,
      IOptions,
    ] = [
      <div>Hello</div>,
      name,
      async (): Promise<string[]> => [css],
      pool,
      opts,
    ]

    await screenshot(...args)

    css = '* { color: white }'

    const results = await screenshot(...args)

    expect(results.every(r => r.changed)).toBe(true)
  })

  describe.serial('file handling', async () => {
    const name = 'path'
    const states = ['active', 'hover']
    const args: [ReactElement, string, Builder, Pool<Browser>] = [
      <>
        <div>Foo</div>
        <div>Bar</div>
      </>,
      name,
      builder,
      pool,
    ]
    const fileOpts = {
      states,
      path: tmpPath,
    }

    await screenshot(...args, fileOpts)

    const files = await readdir(tmpDir)
    const stateFiles = files.filter(n =>
      [name, process.platform].every(f => n.includes(f)),
    )

    test('places screenshots where configured', async () => {
      expect(files.some(n => n.includes(name))).toBe(true)
    })

    test('only collects the states configured', async () => {
      expect(
        states.every(str => stateFiles.some(file => file.includes(str))),
      ).toBe(true)
    })

    test('takes a screenshot for each element', async () => {
      const elementIndex = ['0', '1']

      expect(
        elementIndex.every(str => stateFiles.some(file => file.includes(str))),
      ).toBe(true)
    })
  })

  describe('interaction reset', async () => {
    const name = 'reset'
    const css = `
      * { background: blue }
      button:hover { background: red }
      button:active { border: 5px solid green }
      button:focus { color: white }
      `

    const el = <button type="button">Foo</button>
    const args: [Builder, Pool<Browser>] = [
      async (): Promise<string[]> => [css],
      pool,
    ]
    const fileOpts = {
      css: ['foobar'],
      path: tmpPath,
    }

    await screenshot(el, name, ...args, fileOpts)

    test.each(__allStates)('%s is the same', async (state: string) => {
      const stateName = `state.${state}`
      await screenshot(el, stateName, ...args, {
        ...fileOpts,
        states: [state],
      })

      await diff(stateName, [name, state], [stateName, state])
    })
  })

  test("doesn't wait for long animations", async () => {
    const el = <div>foo</div>
    const noAnim = 'no.anim'
    let css = `* { margin: 0; }`

    const args: [Builder, Pool<Browser>, IOptions] = [
      async (): Promise<string[]> => [css],
      pool,
      opts,
    ]

    await screenshot(el, noAnim, ...args)

    css = '* { color: white }'

    const anim = 'anim'

    css = `
      * {
        margin: 0;
        opacity: 1;
        animation: fadeIn 1s ease-in forwards;
      }

      @keyframes fadeIn {
        from {
          opacity: 1;
        }
        to {
          opacity: 0;
        }
      }`

    await screenshot(el, anim, ...args)

    await diff('anim', [noAnim, 'default'], [anim, 'default'])
  })

  // TODO: doesn't leak browser instances
  // TODO: has the correct visual elements, for example, the focus ring. This
  // should be taken care of by the reset test, but that only catches a subset.
})
