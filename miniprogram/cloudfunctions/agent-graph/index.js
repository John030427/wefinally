exports.main = async function main(event, context) {
  const entry = await import('./dist/src/cloudFunction.js')
  return entry.main(event, context)
}
