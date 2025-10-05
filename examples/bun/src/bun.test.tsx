import { expect, test } from 'bun:test'
import clsx from 'clsx'

import { render } from '@testing-library/react'

const stateClasses =
  'hover:bg-blue-500 active:border-purple-500 focus:text-white'

test('<element>', async () => {
  expect(
    <button type="button" className={stateClasses}>
      Example
    </button>,
  ).toMatchScreenshot('<element> button')
})

test('group states', async () => {
  const groupClasses = clsx(
    'flex-auto',
    'border-4',
    'group-hover:bg-blue-500',
    'group-active:border-purple-500',
  )

  expect(
    // biome-ignore lint/a11y/noNoninteractiveTabindex: example
    <div className="flex items-center group gap-2 w-32" tabIndex={0}>
      <button type="button" className={groupClasses}>
        Left
      </button>
      <button type="button" className={groupClasses}>
        Right
      </button>
    </div>,
  ).toMatchScreenshot('group states')
})

test('brand new component', async () => {
  expect(
    <button type="button" className="bg-red-500 hover:bg-red-700">
      New
    </button>,
  ).toMatchScreenshot('brand new component')
})

test('document interaction', async () => {
  render(
    <button type="button" className={stateClasses}>
      Click me
    </button>,
  )

  expect(document).toMatchScreenshot('document interaction')
})
