/**
 * Seed — 2 projects, each with 10 workflows, each with 10 tasks.
 */

import Database from 'better-sqlite3'
import path from 'path'
import os from 'os'
import { randomUUID } from 'crypto'

const DB_PATH =
  process.env['DATABASE_URL'] ??
  path.join(os.homedir(), 'Documents', 'workflow-data', 'workflow.db')

const DEFAULT_SPACE_ID = '00000000-0000-0000-0000-000000000001'

// ── Project definitions ───────────────────────────────────────────────────────

const PROJECTS: Array<{
  name: string
  workflows: Array<{ name: string; endGoal: string; tasks: string[] }>
}> = [
  {
    name: 'Product Development',
    workflows: [
      {
        name: 'User Authentication',
        endGoal: 'Secure, passwordless login in production',
        tasks: [
          'Research auth providers',
          'Design token schema',
          'Implement OAuth flow',
          'Add session management',
          'Write auth middleware',
          'Build login UI',
          'Add MFA support',
          'Security audit',
          'Load testing',
          'Deploy to production',
        ],
      },
      {
        name: 'Dashboard',
        endGoal: 'Interactive dashboard with live data',
        tasks: [
          'Define KPI metrics',
          'Design wireframes',
          'Build chart components',
          'Connect data sources',
          'Add date range filter',
          'Implement drill-down',
          'Add export to CSV',
          'Performance profiling',
          'Accessibility review',
          'User testing',
        ],
      },
      {
        name: 'Notifications',
        endGoal: 'Real-time in-app and email notifications',
        tasks: [
          'Define notification types',
          'Design notification schema',
          'Build notification service',
          'Implement email templates',
          'Add push notifications',
          'Create preferences UI',
          'Add digest mode',
          'Write delivery tests',
          'Monitor delivery rates',
          'Rollout to all users',
        ],
      },
      {
        name: 'Search',
        endGoal: 'Full-text search across all content',
        tasks: [
          'Evaluate search engines',
          'Design index schema',
          'Build indexing pipeline',
          'Implement query parser',
          'Add faceted filters',
          'Build search UI',
          'Add autocomplete',
          'Tune relevance ranking',
          'Add analytics tracking',
          'Performance benchmark',
        ],
      },
      {
        name: 'Billing',
        endGoal: 'Stripe billing with usage-based pricing live',
        tasks: [
          'Design pricing model',
          'Integrate Stripe SDK',
          'Build subscription flows',
          'Handle webhooks',
          'Add invoice generation',
          'Build billing portal',
          'Add usage metering',
          'Write payment tests',
          'PCI compliance review',
          'Enable in production',
        ],
      },
      {
        name: 'Onboarding',
        endGoal: 'New users reach first value within 5 minutes',
        tasks: [
          'Map activation events',
          'Design onboarding flow',
          'Build welcome screen',
          'Add product tour',
          'Create sample data',
          'Add progress tracker',
          'Build checklist widget',
          'A/B test variations',
          'Measure completion rate',
          'Iterate on drop-offs',
        ],
      },
      {
        name: 'Mobile App',
        endGoal: 'iOS & Android apps in respective stores',
        tasks: [
          'Set up React Native',
          'Port authentication',
          'Build navigation shell',
          'Implement core screens',
          'Add offline support',
          'Integrate push notifications',
          'UI polish & animations',
          'Write E2E tests',
          'App store submission',
          'Monitor crash rates',
        ],
      },
      {
        name: 'Admin Panel',
        endGoal: 'Internal team can manage all users and content',
        tasks: [
          'Define admin roles',
          'Build role middleware',
          'Create user management UI',
          'Add content moderation',
          'Build audit log viewer',
          'Add impersonation mode',
          'Create bulk action tools',
          'Add reporting exports',
          'Write admin tests',
          'Security penetration test',
        ],
      },
      {
        name: 'API v2',
        endGoal: 'Public API v2 with versioning and docs live',
        tasks: [
          'Design API spec (OpenAPI)',
          'Plan breaking changes',
          'Implement versioning layer',
          'Migrate existing endpoints',
          'Add rate limiting',
          'Build API key management',
          'Generate SDK stubs',
          'Write integration tests',
          'Publish documentation',
          'Deprecate v1',
        ],
      },
      {
        name: 'Performance',
        endGoal: 'p99 latency under 200 ms across all endpoints',
        tasks: [
          'Establish baseline metrics',
          'Profile slow queries',
          'Add database indexes',
          'Implement query caching',
          'Enable CDN for assets',
          'Lazy-load heavy modules',
          'Compress API responses',
          'Add connection pooling',
          'Load test at 10× traffic',
          'Set up latency alerts',
        ],
      },
    ],
  },
  {
    name: 'Growth & Marketing',
    workflows: [
      {
        name: 'SEO',
        endGoal: 'Rank top 3 for 10 target keywords',
        tasks: [
          'Keyword research',
          'Competitor analysis',
          'On-page optimisation',
          'Fix technical SEO issues',
          'Build internal linking',
          'Create pillar content',
          'Build backlinks',
          'Optimise Core Web Vitals',
          'Submit sitemap',
          'Track keyword rankings',
        ],
      },
      {
        name: 'Content Marketing',
        endGoal: 'Publish 20 articles driving 5k monthly visits',
        tasks: [
          'Define content pillars',
          'Build editorial calendar',
          'Brief freelance writers',
          'Write hero article',
          'Design blog template',
          'Set up CMS workflow',
          'Add newsletter opt-in',
          'Distribute on social',
          'Repurpose as video',
          'Measure traffic & leads',
        ],
      },
      {
        name: 'Paid Acquisition',
        endGoal: 'CAC under $40 at 500 sign-ups per month',
        tasks: [
          'Define ICP personas',
          'Set campaign budgets',
          'Write ad copy variants',
          'Design creatives',
          'Set up Google Ads',
          'Set up Meta Ads',
          'Build landing pages',
          'Implement conversion tracking',
          'Run A/B tests',
          'Optimise for CPA',
        ],
      },
      {
        name: 'Email Campaigns',
        endGoal: '30% open rate and 5% CTR across campaigns',
        tasks: [
          'Audit existing lists',
          'Segment subscribers',
          'Write nurture sequence',
          'Design email templates',
          'Set up automation flows',
          'Add personalisation tokens',
          'A/B test subject lines',
          'Schedule send times',
          'Monitor deliverability',
          'Review unsubscribe rates',
        ],
      },
      {
        name: 'Product Hunt Launch',
        endGoal: '#1 product of the day on launch',
        tasks: [
          'Define launch date',
          'Build hunter network',
          'Prepare product assets',
          'Write tagline & copy',
          'Record demo video',
          'Set up first-comment',
          'Brief community supporters',
          'Prepare support team',
          'Monitor comments live',
          'Follow up with leads',
        ],
      },
      {
        name: 'Partnerships',
        endGoal: '3 active integration partners driving 100 leads/mo',
        tasks: [
          'Identify partner candidates',
          'Create partner pitch deck',
          'Outreach to top 20',
          'Negotiate agreements',
          'Build integration docs',
          'Co-create launch assets',
          'Set up partner portal',
          'Run joint webinars',
          'Track referral revenue',
          'Quarterly partner review',
        ],
      },
      {
        name: 'Referral Programme',
        endGoal: '15% of new sign-ups from referrals',
        tasks: [
          'Design referral mechanics',
          'Define reward structure',
          'Build referral tracking',
          'Create share assets',
          'Add in-app prompts',
          'Send activation emails',
          'A/B test reward types',
          'Detect fraud patterns',
          'Measure k-factor',
          'Iterate on incentives',
        ],
      },
      {
        name: 'Community',
        endGoal: 'Active community with 1k members and weekly events',
        tasks: [
          'Choose platform (Discord/Slack)',
          'Define community charter',
          'Invite seed members',
          'Create channel structure',
          'Post welcome resources',
          'Host first live event',
          'Onboard community mods',
          'Build event calendar',
          'Track engagement metrics',
          'Launch ambassador programme',
        ],
      },
      {
        name: 'Brand Refresh',
        endGoal: 'Updated brand live across all touchpoints',
        tasks: [
          'Brand audit',
          'Define brand values',
          'Logo redesign',
          'Create colour palette',
          'Typography system',
          'Update website',
          'Refresh social profiles',
          'Update email signatures',
          'Print collateral',
          'Internal brand guidelines doc',
        ],
      },
      {
        name: 'Customer Success',
        endGoal: 'NPS > 50 and churn under 3%',
        tasks: [
          'Map customer journey',
          'Define health score',
          'Build health dashboard',
          'Create QBR template',
          'Set up NPS surveys',
          'Train CS team',
          'Automate at-risk alerts',
          'Build renewal playbook',
          'Implement win-back campaign',
          'Monthly churn review',
        ],
      },
    ],
  },
]

