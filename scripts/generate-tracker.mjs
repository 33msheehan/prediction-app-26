#!/usr/bin/env node
// Regenerates tracker.html from BUILD_PLAN.md (ticket scope) + PROGRESS.md
// (ticket/phase status). Run via `npm run tracker:generate`, or implicitly
// as a `prebuild` step before `npm run build`.
//
// Do not hand-edit tracker.html — edit BUILD_PLAN.md / PROGRESS.md instead.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const buildPlanPath = path.join(root, 'BUILD_PLAN.md');
const progressPath = path.join(root, 'PROGRESS.md');
const trackerPath = path.join(root, 'tracker.html');

const buildPlan = readFileSync(buildPlanPath, 'utf8');
const progress = readFileSync(progressPath, 'utf8');

// ---------- inline markdown -> HTML (just enough for these docs) ----------
function mdInline(str) {
  return str
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

// ---------- BUILD_PLAN.md: ticket scope ----------
function capitalize(str) {
  // Don't touch strings that already start with markup/code/a capital.
  if (/^[<A-Z]/.test(str)) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function splitItems(line) {
  return line
    .split(';')
    .map((s) => capitalize(mdInline(s.trim().replace(/\.$/, ''))))
    .filter(Boolean);
}

function parseDependsOn(line) {
  const trimmed = line.trim().replace(/\.$/, '');
  if (trimmed === '—' || trimmed === '') return [];
  return trimmed
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseHuman(line) {
  const trimmed = line.trim();
  if (trimmed === '—' || trimmed === '') return { needed: false };
  return { needed: true, reason: mdInline(trimmed) };
}

const phaseHeaderRe = /^### Phase (\d+) — (.+)$/;
const ticketHeaderRe = /^\*\*(T\d+\.\d+) — (.+?)\*\*$/;
const fieldRe = /^- \*(Goal|Implementation|Acceptance|Tests|Depends on|Human):\* (.*)$/;

const phasesScope = []; // [{ num, name, tickets: [{id,title,goal,implementation,acceptance,tests,dependsOn,human}] }]
let currentPhase = null;
let currentTicket = null;

const planSection = buildPlan.slice(
  buildPlan.indexOf('## 8. Phases & tickets'),
  buildPlan.indexOf('## 9. Testing strategy'),
);

for (const rawLine of planSection.split('\n')) {
  const line = rawLine.trimEnd();
  const phaseMatch = line.match(phaseHeaderRe);
  if (phaseMatch) {
    currentPhase = {
      num: Number(phaseMatch[1]),
      name: `Phase ${phaseMatch[1]} — ${phaseMatch[2]}`,
      tickets: [],
    };
    phasesScope.push(currentPhase);
    currentTicket = null;
    continue;
  }
  const ticketMatch = line.match(ticketHeaderRe);
  if (ticketMatch) {
    if (!currentPhase) throw new Error(`Ticket ${ticketMatch[1]} found before any phase header`);
    currentTicket = {
      id: ticketMatch[1],
      title: mdInline(ticketMatch[2]),
      goal: '',
      implementation: [],
      acceptance: [],
      tests: [],
      dependsOn: [],
      human: { needed: false },
    };
    currentPhase.tickets.push(currentTicket);
    continue;
  }
  const fieldMatch = line.match(fieldRe);
  if (fieldMatch && currentTicket) {
    const [, label, value] = fieldMatch;
    switch (label) {
      case 'Goal':
        currentTicket.goal = mdInline(value.trim());
        break;
      case 'Implementation':
        currentTicket.implementation = splitItems(value);
        break;
      case 'Acceptance':
        currentTicket.acceptance = splitItems(value);
        break;
      case 'Tests':
        currentTicket.tests = splitItems(value);
        break;
      case 'Depends on':
        currentTicket.dependsOn = parseDependsOn(value);
        break;
      case 'Human':
        currentTicket.human = parseHuman(value);
        break;
    }
  }
}

const scopeById = new Map();
for (const phase of phasesScope) {
  for (const ticket of phase.tickets) {
    scopeById.set(ticket.id, ticket);
    const missing = ['goal', 'implementation', 'acceptance', 'tests'].filter(
      (f) => !ticket[f] || (Array.isArray(ticket[f]) && ticket[f].length === 0),
    );
    if (missing.length) {
      throw new Error(`${ticket.id}: BUILD_PLAN.md is missing field(s): ${missing.join(', ')}`);
    }
  }
}

// ---------- PROGRESS.md: ticket + phase status ----------
function parseMarkdownTable(section, expectedCols) {
  const lines = section.split('\n').filter((l) => l.trim().startsWith('|'));
  const rows = [];
  for (const line of lines) {
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.every((c) => /^-+$/.test(c))) continue; // header separator row
    if (cells[0] === expectedCols[0]) continue; // header row itself
    rows.push(cells);
  }
  return rows;
}

function sectionBetween(text, startHeading, endHeading) {
  const start = text.indexOf(startHeading);
  if (start === -1) throw new Error(`PROGRESS.md: missing section "${startHeading}"`);
  const end = endHeading ? text.indexOf(endHeading, start) : text.length;
  return text.slice(start, end === -1 ? text.length : end);
}

const ticketStatusSection = sectionBetween(progress, '## Ticket status', '## Phase review gates');
const ticketRows = parseMarkdownTable(ticketStatusSection, ['Ticket']);

const progressById = new Map();
for (const [id, started, testsWritten, humanVerified] of ticketRows) {
  progressById.set(id, {
    started: started === 'x',
    testsWritten: testsWritten === 'x',
    humanVerified: humanVerified === 'x',
  });
}

const phaseReviewSection = sectionBetween(progress, '## Phase review gates', '## Status summary');
const phaseReviewRows = parseMarkdownTable(phaseReviewSection, ['Phase']);

const phaseReviewByNum = new Map();
for (const [phaseLabel, status, reviewer, reviewedAt] of phaseReviewRows) {
  const num = Number(phaseLabel.replace(/^Phase\s+/, ''));
  phaseReviewByNum.set(num, {
    status,
    reviewer: reviewer || null,
    reviewedAt: reviewedAt || null,
  });
}

const summarySection = sectionBetween(progress, '## Status summary', '## Coordination rules');
const whereMatch = summarySection.match(/### Where we are\s*\n\n([\s\S]+?)\n\n### Next steps/);
const nextMatch = summarySection.match(/### Next steps\s*\n\n([\s\S]+?)\n*$/);
if (!whereMatch || !nextMatch)
  throw new Error('PROGRESS.md: could not parse "Status summary" section');

const SUMMARY = {
  where: mdInline(whereMatch[1].replace(/\s+/g, ' ').trim()),
  next: nextMatch[1]
    .trim()
    .split(/\n(?=\d+\.\s)/)
    .map((item) =>
      mdInline(
        item
          .replace(/^\d+\.\s*/, '')
          .replace(/\s+/g, ' ')
          .trim(),
      ),
    )
    .filter(Boolean),
};

// ---------- merge ----------
const phases = phasesScope.map((phase) => {
  const review = phaseReviewByNum.get(phase.num);
  if (!review) throw new Error(`PROGRESS.md: missing phase review row for Phase ${phase.num}`);
  return {
    name: phase.name,
    phaseReview: {
      status: review.status,
      reviewer: review.reviewer,
      reviewedAt: review.reviewedAt,
    },
    tickets: phase.tickets.map((t) => ({
      id: t.id,
      title: t.title,
      goal: t.goal,
      implementation: t.implementation,
      acceptance: t.acceptance,
      tests: t.tests,
      dependsOn: t.dependsOn,
      human: t.human,
      progress: progressById.get(t.id) ?? {
        started: false,
        testsWritten: false,
        humanVerified: false,
      },
    })),
  };
});

const LAST_UPDATED = new Date().toISOString().slice(0, 10);

// ---------- inject into tracker.html ----------
const tracker = readFileSync(trackerPath, 'utf8');
const startMarker = '// ---- GENERATED DATA START — do not edit by hand. ----';
const endMarker = '// ---- GENERATED DATA END ----';
const startIdx = tracker.indexOf(startMarker);
const endIdx = tracker.indexOf(endMarker);
if (startIdx === -1 || endIdx === -1) {
  throw new Error('tracker.html: missing GENERATED DATA markers');
}

const generatedBlock = [
  startMarker,
  '// Source: BUILD_PLAN.md (scope) + PROGRESS.md (status), merged by',
  '// scripts/generate-tracker.mjs. Re-run `npm run tracker:generate` to refresh,',
  '// or just `npm run build` (it runs as a prebuild step).',
  '// status: "todo" | "progress" | "done"',
  `const LAST_UPDATED = ${JSON.stringify(LAST_UPDATED)};`,
  '',
  `const SUMMARY = ${JSON.stringify(SUMMARY, null, 2)};`,
  '',
  `const phases = ${JSON.stringify(phases, null, 2)};`,
  endMarker,
].join('\n');

const next = tracker.slice(0, startIdx) + generatedBlock + tracker.slice(endIdx + endMarker.length);
writeFileSync(trackerPath, next.endsWith('\n') ? next : `${next}\n`);

console.log(
  `tracker.html regenerated (${phases.flatMap((p) => p.tickets).length} tickets across ${phases.length} phases).`,
);
