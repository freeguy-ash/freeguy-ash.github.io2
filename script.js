(() => {
  'use strict';

  /* ---------- helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const goTo = (id) =>
    document.getElementById(id).scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });

  /* ---------- theme ---------- */
  const themeMeta = $('meta[name="theme-color"]');
  const THEME_COLORS = { dark: '#0F1419', light: '#F6F7F9' };

  function setTheme(t) {
    root.dataset.theme = t;
    if (themeMeta) themeMeta.content = THEME_COLORS[t];
    try { localStorage.setItem('theme', t); } catch (e) {}
    return t;
  }
  const toggleTheme = () => setTheme(root.dataset.theme === 'dark' ? 'light' : 'dark');
  setTheme(root.dataset.theme);
  $('#theme-toggle').addEventListener('click', toggleTheme);

  /* ---------- small bits ---------- */
  $('#year').textContent = new Date().getFullYear();
  const isMac = /Mac|iPhone|iPad/.test(navigator.platform || '');
  $('#open-palette kbd').textContent = isMac ? '⌘K' : 'Ctrl K';

  /* ---------- toast + copy email ---------- */
  const toast = $('#toast');
  let toastTimer;
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  async function copyText(value) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = value;
      ta.style.cssText = 'position:fixed;opacity:0';
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) {}
      ta.remove();
      return ok;
    }
  }

  async function copyEmail() {
    const ok = await copyText($('[data-copy]').dataset.copy);
    showToast(ok ? 'Email copied' : 'Could not copy. Select the address instead.');
  }
  $('[data-copy]').addEventListener('click', copyEmail);

  /* ---------- active nav link ---------- */
  const navLinks = $$('.nav a');
  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        navLinks.forEach((a) => {
          if (a.getAttribute('href') === '#' + entry.target.id) a.setAttribute('aria-current', 'true');
          else a.removeAttribute('aria-current');
        });
      });
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );
  $$('main section[id]').forEach((s) => spy.observe(s));

  /* ---------- project filter ---------- */
  const chips = $$('[data-filter]');
  const projects = $$('.project');
  const countEl = $('#project-count');

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      const f = chip.dataset.filter;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      let shown = 0;
      projects.forEach((p) => {
        const match = f === 'all' || p.dataset.tags.split(' ').includes(f);
        p.hidden = !match;
        if (match) shown++;
      });
      countEl.textContent = f === 'all' ? `${projects.length} projects` : `${shown} of ${projects.length} projects`;
    })
  );

  /* ==========================================================
     Terminal. Content is read from the page itself, so the
     HTML stays the single source of truth.
     ========================================================== */
  const termEl = $('#terminal');
  const out = $('#term-out');
  const input = $('#term-input');
  const PROMPT = 'ashwin@portfolio:~$';
  const SECTIONS = ['about', 'projects', 'skills', 'contact'];

  const page = {
    name: () => text($('.hero h1')),
    lead: () => text($('.lead')),
    about: () => $$('.about-text p', $('#about')).map(text),
    projects: () =>
      $$('.project').map((p) => ({
        name: text($('h3', p)),
        desc: text($('p', p)),
        href: $('h3 a', p).href,
        tags: $$('.tags li', p).map(text),
      })),
    skills: () =>
      $$('.tree > li').map((li) => ({
        group: text($(':scope > span', li)),
        items: $$(':scope > ul > li', li).map(text),
      })),
    contact: () =>
      $$('[data-contact]').map((a) => ({ label: a.dataset.contact, text: text(a), href: a.href })),
  };

  const span = (t, cls) => {
    const s = document.createElement('span');
    s.textContent = t;
    if (cls) s.className = cls;
    return s;
  };
  const anchor = (t, href) => {
    const a = document.createElement('a');
    a.textContent = t;
    a.href = href;
    if (/^https?:/.test(href)) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
    return a;
  };
  const group = (...nodes) => {
    const s = document.createElement('span');
    s.append(...nodes);
    return s;
  };

  function line(content, cls = '') {
    const d = document.createElement('div');
    d.className = ('t-line ' + cls).trim();
    if (content instanceof Node) d.append(content);
    else d.textContent = content;
    out.append(d);
    out.scrollTop = out.scrollHeight;
    return d;
  }

  const HELP = [
    ['about', 'a short intro'],
    ['projects', 'things I have built'],
    ['skills', 'languages and tools'],
    ['contact', 'ways to reach me'],
    ['whoami', 'who is this'],
    ['ls', 'list sections'],
    ['cd <name>', 'jump to a section'],
    ['theme', 'switch dark and light'],
    ['clear', 'clear the screen'],
  ];

  const commands = {
    help() {
      line('Commands', 't-h');
      HELP.forEach(([k, v]) => line(group(span(k.padEnd(12), 't-key'), span(v, 't-dim'))));
    },
    whoami() {
      line(page.name(), 't-h');
      line(page.lead());
    },
    about() {
      page.about().forEach((p, i) => line(p, i ? 't-gap' : ''));
    },
    projects() {
      page.projects().forEach((p, i) => {
        line(p.name, 't-h' + (i ? ' t-gap' : ''));
        line(p.desc);
        line(group(span('stack  ', 't-dim'), span(p.tags.join(', '), 't-num')));
        line(group(span('link   ', 't-dim'), anchor(p.href.replace(/^https?:\/\//, ''), p.href)));
      });
    },
    skills() {
      page.skills().forEach((g) =>
        line(group(span(g.group.padEnd(12), 't-key'), span(g.items.join(', '))))
      );
    },
    contact() {
      page.contact().forEach((c) =>
        line(group(span(c.label.padEnd(10), 't-key'), anchor(c.text, c.href)))
      );
    },
    ls() {
      line(SECTIONS.map((s) => s + '/').join('   '), 't-key');
    },
    cd([dest]) {
      if (!dest) return line('usage: cd <about|projects|skills|contact>', 't-dim');
      const id = dest.replace(/[/~]/g, '');
      if (!SECTIONS.includes(id)) return line(`cd: no such section: ${dest}`, 't-err');
      goTo(id);
      line(`Moved to ${id}`, 't-dim');
    },
    theme([mode]) {
      const next = mode === 'dark' || mode === 'light' ? setTheme(mode) : toggleTheme();
      line(`Theme set to ${next}`, 't-dim');
    },
    clear() {
      out.replaceChildren();
    },
    sudo() {
      line('rejish is not in the sudoers file. This incident will be reported.', 't-err');
    },
  };

  function run(raw) {
    const cmd = raw.trim();
    line(group(span(PROMPT + ' ', 't-prompt'), span(cmd)), 't-echo');
    if (!cmd) return;
    const [name, ...args] = cmd.split(/\s+/);
    const key = name.toLowerCase();
    if (Object.hasOwn(commands, key)) commands[key](args);
    else line(`command not found: ${name}. Type help to see what works.`, 't-err');
  }

  /* input handling */
  const history = [];
  let hIdx = 0;
  let booting = false;

  const stopBoot = () => {
    if (!booting) return;
    booting = false;
    input.value = '';
  };

  input.addEventListener('keydown', (e) => {
    stopBoot();
    if (e.key === 'Enter') {
      const v = input.value;
      if (v.trim()) history.push(v);
      hIdx = history.length;
      input.value = '';
      run(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (hIdx > 0) input.value = history[--hIdx];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIdx < history.length - 1) input.value = history[++hIdx];
      else { hIdx = history.length; input.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const v = input.value.trim().toLowerCase();
      if (!v) return;
      const matches = Object.keys(commands).filter((c) => c.startsWith(v));
      if (matches.length === 1) input.value = matches[0];
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      commands.clear();
    }
  });

  termEl.addEventListener('pointerdown', stopBoot);
  termEl.addEventListener('click', (e) => {
    if (e.target.closest('a, button')) return;
    if (!String(getSelection())) input.focus({ preventScroll: true });
  });
  $$('[data-cmd]').forEach((btn) => btn.addEventListener('click', () => run(btn.dataset.cmd)));

  /* the single orchestrated moment: type the first command, once */
  async function boot() {
    const cmd = 'whoami';
    const hint = () => line('Type help for commands, or use the buttons below.', 't-dim t-gap');
    if (reduceMotion) { run(cmd); hint(); return; }
    booting = true;
    await sleep(500);
    for (const ch of cmd) {
      if (!booting) return;
      input.value += ch;
      await sleep(95);
    }
    if (!booting) return;
    await sleep(280);
    booting = false;
    input.value = '';
    run(cmd);
    hint();
  }
  (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(boot);

  /* ==========================================================
     Command palette (Ctrl/Cmd + K)
     ========================================================== */
  const dlg = $('#palette');
  const palInput = $('#pal-input');
  const palList = $('#pal-list');
  const contactLink = (label) => $$('[data-contact]').find((a) => a.dataset.contact === label);

  const actions = [
    { label: 'Go to About', run: () => goTo('about') },
    { label: 'Go to Projects', run: () => goTo('projects') },
    { label: 'Go to Skills', run: () => goTo('skills') },
    { label: 'Go to Contact', run: () => goTo('contact') },
    { label: 'Focus terminal', run: () => { goTo('top'); input.focus({ preventScroll: true }); } },
    { label: 'Switch theme', run: toggleTheme },
    { label: 'Copy email address', run: copyEmail },
    { label: 'Open GitHub', run: () => window.open(contactLink('GitHub').href, '_blank', 'noopener') },
    { label: 'Open LinkedIn', run: () => window.open(contactLink('LinkedIn').href, '_blank', 'noopener') },
  ];

  let filtered = actions;
  let sel = 0;

  function renderPalette() {
    if (!filtered.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'No matching command';
      palList.replaceChildren(li);
      palInput.removeAttribute('aria-activedescendant');
      return;
    }
    palList.replaceChildren(
      ...filtered.map((a, i) => {
        const li = document.createElement('li');
        li.id = 'pal-opt-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', String(i === sel));
        li.textContent = a.label;
        li.addEventListener('click', () => choose(i));
        return li;
      })
    );
    palInput.setAttribute('aria-activedescendant', 'pal-opt-' + sel);
    palList.children[sel].scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    const action = filtered[i];
    if (!action) return;
    dlg.close();
    action.run();
  }

  function openPalette() {
    palInput.value = '';
    filtered = actions;
    sel = 0;
    renderPalette();
    dlg.showModal();
    palInput.focus();
  }

  palInput.addEventListener('input', () => {
    const q = palInput.value.trim().toLowerCase();
    filtered = actions.filter((a) => a.label.toLowerCase().includes(q));
    sel = 0;
    renderPalette();
  });

  palInput.addEventListener('keydown', (e) => {
    if (!filtered.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % filtered.length; renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel - 1 + filtered.length) % filtered.length; renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(sel); }
  });

  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  $('#open-palette').addEventListener('click', openPalette);

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (dlg.open) dlg.close();
      else openPalette();
    }
  });
})();