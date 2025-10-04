import { expect, test } from 'bun:test'

import { render } from '@testing-library/react'

const stateClasses =
  'hover:bg-blue-500 active:border-purple-500 focus:text-black'

test('<element>', async () => {
  expect(
    <button type="button" className={stateClasses}>
      Example
    </button>,
  ).toMatchScreenshot('<element> button')
})

test('group states', async () => {
  expect(
    <div className="flex items-center group gap-2">
      <button type="button" className={stateClasses}>
        Left
      </button>
      <button type="button" className={stateClasses}>
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
