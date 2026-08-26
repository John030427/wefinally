/* WXML 标签配对静态检查（WeFinally UI refactor 自检用） */
const fs = require('fs')
const path = require('path')

const ROOT = process.argv[2]
const VOID = new Set(['input', 'import', 'include', 'wxs'])
let failures = 0

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (name.endsWith('.wxml')) check(p)
  }
}

function check(file) {
  const src = fs.readFileSync(file, 'utf8')
  // 去注释
  const clean = src.replace(/<!--[\s\S]*?-->/g, '')
  const re = /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|[^"'>])*?)(\/)?>/g
  const stack = []
  let m
  while ((m = re.exec(clean)) !== null) {
    const [, closing, tag, , selfClose] = m
    if (!closing && !selfClose && !VOID.has(tag)) stack.push({ tag, index: m.index })
    else if (closing) {
      const top = stack.pop()
      if (!top || top.tag !== tag) {
        console.log(`MISMATCH ${file}: </${tag}> at ${m.index}, stack top = ${top ? top.tag + '@' + top.index : 'empty'}`)
        failures++
        break
      }
    }
  }
  if (stack.length) {
    console.log(`UNCLOSED ${file}: ${stack.map((s) => s.tag + '@' + s.index).join(', ')}`)
    failures++
  }
}

walk(ROOT)
console.log(failures ? `FAIL: ${failures} problem file(s)` : 'WXML OK: all tags balanced')
process.exit(failures ? 1 : 0)
