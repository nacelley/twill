import Quill from 'quill'

Quill.debug('error')

const Delta = Quill.import('delta')
const Break = Quill.import('blots/break')
const Embed = Quill.import('blots/embed')
const Inline = Quill.import('blots/inline')
const Link = Quill.import('formats/link')
const Clipboard = Quill.import('modules/clipboard')

/*
* Support for shift enter
* @see https://github.com/quilljs/quill/issues/252
* @see https://codepen.io/mackermedia/pen/gmNwZP
*/
const lineBreak = {
  blotName: 'break',
  tagName: 'BR'
}

class SmartBreak extends Break {
  length () {
    return 1
  }

  value () {
    return '\n'
  }

  insertInto (parent, ref) {
    Embed.prototype.insertInto.call(this, parent, ref)
  }
}

SmartBreak.blotName = lineBreak.blotName
SmartBreak.tagName = lineBreak.tagName

const lineBreakHandle = {
  key: 13,
  shiftKey: true,
  handler:
    function (range) {
      const currentLeaf = this.quill.getLeaf(range.index)[0]
      const nextLeaf = this.quill.getLeaf(range.index + 1)[0]

      this.quill.insertEmbed(range.index, lineBreak.blotName, true, 'user')

      // Insert a second break if:
      // At the end of the editor, OR next leaf has a different parent (<p>)
      if (nextLeaf === null || (currentLeaf.parent !== nextLeaf.parent)) {
        this.quill.insertEmbed(range.index, lineBreak.blotName, true, 'user')
      }

      // Now that we've inserted a line break, move the cursor forward
      this.quill.setSelection(range.index + 1, Quill.sources.SILENT)
    }
}

function lineBreakMatcher () {
  const newDelta = new Delta()
  newDelta.insert({ break: '' })
  return newDelta
}

Quill.register(SmartBreak)

const anchor = {
  blotName: 'anchor',
  tagName: 'SPAN'
}

class Anchor extends Inline {
  static create (value) {
    const node = super.create(value)
    value = this.sanitize(value)
    node.setAttribute('id', value)
    node.className = 'ql-anchor'
    return node
  }

  static sanitize (id) {
    return id.replace(/\s+/g, '-').toLowerCase()
  }

  static formats (domNode) {
    return domNode.getAttribute('id')
  }

  format (name, value) {
    if (name !== this.statics.blotName || !value) return super.format(name, value)
    value = this.constructor.sanitize(value)
    this.domNode.setAttribute('id', value)
  }
}

Anchor.blotName = anchor.blotName
Anchor.tagName = anchor.tagName

Quill.register(Anchor)

/* Customize Link */
class MyLink extends Link {
  static create (value) {
    const node = super.create(value)
    value = this.sanitize(value)
    node.setAttribute('href', value)

    // relative urls wont have target blank
    const urlPattern = /^((http|https|ftp):\/\/)/
    if (!urlPattern.test(value)) {
      node.removeAttribute('target')
    }

    // url starting with the front-end base url wont have target blank
    if (window[process.env.VUE_APP_NAME].STORE.form.baseUrl) {
      if (value.startsWith(window[process.env.VUE_APP_NAME].STORE.form.baseUrl)) {
        node.removeAttribute('target')
      }
    }

    return node
  }

  format (name, value) {
    super.format(name, value)

    if (name !== this.statics.blotName || !value) {
      return
    }

    // relative urls wont have target blank
    const urlPattern = /^((http|https|ftp):\/\/)/
    if (!urlPattern.test(value)) {
      this.domNode.removeAttribute('target')
      return
    }

    // url starting with the front-end base url wont have target blank
    if (window[process.env.VUE_APP_NAME].STORE.form.baseUrl) {
      if (value.startsWith(window[process.env.VUE_APP_NAME].STORE.form.baseUrl)) {
        this.domNode.removeAttribute('target')
        return
      }
    }

    this.domNode.setAttribute('target', '_blank')
  }
}

Quill.register(MyLink)

class CustomClipboard extends Clipboard {
  cleanDelta (delta) {
    for (let i = delta.ops.length - 1; i >= 0; i--) {
      const item = delta.ops[i]
      if (typeof item.insert === 'object' && typeof item.insert.break !== 'undefined' && Object.keys(item.insert).length === 1 && item.insert.break === '') {
        delta.ops.splice(i, 1)
      }
    }
    return delta
  }

  convertAndClean (html) {
    const delta = this.convert(html)
    return this.cleanDelta(delta)
  }

  onPaste (e) {
    const oldDelta = this.quill.getContents()
    if (e.defaultPrevented || !this.quill.isEnabled()) return
    const range = this.quill.getSelection()
    let delta = this.cleanDelta(new Delta().retain(range.index))

    const scrollTop = this.quill.scrollingContainer.scrollTop
    this.container.focus()
    this.quill.selection.update(Quill.sources.SILENT)
    setTimeout(() => {
      delta = delta.concat(this.convert()).delete(range.length)
      this.quill.updateContents(delta, Quill.sources.USER)
      // range.length contributes to delta.length()
      this.quill.setSelection(delta.length() - range.length, Quill.sources.SILENT)
      this.quill.scrollingContainer.scrollTop = scrollTop
      this.quill.focus()
    }, 1)

    setTimeout(function () {
      const delta = this.quill.getContents()
      this.quill.emitter.emit('text-change', delta, oldDelta, 'user')
    }.bind(this), 1)
  }
}

Quill.register('modules/clipboard', CustomClipboard, true)

/* Custom Icons */
function getIcon (shape) {
  return '<span class="icon icon--wysiwyg_' + shape + '" aria-hidden="true"><svg><title>' + shape + '</title><use xlink:href="#icon--wysiwyg_' + shape + '"></use></svg></span>'
}

const icons = Quill.import('ui/icons') // custom icons
icons.bold = getIcon('bold')
icons.italic = getIcon('italic')
icons.italic = getIcon('italic')
icons.anchor = getIcon('anchor')
icons.link = getIcon('link')
icons.header['1'] = getIcon('header')
icons.header['2'] = getIcon('header-2')
icons.header['3'] = getIcon('header-3')
icons.header['4'] = getIcon('header-4')
icons.header['5'] = getIcon('header-5')
icons.header['6'] = getIcon('header-6')

/*
* ClipBoard manager
* Use formats to authorize what user can paste
* Formats are based on toolbar configuration
*/

const QuillDefaultFormats = [
  'background',
  'bold',
  'color',
  'font',
  'code',
  'italic',
  'link',
  'size',
  'strike',
  'script',
  'underline',
  'blockquote',
  'header',
  'indent',
  'list',
  'align',
  'direction',
  'code-block',
  'formula',
  'image',
  'video'
]

function getQuillFormats (toolbarEls) {
  const formats = [lineBreak.blotName, anchor.blotName] // Allow linebreak and anchor

  function addFormat (format) {
    if (formats.indexOf(format) > -1 || QuillDefaultFormats.indexOf(format) === -1) return
    formats.push(format)
  }

  toolbarEls.forEach((el) => {
    if (typeof el === 'object') {
      for (const property in el) {
        addFormat(property)
      }
    }

    if (typeof el === 'string') {
      addFormat(el)
    }
  })

  return formats
}

export default {
  Quill: Quill,
  lineBreak: {
    handle: lineBreakHandle,
    clipboard: [lineBreak.tagName, lineBreakMatcher]
  },
  getFormats: getQuillFormats
}
