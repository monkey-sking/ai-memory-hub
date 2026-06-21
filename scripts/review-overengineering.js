#!/usr/bin/env node

/**
 * Anti-Overengineering Review Checker
 *
 * Automated checks for common over-engineering patterns.
 * Usage: node scripts/review-overengineering.js [--path src/] [--verbose]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const args = process.argv.slice(2);
const targetPath = args.find(arg => arg.startsWith('--path='))?.split('=')[1] || 'src';
const verbose = args.includes('--verbose');

const findings = [];
const warnings = [];
const info = [];

function addFinding(type, message, file = '', line = 0) {
  const finding = { type, message, file, line };
  if (type === 'error') findings.push(finding);
  else if (type === 'warning') warnings.push(finding);
  else info.push(finding);
}

// Check 1: Large files
function checkFileSize(filePath) {
  const stats = fs.statSync(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').length;

  if (lines > 500) {
    addFinding('error', `File has ${lines} lines (max recommended: 300-500)`, filePath);
  } else if (lines > 300) {
    addFinding('warning', `File has ${lines} lines (consider splitting at 300+)`, filePath);
  }

  return lines;
}

// Check 2: Unused exports
function checkUnusedExports(filePath, allFiles) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const exportMatches = content.matchAll(/export\s+(function|class|const|let|var)\s+([a-zA-Z0-9_]+)/g);

  for (const match of exportMatches) {
    const exportName = match[2];
    const importPattern = new RegExp(`import.*${exportName}|from.*${exportName}`, 'g');

    let usageCount = 0;
    for (const file of allFiles) {
      if (file === filePath) continue;
      const fileContent = fs.readFileSync(file, 'utf-8');
      if (importPattern.test(fileContent)) {
        usageCount++;
      }
    }

    if (usageCount === 0) {
      addFinding('warning', `Exported "${exportName}" has no known imports`, filePath);
    }
  }
}

// Check 3: Single-use abstractions
function checkSingleUseAbstractions(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');

  // Check for interfaces/base classes with only one implementation
  const classMatches = content.matchAll(/class\s+([a-zA-Z0-9_]+)\s+extends\s+([a-zA-Z0-9_]+)/g);
  const baseClasses = new Map();

  for (const match of classMatches) {
    const derived = match[1];
    const base = match[2];
    if (!baseClasses.has(base)) {
      baseClasses.set(base, []);
    }
    baseClasses.get(base).push(derived);
  }

  for (const [base, derivedList] of baseClasses.entries()) {
    if (derivedList.length === 1) {
      addFinding('warning', `Base class/interface "${base}" has only 1 implementation: ${derivedList[0]}`, filePath);
    }
  }
}

// Check 4: Configuration complexity
function checkConfigComplexity(filePath) {
  if (!filePath.includes('config') && !filePath.includes('settings')) {
    return;
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Count nested object levels
  let maxNesting = 0;
  let currentNesting = 0;
  for (const char of content) {
    if (char === '{') {
      currentNesting++;
      maxNesting = Math.max(maxNesting, currentNesting);
    } else if (char === '}') {
      currentNesting--;
    }
  }

  if (maxNesting > 4) {
    addFinding('warning', `Config file has deep nesting (${maxNesting} levels, recommended: ≤3)`, filePath);
  }
}

// Check 5: Dead code markers
function checkDeadCodeMarkers(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check for TODO/FIXME/HACK
    if (/TODO|FIXME|HACK|XXX/.test(line)) {
      addFinding('info', `Found marker: ${line.trim()}`, filePath, i + 1);
    }

    // Check for large commented blocks
    if (/^[^"']*\/\/.*{/.test(line)) {
      addFinding('warning', 'Commented code block found', filePath, i + 1);
    }
  }
}

// Check 6: Function complexity
function checkFunctionComplexity(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const functionMatches = content.matchAll(/function\s+([a-zA-Z0-9_]+)\s*\([^)]*\)\s*{/g);

  for (const match of functionMatches) {
    const functionName = match[1];
    const startIndex = match.index;

    // Find matching closing brace (simplified)
    let braceCount = 1;
    let endIndex = startIndex + match[0].length;
    while (braceCount > 0 && endIndex < content.length) {
      if (content[endIndex] === '{') braceCount++;
      if (content[endIndex] === '}') braceCount--;
      endIndex++;
    }

    const functionBody = content.substring(startIndex, endIndex);
    const lines = functionBody.split('\n').length;

    if (lines > 50) {
      addFinding('warning', `Function "${functionName}" is ${lines} lines (recommended: ≤30)`, filePath);
    }
  }
}

// Check 7: Import bloat
function checkImportBloat(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const importMatches = content.matchAll(/import\s+.*from\s+['"]([^'"]+)['"]/g);

  const externalImports = [];
  for (const match of importMatches) {
    const importPath = match[1];
    if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
      externalImports.push(importPath);
    }
  }

  if (externalImports.length > 15) {
    addFinding('warning', `File has ${externalImports.length} external imports (consider splitting)`, filePath);
  }

  // Check for lodash
  if (externalImports.some(imp => imp === 'lodash' || imp.startsWith('lodash/'))) {
    addFinding('info', 'Consider replacing lodash with native ES6+ methods', filePath);
  }
}

// Main scan function
function scanDirectory(dirPath) {
  const files = [];

  function walk(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
          walk(fullPath);
        }
      } else if (entry.name.endsWith('.js') || entry.name.endsWith('.mjs')) {
        files.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return files;
}

// Run all checks
function runChecks() {
  console.log('🔍 Anti-Overengineering Review Checker\n');
  console.log(`Scanning: ${targetPath}\n`);

  const files = scanDirectory(targetPath);
  console.log(`Found ${files.length} JavaScript files\n`);

  let totalLines = 0;

  for (const file of files) {
    if (verbose) {
      console.log(`Checking: ${file}`);
    }

    try {
      totalLines += checkFileSize(file);
      checkUnusedExports(file, files);
      checkSingleUseAbstractions(file);
      checkConfigComplexity(file);
      checkDeadCodeMarkers(file);
      checkFunctionComplexity(file);
      checkImportBloat(file);
    } catch (error) {
      console.error(`Error checking ${file}:`, error.message);
    }
  }

  console.log('\n📊 Summary:');
  console.log(`Total files: ${files.length}`);
  console.log(`Total lines: ${totalLines}`);
  console.log(`Average lines per file: ${Math.round(totalLines / files.length)}`);
  console.log('');

  if (findings.length > 0) {
    console.log(`\n❌ Errors (${findings.length}):`);
    for (const finding of findings) {
      console.log(`  ${finding.file}${finding.line ? `:${finding.line}` : ''}`);
      console.log(`    ${finding.message}`);
    }
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    for (const warning of warnings) {
      console.log(`  ${warning.file}${warning.line ? `:${warning.line}` : ''}`);
      console.log(`    ${warning.message}`);
    }
  }

  if (info.length > 0 && verbose) {
    console.log(`\n ℹ️  Info (${info.length}):`);
    for (const item of info) {
      console.log(`  ${item.file}${item.line ? `:${item.line}` : ''}`);
      console.log(`    ${item.message}`);
    }
  }

  console.log('\n✅ Review complete\n');

  if (findings.length > 0) {
    console.log('⚠️  Found issues that should be addressed before merging.\n');
    process.exit(1);
  } else if (warnings.length > 0) {
    console.log('ℹ️  Found warnings. Review recommended but not blocking.\n');
    process.exit(0);
  } else {
    console.log('✨ No over-engineering detected!\n');
    process.exit(0);
  }
}

runChecks();
