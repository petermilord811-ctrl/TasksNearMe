#!/usr/bin/env node
// Checks translated message catalogs against English (messages/en). Used by src/i18n/catalog.test.ts.
//   node scripts/i18n-check.mjs                      every namespace of every language
//   node scripts/i18n-check.mjs es postTask review    just these Spanish namespaces
// A translation must keep English's keys, ICU arguments (names and kinds), plural and select options,
// and rich-text tags, and must parse. Missing keys are listed too; they show in English until translated.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse, TYPE } from '@formatjs/icu-messageformat-parser';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MESSAGES = path.join(ROOT, 'messages');

/** Namespaces that stay in English: staff tools (decisions.md, 2026-11-13). */
export const ENGLISH_ONLY = /^(admin|staff)/;

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Every namespace file of a language: { ns: absolutePath }. UI namespaces by file name, plus "server". */
export function namespaceFiles(locale) {
  const files = {};
  const ui = path.join(MESSAGES, locale, 'ui');
  if (fs.existsSync(ui)) for (const f of fs.readdirSync(ui)) if (f.endsWith('.json')) files[f.slice(0, -5)] = path.join(ui, f);
  const server = path.join(MESSAGES, locale, 'app', 'server.json');
  if (fs.existsSync(server)) files.server = server;
  return files;
}

function leaves(tree, prefix = '', out = new Map()) {
  for (const [key, value] of Object.entries(tree)) {
    const at = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) leaves(value, at, out);
    else out.set(at, value);
  }
  return out;
}

/** What a message needs from its caller and how it is shaped: arguments with their kinds, options, tags. */
function signature(elements, out = new Set()) {
  for (const el of elements) {
    switch (el.type) {
      case TYPE.argument: out.add(`{${el.value}}`); break;
      case TYPE.number: out.add(`{${el.value}, number}`); break;
      case TYPE.date: out.add(`{${el.value}, date}`); break;
      case TYPE.time: out.add(`{${el.value}, time}`); break;
      case TYPE.select:
      case TYPE.plural: {
        const kind = el.type === TYPE.select ? 'select' : el.pluralType === 'ordinal' ? 'selectordinal' : 'plural';
        out.add(`{${el.value}, ${kind}: ${Object.keys(el.options).sort().join(' ')}}`);
        for (const option of Object.values(el.options)) signature(option.value, out);
        break;
      }
      case TYPE.tag: out.add(`<${el.value}>`); signature(el.children, out); break;
      default: break;
    }
  }
  return out;
}

function parsed(message) {
  try {
    return { elements: parse(message, { ignoreTag: false, requiresOtherClause: true }) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Problems of one translated namespace against English.
 * errors: wrong keys, broken or different messages. missing: English keys with no translation yet.
 */
export function checkNamespace(englishTree, translatedTree) {
  const errors = [];
  const english = leaves(englishTree);
  const translated = leaves(translatedTree);
  for (const [key, value] of translated) {
    if (!english.has(key)) { errors.push(`${key}: not in English (remove it, or check the key's spelling)`); continue; }
    const source = english.get(key);
    if (typeof value !== 'string') { errors.push(`${key}: must be a string`); continue; }
    if (!value.trim()) { errors.push(`${key}: empty`); continue; }
    const theirs = parsed(value);
    if (theirs.error) { errors.push(`${key}: does not parse (${theirs.error})`); continue; }
    const ours = parsed(source);
    if (ours.error) continue; // English itself is checked by its own tests
    const want = [...signature(ours.elements)].sort().join(' ');
    const got = [...signature(theirs.elements)].sort().join(' ');
    if (want !== got) errors.push(`${key}: arguments, options or tags differ from English\n    English: ${want || '(none)'}\n    here:    ${got || '(none)'}`);
  }
  // Keys that are objects in English but strings here (or the reverse) show up as "not in English" above.
  const missing = [...english.keys()].filter((key) => !translated.has(key));
  return { errors, missing };
}

/** Every language's catalogs. Returns { [locale]: { [ns]: { errors, missing } } }, plus files nobody loads. */
export function checkCatalogs({ locales, only } = {}) {
  const english = namespaceFiles('en');
  const report = {};
  const all = locales ?? fs.readdirSync(MESSAGES).filter((d) => d !== 'en' && fs.statSync(path.join(MESSAGES, d)).isDirectory());
  for (const locale of all) {
    report[locale] = {};
    const translated = namespaceFiles(locale);
    for (const ns of Object.keys(translated)) {
      if (only && !only.includes(ns)) continue;
      if (!english[ns]) { report[locale][ns] = { errors: [`${ns}: no such English namespace`], missing: [] }; continue; }
      let tree;
      try { tree = readJson(translated[ns]); } catch (error) { report[locale][ns] = { errors: [`invalid JSON: ${error.message}`], missing: [] }; continue; }
      report[locale][ns] = checkNamespace(readJson(english[ns]), tree);
    }
    for (const ns of Object.keys(english)) {
      if (only && !only.includes(ns)) continue;
      if (!translated[ns]) report[locale][ns] = { errors: [], missing: [...leaves(readJson(english[ns])).keys()], absent: true };
    }
  }
  return report;
}

function main() {
  const [locale, ...only] = process.argv.slice(2);
  const report = checkCatalogs({ locales: locale ? [locale] : undefined, only: only.length ? only : undefined });
  let failed = false;
  for (const [lang, namespaces] of Object.entries(report)) {
    for (const [ns, { errors, missing, absent }] of Object.entries(namespaces).sort()) {
      if (absent && (ENGLISH_ONLY.test(ns) || !only.length)) {
        if (!ENGLISH_ONLY.test(ns)) console.log(`${lang}/${ns}: not translated yet (${missing.length} messages)`);
        continue;
      }
      if (errors.length) failed = true;
      const status = errors.length ? `${errors.length} error(s)` : 'ok';
      console.log(`${lang}/${ns}: ${status}${missing.length ? `, ${missing.length} missing` : ''}`);
      for (const e of errors) console.log(`  ✗ ${e}`);
      if (only.length) for (const m of missing) console.log(`  · missing ${m}`);
    }
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
