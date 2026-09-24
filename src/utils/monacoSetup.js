import editorWorker from 'monaco-editor/editor/editor.worker.js?worker'
import jsonWorker from 'monaco-editor/language/json/json.worker.js?worker'

let monacoPromise = null

// Monaco (~5MB) is only needed once the Freeform JSON dialog is opened, so it's
// dynamically imported and memoized here instead of loaded eagerly with the app.
export function loadMonaco() {
  if (!monacoPromise) {
    monacoPromise = import('monaco-editor').then((monaco) => {
      self.MonacoEnvironment = {
        getWorker(_moduleId, label) {
          if (label === 'json') return new jsonWorker()
          return new editorWorker()
        },
      }
      return monaco
    })
  }
  return monacoPromise
}
