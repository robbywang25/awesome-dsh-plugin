// One truthful copy path for cards, market links, and plugin detail pages.
globalThis.createCommandCopier = function (labels, live) {
  let sequence = 0;
  let feedback;
  let dialog;
  let field;
  let invoker;
  let writes = Promise.resolve();
  const menuCycles = new WeakMap();

  function clearFeedback() {
    if (!feedback) return;
    clearTimeout(feedback.timer);
    if (feedback.button.dataset.cmd === feedback.command) {
      feedback.label.textContent = feedback.original;
      feedback.button.classList.remove('done');
    }
    feedback = undefined;
    if (live) live.textContent = '';
  }

  function manual(command, button) {
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'command-copy-fallback';
      dialog.setAttribute('aria-labelledby', 'command-copy-title');
      const title = document.createElement('h2');
      title.id = 'command-copy-title';
      title.textContent = labels.failed;
      const hint = document.createElement('p');
      hint.textContent = labels.manual;
      field = document.createElement('textarea');
      field.readOnly = true;
      field.rows = 3;
      field.setAttribute('aria-label', labels.command);
      const close = document.createElement('button');
      close.type = 'button';
      close.textContent = labels.close;
      close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('close', () => {
        field.value = '';
        if (invoker?.isConnected) invoker.focus();
      });
      // Closing/using the fallback must not count as an outside menu click.
      dialog.addEventListener('click', event => event.stopPropagation());
      dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
      });
      dialog.append(title, hint, field, close);
      document.body.append(dialog);
    }
    invoker = button;
    field.value = command;
    if (!dialog.open) dialog.showModal();
    field.focus();
    field.select();
  }

  return async function copyCommand(button, label = button, menu = null) {
    if (button.disabled) return false;
    clearFeedback();
    const request = ++sequence;
    const command = button.dataset.cmd;
    if (typeof command !== 'string' || !command) return false;
    button.disabled = true;
    if (menu && !menuCycles.has(menu)) {
      const cycle = {value: 0};
      menuCycles.set(menu, cycle);
      menu.addEventListener('toggle', () => { cycle.value++; });
    }
    const menuCycle = menu ? menuCycles.get(menu).value : null;
    // Clipboard writes cannot be cancelled. Serialize the side effect itself,
    // not just its UI receipt, so an older request cannot overwrite a newer one.
    const preceding = writes;
    let release;
    writes = new Promise(resolve => { release = resolve; });
    const current = () => request === sequence && button.isConnected && button.dataset.cmd === command;
    try {
      await preceding;
      if (!current()) return false;
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(command);
      if (!current()) return false;
      const original = label.textContent;
      label.textContent = '✓ '+labels.copied;
      button.classList.add('done');
      if (live) live.textContent = labels.copied;
      feedback = {button, label, command, original, timer: setTimeout(() => {
        if (!current()) return;
        clearFeedback();
        if (menu?.isConnected && menuCycles.get(menu).value === menuCycle) menu.open = false;
      }, 1200)};
      return true;
    } catch {
      if (current()) {
        if (live) live.textContent = labels.failed;
        manual(command, button);
      }
      return false;
    } finally {
      button.disabled = false;
      release();
    }
  };
};
