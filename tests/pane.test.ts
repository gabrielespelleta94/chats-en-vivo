import { expect, test } from 'claude-code/testing'

const PANE = {
  component: 'Pane',
  requestId: 'chats-en-vivo',
  props: {
    title: 'Chats en vivo',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

test('el panel arranca vacío mientras busca chats', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ plugin: 'chats-en-vivo', surface, ...PANE })
    expect(await ui.find({ type: 'Text', text: /Buscando chats/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /0 trabajando/ })).toBeDefined()
    await ui.unmount()
  }
})
