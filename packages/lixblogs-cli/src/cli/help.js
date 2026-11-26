import { normalizeCommand } from './contract.js';

const GLOBAL_FLAGS = `  --profile <name>            local account alias (defaults to the signed-in username)
  --env <environment>         override environment (development|staging|production)
  --auth-provider <provider>  elixpo, or mock in development/test only
  --accounts-url <url>        override the Accounts discovery origin
  --api-url <url>             LixBlogs API origin (default: https://blogs.elixpo.com)
  --client-id <id>            override the OAuth client ID
  --audience <audience>       override the OAuth audience
  --token-file <path>         read a personal access token from a file
  --scope <scope>             request an OAuth scope (repeatable)
  --status <status>           filter or target a lifecycle status
  --limit <n>                 page size or per-author contest limit
  --cursor <cursor>           continue a previous paginated response
  --json                      machine-readable JSON output
  --quiet                     suppress non-essential output
  --no-input                  never prompt; fail instead
  --yes, -y                   auto-confirm destructive actions (required for revoke)
  --dry-run                   validate and show the intended action without writing
  --idempotency-key <key>     stable key for safe retries
  --etag <etag>               expected server revision for blog mutations
  --allow-insecure-fallback   explicit opt-in: if the OS keychain is unavailable, use a
                               non-persistent in-memory store instead of failing
  --help, -h                  show help (add after a command for command-specific help)`;

const MACHINE_MODE = `  --json --no-input produces stable JSON on stdout, diagnostics on stderr, and
  never prompts. Publishing and destructive state changes require --yes.
  Set LIXBLOGS_TOKEN or LIXBLOGS_TOKEN_FILE for non-interactive authentication.`;

const BLOG_METADATA = [
  ['--title <text>', 'set the title'],
  ['--subtitle <text>', 'set the subtitle'],
  ['--slug <slug>', 'set the URL slug'],
  ['--tag <tag>', 'add a tag (repeatable, up to five)'],
  ['--emoji <emoji>', 'set the icon emoji'],
  ['--publication <target>', 'personal or org:<id>'],
  ['--collection <id>', 'organization collection ID'],
  ['--license <id>', 'all-rights-reserved, cc-by-4.0, cc-by-sa-4.0, cc-by-nc-4.0, or cc0-1.0'],
  ['--cover <url>', 'set the cover image URL'],
  ['--cover-x/--cover-y <n>', 'cover focal point percentages'],
  ['--cover-zoom <n>', 'cover zoom percentage'],
  ['--member-only/--no-member-only', 'toggle membership-only access'],
  ['--secret/--not-secret', 'toggle anonymous public publishing'],
  ['--allow-comments/--no-comments', 'toggle comments'],
];

