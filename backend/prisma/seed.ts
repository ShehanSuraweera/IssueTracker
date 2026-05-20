import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import bcrypt from 'bcrypt';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is not set');
const prisma = new PrismaClient({ adapter: new PrismaMariaDb(url) });

// ── Env-driven credentials ────────────────────────────────────────────────────
const DEMO_PASSWORD  = process.env.SEED_DEMO_PASSWORD  ?? 'Demo@2026';
const ADMIN_EMAIL    = process.env.SEED_ADMIN_EMAIL    ?? 'admin@newnop.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? DEMO_PASSWORD;
const BCRYPT_ROUNDS  = 10;

// ── Helpers ───────────────────────────────────────────────────────────────────
type Impact   = 'low' | 'medium' | 'high';
type Urgency  = 'low' | 'medium' | 'high';
type Priority = 'low' | 'moderate' | 'high' | 'critical';

function computePriority(impact: Impact, urgency: Urgency): Priority {
  if (impact === 'high'   && urgency === 'high')   return 'critical';
  if (impact === 'high'   && urgency === 'medium')  return 'high';
  if (impact === 'medium' && urgency === 'high')    return 'high';
  if (impact === 'high'   && urgency === 'low')     return 'moderate';
  if (impact === 'medium' && urgency === 'medium')  return 'moderate';
  if (impact === 'low'    && urgency === 'high')    return 'moderate';
  return 'low';
}

const SLA_HOURS: Record<Priority, number> = {
  critical: 4,
  high: 24,
  moderate: 72,
  low: 168,
};

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

function addHours(base: Date, h: number): Date {
  const d = new Date(base);
  d.setHours(d.getHours() + h);
  return d;
}

const ticketCounters: Record<string, number> = {};
function nextTicket(code: string): string {
  ticketCounters[code] = (ticketCounters[code] ?? 0) + 1;
  return `${code}-${String(ticketCounters[code]).padStart(4, '0')}`;
}

// ── Types for issue definitions ───────────────────────────────────────────────
interface ActivityDef {
  fieldName: string;
  oldValue: string | null;
  newValue: string | null;
  userId: bigint;
  h: number; // hours after issue createdAt
}

interface CommentDef {
  body: string;
  isInternal: boolean;
  userId: bigint;
  h: number; // hours after issue createdAt
}

interface IssueDef {
  productId: bigint;
  code: string;
  title: string;
  description: string;
  type: 'bug' | 'feature_request' | 'question' | 'incident';
  impact: Impact;
  urgency: Urgency;
  status: 'new' | 'in_progress' | 'on_hold' | 'resolved' | 'closed' | 'cancelled';
  createdById: bigint;
  assignedToId?: bigint | null;
  createdAt: Date;
  slaDeadline?: Date | null; // undefined = auto-compute from priority
  resolvedAt?: Date | null;
  closedAt?: Date | null;
  activities?: ActivityDef[];
  comments?: CommentDef[];
}

