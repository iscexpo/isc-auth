const logger = {
  error (code, ...text) {
    console.error(
      `[isc-auth][error][${code.toLowerCase()}]`,
      JSON.stringify(text),
      `\nhttp://localhost/errors#${code.toLowerCase()}`
    )
  },
  warn (code, ...text) {
    console.warn(
      `[isc-auth][warn][${code.toLowerCase()}]`,
      JSON.stringify(text),
      `\nhttp://localhost/warnings#${code.toLowerCase()}`
    )
  },
  debug (code, ...text) {
    if (!process?.env?._ISCAUTH_DEBUG) return
    console.log(
      `[isc-auth][debug][${code.toLowerCase()}]`,
      JSON.stringify(text)
    )
  }
}

export default logger
