import { expect, it } from 'vitest'
import { partnerDestination } from '../../shared/partner-destination'

const project = '/projects/019b2c1f-982f-766f-9248-d85d1467da87'

it('opens the selected project after a partner sign-in', () => {
  expect(partnerDestination(project)).toBe(project)
})

it('uses the server home for an unrelated or malformed destination', () => {
  for (const path of [
    null, '//other.example', '/\\other.example', 'https://other.example/', '/account',
    `${project}/../../account`, `${project}?other=1`, `${project}%2Faccount`,
  ]) expect(partnerDestination(path)).toBe('/')
})
