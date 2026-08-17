function isMissingDocumentError(error) {
  const message = String(error && (error.errMsg || error.message) || error || '').toLowerCase()
  return message.includes('document.get:fail') && message.includes('does not exist')
}

async function documentOrNull(read) {
  try {
    const result = await read()
    return result && result.data ? result.data : null
  } catch (error) {
    if (isMissingDocumentError(error)) return null
    throw error
  }
}

module.exports = { isMissingDocumentError, documentOrNull }
