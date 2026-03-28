#!/usr/bin/env node
/**
 * Reconcile Outline VPN keys against SQLite database.
 * Finds orphaned keys in Outline that aren't tracked in the DB.
 *
 * Usage:
 *   node scripts/reconcile-outline-keys.js          # dry-run (report only)
 *   node scripts/reconcile-outline-keys.js --delete  # delete orphaned keys
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const Database = require('better-sqlite3');
const outline = require('../outline');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'vizoguard.db');
const dryRun = !process.argv.includes('--delete');

async function reconcile() {
  const db = new Database(DB_PATH, { readonly: true });
  db.pragma('journal_mode = WAL');

  // Get all known Outline key IDs from DB
  const dbKeys = new Set(
    db.prepare("SELECT outline_key_id FROM licenses WHERE outline_key_id IS NOT NULL AND outline_key_id != 'pending'")
      .all()
      .map(r => String(r.outline_key_id))
  );

  // Get all nodes (including default)
  const nodes = db.prepare("SELECT id, api_url FROM vpn_nodes WHERE status = 'active'").all();
  const apiUrls = [{ id: 'default', api_url: process.env.OUTLINE_API_URL }];
  for (const node of nodes) {
    if (node.api_url && node.api_url !== process.env.OUTLINE_API_URL) {
      apiUrls.push(node);
    }
  }

  db.close();

  let totalOrphans = 0;
  let totalDeleted = 0;

  for (const { id: nodeId, api_url: apiUrl } of apiUrls) {
    if (!apiUrl) continue;
    console.log(`\nChecking node: ${nodeId} (${apiUrl.replace(/\/[a-f0-9-]{30,}\//, '/***/')})`);

    let outlineKeys;
    try {
      outlineKeys = await outline.listAccessKeys(apiUrl);
    } catch (err) {
      console.error(`  ERROR: Failed to list keys — ${err.message}`);
      continue;
    }

    console.log(`  Outline keys: ${outlineKeys.length} | DB keys: ${dbKeys.size}`);

    const orphans = outlineKeys.filter(k => !dbKeys.has(String(k.id)));
    totalOrphans += orphans.length;

    if (orphans.length === 0) {
      console.log('  No orphans found.');
      continue;
    }

    console.log(`  Orphaned keys: ${orphans.length}`);
    for (const key of orphans) {
      console.log(`    - ID: ${key.id}, name: ${key.name || '(unnamed)'}`);
      if (!dryRun) {
        try {
          await outline.deleteAccessKey(String(key.id), apiUrl);
          console.log(`      DELETED`);
          totalDeleted++;
        } catch (err) {
          console.error(`      DELETE FAILED: ${err.message}`);
        }
      }
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Orphaned keys found: ${totalOrphans}`);
  if (dryRun) {
    console.log('Dry run — no keys deleted. Use --delete to remove orphans.');
  } else {
    console.log(`Keys deleted: ${totalDeleted}`);
  }
}

reconcile().catch(err => {
  console.error('Reconciliation failed:', err);
  process.exit(1);
});