const COMMANDS = [
  {
    command: 'lixblogs login',
    args: '[--profile <name>] [--open]',
    summary: 'Sign in with device authorization.',
    options: [
      ['--profile <name>', 'local account alias (defaults to the signed-in username)'],
      ['--open', 'open the device verification URL immediately'],
      ['--scope <scope>', 'request an OAuth scope (repeatable)'],
    ],
  },
  {
    command: 'lixblogs register',
    args: '[--profile <name>] [--open]',
    summary: 'Create an account, then start device login.',
  },
  {
    command: 'lixblogs logout',
    args: '[--profile <name>]',
    summary: 'Remove the local credential for a profile.',
  },
  {
    command: 'lixblogs whoami',
    args: '[--profile <name>] [--json]',
    summary: 'Show the signed-in identity and scopes.',
  },
  {
    command: 'lixblogs profiles',
    args: '[--json]',
    summary: 'List local profiles.',
  },
  {
    command: 'lixblogs use',
    args: '<name> [--json]',
    summary: 'Switch the active profile.',
  },
  {
    command: 'lixblogs auth login',
    args: '[--profile <name>] [--env <environment>] [--json] [--quiet] [--allow-insecure-fallback]',
    summary: 'Sign in with device authorization.',
  },
  {
    command: 'lixblogs auth status',
    args: '[--profile <name>] [--json]',
    summary: 'Show credential and scope status for a profile.',
  },
  {
    command: 'lixblogs auth whoami',
    args: '[--profile <name>] [--json]',
    summary: 'Show the signed-in identity and scopes.',
  },
  {
    command: 'lixblogs auth logout',
    args: '[--profile <name>] [--json] [--quiet]',
    summary: 'Remove the local credential for a profile.',
  },
  {
    command: 'lixblogs auth revoke',
    args: '[--profile <name>] [--json] [--quiet] --yes',
    summary: 'Revoke the token server-side, then remove the local credential.',
  },
  {
    command: 'lixblogs auth profiles',
    args: '[--json]',
    summary: 'List local profiles.',
  },
  {
    command: 'lixblogs auth use',
    args: '<name> [--json]',
    summary: 'Switch the active profile.',
  },
  {
    command: 'lixblogs blog list',
    args: '[--status <status>] [--limit <n>] [--cursor <cursor>] [--json]',
    summary: 'List your blogs.',
    options: [
      ['--status <status>', 'draft, published, unlisted, or trashed'],
      ['--limit <n>', 'page size'],
      ['--cursor <cursor>', 'continue a previous page'],
    ],
  },
  {
    command: 'lixblogs blog get',
    args: '<id> [--json]',
    summary: 'Read a blog as Markdown.',
  },
  {
    command: 'lixblogs blog preview',
    args: '<id> [--json]',
    summary: 'Preview a blog as Markdown.',
  },
  {
    command: 'lixblogs blog create',
    args: '[--file <post.md>|--stdin|--content <markdown>|--editor] [metadata] [--dry-run] [--idempotency-key <key>]',
    summary: 'Create a draft from Markdown and optional metadata.',
    options: BLOG_METADATA,
    notes: ['Use only one of --file, --stdin, --content, or --editor.'],
  },
  {
    command: 'lixblogs blog edit',
    args: '<id> [--file <post.md>|--stdin|--content <markdown>|--editor] [metadata] [--dry-run] [--etag <etag>]',
    summary: 'Update a blog using the current server revision.',
    options: BLOG_METADATA,
    notes: ['Use only one of --file, --stdin, --content, or --editor.'],
  },
  {
    command: 'lixblogs blog publish',
    args: '<id> --yes [--status published|unlisted] [--dry-run] [--etag <etag>] [--idempotency-key <key>] [--json]',
    summary: 'Publish or unlist a blog.',
  },
  {
    command: 'lixblogs blog unpublish',
    args: '<id> --yes [--dry-run] [--etag <etag>] [--json]',
    summary: 'Move a published blog back to draft.',
  },
  {
    command: 'lixblogs blog delete',
    args: '<id> --yes [--permanent] [--dry-run] [--etag <etag>] [--json]',
    summary: 'Trash a blog, or permanently delete it with --permanent.',
  },
  {
    command: 'lixblogs blog trash',
    args: '<id> --yes [--dry-run] [--json]',
    summary: 'Move a blog to the trash.',
  },
  {
    command: 'lixblogs blog restore',
    args: '<id> --yes [--dry-run] [--json]',
    summary: 'Restore a blog from the trash.',
  },
  {
    command: 'lixblogs blog history',
    args: '<id> [--version <version-id>] [--json]',
    summary: 'List versions, or read one version with --version.',
  },
  {
    command: 'lixblogs blog restore-version',
    args: '<id> --version <version-id> --yes [--json]',
    summary: 'Restore a historical version.',
  },
  {
    command: 'lixblogs comment list',
    args: '<blog-id> [--json]',
    summary: 'List comments on a blog.',
  },
  {
    command: 'lixblogs comment add',
    args: '<blog-id> --content <text> [--json]',
    summary: 'Add a comment.',
  },
  {
    command: 'lixblogs comment reply',
    args: '<blog-id> --parent <comment-id> --content <text> [--json]',
    summary: 'Reply to a comment.',
  },
  {
    command: 'lixblogs comment delete',
    args: '<blog-id> --comment <comment-id> --yes [--json]',
    summary: 'Delete a comment.',
  },
  {
    command: 'lixblogs org list',
    args: '[--json]',
    summary: 'List your organizations.',
  },
  {
    command: 'lixblogs org get',
    args: '<id> [--json]',
    summary: 'Read an organization.',
  },
  {
    command: 'lixblogs org collections',
    args: '<id> [--json]',
    summary: 'List an organization\'s collections.',
  },
  {
    command: 'lixblogs org members',
    args: '<id> [--json]',
    summary: 'List an organization\'s members.',
  },
  {
    command: 'lixblogs org targets',
    args: '[--json]',
    summary: 'List valid publication targets.',
  },
  {
    command: 'lixblogs collection list',
    args: '[--json]',
    summary: 'List collections.',
  },
  {
    command: 'lixblogs collection get',
    args: '<id> [--json]',
    summary: 'Read a collection.',
  },
  {
    command: 'lixblogs collection create',
    args: '--title <name> [--slug <slug>] [--description <text>] [--introduction <text>] [--cover <url>] [--visibility private|unlisted|public]',
    summary: 'Create a collection.',
  },
  {
    command: 'lixblogs collection edit',
    args: '<id> [--title <name>] [--description <text>] [--introduction <text>] [--cover <url>] [--visibility <value>]',
    summary: 'Update a collection.',
  },
  {
    command: 'lixblogs collection delete',
    args: '<id> --yes',
    summary: 'Delete a collection.',
  },
  {
    command: 'lixblogs collection entries',
    args: '<id> [--json]',
    summary: 'List a collection\'s entries.',
  },
  {
    command: 'lixblogs collection add',
    args: '<id> --blog <blog-id> [--note <text>] [--category <name>]',
    summary: 'Add a blog to a collection.',
  },
  {
    command: 'lixblogs collection remove',
    args: '<id> --blog <blog-id> --yes',
    summary: 'Remove a blog from a collection.',
  },
  {
    command: 'lixblogs contest list',
    args: '[--status <status>] [--mine] [--json]',
    summary: 'List contests.',
  },
  {
    command: 'lixblogs contest get',
    args: '<id-or-slug> [--json]',
    summary: 'Read a contest.',
  },
  {
    command: 'lixblogs contest create',
    args: '--title <title> --starts-at <date> --submissions-close-at <date> --judging-closes-at <date> [--slug <slug>] [--description <text>] [--problem <markdown>] [--rules <markdown>] [--theme <text>] [--cover <url>] [--template <markdown>] [--tag <topic>] [--contest-tag <tag>] [--allowed-target <target>] [--minimum-account-age-months <n>] [--require-bio|--no-require-bio] [--eligible-user <username>] [--limit <1-5>]',
    summary: 'Create a contest draft.',
    notes: ['--tag sets required topics. --contest-tag sets contest tags. Repeat --eligible-user for an invite-only list.'],
  },
  {
    command: 'lixblogs contest edit',
    args: '<id> [--title <title>] [--slug <slug>] [--description <text>] [--problem <markdown>] [--rules <markdown>] [--theme <text>] [--cover <url>] [--template <markdown>] [--starts-at <date>] [--submissions-close-at <date>] [--judging-closes-at <date>] [--results-at <date>] [--tag <topic>] [--contest-tag <tag>] [--allowed-target <target>] [--minimum-account-age-months <n>] [--require-bio|--no-require-bio] [--eligible-user <username>] [--clear-eligible-users] [--limit <1-5>]',
    summary: 'Update a contest.',
  },
  {
    command: 'lixblogs contest publish',
    args: '<id> --yes',
    summary: 'Publish a contest.',
  },
  {
    command: 'lixblogs contest cancel',
    args: '<id> --yes',
    summary: 'Cancel a published contest.',
  },
  {
    command: 'lixblogs contest delete',
    args: '<id> --yes',
    summary: 'Delete a private contest draft.',
  },
  {
    command: 'lixblogs contest submissions',
    args: '<id> [--snapshot] [--json]',
    summary: 'List submissions, or request a frozen snapshot.',
  },
  {
    command: 'lixblogs contest submit',
    args: '<id> --blog <blog-id>',
    summary: 'Submit a blog to a contest.',
  },
  {
    command: 'lixblogs contest withdraw',
    args: '<id> --submission <submission-id> --yes',
    summary: 'Withdraw a submission.',
  },
  {
    command: 'lixblogs contest members',
    args: '<id> [--json]',
    summary: 'List contest moderators and judges.',
  },
  {
    command: 'lixblogs contest role',
    args: '<id> --user <username-or-id> --role <moderator|judge>',
    summary: 'Assign a contest role.',
  },
  {
    command: 'lixblogs contest remove-member',
    args: '<id> --user <user-id> --yes',
    summary: 'Remove a contest moderator or judge.',
  },
  {
    command: 'lixblogs contest results',
    args: '<id> --award winner:<submission-id> [--award runner-up:<id>] [--finalize --yes]',
    summary: 'Save or finalize contest results.',
  },
  {
    command: 'lixblogs collab list',
    args: '<blog-id> [--json]',
    summary: 'List collaborators on a blog.',
  },
  {
    command: 'lixblogs collab invitations',
    args: '[--json]',
    summary: 'List your pending collaboration invitations.',
  },
  {
    command: 'lixblogs collab invite',
    args: '<blog-id> --user <username> --role <viewer|editor|admin> --yes',
    summary: 'Invite a collaborator.',
  },
  {
    command: 'lixblogs collab role',
    args: '<blog-id> --user <username-or-id> --role <viewer|editor|admin> --yes',
    summary: 'Change a collaborator role.',
  },
  {
    command: 'lixblogs collab remove',
    args: '<blog-id> [--user <username-or-id>] --yes',
    summary: 'Remove a collaborator or invitation.',
  },
  {
    command: 'lixblogs collab accept',
    args: '<blog-id> --yes [--hide-on-profile]',
    summary: 'Accept a collaboration invitation.',
  },
  {
    command: 'lixblogs collab decline',
    args: '<blog-id> --yes',
    summary: 'Decline a collaboration invitation.',
  },
  {
    command: 'lixblogs analytics query',
    args: '[--scope personal|org:<id>] [--range 7d|30d|90d|12m|custom] [--from <date>] [--to <date>] [--dimension overview|timeline|posts|sources|devices|countries] [--limit <n>] [--cursor <cursor>] [--json]',
    summary: 'Query creator analytics.',
    notes: ['Custom ranges require --from and --to. Organization scopes also need lixblogs:organizations:read.'],
  },
  {
    command: 'lixblogs analytics export',
    args: '--output <file> [--format json|csv] [query options]',
    summary: 'Export analytics to a new file.',
    notes: ['Exports refuse to overwrite an existing file.'],
  },
  {
    command: 'lixblogs notification list',
    args: '[--limit <n>] [--cursor <cursor>] [--unread] [--json]',
    summary: 'List notifications.',
  },
  {
    command: 'lixblogs notification read',
    args: '<notification-id> [--yes] [--json]',
    summary: 'Mark one notification as read.',
  },
  {
    command: 'lixblogs notification read --all',
    args: '--all [--yes] [--json]',
    summary: 'Mark all notifications as read.',
  },
  {
    command: 'lixblogs integrations cloudinary-status',
    args: '[--json]',
    summary: 'Show the Cloudinary connection.',
  },
  {
    command: 'lixblogs integrations cloudinary-disconnect',
    args: '--yes [--json]',
    summary: 'Disconnect Cloudinary.',
  },
  {
    command: 'lixblogs integrations pollinations-status',
    args: '[--json]',
    summary: 'Show the Pollinations connection.',
  },
  {
    command: 'lixblogs integrations pollinations-disconnect',
    args: '--yes [--json]',
    summary: 'Disconnect Pollinations.',
  },
  {
    command: 'lixblogs media generate',
    args: '--prompt <text> [--model flux] [--reference <image>] [--seed <n>] [--width <n>] [--height <n>] [--blog <id> [--type inline|cover] [--attach] [--caption <text>]] [--output <file>]',
    summary: 'Generate an image and optionally upload or attach it.',
  },
  {
    command: 'lixblogs media upload',
    args: '--file <image> --blog <id> [--type inline|cover] [--attach] [--caption <text>] [--upload-id <id>]',
    summary: 'Upload an image and optionally attach it.',
  },
  {
    command: 'lixblogs media delete',
    args: '<media-id> --yes [--json]',
    summary: 'Delete a media asset.',
  },
  {
    command: 'lixblogs skill list',
    args: '[--json]',
    summary: 'List bundled agent skills.',
  },
  {
    command: 'lixblogs skill inspect',
    args: '<name> [--json]',
    summary: 'Print a bundled skill.',
  },
  {
    command: 'lixblogs skill install',
    args: '<name> [--target <directory>] [--force] [--dry-run] --yes',
    summary: 'Install one bundled skill.',
    notes: ['Use --all instead of a name to install every bundled skill. Existing files require --force --yes.'],
  },
  {
    command: 'lixblogs disconnect cloudinary',
    args: '--yes',
    summary: 'Disconnect Cloudinary.',
  },
  {
    command: 'lixblogs disconnect pollinations',
    args: '',
    summary: 'Disconnect Pollinations.',
  },
];