// ── Seed logic ────────────────────────────────────────────────────────────────

function main(): void {
  const db = new Database(DB_PATH)
  db.pragma('foreign_keys = ON')

  const now = Math.floor(Date.now() / 1000)

  const insertProject = db.prepare(
    'INSERT INTO projects (id, space_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
  )
  const insertWorkflow = db.prepare(
    'INSERT INTO workflows (id, project_id, name, end_goal, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  const insertTask = db.prepare(`
    INSERT INTO tasks
      (id, workflow_id, title, status, priority, position_x, position_y,
       description, notes, due_date, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?, ?)
  `)
  const insertDep = db.prepare(
    'INSERT INTO task_dependencies (id, task_id, depends_on_task_id, created_at) VALUES (?, ?, ?, ?)',
  )

  const seed = db.transaction(() => {
    db.exec('DELETE FROM task_dependencies')
    db.exec('DELETE FROM tasks')
    db.exec('DELETE FROM tasks_fts')
    db.exec('DELETE FROM workflows')
    db.exec('DELETE FROM projects')

    let totalTasks = 0
    let totalDeps = 0

    PROJECTS.forEach((proj, pi) => {
      const projectId = randomUUID()
      insertProject.run(projectId, DEFAULT_SPACE_ID, proj.name, now - (2 - pi) * 500, now)

      proj.workflows.forEach((wf, wi) => {
        const wfId = randomUUID()
        insertWorkflow.run(wfId, projectId, wf.name, wf.endGoal, wi, now - (10 - wi) * 60, now)

        // 10 tasks in a 5-column × 2-row grid
        const taskIds: string[] = []
        wf.tasks.forEach((title, ti) => {
          const col = ti % 5
          const row = Math.floor(ti / 5)
          const x = 80 + col * 260
          const y = 60 + row * 120
          const status: 'todo' | 'done' = ti < 2 ? 'done' : 'todo'
          const id = randomUUID()
          insertTask.run(id, wfId, title, status, 3, x, y, now - (10 - ti) * 30, now)
          taskIds.push(id)
          totalTasks++
        })

        // Chain: 0→1→2→3→4, 5→6→7→8→9, bridge 4→5
        const depPairs = [
          [0, 1], [1, 2], [2, 3], [3, 4],
          [5, 6], [6, 7], [7, 8], [8, 9],
          [4, 5],
        ]
        for (const [from, to] of depPairs) {
          insertDep.run(randomUUID(), taskIds[to]!, taskIds[from]!, now)
          totalDeps++
        }
      })
    })

    console.log(
      `Seeded ${PROJECTS.length} projects, ` +
      `${PROJECTS.length * 10} workflows, ` +
      `${totalTasks} tasks, ` +
      `${totalDeps} dependency edges.`,
    )
  })

  seed()
  db.close()
}

main()
