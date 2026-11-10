import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import AuthGuard from './AuthGuard'

describe('protected routes', () => {
  function renderProtectedRoute(authenticated: boolean): string {
    return renderToStaticMarkup(
      createElement(
        MemoryRouter,
        { initialEntries: ['/private'] },
        createElement(
          Routes,
          null,
          createElement(
            Route,
            { element: createElement(AuthGuard, { authenticated }) },
            createElement(Route, {
              path: '/private',
              element: createElement('div', null, 'private content'),
            }),
          ),
        ),
      ),
    )
  }

  it('does not render protected content without an authenticated token state', () => {
    expect(renderProtectedRoute(false)).not.toContain('private content')
  })

  it('renders protected content when authenticated', () => {
    expect(renderProtectedRoute(true)).toContain('private content')
  })
})