const INDEX = new Map(COMMANDS.map((entry) => [entry.command.replace(/^lixblogs /, ''), entry]));

function usageLine(entry) {
  const label = entry.command;
  const pad = label.length < 24 ? label.padEnd(24) : label;
  return `  ${pad} ${entry.args}`.trimEnd();
}

function optionLine([flag, description]) {
  const pad = flag.length < 30 ? flag.padEnd(30) : flag;
  return `  ${pad} ${description}`.trimEnd();
}

export function renderGlobalHelp() {
  const lines = [
    'lixblogs — LixBlogs CLI',
    '',
    'Usage:',
    ...COMMANDS.map(usageLine),
    '',
    'Global flags:',
    GLOBAL_FLAGS,
    '',
    'Machine mode:',
    MACHINE_MODE,
    '',
  ];
  return lines.join('\n');
}

function renderCommandHelp(entry) {
  const lines = [
    `${entry.command} — ${entry.summary}`,
    '',
    'Usage:',
    `  ${entry.command} ${entry.args}`.trimEnd(),
  ];
  if (entry.options?.length) {
    lines.push('', 'Options:', ...entry.options.map(optionLine));
  }
  if (entry.notes?.length) {
    lines.push('', 'Notes:', ...entry.notes.map((note) => `  ${note}`));
  }
  lines.push(
    '',
    'Global flags: --profile, --env, --api-url, --json, --quiet, --yes, --no-input, --help.',
    'Run `lixblogs --help` for all commands.',
    '',
  );
  return lines.join('\n');
}

function resolveKey(positionals) {
  if (positionals[0] === 'register') return 'register';
  const raw = positionals.slice(0, 2).join(' ');
  if (INDEX.has(raw)) return raw;
  if (INDEX.has(positionals[0])) return positionals[0];
  const normalized = normalizeCommand(positionals).slice(0, 2).join(' ');
  return INDEX.has(normalized) ? normalized : null;
}

export function commandHelp(positionals = []) {
  const key = resolveKey(positionals);
  return key ? renderCommandHelp(INDEX.get(key)) : null;
}

export const GLOBAL_HELP = renderGlobalHelp();
