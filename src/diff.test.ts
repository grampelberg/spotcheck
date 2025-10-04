import { describe, expect, test } from 'bun:test'

import sharp from 'sharp'

import { visualDiff } from './diff.ts'

const getDimensions = async (
  img: Buffer,
): Promise<{ width: number; height: number }> => {
  const metadata = await sharp(img).metadata()

  if (metadata.width === undefined || metadata.height === undefined)
    throw new Error('Unable to read stitched image dimensions')

  return { width: metadata.width, height: metadata.height }
}

describe('visualDiff', () => {
  test('mismatched images are not identical', async () => {
    const left = sharp({
      text: {
        text: 'left',
      },
    })
    const leftMeta = await left.metadata()

    const right = sharp({
      text: {
        text: 'right',
      },
    })
    const rightMeta = await right.metadata()

    expect(leftMeta.width).not.toBe(rightMeta.width)

    const { img, identical } = await visualDiff(
      await left.png().toBuffer(),
      await right.png().toBuffer(),
    )
    expect(identical).toBe(false)

    const { width } = await getDimensions(img)

    expect(width).toBeLessThan(Math.max(leftMeta.width, rightMeta.width) * 3)
  })

  test('identical images are actually identical', async () => {
    const src = sharp({
      text: {
        text: 'same',
      },
    })
    const srcMeta = await src.metadata()

    const { img, identical } = await visualDiff(
      await src.png().toBuffer(),
      await src.png().toBuffer(),
    )

    expect(identical).toBe(true)

    const { width } = await getDimensions(img)
    expect(width).toBeGreaterThan(srcMeta.width * 3)
  })

  test('different images are different', async () => {
    const src = { width: 10, height: 10 }

    const left = sharp({
      create: {
        width: src.width,
        height: src.height,
        channels: 4,
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      },
    })
    const right = sharp({
      create: {
        width: src.width,
        height: src.height,
        channels: 4,
        background: { r: 255, g: 255, b: 0, alpha: 1 },
      },
    })

    const { img, identical } = await visualDiff(
      await left.png().toBuffer(),
      await right.png().toBuffer(),
    )

    expect(identical).toBe(false)

    const { width } = await getDimensions(img)
    expect(width).toBeGreaterThan(src.width * 3)
  })
})
