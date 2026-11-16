import { spawnSync } from 'node:child_process';

type Severity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

const SEVERITY_ORDER: readonly Severity[] = ['info', 'low', 'moderate', 'high', 'critical'];

interface AuditReport {
  error?: { code?: string; summary?: string };
  metadata?: {
    vulnerabilities?: Record<Severity, number>;
  };
  vulnerabilities?: Record<
    string,
    {
      name: string;
      severity: Severity;
      via: Array<string | { title?: string; url?: string }>;
      fixAvailable: boolean | { name: string; version: string };
    }
  >;
}

function parseThreshold(args: readonly string[]): Severity {
  const flag = args.find((arg) => arg.startsWith('--level='));
  const value = flag?.split('=')[1] as Severity | undefined;
  return value && SEVERITY_ORDER.includes(value) ? value : 'moderate';
}

const threshold = parseThreshold(process.argv.slice(2));
const thresholdIdx = SEVERITY_ORDER.indexOf(threshold);

const result = spawnSync('npm', ['audit', '--json'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});

if (result.error) {
  console.error(`Failed to execute npm audit: ${result.error.message}`);
  process.exit(2);
}

let report: AuditReport;
try {
  report = JSON.parse(result.stdout || '{}') as AuditReport;
} catch {
  console.error('Could not parse npm audit output.');
  if (result.stderr) console.error(result.stderr.trim());
  process.exit(2);
}

if (report.error) {
  console.error(`npm audit error (${report.error.code ?? 'unknown'}): ${report.error.summary ?? ''}`);
  process.exit(2);
}

const counts = report.metadata?.vulnerabilities;
if (!counts) {
  console.error('Unexpected npm audit JSON structure.');
  process.exit(2);
}

const failingSeverities = SEVERITY_ORDER.slice(thresholdIdx);
const failingCount = failingSeverities.reduce((sum, sev) => sum + (counts[sev] ?? 0), 0);

console.log(`CVE audit summary (threshold >= ${threshold}):`);
for (const sev of SEVERITY_ORDER) {
  console.log(`  ${sev.padEnd(9)}: ${counts[sev] ?? 0}`);
}

const entries = Object.values(report.vulnerabilities ?? {});
if (entries.length > 0) {
  console.log('\nAffected packages:');
  for (const vuln of entries) {
    const advisories = vuln.via
      .map((item) => (typeof item === 'string' ? item : item.title ?? item.url ?? 'advisory'))
      .join(', ');
    console.log(`  - ${vuln.name} [${vuln.severity}]: ${advisories}`);
  }
}

if (failingCount > 0) {
  console.error(`\nFound ${failingCount} vulnerability(ies) at or above '${threshold}'.`);
  process.exit(1);
}

console.log('\nNo upstream CVEs at or above threshold.');
