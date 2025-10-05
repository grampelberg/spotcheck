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
    'group-focus:text-green-500',
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

test('document interaction', async () => {
  render(
    <button type="button" className={stateClasses}>
      Click me
    </button>,
  )

  expect(document).toMatchScreenshot('document interaction')
})
