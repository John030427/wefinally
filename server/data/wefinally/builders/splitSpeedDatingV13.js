'use strict'

/**
 * Wave-level Speed Dating v1.3 split:
 * TRAIN_CORE / CALIBRATION / DEV / SEALED_TEST
 * Assignment is deterministic from wave hash BEFORE outcome inspection.
 */

const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { PATHS, ensureDir } = require('../paths')
const { readJsonl } = require('../builders/cases')

const SEED = 'wefinally-sd-v1.3-split-seed-42'

function waveBucket(wave) {
  const h = crypto.createHash('sha256').update(`${SEED}:wave:${wave}`).digest()
  return h.readUInt32BE(0) / 0xffffffff
}

function assignPartition(u) {
  // Target ~58% train, 12% cal, 15% dev, 15% sealed by wave hash mass
  if (u < 0.58) return 'TRAIN_CORE'
  if (u < 0.7) return 'CALIBRATION'
  if (u < 0.85) return 'DEV'
  return 'SEALED_TEST'
}

function splitSpeedDatingV13(encountersPath) {
  const src =
    encountersPath || path.join(PATHS.cleaned, 'speed-dating-encounters-v1.3.jsonl')
  const rows = readJsonl(src)
  const byWave = new Map()
  for (const r of rows) {
    const w = String(r.wave)
    if (!byWave.has(w)) byWave.set(w, [])
    byWave.get(w).push(r)
  }

  // Deterministic size-targeted assignment WITHOUT reading outcomes:
  // sort waves by numeric id, then by hash for tie-break; greedily fill TRAIN→CAL→DEV→SEALED quotas.
  const waveList = [...byWave.entries()]
    .map(([wave, list]) => ({
      wave,
      n: list.length,
      u: waveBucket(wave),
      list
    }))
    .sort((a, b) => a.u - b.u || Number(a.wave) - Number(b.wave))

  const total = rows.length
  const targets = {
    TRAIN_CORE: Math.floor(total * 0.6),
    CALIBRATION: Math.floor(total * 0.12),
    DEV: Math.floor(total * 0.14),
    SEALED_TEST: 0 // remainder
  }
  targets.SEALED_TEST = total - targets.TRAIN_CORE - targets.CALIBRATION - targets.DEV

  const waveAssign = {}
  const partitions = {
    TRAIN_CORE: [],
    CALIBRATION: [],
    DEV: [],
    SEALED_TEST: []
  }
  const filled = { TRAIN_CORE: 0, CALIBRATION: 0, DEV: 0, SEALED_TEST: 0 }
  const order = ['TRAIN_CORE', 'CALIBRATION', 'DEV', 'SEALED_TEST']

  for (const w of waveList) {
    let chosen = 'SEALED_TEST'
    for (const part of order) {
      if (part === 'SEALED_TEST') {
        chosen = part
        break
      }
      if (filled[part] + w.n <= targets[part] + total * 0.02 || filled[part] < targets[part] * 0.5) {
        // prefer filling under-filled partitions first
        if (filled[part] < targets[part]) {
          chosen = part
          break
        }
      }
    }
    // If preferred filled, pick the most under-target partition
    let bestGap = -Infinity
    for (const part of order) {
      const gap = targets[part] - filled[part]
      if (gap > bestGap) {
        bestGap = gap
        chosen = part
      }
    }
    waveAssign[w.wave] = { partition: chosen, u: w.u, n: w.n }
    filled[chosen] += w.n
    for (const row of w.list) {
      partitions[chosen].push({
        ...row,
        split_v13: chosen,
        split: chosen.toLowerCase().replace('_', '-')
      })
    }
  }

  // Overlap checks: no wave in multiple partitions; no participant across train∩sealed
  const waveSets = Object.fromEntries(Object.keys(partitions).map((k) => [k, new Set()]))
  for (const [w, meta] of Object.entries(waveAssign)) waveSets[meta.partition].add(w)

  const idsByPart = {}
  for (const [part, list] of Object.entries(partitions)) {
    const s = new Set()
    for (const r of list) {
      s.add(r.iid)
      s.add(r.pid)
    }
    idsByPart[part] = s
  }
  const trainIds = idsByPart.TRAIN_CORE
  const sealedOverlap = [...idsByPart.SEALED_TEST].filter((id) => trainIds.has(id))
  // Note: same person can appear in multiple waves; wave-level split may still share people across partitions.
  // Record participant overlap honestly.
  const participant_overlap_train_sealed = sealedOverlap.length

  const outRoot = ensureDir(path.join(PATHS.splits, 'speed-dating-v1.3'))
  for (const [part, list] of Object.entries(partitions)) {
    const dir = ensureDir(path.join(outRoot, part))
    // Features-only file for sealed during evolution (strip gold)
    if (part === 'SEALED_TEST') {
      const featuresOnly = list.map((r) => {
        const {
          a_to_b_decision,
          b_to_a_decision,
          bilateral_outcome,
          post_interaction_ratings,
          ...rest
        } = r
        return {
          ...rest,
          gold_sealed: true,
          gold_present: false
        }
      })
      fs.writeFileSync(
        path.join(dir, 'features.jsonl'),
        featuresOnly.map((x) => JSON.stringify(x)).join('\n') + '\n'
      )
      // Evaluator-only gold (do not load in evolution predictors)
      fs.writeFileSync(
        path.join(dir, 'gold.jsonl'),
        list
          .map((r) =>
            JSON.stringify({
              case_id: r.case_id,
              a_to_b_decision: r.a_to_b_decision,
              b_to_a_decision: r.b_to_a_decision,
              mutual_match: !!(r.bilateral_outcome && r.bilateral_outcome.mutual_match),
              wave: r.wave,
              iid: r.iid,
              pid: r.pid
            })
          )
          .join('\n') + '\n'
      )
    }
    fs.writeFileSync(path.join(dir, 'encounters.jsonl'), list.map((x) => JSON.stringify(x)).join('\n') + '\n')
  }

  // Also write DEV/TRAIN as convenience for eval without sealed gold peeking
  for (const part of ['TRAIN_CORE', 'CALIBRATION', 'DEV']) {
    fs.writeFileSync(
      path.join(outRoot, part, 'encounters.jsonl'),
      partitions[part].map((x) => JSON.stringify(x)).join('\n') + '\n'
    )
  }

  const checksum = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        seed: SEED,
        waveAssign,
        counts: Object.fromEntries(Object.entries(partitions).map(([k, v]) => [k, v.length]))
      })
    )
    .digest('hex')

  const manifest = {
    version: 'speed-dating-v1.3',
    seed: SEED,
    created_at: new Date().toISOString(),
    identity_note: 'Wave assignment via sha256(seed:wave) before outcome use',
    audit_test_v1_2: 'datasets/wefinally/splits/frozen-gold/match.jsonl RETAINED as AUDIT_TEST_V1_2 only',
    sealed_test_status: 'UNTOUCHED',
    wave_assign: waveAssign,
    counts: Object.fromEntries(Object.entries(partitions).map(([k, v]) => [k, v.length])),
    n_waves: Object.keys(waveAssign).length,
    waves_by_partition: Object.fromEntries(
      Object.keys(partitions).map((k) => [k, [...waveSets[k]].sort((a, b) => Number(a) - Number(b))])
    ),
    participant_overlap_train_sealed,
    checksum,
    creation_logic:
      'waves sorted by sha256(seed:wave); greedy fill TRAIN~60% CAL~12% DEV~14% SEALED~remainder by encounter counts; no outcome inspection'
  }

  fs.writeFileSync(
    path.join(PATHS.splits, 'speed-dating-v1.3-manifest.json'),
    JSON.stringify(manifest, null, 2)
  )

  return manifest
}

module.exports = { splitSpeedDatingV13, waveBucket, assignPartition, SEED }
