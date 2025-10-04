import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import sharp from 'sharp'

const png = async (buf: Buffer): Promise<PNG> => {
  const img = new PNG().parse(buf)
  await new Promise(resolve => {
    img.on('parsed', resolve)
  })

  return img
}

const toBuffer = async (img: PNG): Promise<Buffer> => {
  const chunks: Buffer[] = []

  await new Promise(resolve => {
    img
      .pack()
      .on('data', (chunk: Buffer) => {
        chunks.push(chunk)
      })
      .on('end', resolve)
  })

  return Buffer.concat(chunks)
}

export interface DiffResult {
  img: Buffer
  identical: boolean
}

const stitch = async (imgs: Buffer[]): Promise<Buffer> =>
  await sharp(imgs, {
    join: { across: imgs.length, shim: 4 },
  })
    .png()
    .toBuffer()

export const visualDiff = async (
  before: Buffer,
  after: Buffer,
): Promise<DiffResult> => {
  const img1 = await png(before)
  const img2 = await png(after)

  if (img1.width !== img2.width || img1.height !== img2.height)
    return { img: await stitch([before, after]), identical: false }

  const { width, height } = img1

  const output = new PNG({ width, height })

  const mismatch = pixelmatch(img1.data, img2.data, output.data, width, height)

  return {
    img: await stitch([before, after, await toBuffer(output)]),
    identical: mismatch === 0,
  }
}
