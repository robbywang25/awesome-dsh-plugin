import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { runInNewContext } from 'node:vm'

const source = readFileSync(new URL('../site/assets/command-copy.js', import.meta.url), 'utf8')
function fixture(writeText) {
  const timers = new Map()
  let nextTimer = 0
  const document = { activeElement: null }
  class Element {
    constructor(tag) {
      this.tagName = tag
      this.children = []
      this.listeners = {}
      this.dataset = {}
      this.isConnected = true
      this.disabled = false
      this.open = false
      this.value = ''
      this.textContent = ''
      const classes = new Set()
      this.classList = { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) }
    }
    setAttribute(name, value) { this[name] = value }
    append(...children) { this.children.push(...children) }
    addEventListener(name, action) { this.listeners[name] = action }
    focus() { document.activeElement = this }
    select() { this.selectionStart = 0; this.selectionEnd = this.value.length }
    showModal() { this.open = true }
    close() { this.open = false; this.listeners.close?.() }
  }
  document.body = new Element('body')
  document.createElement = tag => new Element(tag)
  const navigator = writeText ? { clipboard: { writeText } } : {}
  const context = { document, navigator, setTimeout: callback => { const id = ++nextTimer; timers.set(id, callback); return id }, clearTimeout: id => timers.delete(id) }
  runInNewContext(source, context)
  const live = new Element('span')
  const copy = context.createCommandCopier({ copied: 'Copied', failed: 'Copy failed', manual: 'Select and copy', command: 'Command', close: 'Close' }, live)
  const button = new Element('button'); button.dataset.cmd = 'dsh plugin add synthetic-example'; button.textContent = 'Install'
  const menu = new Element('details'); menu.open = true
  return { copy, button, menu, live, document, navigator,
    dialog: () => document.body.children[0],
    flush: () => { for (const [id, callback] of [...timers]) { timers.delete(id); callback() } } }
}

test('successful clipboard write alone produces success and then closes its menu', async () => {
  let copied
  const f = fixture(async command => { copied = command })
  assert.equal(await f.copy(f.button, f.button, f.menu), true)
  assert.equal(copied, f.button.dataset.cmd)
  assert.equal(f.live.textContent, 'Copied')
  assert.equal(f.button.classList.contains('done'), true)
  assert.equal(f.menu.open, true)
  f.flush()
  assert.equal(f.menu.open, false)
  assert.equal(f.button.textContent, 'Install')
})

for (const mode of ['rejected', 'missing']) {
  test(`${mode} clipboard keeps context and offers selected literal text`, async () => {
    const f = fixture(mode === 'rejected' ? async () => { throw new Error('Permission denied') } : undefined)
    const command = 'dsh plugin add "<synthetic & literal>"'
    f.button.dataset.cmd = command
    assert.equal(await f.copy(f.button, f.button, f.menu), false)
    f.flush()
    assert.equal(f.button.textContent, 'Install')
    assert.equal(f.button.classList.contains('done'), false)
    assert.equal(f.menu.open, true)
    assert.equal(f.button.disabled, false)
    assert.equal(f.live.textContent, 'Copy failed')
    const dialog = f.dialog(), textarea = dialog.children.find(x => x.tagName === 'textarea')
    assert.equal(dialog.open, true)
    assert.equal(textarea.value, command)
    assert.equal(textarea.selectionEnd, command.length)
    assert.equal(f.document.activeElement, textarea)
  })
}

test('failure can be dismissed and retried successfully without losing the command', async () => {
  const f = fixture(async () => { throw new Error('Denied') })
  await f.copy(f.button, f.button, f.menu)
  const textarea = f.dialog().children.find(x => x.tagName === 'textarea')
  f.dialog().close()
  assert.equal(f.document.activeElement, f.button)
  assert.equal(textarea.value, '')
  f.navigator.clipboard.writeText = async () => {}
  assert.equal(await f.copy(f.button, f.button, f.menu), true)
  f.flush()
  assert.equal(f.menu.open, false)
})

test('an earlier success timer cannot close the menu after a failed retry', async () => {
  const f = fixture(async () => {})
  await f.copy(f.button, f.button, f.menu)
  f.navigator.clipboard.writeText = async () => { throw new Error('Denied') }
  await f.copy(f.button, f.button, f.menu)
  f.flush()
  assert.equal(f.menu.open, true)
  assert.equal(f.button.textContent, 'Install')
  assert.equal(f.dialog().open, true)
})

test('an older pending copy cannot replace newer success with an error dialog', async () => {
  let reject
  const f = fixture(() => new Promise((_, no) => { reject = no }))
  const old = f.copy(f.button)
  await Promise.resolve()
  const newer = f.document.createElement('button'); newer.dataset.cmd = 'second command'; newer.textContent = 'Second'
  f.navigator.clipboard.writeText = async () => {}
  const pendingNew = f.copy(newer)
  reject(new Error('Old failure'))
  assert.equal(await old, false)
  assert.equal(await pendingNew, true)
  assert.equal(f.dialog(), undefined)
  assert.equal(f.live.textContent, 'Copied')
})

test('windowed cards removed or reused during a write do not receive stale feedback', async () => {
  for (const change of [button => { button.isConnected = false }, button => { button.dataset.cmd = 'replacement' }]) {
    let resolve
    const f = fixture(() => new Promise(yes => { resolve = yes }))
    const pending = f.copy(f.button)
    await Promise.resolve()
    change(f.button); resolve()
    assert.equal(await pending, false)
    assert.equal(f.button.classList.contains('done'), false)
    assert.equal(f.live.textContent, '')
  }
})

test('clipboard side effects are serialized so an old write cannot overwrite the latest success', async () => {
  let finishOld
  let clipboard = ''
  const calls = []
  const f = fixture(command => {
    calls.push(command)
    if (calls.length === 1) return new Promise(resolve => { finishOld = () => { clipboard = command; resolve() } })
    clipboard = command
    return Promise.resolve()
  })
  const old = f.copy(f.button)
  await Promise.resolve()
  const newer = f.document.createElement('button'); newer.dataset.cmd = 'newest command'; newer.textContent = 'New'
  const latest = f.copy(newer)
  await Promise.resolve()
  assert.equal(calls.length, 1)
  finishOld()
  assert.equal(await old, false)
  assert.equal(await latest, true)
  assert.equal(clipboard, newer.dataset.cmd)
  assert.equal(newer.textContent, '✓ Copied')
})

test('a success timer cannot close a newly reopened install menu', async () => {
  const f = fixture(async () => {})
  await f.copy(f.button, f.button, f.menu)
  f.menu.open = false; f.menu.listeners.toggle()
  f.menu.open = true; f.menu.listeners.toggle()
  f.flush()
  assert.equal(f.menu.open, true)
  assert.equal(f.button.textContent, 'Install')
})

test('fallback clicks and Escape preserve the underlying install context', async () => {
  const f = fixture(async () => { throw new Error('Denied') })
  await f.copy(f.button, f.button, f.menu)
  let stopped = 0
  f.dialog().listeners.click({ stopPropagation() { stopped++ } })
  f.dialog().listeners.keydown({ key: 'Escape', stopPropagation() { stopped++ } })
  assert.equal(stopped, 2)
  assert.equal(f.menu.open, true)
})