async function createIssue(def: IssueDef) {
  const priority = computePriority(def.impact, def.urgency);
  const slaDeadline =
    def.slaDeadline !== undefined
      ? def.slaDeadline
      : addHours(def.createdAt, SLA_HOURS[priority]);

  await prisma.issue.create({
    data: {
      ticketNumber: nextTicket(def.code),
      productId:    def.productId,
      title:        def.title,
      description:  def.description,
      type:         def.type,
      impact:       def.impact,
      urgency:      def.urgency,
      priority,
      status:       def.status,
      createdBy:    def.createdById,
      assignedTo:   def.assignedToId ?? null,
      slaDeadline,
      resolvedAt:   def.resolvedAt  ?? null,
      closedAt:     def.closedAt    ?? null,
      createdAt:    def.createdAt,
      activities: {
        create: [
          // First entry: issue opened
          {
            userId:    def.createdById,
            fieldName: 'status',
            oldValue:  null,
            newValue:  'new',
            createdAt: def.createdAt,
          },
          ...(def.activities ?? []).map(a => ({
            userId:    a.userId,
            fieldName: a.fieldName,
            oldValue:  a.oldValue,
            newValue:  a.newValue,
            createdAt: addHours(def.createdAt, a.h),
          })),
        ],
      },
      comments: {
        create: (def.comments ?? []).map(c => ({
          userId:     c.userId,
          body:       c.body,
          isInternal: c.isInternal,
          createdAt:  addHours(def.createdAt, c.h),
        })),
      },
    },
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🌱  Seeding NewnopDesk...');
  console.log(`    Admin email : ${ADMIN_EMAIL}`);
  console.log(`    Demo pass   : ${DEMO_PASSWORD}`);
  console.log('');

  // ── Wipe all tables (reverse FK order) ──────────────────────────────────
  await prisma.issueAttachment.deleteMany();
  await prisma.issueActivity.deleteMany();
  await prisma.issueComment.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.userProductAccess.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
  await prisma.products.deleteMany();
  await prisma.company.deleteMany();
  console.log('    Tables cleared.');

  // ── Hash passwords ──────────────────────────────────────────────────────
  const [demoHash, adminHash] = await Promise.all([
    bcrypt.hash(DEMO_PASSWORD, BCRYPT_ROUNDS),
    bcrypt.hash(ADMIN_PASSWORD, BCRYPT_ROUNDS),
  ]);

  // ── Companies ───────────────────────────────────────────────────────────
  const [aptCo, dvlCo, d2bCo] = await Promise.all([
    prisma.company.create({ data: { name: 'Apartment LK', contactEmail: 'contact@apartment-lk.com', region: 'LK' } }),
    prisma.company.create({ data: { name: 'Davinci Law',  contactEmail: 'contact@davincilaw.com',   region: 'KR' } }),
    prisma.company.create({ data: { name: 'Den2bio',      contactEmail: 'contact@den2bio.com',      region: 'IN' } }),
  ]);

  // ── Products ─────────────────────────────────────────────────────────────
  const [apt, aptweb, dvl, d2bio, d2bweb] = await Promise.all([
    prisma.products.create({ data: { companyId: aptCo.id, name: 'Apartment LK Mobile', code: 'APT',    owningOffice: 'LK', description: 'React Native app for property listings and tenant management.' } }),
    prisma.products.create({ data: { companyId: aptCo.id, name: 'Apartment LK Web',    code: 'APTWEB', owningOffice: 'LK', description: 'Next.js web portal for landlords and property administrators.' } }),
    prisma.products.create({ data: { companyId: dvlCo.id, name: 'Davinci Law Platform', code: 'DVL',   owningOffice: 'KR', description: 'Legal document management and case tracking SaaS.' } }),
    prisma.products.create({ data: { companyId: d2bCo.id, name: 'Den2bio Core',  code: 'D2BIO',  owningOffice: 'IN', description: 'Bioinformatics data pipeline and analysis platform.' } }),
    prisma.products.create({ data: { companyId: d2bCo.id, name: 'Den2bio Web',   code: 'D2BWEB', owningOffice: 'KR', description: 'Web dashboard for Den2bio analytics results.' } }),
  ]);

  // ── Users ────────────────────────────────────────────────────────────────
  const [adm1, , ravi, kasun, junho, arjun, cApt, cDvl, cD2b] = await Promise.all([
    // Admins
    prisma.user.create({ data: { email: ADMIN_EMAIL,                 passwordHash: adminHash, fullName: 'Newnop Admin',     role: 'admin',       office: 'KR' } }),
    prisma.user.create({ data: { email: 'ops@newnop.com',            passwordHash: demoHash,  fullName: 'Operations Lead',  role: 'admin',       office: 'LK' } }),
    // Engineers
    prisma.user.create({ data: { email: 'ravindu@newnop.com',        passwordHash: demoHash,  fullName: 'Ravindu Silva',    role: 'engineer',    office: 'LK' } }),
    prisma.user.create({ data: { email: 'kasun@newnop.com',          passwordHash: demoHash,  fullName: 'Kasun Perera',     role: 'engineer',    office: 'LK' } }),
    prisma.user.create({ data: { email: 'junho@newnop.com',          passwordHash: demoHash,  fullName: 'Kim Jun-ho',       role: 'engineer',    office: 'KR' } }),
    prisma.user.create({ data: { email: 'arjun@newnop.com',          passwordHash: demoHash,  fullName: 'Arjun Mehta',      role: 'engineer',    office: 'IN' } }),
    // Client users
    prisma.user.create({ data: { email: 'feedback@apartment-lk.com', passwordHash: demoHash,  fullName: 'Lakshan Perera',   role: 'client_user', companyId: aptCo.id } }),
    prisma.user.create({ data: { email: 'contact@davincilaw.com',    passwordHash: demoHash,  fullName: 'Ji-won Park',      role: 'client_user', companyId: dvlCo.id } }),
    prisma.user.create({ data: { email: 'info@den2bio.com',          passwordHash: demoHash,  fullName: 'Priya Nair',       role: 'client_user', companyId: d2bCo.id } }),
  ]);

  // ── Engineer → product access ────────────────────────────────────────────
  await prisma.userProductAccess.createMany({
    data: [
      { userId: ravi.id,  productId: apt.id    },
      { userId: ravi.id,  productId: aptweb.id },
      { userId: kasun.id, productId: apt.id    },
      { userId: kasun.id, productId: d2bio.id  },
      { userId: junho.id, productId: dvl.id    },
      { userId: junho.id, productId: d2bweb.id },
      { userId: arjun.id, productId: d2bio.id  },
      { userId: arjun.id, productId: d2bweb.id },
    ],
  });

  console.log('    Companies, products, users created.');

  // ═══════════════════════════════════════════════════════════════════════════
  // ISSUES
  // ═══════════════════════════════════════════════════════════════════════════

  // ── APT — Apartment LK Mobile (12 issues) ─────────────────────────────────

  // Demo issue: stays 'new' so the interviewer can walk through the lifecycle live
  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Search filter not working on property listings',
    description: 'Filtering by 3 bedrooms shows studios in results. Reproduced on iPhone 15 and Android 14.\n\nSteps:\n1. Open listings tab\n2. Tap Filter\n3. Select "3 Bedrooms"\n4. Tap Apply\n\nResult: all bedroom counts appear in results.',
    type: 'bug', impact: 'high', urgency: 'high', status: 'new',
    createdById: cApt.id, createdAt: daysAgo(1),
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Push notifications not received on iOS 17',
    description: 'Multiple tenants with iOS 17 report missing push notifications for new messages and rent reminders. Background app refresh is enabled. Notifications work on iOS 16 and Android.',
    type: 'bug', impact: 'high', urgency: 'medium', status: 'in_progress',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(5),
    activities: [
      { fieldName: 'assigned_to', oldValue: null, newValue: 'Ravindu Silva', userId: ravi.id, h: 3 },
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: ravi.id, h: 3 },
    ],
    comments: [
      { body: 'Reproduced locally on iOS 17.2. Looks like the APNs token is not being refreshed on app resume. Checking notification service.', isInternal: true, userId: ravi.id, h: 4 },
      { body: 'Hi Lakshan, we have reproduced the issue and are actively investigating. We expect a fix in the next build.', isInternal: false, userId: ravi.id, h: 5 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Property image upload failing for files larger than 5MB',
    description: 'Landlords report a silent failure when uploading property photos above 5MB. The progress bar completes but the image does not appear in the listing. No error toast is shown.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'in_progress',
    createdById: cApt.id, assignedToId: kasun.id, createdAt: daysAgo(4),
    activities: [
      { fieldName: 'assigned_to', oldValue: null, newValue: 'Kasun Perera', userId: adm1.id, h: 1 },
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: kasun.id, h: 2 },
    ],
    comments: [
      { body: 'S3 multipart upload threshold is set to 5MB. Files above that fall through silently. Fixing the upload handler now.', isInternal: true, userId: kasun.id, h: 3 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Map view crashes on Android 14 when zooming in rapidly',
    description: 'App crashes with "Fatal Exception: com.google.maps.RenderException" when the user double-taps to zoom quickly on the map listing view. Crash rate ~8% on Android 14 devices.',
    type: 'bug', impact: 'high', urgency: 'medium', status: 'on_hold',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(8),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: ravi.id, h: 2 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'on_hold', userId: ravi.id, h: 48 },
    ],
    comments: [
      { body: 'Root cause isolated to a race condition in the Maps SDK v6.1. Waiting on Google Maps Android SDK patch — tracked in their issue tracker.', isInternal: true, userId: ravi.id, h: 48 },
      { body: 'We have identified the root cause and are waiting on an upstream library fix. We will update you as soon as it is resolved.', isInternal: false, userId: ravi.id, h: 49 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Wrong currency symbol shown for INR property listings',
    description: 'Properties listed in Indian Rupees display the "LKR" symbol instead of "₹". The amount is correct, only the symbol is wrong.',
    type: 'bug', impact: 'low', urgency: 'medium', status: 'resolved',
    createdById: cApt.id, assignedToId: kasun.id, createdAt: daysAgo(14),
    resolvedAt: daysAgo(11),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: kasun.id, h: 4 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: kasun.id, h: 52 },
    ],
    comments: [
      { body: 'Locale config was falling back to the default LKR symbol. Patched the currency formatter and deployed in v2.3.1.', isInternal: false, userId: kasun.id, h: 52 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Rental application form loses data on back navigation',
    description: 'When filling out the multi-step rental application and pressing the back button on step 3, all previously entered data is cleared and the user is sent back to step 1.',
    type: 'bug', impact: 'high', urgency: 'high', status: 'resolved',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(20),
    resolvedAt: daysAgo(17),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: ravi.id, h: 1 },
      { fieldName: 'priority', oldValue: 'moderate', newValue: 'critical', userId: adm1.id, h: 2 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: ravi.id, h: 72 },
    ],
    comments: [
      { body: 'Form state was not being persisted to AsyncStorage between steps. Fixed with a form context provider that survives navigation.', isInternal: true, userId: ravi.id, h: 10 },
      { body: 'This has been fixed in v2.3.2. Please update the app and let us know if you encounter this again.', isInternal: false, userId: ravi.id, h: 72 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'How do I export my tenant list to CSV?',
    description: 'I need to share my full tenant list with our property manager. Is there an export feature in the app?',
    type: 'question', impact: 'low', urgency: 'low', status: 'resolved',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(10),
    resolvedAt: daysAgo(10),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'resolved', userId: ravi.id, h: 2 },
    ],
    comments: [
      { body: 'You can export the tenant list from the Tenants tab → top-right menu → Export to CSV. The feature is available to landlord accounts. Let us know if you have any trouble!', isInternal: false, userId: ravi.id, h: 2 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Dark mode support for the mobile app',
    description: 'The app does not respect the system dark mode setting. Requesting dark mode support, especially for the listing detail and map views.',
    type: 'feature_request', impact: 'low', urgency: 'low', status: 'new',
    createdById: cApt.id, createdAt: daysAgo(3),
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Blank login screen after app auto-update to v2.4',
    description: 'After the automatic update to v2.4, the login screen renders completely blank on first launch. Force-closing and relaunching fixes it. Affects ~12% of our users based on support reports.',
    type: 'incident', impact: 'high', urgency: 'high', status: 'in_progress',
    createdById: cApt.id, assignedToId: kasun.id, createdAt: daysAgo(2),
    slaDeadline: addHours(new Date(), 1), // at SLA risk
    activities: [
      { fieldName: 'assigned_to', oldValue: null, newValue: 'Kasun Perera', userId: adm1.id, h: 1 },
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: kasun.id, h: 1 },
    ],
    comments: [
      { body: 'Suspected race condition in the splash screen initialization. Hotfix being prepared now.', isInternal: true, userId: kasun.id, h: 2 },
      { body: 'We are aware of this issue and a hotfix is being prepared. Expected in the next 2 hours.', isInternal: false, userId: kasun.id, h: 3 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Saved property searches not persisting between sessions',
    description: 'Users report that saved searches disappear after closing and reopening the app. The searches are visible during the same session but lost on next launch.',
    type: 'bug', impact: 'medium', urgency: 'low', status: 'new',
    createdById: cApt.id, createdAt: daysAgo(2),
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'Verification email not arriving for new tenant accounts',
    description: 'New tenants report not receiving the account verification email. Checking spam folders returns nothing. This is blocking them from completing registration.',
    type: 'bug', impact: 'high', urgency: 'high', status: 'in_progress',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(3),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: ravi.id, h: 2 },
    ],
    comments: [
      { body: 'SMTP logs show delivery to the mail server but SPF/DKIM records for apartment-lk.com are mis-configured. Flagged to DNS team.', isInternal: true, userId: ravi.id, h: 4 },
    ],
  });

  await createIssue({
    productId: apt.id, code: 'APT',
    title: 'App shows stale listings after server-side property sync',
    description: 'Listings updated via the web portal do not refresh in the mobile app until the user manually pulls-to-refresh. The push invalidation from the server is not reaching the app.',
    type: 'bug', impact: 'medium', urgency: 'low', status: 'closed',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(30),
    resolvedAt: daysAgo(25), closedAt: daysAgo(24),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: ravi.id, h: 4 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: ravi.id, h: 96 },
      { fieldName: 'status', oldValue: 'resolved', newValue: 'closed', userId: cApt.id, h: 120 },
    ],
    comments: [
      { body: 'WebSocket connection for cache invalidation was not surviving app backgrounding. Fixed in v2.2.8.', isInternal: false, userId: ravi.id, h: 96 },
    ],
  });

  // ── APTWEB — Apartment LK Web (7 issues) ──────────────────────────────────

  await createIssue({
    productId: aptweb.id, code: 'APTWEB',
    title: 'Bulk CSV upload fails silently for files with more than 100 rows',
    description: 'The landlord bulk-import feature accepts the CSV and shows a success toast, but only the first 100 rows are imported. No error is shown for the remaining rows.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'new',
    createdById: cApt.id, createdAt: daysAgo(2),
  });

  await createIssue({
    productId: aptweb.id, code: 'APTWEB',
    title: 'Analytics dashboard charts not rendering in Firefox 120+',
    description: 'The bar and line charts on the analytics dashboard are blank in Firefox 120 and above. The charts render correctly in Chrome and Safari. No JavaScript errors in the console.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'in_progress',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(6),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: ravi.id, h: 5 },
    ],
    comments: [
      { body: 'Recharts uses a deprecated SVG attribute removed in Firefox 120. Upgrading to Recharts v2.10 should resolve it.', isInternal: true, userId: ravi.id, h: 6 },
    ],
  });

  await createIssue({
    productId: aptweb.id, code: 'APTWEB',
    title: '2FA setup page layout broken on mobile browsers',
    description: 'The QR code on the 2FA setup page overflows its container on viewports under 768px. The confirm button is also not reachable without horizontal scrolling.',
    type: 'bug', impact: 'low', urgency: 'medium', status: 'resolved',
    createdById: cApt.id, assignedToId: kasun.id, createdAt: daysAgo(12),
    resolvedAt: daysAgo(10),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: kasun.id, h: 3 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: kasun.id, h: 36 },
    ],
    comments: [
      { body: 'Fixed the QR container with max-width and responsive padding. Deployed in v1.8.3.', isInternal: false, userId: kasun.id, h: 36 },
    ],
  });

  await createIssue({
    productId: aptweb.id, code: 'APTWEB',
    title: 'PDF report export missing page breaks between sections',
    description: 'The monthly summary PDF export runs sections together without page breaks. The financial summary and occupancy sections merge into a single page making it hard to read.',
    type: 'bug', impact: 'low', urgency: 'low', status: 'new',
    createdById: cApt.id, createdAt: daysAgo(1),
  });

  await createIssue({
    productId: aptweb.id, code: 'APTWEB',
    title: 'Can tenant portal users reset their own passwords?',
    description: 'Some tenants are asking whether they can reset their passwords themselves without contacting the landlord. Is this feature available in the tenant-facing portal?',
    type: 'question', impact: 'low', urgency: 'low', status: 'resolved',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(7),
    resolvedAt: daysAgo(7),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'resolved', userId: ravi.id, h: 1 },
    ],
    comments: [
      { body: 'Yes — tenants can click "Forgot password" on the login page to reset via email. They do not need to contact the landlord. If the email is not arriving, check our FAQ on email delivery.', isInternal: false, userId: ravi.id, h: 1 },
    ],
  });

  await createIssue({
    productId: aptweb.id, code: 'APTWEB',
    title: 'Session timeout is too aggressive (5 minutes of inactivity)',
    description: 'The web portal session expires after just 5 minutes of inactivity. Landlords managing multiple listings say they frequently lose unsaved work when their session expires mid-task.',
    type: 'feature_request', impact: 'medium', urgency: 'medium', status: 'on_hold',
    createdById: cApt.id, assignedToId: kasun.id, createdAt: daysAgo(9),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'on_hold', userId: adm1.id, h: 24 },
    ],
    comments: [
      { body: 'On hold pending security review — the 5-minute timeout was a deliberate security requirement. Discussing whether to allow user-configurable timeout up to 30 minutes.', isInternal: true, userId: adm1.id, h: 24 },
    ],
  });

  await createIssue({
    productId: aptweb.id, code: 'APTWEB',
    title: 'Real-time notification WebSocket disconnects after 10 minutes',
    description: 'The live notification panel stops receiving updates after approximately 10 minutes. A hard page refresh restores it. Browser dev tools show the WebSocket connection closing with code 1006.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'in_progress',
    createdById: cApt.id, assignedToId: ravi.id, createdAt: daysAgo(4),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: ravi.id, h: 6 },
    ],
    comments: [
      { body: 'The AWS ALB has an idle connection timeout of 60 seconds but our ping interval was 10 minutes. Reducing client ping to 45 seconds.', isInternal: true, userId: ravi.id, h: 8 },
    ],
  });

  // ── DVL — Davinci Law (8 issues) ──────────────────────────────────────────

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'Document full-text search returns irrelevant results',
    description: 'Searching for specific clause text within case documents returns unrelated documents from different cases. The relevance ranking appears broken — exact phrase matches do not appear at the top.',
    type: 'bug', impact: 'high', urgency: 'medium', status: 'in_progress',
    createdById: cDvl.id, assignedToId: junho.id, createdAt: daysAgo(6),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 4 },
    ],
    comments: [
      { body: 'Elasticsearch index was rebuilt without the BM25 weighting update from last sprint. Re-indexing now.', isInternal: true, userId: junho.id, h: 5 },
      { body: 'We are re-indexing the document search and expect improved results within 2 hours. Thank you for reporting.', isInternal: false, userId: junho.id, h: 6 },
    ],
  });

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'E-signature widget fails to load on Safari 17',
    description: 'The embedded e-signature component shows a blank panel on Safari 17. The error console shows "TypeError: Cannot read properties of undefined (reading \'Canvas\')". Clients on macOS Sonoma are blocked from signing.',
    type: 'bug', impact: 'high', urgency: 'high', status: 'new',
    createdById: cDvl.id, createdAt: daysAgo(1),
  });

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'Case timeline not showing events after September 2025',
    description: 'The case history timeline displays events up to September 2025 but omits any events after that date. The events exist in the database and are visible in the case details panel.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'resolved',
    createdById: cDvl.id, assignedToId: junho.id, createdAt: daysAgo(15),
    resolvedAt: daysAgo(12),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 3 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: junho.id, h: 60 },
    ],
    comments: [
      { body: 'Timeline component had a hard-coded date ceiling of "2025-09-30" from an old demo filter. Removed in v3.1.4.', isInternal: false, userId: junho.id, h: 60 },
    ],
  });

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'PDF rendering incorrect for Korean characters in legal documents',
    description: 'Korean Hangul characters in case documents are rendering as boxes (□□□) in the exported PDF. The in-app preview is correct. This is affecting all users generating PDF exports of Korean-language documents.',
    type: 'incident', impact: 'high', urgency: 'high', status: 'in_progress',
    createdById: cDvl.id, assignedToId: junho.id, createdAt: daysAgo(3),
    slaDeadline: addHours(new Date(), 2), // SLA at risk
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 1 },
      { fieldName: 'priority', oldValue: 'high', newValue: 'critical', userId: adm1.id, h: 2 },
    ],
    comments: [
      { body: 'The PDF renderer is not embedding the Noto Sans KR font. The font subset was dropped from the bundle in the last webpack optimization. Fixing now.', isInternal: true, userId: junho.id, h: 3 },
      { body: 'We are urgently fixing the Korean font rendering issue. A hotfix will be deployed within 3 hours.', isInternal: false, userId: junho.id, h: 4 },
    ],
  });

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'Batch case status update silently fails for more than 50 cases',
    description: 'When selecting more than 50 cases and applying a bulk status change, the UI shows a success message but only the first 50 cases are updated. Cases 51+ remain unchanged with no error.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'on_hold',
    createdById: cDvl.id, assignedToId: junho.id, createdAt: daysAgo(11),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 6 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'on_hold', userId: junho.id, h: 30 },
    ],
    comments: [
      { body: 'MySQL transaction limit hit at 50 rows per batch. Needs a refactor to chunk the updates. On hold pending the Q2 API refactor sprint.', isInternal: true, userId: junho.id, h: 30 },
    ],
  });

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'Google Calendar integration for court hearing dates',
    description: 'It would be very helpful to sync court hearing and filing deadlines directly to Google Calendar. Currently we export dates manually to a spreadsheet.',
    type: 'feature_request', impact: 'medium', urgency: 'low', status: 'new',
    createdById: cDvl.id, createdAt: daysAgo(4),
  });

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'Billing module showing incorrect amounts for recurring subscriptions',
    description: 'Monthly subscription invoices are showing the annual price divided incorrectly. A ₩1,200,000/year subscription is being billed as ₩120,000/month instead of ₩100,000/month.',
    type: 'bug', impact: 'high', urgency: 'high', status: 'in_progress',
    createdById: cDvl.id, assignedToId: junho.id, createdAt: daysAgo(2),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 2 },
    ],
    comments: [
      { body: 'Billing calculation was dividing by 10 instead of 12. Off-by-one in the month index. Fixing now and will audit all affected invoices.', isInternal: true, userId: junho.id, h: 3 },
    ],
  });

  await createIssue({
    productId: dvl.id, code: 'DVL',
    title: 'User role permissions not persisting after session refresh',
    description: 'Users with custom roles lose their permission overrides when they refresh the page or log out and back in. Default role permissions are applied instead of the customised ones.',
    type: 'bug', impact: 'high', urgency: 'medium', status: 'resolved',
    createdById: cDvl.id, assignedToId: junho.id, createdAt: daysAgo(18),
    resolvedAt: daysAgo(15),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 2 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: junho.id, h: 72 },
    ],
    comments: [
      { body: 'Permission overrides were stored in the session but not in the DB. The JWT was re-issuing with base role permissions on each login. Fixed by persisting overrides to the user_permissions table.', isInternal: false, userId: junho.id, h: 72 },
    ],
  });

  // ── D2BIO — Den2bio Core (8 issues) ───────────────────────────────────────

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'Pipeline job stuck in queue after compute node failure',
    description: 'A WGS analysis job submitted 6 hours ago is still showing "Queued" status after the compute node it was assigned to crashed. The job should have been automatically re-queued.',
    type: 'incident', impact: 'high', urgency: 'high', status: 'in_progress',
    createdById: cD2b.id, assignedToId: arjun.id, createdAt: daysAgo(1),
    slaDeadline: addHours(new Date(), -1), // SLA breached
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: arjun.id, h: 1 },
    ],
    comments: [
      { body: 'The job scheduler does not handle "LOST" node state correctly. Manually re-queued the affected job. Working on the scheduler fix.', isInternal: true, userId: arjun.id, h: 2 },
      { body: 'Your job has been manually re-queued and will complete within the next hour. We are implementing a fix to handle this automatically.', isInternal: false, userId: arjun.id, h: 3 },
    ],
  });

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'FASTQ parser fails on gzipped files larger than 2GB',
    description: 'Submitting a gzipped FASTQ file above 2GB results in "Error: ENOMEM - not enough memory" during the parsing step. Smaller files and uncompressed files above 2GB work correctly.',
    type: 'bug', impact: 'high', urgency: 'medium', status: 'in_progress',
    createdById: cD2b.id, assignedToId: arjun.id, createdAt: daysAgo(5),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: arjun.id, h: 6 },
    ],
    comments: [
      { body: 'The gunzip stream is loading the entire decompressed file into memory before parsing. Need to switch to a streaming decompression approach. Refactoring the FASTQ reader.', isInternal: true, userId: arjun.id, h: 8 },
    ],
  });

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'Analysis results differ between local and cloud pipeline runs',
    description: 'Running the same variant-calling pipeline locally produces slightly different variant calls vs. the cloud run. The difference appears in low-confidence variants near contig boundaries.',
    type: 'bug', impact: 'high', urgency: 'medium', status: 'on_hold',
    createdById: cD2b.id, assignedToId: kasun.id, createdAt: daysAgo(9),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: kasun.id, h: 4 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'on_hold', userId: kasun.id, h: 72 },
    ],
    comments: [
      { body: 'Suspected GATK version mismatch between the local Docker image (4.4.0) and cloud AMI (4.3.0). Needs the cloud AMI to be updated. Ticket raised with infra team.', isInternal: true, userId: kasun.id, h: 72 },
    ],
  });

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'Job completion notifications not being sent',
    description: 'Users are not receiving email notifications when their pipeline jobs complete. The notification preference is enabled in account settings. This has been reported by 3 users since last Tuesday.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'new',
    createdById: cD2b.id, createdAt: daysAgo(3),
  });

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'VCF export truncates INFO field for multi-allelic variants',
    description: 'When exporting variant calls to VCF format, the INFO field for multi-allelic variants (more than 2 alleles) is truncated at 255 characters, losing important annotation data.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'resolved',
    createdById: cD2b.id, assignedToId: arjun.id, createdAt: daysAgo(13),
    resolvedAt: daysAgo(10),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: arjun.id, h: 5 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: arjun.id, h: 65 },
    ],
    comments: [
      { body: 'The VCF writer was using a VARCHAR(255) buffer for the INFO field. Changed to unlimited string concatenation. Fixed in pipeline v1.12.1.', isInternal: false, userId: arjun.id, h: 65 },
    ],
  });

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'Default pipeline timeout too short for whole-genome sequencing samples',
    description: 'WGS samples (~30x coverage, ~90GB FASTQ) consistently time out at the alignment step. The default 4-hour timeout is insufficient. RNA-seq and targeted panel runs complete fine.',
    type: 'bug', impact: 'high', urgency: 'medium', status: 'in_progress',
    createdById: cD2b.id, assignedToId: arjun.id, createdAt: daysAgo(7),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: arjun.id, h: 3 },
    ],
    comments: [
      { body: 'Adding a per-sample-type timeout config. WGS will default to 12 hours, RNA-seq to 6 hours. Deploying in next release.', isInternal: true, userId: arjun.id, h: 4 },
    ],
  });

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'Support for Oxford Nanopore long-read data format (FAST5/POD5)',
    description: 'Our lab is transitioning to Oxford Nanopore sequencers. We would like to submit FAST5/POD5 files to Den2bio and run the long-read assembly and variant calling pipelines.',
    type: 'feature_request', impact: 'medium', urgency: 'low', status: 'new',
    createdById: cD2b.id, createdAt: daysAgo(5),
  });

  await createIssue({
    productId: d2bio.id, code: 'D2BIO',
    title: 'Dedicated compute allocation for large batch runs',
    description: 'When we submit 50+ jobs simultaneously, they queue behind smaller jobs from other projects. Is there a priority lane or dedicated compute allocation available for batch submissions?',
    type: 'question', impact: 'low', urgency: 'low', status: 'new',
    createdById: cD2b.id, createdAt: daysAgo(2),
  });

  // ── D2BWEB — Den2bio Web Dashboard (5 issues) ─────────────────────────────

  await createIssue({
    productId: d2bweb.id, code: 'D2BWEB',
    title: 'Variant frequency charts not rendering on Safari Mobile',
    description: 'The donut and bar charts on the variant frequency dashboard are blank on Safari on iOS 16+. The charts display correctly on desktop Safari and all Chrome/Firefox versions.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'in_progress',
    createdById: cD2b.id, assignedToId: junho.id, createdAt: daysAgo(4),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 5 },
    ],
    comments: [
      { body: 'Safari Mobile is blocking the canvas-based chart renderer. Switching to SVG mode for Recharts on mobile breakpoints.', isInternal: true, userId: junho.id, h: 6 },
    ],
  });

  await createIssue({
    productId: d2bweb.id, code: 'D2BWEB',
    title: 'Excel export missing column headers in the variant table',
    description: 'Exporting the variant table to Excel produces a file with data rows but no header row. The columns are correctly exported but without labels, making the file unusable without re-adding headers manually.',
    type: 'bug', impact: 'low', urgency: 'medium', status: 'resolved',
    createdById: cD2b.id, assignedToId: junho.id, createdAt: daysAgo(16),
    resolvedAt: daysAgo(14),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: junho.id, h: 2 },
      { fieldName: 'status', oldValue: 'in_progress', newValue: 'resolved', userId: junho.id, h: 40 },
    ],
    comments: [
      { body: 'The xlsx writer was skipping the header row when the column config used numeric keys. Fixed in dashboard v2.5.1.', isInternal: false, userId: junho.id, h: 40 },
    ],
  });

  await createIssue({
    productId: d2bweb.id, code: 'D2BWEB',
    title: 'Shared report links require re-authentication even for public reports',
    description: 'When a report is configured as "publicly accessible via link", the recipient is still prompted to log in before viewing. The sharing permission is set correctly on our end.',
    type: 'bug', impact: 'medium', urgency: 'medium', status: 'new',
    createdById: cD2b.id, createdAt: daysAgo(3),
  });

  await createIssue({
    productId: d2bweb.id, code: 'D2BWEB',
    title: 'Dark mode theme for the analytics dashboard',
    description: 'The dashboard is very bright in low-light lab environments. A dark mode option (or automatic system-preference detection) would significantly improve usability for late-night analysis sessions.',
    type: 'feature_request', impact: 'low', urgency: 'low', status: 'new',
    createdById: cD2b.id, createdAt: daysAgo(6),
  });

  await createIssue({
    productId: d2bweb.id, code: 'D2BWEB',
    title: 'Dashboard shows blank data after system timezone change',
    description: 'After changing the server timezone from UTC to IST, the dashboard shows no data for the current day. The pipeline runs are present in the backend but the date-range filter is using the wrong epoch boundary.',
    type: 'bug', impact: 'high', urgency: 'high', status: 'in_progress',
    createdById: cD2b.id, assignedToId: arjun.id, createdAt: daysAgo(2),
    activities: [
      { fieldName: 'status', oldValue: 'new', newValue: 'in_progress', userId: arjun.id, h: 2 },
    ],
    comments: [
      { body: 'The "today" date range was being computed in local server time but compared against UTC timestamps in the DB. Normalising everything to UTC in the query layer.', isInternal: true, userId: arjun.id, h: 3 },
    ],
  });

  // ═══════════════════════════════════════════════════════════════════════════

  const issueCount  = await prisma.issue.count();
  const commentCount = await prisma.issueComment.count();
  const activityCount = await prisma.issueActivity.count();

  console.log('');
  console.log(`✅  Seed complete!`);
  console.log(`    Issues     : ${issueCount}`);
  console.log(`    Comments   : ${commentCount}`);
  console.log(`    Activities : ${activityCount}`);
  console.log('');
  console.log('Demo accounts (all use the demo password shown above):');
  console.log(`  Admin    : ${ADMIN_EMAIL}              (password: ${ADMIN_PASSWORD})`);
  console.log('  Admin    : ops@newnop.com');
  console.log('  Engineer : ravindu@newnop.com    (Sri Lanka office — APT, APTWEB)');
  console.log('  Engineer : kasun@newnop.com      (Sri Lanka office — APT, D2BIO)');
  console.log('  Engineer : junho@newnop.com      (Korea office — DVL, D2BWEB)');
  console.log('  Engineer : arjun@newnop.com      (India office — D2BIO, D2BWEB)');
  console.log('  Client   : feedback@apartment-lk.com  (Apartment LK)');
  console.log('  Client   : contact@davincilaw.com     (Davinci Law)');
  console.log('  Client   : info@den2bio.com           (Den2bio)');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
