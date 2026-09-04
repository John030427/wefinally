'use strict'

const path = require('node:path')
const { copyCoordinationAdapter } = require('../../sync-coordination-adapters.cjs')

const artifact = path.join(__dirname, '..', 'lib', 'coordinationAdapters.cjs')
copyCoordinationAdapter(artifact)
console.log(`wrote ${artifact}`)
